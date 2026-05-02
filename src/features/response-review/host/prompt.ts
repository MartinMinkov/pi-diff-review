import type {
  ResponseReviewComment,
  ResponseReviewCommentKind,
  ResponseReviewResponse,
  ResponseReviewSubmitPayload,
} from "../shared/contracts/response-review.js";

function formatCommentKind(kind: ResponseReviewCommentKind | undefined): string {
  switch (kind) {
    case "question":
      return "Question";
    case "correction":
      return "Correction";
    case "preference":
      return "Preference";
    case "follow-up":
      return "Follow-up";
    default:
      return "Feedback";
  }
}

function excerpt(text: string, max = 700): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function formatLocation(
  comment: ResponseReviewComment,
  response: ResponseReviewResponse | undefined,
): string {
  const responseLabel = response?.title ?? comment.responseId;
  const range =
    comment.startOffset !== undefined && comment.endOffset !== undefined
      ? ` offsets ${comment.startOffset}-${comment.endOffset}`
      : " selected excerpt";
  return `[${responseLabel}]${range}`;
}

function appendResponseReviewInstructions(lines: string[]): void {
  lines.push("Please address the following response review.");
  lines.push("");
  lines.push("The quoted excerpts are anchors into your previous assistant response. Use them to understand what the feedback refers to; do not assume the excerpt is the complete context.");
  lines.push("");
  lines.push("Follow the review tags exactly:");
  lines.push("");
  lines.push("- [Question]: Answer the question directly. Do not make code changes unless explicitly requested.");
  lines.push("- [Correction]: Correct or retract the prior statement, assumption, plan, or code suggestion.");
  lines.push("- [Preference]: Adapt the approach, tone, structure, or tradeoff to match the stated preference.");
  lines.push("- [Follow-up]: Expand on the requested point or continue the investigation.");
  lines.push("- [Feedback]: Incorporate the requested change if it is valid.");
  lines.push("");
  lines.push("Workflow:");
  lines.push("");
  lines.push("1. Address every review comment explicitly and keep the response scoped to this feedback.");
  lines.push("2. Preserve correct parts of the previous response; only revise what the comments target.");
  lines.push("3. If feedback asks for code changes or file-specific claims, read the relevant files before making claims or edits.");
  lines.push("4. If a comment is ambiguous, make the smallest reasonable interpretation and state your assumption.");
  lines.push("5. If comments conflict, stop and explain the conflict instead of guessing.");
  lines.push("6. In your final response, report each review comment as Addressed, Answered, Corrected, Applied, Not changed, or Blocked.");
  lines.push("");
  lines.push("Response review comments:");
  lines.push("");
}

function appendComment(
  lines: string[],
  index: number,
  comment: ResponseReviewComment,
  response: ResponseReviewResponse | undefined,
): void {
  lines.push(
    `${index}. [${formatCommentKind(comment.kind)}] ${formatLocation(comment, response)}`,
  );
  lines.push("   Excerpt:");
  for (const line of excerpt(comment.selectedText).split("\n")) {
    lines.push(`   > ${line}`);
  }
  lines.push("   Feedback:");
  for (const line of comment.comment.trim().split("\n")) {
    lines.push(`   ${line}`);
  }
  lines.push("");
}

export function composeResponseReviewPrompt(
  responses: ResponseReviewResponse[],
  payload: ResponseReviewSubmitPayload,
): string {
  const responseMap = new Map(responses.map((response) => [response.id, response]));
  const activeResponse = responseMap.get(payload.activeResponseId) ?? responses.at(-1);
  const lines: string[] = [];

  appendResponseReviewInstructions(lines);

  if (activeResponse) {
    lines.push(`Response under review: ${activeResponse.title} (${activeResponse.id})`);
    lines.push("");
  }

  const overallComment = payload.overallComment.trim();
  if (overallComment.length > 0) {
    lines.push("0. [Feedback] [overall]");
    for (const line of overallComment.split("\n")) {
      lines.push(`   ${line}`);
    }
    lines.push("");
  }

  payload.comments.forEach((comment, index) => {
    appendComment(lines, index + 1, comment, responseMap.get(comment.responseId));
  });

  const draft = payload.draft.trim();
  if (draft.length > 0) {
    lines.push("Additional user draft / next prompt:");
    lines.push("");
    lines.push(draft);
    lines.push("");
  }

  if (overallComment.length === 0 && payload.comments.length === 0 && draft.length === 0) {
    lines.push("No specific feedback was entered. Ask me what I would like to review next.");
  }

  return lines.join("\n").trim();
}
