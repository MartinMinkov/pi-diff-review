import { inferLanguage } from "./utils.js";
import type {
  DiffReviewComment,
  ReviewFile,
  ReviewScope,
  ReviewFileContents,
} from "./types.js";
import type {
  ReviewMountOptions,
  ReviewState,
  ReviewFileScrollState,
} from "./review-state.js";

interface MonacRequire {
  (dependencies: string[], callback: () => void): void;
  config(config: Record<string, unknown>): void;
}

type CommentSide = "original" | "modified";

declare global {
  interface Window {
    monaco: unknown;
    require?: MonacRequire;
  }
}

interface FileRequestState {
  contents?: string | ReviewFileContents;
  error?: string;
}

interface ReviewEditorOptions {
  state: ReviewState;
  activeFile: () => ReviewFile | null;
  activeFileShowsDiff: () => boolean;
  getScopeFilePath: (file: ReviewFile | null) => string;
  getScopeDisplayPath: (file: ReviewFile | null, scope: ReviewScope) => string;
  getRequestState: (fileId: string, scope: ReviewScope) => FileRequestState;
  ensureFileLoaded: (fileId: string, scope: ReviewScope) => void;
  renderCommentDOM: (
    comment: DiffReviewComment,
    onDelete: () => void,
  ) => HTMLElement;
  addInlineComment: (fileId: string, side: CommentSide, line: number) => void;
  onCommentsChange: () => void;
  renderFileComments: () => void;
  canCommentOnSide: (file: ReviewFile | null, side: CommentSide) => boolean;
  editorContainerEl: HTMLDivElement;
  currentFileLabelEl: HTMLDivElement;
}

interface ReviewEditorController {
  layout: () => void;
  applyOptions: () => void;
  syncViewZones: () => void;
  updateDecorations: () => void;
  mountFile: (options?: ReviewMountOptions) => void;
  saveCurrentScrollPosition: () => void;
  restoreFileScrollPosition: () => void;
  captureScrollState: () => ReviewFileScrollState | null;
  restoreScrollState: (scrollState: ReviewFileScrollState | null) => void;
  setupMonaco: (onReady?: () => void) => void;
  isActiveFileReady: () => boolean;
}

interface ReviewEditorRequestResult {
  originalContent: string;
  modifiedContent: string;
}

function scrollKey(scope: ReviewScope, fileId: string): string {
  return `${scope}:${fileId}`;
}

export function createReviewEditor(
  options: ReviewEditorOptions,
): ReviewEditorController {
  const {
    state,
    activeFile,
    activeFileShowsDiff,
    getScopeFilePath,
    getScopeDisplayPath,
    getRequestState,
    ensureFileLoaded,
    renderCommentDOM,
    addInlineComment,
    onCommentsChange,
    renderFileComments,
    canCommentOnSide,
    editorContainerEl,
    currentFileLabelEl,
  } = options;

  let monacoApi: any = null;
  let diffEditor: any = null;
  let originalModel: any = null;
  let modifiedModel: any = null;
  let originalDecorations: any[] = [];
  let modifiedDecorations: any[] = [];
  let activeViewZones: Array<{ id: string; editor: unknown }> = [];
  let editorResizeObserver: ResizeObserver | null = null;

  function saveCurrentScrollPosition() {
    if (!diffEditor || !state.activeFileId) return;
    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();
    state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)] = {
      originalTop: originalEditor.getScrollTop(),
      originalLeft: originalEditor.getScrollLeft(),
      modifiedTop: modifiedEditor.getScrollTop(),
      modifiedLeft: modifiedEditor.getScrollLeft(),
    };
  }

  function restoreFileScrollPosition() {
    if (!diffEditor || !state.activeFileId) return;
    const scrollState =
      state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)];
    if (!scrollState) return;
    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();
    originalEditor.setScrollTop(scrollState.originalTop);
    originalEditor.setScrollLeft(scrollState.originalLeft);
    modifiedEditor.setScrollTop(scrollState.modifiedTop);
    modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
  }

  function captureScrollState(): ReviewFileScrollState | null {
    if (!diffEditor) return null;
    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();
    return {
      originalTop: originalEditor.getScrollTop(),
      originalLeft: originalEditor.getScrollLeft(),
      modifiedTop: modifiedEditor.getScrollTop(),
      modifiedLeft: modifiedEditor.getScrollLeft(),
    };
  }

  function restoreScrollState(scrollState: ReviewFileScrollState | null) {
    if (!diffEditor || !scrollState) return;
    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();
    originalEditor.setScrollTop(scrollState.originalTop);
    originalEditor.setScrollLeft(scrollState.originalLeft);
    modifiedEditor.setScrollTop(scrollState.modifiedTop);
    modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
  }

  function layoutEditor() {
    if (!diffEditor) return;
    const width = editorContainerEl.clientWidth;
    const height = editorContainerEl.clientHeight;
    if (width <= 0 || height <= 0) return;
    diffEditor.layout({ width, height });
  }

  function clearViewZones() {
    if (!diffEditor || activeViewZones.length === 0) return;
    const original = diffEditor.getOriginalEditor();
    const modified = diffEditor.getModifiedEditor();
    original.changeViewZones((accessor) => {
      for (const zone of activeViewZones)
        if (zone.editor === original) accessor.removeZone(zone.id);
    });
    modified.changeViewZones((accessor) => {
      for (const zone of activeViewZones)
        if (zone.editor === modified) accessor.removeZone(zone.id);
    });
    activeViewZones = [];
  }

  function isActiveFileReady() {
    const file = activeFile();
    if (!file) return false;
    const requestState = getRequestState(file.id, state.currentScope);
    return requestState.contents != null && requestState.error == null;
  }

  function syncViewZones() {
    clearViewZones();
    if (!diffEditor || !isActiveFileReady()) return;
    const file = activeFile();
    if (!file) return;

    const originalEditor = diffEditor.getOriginalEditor();
    const modifiedEditor = diffEditor.getModifiedEditor();
    const inlineComments = state.comments.filter(
      (comment) =>
        comment.fileId === file.id &&
        comment.scope === state.currentScope &&
        comment.side !== "file",
    );

    inlineComments.forEach((item) => {
      const editor = item.side === "original" ? originalEditor : modifiedEditor;
      const domNode = renderCommentDOM(item, () => {
        state.comments = state.comments.filter(
          (comment) => comment.id !== item.id,
        );
        onCommentsChange();
      });
      if (!domNode) return;

      editor.changeViewZones((accessor) => {
        const lineCount =
          typeof item.body === "string" && item.body.length > 0
            ? item.body.split("\n").length
            : 1;
        const id = accessor.addZone({
          afterLineNumber: item.startLine,
          heightInPx: Math.max(150, lineCount * 22 + 86),
          domNode,
        });
        activeViewZones.push({ id, editor });
      });
    });
  }

  function updateDecorations() {
    if (!diffEditor || !monacoApi) return;
    const file = activeFile();
    const comments = file
      ? state.comments.filter(
          (comment) =>
            comment.fileId === file.id &&
            comment.scope === state.currentScope &&
            comment.side !== "file",
        )
      : [];
    const originalRanges: any[] = [];
    const modifiedRanges: any[] = [];

    for (const comment of comments) {
      const range = {
        range: new monacoApi.Range(comment.startLine, 1, comment.startLine, 1),
        options: {
          isWholeLine: true,
          className:
            comment.side === "original"
              ? "review-comment-line-original"
              : "review-comment-line-modified",
          glyphMarginClassName:
            comment.side === "original"
              ? "review-comment-glyph-original"
              : "review-comment-glyph-modified",
        },
      };
      if (comment.side === "original") originalRanges.push(range);
      else modifiedRanges.push(range);
    }

    originalDecorations = diffEditor
      .getOriginalEditor()
      .deltaDecorations(originalDecorations, originalRanges);
    modifiedDecorations = diffEditor
      .getModifiedEditor()
      .deltaDecorations(modifiedDecorations, modifiedRanges);
  }

  function applyEditorOptions() {
    if (!diffEditor) return;
    diffEditor.updateOptions({
      renderSideBySide: activeFileShowsDiff(),
      diffWordWrap: state.wrapLines ? "on" : "off",
      hideUnchangedRegions: {
        enabled: activeFileShowsDiff() && state.hideUnchanged,
        contextLineCount: 4,
        minimumLineCount: 2,
        revealLineCount: 12,
      },
    });
    diffEditor
      .getOriginalEditor()
      .updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
    diffEditor
      .getModifiedEditor()
      .updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
  }

  function getPlaceholderContents(
    file: ReviewFile | null,
    scope: ReviewScope,
  ): ReviewEditorRequestResult {
    const path = getScopeDisplayPath(file, scope);
    const requestState = getRequestState(file?.id || "", scope);
    if (requestState.error) {
      const body = `Failed to load ${path}\n\n${requestState.error}`;
      return { originalContent: body, modifiedContent: body };
    }
    const body = `Loading ${path}...`;
    return { originalContent: body, modifiedContent: body };
  }

  function getMountedContents(
    file: ReviewFile | null,
    scope: ReviewScope = state.currentScope,
  ) {
    const requestState = getRequestState(file?.id || "", scope);
    const contents = requestState.contents;
    if (
      typeof contents === "object" &&
      contents != null &&
      "originalContent" in contents &&
      "modifiedContent" in contents
    ) {
      return contents;
    }
    return getPlaceholderContents(file, scope);
  }

  function mountFile(mountOptions: ReviewMountOptions = {}): void {
    if (!diffEditor || !monacoApi) return;
    const file = activeFile();

    if (!file) {
      currentFileLabelEl.textContent = "No file selected";
      clearViewZones();
      if (originalModel) originalModel.dispose();
      if (modifiedModel) modifiedModel.dispose();
      originalModel = monacoApi.editor.createModel("", "plaintext");
      modifiedModel = monacoApi.editor.createModel("", "plaintext");
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      applyEditorOptions();
      updateDecorations();
      renderFileComments();
      requestAnimationFrame(layoutEditor);
      return;
    }

    ensureFileLoaded(file.id, state.currentScope);

    const preserveScroll = mountOptions.preserveScroll === true;
    const scrollState = preserveScroll ? captureScrollState() : null;
    const language = inferLanguage(getScopeFilePath(file) || file.path);
    const contents = getMountedContents(file, state.currentScope);

    clearViewZones();
    currentFileLabelEl.textContent = getScopeDisplayPath(
      file,
      state.currentScope,
    );

    if (originalModel) originalModel.dispose();
    if (modifiedModel) modifiedModel.dispose();

    originalModel = monacoApi.editor.createModel(
      contents.originalContent,
      language,
    );
    modifiedModel = monacoApi.editor.createModel(
      contents.modifiedContent,
      language,
    );

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    applyEditorOptions();
    syncViewZones();
    updateDecorations();
    renderFileComments();

    requestAnimationFrame(() => {
      layoutEditor();
      if (mountOptions.restoreFileScroll) restoreFileScrollPosition();
      if (mountOptions.preserveScroll) restoreScrollState(scrollState);
      setTimeout(() => {
        layoutEditor();
        if (mountOptions.restoreFileScroll) restoreFileScrollPosition();
        if (mountOptions.preserveScroll) restoreScrollState(scrollState);
      }, 50);
    });
  }

  function createGlyphHoverActions(editor: any, side: CommentSide) {
    let hoverDecoration = [];

    function openDraftAtLine(line: number) {
      const file = activeFile();
      if (!file || !canCommentOnSide(file, side) || !isActiveFileReady())
        return;
      addInlineComment(file.id, side, line);
      onCommentsChange();
      editor.revealLineInCenter(line);
    }

    editor.onMouseMove((event) => {
      const file = activeFile();
      if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) {
        hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
        return;
      }

      const target = event.target;
      if (
        target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = target.position?.lineNumber;
        if (!line) return;
        hoverDecoration = editor.deltaDecorations(hoverDecoration, [
          {
            range: new monacoApi.Range(line, 1, line, 1),
            options: { glyphMarginClassName: "review-glyph-plus" },
          },
        ]);
      } else {
        hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
      }
    });

    editor.onMouseLeave(() => {
      hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
    });

    editor.onMouseDown((event) => {
      const file = activeFile();
      if (!file || !canCommentOnSide(file, side) || !isActiveFileReady())
        return;

      const target = event.target;
      if (
        target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = target.position?.lineNumber;
        if (!line) return;
        openDraftAtLine(line);
      }
    });
  }

  function setupMonaco(onReady?: () => void): void {
    const monacoRequire = window.require;
    if (!monacoRequire) {
      return;
    }

    monacoRequire.config({
      paths: {
        vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs",
      },
    });

    monacoRequire(["vs/editor/editor.main"], () => {
      monacoApi = window.monaco;

      monacoApi.editor.defineTheme("review-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": "#0d1117",
          "diffEditor.insertedTextBackground": "#2ea04326",
          "diffEditor.removedTextBackground": "#f8514926",
        },
      });
      monacoApi.editor.setTheme("review-dark");

      diffEditor = monacoApi.editor.createDiffEditor(editorContainerEl, {
        automaticLayout: true,
        renderSideBySide: activeFileShowsDiff(),
        readOnly: true,
        originalEditable: false,
        minimap: {
          enabled: true,
          renderCharacters: false,
          showSlider: "always",
          size: "proportional",
        },
        renderOverviewRuler: true,
        diffWordWrap: "on",
        scrollBeyondLastLine: false,
        lineNumbersMinChars: 4,
        glyphMargin: true,
        folding: true,
        lineDecorationsWidth: 10,
        overviewRulerBorder: false,
        wordWrap: "on",
      });

      createGlyphHoverActions(diffEditor.getOriginalEditor(), "original");
      createGlyphHoverActions(diffEditor.getModifiedEditor(), "modified");

      if (typeof ResizeObserver !== "undefined") {
        editorResizeObserver = new ResizeObserver(() => {
          layoutEditor();
        });
        editorResizeObserver.observe(editorContainerEl);
      }

      requestAnimationFrame(() => {
        layoutEditor();
        setTimeout(layoutEditor, 50);
        setTimeout(layoutEditor, 150);
      });

      onReady?.();
    });
  }

  return {
    layout: layoutEditor,
    applyOptions: applyEditorOptions,
    syncViewZones,
    updateDecorations,
    mountFile,
    saveCurrentScrollPosition,
    restoreFileScrollPosition,
    captureScrollState,
    restoreScrollState,
    setupMonaco,
    isActiveFileReady,
  };
}

export type { ReviewEditorController };
