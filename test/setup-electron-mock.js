/**
 * Vitest setup file that patches Node's Module._load to intercept
 * require() calls for Electron-specific modules in CJS source files.
 *
 * Vitest's vi.mock only intercepts ESM imports, not CJS require() calls.
 * Since the source code is CJS and uses require('electron'), require('electron-store'),
 * require('electron-log'), etc., we need to patch Module._load to return mocks.
 */
import Module from 'module';

// --- electron mock ---
const handlers = new Map();
const listeners = new Map();

const electronMock = {
  ipcMain: {
    handle: (ch, h) => { handlers.set(ch, h); },
    on: (ch, h) => {
      if (!listeners.has(ch)) listeners.set(ch, []);
      listeners.get(ch).push(h);
    },
    removeHandler: (ch) => { handlers.delete(ch); },
  },
  screen: {
    getDisplayNearestPoint: () => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  },
  session: {
    fromPartition: () => ({
      clearStorageData: async () => {},
      clearCache: async () => {},
      webRequest: { onBeforeSendHeaders: () => {} },
    }),
  },
  _handlers: handlers,
  _listeners: listeners,
};

// --- electron-store mock ---
class MockStore {
  constructor(opts = {}) {
    this._defaults = opts.defaults || {};
    this._data = new Map();
  }
  get(key) {
    if (this._data.has(key)) return this._data.get(key);
    return this._defaults[key];
  }
  set(key, value) {
    if (typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) this._data.set(k, v);
    } else {
      this._data.set(key, value);
    }
  }
  clear() { this._data.clear(); }
  has(key) { return this._data.has(key) || key in this._defaults; }
  delete(key) { this._data.delete(key); }
}

// --- electron-log mock ---
const logMock = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
};

// --- Expose mocks for tests ---
globalThis.__electronMock = electronMock;
globalThis.__MockStore = MockStore;

// --- Patch Module._load ---
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return globalThis.__electronMock;
  if (request === 'electron-store') return MockStore;
  if (request === 'electron-log') return logMock;
  return originalLoad.call(this, request, parent, isMain);
};
