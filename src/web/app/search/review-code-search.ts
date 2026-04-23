import type {
  ReviewFile,
  ReviewFileContents,
  ReviewNavigationSide,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";

export interface ReviewCodeSearchMatch {
  target: ReviewNavigationTarget;
  path: string;
  lineNumber: number;
  lineText: string;
  matchStartColumn: number;
  matchEndColumn: number;
}

export interface ReviewCodeSearchState {
  query: string;
  searching: boolean;
  results: ReviewCodeSearchMatch[];
}

interface ReviewCodeSearchControllerOptions {
  scope: () => ReviewScope;
  getScopedFiles: () => ReviewFile[];
  getScopeComparison: (
    file: ReviewFile | null,
    scope?: ReviewScope,
  ) => ReviewFile["gitDiff"];
  getScopeSidePath: (
    file: ReviewFile | null,
    scope: ReviewScope,
    side: ReviewNavigationSide,
  ) => string;
  loadFileContents: (
    fileId: string,
    scope: ReviewScope,
  ) => Promise<ReviewFileContents | null>;
  onStateChange: () => void;
}

export interface ReviewCodeSearchController {
  getState: () => ReviewCodeSearchState;
  clear: () => void;
  schedule: (query: string) => void;
  refresh: (query: string) => void;
}

export function createReviewCodeSearchController(
  options: ReviewCodeSearchControllerOptions,
): ReviewCodeSearchController {
  const {
    scope,
    getScopedFiles,
    getScopeComparison,
    getScopeSidePath,
    loadFileContents,
    onStateChange,
  } = options;

  const state: ReviewCodeSearchState = {
    query: "",
    searching: false,
    results: [],
  };

  let debounceTimeout: number | null = null;
  let sequence = 0;
  const lineCache = new Map<
    string,
    { content: string; lines: string[]; loweredLines: string[] }
  >();

  function getState(): ReviewCodeSearchState {
    return state;
  }

  function clear(): void {
    sequence += 1;
    state.query = "";
    state.searching = false;
    state.results = [];
  }

  function collectMatches(
    file: ReviewFile,
    contents: ReviewFileContents | null,
    query: string,
  ): ReviewCodeSearchMatch[] {
    if (!contents) return [];

    const currentScope = scope();
    const loweredQuery = query.toLowerCase();
    const matches: ReviewCodeSearchMatch[] = [];
    const comparison = getScopeComparison(file, currentScope);
    const candidates: Array<{
      side: ReviewNavigationSide;
      path: string;
      content: string;
    }> = [];

    if (currentScope === "all-files") {
      candidates.push({
        side: "modified",
        path: file.path,
        content: contents.modifiedContent,
      });
    } else {
      if (comparison?.hasOriginal) {
        candidates.push({
          side: "original",
          path: getScopeSidePath(file, currentScope, "original"),
          content: contents.originalContent,
        });
      }
      if (comparison?.hasModified) {
        candidates.push({
          side: "modified",
          path: getScopeSidePath(file, currentScope, "modified"),
          content: contents.modifiedContent,
        });
      }
    }

    for (const candidate of candidates) {
      const lines = candidate.content.split(/\r?\n/);
      const cacheKey = `${currentScope}:${file.id}:${candidate.side}`;
      const cached = lineCache.get(cacheKey);
      const indexed =
        cached && cached.content === candidate.content
          ? cached
          : {
              content: candidate.content,
              lines,
              loweredLines: lines.map((line) => line.toLowerCase()),
            };
      if (indexed !== cached) {
        lineCache.set(cacheKey, indexed);
      }

      for (let index = 0; index < indexed.lines.length; index += 1) {
        const lineText = indexed.lines[index] ?? "";
        const loweredLine = indexed.loweredLines[index] ?? "";
        const matchIndex = loweredLine.indexOf(loweredQuery);
        if (matchIndex === -1) continue;
        matches.push({
          target: {
            fileId: file.id,
            scope: currentScope,
            side: candidate.side,
            line: index + 1,
            column: matchIndex + 1,
          },
          path: candidate.path,
          lineNumber: index + 1,
          lineText,
          matchStartColumn: matchIndex + 1,
          matchEndColumn: matchIndex + trimmedQueryLength(query),
        });
        if (matches.length >= 5) {
          return matches;
        }
      }
    }

    return matches;
  }

  function trimmedQueryLength(query: string): number {
    return Math.max(1, query.trim().length);
  }

  async function run(query: string): Promise<void> {
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

    const loadedFiles = await Promise.all(
      getScopedFiles().map(async (file) => ({
        file,
        contents: await loadFileContents(file.id, currentScope),
      })),
    );

    if (runSequence !== sequence) {
      return;
    }

    state.query = trimmedQuery;
    state.searching = false;
    state.results = loadedFiles
      .flatMap(({ file, contents }) =>
        collectMatches(file, contents, trimmedQuery),
      )
      .sort((left, right) => {
        if (left.path !== right.path) return left.path.localeCompare(right.path);
        if (left.lineNumber !== right.lineNumber) {
          return left.lineNumber - right.lineNumber;
        }
        return left.target.side.localeCompare(right.target.side);
      })
      .slice(0, 60);

    onStateChange();
  }

  function schedule(query: string): void {
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
      void run(query);
    }, 160);
  }

  function refresh(query: string): void {
    void run(query);
  }

  return {
    getState,
    clear,
    schedule,
    refresh,
  };
}
