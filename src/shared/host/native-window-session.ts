import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { open, type GlimpseWindow } from "glimpseui";
import { escapeForInlineScript } from "./html.js";
import { showNativeWindowWaitingUI } from "./waiting-ui.js";

export type NativeWindowState = {
  hasActiveWindow(): boolean;
  setActiveWindow(window: GlimpseWindow): void;
  clearActiveWindow(window?: GlimpseWindow): void;
  closeActiveWindow(): void;
  setWaitingDismiss(dismiss: (() => void) | null): void;
  dismissWaitingUI(): void;
  shutdown(): void;
};

export type NativeWindowSessionApi<TResult> = {
  window: GlimpseWindow;
  send(receiverName: string, message: unknown): void;
  settle(value: TResult | null): void;
  closeWindow(): void;
  isSettled(): boolean;
};

export type NativeWindowSessionResult<TResult> =
  | { type: "message"; message: TResult }
  | { type: "cancelled" }
  | { type: "busy" }
  | { type: "open-error" }
  | { type: "error"; error: unknown };

export type NativeWindowSessionOptions<TResult> = {
  ctx: ExtensionContext;
  state: NativeWindowState;
  html: string;
  window: {
    title: string;
    width: number;
    height: number;
  };
  waiting: {
    title: string;
    message: string;
    escapeMessage?: string;
  };
  messages: {
    busy: string;
    opened: string;
    cancelled: string;
    openErrorPrefix: string;
    failurePrefix: string;
  };
  onMessage(data: unknown, api: NativeWindowSessionApi<TResult>): void;
  onCleanup?(): void | Promise<void>;
};

export function createNativeWindowState(): NativeWindowState {
  let activeWindow: GlimpseWindow | null = null;
  let activeWaitingUIDismiss: (() => void) | null = null;

  const closeWindow = (window: GlimpseWindow): void => {
    if (activeWindow === window) {
      activeWindow = null;
    }
    try {
      window.close();
    } catch {
      // Ignore close errors while tearing down native windows.
    }
  };

  return {
    hasActiveWindow(): boolean {
      return activeWindow != null;
    },
    setActiveWindow(window: GlimpseWindow): void {
      activeWindow = window;
    },
    clearActiveWindow(window?: GlimpseWindow): void {
      if (window == null || activeWindow === window) {
        activeWindow = null;
      }
    },
    closeActiveWindow(): void {
      if (activeWindow == null) return;
      closeWindow(activeWindow);
    },
    setWaitingDismiss(dismiss: (() => void) | null): void {
      activeWaitingUIDismiss = dismiss;
    },
    dismissWaitingUI(): void {
      activeWaitingUIDismiss?.();
      activeWaitingUIDismiss = null;
    },
    shutdown(): void {
      activeWaitingUIDismiss?.();
      activeWaitingUIDismiss = null;
      if (activeWindow != null) {
        closeWindow(activeWindow);
      }
    },
  };
}

export function openNativeWindow(
  html: string,
  options: NativeWindowSessionOptions<unknown>["window"],
): GlimpseWindow {
  const previousGlimpseBackend = process.env.GLIMPSE_BACKEND;
  const shouldUseChromiumBackend =
    process.platform === "linux" &&
    !process.env.WAYLAND_DISPLAY &&
    process.env.XDG_SESSION_TYPE !== "wayland" &&
    previousGlimpseBackend == null;

  try {
    if (shouldUseChromiumBackend) {
      process.env.GLIMPSE_BACKEND = "chromium";
    }

    return open(html, options);
  } finally {
    if (shouldUseChromiumBackend) {
      delete process.env.GLIMPSE_BACKEND;
    }
  }
}

export async function runNativeWindowSession<TResult>(
  options: NativeWindowSessionOptions<TResult>,
): Promise<NativeWindowSessionResult<TResult>> {
  const { ctx, state, messages } = options;

  if (state.hasActiveWindow()) {
    ctx.ui.notify(messages.busy, "warning");
    return { type: "busy" };
  }

  let window: GlimpseWindow;
  try {
    window = openNativeWindow(options.html, options.window);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`${messages.openErrorPrefix}: ${message}`, "error");
    return { type: "open-error" };
  }

  state.setActiveWindow(window);

  const closeWindow = (): void => {
    state.clearActiveWindow(window);
    try {
      window.close();
    } catch {
      // Ignore close errors while tearing down native windows.
    }
  };

  const waitingUI = showNativeWindowWaitingUI(ctx, {
    title: options.waiting.title,
    message: options.waiting.message,
    ...(options.waiting.escapeMessage ? { escapeMessage: options.waiting.escapeMessage } : {}),
    onDismiss: (dismiss) => state.setWaitingDismiss(dismiss),
  });

  ctx.ui.notify(messages.opened, "info");

  try {
    const terminalMessagePromise = new Promise<TResult | null>((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        window.removeListener("message", onMessage);
        window.removeListener("closed", onClosed);
        window.removeListener("error", onError);
        void options.onCleanup?.();
        state.clearActiveWindow(window);
      };

      const settle = (value: TResult | null): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const api: NativeWindowSessionApi<TResult> = {
        window,
        send(receiverName: string, message: unknown): void {
          const payload = escapeForInlineScript(JSON.stringify(message));
          window.send(`window.${receiverName}(${payload});`);
        },
        settle,
        closeWindow,
        isSettled(): boolean {
          return settled;
        },
      };

      const onMessage = (data: unknown): void => {
        options.onMessage(data, api);
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
      terminalMessagePromise.then((message) => ({ type: "window" as const, message })),
      waitingUI.promise.then((reason) => ({ type: "ui" as const, reason })),
    ]);

    if (result.type === "ui" && result.reason === "escape") {
      closeWindow();
      await terminalMessagePromise.catch(() => null);
      ctx.ui.notify(messages.cancelled, "info");
      return { type: "cancelled" };
    }

    const message = result.type === "window" ? result.message : await terminalMessagePromise;

    state.setWaitingDismiss(null);
    waitingUI.dismiss();
    closeWindow();
    await waitingUI.promise;

    if (message == null) {
      ctx.ui.notify(messages.cancelled, "info");
      return { type: "cancelled" };
    }

    return { type: "message", message };
  } catch (error) {
    state.dismissWaitingUI();
    state.closeActiveWindow();
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`${messages.failurePrefix}: ${message}`, "error");
    return { type: "error", error };
  }
}
