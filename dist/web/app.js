(() => {
  // src/web/shared/lib/utils.ts
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function inferLanguage(path) {
    if (!path)
      return "plaintext";
    const lower = path.toLowerCase();
    if (lower.endsWith(".ts") || lower.endsWith(".tsx"))
      return "typescript";
    if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
      return "javascript";
    }
    if (lower.endsWith(".json"))
      return "json";
    if (lower.endsWith(".md"))
      return "markdown";
    if (lower.endsWith(".css"))
      return "css";
    if (lower.endsWith(".html"))
      return "html";
    if (lower.endsWith(".sh"))
      return "shell";
    if (lower.endsWith(".yml") || lower.endsWith(".yaml"))
      return "yaml";
    if (lower.endsWith(".rs"))
      return "rust";
    if (lower.endsWith(".java"))
      return "java";
    if (lower.endsWith(".kt"))
      return "kotlin";
    if (lower.endsWith(".py"))
      return "python";
    if (lower.endsWith(".go"))
      return "go";
    return "plaintext";
  }
  function scopeLabel(scope) {
    switch (scope) {
      case "git-diff":
        return "Git diff";
      case "last-commit":
        return "Last commit";
      default:
        return "All files";
    }
  }
  function scopeHint(scope) {
    switch (scope) {
      case "git-diff":
        return "Working tree against HEAD. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, S for changed symbols, E to ask the agent about the current selection, and Cmd/Ctrl+Shift+P for clipboard commands.";
      case "last-commit":
        return "Last commit against its parent. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, S for changed symbols, E to ask the agent about the current selection, and Cmd/Ctrl+Shift+P for clipboard commands.";
      default:
        return "Current working tree snapshot. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, S for changed symbols, E to ask the agent about the current selection, and Cmd/Ctrl+Shift+P for clipboard commands.";
    }
  }
  function statusLabel(status) {
    if (!status)
      return "";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  function statusBadgeClass(status) {
    switch (status) {
      case "added":
        return "text-[#3fb950]";
      case "deleted":
        return "text-[#f85149]";
      case "renamed":
        return "text-[#d29922]";
      default:
        return "text-[#58a6ff]";
    }
  }
  function getFileSearchPath(file) {
    return file?.path || "";
  }
  function buildTree(files) {
    const root = {
      name: "",
      path: "",
      kind: "dir",
      children: new Map,
      file: null
    };
    for (const file of files) {
      const path = getFileSearchPath(file);
      const parts = path.split("/");
      let node = root;
      let currentPath = "";
      for (let i = 0;i < parts.length; i += 1) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!node.children.has(part)) {
          node.children.set(part, {
            name: part,
            path: currentPath,
            kind: isLeaf ? "file" : "dir",
            children: new Map,
            file: isLeaf ? file : null
          });
        }
        node = node.children.get(part);
        if (isLeaf)
          node.file = file;
      }
    }
    return root;
  }

  // src/shared/lib/navigation.ts
  var SEMANTIC_DEFINITION_LANGUAGE_SET = new Set([
    "rust",
    "go",
    "typescript",
    "javascript"
  ]);
  function supportsSemanticDefinition(languageId) {
    return SEMANTIC_DEFINITION_LANGUAGE_SET.has(languageId);
  }
  function navigationActionLabel(languageId) {
    return supportsSemanticDefinition(languageId) ? "open definition" : "open module/import target";
  }

  // src/web/app/shared/review-helpers.ts
  function getCommentKind(comment) {
    return comment.kind ?? "feedback";
  }
  function getCommentKindLabel(kind) {
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
  function createComment(partial) {
    return {
      id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
      kind: partial.kind ?? "feedback",
      ...partial
    };
  }
  function escapeForClipboard(value) {
    return value.replace(/\r\n/g, `
`);
  }
  async function writeToClipboard(value) {
    const text = escapeForClipboard(value);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
  function sameNavigationTarget(left, right) {
    if (!left || !right)
      return false;
    return left.fileId === right.fileId && left.scope === right.scope && left.side === right.side && left.line === right.line && left.column === right.column;
  }

  // src/web/app/models/review-file-model.ts
  function createReviewFileModel(options) {
    const { reviewDataFiles, state, isFileReviewed } = options;
    function getScopedFiles() {
      switch (state.currentScope) {
        case "git-diff":
          return reviewDataFiles.filter((file) => file.inGitDiff);
        case "last-commit":
          return reviewDataFiles.filter((file) => file.inLastCommit);
        default:
          return reviewDataFiles.filter((file) => file.hasWorkingTreeFile);
      }
    }
    function ensureActiveFileForScope() {
      const scopedFiles = getScopedFiles();
      if (scopedFiles.length === 0) {
        state.activeFileId = null;
        return;
      }
      if (scopedFiles.some((file) => file.id === state.activeFileId)) {
        return;
      }
      state.activeFileId = scopedFiles[0].id;
    }
    function activeFile() {
      return reviewDataFiles.find((file) => file.id === state.activeFileId) ?? null;
    }
    function getScopeComparison(file, scope = state.currentScope) {
      if (!file)
        return null;
      if (scope === "git-diff")
        return file.gitDiff;
      if (scope === "last-commit")
        return file.lastCommit;
      return null;
    }
    function activeComparison() {
      return getScopeComparison(activeFile(), state.currentScope);
    }
    function activeFileShowsDiff() {
      return activeComparison() != null;
    }
    function getScopeFilePath(file) {
      const comparison = getScopeComparison(file, state.currentScope);
      return comparison?.newPath || comparison?.oldPath || file?.path || "";
    }
    function getScopeDisplayPath(file, scope = state.currentScope) {
      const comparison = getScopeComparison(file, scope);
      return comparison?.displayPath || file?.path || "";
    }
    function getScopeSidePath(file, scope, side) {
      const comparison = getScopeComparison(file, scope);
      if (!comparison)
        return file?.path || "";
      if (side === "original") {
        return comparison.oldPath || comparison.newPath || file?.path || "";
      }
      return comparison.newPath || comparison.oldPath || file?.path || "";
    }
    function getActiveStatus(file) {
      const comparison = getScopeComparison(file, state.currentScope);
      return comparison?.status ?? file?.worktreeStatus ?? null;
    }
    function getFilteredFiles() {
      return getScopedFiles().filter((file) => {
        if (state.showChangedFilesOnly) {
          const changed = file.worktreeStatus != null || file.inGitDiff || file.inLastCommit;
          if (!changed)
            return false;
        }
        if (state.statusFilter !== "all") {
          const status = getActiveStatus(file) ?? file.worktreeStatus;
          if (status !== state.statusFilter)
            return false;
        }
        if (state.hideReviewedFiles && isFileReviewed(file.id)) {
          return false;
        }
        if (state.showCommentedFilesOnly) {
          const hasComments = state.comments.some((comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.status === "submitted");
          if (!hasComments)
            return false;
        }
        return true;
      });
    }
    return {
      getScopedFiles,
      ensureActiveFileForScope,
      activeFile,
      getScopeComparison,
      activeComparison,
      activeFileShowsDiff,
      getScopeFilePath,
      getScopeDisplayPath,
      getScopeSidePath,
      getActiveStatus,
      getFilteredFiles
    };
  }

  // src/web/app/search/review-code-search.ts
  function createReviewCodeSearchController(options) {
    const {
      scope,
      getScopedFiles,
      getScopeComparison,
      getScopeSidePath,
      loadFileContents,
      onStateChange
    } = options;
    const state = {
      query: "",
      searching: false,
      results: []
    };
    let debounceTimeout = null;
    let sequence = 0;
    const lineCache = new Map;
    function getState() {
      return state;
    }
    function clear() {
      sequence += 1;
      state.query = "";
      state.searching = false;
      state.results = [];
    }
    function collectMatches(file, contents, query) {
      if (!contents)
        return [];
      const currentScope = scope();
      const loweredQuery = query.toLowerCase();
      const matches = [];
      const comparison = getScopeComparison(file, currentScope);
      const candidates = [];
      if (currentScope === "all-files") {
        candidates.push({
          side: "modified",
          path: file.path,
          content: contents.modifiedContent
        });
      } else {
        if (comparison?.hasOriginal) {
          candidates.push({
            side: "original",
            path: getScopeSidePath(file, currentScope, "original"),
            content: contents.originalContent
          });
        }
        if (comparison?.hasModified) {
          candidates.push({
            side: "modified",
            path: getScopeSidePath(file, currentScope, "modified"),
            content: contents.modifiedContent
          });
        }
      }
      for (const candidate of candidates) {
        const lines = candidate.content.split(/\r?\n/);
        const cacheKey = `${currentScope}:${file.id}:${candidate.side}`;
        const cached = lineCache.get(cacheKey);
        const indexed = cached && cached.content === candidate.content ? cached : {
          content: candidate.content,
          lines,
          loweredLines: lines.map((line) => line.toLowerCase())
        };
        if (indexed !== cached) {
          lineCache.set(cacheKey, indexed);
        }
        for (let index = 0;index < indexed.lines.length; index += 1) {
          const lineText = indexed.lines[index] ?? "";
          const loweredLine = indexed.loweredLines[index] ?? "";
          const matchIndex = loweredLine.indexOf(loweredQuery);
          if (matchIndex === -1)
            continue;
          matches.push({
            target: {
              fileId: file.id,
              scope: currentScope,
              side: candidate.side,
              line: index + 1,
              column: matchIndex + 1
            },
            path: candidate.path,
            lineNumber: index + 1,
            lineText,
            matchStartColumn: matchIndex + 1,
            matchEndColumn: matchIndex + trimmedQueryLength(query)
          });
          if (matches.length >= 5) {
            return matches;
          }
        }
      }
      return matches;
    }
    function trimmedQueryLength(query) {
      return Math.max(1, query.trim().length);
    }
    async function run(query) {
      const trimmedQuery = query.trim();
      const runSequence = ++sequence;
      const currentScope = scope();
      if (trimmedQuery.length < 2) {
        clear();
        onStateChange();
        return;
      }
      state.query = trimmedQuery;
      state.searching = true;
      state.results = [];
      onStateChange();
      const loadedFiles = await Promise.all(getScopedFiles().map(async (file) => ({
        file,
        contents: await loadFileContents(file.id, currentScope)
      })));
      if (runSequence !== sequence) {
        return;
      }
      state.query = trimmedQuery;
      state.searching = false;
      state.results = loadedFiles.flatMap(({ file, contents }) => collectMatches(file, contents, trimmedQuery)).sort((left, right) => {
        if (left.path !== right.path)
          return left.path.localeCompare(right.path);
        if (left.lineNumber !== right.lineNumber) {
          return left.lineNumber - right.lineNumber;
        }
        return left.target.side.localeCompare(right.target.side);
      }).slice(0, 60);
      onStateChange();
    }
    function schedule(query) {
      if (debounceTimeout != null) {
        window.clearTimeout(debounceTimeout);
      }
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 2) {
        clear();
        onStateChange();
        return;
      }
      state.query = trimmedQuery;
      state.searching = true;
      state.results = [];
      onStateChange();
      debounceTimeout = window.setTimeout(() => {
        debounceTimeout = null;
        run(query);
      }, 160);
    }
    function refresh(query) {
      run(query);
    }
    return {
      getState,
      clear,
      schedule,
      refresh
    };
  }

  // src/web/features/comments/modals.ts
  function getCommentKindLabel2(kind) {
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
  function insertAtCursor(textarea, value) {
    const before = textarea.value.slice(0, textarea.selectionStart ?? textarea.value.length);
    const after = textarea.value.slice(textarea.selectionEnd ?? textarea.value.length);
    const nextValue = `${before}${value}${after}`;
    textarea.value = nextValue;
    const cursor = (textarea.selectionStart ?? textarea.value.length) + value.length;
    textarea.setSelectionRange(cursor, cursor);
  }
  function setupPasteHandler(textarea) {
    textarea.addEventListener("paste", (event) => {
      const pasteData = event.clipboardData;
      const text = pasteData?.getData("text/plain");
      if (text == null)
        return;
      event.preventDefault();
      insertAtCursor(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  function showTextModal(options) {
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
    const textarea = backdrop.querySelector("#review-modal-text");
    const cancelButton = backdrop.querySelector("#review-modal-cancel");
    const saveButton = backdrop.querySelector("#review-modal-save");
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
  function showCommentEditModal(options) {
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
    const textarea = backdrop.querySelector("#review-comment-body");
    const kindSelect = backdrop.querySelector("#review-comment-kind");
    const cancelButton = backdrop.querySelector("#review-comment-cancel");
    const saveButton = backdrop.querySelector("#review-comment-save");
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
      if (!body)
        return;
      options.onSave({
        body,
        kind: kindSelect?.value ?? "feedback"
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
  function showReferenceModal(options) {
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
    const closeButton = backdrop.querySelector("#review-modal-close");
    const listEl = backdrop.querySelector("#review-reference-list");
    const filterButtons = backdrop.querySelectorAll("[data-filter]");
    const close = () => backdrop.remove();
    const filters = {
      changed: false,
      scope: false
    };
    function renderItems() {
      if (!listEl)
        return;
      const filteredItems = options.items.filter((item) => {
        if (filters.changed && !item.isChanged)
          return false;
        if (filters.scope && !item.isCurrentScope)
          return false;
        return true;
      });
      listEl.innerHTML = filteredItems.length > 0 ? filteredItems.map((item, index) => `
                <button data-reference-index="${index}" class="w-full rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <div class="text-sm font-medium text-review-text">${escapeHtml(item.title)}</div>
                  <div class="mt-1 text-xs text-review-muted">${escapeHtml(item.description)}</div>
                  ${item.preview ? `<div class="mt-2 truncate text-xs text-[#8b949e]">${escapeHtml(item.preview)}</div>` : ""}
                </button>
              `).join("") : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">${escapeHtml(options.emptyLabel ?? "No references found.")}</div>`;
      listEl.querySelectorAll("[data-reference-index]").forEach((node) => {
        node.addEventListener("click", () => {
          const index = Number(node.getAttribute("data-reference-index") || "-1");
          const filtered = options.items.filter((item2) => {
            if (filters.changed && !item2.isChanged)
              return false;
            if (filters.scope && !item2.isCurrentScope)
              return false;
            return true;
          });
          const item = filtered[index];
          if (!item)
            return;
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
        const key = button.getAttribute("data-filter");
        if (!key)
          return;
        filters[key] = !filters[key];
        button.className = filters[key] ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-3 py-1 text-xs font-medium text-[#3fb950] hover:bg-[#238636]/25" : "cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]";
        renderItems();
      });
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close();
      }
    });
    renderItems();
    listEl?.querySelector("[data-reference-index]")?.focus();
  }
  function showPeekModal(options) {
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
    const closeButton = backdrop.querySelector("#review-modal-close");
    const openButton = backdrop.querySelector("#review-modal-open");
    const close = () => backdrop.remove();
    closeButton?.addEventListener("click", close);
    openButton?.addEventListener("click", () => {
      options.onOpen();
      close();
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop)
        close();
    });
  }
  function showActionModal(options) {
    const backdrop = document.createElement("div");
    backdrop.className = "review-modal-backdrop";
    backdrop.innerHTML = `
    <div class="review-modal-card">
      <div class="mb-2 text-base font-semibold text-white">${escapeHtml(options.title)}</div>
      <div class="mb-4 text-sm text-review-muted">${escapeHtml(options.description)}</div>
      <div class="space-y-2">
        ${options.actions.map((action, index) => `
              <button data-action-index="${index}" class="w-full rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                <div class="text-sm font-medium text-review-text">${escapeHtml(action.label)}</div>
                <div class="mt-1 text-xs leading-5 text-review-muted">${escapeHtml(action.description)}</div>
              </button>
            `).join("")}
      </div>
      <div class="mt-4 flex justify-end">
        <button id="review-modal-close" class="cursor-pointer rounded-md border border-review-border bg-review-panel px-4 py-2 text-sm font-medium text-review-text hover:bg-[#21262d]">Close</button>
      </div>
    </div>
  `;
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector("#review-modal-close")?.addEventListener("click", close);
    backdrop.querySelectorAll("[data-action-index]").forEach((node) => {
      node.addEventListener("click", () => {
        const index = Number(node.getAttribute("data-action-index") || "-1");
        const action = options.actions[index];
        if (!action)
          return;
        action.onSelect();
        close();
      });
    });
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop)
        close();
    });
  }
  function showSymbolModal(options) {
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
    const searchInput = backdrop.querySelector("#review-symbol-search");
    const listEl = backdrop.querySelector("#review-symbol-list");
    const close = () => backdrop.remove();
    function render(query = "") {
      if (!listEl)
        return;
      const normalized = query.trim().toLowerCase();
      const items = options.items.filter((item) => {
        if (!normalized)
          return true;
        return `${item.title} ${item.description} ${item.kind}`.toLowerCase().includes(normalized);
      });
      listEl.innerHTML = items.length > 0 ? items.map((item, index) => `
                <button data-symbol-index="${index}" class="flex w-full items-center justify-between gap-3 rounded-md border border-review-border bg-[#010409] px-4 py-3 text-left hover:bg-[#11161d]">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-review-text">${escapeHtml(item.title)}</span>
                    <span class="mt-1 block truncate text-xs text-review-muted">${escapeHtml(item.description)}</span>
                  </span>
                  <span class="shrink-0 rounded-md border border-review-border bg-review-panel px-2 py-0.5 text-[11px] font-medium text-review-muted">${escapeHtml(item.kind)}</span>
                </button>
              `).join("") : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">No symbols match this filter.</div>`;
      listEl.querySelectorAll("[data-symbol-index]").forEach((node) => {
        node.addEventListener("click", () => {
          const index = Number(node.getAttribute("data-symbol-index") || "-1");
          const filtered = options.items.filter((item) => {
            if (!normalized)
              return true;
            return `${item.title} ${item.description} ${item.kind}`.toLowerCase().includes(normalized);
          });
          filtered[index]?.onSelect();
          close();
        });
      });
    }
    backdrop.querySelector("#review-modal-close")?.addEventListener("click", close);
    searchInput?.addEventListener("input", () => render(searchInput.value));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop)
        close();
    });
    render();
    searchInput?.focus();
  }
  function showCommandPaletteModal(options) {
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
    const searchInput = backdrop.querySelector("#review-command-search");
    const listEl = backdrop.querySelector("#review-command-list");
    let activeIndex = 0;
    const close = () => {
      document.removeEventListener("keydown", onKeyDown, true);
      backdrop.remove();
    };
    function getFilteredItems() {
      const query = (searchInput?.value || "").trim().toLowerCase();
      if (!query)
        return options.items;
      return options.items.filter((item) => `${item.label} ${item.detail || ""} ${item.hint || ""}`.toLowerCase().includes(query));
    }
    function render() {
      if (!listEl)
        return;
      const items = getFilteredItems();
      if (activeIndex >= items.length) {
        activeIndex = Math.max(0, items.length - 1);
      }
      listEl.innerHTML = items.length > 0 ? items.map((item, index) => `
                <button data-command-index="${index}" class="${index === activeIndex ? "border-blue-500 bg-[#11161d]" : "border-review-border bg-[#010409] hover:bg-[#11161d]"} flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left focus:outline-none">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-review-text">${escapeHtml(item.label)}</span>
                    ${item.detail ? `<span class="mt-1 block truncate text-xs text-review-muted">${escapeHtml(item.detail)}</span>` : ""}
                  </span>
                  ${item.hint ? `<span class="shrink-0 text-[11px] text-review-muted">${escapeHtml(item.hint)}</span>` : ""}
                </button>
              `).join("") : `<div class="rounded-md border border-review-border bg-[#010409] px-4 py-4 text-sm text-review-muted">No commands match this filter.</div>`;
      listEl.querySelectorAll("[data-command-index]").forEach((node) => {
        node.addEventListener("click", () => {
          const index = Number(node.getAttribute("data-command-index") || "-1");
          const item = getFilteredItems()[index];
          if (!item)
            return;
          item.onSelect();
          close();
        });
      });
    }
    function runActive() {
      const item = getFilteredItems()[activeIndex];
      if (!item)
        return;
      item.onSelect();
      close();
    }
    function onKeyDown(event) {
      if (!backdrop.isConnected)
        return;
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
      if (event.target === backdrop)
        close();
    });
    document.addEventListener("keydown", onKeyDown, true);
    render();
    searchInput?.focus();
  }
  function renderCommentDOM(comment, scopeLabel2, options) {
    const container = document.createElement("div");
    container.className = "view-zone-container";
    const title = comment.side === "file" ? `File comment • ${scopeLabel2(comment.scope)}` : `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} • ${scopeLabel2(comment.scope)}`;
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
      const textarea = container.querySelector("textarea");
      const cancelButton = container.querySelector("[data-action='cancel']");
      const submitButton = container.querySelector("[data-action='submit']");
      const kindSelect = container.querySelector("[data-comment-kind]");
      if (!textarea) {
        return container;
      }
      textarea.value = comment.body || "";
      if (kindSelect) {
        kindSelect.value = comment.kind ?? "feedback";
        kindSelect.addEventListener("change", () => {
          comment.kind = kindSelect.value;
        });
      }
      setupPasteHandler(textarea);
      const syncSubmitState = () => {
        if (!submitButton)
          return;
        submitButton.disabled = textarea.value.trim().length === 0;
      };
      textarea.addEventListener("input", () => {
        comment.body = textarea.value;
        syncSubmitState();
      });
      cancelButton?.addEventListener("click", options.onDelete);
      submitButton?.addEventListener("click", () => {
        const body = textarea.value.trim();
        if (!body)
          return;
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
    const preview = comment.body.trim().split(`
`)[0] || "Comment";
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
              <span class="shrink-0 rounded-md border border-review-border bg-[#0d1117] px-2 py-0.5 text-[10px] font-medium text-review-muted">${escapeHtml(getCommentKindLabel2(kind))}</span>
            </span>
            ${comment.collapsed ? `<span class="mt-0.5 block truncate text-xs text-review-muted">${escapeHtml(preview)}</span>` : ""}
          </span>
        </button>
        <button data-action="edit" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-[#11161d] hover:text-review-text">Edit</button>
        ${comment.collapsed ? "" : `<button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>`}
      </div>
      ${comment.collapsed ? "" : `<div class="border-t border-review-border px-3 py-3 whitespace-pre-wrap break-words text-sm text-review-text">${escapeHtml(comment.body)}</div>`}
    </div>
  `;
    const toggleButton = container.querySelector("[data-action='toggle']");
    const deleteButton = container.querySelector("[data-action='delete']");
    const editButton = container.querySelector("[data-action='edit']");
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
        }
      });
    });
    deleteButton?.addEventListener("click", options.onDelete);
    return container;
  }

  // src/web/app/commands/review-command-palette.ts
  function createReviewCommandPaletteController(options) {
    const {
      state,
      currentSymbolLabelEl,
      sidebarSearchInputEl,
      getScopedFiles,
      activeFile,
      getScopeDisplayPath,
      getActiveStatus,
      statusLabel: statusLabel2,
      scopeLabel: scopeLabel2,
      getCurrentSelectionContext,
      getCurrentNavigationTarget,
      getActiveLocationLabel,
      getSelectionReference,
      loadFileContents,
      describeNavigationTarget,
      writeToClipboard: writeToClipboard2,
      flashSummary,
      openFile,
      handleShowChangedSymbols,
      handleAgentAction,
      navigateSubmittedComment
    } = options;
    function openQuickOpenFiles() {
      const scopedFiles = getScopedFiles().slice().sort((left, right) => getScopeDisplayPath(left, state.currentScope).localeCompare(getScopeDisplayPath(right, state.currentScope)));
      showCommandPaletteModal({
        title: "Go to File",
        description: "Jump to a file in the current review scope.",
        items: scopedFiles.map((file) => ({
          label: getScopeDisplayPath(file, state.currentScope),
          detail: file.path !== getScopeDisplayPath(file, state.currentScope) ? file.path : scopeLabel2(state.currentScope),
          hint: getActiveStatus(file) != null ? statusLabel2(getActiveStatus(file)) : undefined,
          onSelect: () => {
            openFile(file.id);
          }
        }))
      });
    }
    function openCommandPalette() {
      const file = activeFile();
      const selection = getCurrentSelectionContext();
      const selectionText = selection?.selectedText.trim() || "";
      const activeLocation = getActiveLocationLabel();
      const selectionReference = getSelectionReference();
      showCommandPaletteModal({
        title: "Command Palette",
        description: "Fast review commands for copying context and moving around the diff.",
        items: [
          {
            label: "File: Copy Path of Active File",
            detail: file?.path || "No active file",
            hint: "path",
            onSelect: () => {
              (async () => {
                if (!file)
                  return;
                const success = await writeToClipboard2(file.path);
                flashSummary(success ? "Copied active file path" : "Unable to copy");
              })();
            }
          },
          {
            label: "File: Copy Location of Active Cursor",
            detail: activeLocation || "No active cursor location",
            hint: "path:line",
            onSelect: () => {
              (async () => {
                if (!activeLocation)
                  return;
                const success = await writeToClipboard2(activeLocation);
                flashSummary(success ? "Copied active location" : "Unable to copy");
              })();
            }
          },
          {
            label: "File: Copy Selection Location",
            detail: selectionReference || "No current selection",
            hint: "range",
            onSelect: () => {
              (async () => {
                if (!selectionReference)
                  return;
                const success = await writeToClipboard2(selectionReference);
                flashSummary(success ? "Copied selection location" : "Unable to copy");
              })();
            }
          },
          {
            label: "Review: Copy Selection with Context",
            detail: selectionReference && selectionText ? `${selectionReference} plus selected code` : "Select some code first",
            hint: "snippet",
            onSelect: () => {
              (async () => {
                if (!selectionReference || !selectionText)
                  return;
                const payload = `${selectionReference}

${selectionText}`;
                const success = await writeToClipboard2(payload);
                flashSummary(success ? "Copied selection context" : "Unable to copy");
              })();
            }
          },
          {
            label: "Review: Copy Current Hunk with Context",
            detail: file ? `${getScopeDisplayPath(file, state.currentScope)} around the current cursor` : "No active file",
            hint: "hunk",
            onSelect: () => {
              (async () => {
                const target = getCurrentNavigationTarget();
                const active = activeFile();
                if (!target || !active)
                  return;
                const contents = await loadFileContents(target.fileId, target.scope);
                const content = target.side === "original" ? contents?.originalContent ?? "" : contents?.modifiedContent ?? "";
                const start = Math.max(1, target.line - 8);
                const end = target.line + 8;
                const snippet = content.split(/\r?\n/).slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join(`
`);
                const payload = `${describeNavigationTarget(target)}

${snippet}`;
                const success = await writeToClipboard2(payload);
                flashSummary(success ? "Copied current hunk with context" : "Unable to copy");
              })();
            }
          },
          {
            label: "Symbol: Copy Current Symbol Name",
            detail: currentSymbolLabelEl.textContent || "No current symbol",
            hint: "symbol",
            onSelect: () => {
              (async () => {
                const value = currentSymbolLabelEl.textContent?.replace(/^Symbol:\s*/, "").trim();
                if (!value)
                  return;
                const success = await writeToClipboard2(value);
                flashSummary(success ? "Copied symbol name" : "Unable to copy");
              })();
            }
          },
          {
            label: "Review: Focus Code Search",
            detail: "Jump to the sidebar code search input",
            hint: "F",
            onSelect: () => {
              sidebarSearchInputEl.focus();
              sidebarSearchInputEl.select();
            }
          },
          {
            label: "File: Go to File",
            detail: "Open quick file search for the current review scope",
            hint: "Cmd/Ctrl+P",
            onSelect: () => {
              openQuickOpenFiles();
            }
          },
          {
            label: "Review: Jump to Changed Symbols",
            detail: "Open the changed-symbol navigator",
            hint: "S",
            onSelect: () => {
              handleShowChangedSymbols();
            }
          },
          {
            label: "Review: Next Submitted Comment",
            detail: "Jump to the next submitted comment in this scope",
            hint: "N",
            onSelect: () => {
              navigateSubmittedComment("next");
            }
          },
          {
            label: "Review: Previous Submitted Comment",
            detail: "Jump to the previous submitted comment in this scope",
            hint: "Shift+N",
            onSelect: () => {
              navigateSubmittedComment("previous");
            }
          },
          {
            label: "Agent: Ask About Selection",
            detail: selectionText ? "Create a focused review prompt from the current selection" : "Create a focused review prompt from the current file",
            hint: "E",
            onSelect: () => {
              handleAgentAction();
            }
          }
        ]
      });
    }
    return {
      openQuickOpenFiles,
      openCommandPalette
    };
  }

  // src/web/features/symbols/symbol-context.ts
  function getReviewSymbolContext(content, lineNumber, languageId) {
    const lines = content.split(/\r?\n/);
    const maxIndex = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
    for (let index = maxIndex;index >= 0; index -= 1) {
      const line = lines[index] || "";
      const symbol = matchSymbolLine(line, languageId);
      if (symbol) {
        return { title: symbol.title, lineNumber: index + 1 };
      }
    }
    return { title: null, lineNumber: null };
  }
  function buildPreviewSnippet(content, lineNumber, contextRadius = 3) {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0)
      return "";
    const targetIndex = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
    const start = Math.max(0, targetIndex - contextRadius);
    const end = Math.min(lines.length - 1, targetIndex + contextRadius);
    return lines.slice(start, end + 1).map((line, offset) => {
      const currentLine = start + offset + 1;
      const prefix = currentLine === targetIndex + 1 ? ">" : " ";
      return `${prefix} ${String(currentLine).padStart(4, " ")} ${line}`;
    }).join(`
`);
  }
  function extractReviewSymbols(content, languageId) {
    const items = [];
    const seen = new Set;
    content.split(/\r?\n/).forEach((line, index) => {
      const symbol = matchSymbolLine(line, languageId);
      if (!symbol)
        return;
      const key = `${symbol.kind}:${symbol.title}:${index + 1}`;
      if (seen.has(key))
        return;
      seen.add(key);
      items.push({
        title: symbol.title,
        lineNumber: index + 1,
        kind: symbol.kind
      });
    });
    return items;
  }
  function extractReviewSymbolRanges(content, languageId) {
    const items = extractReviewSymbols(content, languageId);
    const totalLines = content.length === 0 ? 0 : content.split(/\r?\n/).length;
    return items.map((item, index) => ({
      ...item,
      endLineNumber: index < items.length - 1 ? Math.max(item.lineNumber, (items[index + 1]?.lineNumber ?? item.lineNumber) - 1) : Math.max(item.lineNumber, totalLines)
    }));
  }
  function extractChangedReviewSymbols(options) {
    const originalSymbols = extractReviewSymbolRanges(options.originalContent, options.languageId);
    const modifiedSymbols = extractReviewSymbolRanges(options.modifiedContent, options.languageId);
    const primarySymbols = options.preferModified ? modifiedSymbols : originalSymbols;
    const comparisonSymbols = options.preferModified ? originalSymbols : modifiedSymbols;
    const primaryContent = options.preferModified ? options.modifiedContent : options.originalContent;
    const comparisonContent = options.preferModified ? options.originalContent : options.modifiedContent;
    if (primarySymbols.length === 0) {
      return [];
    }
    const comparisonBySignature = new Map;
    for (const symbol of comparisonSymbols) {
      const key = getSymbolSignature(symbol);
      const bucket = comparisonBySignature.get(key);
      if (bucket) {
        bucket.push(symbol);
      } else {
        comparisonBySignature.set(key, [symbol]);
      }
    }
    const seenBySignature = new Map;
    return primarySymbols.filter((symbol) => {
      const signature = getSymbolSignature(symbol);
      const occurrenceIndex = seenBySignature.get(signature) ?? 0;
      seenBySignature.set(signature, occurrenceIndex + 1);
      const match = comparisonBySignature.get(signature)?.[occurrenceIndex] ?? null;
      if (!match) {
        return true;
      }
      return getSymbolRangeContent(primaryContent, symbol) !== getSymbolRangeContent(comparisonContent, match);
    });
  }
  function matchSymbolLine(line, languageId) {
    const trimmed = line.trim();
    if (!trimmed)
      return null;
    switch (languageId) {
      case "typescript":
      case "javascript":
        return captureSymbol(trimmed, /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, "function") || captureSymbol(trimmed, /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/, "type") || captureSymbol(trimmed, /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, "type") || captureSymbol(trimmed, /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/, "type") || captureSymbol(trimmed, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/, "function") || captureSymbol(trimmed, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/, "function") || captureSymbol(trimmed, /^([A-Za-z_$][\w$]*)\s*\(/, "member");
      case "go":
        return captureSymbol(trimmed, /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/, "function") || captureSymbol(trimmed, /^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/, "type") || captureSymbol(trimmed, /^var\s+([A-Za-z_][\w]*)/, "value") || captureSymbol(trimmed, /^const\s+([A-Za-z_][\w]*)/, "value");
      case "rust":
        return captureSymbol(trimmed, /^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/, "function") || captureSymbol(trimmed, /^impl\s+([A-Za-z_][\w]*)/, "type") || captureSymbol(trimmed, /^(?:pub\s+)?(?:struct|enum|trait|mod)\s+([A-Za-z_][\w]*)/, trimmed.includes("mod ") ? "module" : "type");
      case "c":
      case "cpp":
        return captureSymbol(trimmed, /^(?:class|struct|enum)\s+([A-Za-z_][\w]*)/, "type") || captureSymbol(trimmed, /^(?:static\s+)?(?:inline\s+)?[A-Za-z_][\w:\s*&<>]*\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:\{|$)/, "function");
      default:
        return null;
    }
  }
  function captureSymbol(value, pattern, kind) {
    const match = value.match(pattern);
    return match?.[1] ? {
      title: match[1],
      lineNumber: 0,
      kind
    } : null;
  }
  function getSymbolSignature(symbol) {
    return `${symbol.kind}:${symbol.title}`;
  }
  function getSymbolRangeContent(content, symbol) {
    return content.split(/\r?\n/).slice(Math.max(0, symbol.lineNumber - 1), Math.max(symbol.lineNumber, symbol.endLineNumber)).join(`
`).trim();
  }

  // src/web/app/inspector/review-inspector.ts
  function createReviewInspectorController(options) {
    const {
      reviewDataFiles,
      state,
      changedSymbolsContainerEl,
      outlineContainerEl,
      toggleOutlineButtonEl,
      reviewQueueContainerEl,
      activeFile,
      getCurrentNavigationTarget,
      getScopeComparison,
      getScopeFilePath,
      getScopeDisplayPath,
      loadFileContents,
      openNavigationTarget,
      onCommentsChange,
      getCommentKind: getCommentKind2,
      getCommentKindLabel: getCommentKindLabel3,
      isCommentAnchorStale
    } = options;
    const outlineCache = new Map;
    let showFullOutline = false;
    function getActiveCommentQueue() {
      return state.comments.filter((comment) => comment.status === "submitted" && comment.scope === state.currentScope).sort((left, right) => {
        if (left.fileId !== right.fileId) {
          return left.fileId.localeCompare(right.fileId);
        }
        return (left.startLine ?? 0) - (right.startLine ?? 0);
      });
    }
    function getCommentLocationLabel(comment) {
      const file = reviewDataFiles.find((candidate) => candidate.id === comment.fileId) ?? null;
      const path = getScopeDisplayPath(file, comment.scope);
      if (comment.side === "file" || comment.startLine == null) {
        return path;
      }
      const suffix = comment.scope === "all-files" ? "" : comment.side === "original" ? " old" : " new";
      return `${path}:${comment.startLine}${suffix}`;
    }
    function jumpToComment(comment) {
      const file = reviewDataFiles.find((candidate) => candidate.id === comment.fileId) ?? null;
      const comparison = getScopeComparison(file, comment.scope);
      openNavigationTarget({
        fileId: comment.fileId,
        scope: comment.scope,
        side: comment.side === "file" ? comparison?.hasModified || comment.scope === "all-files" ? "modified" : "original" : comment.side === "original" ? "original" : "modified",
        line: comment.startLine ?? 1,
        column: 1
      });
    }
    function renderReviewQueue() {
      const comments = getActiveCommentQueue();
      reviewQueueContainerEl.innerHTML = comments.length > 0 ? "" : `<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Submitted comments stay here until the review is finished.</div>`;
      comments.forEach((comment) => {
        const item = document.createElement("div");
        item.className = "rounded-md border border-review-border bg-review-panel-2 px-3 py-3";
        const kindLabel = escapeHtml(getCommentKindLabel3(getCommentKind2(comment)));
        const locationLabel = escapeHtml(getCommentLocationLabel(comment));
        const body = escapeHtml(comment.body);
        item.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <button data-action="open" class="min-w-0 flex-1 text-left">
            <div class="flex items-center gap-2">
              <div class="truncate text-xs font-semibold text-review-text">${kindLabel}</div>
              ${isCommentAnchorStale(comment) ? '<span class="shrink-0 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">Changed</span>' : ""}
            </div>
            <div class="mt-1 truncate text-[11px] text-review-muted">${locationLabel}</div>
          </button>
          <div class="flex items-center gap-2">
            <button data-action="edit" class="cursor-pointer rounded-md border border-review-border bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-review-text hover:bg-[#1a212b]">Edit</button>
            <button data-action="delete" class="cursor-pointer rounded-md border border-review-border bg-[#0d1117] px-2 py-1 text-[11px] font-medium text-review-text hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400">Delete</button>
          </div>
        </div>
        <div class="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-review-text">${body}</div>
      `;
        item.querySelector("[data-action='open']")?.addEventListener("click", () => {
          jumpToComment(comment);
        });
        item.querySelector("[data-action='edit']")?.addEventListener("click", () => {
          showCommentEditModal({
            title: "Edit submitted comment",
            description: "Update this review instruction before you finish the review.",
            initialBody: comment.body,
            initialKind: getCommentKind2(comment),
            onSave: ({ body: body2, kind }) => {
              comment.body = body2;
              comment.kind = kind;
              onCommentsChange();
            }
          });
        });
        item.querySelector("[data-action='delete']")?.addEventListener("click", () => {
          state.comments = state.comments.filter((item2) => item2.id !== comment.id);
          onCommentsChange();
        });
        reviewQueueContainerEl.appendChild(item);
      });
    }
    async function renderOutline() {
      const file = activeFile();
      const scope = state.currentScope;
      outlineContainerEl.classList.toggle("hidden", !showFullOutline);
      toggleOutlineButtonEl.textContent = showFullOutline ? "Hide" : "Show";
      if (!file) {
        changedSymbolsContainerEl.innerHTML = '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Select a file to inspect the changed symbols in it.</div>';
        outlineContainerEl.innerHTML = '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">Select a file to inspect its symbols.</div>';
        return;
      }
      const contents = await loadFileContents(file.id, scope);
      if (state.activeFileId !== file.id || state.currentScope !== scope) {
        return;
      }
      const useModified = scope === "all-files" || getScopeComparison(file, scope)?.hasModified;
      const content = useModified ? contents?.modifiedContent ?? "" : contents?.originalContent ?? "";
      const outlineKey = `${scope}:${file.id}:${useModified ? "modified" : "original"}`;
      const cached = outlineCache.get(outlineKey);
      const symbols = cached && cached.content === content ? cached.symbols : extractReviewSymbolRanges(content, inferLanguage(getScopeFilePath(file)));
      if (!cached || cached.content !== content) {
        outlineCache.set(outlineKey, { content, symbols });
      }
      const current = getCurrentNavigationTarget();
      const preferredSide = scope === "all-files" || getScopeComparison(file, scope)?.hasModified ? "modified" : "original";
      const changedSymbols = extractChangedReviewSymbols({
        originalContent: contents?.originalContent ?? "",
        modifiedContent: contents?.modifiedContent ?? "",
        languageId: inferLanguage(getScopeFilePath(file)),
        preferModified: preferredSide === "modified"
      });
      renderSymbolList({
        container: changedSymbolsContainerEl,
        file,
        scope,
        current,
        symbols: changedSymbols,
        emptyLabel: "No changed symbols were detected for this file. Open the full outline if you want the complete file structure.",
        activeSide: preferredSide,
        openNavigationTarget
      });
      if (!showFullOutline) {
        return;
      }
      if (symbols.length === 0) {
        outlineContainerEl.innerHTML = '<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">No outline entries were detected for this file.</div>';
        return;
      }
      renderSymbolList({
        container: outlineContainerEl,
        file,
        scope,
        current,
        symbols,
        emptyLabel: "No outline entries were detected for this file.",
        activeSide: preferredSide,
        openNavigationTarget
      });
    }
    async function toggleFullOutlineVisibility() {
      showFullOutline = !showFullOutline;
      await renderOutline();
    }
    function getSortedSubmittedComments() {
      const fileOrder = new Map(reviewDataFiles.map((file, index) => [file.id, index]));
      return state.comments.filter((comment) => comment.status === "submitted" && comment.scope === state.currentScope).sort((left, right) => {
        const leftOrder = fileOrder.get(left.fileId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = fileOrder.get(right.fileId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder)
          return leftOrder - rightOrder;
        return (left.startLine ?? 0) - (right.startLine ?? 0);
      });
    }
    function navigateSubmittedComment(direction) {
      const comments = getSortedSubmittedComments();
      if (comments.length === 0)
        return false;
      const current = getCurrentNavigationTarget();
      if (!current) {
        const target = direction === "next" ? comments[0] ?? null : comments[comments.length - 1] ?? null;
        if (!target)
          return false;
        jumpToComment(target);
        return true;
      }
      const currentKey = [current.fileId, current.line ?? 0, current.column ?? 0].join(":");
      const commentKeys = comments.map((comment) => [comment.fileId, comment.startLine ?? 0, 1].join(":"));
      const currentIndex = commentKeys.findIndex((key) => key >= currentKey);
      if (direction === "next") {
        if (currentIndex === -1) {
          const target = comments[0];
          if (!target)
            return false;
          jumpToComment(target);
          return true;
        }
        const candidate = comments[currentIndex];
        if (candidate && (candidate.fileId !== current.fileId || (candidate.startLine ?? 0) > (current.line ?? 0))) {
          jumpToComment(candidate);
          return true;
        }
        const wrapped = comments[(currentIndex + 1) % comments.length];
        if (!wrapped)
          return false;
        jumpToComment(wrapped);
        return true;
      }
      if (currentIndex === -1) {
        const target = comments[comments.length - 1];
        if (!target)
          return false;
        jumpToComment(target);
        return true;
      }
      const previous = currentIndex === 0 ? comments[comments.length - 1] : comments[currentIndex - 1];
      if (!previous)
        return false;
      jumpToComment(previous);
      return true;
    }
    return {
      renderReviewQueue,
      renderOutline,
      toggleFullOutlineVisibility,
      jumpToComment,
      getSortedSubmittedComments,
      navigateSubmittedComment
    };
  }
  function renderSymbolList(options) {
    const {
      container,
      file,
      scope,
      current,
      symbols,
      emptyLabel,
      activeSide,
      openNavigationTarget
    } = options;
    if (symbols.length === 0) {
      container.innerHTML = `<div class="rounded-md border border-review-border bg-[#010409] px-3 py-3 text-sm text-review-muted">${emptyLabel}</div>`;
      return;
    }
    container.innerHTML = "";
    symbols.forEach((symbol) => {
      const active = current?.fileId === file.id && current.scope === scope && current.line >= symbol.lineNumber && current.line <= (symbol.endLineNumber ?? symbol.lineNumber);
      const button = document.createElement("button");
      button.type = "button";
      button.className = active ? "flex w-full items-center justify-between gap-3 rounded-md border border-[#2ea043]/35 bg-[#238636]/12 px-3 py-2 text-left" : "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-[#161b22]";
      button.innerHTML = `
      <span class="min-w-0">
        <span class="block truncate text-sm font-medium text-review-text">${symbol.title}</span>
        <span class="mt-0.5 block text-[11px] text-review-muted">${symbol.kind} · line ${symbol.lineNumber}</span>
      </span>
      <span class="text-[11px] text-review-muted">${symbol.lineNumber}</span>
    `;
      button.addEventListener("click", () => {
        openNavigationTarget({
          fileId: file.id,
          scope,
          side: activeSide,
          line: symbol.lineNumber,
          column: 1
        });
      });
      container.appendChild(button);
    });
  }

  // src/web/features/file-tree/sidebar.ts
  function createSidebarController(options) {
    const {
      reviewDataFiles,
      state,
      sidebarEl,
      sidebarTitleEl,
      fileTreeEl,
      summaryEl,
      modeHintEl,
      sidebarStatusFilterEl,
      hideReviewedCheckboxEl,
      commentedOnlyCheckboxEl,
      changedOnlyCheckboxEl,
      submitButton,
      toggleReviewedButton,
      toggleUnchangedButton,
      toggleWrapButton,
      toggleSidebarButton,
      scopeDiffButton,
      scopeLastCommitButton,
      scopeAllButton,
      scopeLabel: scopeLabel2,
      scopeHint: scopeHint2,
      statusBadgeClass: statusBadgeClass2,
      statusLabel: statusLabel2,
      getScopedFiles,
      getFilteredFiles,
      getRequestState,
      isFileReviewed,
      getCodeSearchState,
      getActiveStatus,
      activeFile,
      openFile,
      openCodeSearchMatch,
      ensureActiveFileForScope,
      activeFileShowsDiff
    } = options;
    function renderHighlightedLine(match) {
      const raw = match.lineText.trim() || "(blank line)";
      const trimmedOffset = match.lineText.indexOf(raw);
      if (raw === "(blank line)") {
        return escapeHtml(raw);
      }
      const start = Math.max(0, match.matchStartColumn - 1 - trimmedOffset);
      const end = Math.max(start, match.matchEndColumn - 1 - trimmedOffset);
      const safeStart = Math.min(start, raw.length);
      const safeEnd = Math.min(end, raw.length);
      return [
        escapeHtml(raw.slice(0, safeStart)),
        `<mark class="rounded-sm bg-[#264f78] px-0.5 text-review-text">${escapeHtml(raw.slice(safeStart, safeEnd))}</mark>`,
        escapeHtml(raw.slice(safeEnd))
      ].join("");
    }
    function getSubmittedCommentCount(fileId) {
      return state.comments.filter((comment) => {
        if (comment.status !== "submitted")
          return false;
        if (comment.scope !== state.currentScope)
          return false;
        if (fileId != null && comment.fileId !== fileId)
          return false;
        return true;
      }).length;
    }
    function renderTreeNode(node, depth) {
      const children = [...node.children.values()].sort((a, b) => {
        if (a.kind !== b.kind)
          return a.kind === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const indentPx = 12;
      for (const child of children) {
        if (child.kind === "dir") {
          const collapsed = state.collapsedDirs[child.path] === true;
          const row = document.createElement("button");
          row.type = "button";
          row.className = "group flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] text-[#c9d1d9] hover:bg-[#21262d]";
          row.style.paddingLeft = `${depth * indentPx + 8}px`;
          row.innerHTML = `
          <svg class="h-4 w-4 shrink-0 text-[#8b949e] transition-transform ${collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="truncate">${escapeHtml(child.name)}</span>
        `;
          row.addEventListener("click", () => {
            state.collapsedDirs[child.path] = !collapsed;
            renderTree();
          });
          fileTreeEl.appendChild(row);
          if (!collapsed)
            renderTreeNode(child, depth + 1);
          continue;
        }
        const file = child.file;
        if (!file)
          continue;
        const count = getSubmittedCommentCount(file.id);
        const reviewed = isFileReviewed(file.id);
        const requestState = getRequestState(file.id, state.currentScope);
        const loading = requestState.requestId != null && requestState.contents == null;
        const errored = requestState.error != null;
        const status = getActiveStatus(file);
        const button = document.createElement("button");
        button.type = "button";
        button.className = [
          "group flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[13px]",
          file.id === state.activeFileId ? "bg-[#373e47] text-white" : reviewed ? "text-[#c9d1d9] hover:bg-[#21262d]" : "text-[#8b949e] hover:bg-[#21262d] hover:text-[#c9d1d9]"
        ].join(" ");
        button.style.paddingLeft = `${depth * indentPx + 26}px`;
        button.innerHTML = `
        <span class="flex min-w-0 items-center gap-1.5 truncate ${file.id === state.activeFileId ? "font-medium" : ""}">
          <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "●" : errored ? "!" : loading ? "…" : "●"}</span>
          <span class="truncate">${escapeHtml(child.name)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${statusBadgeClass2(status)}">${statusLabel2(status).charAt(0)}</span>` : ""}
        </span>
      `;
        button.addEventListener("click", () => openFile(file.id));
        fileTreeEl.appendChild(button);
      }
    }
    function renderCodeSearchResults(matches) {
      const heading = document.createElement("div");
      heading.className = "px-2 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wide text-review-muted";
      heading.textContent = "Code";
      fileTreeEl.appendChild(heading);
      matches.forEach((match) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "group mb-2 flex w-full items-start gap-3 rounded-md border border-review-border bg-[#010409] px-3 py-3 text-left hover:bg-[#11161d]";
        button.innerHTML = `
        <span class="mt-0.5 shrink-0 rounded-md border border-review-border bg-review-panel px-2 py-0.5 text-[10px] font-medium text-review-muted">${match.lineNumber}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[12px] font-medium text-review-text">${escapeHtml(match.path)}</span>
          <span class="mt-1 block line-clamp-2 break-words text-[12px] text-review-muted">${renderHighlightedLine(match)}</span>
        </span>
      `;
        button.addEventListener("click", () => openCodeSearchMatch(match));
        fileTreeEl.appendChild(button);
      });
    }
    function updateSidebarLayout() {
      const collapsed = state.sidebarCollapsed;
      sidebarEl.style.width = collapsed ? "0px" : "280px";
      sidebarEl.style.minWidth = collapsed ? "0px" : "280px";
      sidebarEl.style.flexBasis = collapsed ? "0px" : "280px";
      sidebarEl.style.borderRightWidth = collapsed ? "0px" : "1px";
      sidebarEl.style.pointerEvents = collapsed ? "none" : "auto";
      toggleSidebarButton.textContent = collapsed ? "Show sidebar" : "Hide sidebar";
    }
    function updateScopeButtons() {
      const counts = {
        diff: reviewDataFiles.filter((file) => file.inGitDiff).length,
        lastCommit: reviewDataFiles.filter((file) => file.inLastCommit).length,
        all: reviewDataFiles.filter((file) => file.hasWorkingTreeFile).length
      };
      const applyButtonClasses = (button, active, disabled) => {
        button.disabled = disabled;
        button.className = disabled ? "cursor-default rounded-md border border-review-border bg-[#11161d] px-2.5 py-1 text-[11px] font-medium text-review-muted opacity-60" : active ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-2.5 py-1 text-[11px] font-medium text-[#3fb950] hover:bg-[#238636]/25" : "cursor-pointer rounded-md border border-review-border bg-review-panel px-2.5 py-1 text-[11px] font-medium text-review-text hover:bg-[#21262d]";
      };
      scopeDiffButton.textContent = `Git diff${counts.diff > 0 ? ` (${counts.diff})` : ""}`;
      scopeLastCommitButton.textContent = `Last commit${counts.lastCommit > 0 ? ` (${counts.lastCommit})` : ""}`;
      scopeAllButton.textContent = `All files${counts.all > 0 ? ` (${counts.all})` : ""}`;
      applyButtonClasses(scopeDiffButton, state.currentScope === "git-diff", counts.diff === 0);
      applyButtonClasses(scopeLastCommitButton, state.currentScope === "last-commit", counts.lastCommit === 0);
      applyButtonClasses(scopeAllButton, state.currentScope === "all-files", counts.all === 0);
    }
    function updateToggleButtons() {
      const file = activeFile();
      const reviewed = file ? isFileReviewed(file.id) : false;
      toggleReviewedButton.textContent = reviewed ? "Reviewed" : "Mark reviewed";
      toggleReviewedButton.className = reviewed ? "cursor-pointer rounded-md border border-[#2ea043]/40 bg-[#238636]/15 px-3 py-1 text-xs font-medium text-[#3fb950] hover:bg-[#238636]/25" : "cursor-pointer rounded-md border border-review-border bg-review-panel px-3 py-1 text-xs font-medium text-review-text hover:bg-[#21262d]";
      toggleWrapButton.textContent = `Wrap lines: ${state.wrapLines ? "on" : "off"}`;
      toggleUnchangedButton.textContent = state.hideUnchanged ? "Show full file" : "Show changed areas only";
      toggleUnchangedButton.style.display = activeFileShowsDiff() ? "inline-flex" : "none";
      updateScopeButtons();
      modeHintEl.textContent = scopeHint2(state.currentScope);
      sidebarStatusFilterEl.value = state.statusFilter;
      hideReviewedCheckboxEl.checked = state.hideReviewedFiles;
      commentedOnlyCheckboxEl.checked = state.showCommentedFilesOnly;
      changedOnlyCheckboxEl.checked = state.showChangedFilesOnly;
      submitButton.disabled = false;
    }
    function renderTree() {
      ensureActiveFileForScope();
      fileTreeEl.innerHTML = "";
      const scopedFiles = getScopedFiles();
      const visibleFiles = getFilteredFiles();
      const codeSearch = getCodeSearchState();
      const query = state.fileFilter.trim();
      if (visibleFiles.length === 0 && (!query || codeSearch.results.length === 0)) {
        const message = query ? `No code matches <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.` : `No files in <span class="text-review-text">${escapeHtml(scopeLabel2(state.currentScope).toLowerCase())}</span>.`;
        fileTreeEl.innerHTML = `
        <div class="px-3 py-4 text-sm text-review-muted">
          ${message}
        </div>
      `;
      } else if (query) {
        if (codeSearch.searching) {
          const loading = document.createElement("div");
          loading.className = "px-3 py-3 text-sm text-review-muted";
          loading.textContent = "Searching code…";
          fileTreeEl.appendChild(loading);
        } else if (codeSearch.results.length > 0) {
          renderCodeSearchResults(codeSearch.results);
        } else if (query.length >= 2) {
          const empty = document.createElement("div");
          empty.className = "px-3 py-3 text-sm text-review-muted";
          empty.textContent = "No code matches found.";
          fileTreeEl.appendChild(empty);
        }
      } else {
        renderTreeNode(buildTree(visibleFiles), 0);
      }
      sidebarTitleEl.textContent = scopeLabel2(state.currentScope);
      const comments = getSubmittedCommentCount();
      const filteredSuffix = state.fileFilter.trim() ? ` • ${codeSearch.results.length} code match(es)` : "";
      summaryEl.textContent = `${scopedFiles.length} file(s) • ${comments} comment(s)${state.overallComment ? " • overall note" : ""}${filteredSuffix}`;
      updateToggleButtons();
      updateSidebarLayout();
    }
    return {
      renderTree,
      updateSidebarLayout,
      updateScopeButtons,
      updateToggleButtons
    };
  }

  // src/web/shared/state/review-state.ts
  function createInitialReviewState(reviewData) {
    return {
      activeFileId: null,
      currentScope: reviewData.files.some((file) => file.inGitDiff) ? "git-diff" : reviewData.files.some((file) => file.inLastCommit) ? "last-commit" : "all-files",
      comments: [],
      overallComment: "",
      hideUnchanged: false,
      wrapLines: true,
      collapsedDirs: {},
      reviewedFiles: {},
      scrollPositions: {},
      sidebarCollapsed: false,
      fileFilter: "",
      statusFilter: "all",
      hideReviewedFiles: false,
      showCommentedFilesOnly: false,
      showChangedFilesOnly: false,
      fileContents: {},
      fileErrors: {},
      pendingRequestIds: {}
    };
  }

  // src/web/app/ui/dom.ts
  function getReviewDomElements() {
    return {
      sidebarEl: document.getElementById("sidebar"),
      sidebarTitleEl: document.getElementById("sidebar-title"),
      sidebarSearchInputEl: document.getElementById("sidebar-search-input"),
      sidebarStatusFilterEl: document.getElementById("sidebar-status-filter"),
      hideReviewedCheckboxEl: document.getElementById("hide-reviewed-checkbox"),
      commentedOnlyCheckboxEl: document.getElementById("commented-only-checkbox"),
      changedOnlyCheckboxEl: document.getElementById("changed-only-checkbox"),
      toggleSidebarButton: document.getElementById("toggle-sidebar-button"),
      scopeDiffButton: document.getElementById("scope-diff-button"),
      scopeLastCommitButton: document.getElementById("scope-last-commit-button"),
      scopeAllButton: document.getElementById("scope-all-button"),
      windowTitleEl: document.getElementById("window-title"),
      repoRootEl: document.getElementById("repo-root"),
      fileTreeEl: document.getElementById("file-tree"),
      summaryEl: document.getElementById("summary"),
      currentFileLabelEl: document.getElementById("current-file-label"),
      currentSymbolLabelEl: document.getElementById("current-symbol-label"),
      modeHintEl: document.getElementById("mode-hint"),
      fileCommentsContainer: document.getElementById("file-comments-container"),
      editorContainerEl: document.getElementById("editor-container"),
      inspectorEl: document.getElementById("inspector"),
      changedSymbolsContainerEl: document.getElementById("changed-symbols-container"),
      outlineContainerEl: document.getElementById("outline-container"),
      toggleOutlineButton: document.getElementById("toggle-outline-button"),
      reviewQueueContainerEl: document.getElementById("review-queue-container"),
      changedSymbolsButton: document.getElementById("changed-symbols-button"),
      agentActionButton: document.getElementById("agent-action-button"),
      submitButton: document.getElementById("submit-button"),
      cancelButton: document.getElementById("cancel-button"),
      overallCommentButton: document.getElementById("overall-comment-button"),
      fileCommentButton: document.getElementById("file-comment-button"),
      navigateBackButton: document.getElementById("navigate-back-button"),
      navigateForwardButton: document.getElementById("navigate-forward-button"),
      showReferencesButton: document.getElementById("show-references-button"),
      peekDefinitionButton: document.getElementById("peek-definition-button"),
      toggleReviewedButton: document.getElementById("toggle-reviewed-button"),
      toggleUnchangedButton: document.getElementById("toggle-unchanged-button"),
      toggleWrapButton: document.getElementById("toggle-wrap-button")
    };
  }

  // src/web/features/comments/comment-manager.ts
  function createCommentManager(options) {
    const { state, activeFile, scopeLabel: scopeLabel2, fileCommentsContainer } = options;
    function renderCommentDOM2(comment, options2) {
      return renderCommentDOM(comment, scopeLabel2, options2);
    }
    function syncCommentBodiesFromDOM() {
      const textareas = document.querySelectorAll("textarea[data-comment-id]");
      textareas.forEach((textarea) => {
        const commentId = textarea.getAttribute("data-comment-id");
        const comment = state.comments.find((item) => item.id === commentId);
        if (comment) {
          comment.body = textarea.value;
        }
      });
    }
    function renderFileComments() {
      fileCommentsContainer.innerHTML = "";
      const file = activeFile();
      if (!file) {
        fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
        return;
      }
      const fileComments = state.comments.filter((comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side === "file");
      if (fileComments.length === 0) {
        fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
        return;
      }
      fileCommentsContainer.className = "border-b border-review-border bg-[#0d1117] px-4 py-4 space-y-4";
      fileComments.forEach((comment) => {
        const dom = renderCommentDOM2(comment, {
          onDelete: () => {
            state.comments = state.comments.filter((item) => item.id !== comment.id);
            options.onCommentsChange();
          },
          onUpdate: options.onCommentsChange
        });
        dom.className = "";
        fileCommentsContainer.appendChild(dom);
      });
    }
    return {
      renderCommentDOM: renderCommentDOM2,
      renderFileComments,
      syncCommentBodiesFromDOM
    };
  }

  // src/web/features/editor/review-editor.ts
  var NAVIGATION_HOVER_DEBOUNCE_MS = 80;
  var MAX_NAVIGATION_HOVER_CACHE_ENTRIES = 300;
  function scrollKey(scope, fileId) {
    return `${scope}:${fileId}`;
  }
  function getCommentViewZoneHeight(comment) {
    if (comment.status === "draft") {
      return 236;
    }
    if (comment.collapsed) {
      return 50;
    }
    const lineCount = Math.max(1, comment.body.split(`
`).length);
    return Math.max(104, lineCount * 22 + 62);
  }
  function createReviewEditor(options) {
    const {
      state,
      activeFile,
      activeFileShowsDiff,
      getScopeFilePath,
      getScopeSidePath,
      getScopeDisplayPath,
      getRequestState,
      ensureFileLoaded,
      renderCommentDOM: renderCommentDOM2,
      addInlineComment,
      onCommentsChange,
      onEditorContextChange,
      renderFileComments,
      canCommentOnSide,
      resolveNavigationTarget,
      resolveDefinitionTarget,
      describeNavigationTarget,
      openNavigationTarget,
      navigationResolver,
      editorContainerEl,
      currentFileLabelEl
    } = options;
    let monacoApi = null;
    let diffEditor = null;
    let originalModel = null;
    let modifiedModel = null;
    let originalDecorations = [];
    let modifiedDecorations = [];
    let activeViewZones = [];
    let editorResizeObserver = null;
    let pendingNavigationTarget = null;
    let lastFocusedSide = "modified";
    let navigationModifierPressed = false;
    const navigationHoverCache = new Map;
    const navigationHoverRequests = new Map;
    let navigationHoverCacheVersion = 0;
    function clearNavigationHoverCache() {
      navigationHoverCache.clear();
      navigationHoverRequests.clear();
      navigationHoverCacheVersion += 1;
    }
    function rememberNavigationHoverTarget(cacheKey, target) {
      if (navigationHoverCache.size >= MAX_NAVIGATION_HOVER_CACHE_ENTRIES) {
        const oldestKey = navigationHoverCache.keys().next().value;
        if (oldestKey) {
          navigationHoverCache.delete(oldestKey);
        }
      }
      navigationHoverCache.set(cacheKey, target);
    }
    function saveCurrentScrollPosition() {
      if (!diffEditor || !state.activeFileId)
        return;
      const originalEditor = diffEditor.getOriginalEditor();
      const modifiedEditor = diffEditor.getModifiedEditor();
      state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)] = {
        originalTop: originalEditor.getScrollTop(),
        originalLeft: originalEditor.getScrollLeft(),
        modifiedTop: modifiedEditor.getScrollTop(),
        modifiedLeft: modifiedEditor.getScrollLeft()
      };
    }
    function restoreFileScrollPosition() {
      if (!diffEditor || !state.activeFileId)
        return;
      const scrollState = state.scrollPositions[scrollKey(state.currentScope, state.activeFileId)];
      if (!scrollState)
        return;
      const originalEditor = diffEditor.getOriginalEditor();
      const modifiedEditor = diffEditor.getModifiedEditor();
      originalEditor.setScrollTop(scrollState.originalTop);
      originalEditor.setScrollLeft(scrollState.originalLeft);
      modifiedEditor.setScrollTop(scrollState.modifiedTop);
      modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
    }
    function captureScrollState() {
      if (!diffEditor)
        return null;
      const originalEditor = diffEditor.getOriginalEditor();
      const modifiedEditor = diffEditor.getModifiedEditor();
      return {
        originalTop: originalEditor.getScrollTop(),
        originalLeft: originalEditor.getScrollLeft(),
        modifiedTop: modifiedEditor.getScrollTop(),
        modifiedLeft: modifiedEditor.getScrollLeft()
      };
    }
    function restoreScrollState(scrollState) {
      if (!diffEditor || !scrollState)
        return;
      const originalEditor = diffEditor.getOriginalEditor();
      const modifiedEditor = diffEditor.getModifiedEditor();
      originalEditor.setScrollTop(scrollState.originalTop);
      originalEditor.setScrollLeft(scrollState.originalLeft);
      modifiedEditor.setScrollTop(scrollState.modifiedTop);
      modifiedEditor.setScrollLeft(scrollState.modifiedLeft);
    }
    function layoutEditor() {
      if (!diffEditor)
        return;
      const width = editorContainerEl.clientWidth;
      const height = editorContainerEl.clientHeight;
      if (width <= 0 || height <= 0)
        return;
      diffEditor.layout({ width, height });
    }
    function clearViewZones() {
      if (!diffEditor || activeViewZones.length === 0)
        return;
      const original = diffEditor.getOriginalEditor();
      const modified = diffEditor.getModifiedEditor();
      original.changeViewZones((accessor) => {
        for (const zone of activeViewZones)
          if (zone.editor === original)
            accessor.removeZone(zone.id);
      });
      modified.changeViewZones((accessor) => {
        for (const zone of activeViewZones)
          if (zone.editor === modified)
            accessor.removeZone(zone.id);
      });
      activeViewZones = [];
    }
    function isActiveFileReady() {
      const file = activeFile();
      if (!file)
        return false;
      const requestState = getRequestState(file.id, state.currentScope);
      return requestState.contents != null && requestState.error == null;
    }
    function syncViewZones() {
      clearViewZones();
      if (!diffEditor || !isActiveFileReady())
        return;
      const file = activeFile();
      if (!file)
        return;
      const originalEditor = diffEditor.getOriginalEditor();
      const modifiedEditor = diffEditor.getModifiedEditor();
      const inlineComments = state.comments.filter((comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== "file");
      inlineComments.forEach((item) => {
        const editor = item.side === "original" ? originalEditor : modifiedEditor;
        const domNode = renderCommentDOM2(item, {
          onDelete: () => {
            state.comments = state.comments.filter((comment) => comment.id !== item.id);
            onCommentsChange();
          },
          onUpdate: onCommentsChange
        });
        if (!domNode)
          return;
        editor.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterLineNumber: item.startLine,
            heightInPx: getCommentViewZoneHeight(item),
            domNode
          });
          activeViewZones.push({ id, editor });
        });
      });
    }
    function updateDecorations() {
      if (!diffEditor || !monacoApi)
        return;
      const file = activeFile();
      const comments = file ? state.comments.filter((comment) => comment.fileId === file.id && comment.scope === state.currentScope && comment.side !== "file") : [];
      const originalRanges = [];
      const modifiedRanges = [];
      for (const comment of comments) {
        const range = {
          range: new monacoApi.Range(comment.startLine, 1, comment.startLine, 1),
          options: {
            isWholeLine: true,
            className: comment.side === "original" ? "review-comment-line-original" : "review-comment-line-modified",
            glyphMarginClassName: comment.side === "original" ? "review-comment-glyph-original" : "review-comment-glyph-modified"
          }
        };
        if (comment.side === "original")
          originalRanges.push(range);
        else
          modifiedRanges.push(range);
      }
      originalDecorations = diffEditor.getOriginalEditor().deltaDecorations(originalDecorations, originalRanges);
      modifiedDecorations = diffEditor.getModifiedEditor().deltaDecorations(modifiedDecorations, modifiedRanges);
    }
    function applyEditorOptions() {
      if (!diffEditor)
        return;
      diffEditor.updateOptions({
        renderSideBySide: activeFileShowsDiff(),
        diffWordWrap: state.wrapLines ? "on" : "off",
        hideUnchangedRegions: {
          enabled: activeFileShowsDiff() && state.hideUnchanged,
          contextLineCount: 4,
          minimumLineCount: 2,
          revealLineCount: 12
        }
      });
      diffEditor.getOriginalEditor().updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
      diffEditor.getModifiedEditor().updateOptions({ wordWrap: state.wrapLines ? "on" : "off" });
    }
    function getPlaceholderContents(file, scope) {
      const path = getScopeDisplayPath(file, scope);
      const requestState = getRequestState(file?.id || "", scope);
      if (requestState.error) {
        const body2 = `Failed to load ${path}

${requestState.error}`;
        return { originalContent: body2, modifiedContent: body2 };
      }
      const body = `Loading ${path}...`;
      return { originalContent: body, modifiedContent: body };
    }
    function getMountedContents(file, scope = state.currentScope) {
      const requestState = getRequestState(file?.id || "", scope);
      const contents = requestState.contents;
      if (typeof contents === "object" && contents != null && "originalContent" in contents && "modifiedContent" in contents) {
        return contents;
      }
      return getPlaceholderContents(file, scope);
    }
    function getEditorForSide(side) {
      if (!diffEditor)
        return null;
      return side === "original" ? diffEditor.getOriginalEditor() : diffEditor.getModifiedEditor();
    }
    function getCurrentEditorContext() {
      const file = activeFile();
      if (!file || !diffEditor)
        return null;
      const side = activeFileShowsDiff() ? lastFocusedSide : "modified";
      const editor = getEditorForSide(side) ?? diffEditor.getModifiedEditor();
      const position = editor?.getPosition?.();
      const visibleRange = editor?.getVisibleRanges?.()?.[0];
      const line = Math.max(1, position?.lineNumber ?? visibleRange?.startLineNumber ?? 1);
      const column = Math.max(1, position?.column ?? 1);
      const model = editor?.getModel?.();
      if (!model)
        return null;
      return { file, side, editor, model, line, column };
    }
    function getCurrentNavigationTarget() {
      const context = getCurrentEditorContext();
      if (!context)
        return null;
      return {
        fileId: context.file.id,
        scope: state.currentScope,
        side: context.side,
        line: context.line,
        column: context.column
      };
    }
    function getCurrentNavigationRequest() {
      const context = getCurrentEditorContext();
      if (!context)
        return null;
      const descriptor = navigationResolver.parseModelUri(context.model.uri);
      if (!descriptor)
        return null;
      return {
        fileId: descriptor.fileId,
        scope: descriptor.scope,
        side: descriptor.side,
        sourcePath: descriptor.sourcePath,
        languageId: context.model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
        content: context.model.getValue(),
        lineNumber: context.line,
        column: context.column
      };
    }
    function emitEditorContextChange(symbolLineOverride) {
      const navigationRequest = getCurrentNavigationRequest();
      const navigationTarget = navigationRequest != null ? resolveNavigationTarget(navigationRequest) : null;
      const symbolLine = symbolLineOverride ?? navigationRequest?.lineNumber ?? null;
      const symbolContext = navigationRequest != null && symbolLine != null ? getReviewSymbolContext(navigationRequest.content, symbolLine, navigationRequest.languageId) : { title: null, lineNumber: null };
      onEditorContextChange({
        navigationRequest,
        navigationTarget,
        symbolTitle: symbolContext.title,
        symbolLine: symbolContext.lineNumber
      });
    }
    function getCurrentSelectionContext() {
      const context = getCurrentEditorContext();
      if (!context)
        return null;
      const descriptor = navigationResolver.parseModelUri(context.model.uri);
      if (!descriptor)
        return null;
      const selection = context.editor?.getSelection?.();
      const startLine = Math.max(1, selection?.startLineNumber ?? context.line);
      const endLine = Math.max(1, selection?.endLineNumber ?? startLine);
      const selectedText = typeof context.editor?.getModel?.()?.getValueInRange === "function" && selection ? String(context.editor.getModel().getValueInRange(selection) || "") : "";
      return {
        fileId: descriptor.fileId,
        scope: descriptor.scope,
        side: descriptor.side,
        sourcePath: descriptor.sourcePath,
        languageId: context.model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
        content: context.model.getValue(),
        startLine,
        endLine,
        selectedText
      };
    }
    function buildNavigationRequestFromModel(model, position) {
      if (!model)
        return null;
      const descriptor = navigationResolver.parseModelUri(model.uri);
      if (!descriptor)
        return null;
      return {
        fileId: descriptor.fileId,
        scope: descriptor.scope,
        side: descriptor.side,
        sourcePath: descriptor.sourcePath,
        languageId: model.getLanguageId?.() || inferLanguage(descriptor.sourcePath),
        content: model.getValue(),
        lineNumber: position.lineNumber,
        column: position.column
      };
    }
    function maybeRevealPendingNavigation() {
      if (!pendingNavigationTarget || !diffEditor)
        return;
      const file = activeFile();
      if (!file || file.id !== pendingNavigationTarget.fileId)
        return;
      if (state.currentScope !== pendingNavigationTarget.scope)
        return;
      if (!isActiveFileReady())
        return;
      const targetEditor = getEditorForSide(pendingNavigationTarget.side);
      const line = Math.max(1, pendingNavigationTarget.line || 1);
      const column = Math.max(1, pendingNavigationTarget.column || 1);
      targetEditor?.revealLineInCenter(line);
      targetEditor?.setPosition({ lineNumber: line, column });
      targetEditor?.focus();
      lastFocusedSide = pendingNavigationTarget.side;
      pendingNavigationTarget = null;
    }
    function revealNavigationTarget(target) {
      pendingNavigationTarget = target;
      requestAnimationFrame(() => {
        maybeRevealPendingNavigation();
        emitEditorContextChange();
        setTimeout(() => {
          maybeRevealPendingNavigation();
          emitEditorContextChange();
        }, 50);
      });
    }
    function mountFile(mountOptions = {}) {
      if (!diffEditor || !monacoApi)
        return;
      clearNavigationHoverCache();
      const file = activeFile();
      if (!file) {
        currentFileLabelEl.textContent = "No file selected";
        clearViewZones();
        if (originalModel)
          originalModel.dispose();
        if (modifiedModel)
          modifiedModel.dispose();
        originalModel = monacoApi.editor.createModel("", "plaintext");
        modifiedModel = monacoApi.editor.createModel("", "plaintext");
        diffEditor.setModel({ original: originalModel, modified: modifiedModel });
        applyEditorOptions();
        updateDecorations();
        renderFileComments();
        requestAnimationFrame(layoutEditor);
        return;
      }
      ensureFileLoaded(file.id, state.currentScope);
      const preserveScroll = mountOptions.preserveScroll === true;
      const scrollState = preserveScroll ? captureScrollState() : null;
      const language = inferLanguage(getScopeFilePath(file) || file.path);
      const contents = getMountedContents(file, state.currentScope);
      clearViewZones();
      currentFileLabelEl.textContent = getScopeDisplayPath(file, state.currentScope);
      if (originalModel)
        originalModel.dispose();
      if (modifiedModel)
        modifiedModel.dispose();
      originalModel = monacoApi.editor.createModel(contents.originalContent, language, navigationResolver.buildModelUri(monacoApi, {
        fileId: file.id,
        scope: state.currentScope,
        side: "original",
        sourcePath: getScopeSidePath(file, state.currentScope, "original")
      }));
      modifiedModel = monacoApi.editor.createModel(contents.modifiedContent, language, navigationResolver.buildModelUri(monacoApi, {
        fileId: file.id,
        scope: state.currentScope,
        side: "modified",
        sourcePath: getScopeSidePath(file, state.currentScope, "modified")
      }));
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      applyEditorOptions();
      syncViewZones();
      updateDecorations();
      renderFileComments();
      requestAnimationFrame(() => {
        layoutEditor();
        if (mountOptions.restoreFileScroll)
          restoreFileScrollPosition();
        if (mountOptions.preserveScroll)
          restoreScrollState(scrollState);
        maybeRevealPendingNavigation();
        emitEditorContextChange();
        setTimeout(() => {
          layoutEditor();
          if (mountOptions.restoreFileScroll)
            restoreFileScrollPosition();
          if (mountOptions.preserveScroll)
            restoreScrollState(scrollState);
          maybeRevealPendingNavigation();
          emitEditorContextChange();
        }, 50);
      });
    }
    function createGlyphHoverActions(editor, side) {
      let hoverDecoration = [];
      function openDraftAtLine(line) {
        const file = activeFile();
        if (!file || !canCommentOnSide(file, side) || !isActiveFileReady())
          return;
        addInlineComment(file.id, side, line);
        onCommentsChange();
        editor.revealLineInCenter(line);
      }
      editor.onMouseMove((event) => {
        const file = activeFile();
        if (!file || !canCommentOnSide(file, side) || !isActiveFileReady()) {
          hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
          return;
        }
        const target = event.target;
        if (target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
          const line = target.position?.lineNumber;
          if (!line)
            return;
          hoverDecoration = editor.deltaDecorations(hoverDecoration, [
            {
              range: new monacoApi.Range(line, 1, line, 1),
              options: { glyphMarginClassName: "review-glyph-plus" }
            }
          ]);
        } else {
          hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
        }
      });
      editor.onMouseLeave(() => {
        hoverDecoration = editor.deltaDecorations(hoverDecoration, []);
      });
      editor.onMouseDown((event) => {
        const file = activeFile();
        if (!file || !canCommentOnSide(file, side) || !isActiveFileReady())
          return;
        const target = event.target;
        if (target.type === monacoApi.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || target.type === monacoApi.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
          const line = target.position?.lineNumber;
          if (!line)
            return;
          openDraftAtLine(line);
        }
      });
    }
    function createNavigationHoverActions(editor) {
      let hoverDecorations = [];
      let hoveredModel = null;
      let hoveredPosition = null;
      let hoverTimer = null;
      let requestSequence = 0;
      function clearHoverIndicator() {
        if (hoverTimer != null) {
          window.clearTimeout(hoverTimer);
          hoverTimer = null;
        }
        requestSequence += 1;
        hoverDecorations = editor.deltaDecorations(hoverDecorations, []);
        editor.getDomNode?.()?.classList.remove("review-nav-link-cursor");
      }
      async function resolveHoverTarget(cacheKey, request, force) {
        const cached = force ? undefined : navigationHoverCache.get(cacheKey);
        if (cached !== undefined) {
          return cached;
        }
        const cacheVersion = navigationHoverCacheVersion;
        let pending = navigationHoverRequests.get(cacheKey);
        if (pending == null) {
          pending = (async () => {
            const heuristicTarget = resolveNavigationTarget(request);
            if (heuristicTarget || !supportsSemanticDefinition(request.languageId)) {
              return heuristicTarget;
            }
            return resolveDefinitionTarget(request, { silent: true });
          })();
          navigationHoverRequests.set(cacheKey, pending);
          const clearPending = () => {
            if (navigationHoverRequests.get(cacheKey) === pending) {
              navigationHoverRequests.delete(cacheKey);
            }
          };
          pending.then(clearPending, clearPending);
        }
        const target = await pending;
        if (cacheVersion === navigationHoverCacheVersion) {
          rememberNavigationHoverTarget(cacheKey, target);
        }
        return target;
      }
      async function updateHoverIndicator(force = false) {
        hoverTimer = null;
        if (!monacoApi || !navigationModifierPressed) {
          clearHoverIndicator();
          return;
        }
        const model = hoveredModel;
        const position = hoveredPosition;
        if (!model || !position) {
          clearHoverIndicator();
          return;
        }
        const word = model.getWordAtPosition?.(position);
        if (!word) {
          clearHoverIndicator();
          return;
        }
        const request = buildNavigationRequestFromModel(model, position);
        if (!request) {
          clearHoverIndicator();
          return;
        }
        const cacheKey = [
          request.fileId,
          request.scope,
          request.side,
          request.lineNumber,
          word.startColumn,
          word.endColumn,
          request.languageId
        ].join(":");
        const pendingId = ++requestSequence;
        const target = await resolveHoverTarget(cacheKey, request, force);
        if (pendingId !== requestSequence) {
          return;
        }
        if (!target) {
          clearHoverIndicator();
          return;
        }
        hoverDecorations = editor.deltaDecorations(hoverDecorations, [
          {
            range: new monacoApi.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            options: {
              inlineClassName: "review-nav-link-token"
            }
          }
        ]);
        editor.getDomNode?.()?.classList.add("review-nav-link-cursor");
      }
      function scheduleHoverIndicator(force = false) {
        if (hoverTimer != null) {
          window.clearTimeout(hoverTimer);
        }
        hoverTimer = window.setTimeout(() => {
          updateHoverIndicator(force);
        }, NAVIGATION_HOVER_DEBOUNCE_MS);
      }
      function syncModifierState(isPressed) {
        navigationModifierPressed = isPressed;
        if (!isPressed) {
          clearHoverIndicator();
          return;
        }
        scheduleHoverIndicator();
      }
      editor.onMouseMove((event) => {
        const browserEvent = event.event?.browserEvent;
        navigationModifierPressed = Boolean(browserEvent?.metaKey || browserEvent?.ctrlKey);
        const lineNumber = event.target.position?.lineNumber;
        const column = event.target.position?.column;
        if (!lineNumber || !column) {
          hoveredModel = null;
          hoveredPosition = null;
          clearHoverIndicator();
          return;
        }
        hoveredModel = editor.getModel?.() ?? null;
        hoveredPosition = { lineNumber, column };
        if (!navigationModifierPressed) {
          clearHoverIndicator();
          return;
        }
        scheduleHoverIndicator();
      });
      editor.onMouseLeave(() => {
        hoveredModel = null;
        hoveredPosition = null;
        clearHoverIndicator();
      });
      return {
        syncModifierState
      };
    }
    function registerNavigationSupport() {
      const languages = ["typescript", "javascript", "go", "rust", "c", "cpp"];
      for (const languageId of languages) {
        const buildRequest = (model, position) => buildNavigationRequestFromModel(model, {
          lineNumber: position.lineNumber,
          column: position.column
        });
        monacoApi.languages.registerDefinitionProvider(languageId, {
          async provideDefinition(model, position, token) {
            const request = buildRequest(model, position);
            if (!request)
              return null;
            const target = await resolveDefinitionTarget(request, {
              silent: true
            });
            if (token?.isCancellationRequested)
              return null;
            if (!target)
              return null;
            const source = {
              fileId: request.fileId,
              scope: request.scope,
              side: request.side,
              line: request.lineNumber,
              column: request.column
            };
            return {
              uri: navigationResolver.buildTargetUri(monacoApi, target, {
                source
              }),
              range: new monacoApi.Range(target.line, target.column, target.line, target.column)
            };
          }
        });
        monacoApi.languages.registerHoverProvider(languageId, {
          async provideHover(model, position, token) {
            const request = buildRequest(model, position);
            if (!request)
              return null;
            const target = resolveNavigationTarget(request) ?? await resolveDefinitionTarget(request, { silent: true });
            if (token?.isCancellationRequested)
              return null;
            if (!target)
              return null;
            const actionLabel = navigationActionLabel(request.languageId);
            const referencesLabel = supportsSemanticDefinition(request.languageId) ? "show related usages" : "show related imports/usages";
            return {
              range: new monacoApi.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              contents: [
                {
                  value: `**Review navigation**

Target: \`${describeNavigationTarget(target)}\`

- Cmd/Ctrl-click: ${actionLabel}
- References button: ${referencesLabel}
- Peek button: preview target inline`
                }
              ]
            };
          }
        });
      }
      if (typeof monacoApi.editor.registerEditorOpener === "function") {
        monacoApi.editor.registerEditorOpener({
          openCodeEditor(_source, resource) {
            const target = navigationResolver.parseTargetUri(resource);
            if (!target)
              return false;
            openNavigationTarget(target, {
              source: navigationResolver.parseTargetSourceUri(resource)
            });
            return true;
          }
        });
      }
    }
    function setupMonaco(onReady) {
      const monacoRequire = window.require;
      if (!monacoRequire) {
        return;
      }
      monacoRequire.config({
        paths: {
          vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs"
        }
      });
      monacoRequire(["vs/editor/editor.main"], () => {
        if (!window.monaco) {
          return;
        }
        monacoApi = window.monaco;
        monacoApi.editor.defineTheme("review-dark", {
          base: "vs-dark",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": "#0d1117",
            "diffEditor.insertedTextBackground": "#2ea04326",
            "diffEditor.removedTextBackground": "#f8514926"
          }
        });
        monacoApi.editor.setTheme("review-dark");
        diffEditor = monacoApi.editor.createDiffEditor(editorContainerEl, {
          automaticLayout: true,
          renderSideBySide: activeFileShowsDiff(),
          readOnly: true,
          originalEditable: false,
          minimap: {
            enabled: true,
            renderCharacters: false,
            showSlider: "always",
            size: "proportional"
          },
          renderOverviewRuler: true,
          diffWordWrap: "on",
          scrollBeyondLastLine: false,
          lineNumbersMinChars: 4,
          glyphMargin: true,
          folding: true,
          lineDecorationsWidth: 10,
          overviewRulerBorder: false,
          wordWrap: "on"
        });
        createGlyphHoverActions(diffEditor.getOriginalEditor(), "original");
        createGlyphHoverActions(diffEditor.getModifiedEditor(), "modified");
        const originalNavigationHover = createNavigationHoverActions(diffEditor.getOriginalEditor());
        const modifiedNavigationHover = createNavigationHoverActions(diffEditor.getModifiedEditor());
        diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
          lastFocusedSide = "original";
          emitEditorContextChange();
        });
        diffEditor.getModifiedEditor().onDidFocusEditorText(() => {
          lastFocusedSide = "modified";
          emitEditorContextChange();
        });
        diffEditor.getOriginalEditor().onDidChangeCursorPosition(() => {
          lastFocusedSide = "original";
          emitEditorContextChange();
        });
        diffEditor.getModifiedEditor().onDidChangeCursorPosition(() => {
          lastFocusedSide = "modified";
          emitEditorContextChange();
        });
        diffEditor.getOriginalEditor().onDidScrollChange(() => {
          lastFocusedSide = "original";
          const line = diffEditor?.getOriginalEditor().getVisibleRanges?.()?.[0]?.startLineNumber;
          emitEditorContextChange(line);
        });
        diffEditor.getModifiedEditor().onDidScrollChange(() => {
          lastFocusedSide = "modified";
          const line = diffEditor?.getModifiedEditor().getVisibleRanges?.()?.[0]?.startLineNumber;
          emitEditorContextChange(line);
        });
        window.addEventListener("keydown", (event) => {
          const isPressed = event.metaKey || event.ctrlKey;
          originalNavigationHover.syncModifierState(isPressed);
          modifiedNavigationHover.syncModifierState(isPressed);
        });
        window.addEventListener("keyup", (event) => {
          const isPressed = event.metaKey || event.ctrlKey;
          originalNavigationHover.syncModifierState(isPressed);
          modifiedNavigationHover.syncModifierState(isPressed);
        });
        window.addEventListener("blur", () => {
          originalNavigationHover.syncModifierState(false);
          modifiedNavigationHover.syncModifierState(false);
        });
        registerNavigationSupport();
        if (typeof ResizeObserver !== "undefined") {
          editorResizeObserver = new ResizeObserver(() => {
            layoutEditor();
          });
          editorResizeObserver.observe(editorContainerEl);
        }
        requestAnimationFrame(() => {
          layoutEditor();
          setTimeout(layoutEditor, 50);
          setTimeout(layoutEditor, 150);
        });
        onReady?.();
      });
    }
    return {
      layout: layoutEditor,
      applyOptions: applyEditorOptions,
      syncViewZones,
      updateDecorations,
      mountFile,
      saveCurrentScrollPosition,
      restoreFileScrollPosition,
      captureScrollState,
      restoreScrollState,
      setupMonaco,
      isActiveFileReady,
      revealNavigationTarget,
      getCurrentNavigationTarget,
      getCurrentNavigationRequest,
      getCurrentSelectionContext
    };
  }

  // src/web/features/navigation/resolver.ts
  var REVIEW_MODEL_SCHEME = "review-model";
  var REVIEW_TARGET_SCHEME = "review-target";
  var TS_LIKE_EXTENSIONS = [
    ".d.ts",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json"
  ];
  function createReviewNavigationResolver(reviewData) {
    const context = {
      files: reviewData.files,
      goModules: reviewData.goModules ?? []
    };
    const fileById = new Map(reviewData.files.map((file) => [file.id, file]));
    const fileByPath = new Map(reviewData.files.map((file) => [normalizePath(file.path), file]));
    const filePathSet = new Set(fileByPath.keys());
    const cargoRoots = [...filePathSet].filter((path) => path === "Cargo.toml" || path.endsWith("/Cargo.toml")).map((path) => dirname(path)).sort((a, b) => b.length - a.length);
    function buildModelUri(monacoApi, descriptor) {
      return monacoApi.Uri.from({
        scheme: REVIEW_MODEL_SCHEME,
        path: `/${encodeURIComponent(descriptor.fileId)}/${descriptor.side}`,
        query: new URLSearchParams({
          scope: descriptor.scope,
          sourcePath: descriptor.sourcePath
        }).toString()
      });
    }
    function buildTargetUri(monacoApi, target, options = {}) {
      const query = new URLSearchParams({
        scope: target.scope,
        line: String(target.line),
        column: String(target.column)
      });
      if (options.source) {
        query.set("sourceFileId", options.source.fileId);
        query.set("sourceScope", options.source.scope);
        query.set("sourceSide", options.source.side);
        query.set("sourceLine", String(options.source.line));
        query.set("sourceColumn", String(options.source.column));
      }
      return monacoApi.Uri.from({
        scheme: REVIEW_TARGET_SCHEME,
        path: `/${encodeURIComponent(target.fileId)}/${target.side}`,
        query: query.toString()
      });
    }
    function parseModelUri(uri) {
      if (!uri || typeof uri !== "object")
        return null;
      const value = uri;
      if (value.scheme !== REVIEW_MODEL_SCHEME)
        return null;
      const parts = String(value.path || "").split("/").filter(Boolean);
      if (parts.length < 2)
        return null;
      const params = new URLSearchParams(String(value.query || ""));
      const scope = params.get("scope");
      const sourcePath = params.get("sourcePath") || "";
      const side = parts[1];
      if (!isReviewScope(scope) || !isNavigationSide(side))
        return null;
      return {
        fileId: decodeURIComponent(parts[0]),
        scope,
        side,
        sourcePath
      };
    }
    function parseTargetUri(uri) {
      if (!uri || typeof uri !== "object")
        return null;
      const value = uri;
      if (value.scheme !== REVIEW_TARGET_SCHEME)
        return null;
      const parts = String(value.path || "").split("/").filter(Boolean);
      if (parts.length < 2)
        return null;
      const params = new URLSearchParams(String(value.query || ""));
      const scope = params.get("scope");
      const line = Number(params.get("line") || "1");
      const column = Number(params.get("column") || "1");
      const side = parts[1];
      if (!isReviewScope(scope) || !isNavigationSide(side))
        return null;
      return {
        fileId: decodeURIComponent(parts[0]),
        scope,
        side,
        line: Number.isFinite(line) && line > 0 ? line : 1,
        column: Number.isFinite(column) && column > 0 ? column : 1
      };
    }
    function parseTargetSourceUri(uri) {
      if (!uri || typeof uri !== "object")
        return null;
      const value = uri;
      if (value.scheme !== REVIEW_TARGET_SCHEME)
        return null;
      const params = new URLSearchParams(String(value.query || ""));
      const fileId = params.get("sourceFileId");
      const scope = params.get("sourceScope");
      const side = params.get("sourceSide");
      const line = Number(params.get("sourceLine") || "1");
      const column = Number(params.get("sourceColumn") || "1");
      if (!fileId || !isReviewScope(scope) || !isNavigationSide(side)) {
        return null;
      }
      return {
        fileId,
        scope,
        side,
        line: Number.isFinite(line) && line > 0 ? line : 1,
        column: Number.isFinite(column) && column > 0 ? column : 1
      };
    }
    function resolveTarget(request) {
      const sourceFile = fileById.get(request.fileId);
      if (!sourceFile)
        return null;
      const normalizedSourcePath = normalizePath(request.sourcePath || sourceFile.path);
      const targetPath = resolvePathForLanguage(context, {
        ...request,
        sourcePath: normalizedSourcePath
      }, filePathSet, cargoRoots);
      if (!targetPath)
        return null;
      const targetFile = fileByPath.get(normalizePath(targetPath));
      if (!targetFile)
        return null;
      return chooseNavigationTarget(targetFile, request.scope, request.side);
    }
    function findReferences(request, files) {
      const target = resolveTarget(request);
      if (!target)
        return [];
      const matches = [];
      for (const file of files) {
        const candidates = collectNavigationRequests(file);
        for (const candidate of candidates) {
          const resolved = resolveTarget(candidate);
          if (!resolved || resolved.fileId !== target.fileId)
            continue;
          if (candidate.fileId === request.fileId && candidate.scope === request.scope && candidate.side === request.side && candidate.lineNumber === request.lineNumber) {
            continue;
          }
          matches.push({
            target: {
              fileId: candidate.fileId,
              scope: candidate.scope,
              side: candidate.side,
              line: candidate.lineNumber,
              column: candidate.column
            },
            sourcePath: candidate.sourcePath,
            lineNumber: candidate.lineNumber,
            column: candidate.column,
            lineText: getLineText(candidate.content, candidate.lineNumber)
          });
        }
      }
      return matches;
    }
    return {
      resolveTarget,
      findReferences,
      buildModelUri,
      buildTargetUri,
      parseModelUri,
      parseTargetUri,
      parseTargetSourceUri
    };
  }
  function chooseNavigationTarget(file, scope, side) {
    if (scope === "git-diff" && file.inGitDiff) {
      if (side === "original" && file.gitDiff?.hasOriginal) {
        return { fileId: file.id, scope, side, line: 1, column: 1 };
      }
      if (side === "modified" && file.gitDiff?.hasModified) {
        return { fileId: file.id, scope, side, line: 1, column: 1 };
      }
      return {
        fileId: file.id,
        scope,
        side: file.gitDiff?.hasModified ? "modified" : "original",
        line: 1,
        column: 1
      };
    }
    if (scope === "last-commit" && file.inLastCommit) {
      if (side === "original" && file.lastCommit?.hasOriginal) {
        return { fileId: file.id, scope, side, line: 1, column: 1 };
      }
      if (side === "modified" && file.lastCommit?.hasModified) {
        return { fileId: file.id, scope, side, line: 1, column: 1 };
      }
      return {
        fileId: file.id,
        scope,
        side: file.lastCommit?.hasModified ? "modified" : "original",
        line: 1,
        column: 1
      };
    }
    return {
      fileId: file.id,
      scope: "all-files",
      side: "modified",
      line: 1,
      column: 1
    };
  }
  function resolvePathForLanguage(context, request, filePathSet, cargoRoots) {
    switch (request.languageId) {
      case "typescript":
      case "javascript":
        return resolveTsLikeImportPath(request, filePathSet);
      case "go":
        return resolveGoImportPath(context.goModules, request, filePathSet);
      case "rust":
        return resolveRustImportPath(request, filePathSet, cargoRoots);
      case "c":
      case "cpp":
        return resolveQuotedIncludePath(request, filePathSet);
      default:
        return null;
    }
  }
  function collectNavigationRequests(file) {
    switch (file.languageId) {
      case "typescript":
      case "javascript":
        return collectTsLikeRequests(file);
      case "go":
        return collectGoRequests(file);
      case "rust":
        return collectRustRequests(file);
      case "c":
      case "cpp":
        return collectIncludeRequests(file);
      default:
        return [];
    }
  }
  function collectTsLikeRequests(file) {
    const requests = [];
    const lines = file.content.split(/\r?\n/);
    const patterns = [
      /\bfrom\s+(["'])([^"']+)\1/g,
      /\bexport\s+(?:type\s+)?(?:\*|\*\s+as\s+[A-Za-z_$][\w$]*|\{[^}]+\})\s+from\s+(["'])([^"']+)\1/g,
      /\bimport\s*\(\s*(["'])([^"']+)\1/g,
      /\brequire\s*\(\s*(["'])([^"']+)\1/g,
      /^\s*import\s+(["'])([^"']+)\1/g
    ];
    lines.forEach((line, index) => {
      const seenColumns = new Set;
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(line)) != null) {
          const value = match[2] || "";
          const valueIndex = match[0].indexOf(value);
          if (valueIndex < 0)
            continue;
          const column = match.index + valueIndex + 1;
          if (seenColumns.has(column))
            continue;
          seenColumns.add(column);
          requests.push({
            fileId: file.fileId,
            scope: file.scope,
            side: file.side,
            sourcePath: file.sourcePath,
            languageId: file.languageId,
            content: file.content,
            lineNumber: index + 1,
            column
          });
        }
      }
    });
    return requests;
  }
  function collectGoRequests(file) {
    const requests = [];
    const lines = file.content.split(/\r?\n/);
    let inImportBlock = false;
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^import\s*\($/.test(trimmed)) {
        inImportBlock = true;
        return;
      }
      if (inImportBlock && trimmed === ")") {
        inImportBlock = false;
        return;
      }
      const shouldInspect = /^import\s+/.test(trimmed) || inImportBlock;
      if (!shouldInspect)
        return;
      const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let match;
      while ((match = pattern.exec(line)) != null) {
        requests.push({
          fileId: file.fileId,
          scope: file.scope,
          side: file.side,
          sourcePath: file.sourcePath,
          languageId: file.languageId,
          content: file.content,
          lineNumber: index + 1,
          column: match.index + 2
        });
      }
    });
    return requests;
  }
  function collectRustRequests(file) {
    const requests = [];
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const modMatch = line.match(/^\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
      if (modMatch) {
        const moduleName = modMatch[1];
        const start = line.indexOf(moduleName);
        requests.push({
          fileId: file.fileId,
          scope: file.scope,
          side: file.side,
          sourcePath: file.sourcePath,
          languageId: file.languageId,
          content: file.content,
          lineNumber: index + 1,
          column: start + 1
        });
      }
      const useMatch = line.match(/^\s*(?:pub\s+)?use\s+(.+?)\s*;/);
      if (useMatch) {
        const usePath = useMatch[1].split(" as ")[0].split("::{")[0].trim();
        const start = line.indexOf(usePath);
        if (start >= 0) {
          requests.push({
            fileId: file.fileId,
            scope: file.scope,
            side: file.side,
            sourcePath: file.sourcePath,
            languageId: file.languageId,
            content: file.content,
            lineNumber: index + 1,
            column: start + 1
          });
        }
      }
    });
    return requests;
  }
  function collectIncludeRequests(file) {
    const requests = [];
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes("#include"))
        return;
      const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let match;
      while ((match = pattern.exec(line)) != null) {
        requests.push({
          fileId: file.fileId,
          scope: file.scope,
          side: file.side,
          sourcePath: file.sourcePath,
          languageId: file.languageId,
          content: file.content,
          lineNumber: index + 1,
          column: match.index + 2
        });
      }
    });
    return requests;
  }
  function resolveTsLikeImportPath(request, filePathSet) {
    const match = getStringLiteralAtCursor(request);
    if (!match)
      return null;
    if (!match.value.startsWith(".") && !match.value.startsWith("/"))
      return null;
    const basePath = match.value.startsWith("/") ? normalizePath(match.value.slice(1)) : normalizePath(joinPath(dirname(request.sourcePath), match.value));
    return findFirstExistingPath(buildTsLikeCandidates(basePath), filePathSet);
  }
  function buildTsLikeCandidates(basePath) {
    const candidates = new Set;
    const extension = getExtension(basePath);
    candidates.add(basePath);
    if (!extension) {
      for (const item of TS_LIKE_EXTENSIONS) {
        candidates.add(`${basePath}${item}`);
        candidates.add(joinPath(basePath, `index${item}`));
      }
    } else if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
      const withoutExtension = stripExtension(basePath);
      for (const item of TS_LIKE_EXTENSIONS) {
        candidates.add(`${withoutExtension}${item}`);
      }
    }
    return [...candidates];
  }
  function resolveGoImportPath(goModules, request, filePathSet) {
    const match = getStringLiteralAtCursor(request);
    if (!match)
      return null;
    const module = [...goModules].filter((item) => match.value === item.modulePath || match.value.startsWith(`${item.modulePath}/`)).sort((a, b) => b.modulePath.length - a.modulePath.length)[0];
    if (!module)
      return null;
    const suffix = match.value.slice(module.modulePath.length).replace(/^\//, "");
    const targetDir = normalizePath(suffix ? joinPath(module.rootPath, suffix) : module.rootPath);
    return pickGoPackageFile(targetDir, filePathSet);
  }
  function pickGoPackageFile(targetDir, filePathSet) {
    const candidates = [...filePathSet].filter((path) => dirname(path) === targetDir).filter((path) => path.endsWith(".go")).sort((a, b) => a.localeCompare(b));
    if (candidates.length === 0)
      return null;
    const directoryName = baseName(targetDir);
    const preferred = candidates.find((path) => !path.endsWith("_test.go") && (baseName(path) === `${directoryName}.go` || baseName(path) === "doc.go"));
    return preferred ?? candidates.find((path) => !path.endsWith("_test.go")) ?? candidates[0];
  }
  function resolveRustImportPath(request, filePathSet, cargoRoots) {
    const sourcePath = normalizePath(request.sourcePath);
    const cargoRoot = cargoRoots.find((root) => sourcePath === `${root}/src/lib.rs` || sourcePath === `${root}/src/main.rs` || sourcePath.startsWith(`${root}/src/`));
    if (cargoRoot == null)
      return null;
    const srcRoot = normalizePath(joinPath(cargoRoot, "src"));
    const modDeclaration = getRustModDeclaration(request);
    if (modDeclaration) {
      return findFirstExistingPath(buildRustModCandidates(sourcePath, modDeclaration), filePathSet);
    }
    const usePath = getRustUsePath(request);
    if (!usePath)
      return null;
    const absoluteSegments = resolveRustAbsoluteSegments(usePath, sourcePath, srcRoot);
    if (absoluteSegments == null || absoluteSegments.length === 0)
      return null;
    for (let index = absoluteSegments.length;index >= 1; index -= 1) {
      const prefix = absoluteSegments.slice(0, index);
      const candidates = [
        `${joinPath(srcRoot, ...prefix)}.rs`,
        joinPath(srcRoot, ...prefix, "mod.rs")
      ];
      const target = findFirstExistingPath(candidates, filePathSet);
      if (target)
        return target;
    }
    return null;
  }
  function getRustModDeclaration(request) {
    const line = getLineContent(request);
    const match = line.match(/^\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
    if (!match)
      return null;
    const moduleName = match[1];
    const start = line.indexOf(moduleName) + 1;
    const end = start + moduleName.length;
    if (request.column < start || request.column > end)
      return null;
    return moduleName;
  }
  function buildRustModCandidates(sourcePath, moduleName) {
    const normalizedSourcePath = normalizePath(sourcePath);
    const fileName = baseName(normalizedSourcePath);
    const baseDir = fileName === "lib.rs" || fileName === "main.rs" ? dirname(normalizedSourcePath) : fileName === "mod.rs" ? dirname(normalizedSourcePath) : stripExtension(normalizedSourcePath);
    return [
      joinPath(baseDir, `${moduleName}.rs`),
      joinPath(baseDir, moduleName, "mod.rs")
    ];
  }
  function getRustUsePath(request) {
    const line = getLineContent(request);
    const match = line.match(/^\s*(?:pub\s+)?use\s+(.+?)\s*;/);
    if (!match)
      return null;
    const usePath = match[1];
    const start = line.indexOf(usePath) + 1;
    const end = start + usePath.length;
    if (request.column < start || request.column > end)
      return null;
    return usePath.split(" as ")[0].split("::{")[0].trim();
  }
  function resolveRustAbsoluteSegments(usePath, sourcePath, srcRoot) {
    const segments = usePath.split("::").filter(Boolean);
    if (segments.length === 0)
      return null;
    if (segments[0] === "crate") {
      return segments.slice(1);
    }
    if (segments[0] === "self" || segments[0] === "super") {
      const currentSegments = getRustModuleSegments(sourcePath, srcRoot);
      if (currentSegments == null)
        return null;
      let index = 0;
      let resolved = [...currentSegments];
      while (segments[index] === "super") {
        resolved = resolved.slice(0, -1);
        index += 1;
      }
      if (segments[index] === "self") {
        index += 1;
      }
      return [...resolved, ...segments.slice(index)];
    }
    return null;
  }
  function getRustModuleSegments(sourcePath, srcRoot) {
    const normalizedSourcePath = normalizePath(sourcePath);
    const normalizedSrcRoot = normalizePath(srcRoot);
    if (!normalizedSourcePath.startsWith(`${normalizedSrcRoot}/`))
      return null;
    const relative = normalizedSourcePath.slice(normalizedSrcRoot.length + 1);
    const fileName = baseName(relative);
    if (fileName === "lib.rs" || fileName === "main.rs") {
      return [];
    }
    if (fileName === "mod.rs") {
      const folder = dirname(relative);
      return folder ? folder.split("/").filter(Boolean) : [];
    }
    return stripExtension(relative).split("/").filter(Boolean);
  }
  function resolveQuotedIncludePath(request, filePathSet) {
    const line = getLineContent(request);
    if (!line.includes("#include"))
      return null;
    const match = getStringLiteralAtCursor(request);
    if (!match || !match.value)
      return null;
    const candidates = [
      normalizePath(joinPath(dirname(request.sourcePath), match.value)),
      normalizePath(match.value)
    ];
    return findFirstExistingPath(candidates, filePathSet);
  }
  function getStringLiteralAtCursor(request) {
    const line = getLineContent(request);
    const quotePatterns = [
      /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      /'([^'\\]*(?:\\.[^'\\]*)*)'/g
    ];
    for (const pattern of quotePatterns) {
      let match;
      while ((match = pattern.exec(line)) != null) {
        const startColumn = match.index + 1;
        const endColumn = startColumn + match[0].length;
        if (request.column >= startColumn && request.column <= endColumn) {
          return {
            value: match[1],
            startColumn,
            endColumn
          };
        }
      }
    }
    return null;
  }
  function getLineContent(request) {
    const lines = request.content.split(/\r?\n/);
    return lines[request.lineNumber - 1] || "";
  }
  function getLineText(content, lineNumber) {
    return content.split(/\r?\n/)[lineNumber - 1] || "";
  }
  function findFirstExistingPath(candidates, filePathSet) {
    for (const candidate of candidates) {
      const normalized = normalizePath(candidate);
      if (filePathSet.has(normalized))
        return normalized;
    }
    return null;
  }
  function normalizePath(path) {
    const isAbsolute = path.startsWith("/");
    const normalized = path.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const resolved = [];
    for (const segment of segments) {
      if (!segment || segment === ".")
        continue;
      if (segment === "..") {
        if (resolved.length > 0)
          resolved.pop();
        continue;
      }
      resolved.push(segment);
    }
    return `${isAbsolute ? "/" : ""}${resolved.join("/")}`.replace(/^\//, "");
  }
  function joinPath(...parts) {
    return normalizePath(parts.filter(Boolean).join("/"));
  }
  function dirname(path) {
    const normalized = normalizePath(path);
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index) : "";
  }
  function baseName(path) {
    const normalized = normalizePath(path);
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(index + 1) : normalized;
  }
  function stripExtension(path) {
    const extension = getExtension(path);
    return extension ? path.slice(0, -extension.length) : path;
  }
  function getExtension(path) {
    const name = baseName(path);
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index) : "";
  }
  function isReviewScope(value) {
    return value === "git-diff" || value === "last-commit" || value === "all-files";
  }
  function isNavigationSide(value) {
    return value === "original" || value === "modified";
  }

  // src/web/app/runtime/controller.ts
  function createReviewRuntimeController(options) {
    const {
      dom: {
        submitButton,
        cancelButton,
        overallCommentButton,
        fileCommentButton,
        navigateBackButton,
        navigateForwardButton,
        showReferencesButton,
        peekDefinitionButton,
        toggleReviewedButton,
        toggleUnchangedButton,
        toggleWrapButton,
        toggleSidebarButton,
        scopeDiffButton,
        scopeLastCommitButton,
        scopeAllButton,
        sidebarSearchInputEl,
        sidebarStatusFilterEl,
        hideReviewedCheckboxEl,
        commentedOnlyCheckboxEl,
        changedOnlyCheckboxEl,
        changedSymbolsButton,
        agentActionButton
      },
      events: {
        onSubmit,
        onCancel,
        onShowOverallComment,
        onShowFileComment,
        onNavigateBack,
        onNavigateForward,
        onShowReferences,
        onPeekDefinition,
        onToggleReviewed,
        onToggleUnchanged,
        onToggleWrap,
        onToggleSidebar,
        onScopeDiff,
        onScopeLastCommit,
        onScopeAll,
        onSidebarSearchInput,
        onSidebarSearchClear,
        onStatusFilterChange,
        onHideReviewedChange,
        onCommentedOnlyChange,
        onChangedOnlyChange,
        onShowChangedSymbols,
        onAgentAction
      },
      messages: {
        onFileData,
        onFileError,
        onDefinitionData,
        onDefinitionError,
        onReferencesData,
        onReferencesError,
        onSubmitAck
      }
    } = options;
    function handleHostMessage(message) {
      if (!message || typeof message !== "object")
        return;
      if (message.type === "file-data") {
        onFileData(message);
        return;
      }
      if (message.type === "file-error") {
        onFileError(message);
        return;
      }
      if (message.type === "definition-data") {
        onDefinitionData(message);
        return;
      }
      if (message.type === "definition-error") {
        onDefinitionError(message);
        return;
      }
      if (message.type === "references-data") {
        onReferencesData(message);
        return;
      }
      if (message.type === "references-error") {
        onReferencesError(message);
        return;
      }
      if (message.type === "submit-ack") {
        onSubmitAck(message);
      }
    }
    function bind() {
      submitButton.addEventListener("click", onSubmit);
      cancelButton.addEventListener("click", onCancel);
      overallCommentButton.addEventListener("click", onShowOverallComment);
      fileCommentButton.addEventListener("click", onShowFileComment);
      navigateBackButton.addEventListener("click", onNavigateBack);
      navigateForwardButton.addEventListener("click", onNavigateForward);
      showReferencesButton.addEventListener("click", onShowReferences);
      peekDefinitionButton.addEventListener("click", onPeekDefinition);
      toggleUnchangedButton.addEventListener("click", onToggleUnchanged);
      toggleWrapButton.addEventListener("click", onToggleWrap);
      toggleReviewedButton.addEventListener("click", onToggleReviewed);
      scopeDiffButton.addEventListener("click", onScopeDiff);
      scopeLastCommitButton.addEventListener("click", onScopeLastCommit);
      scopeAllButton.addEventListener("click", onScopeAll);
      toggleSidebarButton.addEventListener("click", onToggleSidebar);
      sidebarSearchInputEl.addEventListener("input", () => {
        onSidebarSearchInput(sidebarSearchInputEl.value);
      });
      sidebarSearchInputEl.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          sidebarSearchInputEl.value = "";
          onSidebarSearchClear();
        }
      });
      sidebarStatusFilterEl.addEventListener("change", () => {
        onStatusFilterChange(sidebarStatusFilterEl.value);
      });
      hideReviewedCheckboxEl.addEventListener("change", () => {
        onHideReviewedChange(hideReviewedCheckboxEl.checked);
      });
      commentedOnlyCheckboxEl.addEventListener("change", () => {
        onCommentedOnlyChange(commentedOnlyCheckboxEl.checked);
      });
      changedOnlyCheckboxEl.addEventListener("change", () => {
        onChangedOnlyChange(changedOnlyCheckboxEl.checked);
      });
      changedSymbolsButton.addEventListener("click", onShowChangedSymbols);
      agentActionButton.addEventListener("click", onAgentAction);
      window.__reviewReceive = handleHostMessage;
    }
    return {
      bind,
      handleHostMessage
    };
  }

  // src/web/app/main.ts
  var reviewData = JSON.parse(document.getElementById("diff-review-data")?.textContent ?? "{}");
  var state = createInitialReviewState(reviewData);
  var navigationResolver = createReviewNavigationResolver(reviewData);
  var {
    sidebarEl,
    sidebarTitleEl,
    sidebarSearchInputEl,
    sidebarStatusFilterEl,
    hideReviewedCheckboxEl,
    commentedOnlyCheckboxEl,
    changedOnlyCheckboxEl,
    toggleSidebarButton,
    scopeDiffButton,
    scopeLastCommitButton,
    scopeAllButton,
    windowTitleEl,
    repoRootEl,
    fileTreeEl,
    summaryEl,
    currentFileLabelEl,
    currentSymbolLabelEl,
    modeHintEl,
    fileCommentsContainer,
    editorContainerEl,
    changedSymbolsContainerEl,
    outlineContainerEl,
    toggleOutlineButton,
    reviewQueueContainerEl,
    changedSymbolsButton,
    agentActionButton,
    submitButton,
    cancelButton,
    overallCommentButton,
    fileCommentButton,
    navigateBackButton,
    navigateForwardButton,
    showReferencesButton,
    peekDefinitionButton,
    toggleReviewedButton,
    toggleUnchangedButton,
    toggleWrapButton
  } = getReviewDomElements();
  repoRootEl.textContent = reviewData.repoRoot || "";
  windowTitleEl.textContent = "Review";
  var requestSequence = 0;
  var sidebarController = null;
  var commentManager = null;
  var editorController = null;
  var pendingFileWaiters = new Map;
  var pendingDefinitionWaiters = new Map;
  var pendingReferencesWaiters = new Map;
  var navigationBackStack = [];
  var navigationForwardStack = [];
  var isHistoryNavigation = false;
  var currentNavigationRequestAvailable = false;
  var summaryFlashTimeout = null;
  var pendingSubmitRequestId = null;
  var inspectorController = null;
  var commandPaletteController = null;
  var fileModel = createReviewFileModel({
    reviewDataFiles: reviewData.files,
    state,
    isFileReviewed: (fileId) => state.reviewedFiles[fileId] === true
  });
  function isFileReviewed(fileId) {
    return state.reviewedFiles[fileId] === true;
  }
  function flashSummary(message) {
    if (summaryFlashTimeout != null) {
      window.clearTimeout(summaryFlashTimeout);
    }
    const previous = summaryEl.textContent || "";
    summaryEl.textContent = message;
    summaryFlashTimeout = window.setTimeout(() => {
      summaryFlashTimeout = null;
      sidebarController?.renderTree();
      if (!summaryEl.textContent) {
        summaryEl.textContent = previous;
      }
    }, 1800);
  }
  function setSubmitPendingState(isPending) {
    submitButton.disabled = isPending;
    cancelButton.disabled = isPending;
    submitButton.textContent = isPending ? "Submitting…" : "Finish review";
  }
  var getScopedFiles = fileModel.getScopedFiles;
  var ensureActiveFileForScope = fileModel.ensureActiveFileForScope;
  var activeFile = fileModel.activeFile;
  var getScopeComparison = fileModel.getScopeComparison;
  var activeComparison = fileModel.activeComparison;
  var activeFileShowsDiff = fileModel.activeFileShowsDiff;
  var getScopeFilePath = fileModel.getScopeFilePath;
  var getScopeDisplayPath = fileModel.getScopeDisplayPath;
  var getScopeSidePath = fileModel.getScopeSidePath;
  var getActiveStatus = fileModel.getActiveStatus;
  var getFilteredFiles = fileModel.getFilteredFiles;
  function cacheKey(scope, fileId) {
    return `${scope}:${fileId}`;
  }
  function getRequestState(fileId, scope = state.currentScope) {
    const key = cacheKey(scope, fileId);
    return {
      contents: state.fileContents[key],
      error: state.fileErrors[key],
      requestId: state.pendingRequestIds[key]
    };
  }
  function resolvePendingFileWaiters(fileId, scope, value) {
    const key = cacheKey(scope, fileId);
    const waiters = pendingFileWaiters.get(key) ?? [];
    pendingFileWaiters.delete(key);
    waiters.forEach((waiter) => waiter.resolve(value));
  }
  function rejectPendingFileWaiters(fileId, scope) {
    const key = cacheKey(scope, fileId);
    const waiters = pendingFileWaiters.get(key) ?? [];
    pendingFileWaiters.delete(key);
    waiters.forEach((waiter) => waiter.resolve(null));
  }
  function loadFileContents(fileId, scope) {
    const requestState = getRequestState(fileId, scope);
    if (requestState.contents) {
      return Promise.resolve(requestState.contents);
    }
    if (requestState.error) {
      return Promise.resolve(null);
    }
    ensureFileLoaded(fileId, scope);
    return new Promise((resolve, reject) => {
      const key = cacheKey(scope, fileId);
      const waiters = pendingFileWaiters.get(key) ?? [];
      waiters.push({ resolve, reject });
      pendingFileWaiters.set(key, waiters);
    });
  }
  function ensureFileLoaded(fileId, scope = state.currentScope) {
    if (!fileId)
      return;
    const key = cacheKey(scope, fileId);
    if (state.fileContents[key] != null)
      return;
    if (state.fileErrors[key] != null)
      return;
    if (state.pendingRequestIds[key] != null)
      return;
    const requestId = `request:${Date.now()}:${++requestSequence}`;
    state.pendingRequestIds[key] = requestId;
    sidebarController?.renderTree();
    if (window.glimpse?.send) {
      window.glimpse.send({ type: "request-file", requestId, fileId, scope });
    }
  }
  var codeSearchController = createReviewCodeSearchController({
    scope: () => state.currentScope,
    getScopedFiles,
    getScopeComparison,
    getScopeSidePath,
    loadFileContents,
    onStateChange: () => {
      sidebarController?.renderTree();
    }
  });
  function getCodeSearchState() {
    return codeSearchController.getState();
  }
  function clearCodeSearch() {
    codeSearchController.clear();
  }
  function scheduleCodeSearch(query) {
    codeSearchController.schedule(query);
  }
  function resolvePendingDefinitionWaiters(requestId, value) {
    const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
    pendingDefinitionWaiters.delete(requestId);
    waiters.forEach((waiter) => waiter.resolve(value));
  }
  function rejectPendingDefinitionWaiters(requestId, reason) {
    const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
    pendingDefinitionWaiters.delete(requestId);
    waiters.forEach((waiter) => waiter.reject(reason));
  }
  function requestDefinitionTarget(request) {
    if (!window.glimpse?.send) {
      return Promise.resolve(null);
    }
    const requestId = `definition:${Date.now()}:${++requestSequence}`;
    const payload = {
      type: "request-definition",
      requestId,
      request
    };
    window.glimpse.send(payload);
    return new Promise((resolve, reject) => {
      const waiters = pendingDefinitionWaiters.get(requestId) ?? [];
      waiters.push({ resolve, reject });
      pendingDefinitionWaiters.set(requestId, waiters);
    });
  }
  function resolvePendingReferencesWaiters(requestId, value) {
    const waiters = pendingReferencesWaiters.get(requestId) ?? [];
    pendingReferencesWaiters.delete(requestId);
    waiters.forEach((waiter) => waiter.resolve(value));
  }
  function rejectPendingReferencesWaiters(requestId, reason) {
    const waiters = pendingReferencesWaiters.get(requestId) ?? [];
    pendingReferencesWaiters.delete(requestId);
    waiters.forEach((waiter) => waiter.reject(reason));
  }
  function requestReferenceTargets(request) {
    if (!window.glimpse?.send) {
      return Promise.resolve([]);
    }
    const requestId = `references:${Date.now()}:${++requestSequence}`;
    const payload = {
      type: "request-references",
      requestId,
      request
    };
    window.glimpse.send(payload);
    return new Promise((resolve, reject) => {
      const waiters = pendingReferencesWaiters.get(requestId) ?? [];
      waiters.push({ resolve, reject });
      pendingReferencesWaiters.set(requestId, waiters);
    });
  }
  function getNavigationErrorMessage(languageId, error) {
    const detail = error instanceof Error ? error.message.trim() : String(error || "").trim();
    const label = languageId === "rust" ? "Rust navigation unavailable" : languageId === "go" ? "Go navigation unavailable" : "Definition lookup unavailable";
    return detail ? `${label}: ${detail}` : label;
  }
  async function resolveDefinitionTarget(request, options = {}) {
    const semanticTarget = supportsSemanticDefinition(request.languageId) ? await requestDefinitionTarget(request).catch((error) => {
      if (!options.silent) {
        flashSummary(getNavigationErrorMessage(request.languageId, error));
      }
      return null;
    }) : null;
    return semanticTarget ?? navigationResolver.resolveTarget(request);
  }
  function getCurrentNavigationTarget() {
    return editorController?.getCurrentNavigationTarget() ?? null;
  }
  function getCurrentSelectionContext() {
    return editorController?.getCurrentSelectionContext() ?? null;
  }
  function getLoadedAnchorText(fileId, scope, side, lineNumber) {
    const key = cacheKey(scope, fileId);
    const contents = state.fileContents[key];
    if (!contents)
      return null;
    const content = side === "original" ? contents.originalContent : contents.modifiedContent;
    return content.split(/\r?\n/)[lineNumber - 1]?.trim() ?? null;
  }
  function getLoadedCommentAnchorText(comment) {
    if (comment.startLine == null || comment.side === "file")
      return null;
    return getLoadedAnchorText(comment.fileId, comment.scope, comment.side, comment.startLine);
  }
  function isCommentAnchorStale(comment) {
    if (!comment.anchorText || comment.startLine == null || comment.side === "file") {
      return false;
    }
    const currentLine = getLoadedCommentAnchorText(comment);
    return currentLine != null && currentLine !== comment.anchorText.trim();
  }
  function getActiveLocationLabel() {
    const file = activeFile();
    const target = getCurrentNavigationTarget();
    if (!file || !target)
      return null;
    const path = target.scope === "all-files" ? file.path : getScopeSidePath(file, target.scope, target.side) || file.path;
    const sideSuffix = target.scope === "all-files" ? "" : target.side === "original" ? " (old)" : " (new)";
    return `${path}:${target.line}:${target.column}${sideSuffix}`;
  }
  function getSelectionReference() {
    const selection = getCurrentSelectionContext();
    const file = activeFile();
    if (!selection || !file)
      return null;
    const path = selection.scope === "all-files" ? file.path : getScopeSidePath(file, selection.scope, selection.side) || file.path;
    const range = selection.startLine === selection.endLine ? `${selection.startLine}` : `${selection.startLine}-${selection.endLine}`;
    const sideSuffix = selection.scope === "all-files" ? "" : selection.side === "original" ? " (old)" : " (new)";
    return `${path}:${range}${sideSuffix}`;
  }
  function navigateSubmittedComment(direction) {
    if (!inspectorController?.navigateSubmittedComment(direction)) {
      flashSummary("No submitted comments in this scope");
      return;
    }
    flashSummary(direction === "next" ? "Jumped to next submitted comment" : "Jumped to previous submitted comment");
  }
  function renderReviewQueue() {
    inspectorController?.renderReviewQueue();
  }
  async function renderOutline() {
    await inspectorController?.renderOutline();
  }
  function updateNavigationButtons() {
    navigateBackButton.disabled = navigationBackStack.length === 0;
    navigateForwardButton.disabled = navigationForwardStack.length === 0;
    showReferencesButton.disabled = !currentNavigationRequestAvailable;
    peekDefinitionButton.disabled = !currentNavigationRequestAvailable;
  }
  function updateEditorContextUI(context) {
    currentNavigationRequestAvailable = context.navigationRequest != null;
    currentSymbolLabelEl.textContent = context.symbolTitle ? `Symbol: ${context.symbolTitle}${context.symbolLine ? ` · line ${context.symbolLine}` : ""}` : "";
    updateNavigationButtons();
    renderOutline();
  }
  function recordNavigationCheckpoint(checkpoint = null) {
    if (isHistoryNavigation)
      return;
    const current = checkpoint ?? getCurrentNavigationTarget();
    if (!current)
      return;
    const previous = navigationBackStack[navigationBackStack.length - 1] ?? null;
    if (!sameNavigationTarget(previous, current)) {
      navigationBackStack.push(current);
    }
    navigationForwardStack.length = 0;
    updateNavigationButtons();
  }
  function describeNavigationTarget(target) {
    const file = reviewData.files.find((item) => item.id === target.fileId) ?? null;
    if (!file)
      return "unknown target";
    const path = getScopeDisplayPath(file, target.scope);
    const sideLabel = target.scope === "all-files" ? "" : target.side === "original" ? " (old)" : " (new)";
    const scopeText = target.scope === state.currentScope ? "" : ` in ${scopeLabel(target.scope)}`;
    return `${path}${sideLabel}${scopeText}`;
  }
  function getCurrentNavigationRequest() {
    return editorController?.getCurrentNavigationRequest() ?? null;
  }
  function getReferenceSearchTarget(file) {
    if (state.currentScope === "git-diff" && file.inGitDiff) {
      return {
        scope: "git-diff",
        side: file.gitDiff?.hasModified ? "modified" : "original"
      };
    }
    if (state.currentScope === "last-commit" && file.inLastCommit) {
      return {
        scope: "last-commit",
        side: file.lastCommit?.hasModified ? "modified" : "original"
      };
    }
    return {
      scope: "all-files",
      side: "modified"
    };
  }
  function sortReferenceTargets(left, right) {
    const leftFile = reviewData.files.find((file) => file.id === left.fileId) ?? null;
    const rightFile = reviewData.files.find((file) => file.id === right.fileId) ?? null;
    const leftChanged = leftFile?.inGitDiff || leftFile?.inLastCommit ? 1 : 0;
    const rightChanged = rightFile?.inGitDiff || rightFile?.inLastCommit ? 1 : 0;
    if (leftChanged !== rightChanged)
      return rightChanged - leftChanged;
    const leftScopeMatch = left.scope === state.currentScope ? 1 : 0;
    const rightScopeMatch = right.scope === state.currentScope ? 1 : 0;
    if (leftScopeMatch !== rightScopeMatch)
      return rightScopeMatch - leftScopeMatch;
    return describeNavigationTarget(left).localeCompare(describeNavigationTarget(right));
  }
  async function handleShowReferences() {
    const request = getCurrentNavigationRequest();
    if (!request) {
      showReferenceModal({
        title: "References",
        description: "Select a repo-local symbol, import, or module path first.",
        items: [],
        emptyLabel: "No active navigation target is available at the current cursor."
      });
      return;
    }
    const target = await resolveDefinitionTarget(request);
    if (!target) {
      showReferenceModal({
        title: "References",
        description: "This selection does not resolve to a repo-local navigation target.",
        items: [],
        emptyLabel: "No repo-local references are available for the current selection."
      });
      return;
    }
    showReferencesButton.disabled = true;
    const previousLabel = showReferencesButton.textContent || "References";
    showReferencesButton.textContent = "Searching…";
    try {
      let matches;
      if (supportsSemanticDefinition(request.languageId)) {
        const semanticTargets = await requestReferenceTargets(request).catch((error) => {
          flashSummary(getNavigationErrorMessage(request.languageId, error));
          return [];
        }) ?? [];
        const semanticItems = await Promise.all(semanticTargets.map(async (target2) => {
          const file = reviewData.files.find((item) => item.id === target2.fileId);
          const contents = await loadFileContents(target2.fileId, target2.scope);
          const content = target2.side === "original" ? contents?.originalContent ?? "" : contents?.modifiedContent ?? "";
          const lineText = content.split(/\r?\n/)[target2.line - 1] ?? "";
          return {
            target: target2,
            lineNumber: target2.line,
            column: target2.column,
            sourcePath: getScopeDisplayPath(file ?? null, target2.scope),
            lineText
          };
        }));
        matches = semanticItems.sort((a, b) => sortReferenceTargets(a.target, b.target));
      } else {
        const searchableFiles = reviewData.files.filter((file) => file.hasWorkingTreeFile);
        const loadedFiles = await Promise.all(searchableFiles.map(async (file) => ({
          file,
          contents: await loadFileContents(file.id, "all-files")
        })));
        matches = navigationResolver.findReferences(request, loadedFiles.filter((item) => item.contents != null).map((item) => {
          const target2 = getReferenceSearchTarget(item.file);
          return {
            fileId: item.file.id,
            scope: target2.scope,
            side: target2.side,
            sourcePath: item.file.path,
            languageId: inferLanguage(item.file.path),
            content: item.contents?.modifiedContent || ""
          };
        })).sort((a, b) => sortReferenceTargets(a.target, b.target));
      }
      showReferenceModal({
        title: `References for ${describeNavigationTarget(target)}`,
        description: "Use the modal filters to focus on changed files or the current review scope.",
        emptyLabel: "No repo-local references were found in the current workspace snapshot.",
        items: matches.map((match) => {
          const file = reviewData.files.find((item) => item.id === match.target.fileId);
          return {
            title: `${describeNavigationTarget(match.target)}:${match.lineNumber}`,
            description: match.sourcePath,
            preview: match.lineText.trim(),
            isChanged: Boolean(file?.inGitDiff || file?.inLastCommit),
            isCurrentScope: match.target.scope === state.currentScope,
            onSelect: () => {
              openNavigationTarget({
                ...match.target,
                line: match.lineNumber,
                column: match.column
              });
            }
          };
        })
      });
    } finally {
      showReferencesButton.disabled = false;
      showReferencesButton.textContent = previousLabel;
      updateNavigationButtons();
    }
  }
  async function handlePeekDefinition() {
    const request = getCurrentNavigationRequest();
    if (!request)
      return;
    const target = await resolveDefinitionTarget(request);
    if (!target)
      return;
    peekDefinitionButton.disabled = true;
    const previousLabel = peekDefinitionButton.textContent || "Peek";
    peekDefinitionButton.textContent = "Loading…";
    try {
      const contents = await loadFileContents(target.fileId, target.scope);
      if (!contents)
        return;
      const previewContent = target.side === "original" ? contents.originalContent : contents.modifiedContent;
      showPeekModal({
        title: `Peek ${describeNavigationTarget(target)}`,
        description: "Preview the target in-place before jumping.",
        code: buildPreviewSnippet(previewContent, target.line || 1),
        onOpen: () => {
          openNavigationTarget(target);
        }
      });
    } finally {
      peekDefinitionButton.disabled = false;
      peekDefinitionButton.textContent = previousLabel;
      updateNavigationButtons();
    }
  }
  function openFile(fileId) {
    if (state.activeFileId === fileId) {
      ensureFileLoaded(fileId, state.currentScope);
      return;
    }
    recordNavigationCheckpoint();
    editorController?.saveCurrentScrollPosition();
    state.activeFileId = fileId;
    renderAll({ restoreFileScroll: true });
    ensureFileLoaded(fileId, state.currentScope);
    updateNavigationButtons();
  }
  function openNavigationTarget(target, options = {}) {
    const targetFile = reviewData.files.find((file) => file.id === target.fileId);
    if (!targetFile)
      return;
    const scopeChanged = state.currentScope !== target.scope;
    const fileChanged = state.activeFileId !== target.fileId;
    const current = getCurrentNavigationTarget();
    if (!sameNavigationTarget(current, target)) {
      recordNavigationCheckpoint(options.source ?? null);
    }
    if (scopeChanged || fileChanged) {
      editorController?.saveCurrentScrollPosition();
    }
    state.currentScope = target.scope;
    state.activeFileId = target.fileId;
    ensureActiveFileForScope();
    renderAll({ restoreFileScroll: false, preserveScroll: false });
    ensureFileLoaded(targetFile.id, target.scope);
    editorController?.revealNavigationTarget(target);
    updateNavigationButtons();
  }
  function openCodeSearchMatch(match) {
    openNavigationTarget(match.target);
  }
  sidebarController = createSidebarController({
    reviewDataFiles: reviewData.files,
    state,
    sidebarEl,
    sidebarTitleEl,
    fileTreeEl,
    summaryEl,
    modeHintEl,
    sidebarStatusFilterEl,
    hideReviewedCheckboxEl,
    commentedOnlyCheckboxEl,
    changedOnlyCheckboxEl,
    submitButton,
    toggleReviewedButton,
    toggleUnchangedButton,
    toggleWrapButton,
    toggleSidebarButton,
    scopeDiffButton,
    scopeLastCommitButton,
    scopeAllButton,
    scopeLabel,
    scopeHint,
    statusBadgeClass,
    statusLabel,
    getScopedFiles,
    getFilteredFiles,
    getRequestState,
    isFileReviewed,
    getCodeSearchState,
    getActiveStatus,
    activeFile,
    openFile,
    openCodeSearchMatch,
    ensureActiveFileForScope,
    activeFileShowsDiff
  });
  commentManager = createCommentManager({
    state,
    activeFile,
    scopeLabel,
    fileCommentsContainer,
    onCommentsChange: updateCommentsUI
  });
  function addInlineComment(fileId, side, line) {
    state.comments.push(createComment({
      fileId,
      scope: state.currentScope,
      side,
      startLine: line,
      endLine: line,
      body: "",
      status: "draft",
      collapsed: false,
      anchorPath: getScopeSidePath(activeFile(), state.currentScope, side),
      anchorText: getLoadedAnchorText(fileId, state.currentScope, side, line) ?? undefined
    }));
  }
  editorController = createReviewEditor({
    state,
    activeFile,
    activeFileShowsDiff,
    getScopeFilePath,
    getScopeSidePath,
    getScopeDisplayPath,
    getRequestState,
    ensureFileLoaded,
    renderCommentDOM: (comment, options) => commentManager?.renderCommentDOM(comment, options) ?? document.createElement("div"),
    addInlineComment,
    onCommentsChange: () => {
      updateCommentsUI();
    },
    onEditorContextChange: updateEditorContextUI,
    renderFileComments: () => {
      commentManager?.renderFileComments();
    },
    canCommentOnSide,
    resolveNavigationTarget: (request) => navigationResolver.resolveTarget(request),
    resolveDefinitionTarget,
    describeNavigationTarget,
    openNavigationTarget,
    navigationResolver,
    editorContainerEl,
    currentFileLabelEl
  });
  function showOverallCommentModal() {
    showTextModal({
      title: "Overall review note",
      description: "This note is prepended to the generated prompt above the inline comments.",
      initialValue: state.overallComment,
      saveLabel: "Save note",
      onSave: (value) => {
        state.overallComment = value;
        sidebarController?.renderTree();
      }
    });
  }
  function showFileCommentModal() {
    const file = activeFile();
    if (!file)
      return;
    showTextModal({
      title: `File comment for ${getScopeDisplayPath(file, state.currentScope)}`,
      description: `This comment applies to the whole file in ${scopeLabel(state.currentScope).toLowerCase()}.`,
      initialValue: "",
      saveLabel: "Add comment",
      onSave: (value) => {
        if (!value)
          return;
        state.comments.push(createComment({
          fileId: file.id,
          scope: state.currentScope,
          side: "file",
          startLine: null,
          endLine: null,
          body: value,
          status: "submitted",
          collapsed: false,
          anchorPath: getScopeDisplayPath(file, state.currentScope)
        }));
        submitButton.disabled = false;
        updateCommentsUI();
      }
    });
  }
  async function handleShowChangedSymbols() {
    changedSymbolsButton.disabled = true;
    const previousLabel = changedSymbolsButton.textContent || "Changed symbols";
    changedSymbolsButton.textContent = "Loading…";
    try {
      const changedFiles = reviewData.files.filter((file) => file.inGitDiff || file.inLastCommit || file.worktreeStatus != null);
      const items = (await Promise.all(changedFiles.map(async (file) => {
        const contents = await loadFileContents(file.id, "all-files");
        const content = contents?.modifiedContent ?? contents?.originalContent ?? "";
        const languageId = inferLanguage(file.path);
        return extractReviewSymbols(content, languageId).map((symbol) => ({
          file,
          symbol
        }));
      }))).flat().sort((left, right) => {
        if (left.file.path !== right.file.path) {
          return left.file.path.localeCompare(right.file.path);
        }
        return left.symbol.lineNumber - right.symbol.lineNumber;
      });
      showSymbolModal({
        title: "Changed symbols",
        description: "Jump to the meaningful parts of the current local change set.",
        items: items.map(({ file, symbol }) => ({
          title: symbol.title,
          kind: symbol.kind,
          description: `${file.path} · line ${symbol.lineNumber}`,
          onSelect: () => {
            openNavigationTarget({
              fileId: file.id,
              scope: file.inGitDiff ? "git-diff" : file.inLastCommit ? "last-commit" : "all-files",
              side: file.gitDiff?.hasModified || file.lastCommit?.hasModified || file.hasWorkingTreeFile ? "modified" : "original",
              line: symbol.lineNumber,
              column: 1
            });
          }
        }))
      });
    } finally {
      changedSymbolsButton.disabled = false;
      changedSymbolsButton.textContent = previousLabel;
    }
  }
  function buildAgentActionComment(kind, body, selection, useSelection) {
    const file = activeFile();
    if (!file)
      return;
    state.comments.push(createComment({
      fileId: file.id,
      scope: state.currentScope,
      side: useSelection ? selection?.side ?? "modified" : "file",
      startLine: useSelection ? selection?.startLine ?? null : null,
      endLine: useSelection ? selection?.endLine ?? null : null,
      body,
      status: "submitted",
      collapsed: false,
      kind,
      anchorPath: getScopeDisplayPath(file, state.currentScope),
      anchorText: useSelection ? selection?.selectedText.trim().split(/\r?\n/)[0] : undefined
    }));
    updateCommentsUI();
  }
  function handleAgentAction() {
    const selection = getCurrentSelectionContext();
    const hasSelection = Boolean(selection?.selectedText.trim());
    const contextDescription = hasSelection ? `Selected lines ${selection?.startLine}-${selection?.endLine}` : activeFile() ? `Current file ${getScopeDisplayPath(activeFile(), state.currentScope)}` : "Current review context";
    showActionModal({
      title: "Ask agent about this review context",
      description: `${contextDescription}. These prompts will be added to the review queue and included in the final handoff.`,
      actions: [
        {
          label: "Explain this code",
          description: "Ask for a plain-language walkthrough of the selected code or current file context.",
          onSelect: () => {
            buildAgentActionComment("explain", hasSelection ? "Explain what this selected code does, which surrounding state or control flow it depends on, and any non-obvious details I should understand before approving it." : "Explain the current file changes in plain language, focusing on the intent and any non-obvious tradeoffs.", selection, hasSelection);
          }
        },
        {
          label: "Explain this change",
          description: "Ask why this change exists and how it fits the broader diff.",
          onSelect: () => {
            buildAgentActionComment("question", hasSelection ? "Explain what changed in this selected code and why this approach was chosen over the most obvious alternatives." : "Summarize what changed in this file and why these edits matter to the overall change set.", selection, hasSelection);
          }
        },
        {
          label: "Risk-check",
          description: "Ask for regressions, edge cases, and failure modes worth reviewing.",
          onSelect: () => {
            buildAgentActionComment("risk", "Review this context for regressions, edge cases, and correctness risks. Call out the most important things I should double-check in the diff.", selection, hasSelection);
          }
        },
        {
          label: "Test ideas",
          description: "Ask which tests matter most before accepting the change.",
          onSelect: () => {
            buildAgentActionComment("tests", "Suggest the most important tests to run or add for this context, and explain what each test would protect against.", selection, hasSelection);
          }
        }
      ]
    });
  }
  inspectorController = createReviewInspectorController({
    reviewDataFiles: reviewData.files,
    state,
    changedSymbolsContainerEl,
    outlineContainerEl,
    toggleOutlineButtonEl: toggleOutlineButton,
    reviewQueueContainerEl,
    activeFile,
    getCurrentNavigationTarget,
    getScopeComparison,
    getScopeFilePath,
    getScopeDisplayPath,
    loadFileContents,
    openNavigationTarget,
    onCommentsChange: updateCommentsUI,
    getCommentKind: (comment) => getCommentKind(comment),
    getCommentKindLabel,
    isCommentAnchorStale
  });
  toggleOutlineButton.addEventListener("click", () => {
    inspectorController?.toggleFullOutlineVisibility();
  });
  commandPaletteController = createReviewCommandPaletteController({
    state,
    currentSymbolLabelEl,
    sidebarSearchInputEl,
    getScopedFiles,
    activeFile,
    getScopeDisplayPath,
    getActiveStatus,
    statusLabel,
    scopeLabel,
    getCurrentSelectionContext,
    getCurrentNavigationTarget,
    getActiveLocationLabel,
    getSelectionReference,
    loadFileContents,
    describeNavigationTarget,
    writeToClipboard,
    flashSummary,
    openFile,
    handleShowChangedSymbols,
    handleAgentAction,
    navigateSubmittedComment
  });
  function openQuickOpenFiles() {
    commandPaletteController?.openQuickOpenFiles();
  }
  function openCommandPalette() {
    commandPaletteController?.openCommandPalette();
  }
  function layoutEditor() {
    editorController?.layout();
  }
  function canCommentOnSide(file, side) {
    if (!file)
      return false;
    const comparison = activeComparison();
    if (side === "original") {
      return comparison != null && comparison.hasOriginal;
    }
    return comparison != null ? comparison.hasModified : file.hasWorkingTreeFile;
  }
  function syncViewZones() {
    editorController?.syncViewZones();
  }
  function updateDecorations() {
    editorController?.updateDecorations();
  }
  function mountFile(options = {}) {
    editorController?.mountFile(options);
  }
  function updateCommentsUI() {
    sidebarController?.renderTree();
    syncViewZones();
    updateDecorations();
    commentManager?.renderFileComments();
    renderReviewQueue();
  }
  function applyEditorOptions() {
    editorController?.applyOptions();
  }
  function renderAll(options = {}) {
    sidebarController?.renderTree();
    submitButton.disabled = false;
    updateNavigationButtons();
    renderReviewQueue();
    renderOutline();
    if (editorController) {
      mountFile(options);
      requestAnimationFrame(() => {
        layoutEditor();
        setTimeout(layoutEditor, 50);
      });
    } else {
      commentManager?.renderFileComments();
    }
  }
  function setupMonaco() {
    editorController?.setupMonaco(() => {
      mountFile();
    });
  }
  function switchScope(scope) {
    const hasScopeFiles = {
      "git-diff": reviewData.files.some((file2) => file2.inGitDiff),
      "last-commit": reviewData.files.some((file2) => file2.inLastCommit),
      "all-files": reviewData.files.some((file2) => file2.hasWorkingTreeFile)
    };
    if (!hasScopeFiles[scope] || state.currentScope === scope)
      return;
    recordNavigationCheckpoint();
    editorController?.saveCurrentScrollPosition();
    state.currentScope = scope;
    renderAll({ restoreFileScroll: true });
    scheduleCodeSearch(state.fileFilter);
    const file = activeFile();
    if (file)
      ensureFileLoaded(file.id, state.currentScope);
    updateNavigationButtons();
  }
  function handleSubmitReview() {
    if (pendingSubmitRequestId) {
      return;
    }
    commentManager?.syncCommentBodiesFromDOM();
    const requestId = `submit:${Date.now()}:${++requestSequence}`;
    const payload = {
      type: "submit",
      requestId,
      overallComment: state.overallComment.trim(),
      comments: state.comments.map((comment) => ({
        ...comment,
        body: comment.body.trim(),
        kind: getCommentKind(comment)
      })).filter((comment) => comment.status === "submitted" && comment.body.length > 0)
    };
    pendingSubmitRequestId = requestId;
    setSubmitPendingState(true);
    window.glimpse.send(payload);
    flashSummary("Submitting review feedback…");
  }
  function handleCancelReview() {
    window.glimpse.send({ type: "cancel" });
    window.glimpse.close();
  }
  function handleToggleReviewed() {
    const file = activeFile();
    if (!file)
      return;
    state.reviewedFiles[file.id] = !isFileReviewed(file.id);
    sidebarController?.renderTree();
  }
  function handleToggleUnchanged() {
    state.hideUnchanged = !state.hideUnchanged;
    applyEditorOptions();
    sidebarController?.updateToggleButtons();
    requestAnimationFrame(layoutEditor);
  }
  function handleToggleWrap() {
    state.wrapLines = !state.wrapLines;
    applyEditorOptions();
    sidebarController?.updateToggleButtons();
    requestAnimationFrame(() => {
      layoutEditor();
      setTimeout(layoutEditor, 50);
    });
  }
  function handleToggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    sidebarController?.updateSidebarLayout();
    requestAnimationFrame(() => {
      layoutEditor();
      setTimeout(layoutEditor, 50);
    });
  }
  function handleNavigateBack() {
    const target = navigationBackStack.pop();
    const current = getCurrentNavigationTarget();
    if (!target || !current) {
      updateNavigationButtons();
      return;
    }
    if (!sameNavigationTarget(current, target)) {
      navigationForwardStack.push(current);
    }
    isHistoryNavigation = true;
    try {
      openNavigationTarget(target);
    } finally {
      isHistoryNavigation = false;
      updateNavigationButtons();
    }
  }
  function handleNavigateForward() {
    const target = navigationForwardStack.pop();
    const current = getCurrentNavigationTarget();
    if (!target || !current) {
      updateNavigationButtons();
      return;
    }
    if (!sameNavigationTarget(current, target)) {
      navigationBackStack.push(current);
    }
    isHistoryNavigation = true;
    try {
      openNavigationTarget(target);
    } finally {
      isHistoryNavigation = false;
      updateNavigationButtons();
    }
  }
  function handleHostFileData(message) {
    const key = cacheKey(message.scope, message.fileId);
    state.fileContents[key] = {
      originalContent: message.originalContent,
      modifiedContent: message.modifiedContent
    };
    delete state.fileErrors[key];
    delete state.pendingRequestIds[key];
    resolvePendingFileWaiters(message.fileId, message.scope, state.fileContents[key]);
    sidebarController?.renderTree();
    if (state.activeFileId === message.fileId && state.currentScope === message.scope) {
      mountFile({ restoreFileScroll: true });
    }
  }
  function handleHostFileError(message) {
    const key = cacheKey(message.scope, message.fileId);
    state.fileErrors[key] = message.message || "Unknown error";
    delete state.pendingRequestIds[key];
    rejectPendingFileWaiters(message.fileId, message.scope);
    sidebarController?.renderTree();
    if (state.activeFileId === message.fileId && state.currentScope === message.scope) {
      mountFile({ preserveScroll: false });
    }
  }
  function handleHostDefinitionData(message) {
    resolvePendingDefinitionWaiters(message.requestId, message.target);
  }
  function handleHostDefinitionError(message) {
    rejectPendingDefinitionWaiters(message.requestId, new Error(message.message || "Unknown navigation error"));
  }
  function handleHostReferencesData(message) {
    resolvePendingReferencesWaiters(message.requestId, message.targets ?? []);
  }
  function handleHostReferencesError(message) {
    rejectPendingReferencesWaiters(message.requestId, new Error(message.message || "Unknown references error"));
  }
  function handleHostSubmitAck(message) {
    if (message.requestId !== pendingSubmitRequestId)
      return;
    flashSummary(`Review received by host${message.commentCount > 0 ? ` (${message.commentCount} comment${message.commentCount === 1 ? "" : "s"})` : ""}. Closing…`);
  }
  var runtimeController = createReviewRuntimeController({
    dom: {
      submitButton,
      cancelButton,
      overallCommentButton,
      fileCommentButton,
      navigateBackButton,
      navigateForwardButton,
      showReferencesButton,
      peekDefinitionButton,
      toggleReviewedButton,
      toggleUnchangedButton,
      toggleWrapButton,
      toggleSidebarButton,
      scopeDiffButton,
      scopeLastCommitButton,
      scopeAllButton,
      sidebarSearchInputEl,
      sidebarStatusFilterEl,
      hideReviewedCheckboxEl,
      commentedOnlyCheckboxEl,
      changedOnlyCheckboxEl,
      changedSymbolsButton,
      agentActionButton
    },
    events: {
      onSubmit: handleSubmitReview,
      onCancel: handleCancelReview,
      onShowOverallComment: showOverallCommentModal,
      onShowFileComment: showFileCommentModal,
      onNavigateBack: handleNavigateBack,
      onNavigateForward: handleNavigateForward,
      onShowReferences: () => {
        handleShowReferences();
      },
      onPeekDefinition: () => {
        handlePeekDefinition();
      },
      onToggleReviewed: handleToggleReviewed,
      onToggleUnchanged: handleToggleUnchanged,
      onToggleWrap: handleToggleWrap,
      onToggleSidebar: handleToggleSidebar,
      onScopeDiff: () => switchScope("git-diff"),
      onScopeLastCommit: () => switchScope("last-commit"),
      onScopeAll: () => switchScope("all-files"),
      onSidebarSearchInput: (value) => {
        state.fileFilter = value;
        scheduleCodeSearch(value);
        sidebarController?.renderTree();
      },
      onSidebarSearchClear: () => {
        state.fileFilter = "";
        clearCodeSearch();
        sidebarController?.renderTree();
      },
      onStatusFilterChange: (value) => {
        state.statusFilter = value ?? "all";
        sidebarController?.renderTree();
      },
      onHideReviewedChange: (checked) => {
        state.hideReviewedFiles = checked;
        sidebarController?.renderTree();
      },
      onCommentedOnlyChange: (checked) => {
        state.showCommentedFilesOnly = checked;
        sidebarController?.renderTree();
      },
      onChangedOnlyChange: (checked) => {
        state.showChangedFilesOnly = checked;
        sidebarController?.renderTree();
      },
      onShowChangedSymbols: () => {
        handleShowChangedSymbols();
      },
      onAgentAction: handleAgentAction
    },
    messages: {
      onFileData: handleHostFileData,
      onFileError: handleHostFileError,
      onDefinitionData: handleHostDefinitionData,
      onDefinitionError: handleHostDefinitionError,
      onReferencesData: handleHostReferencesData,
      onReferencesError: handleHostReferencesError,
      onSubmitAck: handleHostSubmitAck
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openCommandPalette();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      openQuickOpenFiles();
      return;
    }
    if (event.defaultPrevented)
      return;
    const target = event.target;
    const isTypingTarget = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable === true;
    if (isTypingTarget)
      return;
    if (event.key === "f" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      sidebarSearchInputEl.focus();
      sidebarSearchInputEl.select();
      return;
    }
    if (event.key === "s" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      handleShowChangedSymbols();
      return;
    }
    if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      navigateSubmittedComment(event.shiftKey ? "previous" : "next");
      return;
    }
    if (event.key === "e" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      handleAgentAction();
    }
  });
  runtimeController.bind();
  updateNavigationButtons();
  ensureActiveFileForScope();
  sidebarController?.renderTree();
  commentManager?.renderFileComments();
  renderReviewQueue();
  renderOutline();
  sidebarController?.updateSidebarLayout();
  setupMonaco();
})();
