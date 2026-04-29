import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { open, type GlimpseWindow } from "glimpseui";
import {
  getReviewWindowData,
  loadReviewFileContents,
} from "../repo/review-window-data.js";
import { composeReviewPrompt } from "../prompt/compose-review-prompt.js";
import { ReviewNavigationService } from "../navigation/service.js";
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
} from "../../shared/contracts/review.js";
import { buildReviewHtml } from "../ui/build-review-html.js";

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

type WaitingEditorResult = "escape" | "window-settled";

function escapeForInlineScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export default function (pi: ExtensionAPI) {
  let activeWindow: GlimpseWindow | null = null;
  let activeWaitingUIDismiss: (() => void) | null = null;

  function closeActiveWindow(): void {
    if (activeWindow == null) return;
    const windowToClose = activeWindow;
    activeWindow = null;
    try {
      windowToClose.close();
    } catch {
      // Ignore close errors while tearing down the review window.
    }
  }

  function showWaitingUI(ctx: ExtensionCommandContext): {
    promise: Promise<WaitingEditorResult>;
    dismiss: () => void;
  } {
    let settled = false;
    let doneFn: ((result: WaitingEditorResult) => void) | null = null;
    let pendingResult: WaitingEditorResult | null = null;

    const finish = (result: WaitingEditorResult): void => {
      if (settled) return;
      settled = true;
      if (activeWaitingUIDismiss === dismiss) {
        activeWaitingUIDismiss = null;
      }
      if (doneFn != null) {
        doneFn(result);
      } else {
        pendingResult = result;
      }
    };

    const promise = ctx.ui.custom<WaitingEditorResult>(
      (_tui, theme, _kb, done) => {
        doneFn = done;
        if (pendingResult != null) {
          const result = pendingResult;
          pendingResult = null;
          queueMicrotask(() => done(result));
        }

        return {
          render(width: number): string[] {
            const innerWidth = Math.max(24, width - 2);
            const borderTop = theme.fg("border", `╭${"─".repeat(innerWidth)}╮`);
            const borderBottom = theme.fg(
              "border",
              `╰${"─".repeat(innerWidth)}╯`,
            );
            const lines = [
              theme.fg("accent", theme.bold("Waiting for review")),
              "The native review window is open.",
              "Press Escape to cancel and close the review window.",
            ];
            return [
              borderTop,
              ...lines.map(
                (line) =>
                  `${theme.fg("border", "│")}${truncateToWidth(line, innerWidth, "...", true).padEnd(innerWidth, " ")}${theme.fg("border", "│")}`,
              ),
              borderBottom,
            ];
          },
          handleInput(data: string): void {
            if (matchesKey(data, Key.escape)) {
              finish("escape");
            }
          },
          invalidate(): void {},
        };
      },
    );

    const dismiss = (): void => {
      finish("window-settled");
    };

    activeWaitingUIDismiss = dismiss;

    return {
      promise,
      dismiss,
    };
  }

  async function reviewRepository(ctx: ExtensionCommandContext): Promise<void> {
    if (activeWindow != null) {
      ctx.ui.notify("A review window is already open.", "warning");
      return;
    }

    const { repoRoot, files, goModules } = await getReviewWindowData(
      pi,
      ctx.cwd,
    );
    if (files.length === 0) {
      ctx.ui.notify("No reviewable files found.", "info");
      return;
    }

    const html = buildReviewHtml({ repoRoot, files, goModules });
    const previousGlimpseBackend = process.env.GLIMPSE_BACKEND;
    const shouldUseChromiumBackend =
      process.platform === "linux" &&
      !process.env.WAYLAND_DISPLAY &&
      process.env.XDG_SESSION_TYPE !== "wayland" &&
      previousGlimpseBackend == null;

    let window: GlimpseWindow;
    try {
      if (shouldUseChromiumBackend) {
        process.env.GLIMPSE_BACKEND = "chromium";
      }

      window = open(html, {
        width: 1680,
        height: 1020,
        title: "pi review",
      });
    } finally {
      if (shouldUseChromiumBackend) {
        delete process.env.GLIMPSE_BACKEND;
      }
    }
    activeWindow = window;

    const closeReviewWindow = (): void => {
      if (activeWindow === window) {
        activeWindow = null;
      }
      try {
        window.close();
      } catch {
        // Ignore close errors while tearing down the review window.
      }
    };

    const waitingUI = showWaitingUI(ctx);
    const fileMap = new Map(files.map((file) => [file.id, file]));
    const contentCache = new Map<string, Promise<ReviewFileContents>>();
    const navigationService = new ReviewNavigationService(repoRoot, files);

    const sendWindowMessage = (message: ReviewHostMessage): void => {
      if (activeWindow !== window) return;
      const payload = escapeForInlineScript(JSON.stringify(message));
      window.send(`window.__reviewReceive(${payload});`);
    };

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

    ctx.ui.notify("Opened native review window.", "info");

    try {
      const terminalMessagePromise = new Promise<
        ReviewSubmitPayload | ReviewCancelPayload | null
      >((resolve, reject) => {
        let settled = false;

        const cleanup = (): void => {
          window.removeListener("message", onMessage);
          window.removeListener("closed", onClosed);
          window.removeListener("error", onError);
          void navigationService.dispose();
          if (activeWindow === window) {
            activeWindow = null;
          }
        };

        const settle = (
          value: ReviewSubmitPayload | ReviewCancelPayload | null,
        ): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };

        const handleRequestFile = async (
          message: ReviewRequestFilePayload,
        ): Promise<void> => {
          const file = fileMap.get(message.fileId);
          if (file == null) {
            sendWindowMessage({
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
            sendWindowMessage({
              type: "file-data",
              requestId: message.requestId,
              fileId: message.fileId,
              scope: message.scope,
              originalContent: contents.originalContent,
              modifiedContent: contents.modifiedContent,
            });
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : String(error);
            sendWindowMessage({
              type: "file-error",
              requestId: message.requestId,
              fileId: message.fileId,
              scope: message.scope,
              message: messageText,
            });
          }
        };

        const onMessage = (data: unknown): void => {
          const message = data as ReviewWindowMessage;
          if (isRequestFilePayload(message)) {
            void handleRequestFile(message);
            return;
          }
          if (isRequestDefinitionPayload(message)) {
            void (async () => {
              try {
                const target = await navigationService.resolveDefinition(
                  message.request,
                );
                sendWindowMessage({
                  type: "definition-data",
                  requestId: message.requestId,
                  target,
                });
              } catch (error) {
                const messageText =
                  error instanceof Error ? error.message : String(error);
                sendWindowMessage({
                  type: "definition-error",
                  requestId: message.requestId,
                  message: messageText,
                });
              }
            })();
            return;
          }
          if (isRequestReferencesPayload(message)) {
            void (async () => {
              try {
                const targets = await navigationService.resolveReferences(
                  message.request,
                );
                sendWindowMessage({
                  type: "references-data",
                  requestId: message.requestId,
                  targets,
                });
              } catch (error) {
                const messageText =
                  error instanceof Error ? error.message : String(error);
                sendWindowMessage({
                  type: "references-error",
                  requestId: message.requestId,
                  message: messageText,
                });
              }
            })();
            return;
          }
          if (isSubmitPayload(message) || isCancelPayload(message)) {
            if (isSubmitPayload(message)) {
              sendWindowMessage({
                type: "submit-ack",
                requestId: message.requestId,
                commentCount: message.comments.length,
                hasOverallComment: message.overallComment.trim().length > 0,
              });
              setTimeout(() => {
                settle(message);
                closeReviewWindow();
              }, 40);
              return;
            }
            settle(message);
            closeReviewWindow();
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
        closeReviewWindow();
        await terminalMessagePromise.catch(() => null);
        ctx.ui.notify("Review cancelled.", "info");
        return;
      }

      const message =
        result.type === "window"
          ? result.message
          : await terminalMessagePromise;

      waitingUI.dismiss();
      closeReviewWindow();
      await waitingUI.promise;

      if (message == null || message.type === "cancel") {
        ctx.ui.notify("Review cancelled.", "info");
        return;
      }

      const prompt = composeReviewPrompt(files, message);
      ctx.ui.setEditorText(prompt);
      ctx.ui.notify("Inserted review feedback into the editor.", "info");
    } catch (error) {
      activeWaitingUIDismiss?.();
      closeActiveWindow();
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Review failed: ${message}`, "error");
    }
  }

  pi.registerCommand("diff-review", {
    description:
      "Open a native review window with git diff, last commit, and all files scopes",
    handler: async (_args, ctx) => {
      await reviewRepository(ctx);
    },
  });

  pi.on("session_shutdown", async () => {
    activeWaitingUIDismiss?.();
    closeActiveWindow();
  });
}
