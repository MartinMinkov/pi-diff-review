import type {
  DiffReviewComment,
  ReviewFile,
  ReviewFileContents,
  ReviewScope,
} from "../contracts/review.js";

export interface ReviewState {
  activeFileId: string | null;
  currentScope: ReviewScope;
  comments: DiffReviewComment[];
  overallComment: string;
  hideUnchanged: boolean;
  wrapLines: boolean;
  collapsedDirs: Record<string, boolean>;
  reviewedFiles: Record<string, boolean>;
  scrollPositions: Record<string, ReviewFileScrollState>;
  sidebarCollapsed: boolean;
  fileFilter: string;
  fileContents: Record<string, ReviewFileContents>;
  fileErrors: Record<string, string>;
  pendingRequestIds: Record<string, string>;
}

export interface ReviewFileScrollState {
  originalTop: number;
  originalLeft: number;
  modifiedTop: number;
  modifiedLeft: number;
}

export interface ReviewMountOptions {
  restoreFileScroll?: boolean;
  preserveScroll?: boolean;
}

export function createInitialReviewState(reviewData: {
  files: ReviewFile[];
}): ReviewState {
  return {
    activeFileId: null,
    currentScope: reviewData.files.some((file) => file.inGitDiff)
      ? "git-diff"
      : reviewData.files.some((file) => file.inLastCommit)
        ? "last-commit"
        : "all-files",
    comments: [],
    overallComment: "",
    hideUnchanged: false,
    wrapLines: true,
    collapsedDirs: {},
    reviewedFiles: {},
    scrollPositions: {},
    sidebarCollapsed: false,
    fileFilter: "",
    fileContents: {},
    fileErrors: {},
    pendingRequestIds: {},
  };
}
