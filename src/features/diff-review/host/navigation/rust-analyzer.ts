import { LspDefinitionClient } from "./lsp-definition-client.js";

export { type ResolvedNavigationLocation } from "./lsp-definition-client.js";

export class RustAnalyzerClient extends LspDefinitionClient {
  constructor(repoRoot: string) {
    super({
      command: "rust-analyzer",
      languageId: "rust",
      repoRoot,
    });
  }
}
