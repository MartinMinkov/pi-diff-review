import { escapeHtml } from "./utils.js";
import type { DiffReviewComment } from "./types.js";

export interface TextModalOptions {
  title: string;
  description: string;
  initialValue: string;
  saveLabel: string;
  onSave: (value: string) => void;
}

function insertAtCursor(textarea: HTMLTextAreaElement, value: string): void {
  const before = textarea.value.slice(
    0,
    textarea.selectionStart ?? textarea.value.length,
  );
  const after = textarea.value.slice(
    textarea.selectionEnd ?? textarea.value.length,
  );
  const nextValue = `${before}${value}${after}`;
  textarea.value = nextValue;

  const cursor =
    (textarea.selectionStart ?? textarea.value.length) + value.length;
  textarea.setSelectionRange(cursor, cursor);
}

function setupPasteHandler(textarea: HTMLTextAreaElement): void {
  textarea.addEventListener("paste", (event) => {
    const pasteData = event.clipboardData;
    const text = pasteData?.getData("text/plain");
    if (text != null) {
      event.preventDefault();
      insertAtCursor(textarea, text);
    }
  });

  textarea.addEventListener("keydown", async (event) => {
    const isPasteShortcut =
      (event.metaKey && event.key.toLowerCase() === "v") ||
      (event.ctrlKey && event.key.toLowerCase() === "v");

    if (!isPasteShortcut) return;

    event.preventDefault();

    if (!navigator.clipboard?.readText) return;

    try {
      const text = await navigator.clipboard.readText();
      if (text != null) {
        insertAtCursor(textarea, text);
      }
    } catch {
      // Clipboard access may not be available in all environments; fallback to no-op.
    }
  });
}

export function showTextModal(options: TextModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <textarea id="review-modal-text" class="scrollbar-thin min-h-48 w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">${escapeHtml(options.initialValue ?? "")}</textarea>
      <div class="mt-4 flex justify-end gap-2">
        <button id="review-modal-cancel" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Cancel</button>
        <button id="review-modal-save" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">${escapeHtml(options.saveLabel ?? "Save")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const textarea = backdrop.querySelector(
    "#review-modal-text",
  ) as HTMLTextAreaElement | null;
  const cancelButton = backdrop.querySelector(
    "#review-modal-cancel",
  ) as HTMLButtonElement | null;
  const saveButton = backdrop.querySelector(
    "#review-modal-save",
  ) as HTMLButtonElement | null;
  const close = () => backdrop.remove();

  if (cancelButton) {
    cancelButton.addEventListener("click", close);
  }

  if (textarea) {
    setupPasteHandler(textarea);
  }

  if (saveButton && textarea) {
    saveButton.addEventListener("click", () => {
      options.onSave(textarea.value.trim());
      close();
    });
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  if (textarea) {
    textarea.focus();
  }
}

export function renderCommentDOM(
  comment: DiffReviewComment,
  scopeLabel: (scope: DiffReviewComment["scope"]) => string,
  onDelete: () => void,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "view-zone-container";

  const title =
    comment.side === "file"
      ? `File comment • ${scopeLabel(comment.scope)}`
      : `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} • ${scopeLabel(comment.scope)}`;

  container.innerHTML = `
    <div class="mb-2 flex items-center justify-between gap-3">
      <div class="text-xs font-semibold text-review-text">${escapeHtml(title)}</div>
      <button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>
    </div>
    <textarea data-comment-id="${escapeHtml(comment.id)}" class="scrollbar-thin min-h-[76px] w-full resize-y rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Leave a comment"></textarea>
  `;

  const textarea = container.querySelector(
    "textarea",
  ) as HTMLTextAreaElement | null;
  const deleteButton = container.querySelector(
    "[data-action='delete']",
  ) as HTMLButtonElement | null;

  if (!textarea) {
    return container;
  }

  textarea.value = comment.body || "";
  setupPasteHandler(textarea);

  textarea.addEventListener("input", () => {
    comment.body = textarea.value;
  });

  if (deleteButton) {
    deleteButton.addEventListener("click", onDelete);
  }

  if (!comment.body) {
    setTimeout(() => textarea.focus(), 50);
  }

  return container;
}
