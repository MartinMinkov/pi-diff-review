import type {
  ResponseReviewComment,
  ResponseReviewCommentKind,
  ResponseReviewHostMessage,
  ResponseReviewResponse,
  ResponseReviewWindowData,
  ResponseReviewWindowMessage,
} from "../shared/contracts/response-review.js";

declare global {
  interface Window {
    glimpse?: {
      send(payload: unknown): void;
      close(): void;
    };
    __responseReviewReceive?: (message: ResponseReviewHostMessage) => void;
  }
}

type OutlineItem = {
  id: string;
  label: string;
  kind: "heading" | "code";
};

type PendingSelection = {
  text: string;
  startOffset?: number;
  endOffset?: number;
};

const data = JSON.parse(
  document.getElementById("response-review-data")?.textContent ?? "{}",
) as ResponseReviewWindowData;

const responses = data.responses ?? [];
const comments: ResponseReviewComment[] = [];
let activeResponseId = data.initialResponseId ?? responses.at(-1)?.id ?? responses[0]?.id ?? "";
let responseFilter = "";
let pendingSelection: PendingSelection | null = null;
let editingCommentId: string | null = null;
let submitPending = false;

const responseListEl = requireElement<HTMLDivElement>("response-list");
const outlineListEl = requireElement<HTMLDivElement>("outline-list");
const responseContentEl = requireElement<HTMLElement>("response-content");
const responseScrollEl = requireElement<HTMLDivElement>("response-scroll");
const activeTitleEl = requireElement<HTMLDivElement>("active-title");
const activeMetaEl = requireElement<HTMLDivElement>("active-meta");
const responseSearchEl = requireElement<HTMLInputElement>("response-search");
const commentSelectionButton = requireElement<HTMLButtonElement>("comment-selection-button");
const copySelectionButton = requireElement<HTMLButtonElement>("copy-selection-button");
const commentListEl = requireElement<HTMLDivElement>("comment-list");
const overallCommentEl = requireElement<HTMLTextAreaElement>("overall-comment");
const draftEl = requireElement<HTMLTextAreaElement>("draft");
const submitButton = requireElement<HTMLButtonElement>("submit-button");
const cancelButton = requireElement<HTMLButtonElement>("cancel-button");
const statusEl = requireElement<HTMLDivElement>("status");
const modalEl = requireElement<HTMLDivElement>("comment-modal");
const modalSelectionEl = requireElement<HTMLDivElement>("modal-selection");
const modalKindEl = requireElement<HTMLSelectElement>("modal-kind");
const modalCommentEl = requireElement<HTMLTextAreaElement>("modal-comment");
const modalCancelButton = requireElement<HTMLButtonElement>("modal-cancel");
const modalSaveButton = requireElement<HTMLButtonElement>("modal-save");

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function activeResponse(): ResponseReviewResponse | undefined {
  return responses.find((response) => response.id === activeResponseId) ?? responses.at(-1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shortText(value: string, max = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function send(message: ResponseReviewWindowMessage): void {
  if (window.glimpse) {
    window.glimpse.send(message);
    return;
  }
  console.log("response-review message", message);
}

function flash(message: string): void {
  statusEl.textContent = message;
  window.setTimeout(() => {
    if (statusEl.textContent === message) statusEl.textContent = "";
  }, 2200);
}

function markdownToHtml(markdown: string): { html: string; outline: OutlineItem[] } {
  const outline: OutlineItem[] = [];
  const lines = markdown.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeLanguage = "";
  let blockIndex = 0;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n");
    html.push(`<p>${inlineMarkdown(escapeHtml(text))}</p>`);
    paragraph = [];
  };

  const flushCode = (): void => {
    const id = `outline-${blockIndex++}`;
    const label = codeLanguage ? `Code · ${codeLanguage}` : "Code block";
    outline.push({ id, label, kind: "code" });
    const codeText = codeLines.join("\n");
    html.push(
      `<pre id="${id}"><button class="code-comment-button" data-code-comment="${id}">Comment block</button><code>${escapeHtml(codeText)}</code></pre>`,
    );
    codeLines = [];
    codeLanguage = "";
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([^`]*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
        codeLanguage = fence[1]?.trim() ?? "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1]?.length ?? 2;
      const id = `outline-${blockIndex++}`;
      const label = heading[2]?.trim() ?? "Heading";
      outline.push({ id, label, kind: "heading" });
      html.push(`<h${level} id="${id}">${inlineMarkdown(escapeHtml(label))}</h${level}>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  if (inCode) flushCode();
  flushParagraph();

  return { html: html.join("\n"), outline };
}

function inlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderResponses(): void {
  const filtered = responses.filter((response) => {
    if (!responseFilter) return true;
    const haystack = `${response.title} ${response.preview}`.toLowerCase();
    return haystack.includes(responseFilter.toLowerCase());
  });

  responseListEl.innerHTML = "";
  if (filtered.length === 0) {
    responseListEl.innerHTML = `<div class="text-xs leading-5 text-review-muted">No matching responses.</div>`;
    return;
  }

  for (const response of filtered) {
    const button = document.createElement("button");
    button.className = [
      "rounded-xl border bg-review-panel-2 p-2.5 text-left text-review-text",
      "hover:border-review-accent/60 hover:bg-[#18212c]",
      response.id === activeResponseId
        ? "border-review-accent shadow-[inset_3px_0_0_#58a6ff]"
        : "border-review-border",
    ].join(" ");
    const count = comments.filter((comment) => comment.responseId === response.id).length;
    button.innerHTML = `
      <div class="mb-1 text-xs font-bold text-white">${escapeHtml(response.title)}</div>
      <div class="text-[11px] leading-5 text-review-muted">${escapeHtml(response.preview)}</div>
      ${count > 0 ? `<div class="text-[11px] leading-5 text-review-muted">${count} comment${count === 1 ? "" : "s"}</div>` : ""}
    `;
    button.addEventListener("click", () => {
      activeResponseId = response.id;
      renderAll();
    });
    responseListEl.appendChild(button);
  }
}

function renderActiveResponse(): void {
  const response = activeResponse();
  if (!response) {
    activeTitleEl.textContent = "No response selected";
    activeMetaEl.textContent = "";
    responseContentEl.innerHTML = `<p>No assistant responses are available.</p>`;
    outlineListEl.innerHTML = "";
    return;
  }

  activeTitleEl.textContent = response.title;
  activeMetaEl.textContent = `${response.text.length.toLocaleString()} characters · ${comments.filter((comment) => comment.responseId === response.id).length} comments`;
  const rendered = markdownToHtml(response.text);
  responseContentEl.innerHTML = rendered.html;
  renderOutline(rendered.outline);
  bindCodeCommentButtons();
}

function renderOutline(outline: OutlineItem[]): void {
  outlineListEl.innerHTML = "";
  if (outline.length === 0) {
    outlineListEl.innerHTML = `<div class="text-xs leading-5 text-review-muted">No headings or code blocks found.</div>`;
    return;
  }

  for (const item of outline) {
    const button = document.createElement("button");
    button.className = "rounded-md border-0 bg-transparent px-1 py-1 text-left text-xs font-medium text-review-muted hover:bg-review-accent/10 hover:text-review-accent";
    button.textContent = `${item.kind === "code" ? "▣" : "#"} ${item.label}`;
    button.addEventListener("click", () => {
      document.getElementById(item.id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    outlineListEl.appendChild(button);
  }
}

function bindCodeCommentButtons(): void {
  responseContentEl.querySelectorAll<HTMLButtonElement>("[data-code-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      const pre = button.closest("pre");
      const code = pre?.querySelector("code")?.textContent ?? "";
      if (!code.trim()) return;
      openCommentModal({ text: code, startOffset: undefined, endOffset: undefined });
    });
  });
}

function renderComments(): void {
  commentListEl.innerHTML = "";
  if (comments.length === 0) {
    commentListEl.innerHTML = `<div class="text-xs leading-5 text-review-muted">No comments yet. Select text in the response and press C.</div>`;
    return;
  }

  for (const comment of comments) {
    const response = responses.find((item) => item.id === comment.responseId);
    const card = document.createElement("div");
    card.className = "mb-2.5 rounded-xl border border-review-border bg-review-panel-2 p-2.5";
    card.innerHTML = `
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="text-[11px] font-extrabold uppercase text-review-accent">${escapeHtml(comment.kind)}</div>
        <div class="flex gap-1.5">
          <button data-action="jump" class="rounded-md border border-review-border bg-review-panel-2 px-2 py-1 text-[11px] text-review-text hover:border-review-accent/60">Jump</button>
          <button data-action="edit" class="rounded-md border border-review-border bg-review-panel-2 px-2 py-1 text-[11px] text-review-text hover:border-review-accent/60">Edit</button>
          <button data-action="delete" class="rounded-md border border-review-border bg-review-panel-2 px-2 py-1 text-[11px] text-review-text hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300">Delete</button>
        </div>
      </div>
      <div class="text-xs leading-5 text-review-muted">${escapeHtml(response?.title ?? comment.responseId)}</div>
      <div class="my-2 max-h-[82px] overflow-hidden whitespace-pre-wrap border-l-2 border-review-border pl-2 text-[11px] text-review-muted">${escapeHtml(shortText(comment.selectedText, 500))}</div>
      <div class="whitespace-pre-wrap text-[13px] leading-5 text-review-text">${escapeHtml(comment.comment)}</div>
    `;
    card.querySelector<HTMLButtonElement>("[data-action='jump']")?.addEventListener("click", () => jumpToComment(comment));
    card.querySelector<HTMLButtonElement>("[data-action='edit']")?.addEventListener("click", () => editComment(comment));
    card.querySelector<HTMLButtonElement>("[data-action='delete']")?.addEventListener("click", () => {
      const index = comments.findIndex((item) => item.id === comment.id);
      if (index >= 0) comments.splice(index, 1);
      renderAll();
    });
    commentListEl.appendChild(card);
  }
}

function getSelectionInResponse(): PendingSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!responseContentEl.contains(range.commonAncestorContainer)) return null;

  const text = selection.toString().trim();
  if (!text) return null;

  const preRange = range.cloneRange();
  preRange.selectNodeContents(responseContentEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + selection.toString().length;

  return { text, startOffset, endOffset };
}

function isTextEntryElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}

function isTextEntryEvent(event: KeyboardEvent): boolean {
  const pathHasTextEntry = event.composedPath().some((item) => {
    return item instanceof Element && isTextEntryElement(item);
  });
  if (pathHasTextEntry) return true;

  return isTextEntryElement(document.activeElement);
}

function commentCurrentSelection(): void {
  const selection = getSelectionInResponse();
  if (!selection) {
    flash("Select text in the response first.");
    return;
  }
  openCommentModal(selection);
}

function openCommentModal(selection: PendingSelection): void {
  pendingSelection = selection;
  editingCommentId = null;
  modalSelectionEl.textContent = selection.text;
  modalKindEl.value = "feedback";
  modalCommentEl.value = "";
  modalSaveButton.textContent = "Add comment";
  modalEl.classList.add("open");
  modalCommentEl.focus();
}

function editComment(comment: ResponseReviewComment): void {
  pendingSelection = {
    text: comment.selectedText,
    startOffset: comment.startOffset,
    endOffset: comment.endOffset,
  };
  editingCommentId = comment.id;
  modalSelectionEl.textContent = comment.selectedText;
  modalKindEl.value = comment.kind;
  modalCommentEl.value = comment.comment;
  modalSaveButton.textContent = "Save comment";
  modalEl.classList.add("open");
  modalCommentEl.focus();
}

function closeModal(): void {
  pendingSelection = null;
  editingCommentId = null;
  modalEl.classList.remove("open");
}

function saveModalComment(): void {
  const selection = pendingSelection;
  const commentText = modalCommentEl.value.trim();
  if (!selection) return;
  if (!commentText) {
    flash("Add a comment before saving.");
    return;
  }

  if (editingCommentId) {
    const existing = comments.find((comment) => comment.id === editingCommentId);
    if (existing) {
      existing.kind = modalKindEl.value as ResponseReviewCommentKind;
      existing.comment = commentText;
    }
  } else {
    comments.push({
      id: `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      responseId: activeResponseId,
      kind: modalKindEl.value as ResponseReviewCommentKind,
      selectedText: selection.text,
      comment: commentText,
      ...(selection.startOffset !== undefined ? { startOffset: selection.startOffset } : {}),
      ...(selection.endOffset !== undefined ? { endOffset: selection.endOffset } : {}),
    });
  }

  closeModal();
  renderAll();
  flash("Comment added to review queue.");
}

function jumpToComment(comment: ResponseReviewComment): void {
  activeResponseId = comment.responseId;
  renderAll();
  window.setTimeout(() => {
    const exact = findTextElement(responseContentEl, comment.selectedText);
    if (exact) {
      exact.scrollIntoView({ behavior: "smooth", block: "center" });
      exact.classList.add("search-match");
      window.setTimeout(() => exact.classList.remove("search-match"), 1800);
      return;
    }
    responseScrollEl.scrollTo({ top: 0, behavior: "smooth" });
  }, 50);
}

function findTextElement(root: HTMLElement, text: string): HTMLElement | null {
  const needle = shortText(text, 80).toLowerCase();
  if (!needle) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode() as HTMLElement | null;
  while (node) {
    if (["P", "PRE", "H1", "H2", "H3"].includes(node.tagName)) {
      const haystack = node.textContent?.toLowerCase() ?? "";
      if (haystack.includes(needle.slice(0, Math.min(needle.length, 40)))) return node;
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return null;
}

function renderAll(): void {
  renderResponses();
  renderActiveResponse();
  renderComments();
}

function submit(): void {
  if (submitPending) return;
  submitPending = true;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting…";
  send({
    type: "submit",
    requestId: `submit-${Date.now()}`,
    activeResponseId,
    overallComment: overallCommentEl.value,
    draft: draftEl.value,
    comments: [...comments],
  });
}

function cancel(): void {
  send({ type: "cancel" });
  window.glimpse?.close();
}

window.__responseReviewReceive = (message: ResponseReviewHostMessage): void => {
  if (message.type !== "submit-ack") return;
  flash(
    `Submitted ${message.commentCount} comment${message.commentCount === 1 ? "" : "s"}${message.hasOverallComment ? " with overall feedback" : ""}.`,
  );
};

responseSearchEl.addEventListener("input", () => {
  responseFilter = responseSearchEl.value;
  renderResponses();
});

commentSelectionButton.addEventListener("click", commentCurrentSelection);

copySelectionButton.addEventListener("click", () => {
  void (async () => {
    const selection = getSelectionInResponse();
    if (!selection) {
      flash("Select text in the response first.");
      return;
    }
    await navigator.clipboard?.writeText(selection.text);
    flash("Copied selection.");
  })();
});

submitButton.addEventListener("click", submit);
cancelButton.addEventListener("click", cancel);
modalCancelButton.addEventListener("click", closeModal);
modalSaveButton.addEventListener("click", saveModalComment);
modalEl.addEventListener("click", (event) => {
  if (event.target === modalEl) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalEl.classList.contains("open")) {
    closeModal();
    return;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    submit();
    return;
  }

  const wantsCommentShortcut =
    event.key.toLowerCase() === "c" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey;
  if (wantsCommentShortcut && !modalEl.classList.contains("open") && !isTextEntryEvent(event)) {
    const selection = getSelectionInResponse();
    if (!selection) return;
    event.preventDefault();
    openCommentModal(selection);
  }
});

renderAll();
