# ADR-002: Enable Node Integration in the App View

## Status
Accepted

## Context
Electron best practice is to run renderer processes with `contextIsolation=true` and expose a limited API via `contextBridge.exposeInMainWorld()`. This prevents renderer code from accessing Node.js APIs directly, reducing the attack surface.

However, TermWatch's app view uses xterm.js for terminal rendering. xterm.js `Terminal` is a class that must be instantiated with `new Terminal()`. The resulting instance holds DOM references, event emitters, and addon objects — none of which can be serialized through `contextBridge`. The structured clone algorithm that `contextBridge` uses cannot handle class constructors, DOM elements, circular references, or addon instances.

Possible alternatives considered:
- **Wrap xterm.js in an IPC layer:** Would require serializing every keystroke, resize event, and screen buffer update across processes. Latency would be unacceptable for interactive terminal use.
- **Use a different terminal library:** No mature alternatives exist that avoid the same serialization problems.

## Decision
The app view runs with `nodeIntegration=true` and `contextIsolation=false`. It loads only local `file://` HTML from the app bundle. The `will-navigate` event handler blocks any navigation to external URLs, preventing the view from ever loading untrusted content.

The video view remains fully isolated (`contextIsolation=true`, `nodeIntegration=false`) since it loads untrusted web content.

## Consequences

**Positive:**
- xterm.js works natively — constructors, addons, and DOM manipulation all function correctly.
- No serialization overhead for terminal I/O, resulting in responsive interactive shells.
- The attack surface is limited because the view only loads local files and external navigation is blocked.

**Negative:**
- Any code running in the app view has full Node.js access. A vulnerability that injects code into this view would have system-level access.
- Must be vigilant about never loading remote content or user-supplied HTML in the app view.
- Deviates from Electron security best practices, which may be flagged by security audits.
