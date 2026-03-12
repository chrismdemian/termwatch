import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('updater module', () => {
  let updater;
  let updaterMock;

  beforeEach(() => {
    // Reset electron mock
    globalThis.__electronMock._reset();

    // Reset updater mock state
    updaterMock = globalThis.__updaterMock;
    updaterMock.autoUpdater.autoDownload = true;
    updaterMock.autoUpdater.autoInstallOnAppQuit = true;
    updaterMock.autoUpdater.logger = null;
    updaterMock.autoUpdater._handlers = {};

    // Clear module caches to get fresh state
    const paths = [
      '../../src/main/updater',
      '../../src/main/logger',
    ];
    for (const p of paths) {
      try { delete require.cache[require.resolve(p)]; } catch {}
    }

    updater = require('../../src/main/updater');
  });

  it('should skip initialization when app is not packaged', () => {
    const mockView = {
      webContents: { send: () => {}, isDestroyed: () => false },
    };

    // app.isPackaged is false in our mock
    updater.initAutoUpdater(mockView);

    // autoDownload should remain at mock default (true) since init was skipped
    expect(updaterMock.autoUpdater.autoDownload).toBe(true);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('should set autoDownload=false and autoInstallOnAppQuit=false when packaged', () => {
    // Temporarily set isPackaged to true
    const origIsPackaged = globalThis.__electronMock.app.isPackaged;
    globalThis.__electronMock.app.isPackaged = true;

    // Re-require to pick up isPackaged change
    delete require.cache[require.resolve('../../src/main/updater')];
    delete require.cache[require.resolve('../../src/main/logger')];
    const freshUpdater = require('../../src/main/updater');

    const mockView = {
      webContents: { send: () => {}, isDestroyed: () => false },
    };

    freshUpdater.initAutoUpdater(mockView);

    expect(updaterMock.autoUpdater.autoDownload).toBe(false);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false);

    freshUpdater.cleanup();
    globalThis.__electronMock.app.isPackaged = origIsPackaged;
  });

  it('should forward update-available event to app view', () => {
    const origIsPackaged = globalThis.__electronMock.app.isPackaged;
    globalThis.__electronMock.app.isPackaged = true;

    delete require.cache[require.resolve('../../src/main/updater')];
    delete require.cache[require.resolve('../../src/main/logger')];
    const freshUpdater = require('../../src/main/updater');

    const sentMessages = [];
    const mockView = {
      webContents: {
        send: (...args) => sentMessages.push(args),
        isDestroyed: () => false,
      },
    };

    freshUpdater.initAutoUpdater(mockView);

    // Simulate update-available event
    const handler = updaterMock.autoUpdater._handlers['update-available'];
    expect(handler).toBeDefined();

    handler({ version: '2.0.0', releaseDate: '2026-03-11' });

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0][0]).toBe('app:update-available');
    expect(sentMessages[0][1].version).toBe('2.0.0');

    freshUpdater.cleanup();
    globalThis.__electronMock.app.isPackaged = origIsPackaged;
  });

  it('cleanup should clear references', () => {
    updater.cleanup();
    // Should not throw after cleanup
    expect(() => updater.downloadUpdate()).not.toThrow();
    expect(() => updater.installUpdate()).not.toThrow();
  });
});
