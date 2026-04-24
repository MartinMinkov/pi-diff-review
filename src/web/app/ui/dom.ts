export interface ReviewDomElements {
  sidebarEl: HTMLDivElement;
  sidebarTitleEl: HTMLDivElement;
  sidebarSearchInputEl: HTMLInputElement;
  sidebarStatusFilterEl: HTMLSelectElement;
  hideReviewedCheckboxEl: HTMLInputElement;
  commentedOnlyCheckboxEl: HTMLInputElement;
  changedOnlyCheckboxEl: HTMLInputElement;
  toggleSidebarButton: HTMLButtonElement;
  scopeDiffButton: HTMLButtonElement;
  scopeLastCommitButton: HTMLButtonElement;
  scopeAllButton: HTMLButtonElement;
  windowTitleEl: HTMLDivElement;
  repoRootEl: HTMLSpanElement;
  fileTreeEl: HTMLDivElement;
  summaryEl: HTMLSpanElement;
  currentFileLabelEl: HTMLDivElement;
  currentSymbolLabelEl: HTMLDivElement;
  modeHintEl: HTMLDivElement;
  fileCommentsContainer: HTMLDivElement;
  editorContainerEl: HTMLDivElement;
  inspectorEl: HTMLDivElement;
  changedSymbolsContainerEl: HTMLDivElement;
  reviewQueueContainerEl: HTMLDivElement;
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
}

export function getReviewDomElements(): ReviewDomElements {
  return {
    sidebarEl: document.getElementById("sidebar") as HTMLDivElement,
    sidebarTitleEl: document.getElementById("sidebar-title") as HTMLDivElement,
    sidebarSearchInputEl: document.getElementById(
      "sidebar-search-input",
    ) as HTMLInputElement,
    sidebarStatusFilterEl: document.getElementById(
      "sidebar-status-filter",
    ) as HTMLSelectElement,
    hideReviewedCheckboxEl: document.getElementById(
      "hide-reviewed-checkbox",
    ) as HTMLInputElement,
    commentedOnlyCheckboxEl: document.getElementById(
      "commented-only-checkbox",
    ) as HTMLInputElement,
    changedOnlyCheckboxEl: document.getElementById(
      "changed-only-checkbox",
    ) as HTMLInputElement,
    toggleSidebarButton: document.getElementById(
      "toggle-sidebar-button",
    ) as HTMLButtonElement,
    scopeDiffButton: document.getElementById(
      "scope-diff-button",
    ) as HTMLButtonElement,
    scopeLastCommitButton: document.getElementById(
      "scope-last-commit-button",
    ) as HTMLButtonElement,
    scopeAllButton: document.getElementById(
      "scope-all-button",
    ) as HTMLButtonElement,
    windowTitleEl: document.getElementById("window-title") as HTMLDivElement,
    repoRootEl: document.getElementById("repo-root") as HTMLSpanElement,
    fileTreeEl: document.getElementById("file-tree") as HTMLDivElement,
    summaryEl: document.getElementById("summary") as HTMLSpanElement,
    currentFileLabelEl: document.getElementById(
      "current-file-label",
    ) as HTMLDivElement,
    currentSymbolLabelEl: document.getElementById(
      "current-symbol-label",
    ) as HTMLDivElement,
    modeHintEl: document.getElementById("mode-hint") as HTMLDivElement,
    fileCommentsContainer: document.getElementById(
      "file-comments-container",
    ) as HTMLDivElement,
    editorContainerEl: document.getElementById(
      "editor-container",
    ) as HTMLDivElement,
    inspectorEl: document.getElementById("inspector") as HTMLDivElement,
    changedSymbolsContainerEl: document.getElementById(
      "changed-symbols-container",
    ) as HTMLDivElement,
    reviewQueueContainerEl: document.getElementById(
      "review-queue-container",
    ) as HTMLDivElement,
    submitButton: document.getElementById("submit-button") as HTMLButtonElement,
    cancelButton: document.getElementById("cancel-button") as HTMLButtonElement,
    overallCommentButton: document.getElementById(
      "overall-comment-button",
    ) as HTMLButtonElement,
    fileCommentButton: document.getElementById(
      "file-comment-button",
    ) as HTMLButtonElement,
    navigateBackButton: document.getElementById(
      "navigate-back-button",
    ) as HTMLButtonElement,
    navigateForwardButton: document.getElementById(
      "navigate-forward-button",
    ) as HTMLButtonElement,
    showReferencesButton: document.getElementById(
      "show-references-button",
    ) as HTMLButtonElement,
    peekDefinitionButton: document.getElementById(
      "peek-definition-button",
    ) as HTMLButtonElement,
    toggleReviewedButton: document.getElementById(
      "toggle-reviewed-button",
    ) as HTMLButtonElement,
    toggleUnchangedButton: document.getElementById(
      "toggle-unchanged-button",
    ) as HTMLButtonElement,
    toggleWrapButton: document.getElementById(
      "toggle-wrap-button",
    ) as HTMLButtonElement,
  };
}
