<div align="center">

# TermWatch

### Code while you watch. Watch while you code.

Transparent terminal panels layered over a full web browser with DRM support.
Run your shell on top of any streaming service — Netflix, YouTube, Twitch, or anything else.

<!-- TODO: Replace with actual screenshot/GIF -->
![Demo](https://via.placeholder.com/800x450.png?text=REPLACE+WITH+DEMO+GIF)

[![GitHub Stars](https://img.shields.io/github/stars/chrismdemian/termwatch?style=flat&logo=github&cacheSeconds=300)](https://github.com/chrismdemian/termwatch)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)](https://github.com/chrismdemian/termwatch/releases)
[![Latest Release](https://img.shields.io/github/v/release/chrismdemian/termwatch?include_prereleases&label=download)](https://github.com/chrismdemian/termwatch/releases/latest)

</div>

---

## Download

Grab the latest installer for your platform — no build tools needed.

| Platform | Download | Notes |
|----------|----------|-------|
| **Windows** | [`.exe` installer](https://github.com/chrismdemian/termwatch/releases/latest) | NSIS wizard, auto-updates built in |
| **macOS** | [`.dmg` installer](https://github.com/chrismdemian/termwatch/releases/latest) | Separate Intel and Apple Silicon builds |

After install, TermWatch checks for updates automatically. When one is available, a badge appears on the settings icon — updates are never downloaded without your consent.

---

## Features

| Feature | Description |
|---------|-------------|
| **Transparent terminals** | Shell panels overlaid on a web browser — adjust opacity, fonts, colors, cursor style |
| **Multiple layouts** | 1x1, 1x2, 2x1, 2x2, 1x3 — cycle with a hotkey |
| **Any shell** | PowerShell, CMD, Git Bash, WSL, zsh, bash, fish — per-terminal selection |
| **DRM streaming** | Widevine support via CastLabs Electron — works with Netflix, Disney+, etc. |
| **Video mode** | Hide terminals, browse and watch with on-screen controls |
| **Theater mode** | Distraction-free — hide the controls bar entirely |
| **Playback controls** | Play/pause, seek, volume, time display — all from keyboard or UI |
| **Bookmarks bar** | Quick-access bookmarks for your favorite sites |
| **Persistent sessions** | Window position, layout, bookmarks, last URL — all restored on launch |
| **Keyboard-driven** | Shortcuts for everything — press `?` to see them all |
| **Auto-updates** | Stable and beta channels with download progress |

---

## Screenshots

### Terminal Overlay

<!-- TODO: Replace with actual screenshot -->
![Terminal Overlay](https://via.placeholder.com/800x500.png?text=REPLACE+WITH+TERMINAL+OVERLAY+SCREENSHOT)

### Video Mode

<!-- TODO: Replace with actual screenshot -->
![Video Mode](https://via.placeholder.com/800x500.png?text=REPLACE+WITH+VIDEO+MODE+SCREENSHOT)

### Settings

<!-- TODO: Replace with actual screenshot -->
![Settings](https://via.placeholder.com/800x400.png?text=REPLACE+WITH+SETTINGS+SCREENSHOT)

---

## How It Works

```
┌─────────────────────────────────────┐
│            BaseWindow               │
│                                     │
│  ┌───────────────────────────────┐  │
│  │    App View (top layer)       │  │
│  │    Transparent background     │  │
│  │    xterm.js terminal panels   │  │
│  │    Controls, bookmarks, UI    │  │
│  ├───────────────────────────────┤  │
│  │    Video View (bottom layer)  │  │
│  │    Full web browser           │  │
│  │    Widevine DRM               │  │
│  │    Isolated session           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

Two `WebContentsView` layers stacked inside a frameless `BaseWindow`:

- **Video view** (bottom) — a full Chromium browser with DRM support, running in its own isolated session. Loads any website.
- **App view** (top) — transparent overlay with xterm.js terminals, playback controls, bookmarks bar, and settings. Communicates with shells via node-pty.

The views never talk directly — all communication routes through IPC in the main process.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show all shortcuts |
| `Ctrl+Shift+,` | Open settings |
| `Escape` | Close modal / exit mode |
| `F11` | Toggle fullscreen |
| `Ctrl+Shift+V` | Toggle video mode |
| `Ctrl+Shift+T` | Toggle theater mode |
| `Ctrl+Shift+Space` | Play / pause video |
| `Ctrl+Shift+1–4` | Focus terminal 1–4 |
| `Ctrl+Shift+L` | Cycle layout |
| `Ctrl+Shift+R` | Restart all terminals |
| `Ctrl+Shift+↑/↓` | Increase / decrease opacity |
| `Ctrl+Shift+B` | Toggle bookmarks bar |
| `Alt+←/→` | Navigate back / forward |

---

## Build from Source

```bash
git clone https://github.com/chrismdemian/termwatch.git
cd termwatch
npm install
npm start
```

### Development

```bash
npm start              # Run the app
npm test               # Unit + integration tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
npm run lint           # ESLint with security plugins
```

### Building Installers

```bash
npm run build:win      # Windows NSIS installer
npm run build:mac      # macOS DMG (universal binary)
```

Tagged pushes trigger automated builds via GitHub Actions — see [release.yml](.github/workflows/release.yml).

---

## Contributing

1. Fork the repo and create a feature branch
2. Make your changes
3. Run `npm run lint` (0 errors) and `npm test` (all passing)
4. For UI changes, verify with `npm start`
5. Open a pull request

See the full [Architecture Decision Records](docs/adr/) for context on major technical choices.

---

## Legal

- [End User License Agreement](docs/EULA.md)
- [Privacy Policy](docs/PRIVACY.md)
- [Security Policy](SECURITY.md)
- [Third-Party Licenses](THIRD-PARTY-LICENSES.txt)

### Disclaimer

TermWatch is an independent project — **not endorsed by, affiliated with, or sponsored by any streaming service or content provider**.

TermWatch does not bypass, circumvent, or interfere with DRM protections. It uses a legitimately licensed Widevine build. A valid subscription to any streaming service you access is required. Use with streaming services is at your own risk — some providers may consider overlay tools a violation of their Terms of Service.

---

## License

[MIT](LICENSE)

---

<div align="center">

**Your terminal. Your stream. One window.**

[Download](https://github.com/chrismdemian/termwatch/releases/latest) · [Report a Bug](https://github.com/chrismdemian/termwatch/issues) · [Request a Feature](https://github.com/chrismdemian/termwatch/issues)

</div>
