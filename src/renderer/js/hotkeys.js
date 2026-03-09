class Hotkeys {
  constructor({ layoutManager, terminalManager, controls, bookmarks }) {
    this.layoutManager = layoutManager;
    this.terminalManager = terminalManager;
    this.controls = controls;
    this.bookmarks = bookmarks;
    this.videoMode = false;
    this.theaterMode = false;

    this._setup();
  }

  _setup() {
    document.addEventListener('keydown', (e) => {
      // Don't capture if typing in URL input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      if (e.ctrlKey && e.shiftKey) {
        switch (e.code) {
          case 'KeyV':
            e.preventDefault();
            this._toggleVideoMode();
            break;
          case 'KeyT':
            e.preventDefault();
            this._toggleTheaterMode();
            break;
          case 'Space':
            e.preventDefault();
            window.videoControlAPI.togglePlay();
            break;
          case 'Digit1':
            e.preventDefault();
            this.terminalManager.focusTerminal(this._getPanelIdByIndex(0));
            break;
          case 'Digit2':
            e.preventDefault();
            this.terminalManager.focusTerminal(this._getPanelIdByIndex(1));
            break;
          case 'Digit3':
            e.preventDefault();
            this.terminalManager.focusTerminal(this._getPanelIdByIndex(2));
            break;
          case 'Digit4':
            e.preventDefault();
            this.terminalManager.focusTerminal(this._getPanelIdByIndex(3));
            break;
          case 'ArrowUp':
            e.preventDefault();
            this._adjustOpacity(0.1);
            break;
          case 'ArrowDown':
            e.preventDefault();
            this._adjustOpacity(-0.1);
            break;
          case 'KeyB':
            e.preventDefault();
            this.bookmarks.toggle();
            break;
          case 'KeyL':
            e.preventDefault();
            const next = this.layoutManager.cycleLayout();
            document.getElementById('layout-select').value = next;
            break;
          case 'KeyI':
            e.preventDefault();
            // DevTools toggle handled by Electron default
            break;
        }
      }

      if (e.key === 'Escape') {
        if (this.theaterMode) {
          this._toggleTheaterMode();
        } else if (this.videoMode) {
          this._toggleVideoMode();
        }
      }
    });

    // Theater mode exit button
    document.getElementById('btn-exit-theater').addEventListener('click', () => {
      if (this.theaterMode) this._toggleTheaterMode();
    });

    // Video mode button
    document.getElementById('btn-video-mode').addEventListener('click', () => {
      this._toggleVideoMode();
    });
  }

  _toggleVideoMode() {
    this.videoMode = !this.videoMode;
    window.windowAPI.toggleVideoMode(this.videoMode);

    const indicator = document.getElementById('video-mode-indicator');
    if (this.videoMode) {
      indicator.classList.remove('hidden');
      // Re-trigger animation
      indicator.style.animation = 'none';
      void indicator.offsetHeight;
      indicator.style.animation = '';
    } else {
      indicator.classList.add('hidden');
    }
  }

  _toggleTheaterMode() {
    this.theaterMode = !this.theaterMode;
    const termArea = document.getElementById('terminal-area');
    const controlsBar = document.getElementById('controls-bar');
    const theaterExit = document.getElementById('theater-exit');

    if (this.theaterMode) {
      termArea.classList.add('theater-mode');
      controlsBar.classList.add('theater-hidden');
      theaterExit.classList.remove('hidden');
    } else {
      termArea.classList.remove('theater-mode');
      controlsBar.classList.remove('theater-hidden');
      theaterExit.classList.add('hidden');
    }
  }

  _adjustOpacity(delta) {
    const slider = document.getElementById('opacity-slider');
    let val = parseFloat(slider.value) + delta;
    val = Math.max(0, Math.min(1, val));
    slider.value = val;
    if (window._terminalManager) {
      window._terminalManager.setOpacity(val);
    }
    window.storeAPI.set('opacity', val);
  }

  _getPanelIdByIndex(index) {
    const panels = this.layoutManager.panels;
    if (index < panels.length) {
      return panels[index].panelId;
    }
    return null;
  }
}

module.exports = Hotkeys;
