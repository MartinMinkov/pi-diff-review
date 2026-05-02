import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..", "..", "..");

export function escapeForInlineScript(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export function buildInlineWebAppHtml(appName: string, data: unknown): string {
  const webDir = join(packageRoot, "dist", "web", appName);
  const templateHtml = readFileSync(join(webDir, "index.html"), "utf8");
  const appJs = readFileSync(join(webDir, "app.js"), "utf8");
  const payload = escapeForInlineScript(JSON.stringify(data));

  return templateHtml
    .replace("__INLINE_DATA__", payload)
    .replace("__INLINE_JS__", appJs);
}
