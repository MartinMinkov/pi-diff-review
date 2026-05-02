import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const webApps = [
  {
    name: "diff-review",
    sourceDir: join(rootDir, "src", "features", "diff-review", "web"),
    distDir: join(rootDir, "dist", "web", "diff-review"),
  },
  {
    name: "response-review",
    sourceDir: join(rootDir, "src", "features", "response-review", "web"),
    distDir: join(rootDir, "dist", "web", "response-review"),
  },
  {
    name: "btw",
    sourceDir: join(rootDir, "src", "features", "btw", "web"),
    distDir: join(rootDir, "dist", "web", "btw"),
  },
];

for (const app of webApps) {
  mkdirSync(app.distDir, { recursive: true });
  copyFileSync(join(app.sourceDir, "index.html"), join(app.distDir, "index.html"));

  const result = spawnSync(
    "bun",
    [
      "build",
      join(app.sourceDir, "main.ts"),
      "--bundle",
      "--target=browser",
      "--format=iife",
      `--outfile=${join(app.distDir, "app.js")}`,
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
