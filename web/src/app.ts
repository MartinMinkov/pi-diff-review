import {
  scopeHint,
  scopeLabel,
  statusBadgeClass,
  statusLabel,
  getFileSearchPath,
  getFileSearchScore,
} from "./utils.js";
import { createSidebarController } from "./review-sidebar.js";
import type { ReviewSidebarController } from "./review-sidebar.js";
import {
  type ReviewFile,
  type ChangeStatus,
  type ReviewHostMessage,
  type ReviewFileDataMessage,
  type ReviewFileErrorMessage,
  type ReviewScope,
  type ReviewWindowData,
  type ReviewWindowMessage,
} from "./types.js";
import {
  createInitialReviewState,
  type ReviewMountOptions,
  type ReviewState,
} from "./review-state.js";
import { getReviewDomElements } from "./review-elements.js";
import { showTextModal as openTextModal } from "./ui-modals.js";
import { createCommentManager } from "./review-comments.js";
import type { ReviewCommentManager } from "./review-comments.js";
import {
  createReviewEditor,
  type ReviewEditorController,
} from "./review-editor.js";
import { createReviewRuntimeController } from "./review-runtime.js";

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
  modeHintEl,
  fileCommentsContainer,
  editorContainerEl,
  submitButton,
  cancelButton,
  overallCommentButton,
  fileCommentButton,
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

function openFile(fileId: string): void {
  if (state.activeFileId === fileId) {
    ensureFileLoaded(fileId, state.currentScope);
    return;
  }
  editorController?.saveCurrentScrollPosition();
  state.activeFileId = fileId;
  renderAll({ restoreFileScroll: true });
  ensureFileLoaded(fileId, state.currentScope);
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
  renderFileComments: () => {
    commentManager?.renderFileComments();
  },
  canCommentOnSide,
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
  editorController?.saveCurrentScrollPosition();
  state.currentScope = scope;
  renderAll({ restoreFileScroll: true });
  const file = activeFile();
  if (file) ensureFileLoaded(file.id, state.currentScope);
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

function handleHostFileData(message: ReviewFileDataMessage) {
  const key = cacheKey(message.scope, message.fileId);
  state.fileContents[key] = {
    originalContent: message.originalContent,
    modifiedContent: message.modifiedContent,
  };
  delete state.fileErrors[key];
  delete state.pendingRequestIds[key];
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

ensureActiveFileForScope();
sidebarController?.renderTree();
commentManager?.renderFileComments();
sidebarController?.updateSidebarLayout();
setupMonaco();
