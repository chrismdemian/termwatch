const { app, BaseWindow, WebContentsView, session, components } = require('electron');
const path = require('path');
const store = require('./store');
const ipcHandlers = require('./ipc-handlers');
const ptyManager = require('./pty-manager');

// Handle DRM initialization (Castlabs Electron fork)
async function initDRM() {
  try {
    if (components && components.whenReady) {
      await components.whenReady();
      console.log('DRM components ready:', components.status());
    }
  } catch (e) {
    console.log('DRM not available (standard Electron):', e.message);
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

  // Set initial bounds
  updateViewBounds();

  // Register IPC handlers
  ipcHandlers.setViews(videoView, appView, baseWindow);
  ipcHandlers.register();

  // Load content
  const lastUrl = store.get('lastVideoUrl');
  if (lastUrl) {
    videoView.webContents.loadURL(lastUrl);
  } else {
    videoView.webContents.loadFile(
      path.join(__dirname, '..', 'renderer', 'video.html')
    );
  }
  appView.webContents.loadFile(
    path.join(__dirname, '..', 'renderer', 'app.html')
  );

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

  // Handle fullscreen for video
  videoView.webContents.on('enter-html-full-screen', () => {
    baseWindow.setFullScreen(true);
    updateViewBounds();
  });
  videoView.webContents.on('leave-html-full-screen', () => {
    baseWindow.setFullScreen(false);
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

  // Show when ready
  appView.webContents.once('did-finish-load', () => {
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
    if (baseWindow && !baseWindow.isDestroyed()) {
      const bounds = baseWindow.getBounds();
      store.set('windowBounds', bounds);
    }
  }, 1000);
}

app.whenReady().then(async () => {
  await initDRM();

  // Set user agent to avoid bot detection on streaming sites
  const defaultSession = session.fromPartition('persist:video');
  const ua = defaultSession.getUserAgent().replace(/Electron\/\S+\s/, '');
  defaultSession.setUserAgent(ua);

  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  ipcHandlers.cleanup();
  ptyManager.destroyAll();
});
