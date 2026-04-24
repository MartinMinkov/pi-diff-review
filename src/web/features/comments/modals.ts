import { escapeHtml } from "../../shared/lib/utils.js";
import type {
  DiffReviewComment,
  DiffReviewCommentKind,
} from "../../shared/contracts/review.js";

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

export interface CommentEditModalOptions {
  title: string;
  description: string;
  initialBody: string;
  initialKind: DiffReviewCommentKind;
  saveLabel?: string;
  onSave: (value: {
    body: string;
    kind: DiffReviewCommentKind;
  }) => void;
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

export interface ActionModalOptions {
  title: string;
  description: string;
  actions: Array<{
    label: string;
    description: string;
    onSelect: () => void;
  }>;
}

export interface SymbolModalOptions {
  title: string;
  description: string;
  items: Array<{
    title: string;
    description: string;
    kind: string;
    onSelect: () => void;
  }>;
}

export interface CommandPaletteOptions {
  title: string;
  description: string;
  items: Array<{
    label: string;
    detail?: string;
    hint?: string;
    onSelect: () => void;
  }>;
}

function getCommentKindLabel(kind: DiffReviewCommentKind): string {
  switch (kind) {
    case "question":
      return "Question";
    case "risk":
      return "Risk";
    case "explain":
      return "Explain";
    case "tests":
      return "Tests";
    default:
      return "Feedback";
  }
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

export function showCommentEditModal(options: CommentEditModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <div class="mb-3">
        <select id="review-comment-kind" class="rounded-md border border-review-border bg-[#010409] px-2 py-1.5 text-xs font-medium text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
          <option value="feedback">Feedback</option>
          <option value="question">Question</option>
          <option value="risk">Risk</option>
          <option value="explain">Explain</option>
          <option value="tests">Tests</option>
        </select>
      </div>
      <textarea id="review-comment-body" rows="10" class="scrollbar-thin min-h-[220px] w-full resize-y overflow-auto rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">${escapeHtml(options.initialBody ?? "")}</textarea>
      <div class="mt-4 flex justify-end gap-2">
        <button id="review-comment-cancel" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Cancel</button>
        <button id="review-comment-save" class="cursor-pointer rounded-md border border-[rgba(240,246,252,0.1)] bg-[#238636] px-4 py-2 text-sm font-medium text-white hover:bg-[#2ea043]">${escapeHtml(options.saveLabel ?? "Save changes")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const textarea = backdrop.querySelector(
    "#review-comment-body",
  ) as HTMLTextAreaElement | null;
  const kindSelect = backdrop.querySelector(
    "#review-comment-kind",
  ) as HTMLSelectElement | null;
  const cancelButton = backdrop.querySelector(
    "#review-comment-cancel",
  ) as HTMLButtonElement | null;
  const saveButton = backdrop.querySelector(
    "#review-comment-save",
  ) as HTMLButtonElement | null;
  const close = () => backdrop.remove();

  if (textarea) {
    setupPasteHandler(textarea);
  }

  if (kindSelect) {
    kindSelect.value = options.initialKind;
  }

  cancelButton?.addEventListener("click", close);
  saveButton?.addEventListener("click", () => {
    const body = textarea?.value.trim() ?? "";
    if (!body) return;
    options.onSave({
      body,
      kind: (kindSelect?.value as DiffReviewCommentKind | undefined) ?? "feedback",
    });
    close();
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  textarea?.focus();
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

export function showActionModal(options: ActionModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <div class="space-y-2">
        ${options.actions
          .map(
            (action, index) => `
              <button data-action-index="${index}" class="w-full rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <div class="text-sm font-medium text-review-text">${escapeHtml(action.label)}</div>
                <div class="mt-1 text-xs leading-5 text-review-muted">${escapeHtml(action.description)}</div>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="mt-4 flex justify-end">
        <button id="review-modal-close" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  (
    backdrop.querySelector("#review-modal-close") as HTMLButtonElement | null
  )?.addEventListener("click", close);
  backdrop
    .querySelectorAll<HTMLElement>("[data-action-index]")
    .forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-action-index") || "-1");
        const action = options.actions[index];
        if (!action) return;
        action.onSelect();
        close();
      });
    });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
}

export function showSymbolModal(options: SymbolModalOptions): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <input
        id="review-symbol-search"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="Filter symbols"
        class="mb-3 w-full rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none placeholder:text-review-muted focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <div id="review-symbol-list" class="scrollbar-thin max-h-[55vh] space-y-2 overflow-auto"></div>
      <div class="mt-4 flex justify-end">
        <button id="review-modal-close" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const searchInput = backdrop.querySelector(
    "#review-symbol-search",
  ) as HTMLInputElement | null;
  const listEl = backdrop.querySelector(
    "#review-symbol-list",
  ) as HTMLDivElement | null;
  const close = () => backdrop.remove();

  function render(query = "") {
    if (!listEl) return;
    const normalized = query.trim().toLowerCase();
    const items = options.items.filter((item) => {
      if (!normalized) return true;
      return `${item.title} ${item.description} ${item.kind}`
        .toLowerCase()
        .includes(normalized);
    });

    listEl.innerHTML =
      items.length > 0
        ? items
            .map(
              (item, index) => `
                <button data-symbol-index="${index}" class="flex w-full items-center justify-between gap-3 rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d]">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-review-text">${escapeHtml(item.title)}</span>
                    <span class="mt-1 block truncate text-xs text-review-muted">${escapeHtml(item.description)}</span>
                  </span>
                  <span class="shrink-0 rounded-md border border-review-border bg-review-panel px-2 py-0.5 text-[11px] font-medium text-review-muted">${escapeHtml(item.kind)}</span>
                </button>
              `,
            )
            .join("")
        : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">No symbols match this filter.</div>`;

    listEl.querySelectorAll<HTMLElement>("[data-symbol-index]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-symbol-index") || "-1");
        const filtered = options.items.filter((item) => {
          if (!normalized) return true;
          return `${item.title} ${item.description} ${item.kind}`
            .toLowerCase()
            .includes(normalized);
        });
        filtered[index]?.onSelect();
        close();
      });
    });
  }

  (
    backdrop.querySelector("#review-modal-close") as HTMLButtonElement | null
  )?.addEventListener("click", close);
  searchInput?.addEventListener("input", () => render(searchInput.value));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  render();
  searchInput?.focus();
}

export function showCommandPaletteModal(
  options: CommandPaletteOptions,
): void {
  const backdrop = document.createElement("div");
  backdrop.className = "review-modal-backdrop";
  backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <input
        id="review-command-search"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="Type a command"
        class="mb-3 w-full rounded-md border border-review-border bg-[#010409] px-3 py-2 text-sm text-review-text outline-none placeholder:text-review-muted focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <div id="review-command-list" class="scrollbar-thin max-h-[55vh] space-y-2 overflow-auto"></div>
      <div class="mt-4 flex items-center justify-between gap-3 text-xs text-review-muted">
        <span>Enter to run</span>
        <span>Esc to close</span>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const searchInput = backdrop.querySelector(
    "#review-command-search",
  ) as HTMLInputElement | null;
  const listEl = backdrop.querySelector(
    "#review-command-list",
  ) as HTMLDivElement | null;
  let activeIndex = 0;

  const close = () => {
    document.removeEventListener("keydown", onKeyDown, true);
    backdrop.remove();
  };

  function getFilteredItems(): CommandPaletteOptions["items"] {
    const query = (searchInput?.value || "").trim().toLowerCase();
    if (!query) return options.items;
    return options.items.filter((item) =>
      `${item.label} ${item.detail || ""} ${item.hint || ""}`
        .toLowerCase()
        .includes(query),
    );
  }

  function render(): void {
    if (!listEl) return;
    const items = getFilteredItems();
    if (activeIndex >= items.length) {
      activeIndex = Math.max(0, items.length - 1);
    }

    listEl.innerHTML =
      items.length > 0
        ? items
            .map(
              (item, index) => `
                <button data-command-index="${index}" class="${
                  index === activeIndex
                    ? "border-blue-500 bg-[#11161d]"
                    : "border-review-border bg-[#010409] hover:bg-[#11161d]"
                } flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left focus:outline-none">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-review-text">${escapeHtml(item.label)}</span>
                    ${item.detail ? `<span class="mt-1 block truncate text-xs text-review-muted">${escapeHtml(item.detail)}</span>` : ""}
                  </span>
                  ${item.hint ? `<span class="shrink-0 text-[11px] text-review-muted">${escapeHtml(item.hint)}</span>` : ""}
                </button>
              `,
            )
            .join("")
        : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">No commands match this filter.</div>`;

    listEl.querySelectorAll<HTMLElement>("[data-command-index]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-command-index") || "-1");
        const item = getFilteredItems()[index];
        if (!item) return;
        item.onSelect();
        close();
      });
    });
  }

  function runActive(): void {
    const item = getFilteredItems()[activeIndex];
    if (!item) return;
    item.onSelect();
    close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!backdrop.isConnected) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, Math.max(0, getFilteredItems().length - 1));
      render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  }

  searchInput?.addEventListener("input", () => {
    activeIndex = 0;
    render();
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKeyDown, true);
  render();
  searchInput?.focus();
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
        <div class="min-w-0">
          <div class="truncate text-xs font-semibold text-review-text">${escapeHtml(title)}</div>
          <div class="mt-2">
            <select data-comment-kind class="rounded-md border border-review-border bg-[#010409] px-2 py-1 text-xs font-medium text-review-text outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              <option value="feedback">Feedback</option>
              <option value="question">Question</option>
              <option value="risk">Risk</option>
              <option value="explain">Explain</option>
              <option value="tests">Tests</option>
            </select>
          </div>
        </div>
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
    const kindSelect = container.querySelector(
      "[data-comment-kind]",
    ) as HTMLSelectElement | null;

    if (!textarea) {
      return container;
    }

    textarea.value = comment.body || "";
    if (kindSelect) {
      kindSelect.value = comment.kind ?? "feedback";
      kindSelect.addEventListener("change", () => {
        comment.kind = kindSelect.value as DiffReviewCommentKind;
      });
    }
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
  const kind = comment.kind ?? "feedback";
  container.innerHTML = `
    <div class="rounded-md border border-review-border bg-review-panel">
      <div class="flex items-center gap-2 px-3 py-2">
        <button data-action="toggle" aria-label="${escapeHtml(toggleLabel)}" class="flex min-w-0 flex-1 items-center gap-2 text-left">
          <svg class="h-3.5 w-3.5 shrink-0 text-review-muted transition-transform ${comment.collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="block truncate text-xs font-semibold text-review-text">${escapeHtml(title)}</span>
              <span class="shrink-0 rounded-md border border-review-border bg-[#0d1117] px-2 py-0.5 text-[10px] font-medium text-review-muted">${escapeHtml(getCommentKindLabel(kind))}</span>
            </span>
            ${
              comment.collapsed
                ? `<span class="mt-0.5 block truncate text-xs text-review-muted">${escapeHtml(preview)}</span>`
                : ""
            }
          </span>
        </button>
        <button data-action="edit" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-[#11161d] hover:text-review-text">Edit</button>
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
  const editButton = container.querySelector(
    "[data-action='edit']",
  ) as HTMLButtonElement | null;
  toggleButton?.addEventListener("click", () => {
    comment.collapsed = !comment.collapsed;
    options.onUpdate();
  });
  editButton?.addEventListener("click", () => {
    showCommentEditModal({
      title: "Edit submitted comment",
      description: "Update this review instruction before you finish the review.",
      initialBody: comment.body,
      initialKind: kind,
      onSave: ({ body, kind: nextKind }) => {
        comment.body = body;
        comment.kind = nextKind;
        comment.collapsed = false;
        options.onUpdate();
      },
    });
  });
  deleteButton?.addEventListener("click", options.onDelete);

  return container;
}
