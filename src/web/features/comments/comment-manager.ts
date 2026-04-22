import type {
  DiffReviewComment,
  ReviewScope,
  ReviewFile,
} from "../../shared/contracts/review.js";
import { renderCommentDOM as renderCommentNode } from "./modals.js";
import type { ReviewState } from "../../shared/state/review-state.js";

interface ReviewCommentsOptions {
  state: ReviewState;
  activeFile: () => ReviewFile | null;
  scopeLabel: (scope: ReviewScope) => string;
  fileCommentsContainer: HTMLDivElement;
  onCommentsChange: () => void;
}

export interface ReviewCommentManager {
  renderCommentDOM: (
    comment: DiffReviewComment,
    onDelete: () => void,
  ) => HTMLElement;
  renderFileComments: () => void;
  syncCommentBodiesFromDOM: () => void;
}

export function createCommentManager(
  options: ReviewCommentsOptions,
): ReviewCommentManager {
  const { state, activeFile, scopeLabel, fileCommentsContainer } = options;

  function renderCommentDOM(
    comment: DiffReviewComment,
    onDelete: () => void,
  ): HTMLElement {
    return renderCommentNode(comment, scopeLabel, onDelete);
  }

  function syncCommentBodiesFromDOM(): void {
    const textareas = document.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-comment-id]",
    );
    textareas.forEach((textarea) => {
      const commentId = textarea.getAttribute("data-comment-id");
      const comment = state.comments.find((item) => item.id === commentId);
      if (comment) {
        comment.body = textarea.value;
      }
    });
  }

  function renderFileComments(): void {
    fileCommentsContainer.innerHTML = "";
    const file = activeFile();
    if (!file) {
      fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
      return;
    }

    const fileComments = state.comments.filter(
      (comment) =>
        comment.fileId === file.id &&
        comment.scope === state.currentScope &&
        comment.side === "file",
    );

    if (fileComments.length === 0) {
      fileCommentsContainer.className = "hidden overflow-hidden px-0 py-0";
      return;
    }

    fileCommentsContainer.className =
      "border-b border-review-border bg-[#0d1117] px-4 py-4 space-y-4";
    fileComments.forEach((comment) => {
      const dom = renderCommentDOM(comment, () => {
        state.comments = state.comments.filter(
          (item) => item.id !== comment.id,
        );
        options.onCommentsChange();
      });
      dom.className =
        "rounded-lg border border-review-border bg-review-panel p-4";
      fileCommentsContainer.appendChild(dom);
    });
  }

  return {
    renderCommentDOM,
    renderFileComments,
    syncCommentBodiesFromDOM,
  };
}
