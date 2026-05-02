import type { ReviewWindowData } from "../../shared/contracts/review.js";
import { buildInlineWebAppHtml } from "../../../../shared/host/html.js";

export function buildReviewHtml(data: ReviewWindowData): string {
  return buildInlineWebAppHtml("diff-review", data);
}
