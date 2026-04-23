import {
  type ChildProcessWithoutNullStreams,
  spawn,
} from "node:child_process";
import { basename, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReviewNavigationRequest } from "../../shared/contracts/review.js";

interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
}

interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: number | null;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspLocationLink {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
}

export interface ResolvedNavigationLocation {
  path: string;
  line: number;
  column: number;
}

interface LspDefinitionClientOptions {
  command: string;
  languageId: string;
  repoRoot: string;
}

interface OpenDocumentState {
  version: number;
  content: string;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

export class LspDefinitionClient {
  private static readonly RETRY_COOLDOWN_MS = 1000;

  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly repoRoot: string;
  private readonly rootUri: string;
  private readonly command: string;
  private readonly languageId: string;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private readonly stderrLines: string[] = [];
  private readonly openDocuments = new Map<string, OpenDocumentState>();
  private readBuffer = Buffer.alloc(0);
  private initializationPromise: Promise<void> | null = null;
  private disposed = false;
  private lastFailureAt = 0;

  constructor(options: LspDefinitionClientOptions) {
    this.command = options.command;
    this.languageId = options.languageId;
    this.repoRoot = options.repoRoot;
    this.rootUri = pathToFileURL(options.repoRoot).href;
  }

  async resolveDefinition(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation | null> {
    const locations = await this.resolveLocations(
      request,
      "textDocument/definition",
      this.createPositionParams(request),
    );
    return locations[0] ?? null;
  }

  async resolveReferences(
    request: ReviewNavigationRequest,
  ): Promise<ResolvedNavigationLocation[]> {
    return this.resolveLocations(request, "textDocument/references", {
      ...this.createPositionParams(request),
      context: {
        includeDeclaration: false,
      },
    });
  }

  private async resolveLocations(
    request: ReviewNavigationRequest,
    method: string,
    params: unknown,
  ): Promise<ResolvedNavigationLocation[]> {
    try {
      await this.ensureInitialized();

      const documentPath = join(this.repoRoot, request.sourcePath);
      const documentUri = pathToFileURL(documentPath).href;
      await this.syncDocument(documentUri, request.content);

      const result = await this.request(method, {
        textDocument: { uri: documentUri },
        ...(params as Record<string, unknown>),
      });

      return this.extractLocations(result);
    } catch {
      return [];
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const child = this.child;
    if (!child) {
      this.openDocuments.clear();
      return;
    }

    for (const uri of this.openDocuments.keys()) {
      this.notify("textDocument/didClose", {
        textDocument: { uri },
      });
    }
    this.openDocuments.clear();

    try {
      await this.request("shutdown", null);
    } catch {
      // Ignore shutdown failures during disposal.
    }

    try {
      this.notify("exit", null);
    } catch {
      // Ignore exit notification failures during disposal.
    }

    this.child = null;
    this.initializationPromise = null;
    child.kill();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.disposed) {
      throw new Error(`${this.command} client is disposed`);
    }

    if (
      this.child == null &&
      Date.now() - this.lastFailureAt < LspDefinitionClient.RETRY_COOLDOWN_MS
    ) {
      throw new Error(`${this.command} retry is cooling down`);
    }

    if (!this.initializationPromise) {
      this.initializationPromise = this.startAndInitialize().catch((error: unknown) => {
        this.initializationPromise = null;
        this.recordFailure();
        throw error;
      });
    }

    return this.initializationPromise;
  }

  private async startAndInitialize(): Promise<void> {
    const child = await this.spawnProcess();
    this.child = child;

    child.stdout.on("data", (chunk: Buffer) => {
      this.handleStdout(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const lines = chunk
        .toString("utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      this.stderrLines.push(...lines);
      if (this.stderrLines.length > 20) {
        this.stderrLines.splice(0, this.stderrLines.length - 20);
      }
    });

    child.on("exit", () => {
      if (this.disposed) return;
      const error = this.buildProcessError(`${this.command} exited unexpectedly`);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.recordFailure();
    });

    await this.request("initialize", {
      processId: process.pid,
      rootUri: this.rootUri,
      capabilities: {
        textDocument: {
          definition: {
            linkSupport: true,
          },
        },
      },
      workspaceFolders: [
        {
          uri: this.rootUri,
          name: basename(this.repoRoot),
        },
      ],
    });

    this.lastFailureAt = 0;
    this.notify("initialized", {});
  }

  private spawnProcess(): Promise<ChildProcessWithoutNullStreams> {
    const deferred = createDeferred<ChildProcessWithoutNullStreams>();
    const child = spawn(this.command, [], {
      cwd: this.repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.once("spawn", () => {
      deferred.resolve(child);
    });

    child.once("error", (error) => {
      deferred.reject(error);
    });

    return deferred.promise;
  }

  private async syncDocument(uri: string, content: string): Promise<void> {
    const existing = this.openDocuments.get(uri);
    if (!existing) {
      this.openDocuments.set(uri, {
        version: 1,
        content,
      });
      this.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: this.languageId,
          version: 1,
          text: content,
        },
      });
      return;
    }

    if (existing.content === content) {
      return;
    }

    const nextVersion = existing.version + 1;
    this.openDocuments.set(uri, {
      version: nextVersion,
      content,
    });
    this.notify("textDocument/didChange", {
      textDocument: {
        uri,
        version: nextVersion,
      },
      contentChanges: [{ text: content }],
    });
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child) {
      return Promise.reject(new Error(`${this.command} is not running`));
    }

    const id = this.nextRequestId++;
    const payload = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params,
    };

    const deferred = createDeferred<unknown>();
    this.pending.set(id, deferred);
    this.writeMessage(payload);
    return deferred.promise;
  }

  private notify(method: string, params: unknown): void {
    if (!this.child) return;
    this.writeMessage({
      jsonrpc: "2.0" as const,
      method,
      params,
    });
  }

  private writeMessage(message: unknown): void {
    const child = this.child;
    if (!child) return;

    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
    child.stdin.write(Buffer.concat([header, body]));
  }

  private handleStdout(chunk: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk]);

    while (true) {
      const headerEnd = this.readBuffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;

      const headerText = this.readBuffer
        .subarray(0, headerEnd)
        .toString("ascii");
      const contentLengthHeader = headerText
        .split("\r\n")
        .find((line) => line.toLowerCase().startsWith("content-length:"));
      if (!contentLengthHeader) {
        this.readBuffer = Buffer.alloc(0);
        return;
      }

      const contentLength = Number(contentLengthHeader.split(":")[1]?.trim() ?? 0);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.readBuffer.length < messageEnd) return;

      const body = this.readBuffer.subarray(messageStart, messageEnd);
      this.readBuffer = this.readBuffer.subarray(messageEnd);

      try {
        const message = JSON.parse(body.toString("utf8")) as
          | JsonRpcSuccessResponse
          | JsonRpcErrorResponse;
        this.handleMessage(message);
      } catch {
        // Ignore malformed protocol messages and keep reading.
      }
    }
  }

  private handleMessage(message: JsonRpcSuccessResponse | JsonRpcErrorResponse) {
    if (typeof message.id !== "number") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if ("error" in message && message.error) {
      pending.reject(new Error(message.error.message || `${this.command} request failed`));
      return;
    }

    pending.resolve(
      "result" in message && message.result !== undefined ? message.result : null,
    );
  }

  private createPositionParams(
    request: ReviewNavigationRequest,
  ): {
    position: {
      line: number;
      character: number;
    };
  } {
    return {
      position: {
        line: Math.max(0, request.lineNumber - 1),
        character: Math.max(0, request.column - 1),
      },
    };
  }

  private extractLocations(result: unknown): ResolvedNavigationLocation[] {
    const items = Array.isArray(result)
      ? result
      : result == null
        ? []
        : [result];

    const resolved: ResolvedNavigationLocation[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const location = this.normalizeLocation(item);
      if (!location) continue;
      const key = `${location.path}:${location.line}:${location.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push(location);
    }

    return resolved;
  }

  private normalizeLocation(value: unknown): ResolvedNavigationLocation | null {
    if (!value || typeof value !== "object") return null;

    const link = value as Partial<LspLocationLink>;
    if (typeof link.targetUri === "string" && link.targetRange?.start) {
      return this.toResolvedLocation(
        link.targetUri,
        link.targetSelectionRange?.start ?? link.targetRange.start,
      );
    }

    const location = value as Partial<LspLocation>;
    if (typeof location.uri === "string" && location.range?.start) {
      return this.toResolvedLocation(location.uri, location.range.start);
    }

    return null;
  }

  private toResolvedLocation(
    uri: string,
    position: LspPosition,
  ): ResolvedNavigationLocation | null {
    if (!uri.startsWith("file://")) return null;

    let absolutePath: string;
    try {
      absolutePath = fileURLToPath(uri);
    } catch {
      return null;
    }

    const relativePath = relative(this.repoRoot, absolutePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }

    return {
      path: normalizeRepoPath(relativePath),
      line: Math.max(1, position.line + 1),
      column: Math.max(1, position.character + 1),
    };
  }

  private buildProcessError(message: string): Error {
    const details = this.stderrLines.length
      ? ` (${this.stderrLines.slice(-3).join(" | ")})`
      : "";
    return new Error(`${message}${details}`);
  }

  private recordFailure(): void {
    this.lastFailureAt = Date.now();
    this.child = null;
    this.initializationPromise = null;
    this.readBuffer = Buffer.alloc(0);
    this.openDocuments.clear();
  }
}
