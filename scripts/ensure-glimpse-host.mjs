import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const require = createRequire(import.meta.url);

function hasSwiftc() {
  const result = spawnSync('swiftc', ['--version'], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function shouldBuild(binaryPath, sourcePath) {
  if (!existsSync(binaryPath)) return true;

  try {
    return statSync(sourcePath).mtimeMs > statSync(binaryPath).mtimeMs;
  } catch {
    return true;
  }
}

function main() {
  let entryPath;
  try {
    entryPath = require.resolve('glimpseui');
  } catch {
    return;
  }

  const packageRoot = dirname(dirname(entryPath));
  const sourcePath = join(packageRoot, 'src', 'glimpse.swift');
  const binaryPath = join(packageRoot, 'src', 'glimpse');

  if (!existsSync(sourcePath)) return;
  if (!shouldBuild(binaryPath, sourcePath)) return;

  if (!hasSwiftc()) {
    console.warn('[pi-diff-review] swiftc not found; skipping Glimpse host build.');
    return;
  }

  const result = spawnSync('swiftc', ['-O', 'src/glimpse.swift', '-o', 'src/glimpse'], {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

main();
