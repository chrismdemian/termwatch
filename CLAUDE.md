# TermWatch — Claude Code Instructions

## Project Overview

Electron desktop app: transparent terminal panels over a web browser video view. Two WebContentsViews stacked — video (bottom, isolated) and app UI (top, transparent with nodeIntegration).

## Architecture

- **Main process:** `src/main/` — index.js (window setup), ipc-handlers.js (all IPC), pty-manager.js (shell spawning), updater.js (auto-updates), store.js (electron-store), logger.js (electron-log)
- **Preload:** `src/preload/` — app-preload.js (terminal/video/window/store APIs), video-preload.js (video detection, frame tracking)
- **Renderer:** `src/renderer/` — app.html + js/ (terminal-manager, layout-manager, settings, controls, bookmarks, hotkeys, titlebar) + css/
- **Tests:** `test/` — main/ (unit), renderer/ (unit, happy-dom), integration/ (mocked IPC), e2e/ (Playwright)
- **Build:** electron-builder.yml, build/ (icons, entitlements, VMP signing)
- **CI:** `.github/workflows/ci.yml` (PR checks), `release.yml` (tagged builds)
- **Scripts:** `scripts/` — generate-licenses.js, generate-icons.js, bump-version.js

## Key Technical Constraints

- `@lydell/node-pty` (not standard node-pty) — prebuilt binaries, no native compilation
- App view uses nodeIntegration=true because xterm.js constructors can't pass through contextBridge
- Video view uses contextIsolation=true, partition='persist:video'
- Frameless transparent window — fullscreen is simulated manually (BaseWindow.setFullScreen fails)
- CastLabs Electron fork for Widevine DRM
- User agent strips "Electron/" to avoid bot detection

## MANDATORY Completion Checklist (DO NOT SKIP)

**REQUIRED for every code change — not optional, not "when you have time", not "if it seems important". Every single time.**

Before considering ANY code change done, you MUST complete ALL of these steps in order:

1. **Run `npm run lint`** (0 errors required) and **`npm test`** (all tests must pass)
2. **Spawn an Opus audit agent** to review all changes for bugs, edge cases, and issues. The agent must classify findings by severity: **Critical** (data loss, crashes, security) — must fix, blocks completion. **Major** (broken functionality, incorrect logic) — should fix. **Minor** (style, naming, small improvements) — fix at your discretion, don't loop on these.
3. For UI changes, verify with `npm start`
4. **Commit and push** to the feature branch.

DO NOT mark work as complete if you skipped any step. Be critical but practical — one audit pass with fixes is the standard. Don't loop endlessly polishing.

## Workflow

### Making Changes
1. Create a worktree or feature branch — never commit directly to master
2. Make changes
3. Complete the **MANDATORY Completion Checklist** above
4. Push to feature branch, merge to master, delete the remote branch

### Commit Messages
- Write like a normal open-source project. Never reference phases, sessions, sprints, or planning milestones.
- Start with a verb: Add, Fix, Update, Remove, Refactor
- Keep subject under 72 chars
- No Co-Authored-By lines

### Releases
1. `npm run version:bump -- patch` (or minor/major)
2. Commit: `git add package.json package-lock.json && git commit -m "Bump version to X.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push origin master --tags`
5. GitHub Actions builds Windows (.exe) and macOS (.dmg) installers automatically

### Bug Fixes
1. Reproduce or understand the issue
2. Write a failing test if possible
3. Fix it
4. Verify lint + tests pass
5. Commit with `Fix <description>`

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Run the app |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright, needs real Electron) |
| `npm run lint` | ESLint with security plugins |
| `npm run build:win` | Build Windows installer |
| `npm run build:mac` | Build macOS installer |
| `npm run licenses` | Regenerate THIRD-PARTY-LICENSES.txt |
| `npm run icons` | Regenerate app icons from build/icon.png |
| `npm run version:bump` | Bump version (patch/minor/major) |

## Testing

- Unit/integration tests mock Electron via `test/setup-electron-mock.js` (patches Module._load)
- Tests run on any OS — no native modules needed
- E2E tests need real Electron + native modules (not in CI)
- Mock electron modules: electron, electron-store, electron-log, electron-updater
