const { app } = require('electron');
const log = require('./logger');

let autoUpdater = null;
let appViewRef = null;
let checkInterval = null;
let consecutiveFailures = 0;
let retryTimeout = null;

/**
 * Initialize the auto-updater and wire up event forwarding to the renderer.
 * Skipped in development mode. Schedules periodic update checks.
 * @param {Electron.WebContentsView} appView - The app view to send update events to
 */
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

/**
 * Check for available updates. Schedules a retry on failure.
 */
function checkForUpdates() {
  if (!autoUpdater) return;
  try {
    autoUpdater.checkForUpdates()
      .then(() => {
        consecutiveFailures = 0;
      })
      .catch((err) => {
        log.warn('Update check failed:', err.message);
        scheduleRetry();
      });
  } catch (e) {
    log.warn('Update check error:', e.message);
    scheduleRetry();
  }
}

/**
 * Schedule a retry after a failed update check.
 * Retries up to 3 times with 30-minute intervals.
 */
function scheduleRetry() {
  if (retryTimeout) clearTimeout(retryTimeout);
  consecutiveFailures++;
  if (consecutiveFailures <= 3) {
    log.info(`Scheduling update retry ${consecutiveFailures}/3 in 30 minutes`);
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      checkForUpdates();
    }, 30 * 60 * 1000);
  }
}

/**
 * Start downloading the available update.
 */
function downloadUpdate() {
  if (!autoUpdater) return;
  autoUpdater.downloadUpdate().catch((err) => {
    log.warn('Update download failed:', err.message);
  });
}

/**
 * Quit the app and install the downloaded update.
 */
function installUpdate() {
  if (!autoUpdater) return;
  autoUpdater.quitAndInstall(false, true);
}

/**
 * Set the update channel (e.g. 'latest' or 'beta').
 * @param {string} channel - The update channel to use
 */
function setChannel(channel) {
  if (!autoUpdater) return;
  autoUpdater.channel = channel;
  log.info('Update channel set to:', channel);
}

/**
 * Stop all update timers and release references. Called on app shutdown.
 */
function cleanup() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  autoUpdater = null;
  appViewRef = null;
}

module.exports = { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate, setChannel, cleanup };
