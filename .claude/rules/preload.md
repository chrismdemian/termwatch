---
paths:
  - "src/preload/**"
---

# Preload Scripts

Two preload scripts with fundamentally different security models:

## App Preload (`app-preload.js`)

Runs with `nodeIntegration: true`, `contextIsolation: false`. Assigns directly to `window.*` (not `contextBridge`). This is safe because the app view only loads our local HTML.

Exposes 4 API objects:
- **`window.terminalAPI`** — PTY lifecycle (create, write, resize, destroy) + event listeners (onPtyData, onPtyExit)
- **`window.videoControlAPI`** — Video navigation (navigate, back, forward) + playback (play, pause, volume, seek) + state listener (onState, onUrlUpdated)
- **`window.windowAPI`** — Window chrome (minimize, maximize, close) + video mode toggle + platform detection
- **`window.storeAPI`** — Persistent settings (get/set via electron-store)

## Video Preload (`video-preload.js`)

Runs with `contextIsolation: true`, `nodeIntegration: false`. Uses `contextBridge` for the minimal API it exposes. This view loads untrusted external websites.

**Critical: Video control via DOM manipulation, not `executeJavaScript()`**

The preload script runs before the page's CSP is applied. It:
1. Uses `MutationObserver` on `document.body` to detect `<video>` elements
2. Attaches native event listeners (`timeupdate`, `play`, `pause`, `volumechange`) to push state via `ipcRenderer.send()`
3. Listens for IPC commands (`video:play`, `video:pause`, `video:set-volume`, `video:seek`) and manipulates the video DOM element directly

**Why this works**: DOM API calls from a preload script are not subject to CSP restrictions. `executeJavaScript()` from the main process IS subject to CSP, which streaming sites block.

## Adding New IPC Channels

1. For app-side: add to the appropriate `window.*API` object in `app-preload.js`
2. For video-side: add `ipcRenderer.on()` listener in `video-preload.js`
3. Add the handler in `src/main/ipc-handlers.js`
