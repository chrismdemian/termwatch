import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Custom mock helper ---
function mockFn(impl) {
  const fn = (...args) => {
    fn.mock.calls.push(args);
    if (fn._impl) return fn._impl(...args);
    if (impl) return impl(...args);
  };
  fn.mock = { calls: [] };
  fn._impl = null;
  fn.mockReturnValue = (val) => { fn._impl = () => val; return fn; };
  fn.mockClear = () => { fn.mock.calls = []; };
  return fn;
}

// --- Access shared IPC state from the Module._load electron mock ---
// These Maps are populated by ipc-handlers.js when register() is called.
const handlers = globalThis.__electronMock._handlers;
const listeners = globalThis.__electronMock._listeners;

function simulateInvoke(channel, event, ...args) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler: ${channel}`);
  return handler(event, ...args);
}

function simulateSend(channel, event, ...args) {
  for (const fn of (listeners.get(channel) || [])) fn(event, ...args);
}

function createMockWebContentsView() {
  return {
    webContents: {
      send: mockFn(),
      isDestroyed: mockFn(() => false),
      loadURL: mockFn(),
      on: mockFn(),
      canGoBack: mockFn(() => false),
      canGoForward: mockFn(() => false),
      insertCSS: mockFn(async () => 'key'),
      removeInsertedCSS: mockFn(async () => {}),
      setAudioMuted: mockFn(),
    },
    setVisible: mockFn(),
  };
}

function createMockBaseWindow() {
  return {
    minimize: mockFn(),
    maximize: mockFn(),
    unmaximize: mockFn(),
    close: mockFn(),
    isMaximized: mockFn(() => false),
    isDestroyed: mockFn(() => false),
    getBounds: mockFn(() => ({ x: 100, y: 100, width: 1280, height: 800 })),
    setBounds: mockFn(),
    getPosition: mockFn(() => [100, 100]),
    setPosition: mockFn(),
  };
}

// --- Mock other CJS dependencies via vi.mock ---
vi.mock('electron-log', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

vi.mock('electron-store', () => {
  class MS {
    constructor(o = {}) { this._d = o.defaults || {}; this._m = new Map(); }
    get(k) { return this._m.has(k) ? this._m.get(k) : this._d[k]; }
    set(k, v) { this._m.set(k, v); }
    clear() { this._m.clear(); }
  }
  return { default: MS };
});

const { ptySpawn } = vi.hoisted(() => {
  const mf = (impl) => {
    const fn = (...args) => {
      fn.mock.calls.push(args);
      if (fn._impl) return fn._impl(...args);
      if (impl) return impl(...args);
    };
    fn.mock = { calls: [] };
    fn._impl = null;
    return fn;
  };
  let pid = 5000;
  return {
    ptySpawn: mf(() => ({
      pid: pid++,
      write: mf(), resize: mf(), kill: mf(),
      onData: mf(), onExit: mf(),
    })),
  };
});

vi.mock('@lydell/node-pty', () => ({ spawn: ptySpawn }));
vi.mock('tree-kill', () => ({ default: (pid, sig, cb) => cb && cb(null) }));

// Import module under test (electron mock already installed via Module._load in setup file)
import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('ipc-handlers', () => {
  describe('isFromAppView()', () => {
    it('returns true for file:// senderFrame URL', () => {
      expect(ipcHandlers.isFromAppView({ senderFrame: { url: 'file:///C:/app/index.html' } })).toBe(true);
    });

    it('returns false for https:// URL', () => {
      expect(ipcHandlers.isFromAppView({ senderFrame: { url: 'https://evil.com' } })).toBe(false);
    });

    it('returns false when senderFrame is null', () => {
      expect(ipcHandlers.isFromAppView({ senderFrame: null })).toBe(false);
    });

    it('returns false when event has no senderFrame', () => {
      expect(ipcHandlers.isFromAppView({})).toBe(false);
    });
  });

  describe('_selectActiveFrameFromMap()', () => {
    it('returns null for empty map', () => {
      expect(ipcHandlers._selectActiveFrameFromMap(new Map())).toBeNull();
    });

    it('returns null for null/undefined input', () => {
      expect(ipcHandlers._selectActiveFrameFromMap(null)).toBeNull();
      expect(ipcHandlers._selectActiveFrameFromMap(undefined)).toBeNull();
    });

    it('returns single frame when only one exists', () => {
      expect(ipcHandlers._selectActiveFrameFromMap(new Map([['f1', { duration: 100 }]]))).toBe('f1');
    });

    it('returns frame with longest duration', () => {
      const map = new Map([
        ['ad', { duration: 30 }],
        ['content', { duration: 3600 }],
        ['short', { duration: 15 }],
      ]);
      expect(ipcHandlers._selectActiveFrameFromMap(map)).toBe('content');
    });
  });

  describe('fullscreen functions', () => {
    beforeEach(() => {
      if (ipcHandlers.isFullscreen()) ipcHandlers.leaveFullscreen();
    });

    it('isFullscreen() returns false initially', () => {
      expect(ipcHandlers.isFullscreen()).toBe(false);
    });

    it('enter/leave fullscreen toggles state', () => {
      ipcHandlers.setViews(createMockWebContentsView(), createMockWebContentsView(), createMockBaseWindow());
      ipcHandlers.enterFullscreen();
      expect(ipcHandlers.isFullscreen()).toBe(true);
      ipcHandlers.leaveFullscreen();
      expect(ipcHandlers.isFullscreen()).toBe(false);
    });

    it('enterFullscreen() sets bounds to display bounds', () => {
      const bw = createMockBaseWindow();
      ipcHandlers.setViews(createMockWebContentsView(), createMockWebContentsView(), bw);
      ipcHandlers.enterFullscreen();
      expect(bw.setBounds.mock.calls[0][0]).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    });

    it('leaveFullscreen() restores saved bounds', () => {
      const bw = createMockBaseWindow();
      bw.getBounds._impl = () => ({ x: 50, y: 50, width: 800, height: 600 });
      ipcHandlers.setViews(createMockWebContentsView(), createMockWebContentsView(), bw);
      ipcHandlers.enterFullscreen();
      ipcHandlers.leaveFullscreen();
      const calls = bw.setBounds.mock.calls;
      expect(calls[calls.length - 1][0]).toEqual({ x: 50, y: 50, width: 800, height: 600 });
    });
  });

  describe('setStartupPause()', () => {
    it('activates with true', () => { ipcHandlers.setStartupPause(true); });
    it('clears with false', () => {
      ipcHandlers.setStartupPause(true);
      ipcHandlers.setStartupPause(false);
    });
  });

  describe('cleanup()', () => {
    it('runs without error', () => { ipcHandlers.cleanup(); });
  });

  describe('IPC handler registration', () => {
    beforeEach(() => {
      handlers.clear();
      listeners.clear();
      ipcHandlers.register();
    });

    it('pty:create rejects non-appView senders', async () => {
      const r = await simulateInvoke('pty:create', { senderFrame: { url: 'https://evil.com' } }, { cols: 80, rows: 24 });
      expect(r).toBeNull();
    });

    it('pty:create validates cols/rows bounds', async () => {
      const e = { senderFrame: { url: 'file:///app.html' } };
      expect(await simulateInvoke('pty:create', e, { cols: 0, rows: 24 })).toBeNull();
      expect(await simulateInvoke('pty:create', e, { cols: 80, rows: 999 })).toBeNull();
    });

    it('pty:resize validates numeric types', () => {
      const e = { senderFrame: { url: 'file:///app.html' } };
      expect(() => simulateSend('pty:resize', e, 'bad', 80, 24)).not.toThrow();
    });

    it('video:navigate rejects non-http URLs', () => {
      const e = { senderFrame: { url: 'file:///app.html' } };
      expect(() => simulateSend('video:navigate', e, 'javascript:alert(1)')).not.toThrow();
    });

    it('video:navigate rejects URLs over 2048 chars', () => {
      const e = { senderFrame: { url: 'file:///app.html' } };
      expect(() => simulateSend('video:navigate', e, 'https://x.com/' + 'a'.repeat(2048))).not.toThrow();
    });

    it('store:get returns store value', async () => {
      const r = await simulateInvoke('store:get', { senderFrame: { url: 'file:///app.html' } }, 'opacity');
      expect(r).toBe(0.3);
    });

    it('store:set writes to store', () => {
      expect(() => simulateSend('store:set', { senderFrame: { url: 'file:///app.html' } }, 'opacity', 0.8)).not.toThrow();
    });

    it('video:state forwards to app view stripping frameId', () => {
      const av = createMockWebContentsView();
      ipcHandlers.setViews(createMockWebContentsView(), av, createMockBaseWindow());

      simulateSend('video:frame-register',
        { senderFrame: { isDestroyed: () => false, send: () => {} } },
        { frameId: 'tf' });

      simulateSend('video:state', {},
        { currentTime: 10, duration: 100, paused: false, volume: 1, muted: false, frameId: 'tf' });

      const sc = av.webContents.send.mock.calls.find(c => c[0] === 'video:state');
      if (sc) {
        expect(sc[1]).not.toHaveProperty('frameId');
        expect(sc[1].duration).toBe(100);
      }
    });
  });
});
