import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulateInvoke, simulateSend,
  createMockWebContentsView, createMockBaseWindow,
  appEvent, evilEvent,
} from '../helpers/ipc-test-utils.js';

const mock = globalThis.__electronMock;

// ipc-handlers.js uses require('./store') via CJS — get the same instance
const store = require('../../src/main/store');
import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('Integration: Updater IPC', () => {
  let appView, videoView, baseWindow;

  beforeEach(() => {
    mock._reset();
    ipcHandlers.cleanup();
    store.clear();

    // Reset updater mock
    globalThis.__updaterMock.autoUpdater.channel = 'latest';

    videoView = createMockWebContentsView();
    appView = createMockWebContentsView();
    baseWindow = createMockBaseWindow();

    ipcHandlers.register();
    ipcHandlers.setViews(videoView, appView, baseWindow);
  });

  it('app:check-for-updates handler exists and is invokable', () => {
    const handler = mock._handlers.get('app:check-for-updates');
    expect(handler).toBeDefined();

    // Should not throw when invoked from app view
    expect(() => simulateInvoke('app:check-for-updates', appEvent)).not.toThrow();
  });

  it('app:check-for-updates rejects non-app-view senders', async () => {
    const result = await simulateInvoke('app:check-for-updates', evilEvent);
    expect(result).toBeUndefined();
  });

  it('app:set-update-channel handler validates input', () => {
    // Valid: 'latest'
    simulateSend('app:set-update-channel', appEvent, 'latest');
    expect(store.get('updateChannel')).toBe('latest');

    // Valid: 'beta'
    simulateSend('app:set-update-channel', appEvent, 'beta');
    expect(store.get('updateChannel')).toBe('beta');

    // Invalid: 'alpha' — should be ignored (store stays at 'beta')
    simulateSend('app:set-update-channel', appEvent, 'alpha');
    expect(store.get('updateChannel')).toBe('beta');

    // Invalid: number — should be ignored
    simulateSend('app:set-update-channel', appEvent, 42);
    expect(store.get('updateChannel')).toBe('beta');
  });

  it('app:set-update-channel rejects non-app-view senders', () => {
    simulateSend('app:set-update-channel', evilEvent, 'beta');
    // Should still be default 'latest' (evil sender rejected)
    expect(store.get('updateChannel')).toBe('latest');
  });
});
