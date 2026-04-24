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

export type ReviewNavigationSide = "original" | "modified";

export interface ReviewNavigationRequest {
  fileId: string;
  scope: ReviewScope;
  side: ReviewNavigationSide;
  sourcePath: string;
  languageId: string;
  content: string;
  lineNumber: number;
  column: number;
}

export interface ReviewNavigationTarget {
  fileId: string;
  scope: ReviewScope;
  side: ReviewNavigationSide;
  line: number;
  column: number;
}

export type CommentSide = "original" | "modified" | "file";
export type DiffReviewCommentStatus = "draft" | "submitted";
export type DiffReviewCommentKind =
  | "feedback"
  | "question"
  | "risk"
  | "explain"
  | "tests";

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
  kind?: DiffReviewCommentKind;
  anchorPath?: string;
  anchorText?: string;
}

export interface ReviewSubmitPayload {
  type: "submit";
  requestId: string;
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

export interface ReviewRequestDefinitionPayload {
  type: "request-definition";
  requestId: string;
  request: ReviewNavigationRequest;
}

export interface ReviewRequestReferencesPayload {
  type: "request-references";
  requestId: string;
  request: ReviewNavigationRequest;
}

export type ReviewWindowMessage =
  | ReviewSubmitPayload
  | ReviewCancelPayload
  | ReviewRequestFilePayload
  | ReviewRequestDefinitionPayload
  | ReviewRequestReferencesPayload;

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

export interface ReviewDefinitionDataMessage {
  type: "definition-data";
  requestId: string;
  target: ReviewNavigationTarget | null;
}

export interface ReviewDefinitionErrorMessage {
  type: "definition-error";
  requestId: string;
  message: string;
}

export interface ReviewReferencesDataMessage {
  type: "references-data";
  requestId: string;
  targets: ReviewNavigationTarget[];
}

export interface ReviewReferencesErrorMessage {
  type: "references-error";
  requestId: string;
  message: string;
}

export interface ReviewSubmitAckMessage {
  type: "submit-ack";
  requestId: string;
  commentCount: number;
  hasOverallComment: boolean;
}

export type ReviewHostMessage =
  | ReviewFileDataMessage
  | ReviewFileErrorMessage
  | ReviewDefinitionDataMessage
  | ReviewDefinitionErrorMessage
  | ReviewReferencesDataMessage
  | ReviewReferencesErrorMessage
  | ReviewSubmitAckMessage;

export interface ReviewGoModule {
  rootPath: string;
  modulePath: string;
}

export interface ReviewWindowData {
  repoRoot: string;
  files: ReviewFile[];
  goModules: ReviewGoModule[];
}
