import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { open, type GlimpseWindow } from "glimpseui";
import { showNativeWindowWaitingUI } from "../../../shared/host/waiting-ui.js";
import type {
  ResponseReviewCancelPayload,
  ResponseReviewHostMessage,
  ResponseReviewSubmitPayload,
  ResponseReviewWindowMessage,
} from "../shared/contracts/response-review.js";
import { composeResponseReviewPrompt } from "./prompt.js";
import { getAssistantResponses } from "./session.js";
import { buildResponseReviewHtml } from "./ui.js";

function isSubmitPayload(
  value: ResponseReviewWindowMessage,
): value is ResponseReviewSubmitPayload {
  return value.type === "submit";
}

function isCancelPayload(
  value: ResponseReviewWindowMessage,
): value is ResponseReviewCancelPayload {
  return value.type === "cancel";
}

function escapeForInlineScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export default function registerResponseReview(pi: ExtensionAPI): void {
  let activeWindow: GlimpseWindow | null = null;
  let activeWaitingUIDismiss: (() => void) | null = null;

  function closeActiveWindow(): void {
    if (activeWindow == null) return;
    const windowToClose = activeWindow;
    activeWindow = null;
    try {
      windowToClose.close();
    } catch {
      // Ignore close errors while tearing down the response review window.
    }
  }

  async function openResponseReview(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) {
      ctx.ui.notify("/response-review requires interactive mode", "error");
      return;
    }

    if (activeWindow != null) {
      ctx.ui.notify("A response review window is already open.", "warning");
      return;
    }

    const responses = getAssistantResponses(ctx);
    if (responses.length === 0) {
      ctx.ui.notify("No assistant responses found.", "warning");
      return;
    }

    const html = buildResponseReviewHtml({
      responses,
      initialResponseId: responses.at(-1)?.id,
    });

    let window: GlimpseWindow;
    try {
      window = open(html, {
        width: 1500,
        height: 980,
        title: "pi response review",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Could not open response review window: ${message}`, "error");
      return;
    }

    activeWindow = window;

    const closeResponseWindow = (): void => {
      if (activeWindow === window) {
        activeWindow = null;
      }
      try {
        window.close();
      } catch {
        // Ignore close errors while tearing down the response review window.
      }
    };

    const waitingUI = showNativeWindowWaitingUI(ctx, {
      title: "Waiting for response review",
      message: "The native response review window is open.",
      onDismiss: (dismiss) => {
        activeWaitingUIDismiss = dismiss;
      },
    });

    const sendWindowMessage = (message: ResponseReviewHostMessage): void => {
      if (activeWindow !== window) return;
      const payload = escapeForInlineScript(JSON.stringify(message));
      window.send(`window.__responseReviewReceive(${payload});`);
    };

    ctx.ui.notify("Opened native response review window.", "info");

    try {
      const terminalMessagePromise = new Promise<
        ResponseReviewSubmitPayload | ResponseReviewCancelPayload | null
      >((resolve, reject) => {
        let settled = false;

        const cleanup = (): void => {
          window.removeListener("message", onMessage);
          window.removeListener("closed", onClosed);
          window.removeListener("error", onError);
          if (activeWindow === window) {
            activeWindow = null;
          }
        };

        const settle = (
          value: ResponseReviewSubmitPayload | ResponseReviewCancelPayload | null,
        ): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };

        const onMessage = (data: unknown): void => {
          const message = data as ResponseReviewWindowMessage;
          if (isSubmitPayload(message)) {
            sendWindowMessage({
              type: "submit-ack",
              requestId: message.requestId,
              commentCount: message.comments.length,
              hasOverallComment: message.overallComment.trim().length > 0,
              hasDraft: message.draft.trim().length > 0,
            });
            setTimeout(() => {
              settle(message);
              closeResponseWindow();
            }, 40);
            return;
          }

          if (isCancelPayload(message)) {
            settle(message);
            closeResponseWindow();
          }
        };

        const onClosed = (): void => {
          settle(null);
        };

        const onError = (error: Error): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        window.on("message", onMessage);
        window.on("closed", onClosed);
        window.on("error", onError);
      });

      const result = await Promise.race([
        terminalMessagePromise.then((message) => ({
          type: "window" as const,
          message,
        })),
        waitingUI.promise.then((reason) => ({ type: "ui" as const, reason })),
      ]);

      if (result.type === "ui" && result.reason === "escape") {
        closeResponseWindow();
        await terminalMessagePromise.catch(() => null);
        ctx.ui.notify("Response review cancelled.", "info");
        return;
      }

      const message =
        result.type === "window" ? result.message : await terminalMessagePromise;

      activeWaitingUIDismiss = null;
      waitingUI.dismiss();
      closeResponseWindow();
      await waitingUI.promise;

      if (message == null || message.type === "cancel") {
        ctx.ui.notify("Response review cancelled.", "info");
        return;
      }

      const prompt = composeResponseReviewPrompt(responses, message);
      ctx.ui.setEditorText(prompt);
      ctx.ui.notify("Inserted response feedback into the editor.", "info");
    } catch (error) {
      activeWaitingUIDismiss?.();
      activeWaitingUIDismiss = null;
      closeActiveWindow();
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Response review failed: ${message}`, "error");
    }
  }

  pi.registerCommand("response-review", {
    description: "Open a native workspace for reviewing assistant responses",
    handler: async (_args, ctx) => {
      await openResponseReview(ctx);
    },
  });

  pi.registerCommand("head", {
    description: "Alias for /response-review",
    handler: async (_args, ctx) => {
      await openResponseReview(ctx);
    },
  });

  pi.registerShortcut("alt+shift+h", {
    description: "Open response review for assistant responses",
    handler: async (ctx) => {
      await openResponseReview(ctx);
    },
  });

  pi.on("session_shutdown", async () => {
    activeWaitingUIDismiss?.();
    activeWaitingUIDismiss = null;
    closeActiveWindow();
  });
}
