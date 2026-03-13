# IPC Channel Reference

Complete reference for all IPC channels used in the TermWatch Electron app.

**Directions:**
- **renderer->main** = app view sends to main process
- **main->renderer** = main process sends to app view
- **video->main** = video preload sends to main process
- **main->video** = main process sends to video view (frame-targeted or main frame)

**Methods:**
- **handle/invoke** = request-response (async, returns a value)
- **on/send** = fire-and-forget (no response)

---

## PTY

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `pty:get-available-shells` | renderer->main | handle/invoke | _(none)_ | `Array<{ id: string, name: string, command: string, args?: string[] }>` |
| `pty:create` | renderer->main | handle/invoke | `{ cols: number, rows: number, shellId?: string }` | `{ id: number, pid: number } \| null` |
| `pty:write` | renderer->main | on/send | `id: number, data: string` | _(none)_ |
| `pty:resize` | renderer->main | on/send | `id: number, cols: number, rows: number` | _(none)_ |
| `pty:destroy` | renderer->main | on/send | `id: number` | _(none)_ |
| `pty:data` | main->renderer | on/send | `id: number, data: string` | _(none)_ |
| `pty:exit` | main->renderer | on/send | `id: number, exitCode: number, signal: number` | _(none)_ |

## Video Navigation

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `video:navigate` | renderer->main | on/send | `url: string` | _(none)_ |
| `video:go-back` | renderer->main / video->main | on/send | _(none)_ | _(none)_ |
| `video:go-forward` | renderer->main / video->main | on/send | _(none)_ | _(none)_ |
| `video:url-updated` | video->main, main->renderer | on/send | `url: string` | _(none)_ |

## Video Playback Commands

Sent from app renderer to main via the `video:command` wrapper, then routed by main to the active video frame.

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `video:command` | renderer->main | on/send | `{ type: string, data?: any }` | _(none)_ |
| `video:play` | main->video | on/send | _(none)_ | _(none)_ |
| `video:pause` | main->video | on/send | _(none)_ | _(none)_ |
| `video:toggle-play` | main->video | on/send | _(none)_ | _(none)_ |
| `video:set-volume` | main->video | on/send | `volume: number` (0-1) | _(none)_ |
| `video:seek` | main->video | on/send | `time: number` (seconds) | _(none)_ |
| `video:seek-relative` | main->video | on/send | `delta: number` (seconds) | _(none)_ |
| `video:pause-autoplay` | main->video | on/send | _(none)_ | _(none)_ |

## Video State

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `video:state` | video->main, main->renderer | on/send | `{ currentTime: number, duration: number, paused: boolean, volume: number, muted: boolean, frameId?: string }` | _(none)_ |

The `frameId` field is present on the video->main leg and stripped before forwarding to the renderer.

## Video Frame Coordination

Used by the video preload (potentially multiple iframes) to register/deregister video frames with the main process frame coordinator.

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `video:frame-register` | video->main | on/send | `{ frameId: string }` | _(none)_ |
| `video:frame-update` | video->main | on/send | `{ frameId: string, duration: number }` | _(none)_ |
| `video:frame-deregister` | video->main | on/send | `{ frameId: string }` | _(none)_ |

## Video Mode

Video mode hides the app view and shows the video view fullscreen with an exit overlay.

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `toggle-video-mode` | renderer->main | on/send | `enabled: boolean` | _(none)_ |
| `video:exit-video-mode` | video->main | on/send | _(none)_ | _(none)_ |
| `video:mode-exited` | main->renderer | on/send | _(none)_ | _(none)_ |
| `video:show-exit-overlay` | main->video | on/send | _(none)_ | _(none)_ |
| `video:hide-exit-overlay` | main->video | on/send | _(none)_ | _(none)_ |
| `video:inject-overlay-css` | video->main | on/send | _(none)_ | _(none)_ |

## Window

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `window:minimize` | renderer->main | on/send | _(none)_ | _(none)_ |
| `window:maximize` | renderer->main | on/send | _(none)_ | _(none)_ |
| `window:close` | renderer->main | on/send | _(none)_ | _(none)_ |
| `window:move-by` | renderer->main | on/send | `dx: number, dy: number` | _(none)_ |
| `window:is-maximized` | renderer->main | handle/invoke | _(none)_ | `boolean` |
| `window:is-fullscreen` | renderer->main | handle/invoke | _(none)_ | `boolean` |
| `window:toggle-fullscreen` | renderer->main | on/send | _(none)_ | _(none)_ |
| `window:maximized` | main->renderer | on/send | `isMaximized: boolean` | _(none)_ |
| `window:fullscreen-changed` | main->renderer | on/send | `isFullscreen: boolean` | _(none)_ |
| `get-platform` | renderer->main | handle/invoke | _(none)_ | `string` (`'win32'`, `'darwin'`, `'linux'`) |

## Store

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `store:get` | renderer->main | handle/invoke | `key: string` | `any` |
| `store:set` | renderer->main | on/send | `key: string, value: any` | _(none)_ |
| `app:clear-all-data` | renderer->main | handle/invoke | _(none)_ | `boolean` |

## App / Updates

| Channel | Direction | Method | Payload | Response |
|---------|-----------|--------|---------|----------|
| `app:get-version` | renderer->main | handle/invoke | _(none)_ | `string` (semver) |
| `app:check-for-updates` | renderer->main | handle/invoke | _(none)_ | `void` |
| `app:download-update` | renderer->main | on/send | _(none)_ | _(none)_ |
| `app:install-update` | renderer->main | on/send | _(none)_ | _(none)_ |
| `app:set-update-channel` | renderer->main | on/send | `channel: 'latest' \| 'beta'` | _(none)_ |
| `app:update-available` | main->renderer | on/send | `{ version: string, releaseDate: string, releaseNotes: string \| null }` | _(none)_ |
| `app:update-not-available` | main->renderer | on/send | _(none)_ | _(none)_ |
| `app:download-progress` | main->renderer | on/send | `{ percent: number, bytesPerSecond: number, transferred: number, total: number }` | _(none)_ |
| `app:update-downloaded` | main->renderer | on/send | _(none)_ | _(none)_ |
| `app:update-error` | main->renderer | on/send | `{ message: string }` | _(none)_ |
