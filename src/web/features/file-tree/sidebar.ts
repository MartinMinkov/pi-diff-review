import {
  buildTree,
  escapeHtml,
} from "../../shared/lib/utils.js";
import type {
  ChangeStatus,
  ReviewFile,
  ReviewScope,
  ReviewFileContents,
} from "../../shared/contracts/review.js";
import type { TreeNode } from "../../shared/lib/utils.js";
import type { ReviewState } from "../../shared/state/review-state.js";
import type {
  ReviewCodeSearchMatch,
  ReviewCodeSearchState,
} from "../../app/search/review-code-search.js";

interface FileRequestState {
  contents?: ReviewFileContents;
  error?: string;
  requestId?: string;
}

interface ReviewSidebarOptions {
  reviewDataFiles: ReviewFile[];
  state: ReviewState;
  sidebarEl: HTMLDivElement;
  sidebarTitleEl: HTMLDivElement;
  fileTreeEl: HTMLDivElement;
  summaryEl: HTMLSpanElement;
  modeHintEl: HTMLDivElement;
  sidebarStatusFilterEl: HTMLSelectElement;
  hideReviewedCheckboxEl: HTMLInputElement;
  commentedOnlyCheckboxEl: HTMLInputElement;
  changedOnlyCheckboxEl: HTMLInputElement;
  submitButton: HTMLButtonElement;
  toggleReviewedButton: HTMLButtonElement;
  toggleUnchangedButton: HTMLButtonElement;
  toggleWrapButton: HTMLButtonElement;
  toggleSidebarButton: HTMLButtonElement;
  scopeDiffButton: HTMLButtonElement;
  scopeLastCommitButton: HTMLButtonElement;
  scopeAllButton: HTMLButtonElement;
  scopeLabel: (scope: ReviewScope) => string;
  scopeHint: (scope: ReviewScope) => string;
  statusBadgeClass: (status: ChangeStatus) => string;
  statusLabel: (status: string | null | undefined) => string;
  getScopedFiles: () => ReviewFile[];
  getFilteredFiles: () => ReviewFile[];
  getRequestState: (fileId: string, scope: ReviewScope) => FileRequestState;
  isFileReviewed: (fileId: string) => boolean;
  getCodeSearchState: () => ReviewCodeSearchState;
  getActiveStatus: (file: ReviewFile | null) => ChangeStatus | null;
  activeFile: () => ReviewFile | null;
  openFile: (fileId: string) => void;
  openCodeSearchMatch: (match: ReviewCodeSearchMatch) => void;
  ensureActiveFileForScope: () => void;
  activeFileShowsDiff: () => boolean;
}

export interface ReviewSidebarController {
  renderTree: () => void;
  updateSidebarLayout: () => void;
  updateScopeButtons: () => void;
  updateToggleButtons: () => void;
}

export function createSidebarController(
  options: ReviewSidebarOptions,
): ReviewSidebarController {
  const {
    reviewDataFiles,
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
  } = options;

  function renderHighlightedLine(match: ReviewCodeSearchMatch): string {
    const raw = match.lineText.trim() || "(blank line)";
    const trimmedOffset = match.lineText.indexOf(raw);
    if (raw === "(blank line)") {
      return escapeHtml(raw);
    }

    const start = Math.max(0, match.matchStartColumn - 1 - trimmedOffset);
    const end = Math.max(start, match.matchEndColumn - 1 - trimmedOffset);
    const safeStart = Math.min(start, raw.length);
    const safeEnd = Math.min(end, raw.length);

    return [
      escapeHtml(raw.slice(0, safeStart)),
      `<mark class="rounded-sm bg-[#264f78] px-0.5 text-review-text">${escapeHtml(raw.slice(safeStart, safeEnd))}</mark>`,
      escapeHtml(raw.slice(safeEnd)),
    ].join("");
  }

  function getSubmittedCommentCount(fileId?: string): number {
    return state.comments.filter((comment) => {
      if (comment.status !== "submitted") return false;
      if (comment.scope !== state.currentScope) return false;
      if (fileId != null && comment.fileId !== fileId) return false;
      return true;
    }).length;
  }

  function renderTreeNode(node: TreeNode, depth: number) {
    const children = [...node.children.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const indentPx = 12;

    for (const child of children) {
      if (child.kind === "dir") {
        const collapsed = state.collapsedDirs[child.path] === true;
        const row = document.createElement("button");
        row.type = "button";
        row.className =
          "group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] text-[#c9d1d9] hover:bg-[#21262d]";
        row.style.paddingLeft = `${depth * indentPx + 8}px`;
        row.innerHTML = `
          <svg class="h-4 w-4 shrink-0 text-[#8b949e] transition-transform ${collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="truncate">${escapeHtml(child.name)}</span>
        `;
        row.addEventListener("click", () => {
          state.collapsedDirs[child.path] = !collapsed;
          renderTree();
        });
        fileTreeEl.appendChild(row);
        if (!collapsed) renderTreeNode(child, depth + 1);
        continue;
      }

      const file = child.file;
      if (!file) continue;

      const count = getSubmittedCommentCount(file.id);
      const reviewed = isFileReviewed(file.id);
      const requestState = getRequestState(file.id, state.currentScope);
      const loading =
        requestState.requestId != null && requestState.contents == null;
      const errored = requestState.error != null;
      const status = getActiveStatus(file);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "group flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px]",
        file.id === state.activeFileId
          ? "bg-[#373e47] text-white"
          : reviewed
            ? "text-[#c9d1d9] hover:bg-[#21262d]"
            : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]",
      ].join(" ");
      button.style.paddingLeft = `${depth * indentPx + 26}px`;
      button.innerHTML = `
        <span class="flex min-w-0 items-center gap-1.5 truncate ${file.id === state.activeFileId ? "font-medium" : ""}">
          <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "●" : errored ? "!" : loading ? "…" : "●"}</span>
          <span class="truncate">${escapeHtml(child.name)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${statusBadgeClass(status)}">${statusLabel(status).charAt(0)}</span>` : ""}
        </span>
      `;
      button.addEventListener("click", () => openFile(file.id));
      fileTreeEl.appendChild(button);
    }
  }

  function renderCodeSearchResults(matches: ReviewCodeSearchMatch[]) {
    const heading = document.createElement("div");
    heading.className =
      "px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-review-muted";
    heading.textContent = "Code";
    fileTreeEl.appendChild(heading);

    matches.forEach((match) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "group mb-2 flex w-full items-start gap-3 rounded-md border border-review-border bg-[#010409] px-3 py-3 text-left hover:bg-[#11161d]";
      button.innerHTML = `
        <span class="mt-0.5 shrink-0 rounded-md border border-review-border bg-review-panel px-2 py-0.5 text-[10px] font-medium text-review-muted">${match.lineNumber}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[12px] font-medium text-review-text">${escapeHtml(match.path)}</span>
          <span class="mt-1 block line-clamp-2 break-words text-[12px] text-review-muted">${renderHighlightedLine(match)}</span>
        </span>
      `;
      button.addEventListener("click", () => openCodeSearchMatch(match));
      fileTreeEl.appendChild(button);
    });
  }

  function updateSidebarLayout(): void {
    const collapsed = state.sidebarCollapsed;
    sidebarEl.style.width = collapsed ? "0px" : "280px";
    sidebarEl.style.minWidth = collapsed ? "0px" : "280px";
    sidebarEl.style.flexBasis = collapsed ? "0px" : "280px";
    sidebarEl.style.borderRightWidth = collapsed ? "0px" : "1px";
    sidebarEl.style.pointerEvents = collapsed ? "none" : "auto";
    toggleSidebarButton.textContent = collapsed
      ? "Show sidebar"
      : "Hide sidebar";
  }

  function updateScopeButtons() {
    const counts = {
      diff: reviewDataFiles.filter((file) => file.inGitDiff).length,
      lastCommit: reviewDataFiles.filter((file) => file.inLastCommit).length,
      all: reviewDataFiles.filter((file) => file.hasWorkingTreeFile).length,
    };

    const applyButtonClasses = (
      button: HTMLButtonElement,
      active: boolean,
      disabled: boolean,
    ) => {
      button.disabled = disabled;
      button.className = disabled
        ? "cursor-default rounded-md border border-review-border bg-[#11161d] px-2.5 py-1 text-[11px] font-medium text-review-muted opacity-60"
        : active
          ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-2.5 py-1 text-[11px] font-medium text-[#3fb950] hover:bg-[#238636]/25"
          : "cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#21262d]";
    };

    scopeDiffButton.textContent = `Git diff${counts.diff > 0 ? ` (${counts.diff})` : ""}`;
    scopeLastCommitButton.textContent = `Last commit${counts.lastCommit > 0 ? ` (${counts.lastCommit})` : ""}`;
    scopeAllButton.textContent = `All files${counts.all > 0 ? ` (${counts.all})` : ""}`;

    applyButtonClasses(
      scopeDiffButton,
      state.currentScope === "git-diff",
      counts.diff === 0,
    );
    applyButtonClasses(
      scopeLastCommitButton,
      state.currentScope === "last-commit",
      counts.lastCommit === 0,
    );
    applyButtonClasses(
      scopeAllButton,
      state.currentScope === "all-files",
      counts.all === 0,
    );
  }

  function updateToggleButtons() {
    const file = activeFile();
    const reviewed = file ? isFileReviewed(file.id) : false;
    toggleReviewedButton.textContent = reviewed ? "Reviewed" : "Mark reviewed";
    toggleReviewedButton.className = reviewed
      ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-3 py-1 text-xs font-medium text-[#3fb950] hover:bg-[#238636]/25"
      : "cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]";
    toggleWrapButton.textContent = `Wrap lines: ${state.wrapLines ? "on" : "off"}`;
    toggleUnchangedButton.textContent = state.hideUnchanged
      ? "Show full file"
      : "Show changed areas only";
    toggleUnchangedButton.style.display = activeFileShowsDiff()
      ? "inline-flex"
      : "none";
    updateScopeButtons();
    modeHintEl.textContent = scopeHint(state.currentScope);
    sidebarStatusFilterEl.value = state.statusFilter;
    hideReviewedCheckboxEl.checked = state.hideReviewedFiles;
    commentedOnlyCheckboxEl.checked = state.showCommentedFilesOnly;
    changedOnlyCheckboxEl.checked = state.showChangedFilesOnly;
    submitButton.disabled = false;
  }

  function renderTree() {
    ensureActiveFileForScope();
    fileTreeEl.innerHTML = "";
    const scopedFiles = getScopedFiles();
    const visibleFiles = getFilteredFiles();
    const codeSearch = getCodeSearchState();
    const query = state.fileFilter.trim();

    if (visibleFiles.length === 0 && (!query || codeSearch.results.length === 0)) {
      const message = query
        ? `No code matches <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.`
        : `No files in <span class="text-review-text">${escapeHtml(scopeLabel(state.currentScope).toLowerCase())}</span>.`;
      fileTreeEl.innerHTML = `
        <div class="px-3 py-4 text-sm text-review-muted">
          ${message}
        </div>
      `;
    } else if (query) {
      if (codeSearch.searching) {
        const loading = document.createElement("div");
        loading.className = "px-3 py-3 text-sm text-review-muted";
        loading.textContent = "Searching code…";
        fileTreeEl.appendChild(loading);
      } else if (codeSearch.results.length > 0) {
        renderCodeSearchResults(codeSearch.results);
      } else if (query.length >= 2) {
        const empty = document.createElement("div");
        empty.className = "px-3 py-3 text-sm text-review-muted";
        empty.textContent = "No code matches found.";
        fileTreeEl.appendChild(empty);
      }
    } else {
      renderTreeNode(buildTree(visibleFiles), 0);
    }

    sidebarTitleEl.textContent = scopeLabel(state.currentScope);
    const comments = getSubmittedCommentCount();
    const filteredSuffix = state.fileFilter.trim()
      ? ` • ${codeSearch.results.length} code match(es)`
      : "";
    summaryEl.textContent = `${scopedFiles.length} file(s) • ${comments} comment(s)${state.overallComment ? " • overall note" : ""}${filteredSuffix}`;
    updateToggleButtons();
    updateSidebarLayout();
  }

  return {
    renderTree,
    updateSidebarLayout,
    updateScopeButtons,
    updateToggleButtons,
  };
}
