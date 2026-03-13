const { contextBridge, ipcRenderer } = require('electron');
const { findBestVideo } = require('./video-scoring');

// --- Frame identity ---
const isMainFrame = process.isMainFrame;
const frameId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

// --- Video element detection and control ---
let currentVideo = null;
let trackedListeners = []; // [{ event, handler }] for cleanup
let lastKnownDuration = 0;
let rescanTimer = null;

// --- Startup autoplay suppression ---
let startupPauseActive = false;
let startupPauseTimer = null;
let startupPauseTimeout = null;
let lastUserInteraction = 0;

/**
 * Clear the startup autoplay suppression state and cancel associated timers.
 */
function clearStartupPause() {
  startupPauseActive = false;
  if (startupPauseTimer) {
    clearInterval(startupPauseTimer);
    startupPauseTimer = null;
  }
  if (startupPauseTimeout) {
    clearTimeout(startupPauseTimeout);
    startupPauseTimeout = null;
  }
}

// Track user interactions to distinguish autoplay from user-initiated play
document.addEventListener('click', () => { lastUserInteraction = Date.now(); }, true);
document.addEventListener('keydown', () => { lastUserInteraction = Date.now(); }, true);
document.addEventListener('pointerdown', () => { lastUserInteraction = Date.now(); }, true);

/**
 * Find the best <video> element on the page.
 * Delegates scoring to video-scoring.js.
 */
function findVideo() {
  const videos = document.querySelectorAll('video');
  return findBestVideo(videos);
}

/**
 * Remove all tracked event listeners from the current video element.
 */
function detachVideoListeners() {
  if (currentVideo) {
    for (const { event, handler } of trackedListeners) {
      currentVideo.removeEventListener(event, handler);
    }
  }
  trackedListeners = [];
}

/**
 * Attach event listeners to a video element for state tracking and source-change detection.
 * Detaches listeners from the previous video element if one was tracked.
 * @param {HTMLVideoElement} video - The video element to track
 */
function attachVideoListeners(video) {
  if (currentVideo === video) return;

  // Clean up old listeners before attaching new ones
  detachVideoListeners();
  currentVideo = video;
  lastKnownDuration = 0;

  // Register this frame as having a video
  ipcRenderer.send('video:frame-register', { frameId });

  const sendState = () => {
    if (!currentVideo) return;
    const state = {
      currentTime: currentVideo.currentTime,
      duration: currentVideo.duration || 0,
      paused: currentVideo.paused,
      volume: currentVideo.volume,
      muted: currentVideo.muted,
      frameId,
    };
    ipcRenderer.send('video:state', state);

    // Update frame metadata when duration becomes available
    if (currentVideo.duration && isFinite(currentVideo.duration)) {
      ipcRenderer.send('video:frame-update', {
        frameId,
        duration: currentVideo.duration,
      });
    }
  };

  // Detect same-element source changes (ad → content or content → ad)
  const onDurationChange = () => {
    if (currentVideo !== video) return; // stale event from detached listener
    sendState();
    const newDur = currentVideo.duration;
    if (isFinite(newDur) && newDur > 0 && lastKnownDuration > 0) {
      const ratio = newDur / lastKnownDuration;
      if (ratio < 0.2 || ratio > 5) {
        // Dramatic duration shift — re-scan for best video
        const best = findVideo();
        if (best && best !== currentVideo) {
          attachVideoListeners(best);
          return;
        }
      }
    }
    if (isFinite(newDur) && newDur > 0) {
      lastKnownDuration = newDur;
    }
  };

  const onEmptied = () => {
    // Source removed — re-scan after a short delay to let the new source load
    setTimeout(() => {
      const best = findVideo();
      if (best && best !== currentVideo) {
        attachVideoListeners(best);
      }
    }, 500);
  };

  const events = [
    ['timeupdate', sendState],
    ['play', sendState],
    ['pause', sendState],
    ['volumechange', sendState],
    ['loadedmetadata', sendState],
    ['durationchange', onDurationChange],
    ['emptied', onEmptied],
  ];
  for (const [event, handler] of events) {
    video.addEventListener(event, handler);
    trackedListeners.push({ event, handler });
  }
}

// MutationObserver to detect <video> elements
const observer = new MutationObserver(() => {
  const video = findVideo();
  if (video) {
    attachVideoListeners(video);
  } else if (currentVideo) {
    // Video element disappeared — clean up
    detachVideoListeners();
    currentVideo = null;
    ipcRenderer.send('video:frame-deregister', { frameId });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const video = findVideo();
  if (video) attachVideoListeners(video);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Periodic re-scan: safety net for MSE-based source switches
  // that don't trigger DOM mutations
  rescanTimer = setInterval(() => {
    const best = findVideo();
    if (best && best !== currentVideo) {
      attachVideoListeners(best);
    } else if (!best && currentVideo) {
      detachVideoListeners();
      currentVideo = null;
      ipcRenderer.send('video:frame-deregister', { frameId });
    }
  }, 2000);
});

// Deregister frame on unload and clean up timers
window.addEventListener('beforeunload', () => {
  if (rescanTimer) {
    clearInterval(rescanTimer);
    rescanTimer = null;
  }
  observer.disconnect();
  clearStartupPause();
  detachVideoListeners();
  currentVideo = null;
  ipcRenderer.send('video:frame-deregister', { frameId });
});

// --- IPC listeners for playback control ---
// Commands arrive via frame.send() targeted to this specific frame
ipcRenderer.on('video:play', () => {
  clearStartupPause();
  const v = findVideo();
  if (v) v.play();
});

ipcRenderer.on('video:pause', () => {
  const v = findVideo();
  if (v) v.pause();
});

ipcRenderer.on('video:toggle-play', () => {
  clearStartupPause();
  const v = findVideo();
  if (v) {
    if (v.paused) v.play();
    else v.pause();
  }
});

ipcRenderer.on('video:set-volume', (e, volume) => {
  const v = findVideo();
  if (v) {
    v.volume = Math.max(0, Math.min(1, volume));
    v.muted = false;
  }
});

ipcRenderer.on('video:seek', (e, time) => {
  const v = findVideo();
  if (v && isFinite(time)) {
    v.currentTime = time;
  }
});

ipcRenderer.on('video:seek-relative', (e, delta) => {
  const v = findVideo();
  if (v && isFinite(delta)) {
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
  }
});

// --- Startup autoplay suppression handler ---
// When the app restores a saved URL on startup, prevent the video from auto-playing.
// Polls for playing videos and pauses them until the user explicitly initiates playback
// (via our controls or by clicking the site's native play button).
ipcRenderer.on('video:pause-autoplay', () => {
  startupPauseActive = true;
  if (startupPauseTimer) clearInterval(startupPauseTimer);
  if (startupPauseTimeout) clearTimeout(startupPauseTimeout);

  startupPauseTimer = setInterval(() => {
    if (!startupPauseActive) {
      clearInterval(startupPauseTimer);
      startupPauseTimer = null;
      return;
    }
    const v = findVideo();
    if (v && !v.paused) {
      // If user recently interacted, they clicked play intentionally — allow it
      if (Date.now() - lastUserInteraction < 1000) {
        clearStartupPause();
      } else {
        v.pause();
      }
    }
  }, 100);

  startupPauseTimeout = setTimeout(clearStartupPause, 30000);

  // Pause immediately if a video is already playing
  if (currentVideo && !currentVideo.paused) {
    currentVideo.pause();
  }
});

// --- Video mode overlay with auto-hiding controls (main frame only) ---
let videoModeOverlay = null;
let videoModeActive = false;
let mouseIdleTimer = null;
let mouseMoveHandler = null;

/**
 * Show the video mode overlay controls and reset the idle hide timer.
 */
function showControls() {
  if (!videoModeOverlay) return;
  videoModeOverlay.classList.add('termwatch-vm-visible');
  resetIdleTimer();
}

/**
 * Hide the video mode overlay controls.
 */
function hideControls() {
  if (!videoModeOverlay) return;
  videoModeOverlay.classList.remove('termwatch-vm-visible');
}

/**
 * Reset the idle timer that auto-hides the video mode overlay controls after 2.5 seconds.
 */
function resetIdleTimer() {
  if (mouseIdleTimer) clearTimeout(mouseIdleTimer);
  mouseIdleTimer = setTimeout(hideControls, 2500);
}

/**
 * Create an SVG element with attributes and child elements.
 * Uses DOM APIs instead of innerHTML to bypass Trusted Types CSP.
 * @param {number} width - SVG width
 * @param {number} height - SVG height
 * @param {string} viewBox - SVG viewBox attribute value
 * @param {Object<string, string>} attrs - Additional attributes to set on the SVG element
 * @param {Array<{tag: string, attrs: Object<string, string>}>} children - Child elements to create
 * @returns {SVGElement} The constructed SVG element
 */
function createSvg(width, height, viewBox, attrs, children) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  for (const [k, v] of Object.entries(attrs || {})) svg.setAttribute(k, v);
  for (const child of children) {
    const el = document.createElementNS(ns, child.tag);
    for (const [k, v] of Object.entries(child.attrs || {})) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}

/**
 * Create and inject the video mode overlay with navigation and exit controls.
 * Only operates in the main frame. Removes any existing overlay first.
 */
function createVideoModeOverlay() {
  if (!isMainFrame) return;

  // Clean up any stale references first
  removeVideoModeOverlay();

  // Build all elements with createElement (no innerHTML — Trusted Types CSP blocks it)
  videoModeOverlay = document.createElement('div');
  videoModeOverlay.id = 'termwatch-video-mode-overlay';

  // Toast
  const toast = document.createElement('div');
  toast.id = 'termwatch-vm-toast';
  toast.appendChild(document.createTextNode('Press '));
  const kbd = document.createElement('kbd');
  kbd.textContent = 'Esc';
  toast.appendChild(kbd);
  toast.appendChild(document.createTextNode(' to return to terminals'));
  videoModeOverlay.appendChild(toast);

  // Back button
  const backBtn = document.createElement('button');
  backBtn.id = 'termwatch-vm-back';
  backBtn.className = 'termwatch-vm-nav';
  backBtn.title = 'Go back (Alt+\u2190)';
  backBtn.appendChild(createSvg(24, 24, '0 0 24 24',
    { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [{ tag: 'polyline', attrs: { points: '15 18 9 12 15 6' } }]
  ));
  videoModeOverlay.appendChild(backBtn);

  // Forward button
  const fwdBtn = document.createElement('button');
  fwdBtn.id = 'termwatch-vm-forward';
  fwdBtn.className = 'termwatch-vm-nav';
  fwdBtn.title = 'Go forward (Alt+\u2192)';
  fwdBtn.appendChild(createSvg(24, 24, '0 0 24 24',
    { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    [{ tag: 'polyline', attrs: { points: '9 18 15 12 9 6' } }]
  ));
  videoModeOverlay.appendChild(fwdBtn);

  // Exit button
  const exitBtn = document.createElement('button');
  exitBtn.id = 'termwatch-vm-exit';
  exitBtn.className = 'termwatch-vm-control';
  exitBtn.title = 'Return to terminals (Esc)';
  exitBtn.appendChild(createSvg(20, 20, '0 0 24 24', {},
    [
      { tag: 'rect', attrs: { x: '2', y: '3', width: '20', height: '14', rx: '2' } },
      { tag: 'line', attrs: { x1: '8', y1: '21', x2: '16', y2: '21' } },
      { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '21' } },
    ]
  ));
  videoModeOverlay.appendChild(exitBtn);

  // Inject CSS via IPC → main process uses webContents.insertCSS (bypasses CSP)
  ipcRenderer.send('video:inject-overlay-css');

  document.body.appendChild(videoModeOverlay);

  // Wire up click handlers
  backBtn.addEventListener('click', () => ipcRenderer.send('video:go-back'));
  fwdBtn.addEventListener('click', () => ipcRenderer.send('video:go-forward'));
  exitBtn.addEventListener('click', () => ipcRenderer.send('video:exit-video-mode'));

  // Show controls on mouse move, hide after idle
  mouseMoveHandler = () => showControls();
  document.addEventListener('mousemove', mouseMoveHandler);

  // Show briefly on creation so user sees the controls exist, then auto-hide
  showControls();
}

/**
 * Remove the video mode overlay and clean up associated event listeners and timers.
 */
function removeVideoModeOverlay() {
  if (mouseIdleTimer) {
    clearTimeout(mouseIdleTimer);
    mouseIdleTimer = null;
  }
  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }
  if (videoModeOverlay) {
    videoModeOverlay.remove();
    videoModeOverlay = null;
  }
  // CSS is injected via webContents.insertCSS (main process) — no style element to remove
}

// Overlay show/hide — main frame only
ipcRenderer.on('video:show-exit-overlay', () => {
  if (!isMainFrame) return;
  videoModeActive = true;
  if (document.body) {
    createVideoModeOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', () => createVideoModeOverlay());
  }
});

ipcRenderer.on('video:hide-exit-overlay', () => {
  if (!isMainFrame) return;
  videoModeActive = false;
  removeVideoModeOverlay();
});

// Re-inject overlay after page navigation if still in video mode
document.addEventListener('DOMContentLoaded', () => {
  if (videoModeActive && isMainFrame) {
    createVideoModeOverlay();
  }
});

// Ctrl+Shift+V or Escape to exit video mode (main frame only)
document.addEventListener('keydown', (e) => {
  if (!videoModeActive || !isMainFrame) return;
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
    e.preventDefault();
    ipcRenderer.send('video:exit-video-mode');
  } else if (e.key === 'Escape') {
    // Don't preventDefault — let the page also handle Escape (close menus, etc.)
    ipcRenderer.send('video:exit-video-mode');
  }
});

// Expose navigation API (main frame only — prevents iframe page JS from accessing it)
if (isMainFrame) {
  contextBridge.exposeInMainWorld('videoAPI', {
    getUrl: () => window.location.href,
  });
}
