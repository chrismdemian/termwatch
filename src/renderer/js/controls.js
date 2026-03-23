const { formatTime } = require('./controls-utils');

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
    this._autoHideDelay = 3000;
    // Optimistic play/pause: tracked separately so it never permanently desyncs.
    // Expires after 500ms if no confirming state callback arrives.
    this._optimisticPaused = null; // null = not active
    this._optimisticExpiry = 0;
    this._init();
  }

  _init() {
    // Cache DOM element references used by _updateUI / _startSeekAnimation / auto-hide
    const urlInput = document.getElementById('url-input');
    const seekBar = document.getElementById('seek-bar');
    const volumeSlider = document.getElementById('volume-slider');
    const controlsBar = document.getElementById('controls-bar');

    this._els = {
      urlInput,
      seekBar,
      volumeSlider,
      controlsBar,
      iconPlay: document.getElementById('icon-play'),
      iconPause: document.getElementById('icon-pause'),
      timeCurrent: document.getElementById('time-current'),
      timeDuration: document.getElementById('time-duration'),
      iconVolumeOn: document.getElementById('icon-volume-on'),
      iconVolumeMuted: document.getElementById('icon-volume-muted'),
    };

    // URL navigation
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
      this.togglePlay();
    });

    // Seek bar
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
      // Update interpolation anchor so bar doesn't snap back while waiting for state callback
      this._lastKnownTime = time;
      this._lastUpdateTs = performance.now();
    });

    // Volume
    volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(volumeSlider.value);
      if (vol > 0) this._preMuteVolume = vol;
      window.videoControlAPI.setVolume(vol);
      this.videoState.volume = vol;
      if (vol > 0) this.videoState.muted = false;
      this._updateUI();
    });
    document.getElementById('btn-volume').addEventListener('click', () => {
      const effectivelyMuted = this.videoState.volume < 0.01 || this.videoState.muted;
      if (!effectivelyMuted) {
        this._preMuteVolume = this.videoState.volume;
        window.videoControlAPI.setVolume(0);
        volumeSlider.value = 0;
        this.videoState.volume = 0;
      } else {
        const restoreVol = this._preMuteVolume >= 0.01 ? this._preMuteVolume : 1;
        window.videoControlAPI.setVolume(restoreVol);
        volumeSlider.value = restoreVol;
        this.videoState.volume = restoreVol;
        this.videoState.muted = false;
      }
      this._updateUI();
    });

    // Video state updates
    window.videoControlAPI.onState((state) => {
      // Invalid duration signals a source transition (ad ending, page loading, etc.)
      // Reset time display but keep the actual paused state so the icon stays accurate
      if (!isFinite(state.duration) || state.duration <= 0) {
        this._stopSeekAnimation();
        this._optimisticPaused = null;
        this._lastKnownTime = 0;
        this._lastUpdateTs = performance.now();
        this.videoState.duration = 0;
        this.videoState.paused = state.paused !== undefined ? state.paused : true;
        this._updateUI();
        return;
      }

      // Detect source change (ad ↔ content): dramatic duration shift
      const prevDuration = this.videoState.duration;
      if (prevDuration > 0 && state.duration > 0) {
        const ratio = state.duration / prevDuration;
        if (ratio < 0.2 || ratio > 5) {
          // Source changed — reset to new source's time
          this._stopSeekAnimation();
        }
      }

      this.videoState = state;
      this._optimisticPaused = null; // real state arrived — clear optimistic
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

    // Reveal controls when mouse approaches the bottom edge (RAF-throttled)
    this._inRevealZone = false;
    this._revealRafPending = false;
    document.addEventListener('mousemove', (e) => {
      if (this._mouseOverControls) return;
      if (this._revealRafPending) return;
      const clientY = e.clientY;
      this._revealRafPending = true;
      requestAnimationFrame(() => {
        this._revealRafPending = false;
        const threshold = 60;
        const inZone = clientY >= window.innerHeight - threshold;
        if (inZone && !this._inRevealZone) {
          this._inRevealZone = true;
          controlsBar.classList.remove('auto-hidden');
          this._cancelAutoHide();
          this._startAutoHide();
        } else if (!inZone) {
          this._inRevealZone = false;
        }
      });
    }, { passive: true });
  }

  _updateUI() {
    const { duration, volume } = this.videoState;
    // Use optimistic paused state if still valid, otherwise use real state
    const paused = (this._optimisticPaused !== null && performance.now() < this._optimisticExpiry)
      ? this._optimisticPaused
      : this.videoState.paused;
    // Use interpolation anchor for display time — it's always the most recent
    // (updated by state callbacks, seek, and play/pause)
    const displayTime = this._lastKnownTime;

    // Play/pause icons
    this._els.iconPlay.classList.toggle('hidden', !paused);
    this._els.iconPause.classList.toggle('hidden', paused);

    // Time
    this._els.timeCurrent.textContent = this._formatTime(displayTime);
    this._els.timeDuration.textContent = this._formatTime(duration);

    // Seek bar — only set directly when paused or no animation running
    // (smooth animation handles it during playback)
    if (duration > 0 && (paused || !this._seekAnimId)) {
      this._els.seekBar.value = (displayTime / duration) * 100;
    }

    // Volume icon
    const isMuted = volume < 0.01 || this.videoState.muted;
    this._els.iconVolumeOn.classList.toggle('hidden', isMuted);
    this._els.iconVolumeMuted.classList.toggle('hidden', !isMuted);
    this._els.volumeSlider.value = volume;
  }

  _formatTime(seconds) {
    return formatTime(seconds);
  }

  _startAutoHide() {
    if (this._autoHideDelay === 0) return;
    this._cancelAutoHide();
    this._autoHideTimeout = setTimeout(() => {
      this._els.controlsBar.classList.add('auto-hidden');
    }, this._autoHideDelay);
  }

  setAutoHideDelay(ms) {
    this._autoHideDelay = ms;
    if (ms === 0) {
      this._cancelAutoHide();
      this._els.controlsBar.classList.remove('auto-hidden');
    }
  }

  _cancelAutoHide() {
    if (this._autoHideTimeout) {
      clearTimeout(this._autoHideTimeout);
      this._autoHideTimeout = null;
    }
  }

  _startSeekAnimation() {
    // Always cancel+restart so interpolation uses fresh anchor values
    if (this._seekAnimId) {
      cancelAnimationFrame(this._seekAnimId);
      this._seekAnimId = null;
    }
    const INTERVAL = 66; // ~15fps — sufficient for time display updates
    let lastFrame = 0;
    const tick = (now) => {
      const paused = (this._optimisticPaused !== null && performance.now() < this._optimisticExpiry)
        ? this._optimisticPaused
        : this.videoState.paused;
      if (this._userSeeking || paused) {
        this._seekAnimId = null;
        return;
      }
      if (now - lastFrame >= INTERVAL) {
        lastFrame = now;
        const elapsed = (performance.now() - this._lastUpdateTs) / 1000;
        const duration = this.videoState.duration;
        // Stop extrapolating if no state callback for 3+ seconds (stale data)
        if (elapsed > 3) {
          this._seekAnimId = null;
          return;
        }
        const predicted = Math.min(this._lastKnownTime + elapsed, duration);
        if (duration > 0) {
          this._els.seekBar.value = (predicted / duration) * 100;
          this._els.timeCurrent.textContent = this._formatTime(predicted);
        }
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

  _getPredictedTime() {
    const elapsed = (performance.now() - this._lastUpdateTs) / 1000;
    const duration = this.videoState.duration;
    return Math.min(this._lastKnownTime + elapsed, duration || Infinity);
  }

  togglePlay() {
    window.videoControlAPI.togglePlay();
    if (this.videoState.duration > 0) {
      const predicted = this._getPredictedTime();
      this._optimisticPaused = !this.videoState.paused;
      this._optimisticExpiry = performance.now() + 500;
      this._lastKnownTime = predicted;
      this._lastUpdateTs = performance.now();
      this._updateUI();
      if (!this._optimisticPaused && this.videoState.duration > 0) {
        this._startSeekAnimation();
      } else {
        this._stopSeekAnimation();
      }
    }
  }

  pauseAutoHide() {
    this._cancelAutoHide();
    this._els.controlsBar.classList.remove('auto-hidden');
  }

  resumeAutoHide() {
    this._startAutoHide();
  }

  revealAndAutoHide() {
    this._els.controlsBar.classList.remove('auto-hidden');
    this._cancelAutoHide();
    this._startAutoHide();
  }

}

module.exports = Controls;
