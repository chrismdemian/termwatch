class Titlebar {
  constructor() {
    this._isDragging = false;
    this._dragStart = { x: 0, y: 0 };
    this._isMaximized = false;
    this._dragRafPending = false;
    this._init();
  }

  async _init() {
    const platform = await window.windowAPI.getPlatform();
    const titlebar = document.getElementById('titlebar');

    // On macOS, hide custom window controls (use native traffic lights)
    if (platform === 'darwin') {
      document.getElementById('titlebar-controls').classList.add('hidden');
      titlebar.classList.add('macos');
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

    // Track maximize state for icon and drag behavior
    window.windowAPI.onMaximized((isMaximized) => {
      this._isMaximized = isMaximized;
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

    // Double-click titlebar to maximize/restore
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.titlebar-controls')) return;
      window.windowAPI.maximize();
    });

    // Manual window dragging (replaces -webkit-app-region: drag)
    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.titlebar-controls')) return;
      if (e.button !== 0) return;
      this._isDragging = true;
      this._dragStart = { x: e.screenX, y: e.screenY };
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      if (this._dragRafPending) return;
      const sx = e.screenX;
      const sy = e.screenY;
      this._dragRafPending = true;
      requestAnimationFrame(() => {
        this._dragRafPending = false;
        if (!this._isDragging) return;
        const dx = sx - this._dragStart.x;
        const dy = sy - this._dragStart.y;
        if (dx === 0 && dy === 0) return;

        // Drag-to-restore: unmaximize first when dragging a maximized window
        if (this._isMaximized) {
          window.windowAPI.maximize(); // toggles to restore
          // Recalculate drag start after restore settles
          this._dragStart = { x: sx, y: sy };
          return;
        }

        window.windowAPI.moveBy(dx, dy);
        this._dragStart = { x: sx, y: sy };
      });
    });

    document.addEventListener('mouseup', () => {
      this._isDragging = false;
    });

    window.addEventListener('blur', () => {
      this._isDragging = false;
    });
  }
}

module.exports = Titlebar;
