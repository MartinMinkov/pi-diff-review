import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";

export type WaitingEditorResult = "escape" | "window-settled";

export type WaitingUIHandle = {
  promise: Promise<WaitingEditorResult>;
  dismiss: () => void;
};

export function showNativeWindowWaitingUI(
  ctx: ExtensionContext,
  options: {
    title: string;
    message: string;
    escapeMessage?: string;
    onDismiss?: (dismiss: () => void) => void;
  },
): WaitingUIHandle {
  let settled = false;
  let doneFn: ((result: WaitingEditorResult) => void) | null = null;
  let pendingResult: WaitingEditorResult | null = null;

  const finish = (result: WaitingEditorResult): void => {
    if (settled) return;
    settled = true;
    if (doneFn != null) {
      doneFn(result);
    } else {
      pendingResult = result;
    }
  };

  const promise = ctx.ui.custom<WaitingEditorResult>((_tui, theme, _kb, done) => {
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
        const borderBottom = theme.fg("border", `╰${"─".repeat(innerWidth)}╯`);
        const lines = [
          theme.fg("accent", theme.bold(options.title)),
          options.message,
          options.escapeMessage ?? "Press Escape to cancel and close the native window.",
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
  });

  const dismiss = (): void => finish("window-settled");
  options.onDismiss?.(dismiss);

  return { promise, dismiss };
}
