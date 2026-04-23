import type {
  ReviewDefinitionDataMessage,
  ReviewDefinitionErrorMessage,
  ReviewFileDataMessage,
  ReviewFileErrorMessage,
  ReviewHostMessage,
  ReviewReferencesDataMessage,
  ReviewReferencesErrorMessage,
  ReviewSubmitAckMessage,
} from "../../shared/contracts/review.js";

interface ReviewRuntimeDOM {
  submitButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  overallCommentButton: HTMLButtonElement;
  fileCommentButton: HTMLButtonElement;
  navigateBackButton: HTMLButtonElement;
  navigateForwardButton: HTMLButtonElement;
  showReferencesButton: HTMLButtonElement;
  peekDefinitionButton: HTMLButtonElement;
  toggleReviewedButton: HTMLButtonElement;
  toggleUnchangedButton: HTMLButtonElement;
  toggleWrapButton: HTMLButtonElement;
  toggleSidebarButton: HTMLButtonElement;
  scopeDiffButton: HTMLButtonElement;
  scopeLastCommitButton: HTMLButtonElement;
  scopeAllButton: HTMLButtonElement;
  sidebarSearchInputEl: HTMLInputElement;
  sidebarStatusFilterEl: HTMLSelectElement;
  hideReviewedCheckboxEl: HTMLInputElement;
  commentedOnlyCheckboxEl: HTMLInputElement;
  changedOnlyCheckboxEl: HTMLInputElement;
  changedSymbolsButton: HTMLButtonElement;
  agentActionButton: HTMLButtonElement;
}

interface ReviewRuntimeEventHandlers {
  onSubmit: () => void;
  onCancel: () => void;
  onShowOverallComment: () => void;
  onShowFileComment: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onShowReferences: () => void;
  onPeekDefinition: () => void;
  onToggleReviewed: () => void;
  onToggleUnchanged: () => void;
  onToggleWrap: () => void;
  onToggleSidebar: () => void;
  onScopeDiff: () => void;
  onScopeLastCommit: () => void;
  onScopeAll: () => void;
  onSidebarSearchInput: (value: string) => void;
  onSidebarSearchClear: () => void;
  onStatusFilterChange: (value: string) => void;
  onHideReviewedChange: (checked: boolean) => void;
  onCommentedOnlyChange: (checked: boolean) => void;
  onChangedOnlyChange: (checked: boolean) => void;
  onShowChangedSymbols: () => void;
  onAgentAction: () => void;
}

interface ReviewRuntimeMessageHandlers {
  onFileData: (message: ReviewFileDataMessage) => void;
  onFileError: (message: ReviewFileErrorMessage) => void;
  onDefinitionData: (message: ReviewDefinitionDataMessage) => void;
  onDefinitionError: (message: ReviewDefinitionErrorMessage) => void;
  onReferencesData: (message: ReviewReferencesDataMessage) => void;
  onReferencesError: (message: ReviewReferencesErrorMessage) => void;
  onSubmitAck: (message: ReviewSubmitAckMessage) => void;
}

interface ReviewRuntimeOptions {
  dom: ReviewRuntimeDOM;
  events: ReviewRuntimeEventHandlers;
  messages: ReviewRuntimeMessageHandlers;
}

export interface ReviewRuntimeController {
  bind(): void;
  handleHostMessage: (message: ReviewHostMessage) => void;
}

declare global {
  interface Window {
    __reviewReceive: (message: ReviewHostMessage) => void;
  }
}

export function createReviewRuntimeController(
  options: ReviewRuntimeOptions,
): ReviewRuntimeController {
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
      agentActionButton,
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
      onAgentAction,
    },
    messages: {
      onFileData,
      onFileError,
      onDefinitionData,
      onDefinitionError,
      onReferencesData,
      onReferencesError,
      onSubmitAck,
    },
  } = options;

  function handleHostMessage(message: ReviewHostMessage): void {
    if (!message || typeof message !== "object") return;
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

  function bind(): void {
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
    handleHostMessage,
  };
}
