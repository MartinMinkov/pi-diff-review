import {
  scopeHint,
  scopeLabel,
  statusBadgeClass,
  statusLabel,
} from "../shared/lib/utils.js";
import { supportsSemanticDefinition } from "../../shared/lib/navigation.js";
import {
  createComment,
  getCommentKind,
  getCommentKindLabel,
  sameNavigationTarget,
  writeToClipboard,
} from "./shared/review-helpers.js";
import { createReviewFileModel } from "./models/review-file-model.js";
import {
  createReviewCodeSearchController,
  type ReviewCodeSearchMatch,
} from "./search/review-code-search.js";
import {
  createReviewCommandPaletteController,
  type ReviewCommandPaletteController,
} from "./commands/review-command-palette.js";
import {
  createReviewInspectorController,
  type ReviewInspectorController,
} from "./inspector/review-inspector.js";
import { createSidebarController } from "../features/file-tree/sidebar.js";
import type { ReviewSidebarController } from "../features/file-tree/sidebar.js";
import {
  type ChangeStatus,
  type DiffReviewComment,
  type ReviewDefinitionDataMessage,
  type ReviewDefinitionErrorMessage,
  type ReviewHostMessage,
  type ReviewFileContents,
  type ReviewFileDataMessage,
  type ReviewFileErrorMessage,
  type ReviewNavigationRequest,
  type ReviewNavigationTarget,
  type ReviewScope,
  type ReviewSubmitAckMessage,
  type ReviewWindowData,
  type ReviewWindowMessage,
} from "../shared/contracts/review.js";
import {
  createInitialReviewState,
  type ReviewMountOptions,
  type ReviewState,
} from "../shared/state/review-state.js";
import { getReviewDomElements } from "./ui/dom.js";
import {
  showTextModal as openTextModal,
} from "../features/comments/modals.js";
import { createCommentManager } from "../features/comments/comment-manager.js";
import type { ReviewCommentManager } from "../features/comments/comment-manager.js";
import {
  createReviewEditor,
  type ReviewEditorController,
  type ReviewEditorSelectionContext,
} from "../features/editor/review-editor.js";
import {
  createReviewNavigationResolver,
} from "../features/navigation/resolver.js";
import { createReviewRuntimeController } from "./runtime/controller.js";

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
  sidebarStatusFilterEl,
  hideReviewedCheckboxEl,
  commentedOnlyCheckboxEl,
  changedOnlyCheckboxEl,
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
  changedSymbolsContainerEl,
  reviewQueueContainerEl,
  submitButton,
  cancelButton,
  overallCommentButton,
  fileCommentButton,
  navigateBackButton,
  navigateForwardButton,
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
const pendingFileWaiters = new Map<
  string,
  Array<{
    resolve: (value: ReviewFileContents | null) => void;
    reject: (reason?: unknown) => void;
  }>
>();
const pendingDefinitionWaiters = new Map<
  string,
  Array<{
    resolve: (value: ReviewNavigationTarget | null) => void;
    reject: (reason?: unknown) => void;
  }>
>();
type NavigationCheckpoint = ReviewNavigationTarget;
const navigationBackStack: NavigationCheckpoint[] = [];
const navigationForwardStack: NavigationCheckpoint[] = [];
let isHistoryNavigation = false;
let summaryFlashTimeout: number | null = null;
let pendingSubmitRequestId: string | null = null;
let inspectorController: ReviewInspectorController | null = null;
let commandPaletteController: ReviewCommandPaletteController | null = null;
const fileModel = createReviewFileModel({
  reviewDataFiles: reviewData.files,
  state,
  isFileReviewed: (fileId) => state.reviewedFiles[fileId] === true,
});

function isFileReviewed(fileId: string): boolean {
  return state.reviewedFiles[fileId] === true;
}

function flashSummary(message: string): void {
  if (summaryFlashTimeout != null) {
    window.clearTimeout(summaryFlashTimeout);
  }
  const previous = summaryEl.textContent || "";
  summaryEl.textContent = message;
  summaryFlashTimeout = window.setTimeout(() => {
    summaryFlashTimeout = null;
    sidebarController?.renderTree();
    if (!summaryEl.textContent) {
      summaryEl.textContent = previous;
    }
  }, 1800);
}

function setSubmitPendingState(isPending: boolean): void {
  submitButton.disabled = isPending;
  cancelButton.disabled = isPending;
  submitButton.textContent = isPending ? "Submitting…" : "Finish review";
}

const getScopedFiles = fileModel.getScopedFiles;
const ensureActiveFileForScope = fileModel.ensureActiveFileForScope;
const activeFile = fileModel.activeFile;
const getScopeComparison = fileModel.getScopeComparison;
const activeComparison = fileModel.activeComparison;
const activeFileShowsDiff = fileModel.activeFileShowsDiff;
const getScopeFilePath = fileModel.getScopeFilePath;
const getScopeDisplayPath = fileModel.getScopeDisplayPath;
const getScopeSidePath = fileModel.getScopeSidePath;
const getActiveStatus = fileModel.getActiveStatus;
const getFilteredFiles = fileModel.getFilteredFiles;

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

const codeSearchController = createReviewCodeSearchController({
  scope: () => state.currentScope,
  getScopedFiles,
  getScopeComparison,
  getScopeSidePath,
  loadFileContents,
  onStateChange: () => {
    sidebarController?.renderTree();
  },
});

function getCodeSearchState() {
  return codeSearchController.getState();
}

function clearCodeSearch(): void {
  codeSearchController.clear();
}

function scheduleCodeSearch(query: string): void {
  codeSearchController.schedule(query);
}

function resolvePendingDefinitionWaiters(
  requestId: string,
  value: ReviewNavigationTarget | null,
): void {
  const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
  pendingDefinitionWaiters.delete(requestId);
  waiters.forEach((waiter) => waiter.resolve(value));
}

function rejectPendingDefinitionWaiters(
  requestId: string,
  reason: unknown,
): void {
  const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
  pendingDefinitionWaiters.delete(requestId);
  waiters.forEach((waiter) => waiter.reject(reason));
}

function requestDefinitionTarget(
  request: ReviewNavigationRequest,
): Promise<ReviewNavigationTarget | null> {
  if (!window.glimpse?.send) {
    return Promise.resolve(null);
  }

  const requestId = `definition:${Date.now()}:${++requestSequence}`;
  const payload: ReviewWindowMessage = {
    type: "request-definition",
    requestId,
    request,
  };

  window.glimpse.send(payload);

  return new Promise((resolve, reject) => {
    const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
    waiters.push({ resolve, reject });
    pendingDefinitionWaiters.set(requestId, waiters);
  });
}

function getNavigationErrorMessage(
  languageId: string,
  error: unknown,
): string {
  const detail =
    error instanceof Error ? error.message.trim() : String(error || "").trim();
  const label =
    languageId === "rust"
      ? "Rust navigation unavailable"
      : languageId === "go"
        ? "Go navigation unavailable"
        : "Definition lookup unavailable";
  return detail ? `${label}: ${detail}` : label;
}

async function resolveDefinitionTarget(
  request: ReviewNavigationRequest,
  options: { silent?: boolean } = {},
): Promise<ReviewNavigationTarget | null> {
  const semanticTarget = supportsSemanticDefinition(request.languageId)
    ? await requestDefinitionTarget(request).catch((error: unknown) => {
        if (!options.silent) {
          flashSummary(getNavigationErrorMessage(request.languageId, error));
        }
        return null;
      })
    : null;
  return semanticTarget ?? navigationResolver.resolveTarget(request);
}

function getCurrentNavigationTarget(): ReviewNavigationTarget | null {
  return editorController?.getCurrentNavigationTarget() ?? null;
}

function getCurrentSelectionContext(): ReviewEditorSelectionContext | null {
  return editorController?.getCurrentSelectionContext() ?? null;
}

function getLoadedAnchorText(
  fileId: string,
  scope: ReviewScope,
  side: "original" | "modified",
  lineNumber: number,
): string | null {
  const key = cacheKey(scope, fileId);
  const contents = state.fileContents[key];
  if (!contents) return null;
  const content =
    side === "original" ? contents.originalContent : contents.modifiedContent;
  return content.split(/\r?\n/)[lineNumber - 1]?.trim() ?? null;
}

function getLoadedCommentAnchorText(comment: DiffReviewComment): string | null {
  if (comment.startLine == null || comment.side === "file") return null;
  return getLoadedAnchorText(
    comment.fileId,
    comment.scope,
    comment.side,
    comment.startLine,
  );
}

function isCommentAnchorStale(comment: DiffReviewComment): boolean {
  if (!comment.anchorText || comment.startLine == null || comment.side === "file") {
    return false;
  }
  const currentLine = getLoadedCommentAnchorText(comment);
  return currentLine != null && currentLine !== comment.anchorText.trim();
}

function getActiveLocationLabel(): string | null {
  const file = activeFile();
  const target = getCurrentNavigationTarget();
  if (!file || !target) return null;

  const path =
    target.scope === "all-files"
      ? file.path
      : getScopeSidePath(file, target.scope, target.side) || file.path;
  const sideSuffix =
    target.scope === "all-files"
      ? ""
      : target.side === "original"
        ? " (old)"
        : " (new)";
  return `${path}:${target.line}:${target.column}${sideSuffix}`;
}

function getSelectionReference(): string | null {
  const selection = getCurrentSelectionContext();
  const file = activeFile();
  if (!selection || !file) return null;
  const path =
    selection.scope === "all-files"
      ? file.path
      : getScopeSidePath(file, selection.scope, selection.side) || file.path;
  const range =
    selection.startLine === selection.endLine
      ? `${selection.startLine}`
      : `${selection.startLine}-${selection.endLine}`;
  const sideSuffix =
    selection.scope === "all-files"
      ? ""
      : selection.side === "original"
        ? " (old)"
        : " (new)";
  return `${path}:${range}${sideSuffix}`;
}

function navigateSubmittedComment(direction: "next" | "previous"): void {
  if (!inspectorController?.navigateSubmittedComment(direction)) {
    flashSummary("No submitted comments in this scope");
    return;
  }
  flashSummary(
    direction === "next"
      ? "Jumped to next submitted comment"
      : "Jumped to previous submitted comment",
  );
}

function renderReviewQueue(): void {
  inspectorController?.renderReviewQueue();
}

async function renderOutline(): Promise<void> {
  await inspectorController?.renderOutline();
}

function updateNavigationButtons(): void {
  navigateBackButton.disabled = navigationBackStack.length === 0;
  navigateForwardButton.disabled = navigationForwardStack.length === 0;
}

function updateEditorContextUI(context: {
  navigationRequest: ReviewNavigationRequest | null;
  navigationTarget: ReviewNavigationTarget | null;
  symbolTitle: string | null;
  symbolLine: number | null;
}): void {
  currentSymbolLabelEl.textContent = context.symbolTitle
    ? `Symbol: ${context.symbolTitle}${context.symbolLine ? ` · line ${context.symbolLine}` : ""}`
    : "";
  updateNavigationButtons();
  void renderOutline();
}

function recordNavigationCheckpoint(
  checkpoint: NavigationCheckpoint | null = null,
): void {
  if (isHistoryNavigation) return;
  const current = checkpoint ?? getCurrentNavigationTarget();
  if (!current) return;
  const previous = navigationBackStack[navigationBackStack.length - 1] ?? null;
  if (!sameNavigationTarget(previous, current)) {
    navigationBackStack.push(current);
  }
  navigationForwardStack.length = 0;
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

function openNavigationTarget(
  target: ReviewNavigationTarget,
  options: { source?: NavigationCheckpoint | null } = {},
): void {
  const targetFile = reviewData.files.find((file) => file.id === target.fileId);
  if (!targetFile) return;

  const scopeChanged = state.currentScope !== target.scope;
  const fileChanged = state.activeFileId !== target.fileId;
  const current = getCurrentNavigationTarget();
  if (!sameNavigationTarget(current, target)) {
    recordNavigationCheckpoint(options.source ?? null);
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

function openCodeSearchMatch(match: ReviewCodeSearchMatch): void {
  openNavigationTarget(match.target);
}

sidebarController = createSidebarController({
  reviewDataFiles: reviewData.files,
  state,
  sidebarEl,
  sidebarTitleEl,
  fileTreeEl,
  summaryEl,
  modeHintEl,
  sidebarStatusFilterEl,
  hideReviewedCheckboxEl,
  commentedOnlyCheckboxEl,
  changedOnlyCheckboxEl,
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
  getCodeSearchState,
  getActiveStatus,
  activeFile,
  openFile,
  openCodeSearchMatch,
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
  state.comments.push(createComment({
    fileId,
    scope: state.currentScope,
    side,
    startLine: line,
    endLine: line,
    body: "",
    status: "draft",
    collapsed: false,
    anchorPath: getScopeSidePath(activeFile(), state.currentScope, side),
    anchorText: getLoadedAnchorText(fileId, state.currentScope, side, line) ?? undefined,
  }));
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
  renderCommentDOM: (comment, options) =>
    commentManager?.renderCommentDOM(comment, options) ??
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
  resolveDefinitionTarget,
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
    initialKind: state.overallCommentKind,
    saveLabel: "Save note",
    onSave: ({ body, kind }) => {
      state.overallComment = body;
      state.overallCommentKind = kind;
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
    initialKind: "feedback",
    saveLabel: "Add comment",
    onSave: ({ body, kind }) => {
      if (!body) return;
      state.comments.push(createComment({
        fileId: file.id,
        scope: state.currentScope,
        side: "file",
        startLine: null,
        endLine: null,
        body,
        status: "submitted",
        collapsed: false,
        kind,
        anchorPath: getScopeDisplayPath(file, state.currentScope),
      }));
      submitButton.disabled = false;
      updateCommentsUI();
    },
  });
}

inspectorController = createReviewInspectorController({
  reviewDataFiles: reviewData.files,
  state,
  changedSymbolsContainerEl,
  reviewQueueContainerEl,
  activeFile,
  getCurrentNavigationTarget,
  getScopeComparison,
  getScopeFilePath,
  getScopeDisplayPath,
  loadFileContents,
  openNavigationTarget,
  onCommentsChange: updateCommentsUI,
  getCommentKind: (comment) => getCommentKind(comment),
  getCommentKindLabel,
  isCommentAnchorStale,
});

commandPaletteController = createReviewCommandPaletteController({
  state,
  currentSymbolLabelEl,
  sidebarSearchInputEl,
  getScopedFiles,
  activeFile,
  getScopeDisplayPath,
  getActiveStatus,
  statusLabel,
  scopeLabel,
  getCurrentSelectionContext,
  getCurrentNavigationTarget,
  getActiveLocationLabel,
  getSelectionReference,
  loadFileContents,
  describeNavigationTarget,
  writeToClipboard,
  flashSummary,
  openFile,
  toggleReviewed: handleToggleReviewed,
  navigateSubmittedComment,
});

function openQuickOpenFiles(): void {
  commandPaletteController?.openQuickOpenFiles();
}

function openCommandPalette(): void {
  commandPaletteController?.openCommandPalette();
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
  renderReviewQueue();
}

function applyEditorOptions() {
  editorController?.applyOptions();
}

function renderAll(options: ReviewMountOptions = {}): void {
  sidebarController?.renderTree();
  submitButton.disabled = false;
  updateNavigationButtons();
  renderReviewQueue();
  void renderOutline();
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
  scheduleCodeSearch(state.fileFilter);
  const file = activeFile();
  if (file) ensureFileLoaded(file.id, state.currentScope);
  updateNavigationButtons();
}

function handleSubmitReview() {
  if (pendingSubmitRequestId) {
    return;
  }
  commentManager?.syncCommentBodiesFromDOM();
  const requestId = `submit:${Date.now()}:${++requestSequence}`;
  const payload: ReviewWindowMessage = {
    type: "submit",
    requestId,
    overallComment: state.overallComment.trim(),
    overallCommentKind: state.overallCommentKind,
    comments: state.comments
      .map((comment) => ({
        ...comment,
        body: comment.body.trim(),
        kind: getCommentKind(comment),
      }))
      .filter(
        (comment) =>
          comment.status === "submitted" &&
          comment.body.length > 0,
      ),
  };
  pendingSubmitRequestId = requestId;
  setSubmitPendingState(true);
  window.glimpse.send(payload);
  flashSummary("Submitting review feedback…");
}

function handleCancelReview() {
  window.glimpse.send({ type: "cancel" });
  window.glimpse.close();
}

function handleToggleReviewed() {
  const file = activeFile();
  if (!file) return;
  const nextReviewed = !isFileReviewed(file.id);
  state.reviewedFiles[file.id] = nextReviewed;
  sidebarController?.renderTree();
  flashSummary(nextReviewed ? "Marked file reviewed" : "Cleared reviewed mark");
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
  );
  sidebarController?.renderTree();
  if (
    state.activeFileId === message.fileId &&
    state.currentScope === message.scope
  ) {
    mountFile({ preserveScroll: false });
  }
}

function handleHostDefinitionData(message: ReviewDefinitionDataMessage) {
  resolvePendingDefinitionWaiters(message.requestId, message.target);
}

function handleHostDefinitionError(message: ReviewDefinitionErrorMessage) {
  rejectPendingDefinitionWaiters(
    message.requestId,
    new Error(message.message || "Unknown navigation error"),
  );
}

function handleHostSubmitAck(message: ReviewSubmitAckMessage) {
  if (message.requestId !== pendingSubmitRequestId) return;
  flashSummary(
    `Review received by host${message.commentCount > 0 ? ` (${message.commentCount} comment${message.commentCount === 1 ? "" : "s"})` : ""}. Closing…`,
  );
}

const runtimeController = createReviewRuntimeController({
  dom: {
    submitButton,
    cancelButton,
    overallCommentButton,
    fileCommentButton,
    navigateBackButton,
    navigateForwardButton,
    toggleReviewedButton,
    toggleUnchangedButton,
    toggleWrapButton,
    toggleSidebarButton,
    scopeDiffButton,
    scopeLastCommitButton,
    scopeAllButton,
    sidebarSearchInputEl,
    sidebarStatusFilterEl,
    hideReviewedCheckboxEl,
    commentedOnlyCheckboxEl,
    changedOnlyCheckboxEl,
  },
  events: {
    onSubmit: handleSubmitReview,
    onCancel: handleCancelReview,
    onShowOverallComment: showOverallCommentModal,
    onShowFileComment: showFileCommentModal,
    onNavigateBack: handleNavigateBack,
    onNavigateForward: handleNavigateForward,
    onToggleReviewed: handleToggleReviewed,
    onToggleUnchanged: handleToggleUnchanged,
    onToggleWrap: handleToggleWrap,
    onToggleSidebar: handleToggleSidebar,
    onScopeDiff: () => switchScope("git-diff"),
    onScopeLastCommit: () => switchScope("last-commit"),
    onScopeAll: () => switchScope("all-files"),
    onSidebarSearchInput: (value) => {
      state.fileFilter = value;
      scheduleCodeSearch(value);
      sidebarController?.renderTree();
    },
    onSidebarSearchClear: () => {
      state.fileFilter = "";
      clearCodeSearch();
      sidebarController?.renderTree();
    },
    onStatusFilterChange: (value) => {
      state.statusFilter = (value as ChangeStatus | "all") ?? "all";
      sidebarController?.renderTree();
    },
    onHideReviewedChange: (checked) => {
      state.hideReviewedFiles = checked;
      sidebarController?.renderTree();
    },
    onCommentedOnlyChange: (checked) => {
      state.showCommentedFilesOnly = checked;
      sidebarController?.renderTree();
    },
    onChangedOnlyChange: (checked) => {
      state.showChangedFilesOnly = checked;
      sidebarController?.renderTree();
    },
  },
  messages: {
    onFileData: handleHostFileData,
    onFileError: handleHostFileError,
    onDefinitionData: handleHostDefinitionData,
    onDefinitionError: handleHostDefinitionError,
    onSubmitAck: handleHostSubmitAck,
  },
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    openQuickOpenFiles();
    return;
  }

  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  const isMonacoTarget = target?.closest(".monaco-editor") != null;
  const isTypingTarget =
    !isMonacoTarget &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable === true);
  if (isTypingTarget) return;

  if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    sidebarSearchInputEl.focus();
    sidebarSearchInputEl.select();
    return;
  }

  if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    if (!event.repeat) {
      handleToggleReviewed();
    }
    return;
  }

  if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    navigateSubmittedComment(event.shiftKey ? "previous" : "next");
    return;
  }
});

runtimeController.bind();
updateNavigationButtons();

ensureActiveFileForScope();
sidebarController?.renderTree();
commentManager?.renderFileComments();
renderReviewQueue();
void renderOutline();
sidebarController?.updateSidebarLayout();
setupMonaco();
