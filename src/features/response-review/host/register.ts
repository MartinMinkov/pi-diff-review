import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  createNativeWindowState,
  runNativeWindowSession,
  type NativeWindowSessionApi,
} from "../../../shared/host/native-window-session.js";
import type {
  ResponseReviewCancelPayload,
  ResponseReviewHostMessage,
  ResponseReviewSubmitPayload,
  ResponseReviewWindowMessage,
} from "../shared/contracts/response-review.js";
import { composeResponseReviewPrompt } from "./prompt.js";
import { getAssistantResponses } from "./session.js";
import { buildResponseReviewHtml } from "./ui.js";

type ResponseReviewResult = ResponseReviewSubmitPayload | ResponseReviewCancelPayload;

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

function sendWindowMessage(
  api: NativeWindowSessionApi<ResponseReviewResult>,
  message: ResponseReviewHostMessage,
): void {
  api.send("__responseReviewReceive", message);
}

export default function registerResponseReview(pi: ExtensionAPI): void {
  const windowState = createNativeWindowState();

  async function openResponseReview(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) {
      ctx.ui.notify("/response-review requires interactive mode", "error");
      return;
    }

    const responses = getAssistantResponses(ctx);
    if (responses.length === 0) {
      ctx.ui.notify("No assistant responses found.", "warning");
      return;
    }

    const result = await runNativeWindowSession<ResponseReviewResult>({
      ctx,
      state: windowState,
      html: buildResponseReviewHtml({
        responses,
        initialResponseId: responses.at(-1)?.id,
      }),
      window: {
        width: 1500,
        height: 980,
        title: "pi response review",
      },
      waiting: {
        title: "Waiting for response review",
        message: "The native response review window is open.",
      },
      messages: {
        busy: "A response review window is already open.",
        opened: "Opened native response review window.",
        cancelled: "Response review cancelled.",
        openErrorPrefix: "Could not open response review window",
        failurePrefix: "Response review failed",
      },
      onMessage(data, api) {
        const message = data as ResponseReviewWindowMessage;
        if (isSubmitPayload(message)) {
          sendWindowMessage(api, {
            type: "submit-ack",
            requestId: message.requestId,
            commentCount: message.comments.length,
            hasOverallComment: message.overallComment.trim().length > 0,
            hasDraft: message.draft.trim().length > 0,
          });
          setTimeout(() => {
            api.settle(message);
            api.closeWindow();
          }, 40);
          return;
        }

        if (isCancelPayload(message)) {
          api.settle(message);
          api.closeWindow();
        }
      },
    });

    if (result.type !== "message") return;
    if (result.message.type === "cancel") {
      ctx.ui.notify("Response review cancelled.", "info");
      return;
    }

    const prompt = composeResponseReviewPrompt(responses, result.message);
    ctx.ui.setEditorText(prompt);
    ctx.ui.notify("Inserted response feedback into the editor.", "info");
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
    windowState.shutdown();
  });
}
