const { contextBridge, ipcRenderer } = require('electron');

// --- Video element detection and control ---
let currentVideo = null;

function findVideo() {
  return document.querySelector('video');
}

function attachVideoListeners(video) {
  if (currentVideo === video) return;
  currentVideo = video;

  const sendState = () => {
    if (!currentVideo) return;
    ipcRenderer.send('video:state', {
      currentTime: currentVideo.currentTime,
      duration: currentVideo.duration || 0,
      paused: currentVideo.paused,
      volume: currentVideo.volume,
      muted: currentVideo.muted,
    });
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

// --- IPC listeners for playback control ---
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

// Expose navigation API
contextBridge.exposeInMainWorld('videoAPI', {
  getUrl: () => window.location.href,
});
