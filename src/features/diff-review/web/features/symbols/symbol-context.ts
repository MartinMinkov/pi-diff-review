export interface ReviewSymbolContext {
  title: string | null;
  lineNumber: number | null;
}

export interface ReviewSymbolItem {
  title: string;
  lineNumber: number;
  kind: "function" | "type" | "module" | "member" | "value";
}

export interface ReviewSymbolRangeItem extends ReviewSymbolItem {
  endLineNumber: number;
}

export function getReviewSymbolContext(
  content: string,
  lineNumber: number,
  languageId: string,
): ReviewSymbolContext {
  const lines = content.split(/\r?\n/);
  const maxIndex = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);

  for (let index = maxIndex; index >= 0; index -= 1) {
    const line = lines[index] || "";
    const symbol = matchSymbolLine(line, languageId);
    if (symbol) {
      return { title: symbol.title, lineNumber: index + 1 };
    }
  }

  return { title: null, lineNumber: null };
}

export function buildPreviewSnippet(
  content: string,
  lineNumber: number,
  contextRadius = 3,
): string {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return "";

  const targetIndex = Math.min(Math.max(lineNumber - 1, 0), lines.length - 1);
  const start = Math.max(0, targetIndex - contextRadius);
  const end = Math.min(lines.length - 1, targetIndex + contextRadius);

  return lines
    .slice(start, end + 1)
    .map((line, offset) => {
      const currentLine = start + offset + 1;
      const prefix = currentLine === targetIndex + 1 ? ">" : " ";
      return `${prefix} ${String(currentLine).padStart(4, " ")} ${line}`;
    })
    .join("\n");
}

export function extractReviewSymbols(
  content: string,
  languageId: string,
): ReviewSymbolItem[] {
  const items: ReviewSymbolItem[] = [];
  const seen = new Set<string>();

  content.split(/\r?\n/).forEach((line, index) => {
    const symbol = matchSymbolLine(line, languageId);
    if (!symbol) return;
    const key = `${symbol.kind}:${symbol.title}:${index + 1}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      title: symbol.title,
      lineNumber: index + 1,
      kind: symbol.kind,
    });
  });

  return items;
}

export function extractReviewSymbolRanges(
  content: string,
  languageId: string,
): ReviewSymbolRangeItem[] {
  const items = extractReviewSymbols(content, languageId);
  const totalLines = content.length === 0 ? 0 : content.split(/\r?\n/).length;

  return items.map((item, index) => ({
    ...item,
    endLineNumber:
      index < items.length - 1
        ? Math.max(item.lineNumber, (items[index + 1]?.lineNumber ?? item.lineNumber) - 1)
        : Math.max(item.lineNumber, totalLines),
  }));
}

export function extractChangedReviewSymbols(options: {
  originalContent: string;
  modifiedContent: string;
  languageId: string;
  preferModified: boolean;
}): ReviewSymbolRangeItem[] {
  const originalSymbols = extractReviewSymbolRanges(
    options.originalContent,
    options.languageId,
  );
  const modifiedSymbols = extractReviewSymbolRanges(
    options.modifiedContent,
    options.languageId,
  );

  const primarySymbols = options.preferModified ? modifiedSymbols : originalSymbols;
  const comparisonSymbols = options.preferModified ? originalSymbols : modifiedSymbols;
  const primaryContent = options.preferModified
    ? options.modifiedContent
    : options.originalContent;
  const comparisonContent = options.preferModified
    ? options.originalContent
    : options.modifiedContent;

  if (primarySymbols.length === 0) {
    return [];
  }

  const comparisonBySignature = new Map<string, ReviewSymbolRangeItem[]>();
  for (const symbol of comparisonSymbols) {
    const key = getSymbolSignature(symbol);
    const bucket = comparisonBySignature.get(key);
    if (bucket) {
      bucket.push(symbol);
    } else {
      comparisonBySignature.set(key, [symbol]);
    }
  }

  const seenBySignature = new Map<string, number>();

  return primarySymbols.filter((symbol) => {
    const signature = getSymbolSignature(symbol);
    const occurrenceIndex = seenBySignature.get(signature) ?? 0;
    seenBySignature.set(signature, occurrenceIndex + 1);

    const match = comparisonBySignature.get(signature)?.[occurrenceIndex] ?? null;
    if (!match) {
      return true;
    }

    return (
      getSymbolRangeContent(primaryContent, symbol) !==
      getSymbolRangeContent(comparisonContent, match)
    );
  });
}

function matchSymbolLine(
  line: string,
  languageId: string,
): ReviewSymbolItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  switch (languageId) {
    case "typescript":
    case "javascript":
      return (
        captureSymbol(
          trimmed,
          /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
          "function",
        ) ||
        captureSymbol(
          trimmed,
          /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/,
          "type",
        ) ||
        captureSymbol(
          trimmed,
          /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/,
          "type",
        ) ||
        captureSymbol(
          trimmed,
          /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/,
          "type",
        ) ||
        captureSymbol(
          trimmed,
          /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
          "function",
        ) ||
        captureSymbol(
          trimmed,
          /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/,
          "function",
        ) ||
        captureSymbol(trimmed, /^([A-Za-z_$][\w$]*)\s*\(/, "member")
      );
    case "go":
      return (
        captureSymbol(
          trimmed,
          /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/,
          "function",
        ) ||
        captureSymbol(
          trimmed,
          /^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/,
          "type",
        ) ||
        captureSymbol(trimmed, /^var\s+([A-Za-z_][\w]*)/, "value") ||
        captureSymbol(trimmed, /^const\s+([A-Za-z_][\w]*)/, "value")
      );
    case "rust":
      return (
        captureSymbol(trimmed, /^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/, "function") ||
        captureSymbol(trimmed, /^impl\s+([A-Za-z_][\w]*)/, "type") ||
        captureSymbol(
          trimmed,
          /^(?:pub\s+)?(?:struct|enum|trait|mod)\s+([A-Za-z_][\w]*)/,
          trimmed.includes("mod ") ? "module" : "type",
        )
      );
    case "c":
    case "cpp":
      return (
        captureSymbol(trimmed, /^(?:class|struct|enum)\s+([A-Za-z_][\w]*)/, "type") ||
        captureSymbol(
          trimmed,
          /^(?:static\s+)?(?:inline\s+)?[A-Za-z_][\w:\s*&<>]*\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:\{|$)/,
          "function",
        )
      );
    default:
      return null;
  }
}

function captureSymbol(
  value: string,
  pattern: RegExp,
  kind: ReviewSymbolItem["kind"],
): ReviewSymbolItem | null {
  const match = value.match(pattern);
  return match?.[1]
    ? {
        title: match[1],
        lineNumber: 0,
        kind,
      }
    : null;
}

function getSymbolSignature(symbol: ReviewSymbolItem): string {
  return `${symbol.kind}:${symbol.title}`;
}

function getSymbolRangeContent(
  content: string,
  symbol: ReviewSymbolRangeItem,
): string {
  return content
    .split(/\r?\n/)
    .slice(Math.max(0, symbol.lineNumber - 1), Math.max(symbol.lineNumber, symbol.endLineNumber))
    .join("\n")
    .trim();
}
