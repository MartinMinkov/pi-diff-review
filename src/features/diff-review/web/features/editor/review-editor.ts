import { inferLanguage } from "../../shared/lib/utils.js";
import {
  navigationActionLabel,
  supportsSemanticDefinition,
} from "../../../shared/lib/navigation.js";
import type {
  MonacoApi,
  MonacoCancellationToken,
  MonacoCodeEditor,
  MonacoDecoration,
  MonacoDiffEditor,
  MonacoPosition,
  MonacoRequire,
  MonacoTextModel,
} from "./monaco-types.js";
import { getReviewSymbolContext } from "../symbols/symbol-context.js";
import type {
  DiffReviewComment,
  ReviewFile,
  ReviewFileContents,
  ReviewNavigationRequest,
  ReviewNavigationSide,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";
import type { ReviewNavigationResolver } from "../navigation/resolver.js";
import type {
  ReviewMountOptions,
  ReviewState,
  ReviewFileScrollState,
} from "../../shared/state/review-state.js";

type CommentSide = ReviewNavigationSide;

declare global {
  interface Window {
    monaco: MonacoApi | undefined;
    require?: MonacoRequire;
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
  getScopeSidePath: (
    file: ReviewFile | null,
    scope: ReviewScope,
    side: ReviewNavigationSide,
  ) => string;
  getScopeDisplayPath: (file: ReviewFile | null, scope: ReviewScope) => string;
  getRequestState: (fileId: string, scope: ReviewScope) => FileRequestState;
  ensureFileLoaded: (fileId: string, scope: ReviewScope) => void;
  renderCommentDOM: (
    comment: DiffReviewComment,
    options: {
      onDelete: () => void;
      onUpdate: () => void;
    },
  ) => HTMLElement;
  addInlineComment: (fileId: string, side: CommentSide, line: number) => void;
  onCommentsChange: () => void;
  onEditorContextChange: (context: {
    navigationRequest: ReviewNavigationRequest | null;
    navigationTarget: ReviewNavigationTarget | null;
    symbolTitle: string | null;
    symbolLine: number | null;
  }) => void;
  renderFileComments: () => void;
  canCommentOnSide: (file: ReviewFile | null, side: CommentSide) => boolean;
  resolveNavigationTarget: (
    request: ReviewNavigationRequest,
  ) => ReviewNavigationTarget | null;
  resolveDefinitionTarget: (
    request: ReviewNavigationRequest,
    options?: { silent?: boolean },
  ) => Promise<ReviewNavigationTarget | null>;
  describeNavigationTarget: (target: ReviewNavigationTarget) => string;
  openNavigationTarget: (
    target: ReviewNavigationTarget,
    options?: { source?: ReviewNavigationTarget | null },
  ) => void;
  navigationResolver: ReviewNavigationResolver;
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
  revealNavigationTarget: (target: ReviewNavigationTarget) => void;
  getCurrentNavigationTarget: () => ReviewNavigationTarget | null;
  getCurrentNavigationRequest: () => ReviewNavigationRequest | null;
  getCurrentSelectionContext: () => ReviewEditorSelectionContext | null;
}

interface ReviewEditorRequestResult {
  originalContent: string;
  modifiedContent: string;
}

const NAVIGATION_HOVER_DEBOUNCE_MS = 80;
const MAX_NAVIGATION_HOVER_CACHE_ENTRIES = 300;

export interface ReviewEditorSelectionContext {
  fileId: string;
  scope: ReviewScope;
  side: ReviewNavigationSide;
  sourcePath: string;
  languageId: string;
  content: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

function scrollKey(scope: ReviewScope, fileId: string): string {
  return `${scope}:${fileId}`;
}

function getCommentViewZoneHeight(comment: DiffReviewComment): number {
  if (comment.status === "draft") {
    return 236;
  }

  if (comment.collapsed) {
    return 50;
  }

  const lineCount = Math.max(1, comment.body.split("\n").length);
  return Math.max(104, lineCount * 22 + 62);
}

export function createReviewEditor(
  options: ReviewEditorOptions,
): ReviewEditorController {
  const {
    state,
    activeFile,
    activeFileShowsDiff,
    getScopeFilePath,
    getScopeSidePath,
    getScopeDisplayPath,
    getRequestState,
    ensureFileLoaded,
    renderCommentDOM,
    addInlineComment,
    onCommentsChange,
    onEditorContextChange,
    renderFileComments,
    canCommentOnSide,
    resolveNavigationTarget,
    resolveDefinitionTarget,
    describeNavigationTarget,
    openNavigationTarget,
    navigationResolver,
    editorContainerEl,
    currentFileLabelEl,
  } = options;

  let monacoApi: MonacoApi | null = null;
  let diffEditor: MonacoDiffEditor | null = null;
  let originalModel: MonacoTextModel | null = null;
  let modifiedModel: MonacoTextModel | null = null;
  let originalDecorations: string[] = [];
  let modifiedDecorations: string[] = [];
  let activeViewZones: Array<{ id: string; editor: MonacoCodeEditor }> = [];
  let editorResizeObserver: ResizeObserver | null = null;
  let pendingNavigationTarget: ReviewNavigationTarget | null = null;
  let lastFocusedSide: ReviewNavigationSide = "modified";
  let navigationModifierPressed = false;
  const navigationHoverCache = new Map<string, ReviewNavigationTarget | null>();
  const navigationHoverRequests = new Map<
    string,
    Promise<ReviewNavigationTarget | null>
  >();
  let navigationHoverCacheVersion = 0;

  function clearNavigationHoverCache(): void {
    navigationHoverCache.clear();
    navigationHoverRequests.clear();
    navigationHoverCacheVersion += 1;
  }

  function rememberNavigationHoverTarget(
    cacheKey: string,
    target: ReviewNavigationTarget | null,
  ): void {
    if (navigationHoverCache.size >= MAX_NAVIGATION_HOVER_CACHE_ENTRIES) {
      const oldestKey = navigationHoverCache.keys().next().value;
      if (oldestKey) {
        navigationHoverCache.delete(oldestKey);
      }
    }
    navigationHoverCache.set(cacheKey, target);
  }

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
      const domNode = renderCommentDOM(item, {
        onDelete: () => {
          state.comments = state.comments.filter(
            (comment) => comment.id !== item.id,
          );
          onCommentsChange();
        },
        onUpdate: onCommentsChange,
      });
      if (!domNode) return;

      editor.changeViewZones((accessor) => {
        const id = accessor.addZone({
          afterLineNumber: item.startLine,
          heightInPx: getCommentViewZoneHeight(item),
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
    const originalRanges: MonacoDecoration[] = [];
    const modifiedRanges: MonacoDecoration[] = [];

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

  function getEditorForSide(
    side: ReviewNavigationSide,
  ): MonacoCodeEditor | null {
    if (!diffEditor) return null;
    return side === "original"
      ? diffEditor.getOriginalEditor()
      : diffEditor.getModifiedEditor();
  }

  function getCurrentEditorContext(): {
    file: ReviewFile;
    side: ReviewNavigationSide;
    editor: MonacoCodeEditor;
    model: MonacoTextModel;
    line: number;
    column: number;
  } | null {
    const file = activeFile();
    if (!file || !diffEditor) return null;

    const side = activeFileShowsDiff() ? lastFocusedSide : "modified";
    const editor = getEditorForSide(side) ?? diffEditor.getModifiedEditor();
    const position = editor?.getPosition?.();
    const visibleRange = editor?.getVisibleRanges?.()?.[0];
    const line = Math.max(
      1,
      position?.lineNumber ?? visibleRange?.startLineNumber ?? 1,
    );
    const column = Math.max(1, position?.column ?? 1);
    const model = editor?.getModel?.();
    if (!model) return null;

    return { file, side, editor, model, line, column };
  }

  function getCurrentNavigationTarget(): ReviewNavigationTarget | null {
    const context = getCurrentEditorContext();
    if (!context) return null;

    return {
      fileId: context.file.id,
      scope: state.currentScope,
      side: context.side,
      line: context.line,
      column: context.column,
    };
  }

  function getCurrentNavigationRequest(): ReviewNavigationRequest | null {
    const context = getCurrentEditorContext();
    if (!context) return null;

    const descriptor = navigationResolver.parseModelUri(context.model.uri);
    if (!descriptor) return null;

    return {
      fileId: descriptor.fileId,
      scope: descriptor.scope,
      side: descriptor.side,
      sourcePath: descriptor.sourcePath,
      languageId:
        context.model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
      content: context.model.getValue(),
      lineNumber: context.line,
      column: context.column,
    };
  }

  function emitEditorContextChange(symbolLineOverride?: number): void {
    const navigationRequest = getCurrentNavigationRequest();
    const navigationTarget =
      navigationRequest != null
        ? resolveNavigationTarget(navigationRequest)
        : null;
    const symbolLine =
      symbolLineOverride ?? navigationRequest?.lineNumber ?? null;
    const symbolContext =
      navigationRequest != null && symbolLine != null
        ? getReviewSymbolContext(
            navigationRequest.content,
            symbolLine,
            navigationRequest.languageId,
          )
        : { title: null, lineNumber: null };

    onEditorContextChange({
      navigationRequest,
      navigationTarget,
      symbolTitle: symbolContext.title,
      symbolLine: symbolContext.lineNumber,
    });
  }

  function getCurrentSelectionContext(): ReviewEditorSelectionContext | null {
    const context = getCurrentEditorContext();
    if (!context) return null;

    const descriptor = navigationResolver.parseModelUri(context.model.uri);
    if (!descriptor) return null;

    const selection = context.editor?.getSelection?.();
    const startLine = Math.max(1, selection?.startLineNumber ?? context.line);
    const endLine = Math.max(1, selection?.endLineNumber ?? startLine);
    const selectedText =
      typeof context.editor?.getModel?.()?.getValueInRange === "function" &&
      selection
        ? String(context.editor.getModel().getValueInRange(selection) || "")
        : "";

    return {
      fileId: descriptor.fileId,
      scope: descriptor.scope,
      side: descriptor.side,
      sourcePath: descriptor.sourcePath,
      languageId:
        context.model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
      content: context.model.getValue(),
      startLine,
      endLine,
      selectedText,
    };
  }

  function buildNavigationRequestFromModel(
    model: MonacoTextModel | null,
    position: MonacoPosition,
  ): ReviewNavigationRequest | null {
    if (!model) return null;
    const descriptor = navigationResolver.parseModelUri(model.uri);
    if (!descriptor) return null;

    return {
      fileId: descriptor.fileId,
      scope: descriptor.scope,
      side: descriptor.side,
      sourcePath: descriptor.sourcePath,
      languageId:
        model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
      content: model.getValue(),
      lineNumber: position.lineNumber,
      column: position.column,
    };
  }

  function maybeRevealPendingNavigation(): void {
    if (!pendingNavigationTarget || !diffEditor) return;
    const file = activeFile();
    if (!file || file.id !== pendingNavigationTarget.fileId) return;
    if (state.currentScope !== pendingNavigationTarget.scope) return;
    if (!isActiveFileReady()) return;

    const targetEditor = getEditorForSide(pendingNavigationTarget.side);
    const line = Math.max(1, pendingNavigationTarget.line || 1);
    const column = Math.max(1, pendingNavigationTarget.column || 1);

    targetEditor?.revealLineInCenter(line);
    targetEditor?.setPosition({ lineNumber: line, column });
    targetEditor?.focus();
    lastFocusedSide = pendingNavigationTarget.side;
    pendingNavigationTarget = null;
  }

  function revealNavigationTarget(target: ReviewNavigationTarget): void {
    pendingNavigationTarget = target;
    requestAnimationFrame(() => {
      maybeRevealPendingNavigation();
      emitEditorContextChange();
      setTimeout(() => {
        maybeRevealPendingNavigation();
        emitEditorContextChange();
      }, 50);
    });
  }

  function mountFile(mountOptions: ReviewMountOptions = {}): void {
    if (!diffEditor || !monacoApi) return;
    clearNavigationHoverCache();
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
      navigationResolver.buildModelUri(monacoApi, {
        fileId: file.id,
        scope: state.currentScope,
        side: "original",
        sourcePath: getScopeSidePath(file, state.currentScope, "original"),
      }),
    );
    modifiedModel = monacoApi.editor.createModel(
      contents.modifiedContent,
      language,
      navigationResolver.buildModelUri(monacoApi, {
        fileId: file.id,
        scope: state.currentScope,
        side: "modified",
        sourcePath: getScopeSidePath(file, state.currentScope, "modified"),
      }),
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
      maybeRevealPendingNavigation();
      emitEditorContextChange();
      setTimeout(() => {
        layoutEditor();
        if (mountOptions.restoreFileScroll) restoreFileScrollPosition();
        if (mountOptions.preserveScroll) restoreScrollState(scrollState);
        maybeRevealPendingNavigation();
        emitEditorContextChange();
      }, 50);
    });
  }

  function createGlyphHoverActions(editor: MonacoCodeEditor, side: CommentSide) {
    let hoverDecoration: string[] = [];

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

  function createNavigationHoverActions(editor: MonacoCodeEditor) {
    let hoverDecorations: string[] = [];
    let hoveredModel: MonacoTextModel | null = null;
    let hoveredPosition: MonacoPosition | null = null;
    let hoverTimer: number | null = null;
    let requestSequence = 0;

    function clearHoverIndicator(): void {
      if (hoverTimer != null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      requestSequence += 1;
      hoverDecorations = editor.deltaDecorations(hoverDecorations, []);
      editor.getDomNode?.()?.classList.remove("review-nav-link-cursor");
    }

    async function resolveHoverTarget(
      cacheKey: string,
      request: ReviewNavigationRequest,
      force: boolean,
    ): Promise<ReviewNavigationTarget | null> {
      const cached = force ? undefined : navigationHoverCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      const cacheVersion = navigationHoverCacheVersion;
      let pending = navigationHoverRequests.get(cacheKey);
      if (pending == null) {
        pending = (async () => {
          const heuristicTarget = resolveNavigationTarget(request);
          if (heuristicTarget || !supportsSemanticDefinition(request.languageId)) {
            return heuristicTarget;
          }
          return resolveDefinitionTarget(request, { silent: true });
        })();
        navigationHoverRequests.set(cacheKey, pending);
        const clearPending = () => {
          if (navigationHoverRequests.get(cacheKey) === pending) {
            navigationHoverRequests.delete(cacheKey);
          }
        };
        void pending.then(clearPending, clearPending);
      }

      const target = await pending;
      if (cacheVersion === navigationHoverCacheVersion) {
        rememberNavigationHoverTarget(cacheKey, target);
      }
      return target;
    }

    async function updateHoverIndicator(force = false): Promise<void> {
      hoverTimer = null;
      if (!monacoApi || !navigationModifierPressed) {
        clearHoverIndicator();
        return;
      }

      const model = hoveredModel;
      const position = hoveredPosition;
      if (!model || !position) {
        clearHoverIndicator();
        return;
      }

      const word = model.getWordAtPosition?.(position);
      if (!word) {
        clearHoverIndicator();
        return;
      }

      const request = buildNavigationRequestFromModel(model, position);
      if (!request) {
        clearHoverIndicator();
        return;
      }

      const cacheKey = [
        request.fileId,
        request.scope,
        request.side,
        request.lineNumber,
        word.startColumn,
        word.endColumn,
        request.languageId,
      ].join(":");

      const pendingId = ++requestSequence;
      const target = await resolveHoverTarget(cacheKey, request, force);

      if (pendingId !== requestSequence) {
        return;
      }

      if (!target) {
        clearHoverIndicator();
        return;
      }

      hoverDecorations = editor.deltaDecorations(hoverDecorations, [
        {
          range: new monacoApi.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          options: {
            inlineClassName: "review-nav-link-token",
          },
        },
      ]);
      editor.getDomNode?.()?.classList.add("review-nav-link-cursor");
    }

    function scheduleHoverIndicator(force = false): void {
      if (hoverTimer != null) {
        window.clearTimeout(hoverTimer);
      }
      hoverTimer = window.setTimeout(() => {
        void updateHoverIndicator(force);
      }, NAVIGATION_HOVER_DEBOUNCE_MS);
    }

    function syncModifierState(isPressed: boolean): void {
      navigationModifierPressed = isPressed;
      if (!isPressed) {
        clearHoverIndicator();
        return;
      }
      scheduleHoverIndicator();
    }

    editor.onMouseMove((event) => {
      const browserEvent = event.event?.browserEvent;
      navigationModifierPressed = Boolean(
        browserEvent?.metaKey || browserEvent?.ctrlKey,
      );
      const lineNumber = event.target.position?.lineNumber;
      const column = event.target.position?.column;
      if (!lineNumber || !column) {
        hoveredModel = null;
        hoveredPosition = null;
        clearHoverIndicator();
        return;
      }

      hoveredModel = editor.getModel?.() ?? null;
      hoveredPosition = { lineNumber, column };
      if (!navigationModifierPressed) {
        clearHoverIndicator();
        return;
      }
      scheduleHoverIndicator();
    });

    editor.onMouseLeave(() => {
      hoveredModel = null;
      hoveredPosition = null;
      clearHoverIndicator();
    });

    return {
      syncModifierState,
    };
  }

  function registerNavigationSupport(): void {
    const languages = ["typescript", "javascript", "go", "rust", "c", "cpp"];

    for (const languageId of languages) {
      const buildRequest = (
        model: MonacoTextModel,
        position: MonacoPosition,
      ): ReviewNavigationRequest | null =>
        buildNavigationRequestFromModel(model, {
          lineNumber: position.lineNumber,
          column: position.column,
        });

      monacoApi.languages.registerDefinitionProvider(languageId, {
        async provideDefinition(
          model: MonacoTextModel,
          position: MonacoPosition,
          token: MonacoCancellationToken,
        ) {
          const request = buildRequest(model, position);
          if (!request) return null;

          const target = await resolveDefinitionTarget(request, {
            silent: true,
          });
          if (token?.isCancellationRequested) return null;
          if (!target) return null;
          const source = {
            fileId: request.fileId,
            scope: request.scope,
            side: request.side,
            line: request.lineNumber,
            column: request.column,
          };

          return {
            uri: navigationResolver.buildTargetUri(monacoApi, target, {
              source,
            }),
            range: new monacoApi.Range(
              target.line,
              target.column,
              target.line,
              target.column,
            ),
          };
        },
      });

      monacoApi.languages.registerHoverProvider(languageId, {
        async provideHover(
          model: MonacoTextModel,
          position: MonacoPosition,
          token: MonacoCancellationToken,
        ) {
          const request = buildRequest(model, position);
          if (!request) return null;

          const target =
            resolveNavigationTarget(request) ??
            (await resolveDefinitionTarget(request, { silent: true }));
          if (token?.isCancellationRequested) return null;
          if (!target) return null;
          const actionLabel = navigationActionLabel(request.languageId);
          const referencesLabel = supportsSemanticDefinition(request.languageId)
            ? "show related usages"
            : "show related imports/usages";

          return {
            range: new monacoApi.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            contents: [
              {
                value: `**Review navigation**\n\nTarget: \`${describeNavigationTarget(target)}\`\n\n- Cmd/Ctrl-click: ${actionLabel}\n- References button: ${referencesLabel}\n- Peek button: preview target inline`,
              },
            ],
          };
        },
      });
    }

    if (typeof monacoApi.editor.registerEditorOpener === "function") {
      monacoApi.editor.registerEditorOpener({
        openCodeEditor(_source: unknown, resource: unknown) {
          const target = navigationResolver.parseTargetUri(resource);
          if (!target) return false;
          openNavigationTarget(target, {
            source: navigationResolver.parseTargetSourceUri(resource),
          });
          return true;
        },
      });
    }
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
      if (!window.monaco) {
        return;
      }
      monacoApi = window.monaco as MonacoApi;

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
      const originalNavigationHover = createNavigationHoverActions(
        diffEditor.getOriginalEditor(),
      );
      const modifiedNavigationHover = createNavigationHoverActions(
        diffEditor.getModifiedEditor(),
      );
      diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
        lastFocusedSide = "original";
        emitEditorContextChange();
      });
      diffEditor.getModifiedEditor().onDidFocusEditorText(() => {
        lastFocusedSide = "modified";
        emitEditorContextChange();
      });
      diffEditor.getOriginalEditor().onDidChangeCursorPosition(() => {
        lastFocusedSide = "original";
        emitEditorContextChange();
      });
      diffEditor.getModifiedEditor().onDidChangeCursorPosition(() => {
        lastFocusedSide = "modified";
        emitEditorContextChange();
      });
      diffEditor.getOriginalEditor().onDidScrollChange(() => {
        lastFocusedSide = "original";
        const line =
          diffEditor?.getOriginalEditor().getVisibleRanges?.()?.[0]
            ?.startLineNumber;
        emitEditorContextChange(line);
      });
      diffEditor.getModifiedEditor().onDidScrollChange(() => {
        lastFocusedSide = "modified";
        const line =
          diffEditor?.getModifiedEditor().getVisibleRanges?.()?.[0]
            ?.startLineNumber;
        emitEditorContextChange(line);
      });
      window.addEventListener("keydown", (event) => {
        const isPressed = event.metaKey || event.ctrlKey;
        originalNavigationHover.syncModifierState(isPressed);
        modifiedNavigationHover.syncModifierState(isPressed);
      });
      window.addEventListener("keyup", (event) => {
        const isPressed = event.metaKey || event.ctrlKey;
        originalNavigationHover.syncModifierState(isPressed);
        modifiedNavigationHover.syncModifierState(isPressed);
      });
      window.addEventListener("blur", () => {
        originalNavigationHover.syncModifierState(false);
        modifiedNavigationHover.syncModifierState(false);
      });
      registerNavigationSupport();

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
    revealNavigationTarget,
    getCurrentNavigationTarget,
    getCurrentNavigationRequest,
    getCurrentSelectionContext,
  };
}

export type { ReviewEditorController };
