const { contextBridge, ipcRenderer } = require('electron');

// --- Frame identity ---
const isMainFrame = process.isMainFrame;
const frameId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

// --- Video element detection and control ---
let currentVideo = null;

function findVideo() {
  return document.querySelector('video');
}

function attachVideoListeners(video) {
  if (currentVideo === video) return;
  currentVideo = video;

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

  video.addEventListener('timeupdate', sendState);
  video.addEventListener('play', sendState);
  video.addEventListener('pause', sendState);
  video.addEventListener('volumechange', sendState);
  video.addEventListener('loadedmetadata', sendState);
  video.addEventListener('durationchange', sendState);
}

// MutationObserver to detect <video> elements
const observer = new MutationObserver(() => {
  const video = findVideo();
  if (video) {
    attachVideoListeners(video);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const video = findVideo();
  if (video) attachVideoListeners(video);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
});

// Deregister frame on unload
window.addEventListener('beforeunload', () => {
  ipcRenderer.send('video:frame-deregister', { frameId });
});

// --- IPC listeners for playback control ---
// Commands arrive via frame.send() targeted to this specific frame
ipcRenderer.on('video:play', () => {
  const v = findVideo();
  if (v) v.play();
});

ipcRenderer.on('video:pause', () => {
  const v = findVideo();
  if (v) v.pause();
});

ipcRenderer.on('video:toggle-play', () => {
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

// --- Video mode overlay with auto-hiding controls (main frame only) ---
let videoModeOverlay = null;
let videoModeActive = false;
let mouseIdleTimer = null;
let mouseMoveHandler = null;

function showControls() {
  if (!videoModeOverlay) return;
  videoModeOverlay.classList.add('termwatch-vm-visible');
  resetIdleTimer();
}

function hideControls() {
  if (!videoModeOverlay) return;
  videoModeOverlay.classList.remove('termwatch-vm-visible');
}

function resetIdleTimer() {
  if (mouseIdleTimer) clearTimeout(mouseIdleTimer);
  mouseIdleTimer = setTimeout(hideControls, 2500);
}

// Helper: create an SVG element with attributes and children (bypasses Trusted Types)
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
