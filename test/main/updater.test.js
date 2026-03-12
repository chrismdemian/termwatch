import { describe, it, expect, beforeEach } from 'vitest';

// Helper: get a fresh updater module with isPackaged=true and a tracking mock view
function setupPackagedUpdater() {
  const origIsPackaged = globalThis.__electronMock.app.isPackaged;
  globalThis.__electronMock.app.isPackaged = true;

  delete require.cache[require.resolve('../../src/main/updater')];
  delete require.cache[require.resolve('../../src/main/logger')];
  const freshUpdater = require('../../src/main/updater');

  const sent = [];
  const mockView = {
    webContents: {
      send: (...args) => sent.push(args),
      isDestroyed: () => false,
    },
  };

  freshUpdater.initAutoUpdater(mockView);

  return { updater: freshUpdater, sent, restore: () => { freshUpdater.cleanup(); globalThis.__electronMock.app.isPackaged = origIsPackaged; } };
}

describe('updater module', () => {
  let updater;
  let updaterMock;

  beforeEach(() => {
    globalThis.__electronMock._reset();

    updaterMock = globalThis.__updaterMock;
    updaterMock.autoUpdater.autoDownload = true;
    updaterMock.autoUpdater.autoInstallOnAppQuit = true;
    updaterMock.autoUpdater.channel = 'latest';
    updaterMock.autoUpdater.logger = null;
    updaterMock.autoUpdater._handlers = {};

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
    updater.initAutoUpdater(mockView);

    expect(updaterMock.autoUpdater.autoDownload).toBe(true);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it('should set autoDownload=false and autoInstallOnAppQuit=false when packaged', () => {
    const { restore } = setupPackagedUpdater();

    expect(updaterMock.autoUpdater.autoDownload).toBe(false);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false);

    restore();
  });

  it('should forward update-available event with releaseNotes', () => {
    const { sent, restore } = setupPackagedUpdater();

    const handler = updaterMock.autoUpdater._handlers['update-available'];
    expect(handler).toBeDefined();

    handler({ version: '2.0.0', releaseDate: '2026-03-11', releaseNotes: 'Bug fixes' });

    expect(sent.length).toBe(1);
    expect(sent[0][0]).toBe('app:update-available');
    expect(sent[0][1].version).toBe('2.0.0');
    expect(sent[0][1].releaseNotes).toBe('Bug fixes');

    restore();
  });

  it('should forward update-not-available event', () => {
    const { sent, restore } = setupPackagedUpdater();

    const handler = updaterMock.autoUpdater._handlers['update-not-available'];
    expect(handler).toBeDefined();

    handler();

    expect(sent.some(msg => msg[0] === 'app:update-not-available')).toBe(true);

    restore();
  });

  it('should forward download-progress event', () => {
    const { sent, restore } = setupPackagedUpdater();

    const handler = updaterMock.autoUpdater._handlers['download-progress'];
    expect(handler).toBeDefined();

    handler({ percent: 42, bytesPerSecond: 100000, transferred: 420000, total: 1000000 });

    const msg = sent.find(m => m[0] === 'app:download-progress');
    expect(msg).toBeDefined();
    expect(msg[1].percent).toBe(42);
    expect(msg[1].total).toBe(1000000);

    restore();
  });

  it('should forward error event to renderer', () => {
    const { sent, restore } = setupPackagedUpdater();

    const handler = updaterMock.autoUpdater._handlers['error'];
    expect(handler).toBeDefined();

    handler(new Error('Network timeout'));

    const msg = sent.find(m => m[0] === 'app:update-error');
    expect(msg).toBeDefined();
    expect(msg[1].message).toBe('Network timeout');

    restore();
  });

  it('should export checkForUpdates and it should be callable', () => {
    expect(typeof updater.checkForUpdates).toBe('function');
    // Should not throw even without initialization
    expect(() => updater.checkForUpdates()).not.toThrow();
  });

  it('should export setChannel and set autoUpdater.channel', () => {
    const { updater: pkgUpdater, restore } = setupPackagedUpdater();

    pkgUpdater.setChannel('beta');
    expect(updaterMock.autoUpdater.channel).toBe('beta');

    pkgUpdater.setChannel('latest');
    expect(updaterMock.autoUpdater.channel).toBe('latest');

    restore();
  });

  it('setChannel should be safe when autoUpdater is null', () => {
    // updater not initialized (not packaged), autoUpdater is null internally
    expect(() => updater.setChannel('beta')).not.toThrow();
  });

  it('cleanup should clear references', () => {
    updater.cleanup();
    expect(() => updater.downloadUpdate()).not.toThrow();
    expect(() => updater.installUpdate()).not.toThrow();
    expect(() => updater.setChannel('beta')).not.toThrow();
  });
});
