import {
  inferLanguage,
  scopeHint,
  scopeLabel,
  statusBadgeClass,
  statusLabel,
  getFileSearchPath,
  getFileSearchScore,
} from "../shared/lib/utils.js";
import { createSidebarController } from "../features/file-tree/sidebar.js";
import type { ReviewSidebarController } from "../features/file-tree/sidebar.js";
import {
  type ReviewFile,
  type ChangeStatus,
  type ReviewHostMessage,
  type ReviewFileContents,
  type ReviewFileDataMessage,
  type ReviewFileErrorMessage,
  type ReviewScope,
  type ReviewWindowData,
  type ReviewWindowMessage,
} from "../shared/contracts/review.js";
import {
  createInitialReviewState,
  type ReviewMountOptions,
  type ReviewState,
} from "../shared/state/review-state.js";
import { getReviewDomElements } from "./dom.js";
import {
  showPeekModal,
  showReferenceModal,
  showTextModal as openTextModal,
} from "../features/comments/modals.js";
import { createCommentManager } from "../features/comments/comment-manager.js";
import type { ReviewCommentManager } from "../features/comments/comment-manager.js";
import {
  createReviewEditor,
  type ReviewEditorController,
} from "../features/editor/review-editor.js";
import {
  createReviewNavigationResolver,
  type ReviewNavigationSide,
  type ReviewNavigationTarget,
} from "../features/navigation/resolver.js";
import { buildPreviewSnippet } from "../features/symbols/symbol-context.js";
import { createReviewRuntimeController } from "./runtime.js";

declare global {
  interface Window {
    glimpse?: {
      send(payload: ReviewWindowMessage | ReviewHostMessage): void;
      close(): void;
    };
  }
}

const reviewData = JSON.parse(
  document.getElementById("diff-review-data")?.textContent ?? "{}",
) as ReviewWindowData;

const state: ReviewState = createInitialReviewState(reviewData);
const navigationResolver = createReviewNavigationResolver(reviewData);

const {
  sidebarEl,
  sidebarTitleEl,
  sidebarSearchInputEl,
  toggleSidebarButton,
  scopeDiffButton,
  scopeLastCommitButton,
  scopeAllButton,
  windowTitleEl,
  repoRootEl,
  fileTreeEl,
  summaryEl,
  currentFileLabelEl,
  currentSymbolLabelEl,
  modeHintEl,
  fileCommentsContainer,
  editorContainerEl,
  submitButton,
  cancelButton,
  overallCommentButton,
  fileCommentButton,
  navigateBackButton,
  navigateForwardButton,
  showReferencesButton,
  peekDefinitionButton,
  toggleReviewedButton,
  toggleUnchangedButton,
  toggleWrapButton,
} = getReviewDomElements();

repoRootEl.textContent = reviewData.repoRoot || "";
windowTitleEl.textContent = "Review";

let requestSequence = 0;
let sidebarController: ReviewSidebarController | null = null;
let commentManager: ReviewCommentManager | null = null;
let editorController: ReviewEditorController | null = null;
let pendingFileWaiters = new Map<
  string,
  Array<{
    resolve: (value: ReviewFileContents | null) => void;
    reject: (reason?: unknown) => void;
  }>
>();
let navigationBackStack: ReviewNavigationTarget[] = [];
let navigationForwardStack: ReviewNavigationTarget[] = [];
let isHistoryNavigation = false;
let currentNavigationRequestAvailable = false;

function isFileReviewed(fileId: string): boolean {
  return state.reviewedFiles[fileId] === true;
}

function getScopedFiles(): ReviewFile[] {
  switch (state.currentScope) {
    case "git-diff":
      return reviewData.files.filter((file) => file.inGitDiff);
    case "last-commit":
      return reviewData.files.filter((file) => file.inLastCommit);
    default:
      return reviewData.files.filter((file) => file.hasWorkingTreeFile);
  }
}

function ensureActiveFileForScope(): void {
  const scopedFiles = getScopedFiles();
  if (scopedFiles.length === 0) {
    state.activeFileId = null;
    return;
  }
  if (scopedFiles.some((file) => file.id === state.activeFileId)) {
    return;
  }
  state.activeFileId = scopedFiles[0].id;
}

function activeFile(): ReviewFile | null {
  return (
    reviewData.files.find((file) => file.id === state.activeFileId) ?? null
  );
}

function getScopeComparison(
  file: ReviewFile | null,
  scope: ReviewScope = state.currentScope,
): ReviewFile["gitDiff"] {
  if (!file) return null;
  if (scope === "git-diff") return file.gitDiff;
  if (scope === "last-commit") return file.lastCommit;
  return null;
}

function activeComparison(): ReviewFile["gitDiff"] {
  return getScopeComparison(activeFile(), state.currentScope);
}

function activeFileShowsDiff(): boolean {
  return activeComparison() != null;
}

function getScopeFilePath(file: ReviewFile | null): string {
  const comparison = getScopeComparison(file, state.currentScope);
  return comparison?.newPath || comparison?.oldPath || file?.path || "";
}

function getScopeDisplayPath(
  file: ReviewFile | null,
  scope: ReviewScope = state.currentScope,
): string {
  const comparison = getScopeComparison(file, scope);
  return comparison?.displayPath || file?.path || "";
}

function getScopeSidePath(
  file: ReviewFile | null,
  scope: ReviewScope,
  side: ReviewNavigationSide,
): string {
  const comparison = getScopeComparison(file, scope);
  if (!comparison) return file?.path || "";
  if (side === "original") {
    return comparison.oldPath || comparison.newPath || file?.path || "";
  }
  return comparison.newPath || comparison.oldPath || file?.path || "";
}

function getActiveStatus(file: ReviewFile | null): ChangeStatus | null {
  const comparison = getScopeComparison(file, state.currentScope);
  return comparison?.status ?? file?.worktreeStatus ?? null;
}

function getFilteredFiles(): ReviewFile[] {
  const scopedFiles = getScopedFiles();
  const query = state.fileFilter.trim();
  if (!query) return [...scopedFiles];

  return scopedFiles
    .map((file) => ({ file, score: getFileSearchScore(query, file) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getFileSearchPath(a.file).localeCompare(getFileSearchPath(b.file));
    })
    .map((entry) => entry.file);
}

function cacheKey(scope: ReviewScope, fileId: string): string {
  return `${scope}:${fileId}`;
}

function getRequestState(
  fileId: string,
  scope: ReviewScope = state.currentScope,
) {
  const key = cacheKey(scope, fileId);
  return {
    contents: state.fileContents[key],
    error: state.fileErrors[key],
    requestId: state.pendingRequestIds[key],
  };
}

function resolvePendingFileWaiters(
  fileId: string,
  scope: ReviewScope,
  value: ReviewFileContents | null,
): void {
  const key = cacheKey(scope, fileId);
  const waiters = pendingFileWaiters.get(key) ?? [];
  pendingFileWaiters.delete(key);
  waiters.forEach((waiter) => waiter.resolve(value));
}

function rejectPendingFileWaiters(
  fileId: string,
  scope: ReviewScope,
  reason: unknown,
): void {
  const key = cacheKey(scope, fileId);
  const waiters = pendingFileWaiters.get(key) ?? [];
  pendingFileWaiters.delete(key);
  waiters.forEach((waiter) => waiter.resolve(null));
}

function loadFileContents(
  fileId: string,
  scope: ReviewScope,
): Promise<ReviewFileContents | null> {
  const requestState = getRequestState(fileId, scope);
  if (requestState.contents) {
    return Promise.resolve(requestState.contents);
  }
  if (requestState.error) {
    return Promise.resolve(null);
  }

  ensureFileLoaded(fileId, scope);

  return new Promise((resolve, reject) => {
    const key = cacheKey(scope, fileId);
    const waiters = pendingFileWaiters.get(key) ?? [];
    waiters.push({ resolve, reject });
    pendingFileWaiters.set(key, waiters);
  });
}

function ensureFileLoaded(
  fileId: string | null,
  scope: ReviewScope = state.currentScope,
) {
  if (!fileId) return;
  const key = cacheKey(scope, fileId);
  if (state.fileContents[key] != null) return;
  if (state.fileErrors[key] != null) return;
  if (state.pendingRequestIds[key] != null) return;

  const requestId = `request:${Date.now()}:${++requestSequence}`;
  state.pendingRequestIds[key] = requestId;
  sidebarController?.renderTree();
  if (window.glimpse?.send) {
    window.glimpse.send({ type: "request-file", requestId, fileId, scope });
  }
}

function getCurrentNavigationTarget(): ReviewNavigationTarget | null {
  return editorController?.getCurrentNavigationTarget() ?? null;
}

function sameNavigationTarget(
  left: ReviewNavigationTarget | null,
  right: ReviewNavigationTarget | null,
): boolean {
  if (!left || !right) return false;
  return (
    left.fileId === right.fileId &&
    left.scope === right.scope &&
    left.side === right.side &&
    left.line === right.line &&
    left.column === right.column
  );
}

function updateNavigationButtons(): void {
  navigateBackButton.disabled = navigationBackStack.length === 0;
  navigateForwardButton.disabled = navigationForwardStack.length === 0;
  showReferencesButton.disabled = !currentNavigationRequestAvailable;
  peekDefinitionButton.disabled = !currentNavigationRequestAvailable;
}

function updateEditorContextUI(context: {
  navigationRequest: unknown;
  navigationTarget: ReviewNavigationTarget | null;
  symbolTitle: string | null;
  symbolLine: number | null;
}): void {
  currentNavigationRequestAvailable = context.navigationTarget != null;
  currentSymbolLabelEl.textContent = context.symbolTitle
    ? `Symbol: ${context.symbolTitle}${context.symbolLine ? ` · line ${context.symbolLine}` : ""}`
    : "";
  updateNavigationButtons();
}

function recordNavigationCheckpoint(): void {
  if (isHistoryNavigation) return;
  const current = getCurrentNavigationTarget();
  if (!current) return;
  const previous = navigationBackStack[navigationBackStack.length - 1] ?? null;
  if (!sameNavigationTarget(previous, current)) {
    navigationBackStack.push(current);
  }
  navigationForwardStack = [];
  updateNavigationButtons();
}

function describeNavigationTarget(target: ReviewNavigationTarget): string {
  const file =
    reviewData.files.find((item) => item.id === target.fileId) ?? null;
  if (!file) return "unknown target";
  const path = getScopeDisplayPath(file, target.scope);
  const sideLabel =
    target.scope === "all-files"
      ? ""
      : target.side === "original"
        ? " (old)"
        : " (new)";
  const scopeText =
    target.scope === state.currentScope
      ? ""
      : ` in ${scopeLabel(target.scope)}`;
  return `${path}${sideLabel}${scopeText}`;
}

function getCurrentNavigationRequest() {
  return editorController?.getCurrentNavigationRequest() ?? null;
}

function getReferenceSearchTarget(file: ReviewFile): {
  scope: ReviewScope;
  side: ReviewNavigationSide;
} {
  if (state.currentScope === "git-diff" && file.inGitDiff) {
    return {
      scope: "git-diff",
      side: file.gitDiff?.hasModified ? "modified" : "original",
    };
  }

  if (state.currentScope === "last-commit" && file.inLastCommit) {
    return {
      scope: "last-commit",
      side: file.lastCommit?.hasModified ? "modified" : "original",
    };
  }

  return {
    scope: "all-files",
    side: "modified",
  };
}

function sortReferenceTargets(
  left: ReviewNavigationTarget,
  right: ReviewNavigationTarget,
): number {
  const leftFile =
    reviewData.files.find((file) => file.id === left.fileId) ?? null;
  const rightFile =
    reviewData.files.find((file) => file.id === right.fileId) ?? null;
  const leftChanged = leftFile?.inGitDiff || leftFile?.inLastCommit ? 1 : 0;
  const rightChanged = rightFile?.inGitDiff || rightFile?.inLastCommit ? 1 : 0;
  if (leftChanged !== rightChanged) return rightChanged - leftChanged;
  const leftScopeMatch = left.scope === state.currentScope ? 1 : 0;
  const rightScopeMatch = right.scope === state.currentScope ? 1 : 0;
  if (leftScopeMatch !== rightScopeMatch)
    return rightScopeMatch - leftScopeMatch;
  return describeNavigationTarget(left).localeCompare(
    describeNavigationTarget(right),
  );
}

async function handleShowReferences() {
  const request = getCurrentNavigationRequest();
  if (!request) {
    showReferenceModal({
      title: "References",
      description: "Select a repo-local import or module path first.",
      items: [],
      emptyLabel:
        "No active navigation target is available at the current cursor.",
    });
    return;
  }

  const target = navigationResolver.resolveTarget(request);
  if (!target) {
    showReferenceModal({
      title: "References",
      description:
        "This selection does not resolve to a repo-local review target.",
      items: [],
      emptyLabel:
        "No repo-local references available for the current selection.",
    });
    return;
  }

  showReferencesButton.disabled = true;
  const previousLabel = showReferencesButton.textContent || "References";
  showReferencesButton.textContent = "Searching…";

  try {
    const searchableFiles = reviewData.files.filter(
      (file) => file.hasWorkingTreeFile,
    );
    const loadedFiles = await Promise.all(
      searchableFiles.map(async (file) => ({
        file,
        contents: await loadFileContents(file.id, "all-files"),
      })),
    );

    const matches = navigationResolver
      .findReferences(
        request,
        loadedFiles
          .filter((item) => item.contents != null)
          .map((item) => {
            const target = getReferenceSearchTarget(item.file);
            return {
              fileId: item.file.id,
              scope: target.scope,
              side: target.side,
              sourcePath: item.file.path,
              languageId: inferLanguage(item.file.path),
              content: item.contents?.modifiedContent || "",
            };
          }),
      )
      .sort((a, b) => sortReferenceTargets(a.target, b.target));

    showReferenceModal({
      title: `References for ${describeNavigationTarget(target)}`,
      description:
        "Use the modal filters to focus on changed files or the current review scope.",
      emptyLabel:
        "No repo-local references were found in the current workspace snapshot.",
      items: matches.map((match) => {
        const file = reviewData.files.find(
          (item) => item.id === match.target.fileId,
        );
        return {
          title: `${describeNavigationTarget(match.target)}:${match.lineNumber}`,
          description: match.sourcePath,
          preview: match.lineText.trim(),
          isChanged: Boolean(file?.inGitDiff || file?.inLastCommit),
          isCurrentScope: match.target.scope === state.currentScope,
          onSelect: () => {
            openNavigationTarget({
              ...match.target,
              line: match.lineNumber,
              column: match.column,
            });
          },
        };
      }),
    });
  } finally {
    showReferencesButton.disabled = false;
    showReferencesButton.textContent = previousLabel;
    updateNavigationButtons();
  }
}

async function handlePeekDefinition() {
  const request = getCurrentNavigationRequest();
  if (!request) return;
  const target = navigationResolver.resolveTarget(request);
  if (!target) return;

  peekDefinitionButton.disabled = true;
  const previousLabel = peekDefinitionButton.textContent || "Peek";
  peekDefinitionButton.textContent = "Loading…";

  try {
    const contents = await loadFileContents(target.fileId, target.scope);
    if (!contents) return;
    const previewContent =
      target.side === "original"
        ? contents.originalContent
        : contents.modifiedContent;

    showPeekModal({
      title: `Peek ${describeNavigationTarget(target)}`,
      description: "Preview the target in-place before jumping.",
      code: buildPreviewSnippet(previewContent, target.line || 1),
      onOpen: () => {
        openNavigationTarget(target);
      },
    });
  } finally {
    peekDefinitionButton.disabled = false;
    peekDefinitionButton.textContent = previousLabel;
    updateNavigationButtons();
  }
}

function openFile(fileId: string): void {
  if (state.activeFileId === fileId) {
    ensureFileLoaded(fileId, state.currentScope);
    return;
  }
  recordNavigationCheckpoint();
  editorController?.saveCurrentScrollPosition();
  state.activeFileId = fileId;
  renderAll({ restoreFileScroll: true });
  ensureFileLoaded(fileId, state.currentScope);
  updateNavigationButtons();
}

function openNavigationTarget(target: ReviewNavigationTarget): void {
  const targetFile = reviewData.files.find((file) => file.id === target.fileId);
  if (!targetFile) return;

  const scopeChanged = state.currentScope !== target.scope;
  const fileChanged = state.activeFileId !== target.fileId;
  const current = getCurrentNavigationTarget();
  if (!sameNavigationTarget(current, target)) {
    recordNavigationCheckpoint();
  }

  if (scopeChanged || fileChanged) {
    editorController?.saveCurrentScrollPosition();
  }

  state.currentScope = target.scope;
  state.activeFileId = target.fileId;
  ensureActiveFileForScope();
  renderAll({ restoreFileScroll: false, preserveScroll: false });
  ensureFileLoaded(targetFile.id, target.scope);
  editorController?.revealNavigationTarget(target);
  updateNavigationButtons();
}

sidebarController = createSidebarController({
  reviewDataFiles: reviewData.files,
  state,
  sidebarEl,
  sidebarTitleEl,
  fileTreeEl,
  summaryEl,
  modeHintEl,
  submitButton,
  toggleReviewedButton,
  toggleUnchangedButton,
  toggleWrapButton,
  toggleSidebarButton,
  scopeDiffButton,
  scopeLastCommitButton,
  scopeAllButton,
  scopeLabel,
  scopeHint,
  statusBadgeClass,
  statusLabel,
  getScopedFiles,
  getFilteredFiles,
  getRequestState,
  isFileReviewed,
  getActiveStatus,
  activeFile,
  openFile,
  ensureActiveFileForScope,
  activeFileShowsDiff,
});

commentManager = createCommentManager({
  state,
  activeFile,
  scopeLabel,
  fileCommentsContainer,
  onCommentsChange: updateCommentsUI,
});

function addInlineComment(
  fileId: string,
  side: "original" | "modified",
  line: number,
): void {
  state.comments.push({
    id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
    fileId,
    scope: state.currentScope,
    side,
    startLine: line,
    endLine: line,
    body: "",
  });
}

editorController = createReviewEditor({
  state,
  activeFile,
  activeFileShowsDiff,
  getScopeFilePath,
  getScopeSidePath,
  getScopeDisplayPath,
  getRequestState,
  ensureFileLoaded,
  renderCommentDOM: (comment, onDelete) =>
    commentManager?.renderCommentDOM(comment, onDelete) ??
    document.createElement("div"),
  addInlineComment,
  onCommentsChange: () => {
    updateCommentsUI();
  },
  onEditorContextChange: updateEditorContextUI,
  renderFileComments: () => {
    commentManager?.renderFileComments();
  },
  canCommentOnSide,
  resolveNavigationTarget: (request) =>
    navigationResolver.resolveTarget(request),
  describeNavigationTarget,
  openNavigationTarget,
  navigationResolver,
  editorContainerEl,
  currentFileLabelEl,
});

function showOverallCommentModal() {
  openTextModal({
    title: "Overall review note",
    description:
      "This note is prepended to the generated prompt above the inline comments.",
    initialValue: state.overallComment,
    saveLabel: "Save note",
    onSave: (value) => {
      state.overallComment = value;
      sidebarController?.renderTree();
    },
  });
}

function showFileCommentModal() {
  const file = activeFile();
  if (!file) return;
  openTextModal({
    title: `File comment for ${getScopeDisplayPath(file, state.currentScope)}`,
    description: `This comment applies to the whole file in ${scopeLabel(state.currentScope).toLowerCase()}.`,
    initialValue: "",
    saveLabel: "Add comment",
    onSave: (value) => {
      if (!value) return;
      state.comments.push({
        id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
        fileId: file.id,
        scope: state.currentScope,
        side: "file",
        startLine: null,
        endLine: null,
        body: value,
      });
      submitButton.disabled = false;
      updateCommentsUI();
    },
  });
}

function layoutEditor() {
  editorController?.layout();
}

function canCommentOnSide(file, side) {
  if (!file) return false;
  const comparison = activeComparison();
  if (side === "original") {
    return comparison != null && comparison.hasOriginal;
  }
  return comparison != null ? comparison.hasModified : file.hasWorkingTreeFile;
}

function isActiveFileReady() {
  return editorController?.isActiveFileReady() ?? false;
}

function syncViewZones() {
  editorController?.syncViewZones();
}

function updateDecorations() {
  editorController?.updateDecorations();
}

function mountFile(options: ReviewMountOptions = {}): void {
  editorController?.mountFile(options);
}

function updateCommentsUI() {
  sidebarController?.renderTree();
  syncViewZones();
  updateDecorations();
  commentManager?.renderFileComments();
}

function applyEditorOptions() {
  editorController?.applyOptions();
}

function renderAll(options: ReviewMountOptions = {}): void {
  sidebarController?.renderTree();
  submitButton.disabled = false;
  updateNavigationButtons();
  if (editorController) {
    mountFile(options);
    requestAnimationFrame(() => {
      layoutEditor();
      setTimeout(layoutEditor, 50);
    });
  } else {
    commentManager?.renderFileComments();
  }
}

function setupMonaco(): void {
  editorController?.setupMonaco(() => {
    mountFile();
  });
}

function switchScope(scope: ReviewScope) {
  const hasScopeFiles = {
    "git-diff": reviewData.files.some((file) => file.inGitDiff),
    "last-commit": reviewData.files.some((file) => file.inLastCommit),
    "all-files": reviewData.files.some((file) => file.hasWorkingTreeFile),
  };
  if (!hasScopeFiles[scope] || state.currentScope === scope) return;
  recordNavigationCheckpoint();
  editorController?.saveCurrentScrollPosition();
  state.currentScope = scope;
  renderAll({ restoreFileScroll: true });
  const file = activeFile();
  if (file) ensureFileLoaded(file.id, state.currentScope);
  updateNavigationButtons();
}

function handleSubmitReview() {
  commentManager?.syncCommentBodiesFromDOM();
  const payload: ReviewWindowMessage = {
    type: "submit",
    overallComment: state.overallComment.trim(),
    comments: state.comments
      .map((comment) => ({ ...comment, body: comment.body.trim() }))
      .filter((comment) => comment.body.length > 0),
  };
  window.glimpse.send(payload);
  window.glimpse.close();
}

function handleCancelReview() {
  window.glimpse.send({ type: "cancel" });
  window.glimpse.close();
}

function handleToggleReviewed() {
  const file = activeFile();
  if (!file) return;
  state.reviewedFiles[file.id] = !isFileReviewed(file.id);
  sidebarController?.renderTree();
}

function handleToggleUnchanged() {
  state.hideUnchanged = !state.hideUnchanged;
  applyEditorOptions();
  sidebarController?.updateToggleButtons();
  requestAnimationFrame(layoutEditor);
}

function handleToggleWrap() {
  state.wrapLines = !state.wrapLines;
  applyEditorOptions();
  sidebarController?.updateToggleButtons();
  requestAnimationFrame(() => {
    layoutEditor();
    setTimeout(layoutEditor, 50);
  });
}

function handleToggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  sidebarController?.updateSidebarLayout();
  requestAnimationFrame(() => {
    layoutEditor();
    setTimeout(layoutEditor, 50);
  });
}

function handleNavigateBack() {
  const target = navigationBackStack.pop();
  const current = getCurrentNavigationTarget();
  if (!target || !current) {
    updateNavigationButtons();
    return;
  }

  if (!sameNavigationTarget(current, target)) {
    navigationForwardStack.push(current);
  }

  isHistoryNavigation = true;
  try {
    openNavigationTarget(target);
  } finally {
    isHistoryNavigation = false;
    updateNavigationButtons();
  }
}

function handleNavigateForward() {
  const target = navigationForwardStack.pop();
  const current = getCurrentNavigationTarget();
  if (!target || !current) {
    updateNavigationButtons();
    return;
  }

  if (!sameNavigationTarget(current, target)) {
    navigationBackStack.push(current);
  }

  isHistoryNavigation = true;
  try {
    openNavigationTarget(target);
  } finally {
    isHistoryNavigation = false;
    updateNavigationButtons();
  }
}

function handleHostFileData(message: ReviewFileDataMessage) {
  const key = cacheKey(message.scope, message.fileId);
  state.fileContents[key] = {
    originalContent: message.originalContent,
    modifiedContent: message.modifiedContent,
  };
  delete state.fileErrors[key];
  delete state.pendingRequestIds[key];
  resolvePendingFileWaiters(
    message.fileId,
    message.scope,
    state.fileContents[key],
  );
  sidebarController?.renderTree();
  if (
    state.activeFileId === message.fileId &&
    state.currentScope === message.scope
  ) {
    mountFile({ restoreFileScroll: true });
  }
}

function handleHostFileError(message: ReviewFileErrorMessage) {
  const key = cacheKey(message.scope, message.fileId);
  state.fileErrors[key] = message.message || "Unknown error";
  delete state.pendingRequestIds[key];
  rejectPendingFileWaiters(
    message.fileId,
    message.scope,
    state.fileErrors[key],
  );
  sidebarController?.renderTree();
  if (
    state.activeFileId === message.fileId &&
    state.currentScope === message.scope
  ) {
    mountFile({ preserveScroll: false });
  }
}

const runtimeController = createReviewRuntimeController({
  dom: {
    submitButton,
    cancelButton,
    overallCommentButton,
    fileCommentButton,
    navigateBackButton,
    navigateForwardButton,
    showReferencesButton,
    peekDefinitionButton,
    toggleReviewedButton,
    toggleUnchangedButton,
    toggleWrapButton,
    toggleSidebarButton,
    scopeDiffButton,
    scopeLastCommitButton,
    scopeAllButton,
    sidebarSearchInputEl,
  },
  events: {
    onSubmit: handleSubmitReview,
    onCancel: handleCancelReview,
    onShowOverallComment: showOverallCommentModal,
    onShowFileComment: showFileCommentModal,
    onNavigateBack: handleNavigateBack,
    onNavigateForward: handleNavigateForward,
    onShowReferences: () => {
      void handleShowReferences();
    },
    onPeekDefinition: () => {
      void handlePeekDefinition();
    },
    onToggleReviewed: handleToggleReviewed,
    onToggleUnchanged: handleToggleUnchanged,
    onToggleWrap: handleToggleWrap,
    onToggleSidebar: handleToggleSidebar,
    onScopeDiff: () => switchScope("git-diff"),
    onScopeLastCommit: () => switchScope("last-commit"),
    onScopeAll: () => switchScope("all-files"),
    onSidebarSearchInput: (value) => {
      state.fileFilter = value;
      sidebarController?.renderTree();
    },
    onSidebarSearchClear: () => {
      state.fileFilter = "";
      sidebarController?.renderTree();
    },
  },
  messages: {
    onFileData: handleHostFileData,
    onFileError: handleHostFileError,
  },
});

runtimeController.bind();
updateNavigationButtons();

ensureActiveFileForScope();
sidebarController?.renderTree();
commentManager?.renderFileComments();
sidebarController?.updateSidebarLayout();
setupMonaco();
