import { escapeHtml, inferLanguage } from "../../shared/lib/utils.js";
import type {
  DiffReviewComment,
  DiffReviewCommentKind,
  ReviewFile,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";
import type { ReviewState } from "../../shared/state/review-state.js";
import {
  extractChangedReviewSymbols,
  type ReviewSymbolRangeItem,
} from "../../features/symbols/symbol-context.js";
import { showCommentEditModal } from "../../features/comments/modals.js";

interface ReviewInspectorOptions {
  reviewDataFiles: ReviewFile[];
  state: ReviewState;
  changedSymbolsContainerEl: HTMLDivElement;
  reviewQueueContainerEl: HTMLDivElement;
  activeFile: () => ReviewFile | null;
  getCurrentNavigationTarget: () => ReviewNavigationTarget | null;
  getScopeComparison: (
    file: ReviewFile | null,
    scope?: ReviewScope,
  ) => ReviewFile["gitDiff"];
  getScopeFilePath: (file: ReviewFile | null) => string;
  getScopeDisplayPath: (file: ReviewFile | null, scope?: ReviewScope) => string;
  loadFileContents: (
    fileId: string,
    scope: ReviewScope,
  ) => Promise<{ originalContent: string; modifiedContent: string } | null>;
  openNavigationTarget: (target: ReviewNavigationTarget) => void;
  onCommentsChange: () => void;
  getCommentKind: (comment: DiffReviewComment) => DiffReviewCommentKind;
  getCommentKindLabel: (kind: DiffReviewCommentKind) => string;
  isCommentAnchorStale: (comment: DiffReviewComment) => boolean;
}

export interface ReviewInspectorController {
  renderReviewQueue: () => void;
  renderOutline: () => Promise<void>;
  jumpToComment: (comment: DiffReviewComment) => void;
  getSortedSubmittedComments: () => DiffReviewComment[];
  navigateSubmittedComment: (direction: "next" | "previous") => boolean;
}

export function createReviewInspectorController(
  options: ReviewInspectorOptions,
): ReviewInspectorController {
  const {
    reviewDataFiles,
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
    onCommentsChange,
    getCommentKind,
    getCommentKindLabel,
    isCommentAnchorStale,
  } = options;

  function getActiveCommentQueue(): DiffReviewComment[] {
    return state.comments
      .filter(
        (comment) =>
          comment.status === "submitted" &&
          comment.scope === state.currentScope,
      )
      .sort((left, right) => {
        if (left.fileId !== right.fileId) {
          return left.fileId.localeCompare(right.fileId);
        }
        return (left.startLine ?? 0) - (right.startLine ?? 0);
      });
  }

  function getCommentLocationLabel(comment: DiffReviewComment): string {
    const file =
      reviewDataFiles.find((candidate) => candidate.id === comment.fileId) ?? null;
    const path = getScopeDisplayPath(file, comment.scope);
    if (comment.side === "file" || comment.startLine == null) {
      return path;
    }
    const suffix =
      comment.scope === "all-files"
        ? ""
        : comment.side === "original"
          ? " old"
          : " new";
    return `${path}:${comment.startLine}${suffix}`;
  }

  function jumpToComment(comment: DiffReviewComment): void {
    const file =
      reviewDataFiles.find((candidate) => candidate.id === comment.fileId) ?? null;
    const comparison = getScopeComparison(file, comment.scope);
    openNavigationTarget({
      fileId: comment.fileId,
      scope: comment.scope,
      side:
        comment.side === "file"
          ? comparison?.hasModified || comment.scope === "all-files"
            ? "modified"
            : "original"
          : comment.side === "original"
            ? "original"
            : "modified",
      line: comment.startLine ?? 1,
      column: 1,
    });
  }

  function renderReviewQueue(): void {
    const comments = getActiveCommentQueue();
    reviewQueueContainerEl.innerHTML =
      comments.length > 0
        ? ""
        : `<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Submitted comments stay here until the review is finished.</div>`;

    comments.forEach((comment) => {
      const item = document.createElement("div");
      item.className =
        "rounded-md border border-review-border bg-review-panel-2 px-3 py-3";
      const kindLabel = escapeHtml(getCommentKindLabel(getCommentKind(comment)));
      const locationLabel = escapeHtml(getCommentLocationLabel(comment));
      const body = escapeHtml(comment.body);
      item.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <button data-action="open" class="min-w-0 flex-1 text-left">
            <div class="flex items-center gap-2">
              <div class="truncate text-xs font-semibold text-review-text">${kindLabel}</div>
              ${isCommentAnchorStale(comment) ? '<span class="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">Changed</span>' : ""}
            </div>
            <div class="mt-1 truncate text-[11px] text-review-muted">${locationLabel}</div>
          </button>
          <div class="flex items-center gap-2">
            <button data-action="edit" class="cursor-pointer rounded-md border border-review-border bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-review-text hover:bg-[#1a212b]">Edit</button>
            <button data-action="delete" class="cursor-pointer rounded-md border border-review-border bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-review-text hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400">Delete</button>
          </div>
        </div>
        <div class="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-review-text">${body}</div>
      `;
      (
        item.querySelector("[data-action='open']") as HTMLButtonElement | null
      )?.addEventListener("click", () => {
        jumpToComment(comment);
      });
      (
        item.querySelector("[data-action='edit']") as HTMLButtonElement | null
      )?.addEventListener("click", () => {
        showCommentEditModal({
          title: "Edit submitted comment",
          description:
            "Update this review instruction before you finish the review.",
          initialBody: comment.body,
          initialKind: getCommentKind(comment),
          onSave: ({ body, kind }) => {
            comment.body = body;
            comment.kind = kind;
            onCommentsChange();
          },
        });
      });
      (
        item.querySelector("[data-action='delete']") as HTMLButtonElement | null
      )?.addEventListener("click", () => {
        state.comments = state.comments.filter((item) => item.id !== comment.id);
        onCommentsChange();
      });
      reviewQueueContainerEl.appendChild(item);
    });
  }

  async function renderOutline(): Promise<void> {
    const file = activeFile();
    const scope = state.currentScope;

    if (!file) {
      changedSymbolsContainerEl.innerHTML =
        '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Select a file to inspect the changed symbols in it.</div>';
      return;
    }

    const contents = await loadFileContents(file.id, scope);
    if (state.activeFileId !== file.id || state.currentScope !== scope) {
      return;
    }
    const current = getCurrentNavigationTarget();
    const preferredSide =
      scope === "all-files" || getScopeComparison(file, scope)?.hasModified
        ? "modified"
        : "original";
    const changedSymbols = extractChangedReviewSymbols({
      originalContent: contents?.originalContent ?? "",
      modifiedContent: contents?.modifiedContent ?? "",
      languageId: inferLanguage(getScopeFilePath(file)),
      preferModified: preferredSide === "modified",
    });

    renderSymbolList({
      container: changedSymbolsContainerEl,
      file,
      scope,
      current,
      symbols: changedSymbols,
      emptyLabel: "No changed symbols were detected for this file.",
      activeSide: preferredSide,
      openNavigationTarget,
    });
  }

  function getSortedSubmittedComments(): DiffReviewComment[] {
    const fileOrder = new Map(
      reviewDataFiles.map((file, index) => [file.id, index]),
    );
    return state.comments
      .filter(
        (comment) =>
          comment.status === "submitted" &&
          comment.scope === state.currentScope,
      )
      .sort((left, right) => {
        const leftOrder = fileOrder.get(left.fileId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder =
          fileOrder.get(right.fileId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (left.startLine ?? 0) - (right.startLine ?? 0);
      });
  }

  function navigateSubmittedComment(direction: "next" | "previous"): boolean {
    const comments = getSortedSubmittedComments();
    if (comments.length === 0) return false;

    const current = getCurrentNavigationTarget();
    if (!current) {
      const target =
        direction === "next"
          ? comments[0] ?? null
          : comments[comments.length - 1] ?? null;
      if (!target) return false;
      jumpToComment(target);
      return true;
    }

    const currentKey = [current.fileId, current.line ?? 0, current.column ?? 0].join(":");
    const commentKeys = comments.map((comment) =>
      [comment.fileId, comment.startLine ?? 0, 1].join(":"),
    );
    const currentIndex = commentKeys.findIndex((key) => key >= currentKey);

    if (direction === "next") {
      if (currentIndex === -1) {
        const target = comments[0];
        if (!target) return false;
        jumpToComment(target);
        return true;
      }
      const candidate = comments[currentIndex];
      if (
        candidate &&
        (candidate.fileId !== current.fileId ||
          (candidate.startLine ?? 0) > (current.line ?? 0))
      ) {
        jumpToComment(candidate);
        return true;
      }
      const wrapped = comments[(currentIndex + 1) % comments.length];
      if (!wrapped) return false;
      jumpToComment(wrapped);
      return true;
    }

    if (currentIndex === -1) {
      const target = comments[comments.length - 1];
      if (!target) return false;
      jumpToComment(target);
      return true;
    }
    const previous =
      currentIndex === 0
        ? comments[comments.length - 1]
        : comments[currentIndex - 1];
    if (!previous) return false;
    jumpToComment(previous);
    return true;
  }

  return {
    renderReviewQueue,
    renderOutline,
    jumpToComment,
    getSortedSubmittedComments,
    navigateSubmittedComment,
  };
}

function renderSymbolList(options: {
  container: HTMLDivElement;
  file: ReviewFile;
  scope: ReviewScope;
  current: ReviewNavigationTarget | null;
  symbols: ReviewSymbolRangeItem[];
  emptyLabel: string;
  activeSide: "original" | "modified";
  openNavigationTarget: (target: ReviewNavigationTarget) => void;
}): void {
  const {
    container,
    file,
    scope,
    current,
    symbols,
    emptyLabel,
    activeSide,
    openNavigationTarget,
  } = options;

  if (symbols.length === 0) {
    container.innerHTML = `<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">${emptyLabel}</div>`;
    return;
  }

  container.innerHTML = "";
  symbols.forEach((symbol) => {
    const active =
      current?.fileId === file.id &&
      current.scope === scope &&
      current.line >= symbol.lineNumber &&
      current.line <= (symbol.endLineNumber ?? symbol.lineNumber);
    const button = document.createElement("button");
    button.type = "button";
    button.className = active
      ? "flex w-full items-center justify-between gap-3 rounded-md border border-[#2ea043]/35 bg-[#238636]/12 px-3 py-2 text-left"
      : "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-[#161b22]";
    const title = escapeHtml(symbol.title);
    const kind = escapeHtml(symbol.kind);
    const lineNumber = escapeHtml(String(symbol.lineNumber));
    button.innerHTML = `
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium text-review-text">${title}</span>
        <span class="mt-0.5 block text-[11px] text-review-muted">${kind} · line ${lineNumber}</span>
      </span>
      <span class="text-[11px] text-review-muted">${lineNumber}</span>
    `;
    button.addEventListener("click", () => {
      openNavigationTarget({
        fileId: file.id,
        scope,
        side: activeSide,
        line: symbol.lineNumber,
        column: 1,
      });
    });
    container.appendChild(button);
  });
}
