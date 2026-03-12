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

// --- session mock with trackable calls ---
let sessionMock = {
  clearStorageData: async () => {},
  clearCache: async () => {},
  webRequest: { onBeforeSendHeaders: () => {} },
};

const electronMock = {
  app: {
    getVersion: () => '1.0.0',
    isPackaged: false,
    isReady: () => false,
    whenReady: () => Promise.resolve(),
    on: () => {},
    getName: () => 'termwatch-test',
    getPath: () => '/tmp',
  },
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
    fromPartition: () => sessionMock,
  },
  _handlers: handlers,
  _listeners: listeners,
  _reset() {
    handlers.clear();
    listeners.clear();
  },
  _resetSessionMock() {
    sessionMock = {
      clearStorageData: async () => {},
      clearCache: async () => {},
      webRequest: { onBeforeSendHeaders: () => {} },
    };
  },
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
  initialize: () => {},
  transports: { file: {}, console: {} },
};

// --- Expose mocks for tests ---
globalThis.__electronMock = electronMock;
globalThis.__MockStore = MockStore;

// --- electron-updater mock ---
const updaterMock = {
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null,
    _handlers: {},
    on: function(event, handler) { this._handlers[event] = handler; },
    checkForUpdates: async () => {},
    downloadUpdate: async () => {},
    quitAndInstall: () => {},
  },
};

globalThis.__updaterMock = updaterMock;

// --- Patch Module._load ---
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return globalThis.__electronMock;
  if (request === 'electron-store') return MockStore;
  if (request === 'electron-log' || request.startsWith('electron-log/')) return logMock;
  if (request === 'electron-updater') return updaterMock;
  return originalLoad.call(this, request, parent, isMain);
};
