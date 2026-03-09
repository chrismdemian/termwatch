---
paths:
  - "src/renderer/**"
---

# Renderer Architecture

The app view is a single HTML page (`app.html`) with all UI in one DOM. No framework — vanilla JS with class-based modules loaded via `require()` (nodeIntegration is on).

## Module Structure

All JS modules are in `src/renderer/js/` and loaded from `app.js` (the entry point). Because `__dirname` resolves to the HTML file's directory, `app.js` uses `path.join(__dirname, 'js', 'module-name')` for requires.

### Modules

- **terminal-manager.js** — Creates/destroys xterm.js instances. Each terminal: `Terminal` + `CanvasAddon` + `FitAddon` + `WebLinksAddon`. Handles PTY data routing, focus tracking, resize via `ResizeObserver`, and PTY exit overlays.
- **layout-manager.js** — CSS grid presets (1x1, 1x2, 2x1, 2x2, 1x3). Bottom 15% is subtitle zone. Creates/destroys terminal panels when switching layouts.
- **controls.js** — Playback bar: URL input, back/forward, play/pause, seek, volume, opacity slider, layout selector. Receives video state via `videoControlAPI.onState()`. Auto-hides after 3s idle.
- **bookmarks.js** — CRUD for bookmarks stored in electron-store. Favicon fetching via `${origin}/favicon.ico`. Right-click to remove.
- **hotkeys.js** — Global keyboard shortcuts. Manages video mode and theater mode state. Skips hotkeys when URL input is focused.
- **titlebar.js** — Custom window chrome. Hides custom buttons on macOS (uses native traffic lights). Tracks maximize state for icon swap.
- **settings.js** — Load/save user preferences. Sets up layout change listener.

## CSS Architecture

4 CSS files with design tokens in `app.css`:

- `app.css` — CSS custom properties (design system), layout, titlebar, theater mode
- `terminal.css` — Panel styling, drop-shadow on canvas, resize dividers, PTY exit overlay
- `controls.css` — Controls bar, sliders, URL input, buttons
- `bookmarks.css` — Bookmark bar, favicon circles, pop/remove animations

## Design System: "Midnight Screening Room"

**Warm cinema aesthetic.** Key rules:
- Never pure black (#000) — use `--bg-deep: #0c0c14` (deep warm blue)
- Accent color: `--accent: #d4915e` (warm amber/copper) — evokes film projection light
- No gradients-to-purple, no glassmorphism, no neon
- Animations: purposeful and quick, never bouncy or decorative
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` — quick deceleration, feels snappy
- No bold in UI text except headings
- Panel gaps: 4px (tight, maximizes terminal space)

## Adding a New UI Component

1. Add HTML to `app.html`
2. Add styles to the appropriate CSS file (or create a new one and link it)
3. Add JS module in `src/renderer/js/`, export a class
4. Import and initialize in `app.js`
5. If it needs IPC: add to preload API → add handler in main process
