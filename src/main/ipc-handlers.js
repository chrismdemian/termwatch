const { ipcMain, BrowserWindow } = require('electron');
const ptyManager = require('./pty-manager');
const store = require('./store');

let videoView = null;
let appView = null;
let baseWindow = null;

function setViews(video, app, win) {
  videoView = video;
  appView = app;
  baseWindow = win;
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
    if (videoView && !videoView.webContents.isDestroyed()) {
      videoView.webContents.send(cmd.type, cmd.data);
    }
  });

  ipcMain.on('video:state', (e, state) => {
    if (appView && !appView.webContents.isDestroyed()) {
      appView.webContents.send('video:state', state);
    }
  });

  // --- Video mode toggle ---
  ipcMain.on('toggle-video-mode', (e, enabled) => {
    if (!appView || !videoView) return;
    if (enabled) {
      appView.setVisible(false);
    } else {
      appView.setVisible(true);
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
}

module.exports = { register, setViews };
