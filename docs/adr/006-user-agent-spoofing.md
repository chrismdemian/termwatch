# ADR-006: Strip Electron Identifier from Video Session User Agent

## Status
Accepted

## Context
Streaming sites (Netflix, YouTube, Hulu, etc.) inspect the HTTP `User-Agent` header and JavaScript `navigator.userAgent` property to detect non-browser clients. Electron appends `Electron/<version>` to the default Chromium user agent string, which these sites use to identify and block Electron apps.

When detected, streaming sites may:
- Serve an "unsupported browser" error page.
- Refuse to initialize their DRM handshake.
- Degrade video quality or disable playback entirely.

Since TermWatch's primary purpose is watching video content behind terminal panels, being blocked by streaming sites is a fundamental usability failure.

## Decision
Strip the `Electron/` token from the user agent string for the video session only. This is applied to the video view's session partition (`persist:video`) so that requests from the video view appear to come from a standard Chrome browser.

The app view's user agent is left unmodified since it only loads local content and never makes external requests.

## Consequences

**Positive:**
- Streaming sites serve their normal web player, enabling video playback.
- DRM handshakes proceed as expected since the site believes it is communicating with Chrome.
- Minimal blast radius — only the video session's user agent is modified, not the entire app.

**Negative:**
- Some sites may detect Electron through other fingerprinting methods beyond the user agent (e.g., `navigator.webdriver`, missing browser APIs, WebGL renderer strings). This decision does not address those vectors.
- User agent spoofing could technically violate some sites' terms of service.
- If Chromium changes its user agent format, the string-stripping logic may need updating.
- Debugging network issues is slightly harder since the real client identity is obscured in server logs.
