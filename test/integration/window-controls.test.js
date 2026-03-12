import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulateSend,
  createMockWebContentsView, createMockBaseWindow,
  appEvent,
} from '../helpers/ipc-test-utils.js';

const mock = globalThis.__electronMock;

import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('Integration: Window controls', () => {
  let videoView, appView, baseWindow;

  beforeEach(() => {
    mock._reset();
    ipcHandlers.cleanup();
    videoView = createMockWebContentsView();
    appView = createMockWebContentsView();
    baseWindow = createMockBaseWindow();
    ipcHandlers.register();
    ipcHandlers.setViews(videoView, appView, baseWindow);
    // Ensure we start outside fullscreen
    if (ipcHandlers.isFullscreen()) ipcHandlers.leaveFullscreen();
  });

  it('window:minimize calls baseWindow.minimize()', () => {
    simulateSend('window:minimize', appEvent);
    expect(baseWindow.minimize.mock.calls.length).toBe(1);
  });

  it('window:maximize toggles between maximize and unmaximize', () => {
    // First call: not maximized → maximize
    simulateSend('window:maximize', appEvent);
    expect(baseWindow.maximize.mock.calls.length).toBe(1);

    // Now pretend window is maximized
    baseWindow.isMaximized.mockReturnValue(true);

    // Second call: maximized → unmaximize
    simulateSend('window:maximize', appEvent);
    expect(baseWindow.unmaximize.mock.calls.length).toBe(1);
  });

  it('window:close calls baseWindow.close()', () => {
    simulateSend('window:close', appEvent);
    expect(baseWindow.close.mock.calls.length).toBe(1);
  });

  it('window:toggle-fullscreen enters and leaves manual fullscreen', () => {
    // Enter fullscreen
    simulateSend('window:toggle-fullscreen', appEvent);
    expect(ipcHandlers.isFullscreen()).toBe(true);
    expect(baseWindow.setBounds.mock.calls.length).toBe(1);
    expect(baseWindow.setBounds.mock.calls[0][0]).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });

    // Leave fullscreen
    simulateSend('window:toggle-fullscreen', appEvent);
    expect(ipcHandlers.isFullscreen()).toBe(false);
    expect(baseWindow.setBounds.mock.calls.length).toBe(2);
  });

  it('window:move-by with finite values updates position', () => {
    simulateSend('window:move-by', appEvent, 50, -30);
    expect(baseWindow.setPosition.mock.calls.length).toBe(1);
    expect(baseWindow.setPosition.mock.calls[0]).toEqual([150, 70]);
  });

  it('window:move-by with non-finite values is rejected', () => {
    simulateSend('window:move-by', appEvent, Infinity, 10);
    expect(baseWindow.setPosition.mock.calls.length).toBe(0);

    simulateSend('window:move-by', appEvent, NaN, 10);
    expect(baseWindow.setPosition.mock.calls.length).toBe(0);

    simulateSend('window:move-by', appEvent, 10, undefined);
    expect(baseWindow.setPosition.mock.calls.length).toBe(0);
  });
});
