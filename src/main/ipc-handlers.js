const { app, ipcMain, screen, session } = require('electron');
const ptyManager = require('./pty-manager');
const updater = require('./updater');
const store = require('./store');
const log = require('./logger');

/**
 * Check if the IPC sender is the app view (local file://).
 * Rejects messages from the video view or any injected scripts.
 */
function isFromAppView(event) {
  try {
    return (event.senderFrame?.url || '').startsWith('file://');
  } catch {
    return false;
  }
}

let videoView = null;
let appView = null;
let baseWindow = null;
let videoModeActive = false;
let overlayCssKey = null; // key from webContents.insertCSS, used for removal
let startupPauseActive = false;
let startupPauseTimeout = null;

// --- Manual fullscreen simulation ---
// BaseWindow.setFullScreen() silently fails on transparent frameless windows on Windows.
// We simulate fullscreen by saving bounds and resizing to cover the full display.
let manualFullscreen = false;
let savedBounds = null;

function enterFullscreen() {
  if (manualFullscreen || !baseWindow || baseWindow.isDestroyed()) return;
  // Save current bounds for restore
  savedBounds = baseWindow.getBounds();
  const center = { x: savedBounds.x + savedBounds.width / 2, y: savedBounds.y + savedBounds.height / 2 };
  const display = screen.getDisplayNearestPoint(center);
  manualFullscreen = true;
  baseWindow.setBounds(display.bounds);
  store.set('isFullscreen', true);
  notifyFullscreenChanged(true);
}

function leaveFullscreen() {
  if (!manualFullscreen || !baseWindow || baseWindow.isDestroyed()) return;
  manualFullscreen = false;
  if (savedBounds) {
    baseWindow.setBounds(savedBounds);
    savedBounds = null;
  }
  store.set('isFullscreen', false);
  notifyFullscreenChanged(false);
}

function toggleFullscreen() {
  if (manualFullscreen) {
    leaveFullscreen();
  } else {
    enterFullscreen();
  }
}

function isFullscreen() {
  return manualFullscreen;
}

function notifyFullscreenChanged(isFs) {
  try {
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('window:fullscreen-changed', isFs);
    }
  } catch (e) { /* disposed during shutdown */ }
}

function setStartupPause(active) {
  if (active) {
    startupPauseActive = true;
    if (startupPauseTimeout) clearTimeout(startupPauseTimeout);
    startupPauseTimeout = setTimeout(clearStartupPauseMain, 30000);
  } else {
    clearStartupPauseMain();
  }
}

function clearStartupPauseMain() {
  if (!startupPauseActive) return;
  startupPauseActive = false;
  if (startupPauseTimeout) {
    clearTimeout(startupPauseTimeout);
    startupPauseTimeout = null;
  }
  // Unmute video — audio was muted at startup to prevent sound leaking
  // before the autoplay suppression in the preload could pause the video
  if (videoView && !videoView.webContents.isDestroyed()) {
    videoView.webContents.setAudioMuted(false);
  }
}

// Overlay CSS injected via webContents.insertCSS to bypass Trusted Types CSP
const OVERLAY_CSS = `
  #termwatch-vm-toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(12, 12, 20, 0.85);
    color: #e8e6e3;
    padding: 16px 24px;
    border-radius: 8px;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 14px;
    z-index: 2147483647;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.06);
    animation: termwatch-fade 4s ease-out forwards;
    pointer-events: none;
  }
  #termwatch-vm-toast kbd {
    background: #1a1a2e;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
    font-size: 12px;
  }
  @keyframes termwatch-fade {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
    10% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    70% { opacity: 1; }
    100% { opacity: 0; }
  }
  .termwatch-vm-nav,
  .termwatch-vm-control {
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(12, 12, 20, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    z-index: 2147483647;
    opacity: 0;
    transition: opacity 0.2s ease, background 0.15s, color 0.15s, border-color 0.15s;
    pointer-events: none;
  }
  .termwatch-vm-visible .termwatch-vm-nav,
  .termwatch-vm-visible .termwatch-vm-control {
    opacity: 1;
    pointer-events: auto;
  }
  .termwatch-vm-nav:hover,
  .termwatch-vm-control:hover {
    background: rgba(12, 12, 20, 0.9);
    color: #d4915e;
    border-color: rgba(212, 145, 94, 0.4);
  }
  #termwatch-vm-back {
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
  }
  #termwatch-vm-forward {
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
  }
  #termwatch-vm-exit {
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
  }
`;

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
 * Pure variant of selectActiveFrame that accepts a Map and returns the selected ID.
 * Extracted for testability — no side effects.
 */
function _selectActiveFrameFromMap(framesMap) {
  if (!framesMap || framesMap.size === 0) return null;
  if (framesMap.size === 1) return framesMap.keys().next().value;

  let bestId = null;
  let bestDuration = -1;
  for (const [id, info] of framesMap) {
    if (info.duration > bestDuration) {
      bestDuration = info.duration;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * Select the active frame — the one whose video commands should target.
 * Heuristic: longest duration wins (content videos >> ads).
 * With 1 frame, just use it.
 */
function selectActiveFrame() {
  activeFrameId = _selectActiveFrameFromMap(videoFrames);
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

/**
 * Exit video mode from anywhere — main process failsafe.
 * Safe to call even if not in video mode.
 */
function exitVideoMode() {
  if (!appView || !videoView) return;
  if (!videoModeActive) return;
  videoModeActive = false;
  if (!videoView.webContents.isDestroyed()) {
    videoView.webContents.send('video:hide-exit-overlay');
  }
  appView.setVisible(true);
  if (!appView.webContents.isDestroyed()) {
    try {
      appView.webContents.send('video:mode-exited');
    } catch (e) {
      log.warn('View disposed during exitVideoMode:', e.message);
    }
  }
}

/**
 * Set up main-process keyboard handling for video mode.
 * Uses before-input-event on the video view's webContents — fires before the
 * page gets the event, so it works regardless of preload state or page navigation.
 */
function setupVideoModeKeyboard() {
  if (!videoView) return;
  videoView.webContents.on('before-input-event', (event, input) => {
    if (!videoModeActive) return;
    if (input.type !== 'keyDown') return;

    // Ctrl+Shift+V → exit video mode
    if (input.control && input.shift && input.key.toLowerCase() === 'v') {
      event.preventDefault();
      exitVideoMode();
      return;
    }

    // Escape → exit video mode (don't preventDefault — let the page also handle it)
    if (input.key === 'Escape') {
      exitVideoMode();
      return;
    }

    // Alt+Left → go back (browser-like navigation)
    if (input.alt && input.key === 'ArrowLeft') {
      event.preventDefault();
      if (videoView.webContents.canGoBack()) {
        videoView.webContents.goBack();
      }
      return;
    }

    // Alt+Right → go forward
    if (input.alt && input.key === 'ArrowRight') {
      event.preventDefault();
      if (videoView.webContents.canGoForward()) {
        videoView.webContents.goForward();
      }
      return;
    }
  });

  // Re-inject exit overlay after page navigation while in video mode.
  // The preload re-initializes on navigation, losing videoModeActive state.
  // Old insertCSS key is invalid after navigation — clear it so fresh CSS is injected.
  videoView.webContents.on('did-finish-load', () => {
    overlayCssKey = null;
    if (videoModeActive && !videoView.webContents.isDestroyed()) {
      videoView.webContents.send('video:show-exit-overlay');
    }
    // Send startup pause signal to main frame after page load
    if (startupPauseActive && !videoView.webContents.isDestroyed()) {
      videoView.webContents.send('video:pause-autoplay');
    }
  });
}

function register() {
  // --- PTY ---
  ipcMain.handle('pty:get-available-shells', (e) => {
    if (!isFromAppView(e)) return [];
    return ptyManager.getAvailableShells();
  });

  ipcMain.handle('pty:create', (e, { cols, rows, shellId }) => {
    if (!isFromAppView(e)) return null;
    if (typeof cols !== 'number' || typeof rows !== 'number') return null;
    if (cols < 1 || cols > 500 || rows < 1 || rows > 200) return null;
    if (shellId !== undefined && typeof shellId !== 'string') return null;
    // Look up shell by ID (per-terminal shell selection)
    let shell = null;
    let args = null;
    if (shellId && shellId !== 'auto') {
      const shells = ptyManager.getAvailableShells();
      const match = shells.find(s => s.id === shellId);
      if (match) {
        shell = match.command;
        args = match.args;
      }
    }
    log.info(`PTY create requested via IPC: cols=${cols}, rows=${rows}, shellId=${shellId || 'auto'}`);
    const result = ptyManager.createPty(cols, rows, shell, args);
    if (!result) return null;
    const p = ptyManager.getPty(result.id);
    if (p) {
      p.onData((data) => {
        try {
          if (appView && !appView.webContents.isDestroyed()) {
            appView.webContents.send('pty:data', result.id, data);
          }
        } catch (e) {
          log.warn('View disposed during pty:data:', e.message);
        }
      });
      p.onExit(({ exitCode, signal }) => {
        try {
          if (appView && !appView.webContents.isDestroyed()) {
            appView.webContents.send('pty:exit', result.id, exitCode, signal);
          }
        } catch (e) {
          log.warn('View disposed during pty:exit:', e.message);
        }
      });
    }
    return result;
  });

  ipcMain.on('pty:write', (e, id, data) => {
    if (!isFromAppView(e)) return;
    if (typeof id !== 'number' || typeof data !== 'string') return;
    ptyManager.writePty(id, data);
  });

  ipcMain.on('pty:resize', (e, id, cols, rows) => {
    if (!isFromAppView(e)) return;
    if (typeof id !== 'number') return;
    if (typeof cols !== 'number' || typeof rows !== 'number') return;
    if (cols < 1 || cols > 500 || rows < 1 || rows > 200) return;
    ptyManager.resizePty(id, cols, rows);
  });

  ipcMain.on('pty:destroy', (e, id) => {
    if (!isFromAppView(e)) return;
    if (typeof id !== 'number') return;
    ptyManager.destroyPty(id);
  });

  // --- Video frame coordination ---
  ipcMain.on('video:frame-register', (e, { frameId }) => {
    if (!e.senderFrame || e.senderFrame.isDestroyed()) return;
    if (typeof frameId !== 'string' || frameId.length > 50) return;
    log.info(`Video frame registered: ${frameId}`);
    const now = Date.now();
    videoFrames.set(frameId, {
      webFrame: e.senderFrame,
      duration: 0,
      lastUpdate: now,
      registeredAt: now,
    });
    selectActiveFrame();

    // Send startup pause signal to newly registered frame
    if (startupPauseActive && e.senderFrame && !e.senderFrame.isDestroyed()) {
      e.senderFrame.send('video:pause-autoplay');
    }
  });

  ipcMain.on('video:frame-update', (e, { frameId, duration }) => {
    if (typeof frameId !== 'string') return;
    if (duration !== undefined && typeof duration !== 'number') return;
    const info = videoFrames.get(frameId);
    if (info) {
      info.duration = duration || info.duration;
      info.lastUpdate = Date.now();
      selectActiveFrame();
    }
  });

  ipcMain.on('video:frame-deregister', (e, { frameId }) => {
    if (typeof frameId !== 'string') return;
    log.info(`Video frame deregistered: ${frameId}`);
    const wasActive = frameId === activeFrameId;
    videoFrames.delete(frameId);
    if (wasActive) {
      selectActiveFrame();
    }
  });

  // --- Video ---
  ipcMain.on('video:navigate', (e, url) => {
    if (!isFromAppView(e)) return;
    if (typeof url !== 'string' || url.length > 2048) return;
    if (!/^https?:\/\//i.test(url)) return;
    log.info('Video navigate:', url);
    clearStartupPauseMain();
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
    // Clear startup pause on user-initiated playback
    if (cmd.type === 'video:play' || cmd.type === 'video:toggle-play') {
      clearStartupPauseMain();
    }
    // Route command to the active video frame
    if (!sendToActiveFrame(cmd.type, cmd.data)) {
      // Fallback: send to video view's main frame (legacy behavior)
      if (videoView && !videoView.webContents.isDestroyed()) {
        videoView.webContents.send(cmd.type, cmd.data);
      }
    }
  });

  ipcMain.on('video:state', (e, state) => {
    if (!state || typeof state !== 'object') return;
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

    // Suppress forwarding during source transitions when duration is invalid
    if (!isFinite(state.duration) || state.duration <= 0) return;

    if (appView && !appView.webContents.isDestroyed()) {
      // Strip frame metadata before forwarding — app view doesn't need it
      const { frameId, ...cleanState } = state;
      try {
        appView.webContents.send('video:state', cleanState);
      } catch (e) {
        log.warn('View disposed during video:state forward:', e.message);
      }
    }
  });

  // --- Video mode toggle ---
  ipcMain.on('toggle-video-mode', (e, enabled) => {
    if (!isFromAppView(e)) return;
    if (typeof enabled !== 'boolean') return;
    if (!appView || !videoView) return;
    log.info(`Video mode toggled: ${enabled}`);
    videoModeActive = enabled;
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

  // Inject overlay CSS via webContents.insertCSS (bypasses Trusted Types CSP)
  ipcMain.on('video:inject-overlay-css', () => {
    if (!videoView || videoView.webContents.isDestroyed()) return;
    // Remove previous injection if any (prevents accumulation across toggles/navigations)
    if (overlayCssKey) {
      videoView.webContents.removeInsertedCSS(overlayCssKey).catch(() => {});
    }
    videoView.webContents.insertCSS(OVERLAY_CSS)
      .then(key => { overlayCssKey = key; })
      .catch(() => {});
  });

  // Exit video mode — called from video preload's exit button/keyboard, or from main process
  ipcMain.on('video:exit-video-mode', () => {
    exitVideoMode();
  });

  // --- Window controls ---
  ipcMain.on('window:minimize', (e) => {
    if (!isFromAppView(e)) return;
    if (baseWindow) baseWindow.minimize();
  });

  ipcMain.on('window:maximize', (e) => {
    if (!isFromAppView(e)) return;
    if (!baseWindow) return;
    // Exit manual fullscreen first to avoid conflicting window geometry
    if (manualFullscreen) leaveFullscreen();
    if (baseWindow.isMaximized()) {
      baseWindow.unmaximize();
    } else {
      baseWindow.maximize();
    }
  });

  ipcMain.on('window:close', (e) => {
    if (!isFromAppView(e)) return;
    if (baseWindow) baseWindow.close();
  });

  ipcMain.handle('window:is-maximized', (e) => {
    if (!isFromAppView(e)) return false;
    return baseWindow ? baseWindow.isMaximized() : false;
  });

  ipcMain.on('window:toggle-fullscreen', (e) => {
    if (!isFromAppView(e)) return;
    toggleFullscreen();
  });

  ipcMain.handle('window:is-fullscreen', (e) => {
    if (!isFromAppView(e)) return false;
    return manualFullscreen;
  });

  ipcMain.on('window:move-by', (e, dx, dy) => {
    if (!isFromAppView(e)) return;
    if (!baseWindow || baseWindow.isDestroyed()) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const [x, y] = baseWindow.getPosition();
    baseWindow.setPosition(x + dx, y + dy);
  });

  ipcMain.handle('get-platform', (e) => {
    if (!isFromAppView(e)) return null;
    return process.platform;
  });

  // --- Store ---
  ipcMain.handle('store:get', (e, key) => {
    if (!isFromAppView(e)) return undefined;
    if (typeof key !== 'string') return undefined;
    return store.get(key);
  });

  ipcMain.on('store:set', (e, key, value) => {
    if (!isFromAppView(e)) return;
    if (typeof key !== 'string') return;
    log.info(`Store set: ${key}`);
    store.set(key, value);
  });

  // --- Video URL updates (from renderer forwarding navigation events) ---
  ipcMain.on('video:url-updated', (e, url) => {
    if (typeof url !== 'string') return;
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('video:url-updated', url);
    }
  });

  // --- App version ---
  ipcMain.handle('app:get-version', (e) => {
    if (!isFromAppView(e)) return null;
    return app.getVersion();
  });

  // --- Auto-update ---
  ipcMain.handle('app:check-for-updates', (e) => {
    if (!isFromAppView(e)) return;
    updater.checkForUpdates();
  });

  ipcMain.on('app:download-update', (e) => {
    if (!isFromAppView(e)) return;
    updater.downloadUpdate();
  });

  ipcMain.on('app:install-update', (e) => {
    if (!isFromAppView(e)) return;
    updater.installUpdate();
  });

  ipcMain.on('app:set-update-channel', (e, channel) => {
    if (!isFromAppView(e)) return;
    if (channel !== 'latest' && channel !== 'beta') return;
    store.set('updateChannel', channel);
    updater.setChannel(channel);
  });

  // --- Clear all data ---
  ipcMain.handle('app:clear-all-data', async (e) => {
    if (!isFromAppView(e)) return false;
    log.info('Clearing all application data');
    store.clear();
    const videoSession = session.fromPartition('persist:video');
    await videoSession.clearStorageData();
    await videoSession.clearCache();
    return true;
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
  clearStartupPauseMain();
  videoFrames.clear();
  activeFrameId = null;
}

module.exports = { register, setViews, setupVideoModeKeyboard, clearVideoFrames, cleanup, enterFullscreen, leaveFullscreen, toggleFullscreen, isFullscreen, setStartupPause, isFromAppView, _selectActiveFrameFromMap };
