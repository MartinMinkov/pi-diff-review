(() => {
  // src/features/btw/web/main.ts
  var state = JSON.parse(document.getElementById("btw-data")?.textContent ?? "{}");
  var titleEl = must("title");
  var subtitleEl = must("subtitle");
  var transcriptEl = must("transcript");
  var statusEl = must("status");
  var composerEl = must("composer");
  var threadSummaryEl = must("thread-summary");
  var modelInputEl = must("model-input");
  var thinkingInputEl = must("thinking-input");
  function must(id) {
    const element = document.getElementById(id);
    if (!element)
      throw new Error(`Missing #${id}`);
    return element;
  }
  function send(message) {
    window.glimpse?.send(message);
  }
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function textPreview(value, max = 500) {
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }
  function entryHtml(entry) {
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
  function render() {
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
    transcriptEl.innerHTML = state.entries.length ? state.entries.map(entryHtml).join(`
`) : `<div class="mx-auto mt-16 max-w-xl rounded-xl border border-review-border bg-review-panel-2 p-6 text-center text-review-muted">No BTW thread yet. Ask a side question to start one.</div>`;
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
  function submitComposer() {
    const value = composerEl.value.trim();
    if (!value)
      return;
    send({ type: "submit", value });
  }
  function sendCommand(name, args = "") {
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
  must("send-button").addEventListener("click", submitComposer);
  must("close-button").addEventListener("click", () => send({ type: "close" }));
  must("new-button").addEventListener("click", () => sendCommand("btw:new"));
  must("tangent-button").addEventListener("click", () => sendCommand("btw:tangent"));
  must("inject-button").addEventListener("click", () => sendCommand("btw:inject"));
  must("summarize-button").addEventListener("click", () => sendCommand("btw:summarize"));
  must("clear-button").addEventListener("click", () => sendCommand("btw:clear"));
  must("model-set-button").addEventListener("click", () => sendCommand("btw:model", modelInputEl.value));
  must("model-clear-button").addEventListener("click", () => sendCommand("btw:model", "clear"));
  must("thinking-set-button").addEventListener("click", () => sendCommand("btw:thinking", thinkingInputEl.value));
  must("thinking-clear-button").addEventListener("click", () => sendCommand("btw:thinking", "clear"));
  window.__btwReceive = (message) => {
    if (message.type !== "state")
      return;
    state = message.state;
    render();
  };
  render();
  composerEl.focus();
})();
