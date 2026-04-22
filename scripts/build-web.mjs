import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const sourceDir = join(rootDir, "src", "web");
const distDir = join(rootDir, "dist", "web");

mkdirSync(distDir, { recursive: true });
copyFileSync(join(sourceDir, "index.html"), join(distDir, "index.html"));

const result = spawnSync(
  "bun",
  [
    "build",
    join(sourceDir, "main.ts"),
    "--bundle",
    "--target=browser",
    "--format=iife",
    `--outfile=${join(distDir, "app.js")}`,
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
