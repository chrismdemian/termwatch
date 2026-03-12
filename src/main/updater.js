const { app } = require('electron');
const log = require('./logger');

let autoUpdater = null;
let appViewRef = null;
let checkInterval = null;

function initAutoUpdater(appView) {
  // Skip in development mode
  if (!app.isPackaged) {
    log.info('Auto-updater skipped (not packaged)');
    return;
  }

  try {
    // Lazy-require to avoid errors in dev mode where electron-updater
    // may not find a valid update config
    const { autoUpdater: au } = require('electron-updater');
    autoUpdater = au;
  } catch (e) {
    log.warn('Auto-updater unavailable:', e.message);
    return;
  }

  appViewRef = appView;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = log;

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    try {
      if (appViewRef && !appViewRef.webContents.isDestroyed()) {
        appViewRef.webContents.send('app:update-available', {
          version: info.version,
          releaseDate: info.releaseDate,
          releaseNotes: info.releaseNotes || null,
        });
      }
    } catch (e) {
      log.warn('Failed to notify renderer of update:', e.message);
    }
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No update available');
    try {
      if (appViewRef && !appViewRef.webContents.isDestroyed()) {
        appViewRef.webContents.send('app:update-not-available');
      }
    } catch (e) {
      log.warn('Failed to notify renderer:', e.message);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    try {
      if (appViewRef && !appViewRef.webContents.isDestroyed()) {
        appViewRef.webContents.send('app:download-progress', {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        });
      }
    } catch (e) {
      log.warn('Failed to forward download progress:', e.message);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('Update downloaded');
    try {
      if (appViewRef && !appViewRef.webContents.isDestroyed()) {
        appViewRef.webContents.send('app:update-downloaded');
      }
    } catch (e) {
      log.warn('Failed to notify renderer of download completion:', e.message);
    }
  });

  autoUpdater.on('error', (err) => {
    log.warn('Auto-updater error:', err.message);
    try {
      if (appViewRef && !appViewRef.webContents.isDestroyed()) {
        appViewRef.webContents.send('app:update-error', { message: err.message });
      }
    } catch (e) {
      log.warn('Failed to notify renderer of update error:', e.message);
    }
  });

  // Check 10 seconds after startup
  setTimeout(() => {
    checkForUpdates();
  }, 10000);

  // Check every 6 hours
  checkInterval = setInterval(() => {
    checkForUpdates();
  }, 6 * 60 * 60 * 1000);
}

function checkForUpdates() {
  if (!autoUpdater) return;
  try {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('Update check failed:', err.message);
    });
  } catch (e) {
    log.warn('Update check error:', e.message);
  }
}

function downloadUpdate() {
  if (!autoUpdater) return;
  autoUpdater.downloadUpdate().catch((err) => {
    log.warn('Update download failed:', err.message);
  });
}

function installUpdate() {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall(false, true);
}

function setChannel(channel) {
  if (!autoUpdater) return;
  autoUpdater.channel = channel;
  log.info('Update channel set to:', channel);
}

function cleanup() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  autoUpdater = null;
  appViewRef = null;
}

module.exports = { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, setChannel, cleanup };
