class Titlebar {
  constructor() {
    this._init();
  }

  async _init() {
    const platform = await window.windowAPI.getPlatform();

    // On macOS, hide custom window controls (use native traffic lights)
    if (platform === 'darwin') {
      document.getElementById('titlebar-controls').classList.add('hidden');
      document.getElementById('titlebar').classList.add('macos');
    }

    // Window control buttons
    document.getElementById('btn-minimize').addEventListener('click', () => {
      window.windowAPI.minimize();
    });

    document.getElementById('btn-maximize').addEventListener('click', () => {
      window.windowAPI.maximize();
    });

    document.getElementById('btn-close').addEventListener('click', () => {
      window.windowAPI.close();
    });

    // Track maximize state for icon
    window.windowAPI.onMaximized((isMaximized) => {
      const btn = document.getElementById('btn-maximize');
      if (isMaximized) {
        btn.title = 'Restore';
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="2" y="0" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="0" y="2" width="8" height="8" rx="1" fill="var(--bg-deep)" stroke="currentColor" stroke-width="1"/>
        </svg>`;
      } else {
        btn.title = 'Maximize';
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10">
          <rect width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>`;
      }
    });

    // Double-click titlebar to maximize
    document.getElementById('titlebar').addEventListener('dblclick', () => {
      window.windowAPI.maximize();
    });
  }
}

module.exports = Titlebar;
