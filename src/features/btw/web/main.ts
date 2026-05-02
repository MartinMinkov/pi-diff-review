type BtwThreadMode = "contextual" | "tangent";
type SessionThinkingLevel = string;
type SessionModel = { provider: string; id: string; api: string };

type BtwTranscriptEntry =
  | { id: number; turnId: number; type: "turn-boundary"; phase: "start" | "end" }
  | { id: number; turnId: number; type: "user-message"; text: string }
  | { id: number; turnId: number; type: "thinking"; text: string; streaming: boolean }
  | { id: number; turnId: number; type: "assistant-text"; text: string; streaming: boolean }
  | { id: number; turnId: number; type: "tool-call"; toolCallId: string; toolName: string; args: string }
  | {
      id: number;
      turnId: number;
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      content: string;
      truncated: boolean;
      isError: boolean;
      streaming: boolean;
    };

type BtwWorkspaceState = {
  mode: BtwThreadMode;
  status: string | null;
  draft: string;
  entries: BtwTranscriptEntry[];
  completedExchanges: number;
  streaming: boolean;
  modelOverride: SessionModel | null;
  thinkingOverride: SessionThinkingLevel | null;
};

type BtwWindowMessage =
  | { type: "submit"; value: string }
  | { type: "command"; name: string; args?: string }
  | { type: "set-draft"; value: string }
  | { type: "close" };

type BtwHostMessage = { type: "state"; state: BtwWorkspaceState };

declare global {
  interface Window {
    glimpse?: { send(payload: unknown): void; close(): void };
    __btwReceive?: (message: BtwHostMessage) => void;
  }
}

let state = JSON.parse(document.getElementById("btw-data")?.textContent ?? "{}") as BtwWorkspaceState;

const titleEl = must<HTMLDivElement>("title");
const subtitleEl = must<HTMLDivElement>("subtitle");
const transcriptEl = must<HTMLDivElement>("transcript");
const statusEl = must<HTMLDivElement>("status");
const composerEl = must<HTMLTextAreaElement>("composer");
const threadSummaryEl = must<HTMLDivElement>("thread-summary");
const modelInputEl = must<HTMLInputElement>("model-input");
const thinkingInputEl = must<HTMLInputElement>("thinking-input");

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function send(message: BtwWindowMessage): void {
  window.glimpse?.send(message);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textPreview(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function entryHtml(entry: BtwTranscriptEntry): string {
  switch (entry.type) {
    case "turn-boundary":
      return entry.phase === "start" ? `<div class="my-5 border-t border-review-border"></div>` : "";
    case "user-message":
      return `
        <div class="mb-4">
          <div class="mb-1 text-[11px] font-extrabold uppercase text-review-accent">You</div>
          <div class="whitespace-pre-wrap rounded-xl border border-review-border bg-review-panel-2 p-3 text-sm leading-6">${escapeHtml(entry.text)}</div>
        </div>`;
    case "thinking":
      return `
        <div class="mb-4 opacity-90">
          <div class="mb-1 text-[11px] font-extrabold uppercase text-yellow-400">Thinking ${entry.streaming ? "▍" : ""}</div>
          <div class="whitespace-pre-wrap border-l-2 border-yellow-500/50 pl-3 text-sm italic leading-6 text-yellow-100/80">${escapeHtml(textPreview(entry.text, 1600))}</div>
        </div>`;
    case "assistant-text":
      return `
        <div class="mb-4">
          <div class="mb-1 text-[11px] font-extrabold uppercase text-green-400">Assistant ${entry.streaming ? "▍" : ""}</div>
          <div class="whitespace-pre-wrap rounded-xl border border-review-border bg-[#0f141b] p-3 text-sm leading-6">${escapeHtml(entry.text)}</div>
        </div>`;
    case "tool-call":
      return `
        <div class="mb-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs">
          <span class="font-bold text-yellow-300">Tool</span>
          <span class="font-bold"> ${escapeHtml(entry.toolName)}</span>
          <span class="text-review-muted"> ${escapeHtml(entry.args)}</span>
        </div>`;
    case "tool-result":
      return `
        <div class="mb-3 ml-4 rounded-lg border ${entry.isError ? "border-red-500/40 bg-red-500/10" : "border-review-border bg-review-panel-2"} p-2 text-xs">
          <div class="mb-1 font-bold ${entry.isError ? "text-red-300" : "text-review-muted"}">↳ ${entry.streaming ? "streaming result" : "result"}${entry.truncated ? " (truncated)" : ""}</div>
          <pre class="whitespace-pre-wrap font-mono leading-5 ${entry.isError ? "text-red-200" : "text-review-muted"}">${escapeHtml(entry.content)}</pre>
        </div>`;
  }
}

function render(): void {
  titleEl.textContent = state.mode === "tangent" ? "BTW tangent" : "BTW";
  subtitleEl.textContent = state.mode === "tangent" ? "Contextless side conversation" : "Parallel side conversation with main-session context";
  statusEl.textContent = state.status ?? "Ready. Ask a side question.";
  threadSummaryEl.innerHTML = `
    <div>${state.completedExchanges} exchange${state.completedExchanges === 1 ? "" : "s"}</div>
    <div class="mt-1 text-review-muted">${state.streaming ? "Streaming" : "Idle"}</div>
    <div class="mt-3 text-review-muted">Mode: ${escapeHtml(state.mode)}</div>
    <div class="mt-3 text-review-muted">Model: ${escapeHtml(state.modelOverride ? `${state.modelOverride.provider}/${state.modelOverride.id}` : "inherits main")}</div>
    <div class="mt-1 text-review-muted">Thinking: ${escapeHtml(state.thinkingOverride ?? "inherits main")}</div>
  `;

  if (document.activeElement !== composerEl && composerEl.value !== state.draft) {
    composerEl.value = state.draft;
  }

  transcriptEl.innerHTML = state.entries.length
    ? state.entries.map(entryHtml).join("\n")
    : `<div class="mx-auto mt-16 max-w-xl rounded-xl border border-review-border bg-review-panel-2 p-6 text-center text-review-muted">No BTW thread yet. Ask a side question to start one.</div>`;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function submitComposer(): void {
  const value = composerEl.value.trim();
  if (!value) return;
  send({ type: "submit", value });
}

function sendCommand(name: string, args = ""): void {
  send({ type: "command", name, args });
}

composerEl.addEventListener("input", () => send({ type: "set-draft", value: composerEl.value }));
composerEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitComposer();
  }
  if (event.key === "Escape") {
    send({ type: "close" });
  }
});

must<HTMLButtonElement>("send-button").addEventListener("click", submitComposer);
must<HTMLButtonElement>("close-button").addEventListener("click", () => send({ type: "close" }));
must<HTMLButtonElement>("new-button").addEventListener("click", () => sendCommand("btw:new"));
must<HTMLButtonElement>("tangent-button").addEventListener("click", () => sendCommand("btw:tangent"));
must<HTMLButtonElement>("inject-button").addEventListener("click", () => sendCommand("btw:inject"));
must<HTMLButtonElement>("summarize-button").addEventListener("click", () => sendCommand("btw:summarize"));
must<HTMLButtonElement>("clear-button").addEventListener("click", () => sendCommand("btw:clear"));
must<HTMLButtonElement>("model-set-button").addEventListener("click", () => sendCommand("btw:model", modelInputEl.value));
must<HTMLButtonElement>("model-clear-button").addEventListener("click", () => sendCommand("btw:model", "clear"));
must<HTMLButtonElement>("thinking-set-button").addEventListener("click", () => sendCommand("btw:thinking", thinkingInputEl.value));
must<HTMLButtonElement>("thinking-clear-button").addEventListener("click", () => sendCommand("btw:thinking", "clear"));

window.__btwReceive = (message: BtwHostMessage) => {
  if (message.type !== "state") return;
  state = message.state;
  render();
};

render();
composerEl.focus();
