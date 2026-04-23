const SEMANTIC_DEFINITION_LANGUAGE_SET = new Set([
  "rust",
  "go",
  "typescript",
  "javascript",
]);

export function supportsSemanticDefinition(languageId: string): boolean {
  return SEMANTIC_DEFINITION_LANGUAGE_SET.has(languageId);
}

export function navigationActionLabel(languageId: string): string {
  return supportsSemanticDefinition(languageId)
    ? "open definition"
    : "open module/import target";
}
