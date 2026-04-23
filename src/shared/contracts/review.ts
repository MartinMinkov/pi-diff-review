export type ReviewScope = "git-diff" | "last-commit" | "all-files";

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";

export interface ReviewFileComparison {
  status: ChangeStatus;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  hasOriginal: boolean;
  hasModified: boolean;
}

export interface ReviewFile {
  id: string;
  path: string;
  worktreeStatus: ChangeStatus | null;
  hasWorkingTreeFile: boolean;
  inGitDiff: boolean;
  inLastCommit: boolean;
  gitDiff: ReviewFileComparison | null;
  lastCommit: ReviewFileComparison | null;
}

export interface ReviewFileContents {
  originalContent: string;
  modifiedContent: string;
}

export type CommentSide = "original" | "modified" | "file";
export type DiffReviewCommentStatus = "draft" | "submitted";

export interface DiffReviewComment {
  id: string;
  fileId: string;
  scope: ReviewScope;
  side: CommentSide;
  startLine: number | null;
  endLine: number | null;
  body: string;
  status: DiffReviewCommentStatus;
  collapsed: boolean;
}

export interface ReviewSubmitPayload {
  type: "submit";
  overallComment: string;
  comments: DiffReviewComment[];
}

export interface ReviewCancelPayload {
  type: "cancel";
}

export interface ReviewRequestFilePayload {
  type: "request-file";
  requestId: string;
  fileId: string;
  scope: ReviewScope;
}

export type ReviewWindowMessage =
  | ReviewSubmitPayload
  | ReviewCancelPayload
  | ReviewRequestFilePayload;

export interface ReviewFileDataMessage {
  type: "file-data";
  requestId: string;
  fileId: string;
  scope: ReviewScope;
  originalContent: string;
  modifiedContent: string;
}

export interface ReviewFileErrorMessage {
  type: "file-error";
  requestId: string;
  fileId: string;
  scope: ReviewScope;
  message: string;
}

export type ReviewHostMessage = ReviewFileDataMessage | ReviewFileErrorMessage;

export interface ReviewGoModule {
  rootPath: string;
  modulePath: string;
}

export interface ReviewWindowData {
  repoRoot: string;
  files: ReviewFile[];
  goModules: ReviewGoModule[];
}
