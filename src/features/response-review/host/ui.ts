import type { ResponseReviewWindowData } from "../shared/contracts/response-review.js";
import { buildInlineWebAppHtml } from "../../../shared/host/html.js";

export function buildResponseReviewHtml(data: ResponseReviewWindowData): string {
  return buildInlineWebAppHtml("response-review", data);
}
