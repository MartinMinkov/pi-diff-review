import {
  showCommandPaletteModal,
} from "../../features/comments/modals.js";
import type { ReviewEditorSelectionContext } from "../../features/editor/review-editor.js";
import type {
  ChangeStatus,
  ReviewFile,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";

interface ReviewCommandPaletteOptions {
  state: {
    currentScope: ReviewScope;
  };
  currentSymbolLabelEl: HTMLDivElement;
  sidebarSearchInputEl: HTMLInputElement;
  getScopedFiles: () => ReviewFile[];
  activeFile: () => ReviewFile | null;
  getScopeDisplayPath: (file: ReviewFile | null, scope?: ReviewScope) => string;
  getActiveStatus: (file: ReviewFile | null) => ChangeStatus | null;
  statusLabel: (status: string | null | undefined) => string;
  scopeLabel: (scope: ReviewScope) => string;
  getCurrentSelectionContext: () => ReviewEditorSelectionContext | null;
  getCurrentNavigationTarget: () => ReviewNavigationTarget | null;
  getActiveLocationLabel: () => string | null;
  getSelectionReference: () => string | null;
  loadFileContents: (
    fileId: string,
    scope: ReviewScope,
  ) => Promise<{ originalContent: string; modifiedContent: string } | null>;
  describeNavigationTarget: (target: ReviewNavigationTarget) => string;
  writeToClipboard: (value: string) => Promise<boolean>;
  flashSummary: (message: string) => void;
  openFile: (fileId: string) => void;
  handleShowChangedSymbols: () => Promise<void>;
  handleAgentAction: () => void;
  navigateSubmittedComment: (direction: "next" | "previous") => void;
}

export interface ReviewCommandPaletteController {
  openQuickOpenFiles: () => void;
  openCommandPalette: () => void;
}

export function createReviewCommandPaletteController(
  options: ReviewCommandPaletteOptions,
): ReviewCommandPaletteController {
  const {
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
    navigateSubmittedComment,
  } = options;

  function openQuickOpenFiles(): void {
    const scopedFiles = getScopedFiles()
      .slice()
      .sort((left, right) =>
        getScopeDisplayPath(left, state.currentScope).localeCompare(
          getScopeDisplayPath(right, state.currentScope),
        ),
      );

    showCommandPaletteModal({
      title: "Go to File",
      description: "Jump to a file in the current review scope.",
      items: scopedFiles.map((file) => ({
        label: getScopeDisplayPath(file, state.currentScope),
        detail:
          file.path !== getScopeDisplayPath(file, state.currentScope)
            ? file.path
            : scopeLabel(state.currentScope),
        hint:
          getActiveStatus(file) != null
            ? statusLabel(getActiveStatus(file))
            : undefined,
        onSelect: () => {
          openFile(file.id);
        },
      })),
    });
  }

  function openCommandPalette(): void {
    const file = activeFile();
    const selection = getCurrentSelectionContext();
    const selectionText = selection?.selectedText.trim() || "";
    const activeLocation = getActiveLocationLabel();
    const selectionReference = getSelectionReference();

    showCommandPaletteModal({
      title: "Command Palette",
      description:
        "Fast review commands for copying context and moving around the diff.",
      items: [
        {
          label: "File: Copy Path of Active File",
          detail: file?.path || "No active file",
          hint: "path",
          onSelect: () => {
            void (async () => {
              if (!file) return;
              const success = await writeToClipboard(file.path);
              flashSummary(
                success ? "Copied active file path" : "Unable to copy",
              );
            })();
          },
        },
        {
          label: "File: Copy Location of Active Cursor",
          detail: activeLocation || "No active cursor location",
          hint: "path:line",
          onSelect: () => {
            void (async () => {
              if (!activeLocation) return;
              const success = await writeToClipboard(activeLocation);
              flashSummary(success ? "Copied active location" : "Unable to copy");
            })();
          },
        },
        {
          label: "File: Copy Selection Location",
          detail: selectionReference || "No current selection",
          hint: "range",
          onSelect: () => {
            void (async () => {
              if (!selectionReference) return;
              const success = await writeToClipboard(selectionReference);
              flashSummary(
                success ? "Copied selection location" : "Unable to copy",
              );
            })();
          },
        },
        {
          label: "Review: Copy Selection with Context",
          detail:
            selectionReference && selectionText
              ? `${selectionReference} plus selected code`
              : "Select some code first",
          hint: "snippet",
          onSelect: () => {
            void (async () => {
              if (!selectionReference || !selectionText) return;
              const payload = `${selectionReference}\n\n${selectionText}`;
              const success = await writeToClipboard(payload);
              flashSummary(
                success ? "Copied selection context" : "Unable to copy",
              );
            })();
          },
        },
        {
          label: "Review: Copy Current Hunk with Context",
          detail: file
            ? `${getScopeDisplayPath(file, state.currentScope)} around the current cursor`
            : "No active file",
          hint: "hunk",
          onSelect: () => {
            void (async () => {
              const target = getCurrentNavigationTarget();
              const active = activeFile();
              if (!target || !active) return;
              const contents = await loadFileContents(target.fileId, target.scope);
              const content =
                target.side === "original"
                  ? contents?.originalContent ?? ""
                  : contents?.modifiedContent ?? "";
              const start = Math.max(1, target.line - 8);
              const end = target.line + 8;
              const snippet = content
                .split(/\r?\n/)
                .slice(start - 1, end)
                .map((line, index) => `${start + index}: ${line}`)
                .join("\n");
              const payload = `${describeNavigationTarget(target)}\n\n${snippet}`;
              const success = await writeToClipboard(payload);
              flashSummary(
                success ? "Copied current hunk with context" : "Unable to copy",
              );
            })();
          },
        },
        {
          label: "Symbol: Copy Current Symbol Name",
          detail: currentSymbolLabelEl.textContent || "No current symbol",
          hint: "symbol",
          onSelect: () => {
            void (async () => {
              const value = currentSymbolLabelEl.textContent
                ?.replace(/^Symbol:\s*/, "")
                .trim();
              if (!value) return;
              const success = await writeToClipboard(value);
              flashSummary(success ? "Copied symbol name" : "Unable to copy");
            })();
          },
        },
        {
          label: "Review: Focus Code Search",
          detail: "Jump to the sidebar code search input",
          hint: "F",
          onSelect: () => {
            sidebarSearchInputEl.focus();
            sidebarSearchInputEl.select();
          },
        },
        {
          label: "File: Go to File",
          detail: "Open quick file search for the current review scope",
          hint: "Cmd/Ctrl+P",
          onSelect: () => {
            openQuickOpenFiles();
          },
        },
        {
          label: "Review: Jump to Changed Symbols",
          detail: "Open the changed-symbol navigator",
          hint: "S",
          onSelect: () => {
            void handleShowChangedSymbols();
          },
        },
        {
          label: "Review: Next Submitted Comment",
          detail: "Jump to the next submitted comment in this scope",
          hint: "N",
          onSelect: () => {
            navigateSubmittedComment("next");
          },
        },
        {
          label: "Review: Previous Submitted Comment",
          detail: "Jump to the previous submitted comment in this scope",
          hint: "Shift+N",
          onSelect: () => {
            navigateSubmittedComment("previous");
          },
        },
        {
          label: "Agent: Ask About Selection",
          detail: selectionText
            ? "Create a focused review prompt from the current selection"
            : "Create a focused review prompt from the current file",
          hint: "E",
          onSelect: () => {
            handleAgentAction();
          },
        },
      ],
    });
  }

  return {
    openQuickOpenFiles,
    openCommandPalette,
  };
}
