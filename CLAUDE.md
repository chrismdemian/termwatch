# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MANDATORY Completion Checklist (DO NOT SKIP)

**REQUIRED for every code change — not optional, not "when you have time". Every single time.**

Before considering ANY code change done, you MUST complete ALL of these steps in order:

1. **Spawn an Opus audit agent** to review all changes for bugs, edge cases, and issues. Classify findings by severity: **Critical** (data loss, crashes, security) — must fix. **Major** (broken functionality, incorrect logic) — should fix. **Minor** (style, naming) — fix at your discretion, don't loop on these.
2. **Run `npm start`** to verify the app launches without errors. Check the Electron console output for JS errors (filter out GPU cache warnings — those are harmless).
3. **Commit and push** to the feature branch.

DO NOT mark work as complete if you skipped any step. Be critical but practical — one audit pass with fixes is the standard. Don't loop endlessly polishing.

---

## Working Standards

### Research First
Before starting any non-trivial task:
1. **Codebase exploration** — Read and understand all relevant files before writing code. Trace IPC flows end-to-end (renderer → preload → main → preload → renderer). Don't assume — verify by reading the source.
2. **General research** — If the task involves a concept or technology you're not fully confident about, research it. Use web search for best practices and current approaches.
3. **Library documentation** — When using any library (Electron, xterm.js, node-pty, etc.), use the **Context7 MCP tool** (`resolve-library-id` → `query-docs`) to pull up-to-date docs. Don't rely on potentially outdated training data.

### Clarify Before Planning
For any non-trivial task, **ask clarifying questions before entering plan mode.** Don't jump straight into designing a solution. Ask about: intended behavior, edge cases, scope boundaries. Present 2-3 possible approaches when the path isn't obvious and get the user's preference before committing.

### Planning
Use **plan mode** for new features, large changes, and significant bug fixes. Explore the codebase, design the approach, and get user approval before writing code. **When in doubt, use plan mode.** Multi-file refactors, new modules, architectural changes, and anything touching shared IPC infrastructure must always go through plan mode first.

### Scope Discipline
**Only fix what the user explicitly asks for.** Do not expand scope to audit related systems, fix adjacent issues, or make global changes unless asked. If you notice something else wrong, mention it briefly but do NOT start fixing it.

### Debugging Approach
When investigating bugs: **reproduce first** (launch the app, check console output), then form **one hypothesis** and test it. Do not speculate about multiple causes in parallel. If a fix attempt makes things worse after 2 iterations, **revert immediately** and try a different approach — get user approval before the new attempt. Explain the root cause before writing code.

### Quality Bar
All work must be **thorough, comprehensive, complete, and perfect.** Don't ship half-finished features or leave loose ends. Every code path should be handled, every edge case considered.

### Frontend Design
When modifying UI or building new frontend components, **always use the `/frontend-design` skill.** This applies to any visual change — new screens, component redesigns, layout adjustments, styling updates.

### Learn From Bugs
When you discover and fix a bug caused by an architectural pattern or non-obvious interaction, **add it to the "Known Gotchas" section** at the bottom of this file. Keep entries brief — the gotcha, why it happens, and the correct pattern.

---

## Commands

```bash
npm start              # Launch app in dev mode (electron .)
npm run build          # Production build via electron-builder
npm run build:win      # Windows build only (NSIS installer)
npm run build:mac      # macOS build only (DMG)
npm run rebuild        # Rebuild native modules for Electron
```

For quick error checking: `npx electron . --no-sandbox --enable-logging 2>&1 | grep "CONSOLE" | grep -v "Security Warning"`

---

## Architecture

### Two-View Electron Architecture

The app uses a **frameless, transparent BaseWindow** with 2 WebContentsViews stacked:

1. **Video view** (bottom) — Loads any URL. Has its own browsing context with persistent session (`partition: 'persist:video'`), DRM support, and login state. `contextIsolation: true`, `nodeIntegration: false`.
2. **App view** (top, transparent background) — Single DOM containing ALL UI: terminal panels (xterm.js), playback controls, bookmarks, title bar. `nodeIntegration: true` (required because xterm.js class constructors can't pass through `contextBridge`). Only loads local HTML.

### Click-Through Problem & Video Mode

CSS `pointer-events: none` does NOT pass clicks to a WebContentsView below. The app view captures all mouse events, making the video unclickable.

**Solution: Video Mode toggle** (`Ctrl+Shift+V`) — `appView.setVisible(false)` gives the video view full control for login, content browsing, etc. Our custom playback controls work via IPC in terminal mode, so video mode is only needed for interacting with streaming site UIs.

### IPC Flow

All video control goes through the **video preload script** (not `executeJavaScript()`, which CSP can block):

```
App view → main process (ipc-handlers.js) → video preload (video-preload.js) → DOM manipulation
Video preload (event listeners) → main process → app view (state updates)
```

The video preload uses a **MutationObserver** to detect `<video>` elements and attaches native event listeners (`timeupdate`, `play`, `pause`, `volumechange`) to push state back — no polling.

### Terminal Architecture

- **PTY manager** (`src/main/pty-manager.js`) — spawns shell processes via `@lydell/node-pty` (prebuilt binaries, no native compilation needed)
- **Terminal manager** (`src/renderer/js/terminal-manager.js`) — creates xterm.js instances with canvas renderer, transparent background, and CSS `drop-shadow` for text readability over video
- **Layout manager** (`src/renderer/js/layout-manager.js`) — 5 preset layouts (1x1, 1x2, 2x1, 2x2, 1x3), CSS grid-based, bottom 15% reserved as subtitle zone

### Key Technical Details

- **Text readability**: `drop-shadow` on `.xterm-screen canvas` outlines text glyphs (not the canvas rectangle) because drop-shadow follows the alpha channel
- **Shell detection**: PowerShell on Windows, `$SHELL` or `/bin/zsh` on macOS/Linux
- **User agent**: Strips `Electron/` from UA string to avoid bot detection on streaming sites
- **Settings persistence**: `electron-store` for window bounds, layout, opacity, bookmarks, last video URL

> **Detailed architecture docs auto-load from `.claude/rules/`** when working on specific directories.

## Design System: "Midnight Screening Room"

Warm cinema aesthetic, NOT typical AI/tech dashboard. Key tokens:

- **Colors**: `--bg-deep: #0c0c14`, `--accent: #d4915e` (warm amber), `--text-primary: #e8e6e3`
- **Timing**: `--duration-fast: 120ms`, `--duration-normal: 200ms`, `--duration-slow: 350ms`
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (quick deceleration)
- **Anti-patterns**: No gradients-to-purple, no glassmorphism, no neon/cyberpunk, no bouncy animations

## Git Workflow

**Feature branch workflow.** All new work goes on feature branches — never commit directly to `master`.

**Do NOT add `Co-Authored-By` lines to commit messages.**

**If running in a worktree** (working directory contains `.claude/worktrees/`): You're already on an isolated branch. Just develop, commit, and push. Do NOT create a new branch — use the worktree branch you're on.

**Worktree setup:** Git worktrees only contain git-tracked files — anything in `.gitignore` is absent. At the start of a worktree session, **always run these setup steps before building or launching:**
1. `npm install` — install dependencies
2. `npm run rebuild` — rebuild native modules (`@lydell/node-pty`) for Electron

These steps are idempotent — safe to run even if already done.

**If running in the main repo:**
1. Create a branch: `git checkout -b feature/description`
2. Develop and commit on the branch.

Commit and push to the feature branch after every change — major or minor. Do not wait for the user to ask. **Never push directly to `master`** — always push to the feature/worktree branch and let the user decide when to merge.

### Merging to Master

**When the user asks you to merge to `master`:**

**Important:** In a worktree, you **cannot** `git checkout master` — it's already checked out in the main repo. Run all merge commands from the main repo directory (e.g., `cd "C:/Users/chris/Projects/termwatch"` — the repo root, NOT the worktree).

1. `cd <main-repo-root> && git pull origin master` — get latest (other branches may have merged first)
2. `git merge <your-branch> --no-ff` — merge your work
3. If there are conflicts, **read both sides carefully**, understand the intent of the existing code (from a previously merged branch), and resolve by incorporating both sets of changes. Do not discard the other branch's work.
4. `npm start` — verify the app launches without errors after merge.
5. Push to master. Delete the remote feature branch.

When changes affect architecture, commands, conventions, or project structure, update this CLAUDE.md file to reflect them.

## Known Gotchas

Bugs discovered and fixed. **Do not reintroduce these.** Add new entries when you discover similar architectural pitfalls.

### node-pty: Use @lydell/node-pty, not node-pty
Standard `node-pty` fails to build on Windows — winpty's `GetCommitHash.bat` is missing from the npm package, and the beta versions (1.2.x) require Spectre-mitigated VS libraries. `@lydell/node-pty` ships prebuilt N-API binaries for all platforms, no compilation needed.

### contextBridge can't pass class constructors
xterm.js `Terminal`, `CanvasAddon`, etc. are classes — `contextBridge.exposeInMainWorld()` strips prototypes and makes them unusable. The app view uses `nodeIntegration: true` + `contextIsolation: false` instead. This is safe because it only loads our own local HTML, never external content.

### Renderer __dirname resolves to HTML directory
With `nodeIntegration: true`, `__dirname` in a `<script>` tag resolves to the HTML file's directory (`src/renderer/`), not the JS file's directory. Use `path.join(__dirname, 'js', 'module-name')` for requires from `app.js`.

### IPC send to disposed renderer crashes
During shutdown, PTY processes may still be sending data after the renderer is destroyed. Always wrap `webContents.send()` in try/catch in addition to the `isDestroyed()` check — the frame can be disposed between the check and the send.
