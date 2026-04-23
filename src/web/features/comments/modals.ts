import { escapeHtml } from "../../shared/lib/utils.js";
import type { DiffReviewComment } from "../../shared/contracts/review.js";

interface CommentRenderOptions {
  onDelete: () => void;
  onUpdate: () => void;
}

export interface TextModalOptions {
  title: string;
  description: string;
  initialValue: string;
  saveLabel: string;
  onSave: (value: string) => void;
}

export interface ReferenceModalItem {
  title: string;
  description: string;
  preview?: string;
  isChanged?: boolean;
  isCurrentScope?: boolean;
  onSelect: () => void;
}

export interface ReferenceModalOptions {
  title: string;
  description: string;
  items: ReferenceModalItem[];
  emptyLabel?: string;
}

export interface PeekModalOptions {
  title: string;
  description: string;
  code: string;
  openLabel?: string;
  onOpen: () => void;
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
    if (text == null) return;

    event.preventDefault();
    insertAtCursor(textarea, text);

    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function showTextModal(options: TextModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <textarea id="review-modal-text" rows="12" class="scrollbar-thin min-h-[240px] w-full resize-y overflow-auto rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">${escapeHtml(options.initialValue ?? "")}</textarea>
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

export function showReferenceModal(options: ReferenceModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button data-filter="changed" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]">Changed files only</button>
        <button data-filter="scope" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]">Current scope only</button>
      </div>
      <div id="review-reference-list" class="scrollbar-thin max-h-[55vh] space-y-3 overflow-auto"></div>
      <div class="mt-4 flex justify-end gap-2">
        <button id="review-modal-close" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeButton = backdrop.querySelector(
    "#review-modal-close",
  ) as HTMLButtonElement | null;
  const listEl = backdrop.querySelector(
    "#review-reference-list",
  ) as HTMLDivElement | null;
  const filterButtons =
    backdrop.querySelectorAll<HTMLButtonElement>("[data-filter]");
  const close = () => backdrop.remove();
  const filters = {
    changed: false,
    scope: false,
  };

  function renderItems() {
    if (!listEl) return;
    const filteredItems = options.items.filter((item) => {
      if (filters.changed && !item.isChanged) return false;
      if (filters.scope && !item.isCurrentScope) return false;
      return true;
    });

    listEl.innerHTML =
      filteredItems.length > 0
        ? filteredItems
            .map(
              (item, index) => `
                <button data-reference-index="${index}" class="w-full rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <div class="text-sm font-medium text-review-text">${escapeHtml(item.title)}</div>
                  <div class="mt-1 text-xs text-review-muted">${escapeHtml(item.description)}</div>
                  ${item.preview ? `<div class="mt-2 truncate text-xs text-[#8b949e]">${escapeHtml(item.preview)}</div>` : ""}
                </button>
              `,
            )
            .join("")
        : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">${escapeHtml(options.emptyLabel ?? "No references found.")}</div>`;

    listEl
      .querySelectorAll<HTMLElement>("[data-reference-index]")
      .forEach((node) => {
        node.addEventListener("click", () => {
          const index = Number(
            node.getAttribute("data-reference-index") || "-1",
          );
          const filtered = options.items.filter((item) => {
            if (filters.changed && !item.isChanged) return false;
            if (filters.scope && !item.isCurrentScope) return false;
            return true;
          });
          const item = filtered[index];
          if (!item) return;
          item.onSelect();
          close();
        });
      });
  }

  if (closeButton) {
    closeButton.addEventListener("click", close);
  }

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-filter") as
        | "changed"
        | "scope"
        | null;
      if (!key) return;
      filters[key] = !filters[key];
      button.className = filters[key]
        ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-3 py-1 text-xs font-medium text-[#3fb950] hover:bg-[#238636]/25"
        : "cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]";
      renderItems();
    });
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  renderItems();
  (
    listEl?.querySelector("[data-reference-index]") as HTMLElement | null
  )?.focus();
}

export function showPeekModal(options: PeekModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <pre class="scrollbar-thin max-h-[55vh] overflow-auto rounded-md border border-review-border bg-[#010409] px-4 py-3 text-xs text-review-text">${escapeHtml(options.code)}</pre>
      <div class="mt-4 flex justify-end gap-2">
        <button id="review-modal-close" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Close</button>
        <button id="review-modal-open" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">${escapeHtml(options.openLabel ?? "Open definition")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeButton = backdrop.querySelector(
    "#review-modal-close",
  ) as HTMLButtonElement | null;
  const openButton = backdrop.querySelector(
    "#review-modal-open",
  ) as HTMLButtonElement | null;
  const close = () => backdrop.remove();

  closeButton?.addEventListener("click", close);
  openButton?.addEventListener("click", () => {
    options.onOpen();
    close();
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
}

export function renderCommentDOM(
  comment: DiffReviewComment,
  scopeLabel: (scope: DiffReviewComment["scope"]) => string,
  options: CommentRenderOptions,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "view-zone-container";

  const title =
    comment.side === "file"
      ? `File comment • ${scopeLabel(comment.scope)}`
      : `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} • ${scopeLabel(comment.scope)}`;

  if (comment.status === "draft") {
    container.innerHTML = `
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="text-xs font-semibold text-review-text">${escapeHtml(title)}</div>
        <div class="flex items-center gap-2">
          <button data-action="cancel" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1.5 text-xs font-medium text-review-text hover:bg-[#21262d]">Cancel</button>
          <button data-action="submit" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-[#238636] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2ea043] disabled:cursor-not-allowed disabled:opacity-50">Submit</button>
        </div>
      </div>
      <textarea data-comment-id="${escapeHtml(comment.id)}" rows="6" class="scrollbar-thin min-h-[140px] w-full resize-y overflow-auto rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="Leave a comment"></textarea>
    `;

    const textarea = container.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    const cancelButton = container.querySelector(
      "[data-action='cancel']",
    ) as HTMLButtonElement | null;
    const submitButton = container.querySelector(
      "[data-action='submit']",
    ) as HTMLButtonElement | null;

    if (!textarea) {
      return container;
    }

    textarea.value = comment.body || "";
    setupPasteHandler(textarea);

    const syncSubmitState = () => {
      if (!submitButton) return;
      submitButton.disabled = textarea.value.trim().length === 0;
    };

    textarea.addEventListener("input", () => {
      comment.body = textarea.value;
      syncSubmitState();
    });

    cancelButton?.addEventListener("click", options.onDelete);
    submitButton?.addEventListener("click", () => {
      const body = textarea.value.trim();
      if (!body) return;
      comment.body = body;
      comment.status = "submitted";
      comment.collapsed = true;
      options.onUpdate();
    });

    syncSubmitState();

    if (!comment.body) {
      setTimeout(() => textarea.focus(), 50);
    }

    return container;
  }

  const preview = comment.body.trim().split("\n")[0] || "Comment";
  const toggleLabel = comment.collapsed ? "Expand comment" : "Collapse comment";

  container.innerHTML = `
    <div class="rounded-md border border-review-border bg-review-panel">
      <div class="flex items-center gap-2 px-3 py-2">
        <button data-action="toggle" aria-label="${escapeHtml(toggleLabel)}" class="flex min-w-0 flex-1 items-center gap-2 text-left">
          <svg class="h-3.5 w-3.5 shrink-0 text-review-muted transition-transform ${comment.collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-semibold text-review-text">${escapeHtml(title)}</span>
            ${
              comment.collapsed
                ? `<span class="mt-0.5 block truncate text-xs text-review-muted">${escapeHtml(preview)}</span>`
                : ""
            }
          </span>
        </button>
        ${
          comment.collapsed
            ? ""
            : `<button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>`
        }
      </div>
      ${
        comment.collapsed
          ? ""
          : `<div class="border-t border-review-border px-3 py-3 whitespace-pre-wrap break-words text-sm text-review-text">${escapeHtml(comment.body)}</div>`
      }
    </div>
  `;

  const toggleButton = container.querySelector(
    "[data-action='toggle']",
  ) as HTMLButtonElement | null;
  const deleteButton = container.querySelector(
    "[data-action='delete']",
  ) as HTMLButtonElement | null;

  toggleButton?.addEventListener("click", () => {
    comment.collapsed = !comment.collapsed;
    options.onUpdate();
  });
  deleteButton?.addEventListener("click", options.onDelete);

  return container;
}
