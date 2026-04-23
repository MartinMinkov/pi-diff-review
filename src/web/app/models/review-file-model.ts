import type {
  ChangeStatus,
  DiffReviewComment,
  ReviewFile,
  ReviewNavigationSide,
  ReviewScope,
} from "../../shared/contracts/review.js";
import type { ReviewState } from "../../shared/state/review-state.js";

interface ReviewFileModelOptions {
  reviewDataFiles: ReviewFile[];
  state: ReviewState;
  isFileReviewed: (fileId: string) => boolean;
  isCommentResolved: (comment: DiffReviewComment) => boolean;
}

export interface ReviewFileModel {
  getScopedFiles: () => ReviewFile[];
  ensureActiveFileForScope: () => void;
  activeFile: () => ReviewFile | null;
  getScopeComparison: (
    file: ReviewFile | null,
    scope?: ReviewScope,
  ) => ReviewFile["gitDiff"];
  activeComparison: () => ReviewFile["gitDiff"];
  activeFileShowsDiff: () => boolean;
  getScopeFilePath: (file: ReviewFile | null) => string;
  getScopeDisplayPath: (file: ReviewFile | null, scope?: ReviewScope) => string;
  getScopeSidePath: (
    file: ReviewFile | null,
    scope: ReviewScope,
    side: ReviewNavigationSide,
  ) => string;
  getActiveStatus: (file: ReviewFile | null) => ChangeStatus | null;
  getFilteredFiles: () => ReviewFile[];
}

export function createReviewFileModel(
  options: ReviewFileModelOptions,
): ReviewFileModel {
  const { reviewDataFiles, state, isFileReviewed, isCommentResolved } = options;

  function getScopedFiles(): ReviewFile[] {
    switch (state.currentScope) {
      case "git-diff":
        return reviewDataFiles.filter((file) => file.inGitDiff);
      case "last-commit":
        return reviewDataFiles.filter((file) => file.inLastCommit);
      default:
        return reviewDataFiles.filter((file) => file.hasWorkingTreeFile);
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
    return reviewDataFiles.find((file) => file.id === state.activeFileId) ?? null;
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
    return getScopedFiles().filter((file) => {
      if (state.showChangedFilesOnly) {
        const changed =
          file.worktreeStatus != null || file.inGitDiff || file.inLastCommit;
        if (!changed) return false;
      }

      if (state.statusFilter !== "all") {
        const status = getActiveStatus(file) ?? file.worktreeStatus;
        if (status !== state.statusFilter) return false;
      }

      if (state.hideReviewedFiles && isFileReviewed(file.id)) {
        return false;
      }

      if (state.showCommentedFilesOnly) {
        const hasComments = state.comments.some(
          (comment) =>
            comment.fileId === file.id &&
            comment.scope === state.currentScope &&
            comment.status === "submitted" &&
            !isCommentResolved(comment),
        );
        if (!hasComments) return false;
      }

      return true;
    });
  }

  return {
    getScopedFiles,
    ensureActiveFileForScope,
    activeFile,
    getScopeComparison,
    activeComparison,
    activeFileShowsDiff,
    getScopeFilePath,
    getScopeDisplayPath,
    getScopeSidePath,
    getActiveStatus,
    getFilteredFiles,
  };
}
