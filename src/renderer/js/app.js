// Renderer entry point - initializes all modules
const path = require('path');
const jsDir = path.join(__dirname, 'js');
const TerminalManager = require(path.join(jsDir, 'terminal-manager'));
const LayoutManager = require(path.join(jsDir, 'layout-manager'));
const Controls = require(path.join(jsDir, 'controls'));
const Bookmarks = require(path.join(jsDir, 'bookmarks'));
const Hotkeys = require(path.join(jsDir, 'hotkeys'));
const Titlebar = require(path.join(jsDir, 'titlebar'));
const Settings = require(path.join(jsDir, 'settings'));

async function init() {
  try {
    // Initialize modules
    const terminalManager = new TerminalManager();
    const terminalArea = document.getElementById('terminal-area');
    console.log('[TermWatch] terminal-area element:', terminalArea ? 'found' : 'MISSING');

    const layoutManager = new LayoutManager(terminalManager, terminalArea);
    const controls = new Controls();
    const bookmarks = new Bookmarks();
    const titlebar = new Titlebar();

    // Expose for cross-module access
    window._terminalManager = terminalManager;
    window._layoutManager = layoutManager;

    const settings = new Settings({ layoutManager, terminalManager, controls });
    const hotkeys = new Hotkeys({ layoutManager, terminalManager, controls, bookmarks });

    // Load saved settings and initialize layout
    await settings.load();
    settings.setupAutoSave();

    console.log('[TermWatch] Init complete. Terminals:', terminalManager.terminals.size);
    console.log('[TermWatch] Terminal area children:', terminalArea.children.length);
  } catch (err) {
    console.error('[TermWatch] Init failed:', err);
  }
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
