import { LspDefinitionClient } from "./lsp-definition-client.js";

export class GoplsClient extends LspDefinitionClient {
  constructor(repoRoot: string) {
    super({
      command: "gopls",
      languageId: "go",
      repoRoot,
    });
  }
}
