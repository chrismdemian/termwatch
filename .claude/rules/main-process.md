---
paths:
  - "src/main/**"
---

# Main Process Architecture

## Entry Point (`index.js`)

Creates a frameless transparent `BaseWindow` with 2 `WebContentsView`s:
- **Video view** (bottom): persistent session (`persist:video`), contextIsolation on, DRM-ready
- **App view** (top): transparent background (`#00000000`), nodeIntegration on

Both views get `setBounds()` updated on every window resize. Window bounds are saved to electron-store with 1s debounce.

## IPC Handlers (`ipc-handlers.js`)

Central relay between app view and video view. Key patterns:

- **PTY data flow**: `pty:create` (invoke/handle) spawns process, registers `onData` and `onExit` listeners that forward to renderer via `webContents.send()`
- **Video commands**: App view sends `video:command` with `{ type, data }` → relayed to video view's preload
- **Video state**: Video preload sends `video:state` → relayed to app view
- **Always wrap `webContents.send()` in try/catch** — the renderer can be disposed between the `isDestroyed()` check and the actual send

## PTY Manager (`pty-manager.js`)

- Uses `@lydell/node-pty` (prebuilt binaries, falls back to `node-pty`)
- Map of terminal ID → pty process
- Shell detection: `powershell.exe` on Windows, `$SHELL` or `/bin/zsh` on macOS/Linux
- `destroyAll()` called on `app.on('before-quit')` — kills all PTY processes

## Store (`store.js`)

`electron-store` with typed defaults: windowBounds, layout, opacity, bookmarks, lastVideoUrl, subtitleZoneHeight, terminalFontSize.

## Adding New IPC Channels

1. Add the handler in `ipc-handlers.js` (use `ipcMain.handle` for request/response, `ipcMain.on` for fire-and-forget)
2. Expose in `src/preload/app-preload.js` via the appropriate API object
3. Call from renderer JS
