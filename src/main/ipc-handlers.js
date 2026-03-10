const { ipcMain, screen } = require('electron');
const ptyManager = require('./pty-manager');
const store = require('./store');

let videoView = null;
let appView = null;
let baseWindow = null;
let videoModeActive = false;
let overlayCssKey = null; // key from webContents.insertCSS, used for removal

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
      // View disposed during shutdown
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
  });
}

function register() {
  // --- PTY ---
  ipcMain.handle('pty:get-available-shells', () => {
    return ptyManager.getAvailableShells();
  });

  ipcMain.handle('pty:create', (e, { cols, rows, shellId }) => {
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

    // Suppress forwarding during source transitions when duration is invalid
    if (!isFinite(state.duration) || state.duration <= 0) return;

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
  ipcMain.on('window:minimize', () => {
    if (baseWindow) baseWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (!baseWindow) return;
    // Exit manual fullscreen first to avoid conflicting window geometry
    if (manualFullscreen) leaveFullscreen();
    if (baseWindow.isMaximized()) {
      baseWindow.unmaximize();
    } else {
      baseWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    if (baseWindow) baseWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return baseWindow ? baseWindow.isMaximized() : false;
  });

  ipcMain.on('window:toggle-fullscreen', () => {
    toggleFullscreen();
  });

  ipcMain.handle('window:is-fullscreen', () => {
    return manualFullscreen;
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

module.exports = { register, setViews, setupVideoModeKeyboard, clearVideoFrames, cleanup, enterFullscreen, leaveFullscreen, toggleFullscreen, isFullscreen };
