import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerBtwWorkspace from "./features/btw/host/register.js";
import registerDiffReview from "./features/diff-review/host/register.js";
import registerResponseReview from "./features/response-review/host/register.js";

export default function piWorkbenchExtension(pi: ExtensionAPI): void {
  registerDiffReview(pi);
  registerResponseReview(pi);
  registerBtwWorkspace(pi);
}
