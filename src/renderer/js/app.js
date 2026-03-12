// Renderer entry point - initializes all modules
const { ipcRenderer } = require('electron');
const log = require('electron-log/renderer');
const path = require('path');
const jsDir = path.join(__dirname, 'js');
const TerminalManager = require(path.join(jsDir, 'terminal-manager'));
const LayoutManager = require(path.join(jsDir, 'layout-manager'));
const Controls = require(path.join(jsDir, 'controls'));
const Bookmarks = require(path.join(jsDir, 'bookmarks'));
const Hotkeys = require(path.join(jsDir, 'hotkeys'));
const Titlebar = require(path.join(jsDir, 'titlebar'));
const Settings = require(path.join(jsDir, 'settings'));

// Global error handlers for renderer
window.addEventListener('error', (event) => {
  log.error('Renderer uncaught error:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  log.error('Renderer unhandled rejection:', event.reason);
});

async function init() {
  try {
    // Initialize modules
    const terminalManager = new TerminalManager();
    const terminalArea = document.getElementById('terminal-area');
    log.info('terminal-area element:', terminalArea ? 'found' : 'MISSING');

    const layoutManager = new LayoutManager(terminalManager, terminalArea);
    const controls = new Controls();
    const bookmarks = new Bookmarks();
    const titlebar = new Titlebar();

    // Expose for cross-module access
    window._terminalManager = terminalManager;
    window._layoutManager = layoutManager;

    const settings = new Settings({ layoutManager, terminalManager, controls });
    const hotkeys = new Hotkeys({ layoutManager, terminalManager, controls, bookmarks, settings });

    // Load saved settings and initialize layout
    await settings.load();
    settings.setupAutoSave();

    // Start in video mode if configured
    if (settings.getValue('startInVideoMode')) {
      hotkeys._toggleVideoMode();
    }

    // Listen for auto-update notifications
    ipcRenderer.on('app:update-available', (event, info) => {
      window._updateInfo = info;
      const settingsBtn = document.getElementById('btn-settings');
      if (settingsBtn) settingsBtn.classList.add('has-update');
    });

    log.info('Init complete. Terminals:', terminalManager.terminals.size);
  } catch (err) {
    log.error('Init failed:', err);
  }
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
