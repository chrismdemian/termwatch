/**
 * App view preload script.
 * Exposes terminal, video control, window management, and store APIs to the renderer.
 * Runs with nodeIntegration=true and contextIsolation=false, so APIs are assigned
 * directly to the window object.
 * @module app-preload
 */
const { ipcRenderer } = require('electron');

// With nodeIntegration: true and contextIsolation: false,
// we can assign directly to window/global.

/**
 * Terminal management API for creating and controlling pseudo-terminal sessions.
 * @type {object}
 */
window.terminalAPI = {
  createPty: (cols, rows, shellId) => ipcRenderer.invoke('pty:create', { cols, rows, shellId }),
  getAvailableShells: () => ipcRenderer.invoke('pty:get-available-shells'),
  writePty: (id, data) => ipcRenderer.send('pty:write', id, data),
  resizePty: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  destroyPty: (id) => ipcRenderer.send('pty:destroy', id),
  onPtyData: (callback) => {
    const handler = (e, id, data) => callback(id, data);
    ipcRenderer.on('pty:data', handler);
    return () => ipcRenderer.removeListener('pty:data', handler);
  },
  onPtyExit: (callback) => {
    const handler = (e, id, exitCode, signal) => callback(id, exitCode, signal);
    ipcRenderer.on('pty:exit', handler);
    return () => ipcRenderer.removeListener('pty:exit', handler);
  },
};

/**
 * Video playback control API for navigating, playing, seeking, and monitoring state.
 * @type {object}
 */
window.videoControlAPI = {
  navigate: (url) => ipcRenderer.send('video:navigate', url),
  goBack: () => ipcRenderer.send('video:go-back'),
  goForward: () => ipcRenderer.send('video:go-forward'),
  play: () => ipcRenderer.send('video:command', { type: 'video:play' }),
  pause: () => ipcRenderer.send('video:command', { type: 'video:pause' }),
  togglePlay: () => ipcRenderer.send('video:command', { type: 'video:toggle-play' }),
  setVolume: (v) => ipcRenderer.send('video:command', { type: 'video:set-volume', data: v }),
  seek: (t) => ipcRenderer.send('video:command', { type: 'video:seek', data: t }),
  seekRelative: (d) => ipcRenderer.send('video:command', { type: 'video:seek-relative', data: d }),
  onState: (callback) => {
    const handler = (e, state) => callback(state);
    ipcRenderer.on('video:state', handler);
    return () => ipcRenderer.removeListener('video:state', handler);
  },
  onUrlUpdated: (callback) => {
    const handler = (e, url) => callback(url);
    ipcRenderer.on('video:url-updated', handler);
    return () => ipcRenderer.removeListener('video:url-updated', handler);
  },
};

/**
 * Window management API for minimize, maximize, close, move, fullscreen, and video mode.
 * @type {object}
 */
window.windowAPI = {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  moveBy: (dx, dy) => ipcRenderer.send('window:move-by', dx, dy),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  onMaximized: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
  toggleVideoMode: (enabled) => ipcRenderer.send('toggle-video-mode', enabled),
  onVideoModeExited: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('video:mode-exited', handler);
    return () => ipcRenderer.removeListener('video:mode-exited', handler);
  },
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  onFullscreenChanged: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on('window:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', handler);
  },
};

/**
 * Persistent settings store API for reading and writing application preferences.
 * @type {object}
 */
window.storeAPI = {
  get: (key) => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.send('store:set', key, value),
  clearAllData: () => ipcRenderer.invoke('app:clear-all-data'),
};
