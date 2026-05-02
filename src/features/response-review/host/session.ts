import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ResponseReviewResponse } from "../shared/contracts/response-review.js";

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part: unknown): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        "text" in part &&
        part.type === "text" &&
        typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function previewFor(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized;
}

function titleFor(index: number, timestamp?: number): string {
  if (!timestamp) return `Assistant response ${index + 1}`;
  const date = new Date(timestamp);
  return `Assistant response ${index + 1} · ${date.toLocaleString()}`;
}

function getMessageTimestamp(message: unknown): number | undefined {
  if (typeof message !== "object" || message === null || !("timestamp" in message)) return undefined;
  const value = (message as { timestamp?: unknown }).timestamp;
  return typeof value === "number" ? value : undefined;
}

export function getAssistantResponses(ctx: ExtensionContext): ResponseReviewResponse[] {
  const responses: ResponseReviewResponse[] = [];

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry?.type !== "message") continue;

    const message = entry.message;
    if (!message || message.role !== "assistant") continue;

    const text = textFromContent(message.content);
    if (!text) continue;

    const timestamp = getMessageTimestamp(message);
    responses.push({
      id: entry.id,
      title: titleFor(responses.length, timestamp),
      preview: previewFor(text),
      text,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  return responses;
}
