import type {
  ReviewFile,
  ReviewNavigationRequest,
  ReviewNavigationTarget,
  ReviewScope,
} from "../../shared/contracts/review.js";
import {
  RustAnalyzerClient,
  type ResolvedNavigationLocation,
} from "./rust-analyzer.js";
import { GoplsClient } from "./gopls.js";
import { TypeScriptNavigationService } from "./typescript-service.js";

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function samePath(left: string | null | undefined, right: string): boolean {
  return left != null && normalizeRepoPath(left) === right;
}

function chooseTargetForScope(
  file: ReviewFile,
  preferredScope: ReviewScope,
  preferredSide: ReviewNavigationTarget["side"],
  path: string,
  requestFileId?: string,
): Omit<ReviewNavigationTarget, "line" | "column"> | null {
  if (file.id === requestFileId) {
    if (
      preferredScope === "git-diff" &&
      file.inGitDiff &&
      preferredSide === "original" &&
      file.gitDiff?.hasOriginal
    ) {
      return { fileId: file.id, scope: "git-diff", side: "original" };
    }
    if (
      preferredScope === "git-diff" &&
      file.inGitDiff &&
      preferredSide === "modified" &&
      file.gitDiff?.hasModified
    ) {
      return { fileId: file.id, scope: "git-diff", side: "modified" };
    }
    if (
      preferredScope === "last-commit" &&
      file.inLastCommit &&
      preferredSide === "original" &&
      file.lastCommit?.hasOriginal
    ) {
      return { fileId: file.id, scope: "last-commit", side: "original" };
    }
    if (
      preferredScope === "last-commit" &&
      file.inLastCommit &&
      preferredSide === "modified" &&
      file.lastCommit?.hasModified
    ) {
      return { fileId: file.id, scope: "last-commit", side: "modified" };
    }
  }

  if (preferredScope === "git-diff" && file.inGitDiff) {
    if (samePath(file.gitDiff?.newPath, path) && file.gitDiff?.hasModified) {
      return { fileId: file.id, scope: "git-diff", side: "modified" };
    }
    if (samePath(file.gitDiff?.oldPath, path) && file.gitDiff?.hasOriginal) {
      return { fileId: file.id, scope: "git-diff", side: "original" };
    }
    if (file.gitDiff?.hasModified) {
      return { fileId: file.id, scope: "git-diff", side: "modified" };
    }
    if (file.gitDiff?.hasOriginal) {
      return { fileId: file.id, scope: "git-diff", side: "original" };
    }
  }

  if (preferredScope === "last-commit" && file.inLastCommit) {
    if (
      samePath(file.lastCommit?.newPath, path) &&
      file.lastCommit?.hasModified
    ) {
      return { fileId: file.id, scope: "last-commit", side: "modified" };
    }
    if (
      samePath(file.lastCommit?.oldPath, path) &&
      file.lastCommit?.hasOriginal
    ) {
      return { fileId: file.id, scope: "last-commit", side: "original" };
    }
    if (file.lastCommit?.hasModified) {
      return { fileId: file.id, scope: "last-commit", side: "modified" };
    }
    if (file.lastCommit?.hasOriginal) {
      return { fileId: file.id, scope: "last-commit", side: "original" };
    }
  }

  if (file.hasWorkingTreeFile) {
    return { fileId: file.id, scope: "all-files", side: "modified" };
  }

  if (file.inGitDiff) {
    if (file.gitDiff?.hasModified) {
      return { fileId: file.id, scope: "git-diff", side: "modified" };
    }
    if (file.gitDiff?.hasOriginal) {
      return { fileId: file.id, scope: "git-diff", side: "original" };
    }
  }

  if (file.inLastCommit) {
    if (file.lastCommit?.hasModified) {
      return { fileId: file.id, scope: "last-commit", side: "modified" };
    }
    if (file.lastCommit?.hasOriginal) {
      return { fileId: file.id, scope: "last-commit", side: "original" };
    }
  }

  return null;
}

export class ReviewNavigationService {
  private readonly filesByPath = new Map<string, ReviewFile>();
  private readonly rustAnalyzer: RustAnalyzerClient;
  private readonly gopls: GoplsClient;
  private readonly typescript: TypeScriptNavigationService;

  constructor(repoRoot: string, files: ReviewFile[]) {
    this.rustAnalyzer = new RustAnalyzerClient(repoRoot);
    this.gopls = new GoplsClient(repoRoot);
    this.typescript = new TypeScriptNavigationService(repoRoot);

    for (const file of files) {
      this.registerFilePath(file.path, file);
      this.registerFilePath(file.gitDiff?.newPath ?? null, file);
      this.registerFilePath(file.gitDiff?.oldPath ?? null, file);
      this.registerFilePath(file.lastCommit?.newPath ?? null, file);
      this.registerFilePath(file.lastCommit?.oldPath ?? null, file);
    }
  }

  async resolveDefinition(
    request: ReviewNavigationRequest,
  ): Promise<ReviewNavigationTarget | null> {
    const location = await this.resolveLocation(request);
    if (!location) return null;

    return this.toNavigationTarget(location, request);
  }

  async resolveReferences(
    request: ReviewNavigationRequest,
  ): Promise<ReviewNavigationTarget[]> {
    const locations = await this.resolveLocations(request);
    const targets: ReviewNavigationTarget[] = [];
    const seen = new Set<string>();

    for (const location of locations) {
      const target = this.toNavigationTarget(location, request);
      if (!target) continue;
      const key = [
        target.fileId,
        target.scope,
        target.side,
        target.line,
        target.column,
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }

    return targets;
  }

  async dispose(): Promise<void> {
    await Promise.all([
      this.rustAnalyzer.dispose(),
      this.gopls.dispose(),
      this.typescript.dispose(),
    ]);
  }

  private async resolveLocation(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation | null> {
    switch (request.languageId) {
      case "rust":
        return this.rustAnalyzer.resolveDefinition(request);
      case "go":
        return this.gopls.resolveDefinition(request);
      case "typescript":
      case "javascript":
        return this.typescript.resolveDefinition(request);
      default:
        return null;
    }
  }

  private async resolveLocations(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation[]> {
    switch (request.languageId) {
      case "rust":
        return this.rustAnalyzer.resolveReferences(request);
      case "go":
        return this.gopls.resolveReferences(request);
      case "typescript":
      case "javascript":
        return this.typescript.resolveReferences(request);
      default:
        return [];
    }
  }

  private registerFilePath(path: string | null, file: ReviewFile): void {
    if (!path) return;
    this.filesByPath.set(normalizeRepoPath(path), file);
  }

  private toNavigationTarget(
    location: ResolvedNavigationLocation,
    request: ReviewNavigationRequest,
  ): ReviewNavigationTarget | null {
    const normalizedPath = normalizeRepoPath(location.path);
    const file = this.filesByPath.get(normalizedPath);
    if (!file) return null;

    const target = chooseTargetForScope(
      file,
      request.scope,
      request.side,
      normalizedPath,
      request.fileId,
    );
    if (!target) return null;

    return {
      ...target,
      line: location.line,
      column: location.column,
    };
  }
}
