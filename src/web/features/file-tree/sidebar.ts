import {
  buildTree,
  getBaseName,
  getFileSearchPath,
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
  getActiveStatus: (file: ReviewFile | null) => ChangeStatus | null;
  activeFile: () => ReviewFile | null;
  openFile: (fileId: string) => void;
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
  } = options;

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

      const count = state.comments.filter(
        (comment) =>
          comment.fileId === file.id && comment.scope === state.currentScope,
      ).length;
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

  function renderSearchResults(files: ReviewFile[]) {
    files.forEach((file) => {
      const path = getFileSearchPath(file);
      const baseName = getBaseName(path);
      const parentPath = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : "";
      const count = state.comments.filter(
        (comment) =>
          comment.fileId === file.id && comment.scope === state.currentScope,
      ).length;
      const reviewed = isFileReviewed(file.id);
      const requestState = getRequestState(file.id, state.currentScope);
      const loading =
        requestState.requestId != null && requestState.contents == null;
      const errored = requestState.error != null;
      const status = getActiveStatus(file);
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left",
        file.id === state.activeFileId
          ? "bg-[#373e47] text-white"
          : "text-[#c9d1d9] hover:bg-[#21262d]",
      ].join(" ");
      button.innerHTML = `
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "●" : errored ? "!" : loading ? "…" : "●"}</span>
            <span class="truncate text-[13px] ${file.id === state.activeFileId ? "font-medium" : ""}>${escapeHtml(baseName)}</span>
          </span>
          <span class="mt-0.5 block truncate pl-[14px] text-[11px] ${file.id === state.activeFileId ? "text-[#c9d1d9]" : "text-review-muted"}">${escapeHtml(parentPath || path)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${statusBadgeClass(status)}">${statusLabel(status).charAt(0)}</span>` : ""}
        </span>
      `;
      button.addEventListener("click", () => openFile(file.id));
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
    submitButton.disabled = false;
  }

  function renderTree() {
    ensureActiveFileForScope();
    fileTreeEl.innerHTML = "";
    const scopedFiles = getScopedFiles();
    const visibleFiles = getFilteredFiles();

    if (visibleFiles.length === 0) {
      const message = state.fileFilter.trim()
        ? `No files match <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.`
        : `No files in <span class="text-review-text">${escapeHtml(scopeLabel(state.currentScope).toLowerCase())}</span>.`;
      fileTreeEl.innerHTML = `
        <div class="px-3 py-4 text-sm text-review-muted">
          ${message}
        </div>
      `;
    } else if (state.fileFilter.trim()) {
      renderSearchResults(visibleFiles);
    } else {
      renderTreeNode(buildTree(visibleFiles), 0);
    }

    sidebarTitleEl.textContent = scopeLabel(state.currentScope);
    const comments = state.comments.length;
    const filteredSuffix = state.fileFilter.trim()
      ? ` • ${visibleFiles.length} shown`
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
