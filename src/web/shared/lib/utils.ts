import type { ReviewScope, ReviewFile } from "../contracts/review.js";

export interface TreeNode {
  name: string;
  path: string;
  kind: "dir" | "file";
  children: Map<string, TreeNode>;
  file: ReviewFile | null;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inferLanguage(path: string): string {
  if (!path) return "plaintext";
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".sh")) return "shell";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".kt")) return "kotlin";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  return "plaintext";
}

export function scopeLabel(scope: ReviewScope): string {
  switch (scope) {
    case "git-diff":
      return "Git diff";
    case "last-commit":
      return "Last commit";
    default:
      return "All files";
  }
}

export function scopeHint(scope: ReviewScope): string {
  switch (scope) {
    case "git-diff":
      return "Working tree against HEAD. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, and Cmd/Ctrl+Shift+P for clipboard commands.";
    case "last-commit":
      return "Last commit against its parent. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, and Cmd/Ctrl+Shift+P for clipboard commands.";
    default:
      return "Current working tree snapshot. Use gutter clicks for inline comments, Cmd/Ctrl-click for navigation when supported, F to search code, Cmd/Ctrl+P to jump to files, and Cmd/Ctrl+Shift+P for clipboard commands.";
  }
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusBadgeClass(status: string): string {
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

export function normalizeQuery(query: string | null | undefined): string {
  return String(query || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function scoreSubsequence(query: string, candidate: string): number {
  if (!query) return 0;
  let queryIndex = 0;
  let score = 0;
  let firstMatchIndex = -1;
  let previousMatchIndex = -2;

  for (let i = 0; i < candidate.length && queryIndex < query.length; i += 1) {
    if (candidate[i] !== query[queryIndex]) continue;

    if (firstMatchIndex === -1) firstMatchIndex = i;
    score += 10;

    if (i === previousMatchIndex + 1) {
      score += 8;
    }

    const previousChar = i > 0 ? candidate[i - 1] : "";
    if (
      i === 0 ||
      previousChar === "/" ||
      previousChar === "_" ||
      previousChar === "-" ||
      previousChar === "."
    ) {
      score += 12;
    }

    previousMatchIndex = i;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) return -1;
  if (firstMatchIndex >= 0) score += Math.max(0, 20 - firstMatchIndex);
  return score;
}

export function getFileSearchScore(query: string, file: ReviewFile): number {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return 0;

  const path = getFileSearchPath(file).toLowerCase();
  const baseName = getBaseName(path);
  const pathScore = scoreSubsequence(normalizedQuery, path);
  const baseScore = scoreSubsequence(normalizedQuery, baseName);
  let score = Math.max(pathScore, baseScore >= 0 ? baseScore + 40 : -1);

  if (score < 0) return -1;
  if (baseName === normalizedQuery) score += 200;
  else if (baseName.startsWith(normalizedQuery)) score += 120;
  else if (path.includes(normalizedQuery)) score += 35;

  return score;
}

export function getFileSearchPath(file: ReviewFile): string {
  return file?.path || "";
}

export function getBaseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function buildTree(files: ReviewFile[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    kind: "dir",
    children: new Map(),
    file: null,
  };

  for (const file of files) {
    const path = getFileSearchPath(file);
    const parts = path.split("/");
    let node = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: currentPath,
          kind: isLeaf ? "file" : "dir",
          children: new Map(),
          file: isLeaf ? file : null,
        });
      }
      node = node.children.get(part)!;
      if (isLeaf) node.file = file;
    }
  }

  return root;
}
