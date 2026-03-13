# ADR-004: Simulate Fullscreen Instead of Using Native Fullscreen API

## Status
Accepted

## Context
TermWatch uses a transparent, frameless `BaseWindow` to achieve the overlay effect where terminal panels float over video content. The window has `transparent: true` and `frame: false` set at creation time.

On Windows, calling `BaseWindow.setFullScreen(true)` on a transparent window silently fails — the window does not actually enter fullscreen mode. This appears to be a Chromium/Windows compositor limitation: the DWM (Desktop Window Manager) cannot composite a transparent window in exclusive fullscreen mode. The call returns without error, but the window dimensions and state do not change.

This is not an issue on macOS, but a cross-platform solution is needed for consistency.

## Decision
Simulate fullscreen by:
1. Saving the current window bounds (position and size).
2. Querying the display that contains the window via `screen.getDisplayNearestPoint()`.
3. Resizing the window to cover the full display work area.
4. Tracking fullscreen state manually in the main process.
5. Notifying the renderer of state changes via IPC.

Restoring from fullscreen reverses the process by applying the saved bounds.

## Consequences

**Positive:**
- Works reliably on transparent windows across both Windows and macOS.
- Consistent behavior on all platforms — no platform-specific fullscreen code paths.
- The window visually covers the entire screen, achieving the desired effect.

**Negative:**
- No native fullscreen events fire (e.g., `enter-full-screen`, `leave-full-screen` on BrowserWindow), so state must be tracked manually.
- The taskbar/dock may remain visible depending on OS settings, since the window is not in true exclusive fullscreen.
- Other windows can still draw on top, unlike native fullscreen which gets its own compositing layer.
- Must handle multi-monitor scenarios carefully — the "nearest display" heuristic may not match user expectations if the window spans monitors.
