export interface ReviewSymbolContext {
  title: string | null;
  lineNumber: number | null;
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
    const title = matchSymbolLine(line, languageId);
    if (title) {
      return { title, lineNumber: index + 1 };
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

function matchSymbolLine(line: string, languageId: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  switch (languageId) {
    case "typescript":
    case "javascript":
      return (
        capture(
          trimmed,
          /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
        ) ||
        capture(trimmed, /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/) ||
        capture(trimmed, /^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/) ||
        capture(trimmed, /^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/) ||
        capture(
          trimmed,
          /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/,
        ) ||
        capture(
          trimmed,
          /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/,
        ) ||
        capture(trimmed, /^([A-Za-z_$][\w$]*)\s*\(/)
      );
    case "go":
      return (
        capture(trimmed, /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/) ||
        capture(trimmed, /^type\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/) ||
        capture(trimmed, /^var\s+([A-Za-z_][\w]*)/) ||
        capture(trimmed, /^const\s+([A-Za-z_][\w]*)/)
      );
    case "rust":
      return (
        capture(trimmed, /^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/) ||
        capture(trimmed, /^impl\s+([A-Za-z_][\w]*)/) ||
        capture(
          trimmed,
          /^(?:pub\s+)?(?:struct|enum|trait|mod)\s+([A-Za-z_][\w]*)/,
        )
      );
    case "c":
    case "cpp":
      return (
        capture(trimmed, /^(?:class|struct|enum)\s+([A-Za-z_][\w]*)/) ||
        capture(
          trimmed,
          /^(?:static\s+)?(?:inline\s+)?[A-Za-z_][\w:\s*&<>]*\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:\{|$)/,
        )
      );
    default:
      return null;
  }
}

function capture(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);
  return match?.[1] || null;
}
