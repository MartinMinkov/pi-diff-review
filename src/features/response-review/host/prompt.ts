import type {
  ResponseReviewComment,
  ResponseReviewResponse,
  ResponseReviewSubmitPayload,
} from "../shared/contracts/response-review.js";

function excerpt(text: string, max = 700): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function formatComment(comment: ResponseReviewComment, index: number): string {
  const location =
    comment.startOffset !== undefined && comment.endOffset !== undefined
      ? `offsets ${comment.startOffset}-${comment.endOffset}`
      : "selected excerpt";

  return [
    `### ${index + 1}. ${comment.kind} (${location})`,
    "",
    "> Selected text:",
    excerpt(comment.selectedText)
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n"),
    "",
    "Feedback:",
    comment.comment.trim(),
  ].join("\n");
}

export function composeResponseReviewPrompt(
  responses: ResponseReviewResponse[],
  payload: ResponseReviewSubmitPayload,
): string {
  const activeResponse =
    responses.find((response) => response.id === payload.activeResponseId) ?? responses.at(-1);
  const scopedComments = payload.comments.filter(
    (comment) => comment.responseId === payload.activeResponseId,
  );
  const otherComments = payload.comments.filter(
    (comment) => comment.responseId !== payload.activeResponseId,
  );

  const sections = [
    "I reviewed your previous assistant response in the response review workspace. Please incorporate the feedback below in your next answer.",
  ];

  if (activeResponse) {
    sections.push(`Response under review: ${activeResponse.title} (${activeResponse.id})`);
  }

  if (payload.overallComment.trim()) {
    sections.push(["## Overall feedback", "", payload.overallComment.trim()].join("\n"));
  }

  if (scopedComments.length > 0) {
    sections.push(
      ["## Anchored comments", "", ...scopedComments.map(formatComment)].join("\n\n"),
    );
  }

  if (otherComments.length > 0) {
    sections.push(
      [
        "## Comments on other assistant responses in this session",
        "",
        ...otherComments.map((comment, index) => {
          const response = responses.find((item) => item.id === comment.responseId);
          return [`### ${index + 1}. ${response?.title ?? comment.responseId}`, formatComment(comment, index)].join("\n\n");
        }),
      ].join("\n\n"),
    );
  }

  if (payload.draft.trim()) {
    sections.push(["## Additional draft / next prompt", "", payload.draft.trim()].join("\n"));
  }

  if (!payload.overallComment.trim() && scopedComments.length === 0 && !payload.draft.trim()) {
    sections.push("No specific feedback was entered. Ask me what I would like to review next.");
  }

  return sections.join("\n\n");
}
