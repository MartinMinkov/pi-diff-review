(() => {
  // src/web/shared/lib/utils.ts
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
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
        return "Review working tree changes against HEAD. Hover or click line numbers in the gutter to add an inline comment. Cmd/Ctrl-click repo-local imports to jump to the referenced file, or use References for related review context.";
      case "last-commit":
        return "Review the last commit against its parent. Hover or click line numbers in the gutter to add an inline comment. Cmd/Ctrl-click repo-local imports to jump to the referenced file, or use References for related review context.";
      default:
        return "Review the current working tree snapshot. Hover or click line numbers in the gutter to add a code review comment. Cmd/Ctrl-click repo-local imports to jump to the referenced file, or use References for related review context.";
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
  function normalizeQuery(query) {
    return String(query || "").trim().toLowerCase().replace(/\s+/g, "");
  }
  function scoreSubsequence(query, candidate) {
    if (!query)
      return 0;
    let queryIndex = 0;
    let score = 0;
    let firstMatchIndex = -1;
    let previousMatchIndex = -2;
    for (let i = 0;i < candidate.length && queryIndex < query.length; i += 1) {
      if (candidate[i] !== query[queryIndex])
        continue;
      if (firstMatchIndex === -1)
        firstMatchIndex = i;
      score += 10;
      if (i === previousMatchIndex + 1) {
        score += 8;
      }
      const previousChar = i > 0 ? candidate[i - 1] : "";
      if (i === 0 || previousChar === "/" || previousChar === "_" || previousChar === "-" || previousChar === ".") {
        score += 12;
      }
      previousMatchIndex = i;
      queryIndex += 1;
    }
    if (queryIndex !== query.length)
      return -1;
    if (firstMatchIndex >= 0)
      score += Math.max(0, 20 - firstMatchIndex);
    return score;
  }
  function getFileSearchScore(query, file) {
    const normalizedQuery = normalizeQuery(query);
    if (!normalizedQuery)
      return 0;
    const path = getFileSearchPath(file).toLowerCase();
    const baseName = getBaseName(path);
    const pathScore = scoreSubsequence(normalizedQuery, path);
    const baseScore = scoreSubsequence(normalizedQuery, baseName);
    let score = Math.max(pathScore, baseScore >= 0 ? baseScore + 40 : -1);
    if (score < 0)
      return -1;
    if (baseName === normalizedQuery)
      score += 200;
    else if (baseName.startsWith(normalizedQuery))
      score += 120;
    else if (path.includes(normalizedQuery))
      score += 35;
    return score;
  }
  function getFileSearchPath(file) {
    return file?.path || "";
  }
  function getBaseName(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] || path;
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
      getActiveStatus,
      activeFile,
      openFile,
      ensureActiveFileForScope,
      activeFileShowsDiff
    } = options;
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
    function renderSearchResults(files) {
      files.forEach((file) => {
        const path = getFileSearchPath(file);
        const baseName = getBaseName(path);
        const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        const count = getSubmittedCommentCount(file.id);
        const reviewed = isFileReviewed(file.id);
        const requestState = getRequestState(file.id, state.currentScope);
        const loading = requestState.requestId != null && requestState.contents == null;
        const errored = requestState.error != null;
        const status = getActiveStatus(file);
        const button = document.createElement("button");
        button.type = "button";
        button.className = [
          "group flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left",
          file.id === state.activeFileId ? "bg-[#373e47] text-white" : "text-[#c9d1d9] hover:bg-[#21262d]"
        ].join(" ");
        button.innerHTML = `
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="shrink-0 text-[10px] ${reviewed ? "text-[#3fb950]" : errored ? "text-red-400" : loading ? "text-[#58a6ff]" : "text-transparent"}">${reviewed ? "●" : errored ? "!" : loading ? "…" : "●"}</span>
            <span class="truncate text-[13px] ${file.id === state.activeFileId ? "font-medium" : ""}>${escapeHtml(baseName)}</span>
          </span>
          <span class="mt-0.5 block truncate pl-[14px] text-[11px] ${file.id === state.activeFileId ? "text-[#c9d1d9]" : "text-review-muted"}">${escapeHtml(parentPath || path)}</span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          ${count > 0 ? `<span class="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#1f2937] px-1 text-[10px] font-medium text-[#c9d1d9]">${count}</span>` : ""}
          ${status ? `<span class="font-medium ${statusBadgeClass2(status)}">${statusLabel2(status).charAt(0)}</span>` : ""}
        </span>
      `;
        button.addEventListener("click", () => openFile(file.id));
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
      submitButton.disabled = false;
    }
    function renderTree() {
      ensureActiveFileForScope();
      fileTreeEl.innerHTML = "";
      const scopedFiles = getScopedFiles();
      const visibleFiles = getFilteredFiles();
      if (visibleFiles.length === 0) {
        const message = state.fileFilter.trim() ? `No files match <span class="text-review-text">${escapeHtml(state.fileFilter.trim())}</span>.` : `No files in <span class="text-review-text">${escapeHtml(scopeLabel2(state.currentScope).toLowerCase())}</span>.`;
        fileTreeEl.innerHTML = `
        <div class="px-3 py-4 text-sm text-review-muted">
          ${message}
        </div>
      `;
      } else if (state.fileFilter.trim()) {
        renderSearchResults(visibleFiles);
      } else {
        renderTreeNode(buildTree(visibleFiles), 0);
      }
      sidebarTitleEl.textContent = scopeLabel2(state.currentScope);
      const comments = getSubmittedCommentCount();
      const filteredSuffix = state.fileFilter.trim() ? ` • ${visibleFiles.length} shown` : "";
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
      fileContents: {},
      fileErrors: {},
      pendingRequestIds: {}
    };
  }

  // src/web/app/dom.ts
  function getReviewDomElements() {
    return {
      sidebarEl: document.getElementById("sidebar"),
      sidebarTitleEl: document.getElementById("sidebar-title"),
      sidebarSearchInputEl: document.getElementById("sidebar-search-input"),
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

  // src/web/features/comments/modals.ts
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
  function renderCommentDOM(comment, scopeLabel2, options) {
    const container = document.createElement("div");
    container.className = "view-zone-container";
    const title = comment.side === "file" ? `File comment • ${scopeLabel2(comment.scope)}` : `${comment.side === "original" ? "Original" : "Modified"} line ${comment.startLine} • ${scopeLabel2(comment.scope)}`;
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
      const textarea = container.querySelector("textarea");
      const cancelButton = container.querySelector("[data-action='cancel']");
      const submitButton = container.querySelector("[data-action='submit']");
      if (!textarea) {
        return container;
      }
      textarea.value = comment.body || "";
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
    container.innerHTML = `
    <div class="rounded-md border border-review-border bg-review-panel">
      <div class="flex items-center gap-2 px-3 py-2">
        <button data-action="toggle" aria-label="${escapeHtml(toggleLabel)}" class="flex min-w-0 flex-1 items-center gap-2 text-left">
          <svg class="h-3.5 w-3.5 shrink-0 text-review-muted transition-transform ${comment.collapsed ? "-rotate-90" : ""}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M12.78 6.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 7.28a.749.749 0 0 1 1.06-1.06L8 9.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"></path>
          </svg>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-semibold text-review-text">${escapeHtml(title)}</span>
            ${comment.collapsed ? `<span class="mt-0.5 block truncate text-xs text-review-muted">${escapeHtml(preview)}</span>` : ""}
          </span>
        </button>
        ${comment.collapsed ? "" : `<button data-action="delete" class="cursor-pointer rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-review-muted hover:bg-red-500/10 hover:text-red-400">Delete</button>`}
      </div>
      ${comment.collapsed ? "" : `<div class="border-t border-review-border px-3 py-3 whitespace-pre-wrap break-words text-sm text-review-text">${escapeHtml(comment.body)}</div>`}
    </div>
  `;
    const toggleButton = container.querySelector("[data-action='toggle']");
    const deleteButton = container.querySelector("[data-action='delete']");
    toggleButton?.addEventListener("click", () => {
      comment.collapsed = !comment.collapsed;
      options.onUpdate();
    });
    deleteButton?.addEventListener("click", options.onDelete);
    return container;
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

  // src/web/features/symbols/symbol-context.ts
  function getReviewSymbolContext(content, lineNumber, languageId) {
    const lines = content.split(/\r?\n/);
    const maxIndex = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
    for (let index = maxIndex;index >= 0; index -= 1) {
      const line = lines[index] || "";
      const title = matchSymbolLine(line, languageId);
      if (title) {
        return { title, lineNumber: index + 1 };
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
  function matchSymbolLine(line, languageId) {
    const trimmed = line.trim();
    if (!trimmed)
      return null;
    switch (languageId) {
      case "typescript":
      case "javascript":
        return capture(trimmed, /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/) || capture(trimmed, /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/) || capture(trimmed, /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/) || capture(trimmed, /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/) || capture(trimmed, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/) || capture(trimmed, /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/) || capture(trimmed, /^([A-Za-z_$][\w$]*)\s*\(/);
      case "go":
        return capture(trimmed, /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/) || capture(trimmed, /^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/) || capture(trimmed, /^var\s+([A-Za-z_][\w]*)/) || capture(trimmed, /^const\s+([A-Za-z_][\w]*)/);
      case "rust":
        return capture(trimmed, /^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/) || capture(trimmed, /^impl\s+([A-Za-z_][\w]*)/) || capture(trimmed, /^(?:pub\s+)?(?:struct|enum|trait|mod)\s+([A-Za-z_][\w]*)/);
      case "c":
      case "cpp":
        return capture(trimmed, /^(?:class|struct|enum)\s+([A-Za-z_][\w]*)/) || capture(trimmed, /^(?:static\s+)?(?:inline\s+)?[A-Za-z_][\w:\s*&<>]*\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:\{|$)/);
      default:
        return null;
    }
  }
  function capture(value, pattern) {
    const match = value.match(pattern);
    return match?.[1] || null;
  }

  // src/web/features/editor/review-editor.ts
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
    function emitEditorContextChange() {
      const navigationRequest = getCurrentNavigationRequest();
      const navigationTarget = navigationRequest != null ? resolveNavigationTarget(navigationRequest) : null;
      const symbolContext = navigationRequest != null ? getReviewSymbolContext(navigationRequest.content, navigationRequest.lineNumber, navigationRequest.languageId) : { title: null, lineNumber: null };
      onEditorContextChange({
        navigationRequest,
        navigationTarget,
        symbolTitle: symbolContext.title,
        symbolLine: symbolContext.lineNumber
      });
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
    function registerNavigationSupport() {
      const languages = ["typescript", "javascript", "go", "rust", "c", "cpp"];
      for (const languageId of languages) {
        const buildRequest = (model, position) => {
          const context = navigationResolver.parseModelUri(model?.uri);
          if (!context)
            return null;
          return {
            fileId: context.fileId,
            scope: context.scope,
            side: context.side,
            sourcePath: context.sourcePath,
            languageId,
            content: model.getValue(),
            lineNumber: position.lineNumber,
            column: position.column
          };
        };
        monacoApi.languages.registerDefinitionProvider(languageId, {
          provideDefinition(model, position) {
            const request = buildRequest(model, position);
            if (!request)
              return null;
            const target = resolveNavigationTarget(request);
            if (!target)
              return null;
            return {
              uri: navigationResolver.buildTargetUri(monacoApi, target),
              range: new monacoApi.Range(target.line, target.column, target.line, target.column)
            };
          }
        });
        monacoApi.languages.registerHoverProvider(languageId, {
          provideHover(model, position) {
            const request = buildRequest(model, position);
            if (!request)
              return null;
            const target = resolveNavigationTarget(request);
            if (!target)
              return null;
            return {
              range: new monacoApi.Range(position.lineNumber, position.column, position.lineNumber, position.column),
              contents: [
                {
                  value: `**Review navigation**

Target: \`${describeNavigationTarget(target)}\`

- Cmd/Ctrl-click: open definition
- References button: show related imports/usages
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
            revealNavigationTarget(target);
            openNavigationTarget(target);
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
      getCurrentNavigationRequest
    };
  }

  // src/web/features/navigation/resolver.ts
  var REVIEW_MODEL_SCHEME = "review-model";
  var REVIEW_TARGET_SCHEME = "review-target";
  var TS_LIKE_EXTENSIONS = [
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
    function buildTargetUri(monacoApi, target) {
      return monacoApi.Uri.from({
        scheme: REVIEW_TARGET_SCHEME,
        path: `/${encodeURIComponent(target.fileId)}/${target.side}`,
        query: new URLSearchParams({
          scope: target.scope,
          line: String(target.line),
          column: String(target.column)
        }).toString()
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
      parseTargetUri
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

  // src/web/app/runtime.ts
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
        sidebarSearchInputEl
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
        onSidebarSearchClear
      },
      messages: { onFileData, onFileError }
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
  var navigationBackStack = [];
  var navigationForwardStack = [];
  var isHistoryNavigation = false;
  var currentNavigationRequestAvailable = false;
  function isFileReviewed(fileId) {
    return state.reviewedFiles[fileId] === true;
  }
  function getScopedFiles() {
    switch (state.currentScope) {
      case "git-diff":
        return reviewData.files.filter((file) => file.inGitDiff);
      case "last-commit":
        return reviewData.files.filter((file) => file.inLastCommit);
      default:
        return reviewData.files.filter((file) => file.hasWorkingTreeFile);
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
    return reviewData.files.find((file) => file.id === state.activeFileId) ?? null;
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
    const scopedFiles = getScopedFiles();
    const query = state.fileFilter.trim();
    if (!query)
      return [...scopedFiles];
    return scopedFiles.map((file) => ({ file, score: getFileSearchScore(query, file) })).filter((entry) => entry.score >= 0).sort((a, b) => {
      if (b.score !== a.score)
        return b.score - a.score;
      return getFileSearchPath(a.file).localeCompare(getFileSearchPath(b.file));
    }).map((entry) => entry.file);
  }
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
  function rejectPendingFileWaiters(fileId, scope, reason) {
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
  function getCurrentNavigationTarget() {
    return editorController?.getCurrentNavigationTarget() ?? null;
  }
  function sameNavigationTarget(left, right) {
    if (!left || !right)
      return false;
    return left.fileId === right.fileId && left.scope === right.scope && left.side === right.side && left.line === right.line && left.column === right.column;
  }
  function updateNavigationButtons() {
    navigateBackButton.disabled = navigationBackStack.length === 0;
    navigateForwardButton.disabled = navigationForwardStack.length === 0;
    showReferencesButton.disabled = !currentNavigationRequestAvailable;
    peekDefinitionButton.disabled = !currentNavigationRequestAvailable;
  }
  function updateEditorContextUI(context) {
    currentNavigationRequestAvailable = context.navigationTarget != null;
    currentSymbolLabelEl.textContent = context.symbolTitle ? `Symbol: ${context.symbolTitle}${context.symbolLine ? ` · line ${context.symbolLine}` : ""}` : "";
    updateNavigationButtons();
  }
  function recordNavigationCheckpoint() {
    if (isHistoryNavigation)
      return;
    const current = getCurrentNavigationTarget();
    if (!current)
      return;
    const previous = navigationBackStack[navigationBackStack.length - 1] ?? null;
    if (!sameNavigationTarget(previous, current)) {
      navigationBackStack.push(current);
    }
    navigationForwardStack = [];
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
        description: "Select a repo-local import or module path first.",
        items: [],
        emptyLabel: "No active navigation target is available at the current cursor."
      });
      return;
    }
    const target = navigationResolver.resolveTarget(request);
    if (!target) {
      showReferenceModal({
        title: "References",
        description: "This selection does not resolve to a repo-local review target.",
        items: [],
        emptyLabel: "No repo-local references available for the current selection."
      });
      return;
    }
    showReferencesButton.disabled = true;
    const previousLabel = showReferencesButton.textContent || "References";
    showReferencesButton.textContent = "Searching…";
    try {
      const searchableFiles = reviewData.files.filter((file) => file.hasWorkingTreeFile);
      const loadedFiles = await Promise.all(searchableFiles.map(async (file) => ({
        file,
        contents: await loadFileContents(file.id, "all-files")
      })));
      const matches = navigationResolver.findReferences(request, loadedFiles.filter((item) => item.contents != null).map((item) => {
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
    const target = navigationResolver.resolveTarget(request);
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
  function openNavigationTarget(target) {
    const targetFile = reviewData.files.find((file) => file.id === target.fileId);
    if (!targetFile)
      return;
    const scopeChanged = state.currentScope !== target.scope;
    const fileChanged = state.activeFileId !== target.fileId;
    const current = getCurrentNavigationTarget();
    if (!sameNavigationTarget(current, target)) {
      recordNavigationCheckpoint();
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
  sidebarController = createSidebarController({
    reviewDataFiles: reviewData.files,
    state,
    sidebarEl,
    sidebarTitleEl,
    fileTreeEl,
    summaryEl,
    modeHintEl,
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
    getActiveStatus,
    activeFile,
    openFile,
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
    state.comments.push({
      id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
      fileId,
      scope: state.currentScope,
      side,
      startLine: line,
      endLine: line,
      body: "",
      status: "draft",
      collapsed: false
    });
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
        state.comments.push({
          id: `${Date.now()}:${Math.random().toString(16).slice(2)}`,
          fileId: file.id,
          scope: state.currentScope,
          side: "file",
          startLine: null,
          endLine: null,
          body: value,
          status: "submitted",
          collapsed: false
        });
        submitButton.disabled = false;
        updateCommentsUI();
      }
    });
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
  }
  function applyEditorOptions() {
    editorController?.applyOptions();
  }
  function renderAll(options = {}) {
    sidebarController?.renderTree();
    submitButton.disabled = false;
    updateNavigationButtons();
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
    const file = activeFile();
    if (file)
      ensureFileLoaded(file.id, state.currentScope);
    updateNavigationButtons();
  }
  function handleSubmitReview() {
    commentManager?.syncCommentBodiesFromDOM();
    const payload = {
      type: "submit",
      overallComment: state.overallComment.trim(),
      comments: state.comments.map((comment) => ({ ...comment, body: comment.body.trim() })).filter((comment) => comment.status === "submitted" && comment.body.length > 0)
    };
    window.glimpse.send(payload);
    window.glimpse.close();
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
    rejectPendingFileWaiters(message.fileId, message.scope, state.fileErrors[key]);
    sidebarController?.renderTree();
    if (state.activeFileId === message.fileId && state.currentScope === message.scope) {
      mountFile({ preserveScroll: false });
    }
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
      sidebarSearchInputEl
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
        sidebarController?.renderTree();
      },
      onSidebarSearchClear: () => {
        state.fileFilter = "";
        sidebarController?.renderTree();
      }
    },
    messages: {
      onFileData: handleHostFileData,
      onFileError: handleHostFileError
    }
  });
  runtimeController.bind();
  updateNavigationButtons();
  ensureActiveFileForScope();
  sidebarController?.renderTree();
  commentManager?.renderFileComments();
  sidebarController?.updateSidebarLayout();
  setupMonaco();
})();
