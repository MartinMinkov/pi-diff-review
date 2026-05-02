import type {
  ReviewFile,
  ReviewGoModule,
  ReviewNavigationRequest,
  ReviewNavigationSide,
  ReviewNavigationTarget,
  ReviewScope,
  ReviewWindowData,
} from "../../shared/contracts/review.js";
import type { MonacoUriFactory } from "../editor/monaco-types.js";

export interface ReviewReferenceSearchFile {
  fileId: string;
  scope: ReviewScope;
  side: ReviewNavigationSide;
  sourcePath: string;
  languageId: string;
  content: string;
}

export interface ReviewReferenceMatch {
  target: ReviewNavigationTarget;
  sourcePath: string;
  lineNumber: number;
  column: number;
  lineText: string;
}

export interface ReviewModelDescriptor {
  fileId: string;
  scope: ReviewScope;
  side: ReviewNavigationSide;
  sourcePath: string;
}

export interface ReviewNavigationResolver {
  resolveTarget: (
    request: ReviewNavigationRequest,
  ) => ReviewNavigationTarget | null;
  findReferences: (
    request: ReviewNavigationRequest,
    files: ReviewReferenceSearchFile[],
  ) => ReviewReferenceMatch[];
  buildModelUri: (
    monacoApi: MonacoUriFactory,
    descriptor: ReviewModelDescriptor,
  ) => unknown;
  buildTargetUri: (
    monacoApi: MonacoUriFactory,
    target: ReviewNavigationTarget,
    options?: { source?: ReviewNavigationTarget | null },
  ) => unknown;
  parseModelUri: (uri: unknown) => ReviewModelDescriptor | null;
  parseTargetUri: (uri: unknown) => ReviewNavigationTarget | null;
  parseTargetSourceUri: (uri: unknown) => ReviewNavigationTarget | null;
}

interface CursorStringMatch {
  value: string;
  startColumn: number;
  endColumn: number;
}

interface ReviewNavigationContext {
  files: ReviewFile[];
  goModules: ReviewGoModule[];
}

const REVIEW_MODEL_SCHEME = "review-model";
const REVIEW_TARGET_SCHEME = "review-target";
const TS_LIKE_EXTENSIONS = [
  ".d.ts",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
];

export function createReviewNavigationResolver(
  reviewData: ReviewWindowData,
): ReviewNavigationResolver {
  const context: ReviewNavigationContext = {
    files: reviewData.files,
    goModules: reviewData.goModules ?? [],
  };

  const fileById = new Map(reviewData.files.map((file) => [file.id, file]));
  const fileByPath = new Map(
    reviewData.files.map((file) => [normalizePath(file.path), file]),
  );
  const filePathSet = new Set(fileByPath.keys());
  const cargoRoots = [...filePathSet]
    .filter((path) => path === "Cargo.toml" || path.endsWith("/Cargo.toml"))
    .map((path) => dirname(path))
    .sort((a, b) => b.length - a.length);

  function buildModelUri(
    monacoApi: MonacoUriFactory,
    descriptor: ReviewModelDescriptor,
  ): unknown {
    return monacoApi.Uri.from({
      scheme: REVIEW_MODEL_SCHEME,
      path: `/${encodeURIComponent(descriptor.fileId)}/${descriptor.side}`,
      query: new URLSearchParams({
        scope: descriptor.scope,
        sourcePath: descriptor.sourcePath,
      }).toString(),
    });
  }

  function buildTargetUri(
    monacoApi: MonacoUriFactory,
    target: ReviewNavigationTarget,
    options: { source?: ReviewNavigationTarget | null } = {},
  ): unknown {
    const query = new URLSearchParams({
      scope: target.scope,
      line: String(target.line),
      column: String(target.column),
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
      query: query.toString(),
    });
  }

  function parseModelUri(uri: unknown): ReviewModelDescriptor | null {
    if (!uri || typeof uri !== "object") return null;
    const value = uri as { scheme?: string; path?: string; query?: string };
    if (value.scheme !== REVIEW_MODEL_SCHEME) return null;
    const parts = String(value.path || "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;

    const params = new URLSearchParams(String(value.query || ""));
    const scope = params.get("scope");
    const sourcePath = params.get("sourcePath") || "";
    const side = parts[1];

    if (!isReviewScope(scope) || !isNavigationSide(side)) return null;

    return {
      fileId: decodeURIComponent(parts[0]),
      scope,
      side,
      sourcePath,
    };
  }

  function parseTargetUri(uri: unknown): ReviewNavigationTarget | null {
    if (!uri || typeof uri !== "object") return null;
    const value = uri as { scheme?: string; path?: string; query?: string };
    if (value.scheme !== REVIEW_TARGET_SCHEME) return null;
    const parts = String(value.path || "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;

    const params = new URLSearchParams(String(value.query || ""));
    const scope = params.get("scope");
    const line = Number(params.get("line") || "1");
    const column = Number(params.get("column") || "1");
    const side = parts[1];

    if (!isReviewScope(scope) || !isNavigationSide(side)) return null;

    return {
      fileId: decodeURIComponent(parts[0]),
      scope,
      side,
      line: Number.isFinite(line) && line > 0 ? line : 1,
      column: Number.isFinite(column) && column > 0 ? column : 1,
    };
  }

  function parseTargetSourceUri(uri: unknown): ReviewNavigationTarget | null {
    if (!uri || typeof uri !== "object") return null;
    const value = uri as { scheme?: string; query?: string };
    if (value.scheme !== REVIEW_TARGET_SCHEME) return null;

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
      column: Number.isFinite(column) && column > 0 ? column : 1,
    };
  }

  function resolveTarget(
    request: ReviewNavigationRequest,
  ): ReviewNavigationTarget | null {
    const sourceFile = fileById.get(request.fileId);
    if (!sourceFile) return null;

    const normalizedSourcePath = normalizePath(
      request.sourcePath || sourceFile.path,
    );
    const targetPath = resolvePathForLanguage(
      context,
      {
        ...request,
        sourcePath: normalizedSourcePath,
      },
      filePathSet,
      cargoRoots,
    );

    if (!targetPath) return null;

    const targetFile = fileByPath.get(normalizePath(targetPath));
    if (!targetFile) return null;

    return chooseNavigationTarget(targetFile, request.scope, request.side);
  }

  function findReferences(
    request: ReviewNavigationRequest,
    files: ReviewReferenceSearchFile[],
  ): ReviewReferenceMatch[] {
    const target = resolveTarget(request);
    if (!target) return [];

    const matches: ReviewReferenceMatch[] = [];

    for (const file of files) {
      const candidates = collectNavigationRequests(file);
      for (const candidate of candidates) {
        const resolved = resolveTarget(candidate);
        if (!resolved || resolved.fileId !== target.fileId) continue;

        if (
          candidate.fileId === request.fileId &&
          candidate.scope === request.scope &&
          candidate.side === request.side &&
          candidate.lineNumber === request.lineNumber
        ) {
          continue;
        }

        matches.push({
          target: {
            fileId: candidate.fileId,
            scope: candidate.scope,
            side: candidate.side,
            line: candidate.lineNumber,
            column: candidate.column,
          },
          sourcePath: candidate.sourcePath,
          lineNumber: candidate.lineNumber,
          column: candidate.column,
          lineText: getLineText(candidate.content, candidate.lineNumber),
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
    parseTargetSourceUri,
  };
}

function chooseNavigationTarget(
  file: ReviewFile,
  scope: ReviewScope,
  side: ReviewNavigationSide,
): ReviewNavigationTarget {
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
      column: 1,
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
      column: 1,
    };
  }

  return {
    fileId: file.id,
    scope: "all-files",
    side: "modified",
    line: 1,
    column: 1,
  };
}

function resolvePathForLanguage(
  context: ReviewNavigationContext,
  request: ReviewNavigationRequest,
  filePathSet: Set<string>,
  cargoRoots: string[],
): string | null {
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

function collectNavigationRequests(
  file: ReviewReferenceSearchFile,
): ReviewNavigationRequest[] {
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

function collectTsLikeRequests(
  file: ReviewReferenceSearchFile,
): ReviewNavigationRequest[] {
  const requests: ReviewNavigationRequest[] = [];
  const lines = file.content.split(/\r?\n/);
  const patterns = [
    /\bfrom\s+(["'])([^"']+)\1/g,
    /\bexport\s+(?:type\s+)?(?:\*|\*\s+as\s+[A-Za-z_$][\w$]*|\{[^}]+\})\s+from\s+(["'])([^"']+)\1/g,
    /\bimport\s*\(\s*(["'])([^"']+)\1/g,
    /\brequire\s*\(\s*(["'])([^"']+)\1/g,
    /^\s*import\s+(["'])([^"']+)\1/g,
  ];

  lines.forEach((line, index) => {
    const seenColumns = new Set<number>();

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) != null) {
        const value = match[2] || "";
        const valueIndex = match[0].indexOf(value);
        if (valueIndex < 0) continue;

        const column = match.index + valueIndex + 1;
        if (seenColumns.has(column)) continue;
        seenColumns.add(column);

        requests.push({
          fileId: file.fileId,
          scope: file.scope,
          side: file.side,
          sourcePath: file.sourcePath,
          languageId: file.languageId,
          content: file.content,
          lineNumber: index + 1,
          column,
        });
      }
    }
  });

  return requests;
}

function collectGoRequests(
  file: ReviewReferenceSearchFile,
): ReviewNavigationRequest[] {
  const requests: ReviewNavigationRequest[] = [];
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
    if (!shouldInspect) return;

    const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) != null) {
      requests.push({
        fileId: file.fileId,
        scope: file.scope,
        side: file.side,
        sourcePath: file.sourcePath,
        languageId: file.languageId,
        content: file.content,
        lineNumber: index + 1,
        column: match.index + 2,
      });
    }
  });

  return requests;
}

function collectRustRequests(
  file: ReviewReferenceSearchFile,
): ReviewNavigationRequest[] {
  const requests: ReviewNavigationRequest[] = [];
  const lines = file.content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const modMatch = line.match(
      /^\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/,
    );
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
        column: start + 1,
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
          column: start + 1,
        });
      }
    }
  });

  return requests;
}

function collectIncludeRequests(
  file: ReviewReferenceSearchFile,
): ReviewNavigationRequest[] {
  const requests: ReviewNavigationRequest[] = [];
  const lines = file.content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!line.includes("#include")) return;
    const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) != null) {
      requests.push({
        fileId: file.fileId,
        scope: file.scope,
        side: file.side,
        sourcePath: file.sourcePath,
        languageId: file.languageId,
        content: file.content,
        lineNumber: index + 1,
        column: match.index + 2,
      });
    }
  });

  return requests;
}

function resolveTsLikeImportPath(
  request: ReviewNavigationRequest,
  filePathSet: Set<string>,
): string | null {
  const match = getStringLiteralAtCursor(request);
  if (!match) return null;
  if (!match.value.startsWith(".") && !match.value.startsWith("/")) return null;

  const basePath = match.value.startsWith("/")
    ? normalizePath(match.value.slice(1))
    : normalizePath(joinPath(dirname(request.sourcePath), match.value));

  return findFirstExistingPath(buildTsLikeCandidates(basePath), filePathSet);
}

function buildTsLikeCandidates(basePath: string): string[] {
  const candidates = new Set<string>();
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

function resolveGoImportPath(
  goModules: ReviewGoModule[],
  request: ReviewNavigationRequest,
  filePathSet: Set<string>,
): string | null {
  const match = getStringLiteralAtCursor(request);
  if (!match) return null;

  const module = [...goModules]
    .filter(
      (item) =>
        match.value === item.modulePath ||
        match.value.startsWith(`${item.modulePath}/`),
    )
    .sort((a, b) => b.modulePath.length - a.modulePath.length)[0];

  if (!module) return null;

  const suffix = match.value.slice(module.modulePath.length).replace(/^\//, "");
  const targetDir = normalizePath(
    suffix ? joinPath(module.rootPath, suffix) : module.rootPath,
  );

  return pickGoPackageFile(targetDir, filePathSet);
}

function pickGoPackageFile(
  targetDir: string,
  filePathSet: Set<string>,
): string | null {
  const candidates = [...filePathSet]
    .filter((path) => dirname(path) === targetDir)
    .filter((path) => path.endsWith(".go"))
    .sort((a, b) => a.localeCompare(b));

  if (candidates.length === 0) return null;

  const directoryName = baseName(targetDir);
  const preferred = candidates.find(
    (path) =>
      !path.endsWith("_test.go") &&
      (baseName(path) === `${directoryName}.go` || baseName(path) === "doc.go"),
  );

  return (
    preferred ??
    candidates.find((path) => !path.endsWith("_test.go")) ??
    candidates[0]
  );
}

function resolveRustImportPath(
  request: ReviewNavigationRequest,
  filePathSet: Set<string>,
  cargoRoots: string[],
): string | null {
  const sourcePath = normalizePath(request.sourcePath);
  const cargoRoot = cargoRoots.find(
    (root) =>
      sourcePath === `${root}/src/lib.rs` ||
      sourcePath === `${root}/src/main.rs` ||
      sourcePath.startsWith(`${root}/src/`),
  );

  if (cargoRoot == null) return null;

  const srcRoot = normalizePath(joinPath(cargoRoot, "src"));
  const modDeclaration = getRustModDeclaration(request);
  if (modDeclaration) {
    return findFirstExistingPath(
      buildRustModCandidates(sourcePath, modDeclaration),
      filePathSet,
    );
  }

  const usePath = getRustUsePath(request);
  if (!usePath) return null;

  const absoluteSegments = resolveRustAbsoluteSegments(
    usePath,
    sourcePath,
    srcRoot,
  );
  if (absoluteSegments == null || absoluteSegments.length === 0) return null;

  for (let index = absoluteSegments.length; index >= 1; index -= 1) {
    const prefix = absoluteSegments.slice(0, index);
    const candidates = [
      `${joinPath(srcRoot, ...prefix)}.rs`,
      joinPath(srcRoot, ...prefix, "mod.rs"),
    ];
    const target = findFirstExistingPath(candidates, filePathSet);
    if (target) return target;
  }

  return null;
}

function getRustModDeclaration(
  request: ReviewNavigationRequest,
): string | null {
  const line = getLineContent(request);
  const match = line.match(/^\s*(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/);
  if (!match) return null;
  const moduleName = match[1];
  const start = line.indexOf(moduleName) + 1;
  const end = start + moduleName.length;
  if (request.column < start || request.column > end) return null;
  return moduleName;
}

function buildRustModCandidates(
  sourcePath: string,
  moduleName: string,
): string[] {
  const normalizedSourcePath = normalizePath(sourcePath);
  const fileName = baseName(normalizedSourcePath);
  const baseDir =
    fileName === "lib.rs" || fileName === "main.rs"
      ? dirname(normalizedSourcePath)
      : fileName === "mod.rs"
        ? dirname(normalizedSourcePath)
        : stripExtension(normalizedSourcePath);

  return [
    joinPath(baseDir, `${moduleName}.rs`),
    joinPath(baseDir, moduleName, "mod.rs"),
  ];
}

function getRustUsePath(request: ReviewNavigationRequest): string | null {
  const line = getLineContent(request);
  const match = line.match(/^\s*(?:pub\s+)?use\s+(.+?)\s*;/);
  if (!match) return null;

  const usePath = match[1];
  const start = line.indexOf(usePath) + 1;
  const end = start + usePath.length;
  if (request.column < start || request.column > end) return null;

  return usePath.split(" as ")[0].split("::{")[0].trim();
}

function resolveRustAbsoluteSegments(
  usePath: string,
  sourcePath: string,
  srcRoot: string,
): string[] | null {
  const segments = usePath.split("::").filter(Boolean);
  if (segments.length === 0) return null;

  if (segments[0] === "crate") {
    return segments.slice(1);
  }

  if (segments[0] === "self" || segments[0] === "super") {
    const currentSegments = getRustModuleSegments(sourcePath, srcRoot);
    if (currentSegments == null) return null;

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

function getRustModuleSegments(
  sourcePath: string,
  srcRoot: string,
): string[] | null {
  const normalizedSourcePath = normalizePath(sourcePath);
  const normalizedSrcRoot = normalizePath(srcRoot);
  if (!normalizedSourcePath.startsWith(`${normalizedSrcRoot}/`)) return null;

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

function resolveQuotedIncludePath(
  request: ReviewNavigationRequest,
  filePathSet: Set<string>,
): string | null {
  const line = getLineContent(request);
  if (!line.includes("#include")) return null;
  const match = getStringLiteralAtCursor(request);
  if (!match || !match.value) return null;

  const candidates = [
    normalizePath(joinPath(dirname(request.sourcePath), match.value)),
    normalizePath(match.value),
  ];

  return findFirstExistingPath(candidates, filePathSet);
}

function getStringLiteralAtCursor(
  request: ReviewNavigationRequest,
): CursorStringMatch | null {
  const line = getLineContent(request);
  const quotePatterns = [
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    /'([^'\\]*(?:\\.[^'\\]*)*)'/g,
  ];

  for (const pattern of quotePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) != null) {
      const startColumn = match.index + 1;
      const endColumn = startColumn + match[0].length;
      if (request.column >= startColumn && request.column <= endColumn) {
        return {
          value: match[1],
          startColumn,
          endColumn,
        };
      }
    }
  }

  return null;
}

function getLineContent(request: ReviewNavigationRequest): string {
  const lines = request.content.split(/\r?\n/);
  return lines[request.lineNumber - 1] || "";
}

function getLineText(content: string, lineNumber: number): string {
  return content.split(/\r?\n/)[lineNumber - 1] || "";
}

function findFirstExistingPath(
  candidates: string[],
  filePathSet: Set<string>,
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (filePathSet.has(normalized)) return normalized;
  }
  return null;
}

function normalizePath(path: string): string {
  const isAbsolute = path.startsWith("/");
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length > 0) resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  return `${isAbsolute ? "/" : ""}${resolved.join("/")}`.replace(/^\//, "");
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function baseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function stripExtension(path: string): string {
  const extension = getExtension(path);
  return extension ? path.slice(0, -extension.length) : path;
}

function getExtension(path: string): string {
  const name = baseName(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function isReviewScope(value: string | null): value is ReviewScope {
  return (
    value === "git-diff" || value === "last-commit" || value === "all-files"
  );
}

function isNavigationSide(value: string | null): value is ReviewNavigationSide {
  return value === "original" || value === "modified";
}
