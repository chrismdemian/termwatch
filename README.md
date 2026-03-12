# TermWatch

Watch video content behind transparent terminal panels. An Electron desktop app that layers terminal emulators over a web browser, so you can code (or pretend to) while watching videos.

## Features

- Transparent terminal panels overlaid on a video view
- Multiple terminal layouts with resizable panels
- Per-terminal shell selection (PowerShell, CMD, Git Bash, WSL, etc.)
- Bookmarks bar for quick site navigation
- Adjustable opacity, fonts, and color themes
- DRM support via CastLabs Electron (Widevine)
- Persistent sessions and layout preferences

## Getting Started

```bash
# Install dependencies
npm install

# Run the app
npm start
```

## Development

```bash
npm start          # Run the app
npm test           # Run unit/integration tests
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

## Auto-Updates

Built releases check for updates automatically. When an update is available, an indicator appears on the settings gear icon. Updates are never downloaded without user consent — click Download in the settings modal to proceed.

## Third-Party Licenses

Production dependency licenses are listed in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). Regenerate with `npm run licenses`.

## Disclaimer

TermWatch is an independent project and is **not endorsed by, affiliated with, or sponsored by any streaming service or content provider**.

**DRM:** TermWatch does not bypass, circumvent, decrypt, or interfere with digital rights management (DRM) protections. It uses a legitimately licensed Widevine build. A valid subscription to any streaming service you access is required.

**Streaming Services:** Use of TermWatch with streaming services is at your own risk. Some streaming services may consider overlay tools or modified user agents a violation of their Terms of Service. You are solely responsible for complying with the Terms of Service of any service you access through TermWatch.

**No Warranty:** This software is provided "as is" without warranty of any kind. See the [MIT License](LICENSE) for full terms.

## License

[MIT](LICENSE)
