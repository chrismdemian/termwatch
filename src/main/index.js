// Logger MUST be imported first — initializes IPC forwarding for renderers
const log = require('./logger');

const { app, BaseWindow, WebContentsView, session, components, nativeTheme } = require('electron');
const path = require('path');
const store = require('./store');
const ipcHandlers = require('./ipc-handlers');
const ptyManager = require('./pty-manager');
const updater = require('./updater');

// Force dark theme for native Chromium UI (color picker, input spinners, etc.)
nativeTheme.themeSource = 'dark';

// GPU setting check — must run before app.whenReady()
if (store.get('disableHardwareAcceleration')) {
  log.info('Hardware acceleration disabled by user setting');
  app.disableHardwareAcceleration();
}

// Global exception handlers
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection:', reason);
});

// Handle DRM initialization (Castlabs Electron fork)
async function initDRM() {
  try {
    if (components && components.whenReady) {
      await components.whenReady();
      log.info('DRM components ready:', components.status());
    }
  } catch (e) {
    log.info('DRM not available (standard Electron):', e.message);
  }
}

let baseWindow = null;
let videoView = null;
let appView = null;

function createWindow() {
  const bounds = store.get('windowBounds');

  baseWindow = new BaseWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    minWidth: 800,
    minHeight: 600,
    show: false,
  });

  // --- Video view (bottom layer) ---
  videoView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'video-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      sandbox: false,
      partition: 'persist:video',
    },
  });
  baseWindow.contentView.addChildView(videoView);

  // --- App view (top layer, transparent) ---
  // nodeIntegration enabled because this view only loads our own local HTML
  // and needs access to xterm.js npm modules (class constructors can't pass through contextBridge)
  appView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'app-preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
    },
  });
  appView.setBackgroundColor('#00000000');
  baseWindow.contentView.addChildView(appView);

  log.info('Window created');

  // Crash recovery for app view
  appView.webContents.on('render-process-gone', (event, details) => {
    log.error('App view render process gone:', details.reason, 'exitCode:', details.exitCode);
    if (details.reason !== 'clean-exit') {
      log.info('Reloading app view after crash');
      appView.webContents.reload();
    }
  });

  // Crash recovery for video view
  videoView.webContents.on('render-process-gone', (event, details) => {
    log.error('Video view render process gone:', details.reason, 'exitCode:', details.exitCode);
    if (details.reason !== 'clean-exit') {
      const lastUrl = store.get('lastVideoUrl');
      if (lastUrl) {
        log.info('Reloading video view with last URL:', lastUrl);
        videoView.webContents.loadURL(lastUrl);
      }
    }
  });

  // Prevent app view from navigating to external URLs (defense-in-depth:
  // nodeIntegration=true means any page it navigates to gets full Node.js access)
  appView.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });
  appView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Set initial bounds
  updateViewBounds();

  // Register IPC handlers
  ipcHandlers.setViews(videoView, appView, baseWindow);
  ipcHandlers.register();
  ipcHandlers.setupVideoModeKeyboard();

  // Load content
  const lastUrl = store.get('lastVideoUrl');
  if (lastUrl) {
    videoView.webContents.setAudioMuted(true);
    videoView.webContents.loadURL(lastUrl);
    ipcHandlers.setStartupPause(true);
    log.info('Video view loaded with saved URL:', lastUrl);
  } else {
    videoView.webContents.loadFile(
      path.join(__dirname, '..', 'renderer', 'video.html')
    );
    log.info('Video view loaded with default page');
  }
  appView.webContents.loadFile(
    path.join(__dirname, '..', 'renderer', 'app.html')
  );
  log.info('App view loaded');

  // Initialize auto-updater
  updater.initAutoUpdater(appView);

  // Handle video view navigation events
  videoView.webContents.on('did-navigate', (e, url) => {
    ipcHandlers.clearVideoFrames();
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('video:url-updated', url);
    }
    store.set('lastVideoUrl', url);
  });
  videoView.webContents.on('did-navigate-in-page', (e, url) => {
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('video:url-updated', url);
    }
    store.set('lastVideoUrl', url);
  });

  // Handle new window requests (OAuth popups etc.)
  videoView.webContents.setWindowOpenHandler(({ url }) => {
    openAuthPopup(url);
    return { action: 'deny' };
  });

  // Handle fullscreen for video (decouple from app fullscreen)
  let videoTriggeredFullscreen = false;
  videoView.webContents.on('enter-html-full-screen', () => {
    if (!ipcHandlers.isFullscreen()) {
      videoTriggeredFullscreen = true;
      ipcHandlers.enterFullscreen();
    }
    updateViewBounds();
  });
  videoView.webContents.on('leave-html-full-screen', () => {
    if (videoTriggeredFullscreen) {
      videoTriggeredFullscreen = false;
      ipcHandlers.leaveFullscreen();
    }
    updateViewBounds();
  });

  // Resize handler
  baseWindow.on('resize', () => {
    updateViewBounds();
    saveBoundsDebounced();
  });
  baseWindow.on('move', () => {
    saveBoundsDebounced();
  });

  // Fullscreen state is forwarded to renderer by ipcHandlers.notifyFullscreenChanged()
  // (native enter-full-screen/leave-full-screen events don't fire for manual fullscreen)

  // Catch F11 before renderer/xterm processes it
  appView.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault();
      ipcHandlers.toggleFullscreen();
    }
  });

  // Show when ready (fullscreen before show if preferred)
  appView.webContents.once('did-finish-load', () => {
    if (store.get('isFullscreen')) {
      ipcHandlers.enterFullscreen();
    }
    baseWindow.show();
  });

  // Maximize state change
  baseWindow.on('maximize', () => {
    appView.webContents.send('window:maximized', true);
  });
  baseWindow.on('unmaximize', () => {
    appView.webContents.send('window:maximized', false);
  });
}

function openAuthPopup(url) {
  // Only allow http/https URLs for security
  if (!/^https?:\/\//i.test(url)) return;

  const popup = new BaseWindow({
    width: 600,
    height: 700,
    parent: baseWindow,
    title: 'Sign In',
  });
  const popupView = new WebContentsView({
    webPreferences: {
      partition: 'persist:video',
    },
  });
  popup.contentView.addChildView(popupView);

  const updatePopupBounds = () => {
    const { width, height } = popup.getContentBounds();
    popupView.setBounds({ x: 0, y: 0, width, height });
  };
  updatePopupBounds();
  popup.on('resize', updatePopupBounds);

  // Clean up WebContentsView when popup is closed to prevent leaks
  popup.on('closed', () => {
    popupView.webContents.close();
  });

  // Use the same spoofed user agent so Google/OAuth doesn't block us
  const videoSession = session.fromPartition('persist:video');
  popupView.webContents.setUserAgent(videoSession.getUserAgent());

  // Handle nested popups (OAuth flows can chain windows)
  popupView.webContents.setWindowOpenHandler(({ url: nestedUrl }) => {
    if (!/^https?:\/\//i.test(nestedUrl)) return { action: 'deny' };
    popupView.webContents.loadURL(nestedUrl);
    return { action: 'deny' };
  });

  popupView.webContents.loadURL(url);
  popup.show();
}

function updateViewBounds() {
  if (!baseWindow) return;
  const { width, height } = baseWindow.getContentBounds();
  videoView.setBounds({ x: 0, y: 0, width, height });
  appView.setBounds({ x: 0, y: 0, width, height });
}

let boundsTimeout = null;
function saveBoundsDebounced() {
  if (boundsTimeout) clearTimeout(boundsTimeout);
  boundsTimeout = setTimeout(() => {
    if (baseWindow && !baseWindow.isDestroyed() && !ipcHandlers.isFullscreen()) {
      const bounds = baseWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  }, 1000);
}

app.whenReady().then(async () => {
  await initDRM();

  // Set user agent to avoid bot detection on streaming sites
  const videoSession = session.fromPartition('persist:video');
  const ua = videoSession.getUserAgent().replace(/Electron\/\S+\s/, '');
  videoSession.setUserAgent(ua);

  // Permission handlers for video session — only allow what streaming sites need
  const ALLOWED_PERMISSIONS = new Set([
    'media',                    // Camera/mic
    'mediaKeySystem',           // DRM (Widevine) — critical for streaming
    'fullscreen',               // HTML5 fullscreen API
    'pointerLock',              // Mouse capture (some video players)
    'clipboard-sanitized-write', // Allow sites to copy to clipboard
    'window-placement',         // Multi-monitor fullscreen
  ]);

  videoSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  videoSession.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  // GPU/child process crash handler
  app.on('child-process-gone', (event, details) => {
    log.error(`Child process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`);
  });

  createWindow();
});

// Shutdown sequence
let isShuttingDown = false;

app.on('before-quit', async (event) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  event.preventDefault();

  log.info('Shutdown sequence started');

  // Save window bounds
  if (baseWindow && !baseWindow.isDestroyed() && !ipcHandlers.isFullscreen()) {
    const bounds = baseWindow.getBounds();
    store.set('windowBounds', bounds);
  }

  // Clean up IPC handlers and intervals
  ipcHandlers.cleanup();
  updater.cleanup();

  // Destroy all PTY processes with timeout
  try {
    await Promise.race([
      ptyManager.destroyAll(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PTY cleanup timeout')), 5000)),
    ]);
    log.info('PTY cleanup completed');
  } catch (e) {
    log.warn('PTY cleanup timed out, force killing');
    ptyManager.forceKillAll();
  }

  log.info('Shutdown sequence complete');
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

// Last-resort synchronous cleanup on process exit
process.on('exit', () => {
  ptyManager.forceKillAll();
});
