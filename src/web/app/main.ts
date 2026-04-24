import {
  inferLanguage,
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
  type ReviewFile,
  type ChangeStatus,
  type DiffReviewComment,
  type ReviewDefinitionDataMessage,
  type ReviewDefinitionErrorMessage,
  type ReviewHostMessage,
  type ReviewFileContents,
  type ReviewFileDataMessage,
  type ReviewFileErrorMessage,
  type ReviewNavigationRequest,
  type ReviewNavigationSide,
  type ReviewNavigationTarget,
  type ReviewReferencesDataMessage,
  type ReviewReferencesErrorMessage,
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
  showPeekModal,
  showReferenceModal,
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
import { buildPreviewSnippet } from "../features/symbols/symbol-context.js";
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
const pendingReferencesWaiters = new Map<
  string,
  Array<{
    resolve: (value: ReviewNavigationTarget[]) => void;
    reject: (reason?: unknown) => void;
  }>
>();
type NavigationCheckpoint = ReviewNavigationTarget;
const navigationBackStack: NavigationCheckpoint[] = [];
const navigationForwardStack: NavigationCheckpoint[] = [];
let isHistoryNavigation = false;
let currentNavigationRequestAvailable = false;
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

function resolvePendingReferencesWaiters(
  requestId: string,
  value: ReviewNavigationTarget[],
): void {
  const waiters = pendingReferencesWaiters.get(requestId) ?? [];
  pendingReferencesWaiters.delete(requestId);
  waiters.forEach((waiter) => waiter.resolve(value));
}

function rejectPendingReferencesWaiters(
  requestId: string,
  reason: unknown,
): void {
  const waiters = pendingReferencesWaiters.get(requestId) ?? [];
  pendingReferencesWaiters.delete(requestId);
  waiters.forEach((waiter) => waiter.reject(reason));
}

function requestReferenceTargets(
  request: ReviewNavigationRequest,
): Promise<ReviewNavigationTarget[]> {
  if (!window.glimpse?.send) {
    return Promise.resolve([]);
  }

  const requestId = `references:${Date.now()}:${++requestSequence}`;
  const payload: ReviewWindowMessage = {
    type: "request-references",
    requestId,
    request,
  };

  window.glimpse.send(payload);

  return new Promise((resolve, reject) => {
    const waiters = pendingReferencesWaiters.get(requestId) ?? [];
    waiters.push({ resolve, reject });
    pendingReferencesWaiters.set(requestId, waiters);
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
  showReferencesButton.disabled = !currentNavigationRequestAvailable;
  peekDefinitionButton.disabled = !currentNavigationRequestAvailable;
}

function updateEditorContextUI(context: {
  navigationRequest: ReviewNavigationRequest | null;
  navigationTarget: ReviewNavigationTarget | null;
  symbolTitle: string | null;
  symbolLine: number | null;
}): void {
  currentNavigationRequestAvailable = context.navigationRequest != null;
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
      description: "Select a repo-local symbol, import, or module path first.",
      items: [],
      emptyLabel:
        "No active navigation target is available at the current cursor.",
    });
    return;
  }

  const target = await resolveDefinitionTarget(request);
  if (!target) {
    showReferenceModal({
      title: "References",
      description: "This selection does not resolve to a repo-local navigation target.",
      items: [],
      emptyLabel:
        "No repo-local references are available for the current selection.",
    });
    return;
  }

  showReferencesButton.disabled = true;
  const previousLabel = showReferencesButton.textContent || "References";
  showReferencesButton.textContent = "Searching…";

  try {
    let matches:
      | Array<{
          target: ReviewNavigationTarget;
          lineNumber: number;
          column: number;
          sourcePath: string;
          lineText: string;
        }>
      | [];

    if (supportsSemanticDefinition(request.languageId)) {
      const semanticTargets =
        (await requestReferenceTargets(request).catch((error: unknown) => {
          flashSummary(getNavigationErrorMessage(request.languageId, error));
          return [];
        })) ?? [];
      const semanticItems = await Promise.all(
        semanticTargets.map(async (target) => {
          const file = reviewData.files.find((item) => item.id === target.fileId);
          const contents = await loadFileContents(target.fileId, target.scope);
          const content =
            target.side === "original"
              ? contents?.originalContent ?? ""
              : contents?.modifiedContent ?? "";
          const lineText = content.split(/\r?\n/)[target.line - 1] ?? "";
          return {
            target,
            lineNumber: target.line,
            column: target.column,
            sourcePath: getScopeDisplayPath(file ?? null, target.scope),
            lineText,
          };
        }),
      );
      matches = semanticItems.sort((a, b) => sortReferenceTargets(a.target, b.target));
    } else {
      const searchableFiles = reviewData.files.filter(
        (file) => file.hasWorkingTreeFile,
      );
      const loadedFiles = await Promise.all(
        searchableFiles.map(async (file) => ({
          file,
          contents: await loadFileContents(file.id, "all-files"),
        })),
      );

      matches = navigationResolver
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
    }

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
  const target = await resolveDefinitionTarget(request);
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
      state.comments.push(createComment({
        fileId: file.id,
        scope: state.currentScope,
        side: "file",
        startLine: null,
        endLine: null,
        body: value,
        status: "submitted",
        collapsed: false,
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

function handleHostReferencesData(message: ReviewReferencesDataMessage) {
  resolvePendingReferencesWaiters(message.requestId, message.targets ?? []);
}

function handleHostReferencesError(message: ReviewReferencesErrorMessage) {
  rejectPendingReferencesWaiters(
    message.requestId,
    new Error(message.message || "Unknown references error"),
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
    onReferencesData: handleHostReferencesData,
    onReferencesError: handleHostReferencesError,
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
  const isTypingTarget =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable === true;
  if (isTypingTarget) return;

  if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    sidebarSearchInputEl.focus();
    sidebarSearchInputEl.select();
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
