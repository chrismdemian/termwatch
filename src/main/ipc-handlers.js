const { ipcMain } = require('electron');
const ptyManager = require('./pty-manager');
const store = require('./store');

let videoView = null;
let appView = null;
let baseWindow = null;

// --- Frame coordinator state ---
// Tracks which frames have <video> elements, selects the "real" content frame
const videoFrames = new Map(); // frameId → { webFrame, duration, lastUpdate }
let activeFrameId = null;
let staleCleanupInterval = null;

function setViews(video, app, win) {
  videoView = video;
  appView = app;
  baseWindow = win;
}

/**
 * Select the active frame — the one whose video commands should target.
 * Heuristic: longest duration wins (content videos >> ads).
 * With 1 frame, just use it.
 */
function selectActiveFrame() {
  if (videoFrames.size === 0) {
    activeFrameId = null;
    return;
  }
  if (videoFrames.size === 1) {
    activeFrameId = videoFrames.keys().next().value;
    return;
  }

  let bestId = null;
  let bestDuration = -1;
  for (const [id, info] of videoFrames) {
    if (info.duration > bestDuration) {
      bestDuration = info.duration;
      bestId = id;
    }
  }
  activeFrameId = bestId;
}

/**
 * Clear all tracked video frames. Called on full page navigation.
 */
function clearVideoFrames() {
  videoFrames.clear();
  activeFrameId = null;
}

/**
 * Send a command to the active video frame using frame.send().
 * Works for both main frames and subframes.
 */
function sendToActiveFrame(channel, data) {
  if (!activeFrameId) return false;
  const frameInfo = videoFrames.get(activeFrameId);
  if (!frameInfo || !frameInfo.webFrame) return false;

  try {
    if (frameInfo.webFrame.isDestroyed()) {
      videoFrames.delete(activeFrameId);
      selectActiveFrame();
      return false;
    }
    if (data !== undefined) {
      frameInfo.webFrame.send(channel, data);
    } else {
      frameInfo.webFrame.send(channel);
    }
    return true;
  } catch (e) {
    // Frame disposed between check and send
    videoFrames.delete(activeFrameId);
    selectActiveFrame();
    return false;
  }
}

function register() {
  // --- PTY ---
  ipcMain.handle('pty:create', (e, { cols, rows }) => {
    const result = ptyManager.createPty(cols, rows);
    if (!result) return null;
    const p = ptyManager.getPty(result.id);
    if (p) {
      p.onData((data) => {
        try {
          if (appView && !appView.webContents.isDestroyed()) {
            appView.webContents.send('pty:data', result.id, data);
          }
        } catch (e) {
          // View disposed during shutdown
        }
      });
      p.onExit(({ exitCode, signal }) => {
        try {
          if (appView && !appView.webContents.isDestroyed()) {
            appView.webContents.send('pty:exit', result.id, exitCode, signal);
          }
        } catch (e) {
          // View disposed during shutdown
        }
      });
    }
    return result;
  });

  ipcMain.on('pty:write', (e, id, data) => {
    ptyManager.writePty(id, data);
  });

  ipcMain.on('pty:resize', (e, id, cols, rows) => {
    ptyManager.resizePty(id, cols, rows);
  });

  ipcMain.on('pty:destroy', (e, id) => {
    ptyManager.destroyPty(id);
  });

  // --- Video frame coordination ---
  ipcMain.on('video:frame-register', (e, { frameId }) => {
    if (!e.senderFrame || e.senderFrame.isDestroyed()) return;
    const now = Date.now();
    videoFrames.set(frameId, {
      webFrame: e.senderFrame,
      duration: 0,
      lastUpdate: now,
      registeredAt: now,
    });
    selectActiveFrame();
  });

  ipcMain.on('video:frame-update', (e, { frameId, duration }) => {
    const info = videoFrames.get(frameId);
    if (info) {
      info.duration = duration || info.duration;
      info.lastUpdate = Date.now();
      selectActiveFrame();
    }
  });

  ipcMain.on('video:frame-deregister', (e, { frameId }) => {
    const wasActive = frameId === activeFrameId;
    videoFrames.delete(frameId);
    if (wasActive) {
      selectActiveFrame();
    }
  });

  // --- Video ---
  ipcMain.on('video:navigate', (e, url) => {
    if (videoView && !videoView.webContents.isDestroyed()) {
      videoView.webContents.loadURL(url);
    }
  });

  ipcMain.on('video:go-back', () => {
    if (videoView && videoView.webContents.canGoBack()) {
      videoView.webContents.goBack();
    }
  });

  ipcMain.on('video:go-forward', () => {
    if (videoView && videoView.webContents.canGoForward()) {
      videoView.webContents.goForward();
    }
  });

  ipcMain.on('video:command', (e, cmd) => {
    // Route command to the active video frame
    if (!sendToActiveFrame(cmd.type, cmd.data)) {
      // Fallback: send to video view's main frame (legacy behavior)
      if (videoView && !videoView.webContents.isDestroyed()) {
        videoView.webContents.send(cmd.type, cmd.data);
      }
    }
  });

  ipcMain.on('video:state', (e, state) => {
    // Only forward state from the active frame to the app view.
    // Grace period: accept state from any frame that registered in the last 2s
    // and hasn't reported duration yet (content frames may not have become active yet).
    if (state.frameId && state.frameId !== activeFrameId) {
      const info = videoFrames.get(state.frameId);
      const isNewFrame = info && (Date.now() - info.registeredAt < 2000) && info.duration === 0;
      if (!isNewFrame) return;
    }

    // Update duration on the fly (streams may report duration late)
    if (state.frameId && state.duration && isFinite(state.duration)) {
      const info = videoFrames.get(state.frameId);
      if (info) {
        info.duration = state.duration;
        info.lastUpdate = Date.now();
      }
    }

    if (appView && !appView.webContents.isDestroyed()) {
      // Strip frame metadata before forwarding — app view doesn't need it
      const { frameId, ...cleanState } = state;
      try {
        appView.webContents.send('video:state', cleanState);
      } catch (e) {
        // View disposed during shutdown
      }
    }
  });

  // --- Video mode toggle ---
  ipcMain.on('toggle-video-mode', (e, enabled) => {
    if (!appView || !videoView) return;
    if (enabled) {
      appView.setVisible(false);
      // Send overlay show to main frame via webContents.send (main frame only)
      if (!videoView.webContents.isDestroyed()) {
        videoView.webContents.send('video:show-exit-overlay');
      }
    } else {
      if (!videoView.webContents.isDestroyed()) {
        videoView.webContents.send('video:hide-exit-overlay');
      }
      appView.setVisible(true);
    }
  });

  // Exit video mode from the video view's exit button
  ipcMain.on('video:exit-video-mode', () => {
    if (!appView || !videoView) return;
    if (!videoView.webContents.isDestroyed()) {
      videoView.webContents.send('video:hide-exit-overlay');
    }
    appView.setVisible(true);
    if (!appView.webContents.isDestroyed()) {
      try {
        appView.webContents.send('video:mode-exited');
      } catch (e) {
        // View disposed during shutdown
      }
    }
  });

  // --- Window controls ---
  ipcMain.on('window:minimize', () => {
    if (baseWindow) baseWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (baseWindow) {
      if (baseWindow.isMaximized()) {
        baseWindow.unmaximize();
      } else {
        baseWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (baseWindow) baseWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return baseWindow ? baseWindow.isMaximized() : false;
  });

  ipcMain.on('window:toggle-fullscreen', () => {
    if (baseWindow) {
      const newState = !baseWindow.isFullScreen();
      baseWindow.setFullScreen(newState);
      store.set('isFullscreen', newState);
    }
  });

  ipcMain.handle('window:is-fullscreen', () => {
    return baseWindow ? baseWindow.isFullScreen() : false;
  });

  ipcMain.on('window:move-by', (e, dx, dy) => {
    if (!baseWindow || baseWindow.isDestroyed()) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = baseWindow.getPosition();
    baseWindow.setPosition(x + dx, y + dy);
  });

  ipcMain.handle('get-platform', () => process.platform);

  // --- Store ---
  ipcMain.handle('store:get', (e, key) => {
    return store.get(key);
  });

  ipcMain.on('store:set', (e, key, value) => {
    store.set(key, value);
  });

  // --- Video URL updates ---
  ipcMain.on('video:url-updated', (e, url) => {
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('video:url-updated', url);
    }
  });

  // --- Stale frame cleanup ---
  // Remove frames that haven't sent a state update in 10s
  // Map.delete() during for...of iteration is safe per the JS spec
  staleCleanupInterval = setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, info] of videoFrames) {
      try {
        if (info.webFrame.isDestroyed() || now - info.lastUpdate > 10000) {
          videoFrames.delete(id);
          changed = true;
        }
      } catch (e) {
        // Frame reference invalid during shutdown
        videoFrames.delete(id);
        changed = true;
      }
    }
    if (changed) {
      selectActiveFrame();
    }
  }, 5000);
}

/**
 * Stop the stale frame cleanup interval. Called on app shutdown.
 */
function cleanup() {
  if (staleCleanupInterval) {
    clearInterval(staleCleanupInterval);
    staleCleanupInterval = null;
  }
  videoFrames.clear();
  activeFrameId = null;
}

module.exports = { register, setViews, clearVideoFrames, cleanup };
