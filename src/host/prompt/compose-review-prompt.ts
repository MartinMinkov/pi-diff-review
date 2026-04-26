import type {
  DiffReviewComment,
  DiffReviewCommentKind,
  ReviewFile,
  ReviewScope,
  ReviewSubmitPayload,
} from "../../shared/contracts/review.js";

function formatScopeLabel(scope: ReviewScope): string {
  switch (scope) {
    case "git-diff":
      return "git diff";
    case "last-commit":
      return "last commit";
    default:
      return "all files";
  }
}

function getCommentFilePath(
  file: ReviewFile | undefined,
  scope: ReviewScope,
): string {
  if (file == null) return "(unknown file)";
  const comparison =
    scope === "git-diff"
      ? file.gitDiff
      : scope === "last-commit"
        ? file.lastCommit
        : null;
  return comparison?.displayPath ?? file.path;
}

function formatLocation(
  comment: DiffReviewComment,
  file: ReviewFile | undefined,
): string {
  const filePath = getCommentFilePath(file, comment.scope);
  const scopePrefix = `[${formatScopeLabel(comment.scope)}] `;

  if (comment.side === "file" || comment.startLine == null) {
    return `${scopePrefix}${filePath}`;
  }

  const range =
    comment.endLine != null && comment.endLine !== comment.startLine
      ? `${comment.startLine}-${comment.endLine}`
      : `${comment.startLine}`;

  if (comment.scope === "all-files") {
    return `${scopePrefix}${filePath}:${range}`;
  }

  const suffix = comment.side === "original" ? " (old)" : " (new)";
  return `${scopePrefix}${filePath}:${range}${suffix}`;
}

function formatCommentKind(kind: DiffReviewCommentKind | undefined): string {
  switch (kind) {
    case "question":
      return "Question";
    case "risk":
      return "Risk";
    case "explain":
      return "Explain";
    case "tests":
      return "Tests";
    default:
      return "Feedback";
  }
}

function appendReviewInstructions(lines: string[]): void {
  lines.push("Please address the following code review.");
  lines.push("");
  lines.push("Follow the review tags exactly:");
  lines.push("");
  lines.push(
    "- [Question]: Answer the question. Do not modify code for this comment.",
  );
  lines.push(
    "- [Explain]: Explain the relevant behavior, tradeoff, or design. Do not modify code for this comment.",
  );
  lines.push("- [Feedback]: Implement the requested change if it is valid.");
  lines.push(
    "- [Risk]: Investigate the risk. If valid, fix it; if not valid, explain why.",
  );
  lines.push(
    "- [Tests]: Add or update tests if appropriate. If tests are not practical, explain why.",
  );
  lines.push("");
  lines.push("Workflow:");
  lines.push("");
  lines.push("1. Read the relevant files before making claims or changes.");
  lines.push(
    "2. Keep changes scoped to the review comments. Do not refactor unrelated code.",
  );
  lines.push("3. Preserve existing project conventions and user changes.");
  lines.push(
    "4. If a comment is ambiguous, make the smallest reasonable interpretation and note your assumption.",
  );
  lines.push(
    "5. If comments conflict, stop and explain the conflict instead of guessing.",
  );
  lines.push("6. After code changes, run the most relevant available checks or tests.");
  lines.push(
    "7. In your final response, report each review comment as Fixed, Answered, Explained, Not changed, or Blocked.",
  );
  lines.push("");
  lines.push("Review comments:");
  lines.push("");
}

export function composeReviewPrompt(
  files: ReviewFile[],
  payload: ReviewSubmitPayload,
): string {
  const fileMap = new Map(files.map((file) => [file.id, file]));
  const lines: string[] = [];

  appendReviewInstructions(lines);

  const overallComment = payload.overallComment.trim();
  if (overallComment.length > 0) {
    lines.push(`0. [${formatCommentKind(payload.overallCommentKind)}] [overall]`);
    lines.push(`   ${overallComment}`);
    lines.push("");
  }

  payload.comments.forEach((comment, index) => {
    const file = fileMap.get(comment.fileId);
    lines.push(
      `${index + 1}. [${formatCommentKind(comment.kind)}] ${formatLocation(comment, file)}`,
    );
    lines.push(`   ${comment.body.trim()}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}
