import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import ts from "typescript";
import type { ReviewNavigationRequest } from "../../shared/contracts/review.js";
import type { ResolvedNavigationLocation } from "./lsp-definition-client.js";

interface ScriptOverlay {
  version: number;
  content: string;
}

interface TypeScriptProjectState {
  service: ts.LanguageService;
  baselineFileNames: Set<string>;
  scriptVersions: Map<string, number>;
  overlays: Map<string, ScriptOverlay>;
  scriptFileNames: Set<string>;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function normalizeAbsolutePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function getScriptKind(fileName: string): ts.ScriptKind {
  const normalized = normalizeRepoPath(fileName);
  if (normalized.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (normalized.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (
    normalized.endsWith(".js") ||
    normalized.endsWith(".mjs") ||
    normalized.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function readTextFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export class TypeScriptNavigationService {
  private readonly documentRegistry = ts.createDocumentRegistry();
  private readonly repoRoot: string;
  private readonly projects = new Map<string, TypeScriptProjectState>();

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async resolveDefinition(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation | null> {
    if (
      request.languageId !== "typescript" &&
      request.languageId !== "javascript"
    ) {
      return null;
    }

    const absolutePath = normalizeAbsolutePath(join(this.repoRoot, request.sourcePath));
    const project = this.getProjectForFile(absolutePath);
    const clearOverlay = this.setOverlay(project, absolutePath, request.content);

    try {
      const sourceFile = ts.createSourceFile(
        absolutePath,
        request.content,
        ts.ScriptTarget.Latest,
        true,
      );
      const position = ts.getPositionOfLineAndCharacter(
        sourceFile,
        Math.max(0, request.lineNumber - 1),
        Math.max(0, request.column - 1),
      );

      const definitions =
        project.service.getDefinitionAtPosition(absolutePath, position) ?? [];
      for (const definition of definitions) {
        const normalizedFileName = normalizeAbsolutePath(definition.fileName);
        const resolved = this.toResolvedLocation(
          project,
          normalizedFileName,
          definition.textSpan.start,
        );
        if (resolved) return resolved;
      }

      return null;
    } finally {
      clearOverlay();
    }
  }

  async resolveReferences(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation[]> {
    if (
      request.languageId !== "typescript" &&
      request.languageId !== "javascript"
    ) {
      return [];
    }

    const absolutePath = normalizeAbsolutePath(
      join(this.repoRoot, request.sourcePath),
    );
    const project = this.getProjectForFile(absolutePath);
    const clearOverlay = this.setOverlay(project, absolutePath, request.content);

    try {
      const sourceFile = ts.createSourceFile(
        absolutePath,
        request.content,
        ts.ScriptTarget.Latest,
        true,
      );
      const position = ts.getPositionOfLineAndCharacter(
        sourceFile,
        Math.max(0, request.lineNumber - 1),
        Math.max(0, request.column - 1),
      );

      const references =
        project.service.getReferencesAtPosition(absolutePath, position) ?? [];
      const resolved: ResolvedNavigationLocation[] = [];
      const seen = new Set<string>();
      const requestKey = `${normalizeRepoPath(request.sourcePath)}:${request.lineNumber}:${request.column}`;

      for (const reference of references) {
        const normalizedFileName = normalizeAbsolutePath(reference.fileName);
        const location = this.toResolvedLocation(
          project,
          normalizedFileName,
          reference.textSpan.start,
        );
        if (!location) continue;

        const key = `${location.path}:${location.line}:${location.column}`;
        if (key === requestKey) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        resolved.push(location);
      }

      return resolved;
    } finally {
      clearOverlay();
    }
  }

  async dispose(): Promise<void> {
    for (const project of this.projects.values()) {
      project.service.dispose();
    }
    this.projects.clear();
  }

  private getProjectForFile(fileName: string): TypeScriptProjectState {
    const configPath = this.findProjectConfig(fileName);
    const key = configPath ?? "__repo__";
    const existing = this.projects.get(key);
    if (existing) return existing;

    const created = configPath
      ? this.createConfiguredProject(configPath, fileName)
      : this.createFallbackProject(fileName);
    this.projects.set(key, created);
    return created;
  }

  private findProjectConfig(fileName: string): string | null {
    const tsConfig = ts.findConfigFile(dirname(fileName), ts.sys.fileExists, "tsconfig.json");
    if (tsConfig) return normalizeAbsolutePath(tsConfig);

    const jsConfig = ts.findConfigFile(dirname(fileName), ts.sys.fileExists, "jsconfig.json");
    return jsConfig ? normalizeAbsolutePath(jsConfig) : null;
  }

  private createConfiguredProject(
    configPath: string,
    requestedFile: string,
  ): TypeScriptProjectState {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      dirname(configPath),
      undefined,
      configPath,
    );
    const rootNames = new Set(parsed.fileNames.map(normalizeAbsolutePath));
    rootNames.add(requestedFile);

    return this.createProject([...rootNames], parsed.options);
  }

  private createFallbackProject(requestedFile: string): TypeScriptProjectState {
    return this.createProject([requestedFile], {
      allowJs: true,
      checkJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
    });
  }

  private createProject(
    rootNames: string[],
    compilerOptions: ts.CompilerOptions,
  ): TypeScriptProjectState {
    const scriptVersions = new Map<string, number>();
    const overlays = new Map<string, ScriptOverlay>();
    const baselineFileNames = new Set(rootNames.map(normalizeAbsolutePath));
    const scriptFileNames = new Set(baselineFileNames);

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => compilerOptions,
      getCurrentDirectory: () => this.repoRoot,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getScriptFileNames: () => [...scriptFileNames],
      getScriptVersion: (fileName) =>
        String(scriptVersions.get(normalizeAbsolutePath(fileName)) ?? 0),
      getScriptSnapshot: (fileName) => {
        const normalized = normalizeAbsolutePath(fileName);
        const overlay = overlays.get(normalized);
        const content =
          overlay?.content ??
          readTextFile(normalized) ??
          (existsSync(normalized) ? ts.sys.readFile(normalized) : undefined);
        if (content == null) return undefined;
        return ts.ScriptSnapshot.fromString(content);
      },
      getScriptKind: (fileName) => getScriptKind(fileName),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
      realpath: ts.sys.realpath,
    };

    const service = ts.createLanguageService(host, this.documentRegistry);
    return {
      service,
      baselineFileNames,
      scriptVersions,
      overlays,
      scriptFileNames,
    };
  }

  private setOverlay(
    project: TypeScriptProjectState,
    fileName: string,
    content: string,
  ): () => void {
    const normalized = normalizeAbsolutePath(fileName);
    const addedTransientFile =
      !project.baselineFileNames.has(normalized) &&
      !project.scriptFileNames.has(normalized);
    const currentVersion = project.scriptVersions.get(normalized) ?? 0;
    project.scriptVersions.set(normalized, currentVersion + 1);
    project.overlays.set(normalized, {
      version: currentVersion + 1,
      content,
    });
    project.scriptFileNames.add(normalized);

    return () => {
      project.overlays.delete(normalized);
      if (addedTransientFile) {
        project.scriptFileNames.delete(normalized);
      }
    };
  }

  private toResolvedLocation(
    project: TypeScriptProjectState,
    fileName: string,
    start: number,
  ): ResolvedNavigationLocation | null {
    const relativePath = relative(this.repoRoot, fileName);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }

    const sourceFile = project.service.getProgram()?.getSourceFile(fileName);
    if (!sourceFile) {
      const text = readTextFile(fileName);
      if (text == null) return null;
      const fallback = ts.createSourceFile(
        fileName,
        text,
        ts.ScriptTarget.Latest,
        true,
      );
      const position = fallback.getLineAndCharacterOfPosition(start);
      return {
        path: normalizeRepoPath(relativePath),
        line: position.line + 1,
        column: position.character + 1,
      };
    }

    const position = sourceFile.getLineAndCharacterOfPosition(start);
    return {
      path: normalizeRepoPath(relativePath),
      line: position.line + 1,
      column: position.character + 1,
    };
  }
}
