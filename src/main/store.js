const Store = require('electron-store');

const store = new Store({
  defaults: {
    windowBounds: { x: undefined, y: undefined, width: 1280, height: 800 },
    layout: '1x1',
    customPanelSizes: null,
    opacity: 0.65,
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
    isFullscreen: true,
    shellType: 'auto',
  },
});

module.exports = store;
