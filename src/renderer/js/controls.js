class Controls {
  constructor() {
    this.videoState = { currentTime: 0, duration: 0, paused: true, volume: 1, muted: false };
    this._preMuteVolume = 1;
    this._autoHideTimeout = null;
    // Smooth seek bar interpolation state
    this._lastKnownTime = 0;
    this._lastUpdateTs = 0;
    this._seekAnimId = null;
    this._userSeeking = false;
    this._init();
  }

  _init() {
    // URL navigation
    const urlInput = document.getElementById('url-input');
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        let url = urlInput.value.trim();
        if (url && !url.match(/^https?:\/\//)) {
          url = 'https://' + url;
        }
        if (url) {
          window.videoControlAPI.navigate(url);
          urlInput.blur();
        }
      }
      e.stopPropagation(); // Prevent hotkeys while typing
    });

    // Prevent hotkeys from firing while URL input is focused
    urlInput.addEventListener('keyup', (e) => e.stopPropagation());

    // Nav buttons
    document.getElementById('btn-back').addEventListener('click', () => {
      window.videoControlAPI.goBack();
    });
    document.getElementById('btn-forward').addEventListener('click', () => {
      window.videoControlAPI.goForward();
    });

    // Play/Pause
    document.getElementById('btn-play-pause').addEventListener('click', () => {
      window.videoControlAPI.togglePlay();
    });

    // Seek bar
    const seekBar = document.getElementById('seek-bar');
    seekBar.addEventListener('mousedown', () => { this._userSeeking = true; });
    document.addEventListener('mouseup', () => {
      if (this._userSeeking) {
        this._userSeeking = false;
        if (!this.videoState.paused && this.videoState.duration > 0) {
          this._startSeekAnimation();
        }
      }
    });
    seekBar.addEventListener('input', () => {
      const time = (seekBar.value / 100) * this.videoState.duration;
      window.videoControlAPI.seek(time);
    });

    // Volume
    const volumeSlider = document.getElementById('volume-slider');
    volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(volumeSlider.value);
      if (vol > 0) this._preMuteVolume = vol;
      window.videoControlAPI.setVolume(vol);
    });
    document.getElementById('btn-volume').addEventListener('click', () => {
      const effectivelyMuted = this.videoState.volume < 0.01 || this.videoState.muted;
      if (!effectivelyMuted) {
        this._preMuteVolume = this.videoState.volume;
        window.videoControlAPI.setVolume(0);
        volumeSlider.value = 0;
      } else {
        const restoreVol = this._preMuteVolume >= 0.01 ? this._preMuteVolume : 1;
        window.videoControlAPI.setVolume(restoreVol);
        volumeSlider.value = restoreVol;
      }
    });

    // Opacity
    const opacitySlider = document.getElementById('opacity-slider');
    opacitySlider.addEventListener('input', () => {
      const opacity = parseFloat(opacitySlider.value);
      if (window._terminalManager) {
        window._terminalManager.setOpacity(opacity);
      }
      window.storeAPI.set('opacity', opacity);
    });

    // Video state updates
    window.videoControlAPI.onState((state) => {
      this.videoState = state;
      this._lastKnownTime = state.currentTime;
      this._lastUpdateTs = performance.now();
      this._updateUI();
      // Start or stop smooth seek animation based on play state
      if (!state.paused && state.duration > 0) {
        this._startSeekAnimation();
      } else {
        this._stopSeekAnimation();
      }
    });

    // URL updates from video view
    window.videoControlAPI.onUrlUpdated((url) => {
      urlInput.value = url;
    });

    // Auto-hide controls - stay visible while mouse is over the bar
    const controlsBar = document.getElementById('controls-bar');
    this._mouseOverControls = false;

    controlsBar.addEventListener('mouseenter', () => {
      this._mouseOverControls = true;
      this._cancelAutoHide();
      controlsBar.classList.remove('auto-hidden');
    });
    controlsBar.addEventListener('mouseleave', () => {
      this._mouseOverControls = false;
      this._startAutoHide();
    });

    // Bookmarks bar also prevents auto-hide when hovered
    const bookmarksBar = document.getElementById('bookmarks-bar');
    bookmarksBar.addEventListener('mouseenter', () => {
      this._mouseOverControls = true;
      this._cancelAutoHide();
      controlsBar.classList.remove('auto-hidden');
    });
    bookmarksBar.addEventListener('mouseleave', () => {
      this._mouseOverControls = false;
      this._startAutoHide();
    });

    // Reveal controls when mouse approaches the bottom edge
    this._inRevealZone = false;
    document.addEventListener('mousemove', (e) => {
      if (this._mouseOverControls) return;
      const threshold = 60;
      const inZone = e.clientY >= window.innerHeight - threshold;
      if (inZone && !this._inRevealZone) {
        // Just entered the zone — reveal and start timer once
        this._inRevealZone = true;
        controlsBar.classList.remove('auto-hidden');
        this._cancelAutoHide();
        this._startAutoHide();
      } else if (!inZone) {
        this._inRevealZone = false;
      }
    });
  }

  _updateUI() {
    const { currentTime, duration, paused, volume } = this.videoState;

    // Play/pause icons
    document.getElementById('icon-play').classList.toggle('hidden', !paused);
    document.getElementById('icon-pause').classList.toggle('hidden', paused);

    // Time
    document.getElementById('time-current').textContent = this._formatTime(currentTime);
    document.getElementById('time-duration').textContent = this._formatTime(duration);

    // Seek bar — only set directly when paused or no animation running
    // (smooth animation handles it during playback)
    if (duration > 0 && (paused || !this._seekAnimId)) {
      document.getElementById('seek-bar').value = (currentTime / duration) * 100;
    }

    // Volume icon
    const isMuted = volume < 0.01 || this.videoState.muted;
    document.getElementById('icon-volume-on').classList.toggle('hidden', isMuted);
    document.getElementById('icon-volume-muted').classList.toggle('hidden', !isMuted);
    document.getElementById('volume-slider').value = volume;
  }

  _formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  _startAutoHide() {
    this._cancelAutoHide();
    this._autoHideTimeout = setTimeout(() => {
      document.getElementById('controls-bar').classList.add('auto-hidden');
    }, 3000);
  }

  _cancelAutoHide() {
    if (this._autoHideTimeout) {
      clearTimeout(this._autoHideTimeout);
      this._autoHideTimeout = null;
    }
  }

  _startSeekAnimation() {
    if (this._seekAnimId) return; // already running
    const tick = () => {
      if (this._userSeeking || this.videoState.paused) {
        this._seekAnimId = null;
        return;
      }
      const elapsed = (performance.now() - this._lastUpdateTs) / 1000;
      const duration = this.videoState.duration;
      const predicted = Math.min(this._lastKnownTime + elapsed, duration);
      if (duration > 0) {
        document.getElementById('seek-bar').value = (predicted / duration) * 100;
        document.getElementById('time-current').textContent = this._formatTime(predicted);
      }
      this._seekAnimId = requestAnimationFrame(tick);
    };
    this._seekAnimId = requestAnimationFrame(tick);
  }

  _stopSeekAnimation() {
    if (this._seekAnimId) {
      cancelAnimationFrame(this._seekAnimId);
      this._seekAnimId = null;
    }
  }

  setOpacitySlider(value) {
    document.getElementById('opacity-slider').value = value;
  }
}

module.exports = Controls;
