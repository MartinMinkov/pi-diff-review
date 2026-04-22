# pi-diff-review

This is pure slop, see: https://pi.dev/session/#d4ce533cedbd60040f2622dc3db950e2

It is my hope, that someone takes this idea and makes it gud.

Native diff review window for pi, powered by [Glimpse](https://github.com/hazat/glimpse) and Monaco.

```
pi install git:https://github.com/MartinMinkov/pi-diff-review
```

## What it does

Adds a `/diff-review` command to pi.

The command:

1. opens a native review window
2. lets you switch between `git diff`, `last commit`, and `all files` scopes
3. shows a collapsible sidebar with fuzzy file search
4. shows git status markers in the sidebar for changed files and untracked files
5. lazy-loads file contents on demand as you switch files and scopes
6. lets you draft comments on the original side, modified side, or whole file
7. inserts the resulting feedback prompt into the pi editor when you submit

## Requirements

- macOS, Linux, or Windows
- Node.js 20+
- `pnpm` (this repo now uses `pnpm` for dependency management)
- `bun` (only needed if you want to rebuild `dist/web/` locally)
- `pi` installed
- internet access for the Tailwind and Monaco CDNs used by the review window

To work with this repo:

```bash
pnpm install
pnpm run check      # typecheck host/extension code
pnpm run check:web  # typecheck web UI source under src/web/
pnpm run build:web  # rebuild dist/web/
```

## Project layout

- `src/host/` — extension command, repo loading, prompt composition, HTML assembly
- `src/shared/` — shared review contracts used by host and web code
- `src/web/` — review UI source, organized by app/shared/features
- `dist/web/` — built review window assets consumed by the host

### Windows notes

Glimpse now supports Windows. To build the native host during install you need:

- .NET 8 SDK
- Microsoft Edge WebView2 Runtime
