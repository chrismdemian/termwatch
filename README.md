# TermWatch

Watch video content behind transparent terminal panels. An Electron desktop app that layers terminal emulators over a web browser, so you can code (or pretend to) while watching videos.

## Features

**Terminal Overlay**
- Transparent terminal panels overlaid on a web browser video view
- Multiple layouts: 1x1, 1x2, 2x1, 2x2, 1x3
- Per-terminal shell selection (PowerShell, CMD, Git Bash, WSL, zsh, bash, fish)
- Adjustable opacity, text shadow, fonts, colors, and cursor styles

**Video Browser**
- Full web browser with navigation, bookmarks bar, and URL input
- DRM support via CastLabs Electron (Widevine) for streaming services
- Video mode: hide terminals and browse with on-screen navigation controls
- Theater mode: hide the controls bar for distraction-free viewing
- Playback controls: play/pause, seek, volume, time display

**Quality of Life**
- Persistent sessions — window position, layout, bookmarks, and last URL restored on launch
- Keyboard shortcuts for everything (press `?` in the app to see them all)
- First-run EULA and privacy acknowledgment
- Auto-updates with download progress and channel selection (stable/beta)
- Fullscreen mode with window controls in the controls bar

## Installation

### Windows

Download the latest `.exe` installer from [Releases](https://github.com/nicholasgriffintn/termwatch/releases). Run the installer — auto-updates are built in.

### macOS

Download the latest `.dmg` from [Releases](https://github.com/nicholasgriffintn/termwatch/releases). Drag TermWatch to Applications.

### From Source

```bash
git clone https://github.com/nicholasgriffintn/termwatch.git
cd termwatch
npm install
npm start
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts |
| `Ctrl+Shift+,` | Open settings |
| `Escape` | Close modal / exit mode |
| `F11` | Toggle fullscreen |
| `Ctrl+Shift+V` | Toggle video mode |
| `Ctrl+Shift+T` | Toggle theater mode |
| `Ctrl+Shift+Space` | Play / pause video |
| `Ctrl+Shift+1–4` | Focus terminal 1–4 |
| `Ctrl+Shift+L` | Cycle layout |
| `Ctrl+Shift+R` | Restart all terminals |
| `Ctrl+Shift+↑` | Increase opacity |
| `Ctrl+Shift+↓` | Decrease opacity |
| `Ctrl+Shift+B` | Toggle bookmarks bar |
| `Alt+←` | Go back (video mode) |
| `Alt+→` | Go forward (video mode) |

## Settings Reference

All settings are persisted locally via `electron-store`.

| Setting | Default | Description |
|---------|---------|-------------|
| `opacity` | `0.3` | Terminal background opacity (0–1) |
| `shadowIntensity` | `1.0` | Text shadow intensity (0–1) |
| `terminalFontSize` | `14` | Terminal font size (8–32) |
| `terminalFontFamily` | `JetBrains Mono` | Terminal font family |
| `terminalTextColor` | `#e8e6e3` | Terminal foreground color |
| `terminalSelectionColor` | `#d4915e` | Terminal selection highlight color |
| `terminalCursorStyle` | `bar` | Cursor style: block, underline, or bar |
| `terminalCursorBlink` | `true` | Whether the cursor blinks |
| `terminalScrollback` | `1000` | Scrollback buffer lines (100–50000) |
| `autoHideDelay` | `3000` | Controls bar auto-hide delay in ms (0 = disabled) |
| `defaultLayout` | `1x1` | Layout used on first launch |
| `startInVideoMode` | `false` | Start directly in video mode |
| `disableHardwareAcceleration` | `false` | Disable GPU acceleration (requires restart) |
| `updateChannel` | `latest` | Update channel: `latest` (stable) or `beta` |
| `shellConfig` | `{}` | Per-layout, per-terminal shell selection |

## Architecture

TermWatch uses two stacked `WebContentsView` instances inside a `BaseWindow`:

```
┌─────────────────────────────────┐
│         BaseWindow              │
│  ┌───────────────────────────┐  │
│  │  App View (top layer)     │  │
│  │  - Transparent background │  │
│  │  - Terminal panels (xterm) │  │
│  │  - Controls bar           │  │
│  │  - nodeIntegration: true  │  │
│  ├───────────────────────────┤  │
│  │  Video View (bottom layer)│  │
│  │  - Web browser            │  │
│  │  - contextIsolation: true │  │
│  │  - Widevine DRM           │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Main Process** (`src/main/`) — Window creation, IPC routing, PTY management, auto-updates, persistent storage.

**Preload Scripts** (`src/preload/`) — Bridge between renderer and main process. App preload exposes `terminalAPI`, `videoControlAPI`, `windowAPI`, `storeAPI`. Video preload detects `<video>` elements and proxies playback commands.

**Renderer** (`src/renderer/`) — Terminal UI (xterm.js), layout management, settings modal, controls bar, bookmarks, hotkeys, help modal, first-run wizard.

IPC communication flows through the main process — the app view never communicates directly with the video view. See [docs/IPC-CHANNELS.md](docs/IPC-CHANNELS.md) for the full channel reference.

## Development

```bash
npm start          # Run the app
npm test           # Run unit/integration tests (Vitest)
npm run test:e2e   # Run Playwright E2E tests
npm run lint       # Lint source code
npm run licenses   # Generate THIRD-PARTY-LICENSES.txt
npm run icons      # Regenerate app icons from SVG
npm run version:bump -- patch  # Bump version (patch/minor/major)
```

## Building

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

Built releases are created by GitHub Actions on tagged pushes. See `.github/workflows/release.yml`.

## Contributing

1. Create a feature branch — never commit directly to master
2. Make changes
3. Run `npm run lint` (0 errors required) and `npm test` (all tests pass)
4. For UI changes, verify with `npm start`
5. Push to feature branch and open a PR

**Code style:**
- ESLint with security plugins — no lint errors allowed
- CommonJS modules in main/preload/renderer (nodeIntegration app)
- CSS custom properties for all colors, timing, and easing (see `src/renderer/css/app.css`)
- Tests use Vitest with happy-dom for renderer tests

## Auto-Updates

Built releases check for updates automatically. When an update is available, an indicator appears on the settings gear icon. Updates are never downloaded without user consent — click Download in the settings modal to proceed.

## Third-Party Licenses

Production dependency licenses are listed in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). Regenerate with `npm run licenses`.

## Legal

- [End User License Agreement](docs/EULA.md)
- [Privacy Policy](docs/PRIVACY.md)
- [MIT License](LICENSE)
- [Security Policy](SECURITY.md)

## Disclaimer

TermWatch is an independent project and is **not endorsed by, affiliated with, or sponsored by any streaming service or content provider**.

**DRM:** TermWatch does not bypass, circumvent, decrypt, or interfere with digital rights management (DRM) protections. It uses a legitimately licensed Widevine build. A valid subscription to any streaming service you access is required.

**Streaming Services:** Use of TermWatch with streaming services is at your own risk. Some streaming services may consider overlay tools or modified user agents a violation of their Terms of Service. You are solely responsible for complying with the Terms of Service of any service you access through TermWatch.

**No Warranty:** This software is provided "as is" without warranty of any kind. See the [MIT License](LICENSE) for full terms.

## License

[MIT](LICENSE)
