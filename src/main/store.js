const Store = require('electron-store');

const store = new Store({
  defaults: {
    windowBounds: { x: undefined, y: undefined, width: 1280, height: 800 },
    layout: '1x1',
    customPanelSizes: null,
    opacity: 0.5,
    shadowIntensity: 1.0,
    bookmarks: [],
    lastVideoUrl: '',
    subtitleZoneHeight: 15,
    terminalFontSize: 14,
    isFullscreen: true,
  },
});

module.exports = store;
