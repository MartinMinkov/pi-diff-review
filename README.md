# pi-workbench

Native review workspaces for [pi](https://pi.dev/), powered by
[Glimpse](https://github.com/hazat/glimpse), Monaco, and a TypeScript web UI.

This repository started as a fork of
[badlogic/pi-diff-review](https://github.com/badlogic/pi-diff-review). The fork
has since grown into `pi-workbench`, a home for native Pi workspaces that help
review structured context, add feedback, navigate relevant code, and send final
instructions back into pi.

```bash
pi install git:https://github.com/MartinMinkov/pi-workbench
```

## What it adds

The `/diff-review` command opens a native review window for the current git
repository. From there you can review a working tree diff, the last commit, or
the full repository snapshot without loading every file up front.

Latest features in this fork include:

- Native Glimpse review window with a Monaco diff editor.
- Review scopes for `git diff`, `last commit`, and `all files`.
- Lazy file loading and cached file contents per scope.
- Status-aware sidebar for modified, added, deleted, renamed, and untracked
  files.
- Sidebar filters for status, reviewed files, commented files, and changed
  files.
- Repository-wide code search from the sidebar, with inline match previews.
- Collapsible file tree and collapsible sidebar.
- Inline comments on the original side, modified side, or whole file.
- Structured comment kinds: feedback, question, risk, explain, and tests.
- Editable submitted comments before finishing the review.
- A review queue that tracks submitted comments and lets you jump back to them.
- Overall review notes that are prepended to the generated pi prompt.
- Mark-reviewed state for files, with an option to hide reviewed files.
- Line wrapping and changed-region display toggles for the editor.
- Per-file scroll restoration while moving between files and scopes.
- Waiting UI in pi while the native review window is open.
- Safer submit, cancel, and teardown handling for review windows.

## Navigation

The review workspace also includes code-navigation tools:

- Back and forward navigation history inside the review window.
- Clickable navigation links for supported symbols, imports, and module paths.
- Changed-symbol outline for the active file.
- Current-symbol display in the editor header.
- Quick-open files with `Cmd/Ctrl+P`.
- Command palette with `Cmd/Ctrl+Shift+P`.
- Keyboard shortcuts for focusing code search, marking files reviewed, and
  moving between submitted comments.

Semantic definition lookup is available for:

- Rust, via `rust-analyzer` when it is installed.
- Go, via `gopls` when it is installed.
- TypeScript and JavaScript, via the bundled TypeScript language service.

For other languages, the UI falls back to repository-local import and module path
navigation where possible.

## Review workflow

1. Run `/diff-review` in pi while inside a git repository.
2. Pick a scope: `git diff`, `last commit`, or `all files`.
3. Search, filter, and navigate files from the sidebar.
4. Add inline comments, file comments, or an overall review note.
5. Edit or delete submitted comments from the review queue if needed.
6. Finish the review to insert a structured feedback prompt into pi.

The generated prompt preserves comment kind, scope, file path, line range, and
old/new side context so pi can apply the feedback with useful location metadata.

## Requirements

- macOS, Linux, or Windows.
- Node.js 20+.
- `pnpm` for dependency management.
- `pi` installed.
- Internet access for the Tailwind and Monaco CDNs used by the review window.
- `bun` only if you want to rebuild `dist/web/` locally.
- Optional: `rust-analyzer` and/or `gopls` for semantic Rust and Go navigation.

### Windows notes

Glimpse supports Windows. To build the native host during install you need:

- .NET 8 SDK.
- Microsoft Edge WebView2 Runtime.

## Development

```bash
pnpm install
pnpm run check
pnpm run check:web
pnpm run lint
pnpm run build:web
```

The web UI source lives under `src/web/` and is bundled into `dist/web/`. The
pre-commit hook runs both TypeScript checks, rebuilds the web bundle, and stages
the generated `dist/web` assets.

## Project layout

- `src/host/command/` - pi command registration and native window lifecycle.
- `src/host/repo/` - git scope discovery and lazy file-content loading.
- `src/host/navigation/` - Rust, Go, TypeScript, and fallback navigation
  backends.
- `src/host/prompt/` - final feedback prompt composition.
- `src/shared/` - contracts shared by the host and web UI.
- `src/web/` - Monaco review workspace, sidebar, comments, inspector, command
  palette, and search UI.
- `dist/web/` - built review-window assets consumed by the host.

## Git history highlights

Recent history shows the fork expanding beyond the original native diff review:

- Added review scopes, lazy loading, and last-commit review support.
- Refactored the web UI into a modular TypeScript runtime.
- Added review navigation, reference workflows, and semantic language backends.
- Added the command palette, repository code search, and changed-symbol
  inspector.
- Improved comment drafting, editing, paste handling, and review-queue
  navigation.
- Hardened waiting UI, backend failure handling, and review-window teardown.
