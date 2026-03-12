import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulateSend,
  createMockWebContentsView, createMockBaseWindow, createFrameEvent,
  appEvent,
} from '../helpers/ipc-test-utils.js';

const mock = globalThis.__electronMock;

import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('Integration: Video control flow', () => {
  let videoView, appView, baseWindow;

  beforeEach(() => {
    mock._reset();
    ipcHandlers.clearVideoFrames();
    ipcHandlers.cleanup();
    videoView = createMockWebContentsView();
    appView = createMockWebContentsView();
    baseWindow = createMockBaseWindow();
    ipcHandlers.register();
    ipcHandlers.setViews(videoView, appView, baseWindow);
  });

  it('video:navigate loads URL in video view', () => {
    simulateSend('video:navigate', appEvent, 'https://www.youtube.com/watch?v=test');
    expect(videoView.webContents.loadURL.mock.calls.length).toBe(1);
    expect(videoView.webContents.loadURL.mock.calls[0][0]).toBe('https://www.youtube.com/watch?v=test');
  });

  it('video:frame-register adds frame and selects it as active', () => {
    const frameEvent = createFrameEvent('frame1');
    simulateSend('video:frame-register', frameEvent, { frameId: 'frame1' });

    // Frame should be registered — verify by sending state from this frame
    // which should be forwarded to appView
    simulateSend('video:state', {}, {
      currentTime: 5,
      duration: 120,
      paused: false,
      volume: 1,
      muted: false,
      frameId: 'frame1',
    });

    const stateCalls = appView.webContents.send.mock.calls.filter(c => c[0] === 'video:state');
    expect(stateCalls.length).toBeGreaterThan(0);
    expect(stateCalls[0][1].duration).toBe(120);
  });

  it('video:frame-update with duration updates frame metadata', () => {
    const frameEvent = createFrameEvent('frame1');
    simulateSend('video:frame-register', frameEvent, { frameId: 'frame1' });

    // Register a second frame with longer duration
    const frameEvent2 = createFrameEvent('frame2');
    simulateSend('video:frame-register', frameEvent2, { frameId: 'frame2' });
    simulateSend('video:frame-update', {}, { frameId: 'frame2', duration: 3600 });

    // frame2 should now be active (longest duration)
    simulateSend('video:state', {}, {
      currentTime: 10,
      duration: 3600,
      paused: false,
      volume: 1,
      muted: false,
      frameId: 'frame2',
    });

    const stateCalls = appView.webContents.send.mock.calls.filter(c => c[0] === 'video:state');
    expect(stateCalls.length).toBeGreaterThan(0);
  });

  it('video:state from active frame is forwarded to app view without frameId', () => {
    const frameEvent = createFrameEvent('content');
    simulateSend('video:frame-register', frameEvent, { frameId: 'content' });

    simulateSend('video:state', {}, {
      currentTime: 42,
      duration: 600,
      paused: true,
      volume: 0.8,
      muted: false,
      frameId: 'content',
    });

    const stateCalls = appView.webContents.send.mock.calls.filter(c => c[0] === 'video:state');
    expect(stateCalls.length).toBe(1);
    expect(stateCalls[0][1]).not.toHaveProperty('frameId');
    expect(stateCalls[0][1].currentTime).toBe(42);
    expect(stateCalls[0][1].duration).toBe(600);
    expect(stateCalls[0][1].paused).toBe(true);
  });

  it('video:state from non-active frame is dropped', () => {
    // Register two frames, make frame2 active via longer duration
    const frameEvent1 = createFrameEvent('ad');
    simulateSend('video:frame-register', frameEvent1, { frameId: 'ad' });
    simulateSend('video:frame-update', {}, { frameId: 'ad', duration: 15 });

    const frameEvent2 = createFrameEvent('content');
    simulateSend('video:frame-register', frameEvent2, { frameId: 'content' });
    simulateSend('video:frame-update', {}, { frameId: 'content', duration: 3600 });

    // Clear previous send calls
    appView.webContents.send.mock.calls = [];

    // State from the ad frame (non-active) should be dropped
    simulateSend('video:state', {}, {
      currentTime: 5,
      duration: 15,
      paused: false,
      volume: 1,
      muted: false,
      frameId: 'ad',
    });

    const stateCalls = appView.webContents.send.mock.calls.filter(c => c[0] === 'video:state');
    expect(stateCalls.length).toBe(0);
  });

  it('video:command routes to active frame via sendToActiveFrame', () => {
    const frameEvent = createFrameEvent('main');
    simulateSend('video:frame-register', frameEvent, { frameId: 'main' });

    simulateSend('video:command', appEvent, { type: 'video:toggle-play', data: undefined });

    // When sendToActiveFrame fails (mock frame.send not wired), falls back to videoView
    // Either path should not throw
    const videoSendCalls = videoView.webContents.send.mock.calls.filter(c => c[0] === 'video:toggle-play');
    const frameSendCalls = frameEvent.senderFrame.send.mock.calls.filter(c => c[0] === 'video:toggle-play');
    expect(videoSendCalls.length + frameSendCalls.length).toBeGreaterThan(0);
  });

  it('toggle-video-mode true hides app view and shows exit overlay', () => {
    simulateSend('toggle-video-mode', appEvent, true);

    expect(appView.setVisible.mock.calls.length).toBe(1);
    expect(appView.setVisible.mock.calls[0][0]).toBe(false);

    const overlayCalls = videoView.webContents.send.mock.calls.filter(c => c[0] === 'video:show-exit-overlay');
    expect(overlayCalls.length).toBe(1);
  });

  it('toggle-video-mode false shows app view and hides overlay', () => {
    // Enter video mode first
    simulateSend('toggle-video-mode', appEvent, true);
    // Clear call tracking
    appView.setVisible.mock.calls = [];
    videoView.webContents.send.mock.calls = [];

    // Exit video mode
    simulateSend('toggle-video-mode', appEvent, false);

    expect(appView.setVisible.mock.calls.length).toBe(1);
    expect(appView.setVisible.mock.calls[0][0]).toBe(true);

    const hideCalls = videoView.webContents.send.mock.calls.filter(c => c[0] === 'video:hide-exit-overlay');
    expect(hideCalls.length).toBe(1);
  });
});
