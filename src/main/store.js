const Store = require('electron-store');

// Note: This store is unencrypted JSON on disk. If sensitive data (API keys,
// tokens) needs to be stored in the future, use Electron's safeStorage API.

const store = new Store({
  defaults: {
    windowBounds: { x: undefined, y: undefined, width: 1280, height: 800 },
    layout: '1x1',
    customPanelSizes: null,
    opacity: 0.3,
    shadowIntensity: 1.0,
    bookmarks: [],
    lastVideoUrl: '',
    subtitleZoneHeight: 15,
    terminalFontSize: 14,
    terminalFontFamily: "'JetBrains Mono', monospace",
    terminalTextColor: '#e8e6e3',
    terminalSelectionColor: '#d4915e',
    terminalCursorStyle: 'bar',
    terminalCursorBlink: true,
    terminalScrollback: 1000,
    autoHideDelay: 3000,
    defaultLayout: '1x1',
    startInVideoMode: false,
    disableHardwareAcceleration: false,
    isFullscreen: true,
    shellConfig: {},
  },
});

module.exports = store;
