import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
  createNativeWindowState,
  runNativeWindowSession,
  type NativeWindowSessionApi,
} from "../../../shared/host/native-window-session.js";
import { ReviewNavigationService } from "./navigation/service.js";
import { composeReviewPrompt } from "./prompt/compose-review-prompt.js";
import {
  getReviewWindowData,
  loadReviewFileContents,
} from "./repo/review-window-data.js";
import type {
  ReviewCancelPayload,
  ReviewFile,
  ReviewFileContents,
  ReviewHostMessage,
  ReviewRequestDefinitionPayload,
  ReviewRequestFilePayload,
  ReviewRequestReferencesPayload,
  ReviewSubmitPayload,
  ReviewWindowMessage,
} from "../shared/contracts/review.js";
import { buildReviewHtml } from "./ui/build-review-html.js";

type DiffReviewResult = ReviewSubmitPayload | ReviewCancelPayload;

function isSubmitPayload(
  value: ReviewWindowMessage,
): value is ReviewSubmitPayload {
  return value.type === "submit";
}

function isCancelPayload(
  value: ReviewWindowMessage,
): value is ReviewCancelPayload {
  return value.type === "cancel";
}

function isRequestFilePayload(
  value: ReviewWindowMessage,
): value is ReviewRequestFilePayload {
  return value.type === "request-file";
}

function isRequestDefinitionPayload(
  value: ReviewWindowMessage,
): value is ReviewRequestDefinitionPayload {
  return value.type === "request-definition";
}

function isRequestReferencesPayload(
  value: ReviewWindowMessage,
): value is ReviewRequestReferencesPayload {
  return value.type === "request-references";
}

function sendReviewMessage(
  api: NativeWindowSessionApi<DiffReviewResult>,
  message: ReviewHostMessage,
): void {
  api.send("__reviewReceive", message);
}

export default function registerDiffReview(pi: ExtensionAPI): void {
  const windowState = createNativeWindowState();

  async function reviewRepository(ctx: ExtensionCommandContext): Promise<void> {
    if (windowState.hasActiveWindow()) {
      ctx.ui.notify("A review window is already open.", "warning");
      return;
    }

    const { repoRoot, files, goModules } = await getReviewWindowData(pi, ctx.cwd);
    if (files.length === 0) {
      ctx.ui.notify("No reviewable files found.", "info");
      return;
    }

    const fileMap = new Map(files.map((file) => [file.id, file]));
    const contentCache = new Map<string, Promise<ReviewFileContents>>();
    const navigationService = new ReviewNavigationService(repoRoot, files);

    const loadContents = (
      file: ReviewFile,
      scope: ReviewRequestFilePayload["scope"],
    ): Promise<ReviewFileContents> => {
      const cacheKey = `${scope}:${file.id}`;
      const cached = contentCache.get(cacheKey);
      if (cached != null) return cached;

      const pending = loadReviewFileContents(pi, repoRoot, file, scope);
      contentCache.set(cacheKey, pending);
      return pending;
    };

    const handleRequestFile = async (
      message: ReviewRequestFilePayload,
      api: NativeWindowSessionApi<DiffReviewResult>,
    ): Promise<void> => {
      const file = fileMap.get(message.fileId);
      if (file == null) {
        sendReviewMessage(api, {
          type: "file-error",
          requestId: message.requestId,
          fileId: message.fileId,
          scope: message.scope,
          message: "Unknown file requested.",
        });
        return;
      }

      try {
        const contents = await loadContents(file, message.scope);
        sendReviewMessage(api, {
          type: "file-data",
          requestId: message.requestId,
          fileId: message.fileId,
          scope: message.scope,
          originalContent: contents.originalContent,
          modifiedContent: contents.modifiedContent,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        sendReviewMessage(api, {
          type: "file-error",
          requestId: message.requestId,
          fileId: message.fileId,
          scope: message.scope,
          message: messageText,
        });
      }
    };

    const handleRequestDefinition = (
      message: ReviewRequestDefinitionPayload,
      api: NativeWindowSessionApi<DiffReviewResult>,
    ): void => {
      void (async () => {
        try {
          const target = await navigationService.resolveDefinition(message.request);
          sendReviewMessage(api, {
            type: "definition-data",
            requestId: message.requestId,
            target,
          });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          sendReviewMessage(api, {
            type: "definition-error",
            requestId: message.requestId,
            message: messageText,
          });
        }
      })();
    };

    const handleRequestReferences = (
      message: ReviewRequestReferencesPayload,
      api: NativeWindowSessionApi<DiffReviewResult>,
    ): void => {
      void (async () => {
        try {
          const targets = await navigationService.resolveReferences(message.request);
          sendReviewMessage(api, {
            type: "references-data",
            requestId: message.requestId,
            targets,
          });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          sendReviewMessage(api, {
            type: "references-error",
            requestId: message.requestId,
            message: messageText,
          });
        }
      })();
    };

    const result = await runNativeWindowSession<DiffReviewResult>({
      ctx,
      state: windowState,
      html: buildReviewHtml({ repoRoot, files, goModules }),
      window: {
        width: 1680,
        height: 1020,
        title: "pi review",
      },
      waiting: {
        title: "Waiting for review",
        message: "The native review window is open.",
      },
      messages: {
        busy: "A review window is already open.",
        opened: "Opened native review window.",
        cancelled: "Review cancelled.",
        openErrorPrefix: "Could not open review window",
        failurePrefix: "Review failed",
      },
      onCleanup: () => {
        void navigationService.dispose();
      },
      onMessage(data, api) {
        const message = data as ReviewWindowMessage;
        if (isRequestFilePayload(message)) {
          void handleRequestFile(message, api);
          return;
        }
        if (isRequestDefinitionPayload(message)) {
          handleRequestDefinition(message, api);
          return;
        }
        if (isRequestReferencesPayload(message)) {
          handleRequestReferences(message, api);
          return;
        }
        if (isSubmitPayload(message)) {
          sendReviewMessage(api, {
            type: "submit-ack",
            requestId: message.requestId,
            commentCount: message.comments.length,
            hasOverallComment: message.overallComment.trim().length > 0,
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
      ctx.ui.notify("Review cancelled.", "info");
      return;
    }

    const prompt = composeReviewPrompt(files, result.message);
    ctx.ui.setEditorText(prompt);
    ctx.ui.notify("Inserted review feedback into the editor.", "info");
  }

  pi.registerCommand("diff-review", {
    description:
      "Open a native review window with git diff, last commit, and all files scopes",
    handler: async (_args, ctx) => {
      await reviewRepository(ctx);
    },
  });

  pi.on("session_shutdown", async () => {
    windowState.shutdown();
  });
}
