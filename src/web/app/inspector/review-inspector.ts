import { inferLanguage } from "../../shared/lib/utils.js";
import type {
  DiffReviewComment,
  DiffReviewCommentKind,
  ReviewFile,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";
import type { ReviewState } from "../../shared/state/review-state.js";
import {
  extractReviewSymbols,
  type ReviewSymbolItem,
} from "../../features/symbols/symbol-context.js";

interface ReviewInspectorOptions {
  reviewDataFiles: ReviewFile[];
  state: ReviewState;
  outlineContainerEl: HTMLDivElement;
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
  isCommentResolved: (comment: DiffReviewComment) => boolean;
  isCommentAnchorStale: (comment: DiffReviewComment) => boolean;
}

export interface ReviewInspectorController {
  renderReviewQueue: () => void;
  renderOutline: () => Promise<void>;
  jumpToComment: (comment: DiffReviewComment) => void;
  getSortedUnresolvedComments: () => DiffReviewComment[];
  navigateUnresolvedComment: (direction: "next" | "previous") => boolean;
}

export function createReviewInspectorController(
  options: ReviewInspectorOptions,
): ReviewInspectorController {
  const {
    reviewDataFiles,
    state,
    outlineContainerEl,
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
    isCommentResolved,
    isCommentAnchorStale,
  } = options;

  const outlineCache = new Map<
    string,
    { content: string; symbols: ReviewSymbolItem[] }
  >();

  function getActiveCommentQueue(): DiffReviewComment[] {
    return state.comments
      .filter(
        (comment) =>
          comment.status === "submitted" &&
          !isCommentResolved(comment) &&
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
      item.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <button data-action="open" class="min-w-0 flex-1 text-left">
            <div class="flex items-center gap-2">
              <div class="truncate text-xs font-semibold text-review-text">${getCommentKindLabel(getCommentKind(comment))}</div>
              ${isCommentAnchorStale(comment) ? '<span class="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">Changed</span>' : ""}
            </div>
            <div class="mt-1 truncate text-[11px] text-review-muted">${getCommentLocationLabel(comment)}</div>
          </button>
          <button data-action="resolve" class="cursor-pointer rounded-md border border-review-border bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-review-text hover:bg-[#1a212b]">Resolve</button>
        </div>
        <div class="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-review-text">${comment.body
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</div>
      `;
      (
        item.querySelector("[data-action='open']") as HTMLButtonElement | null
      )?.addEventListener("click", () => {
        jumpToComment(comment);
      });
      (
        item.querySelector("[data-action='resolve']") as HTMLButtonElement | null
      )?.addEventListener("click", () => {
        comment.resolved = true;
        onCommentsChange();
      });
      reviewQueueContainerEl.appendChild(item);
    });
  }

  async function renderOutline(): Promise<void> {
    const file = activeFile();
    const scope = state.currentScope;
    if (!file) {
      outlineContainerEl.innerHTML =
        '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Select a file to inspect its symbols.</div>';
      return;
    }

    const contents = await loadFileContents(file.id, scope);
    if (state.activeFileId !== file.id || state.currentScope !== scope) {
      return;
    }
    const useModified =
      scope === "all-files" || getScopeComparison(file, scope)?.hasModified;
    const content = useModified
      ? contents?.modifiedContent ?? ""
      : contents?.originalContent ?? "";
    const outlineKey = `${scope}:${file.id}:${useModified ? "modified" : "original"}`;
    const cached = outlineCache.get(outlineKey);
    const symbols =
      cached && cached.content === content
        ? cached.symbols
        : extractReviewSymbols(content, inferLanguage(getScopeFilePath(file)));
    if (!cached || cached.content !== content) {
      outlineCache.set(outlineKey, { content, symbols });
    }
    const current = getCurrentNavigationTarget();

    if (symbols.length === 0) {
      outlineContainerEl.innerHTML =
        '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">No outline entries were detected for this file.</div>';
      return;
    }

    outlineContainerEl.innerHTML = "";
    symbols.forEach((symbol) => {
      const button = document.createElement("button");
      const active =
        current?.fileId === file.id &&
        current.scope === scope &&
        current.line === symbol.lineNumber;
      button.type = "button";
      button.className = active
        ? "flex w-full items-center justify-between gap-3 rounded-md border border-[#2ea043]/35 bg-[#238636]/12 px-3 py-2 text-left"
        : "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-[#161b22]";
      button.innerHTML = `
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-review-text">${symbol.title}</span>
          <span class="mt-0.5 block text-[11px] text-review-muted">${symbol.kind} · line ${symbol.lineNumber}</span>
        </span>
        <span class="text-[11px] text-review-muted">${symbol.lineNumber}</span>
      `;
      button.addEventListener("click", () => {
        openNavigationTarget({
          fileId: file.id,
          scope,
          side:
            scope === "all-files"
              ? "modified"
              : getScopeComparison(file, scope)?.hasModified
                ? "modified"
                : "original",
          line: symbol.lineNumber,
          column: 1,
        });
      });
      outlineContainerEl.appendChild(button);
    });
  }

  function getSortedUnresolvedComments(): DiffReviewComment[] {
    const fileOrder = new Map(
      reviewDataFiles.map((file, index) => [file.id, index]),
    );
    return state.comments
      .filter(
        (comment) =>
          comment.status === "submitted" &&
          !isCommentResolved(comment) &&
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

  function navigateUnresolvedComment(direction: "next" | "previous"): boolean {
    const comments = getSortedUnresolvedComments();
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
    getSortedUnresolvedComments,
    navigateUnresolvedComment,
  };
}
