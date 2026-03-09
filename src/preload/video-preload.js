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

// --- Video mode exit overlay (main frame only) ---
let videoModeOverlay = null;
let videoModeStyle = null;
let videoModeActive = false;

function createVideoModeOverlay() {
  if (!isMainFrame) return;

  // Clean up any stale references first
  removeVideoModeOverlay();

  videoModeOverlay = document.createElement('div');
  videoModeOverlay.id = 'termwatch-video-mode-overlay';
  videoModeOverlay.innerHTML = `
    <div id="termwatch-vm-toast">Press <kbd>Esc</kbd> or <kbd>Ctrl+Shift+V</kbd> to return to terminals</div>
    <button id="termwatch-vm-exit" title="Return to terminals">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    </button>
  `;

  videoModeStyle = document.createElement('style');
  videoModeStyle.textContent = `
    #termwatch-vm-toast {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(12, 12, 20, 0.85);
      color: #e8e6e3;
      padding: 16px 24px;
      border-radius: 8px;
      font-family: -apple-system, system-ui, sans-serif;
      font-size: 14px;
      z-index: 2147483647;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      animation: termwatch-fade 4s ease-out forwards;
      pointer-events: none;
    }
    #termwatch-vm-toast kbd {
      background: #1a1a2e;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
      font-size: 12px;
    }
    @keyframes termwatch-fade {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
      10% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      70% { opacity: 1; }
      100% { opacity: 0; }
    }
    #termwatch-vm-exit {
      position: fixed;
      bottom: 16px;
      right: 16px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(12, 12, 20, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      z-index: 2147483647;
      transition: background 0.15s, color 0.15s;
    }
    #termwatch-vm-exit:hover {
      background: rgba(12, 12, 20, 0.9);
      color: #d4915e;
      border-color: rgba(212, 145, 94, 0.4);
    }
  `;

  document.head.appendChild(videoModeStyle);
  document.body.appendChild(videoModeOverlay);

  document.getElementById('termwatch-vm-exit').addEventListener('click', () => {
    ipcRenderer.send('video:exit-video-mode');
  });
}

function removeVideoModeOverlay() {
  if (videoModeOverlay) {
    videoModeOverlay.remove();
    videoModeOverlay = null;
  }
  if (videoModeStyle) {
    videoModeStyle.remove();
    videoModeStyle = null;
  }
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
