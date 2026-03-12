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
        });
      }
    } catch (e) {
      log.warn('Failed to notify renderer of update:', e.message);
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

function cleanup() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  autoUpdater = null;
  appViewRef = null;
}

module.exports = { initAutoUpdater, downloadUpdate, installUpdate, cleanup };
