class Hotkeys {
  constructor({ layoutManager, terminalManager, controls, bookmarks, settings }) {
    this.layoutManager = layoutManager;
    this.terminalManager = terminalManager;
    this.controls = controls;
    this.bookmarks = bookmarks;
    this.settings = settings;
    this.videoMode = false;
    this.theaterMode = false;

    this._setup();
    this._setupFullscreen();
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

      // Ctrl+Shift+, toggles settings regardless of modal state
      if (e.ctrlKey && e.shiftKey && e.code === 'Comma') {
        e.preventDefault();
        this.settings.toggle();
        return;
      }

      // Escape closes settings first, then theater/video mode
      if (e.key === 'Escape') {
        if (this.settings.isOpen) {
          this.settings.close();
          return;
        }
        if (this.theaterMode) {
          this._toggleTheaterMode();
        } else if (this.videoMode) {
          this._toggleVideoMode();
        }
        return;
      }

      // Block other hotkeys when settings modal is open
      if (this.settings.isOpen) return;

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
          case 'KeyR':
            e.preventDefault();
            this.terminalManager.restartAll();
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
    });

    // Theater mode exit button
    document.getElementById('btn-exit-theater').addEventListener('click', () => {
      if (this.theaterMode) this._toggleTheaterMode();
    });

    // Video mode button
    document.getElementById('btn-video-mode').addEventListener('click', () => {
      this._toggleVideoMode();
    });

    // Video mode exited from the video view's exit button or keyboard shortcut
    window.windowAPI.onVideoModeExited(() => {
      if (this.videoMode) {
        this.videoMode = false;
        document.getElementById('video-mode-indicator').classList.add('hidden');
      }
    });

    // Fullscreen toggle button
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      window.windowAPI.toggleFullscreen();
    });

    // Fullscreen window controls (minimize/close in controls bar)
    document.getElementById('btn-fs-minimize').addEventListener('click', () => {
      window.windowAPI.minimize();
    });
    document.getElementById('btn-fs-close').addEventListener('click', () => {
      window.windowAPI.close();
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

  _setupFullscreen() {
    // Use stored preference for initial UI (avoids flicker — live query returns
    // false before main process calls enterFullscreen in did-finish-load)
    window.storeAPI.get('isFullscreen').then((isFs) => {
      this._applyFullscreenUI(!!isFs);
    });

    // Listen for live changes from main process
    window.windowAPI.onFullscreenChanged((isFs) => {
      this._applyFullscreenUI(isFs);
    });
  }

  _applyFullscreenUI(isFullscreen) {
    const titlebar = document.getElementById('titlebar');
    const termArea = document.getElementById('terminal-area');
    const fsControls = document.getElementById('fullscreen-window-controls');
    const iconEnter = document.getElementById('icon-enter-fullscreen');
    const iconExit = document.getElementById('icon-exit-fullscreen');

    if (isFullscreen) {
      titlebar.classList.add('fullscreen-hidden');
      termArea.classList.add('fullscreen');
      fsControls.classList.remove('hidden');
      iconEnter.classList.add('hidden');
      iconExit.classList.remove('hidden');
    } else {
      titlebar.classList.remove('fullscreen-hidden');
      termArea.classList.remove('fullscreen');
      fsControls.classList.add('hidden');
      iconEnter.classList.remove('hidden');
      iconExit.classList.add('hidden');
    }

    // Trigger terminal resize after layout shift
    if (this.terminalManager) {
      setTimeout(() => this.terminalManager.fitAll(), 50);
    }
  }

  _adjustOpacity(delta) {
    let val = this.settings.getOpacity() + delta;
    val = Math.max(0, Math.min(1, parseFloat(val.toFixed(2))));
    this.settings.setOpacity(val);
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
