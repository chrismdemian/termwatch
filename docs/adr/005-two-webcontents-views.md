# ADR-005: Two Stacked WebContentsViews for Video and App UI

## Status
Accepted

## Context
TermWatch needs to display a web browser for video playback behind transparent terminal panels. This presents two conflicting requirements:

1. **Transparency:** The terminal overlay must have a transparent background so the video beneath is visible. This requires the view's background color to be fully transparent (`#00000000`).
2. **Opacity:** The video view must render web content opaquely — a transparent video view would show the desktop behind it.

A single `WebContentsView` cannot be both transparent and opaque simultaneously. Additionally, there is a security concern: the video view loads arbitrary untrusted web content (streaming sites), while the app view requires `nodeIntegration=true` for xterm.js (see ADR-002). These two security contexts must not share a process or access model.

## Decision
Use two `WebContentsView` instances stacked inside a single `BaseWindow`:

- **Video view (bottom):** `contextIsolation=true`, `nodeIntegration=false`, separate session partition (`persist:video`). Loads untrusted web content. Opaque background.
- **App view (top):** `nodeIntegration=true`, `contextIsolation=false`. Loads only local `file://` HTML. Transparent background (`#00000000`), allowing the video view to show through.

The views are layered with the app view on top. Areas of the app view that are transparent (no terminal panels or UI elements) pass through visually to the video view beneath.

## Consequences

**Positive:**
- Clean security boundary — untrusted web content in the video view cannot access Node.js APIs.
- Separate session partitions mean video site cookies and storage are isolated from the app.
- Transparency compositing works naturally — the OS compositor blends the transparent app view over the opaque video view.
- Each view can be independently resized, hidden, or configured.

**Negative:**
- Communication between views requires IPC through the main process. Direct DOM access across views is impossible.
- Video playback controls (play, pause, fullscreen) must be proxied through the main process since the app view cannot directly interact with the video view's DOM.
- Two renderer processes consume more memory than a single-view architecture.
- Click-through behavior requires careful handling — mouse events on transparent areas of the app view need to reach the video view beneath.
