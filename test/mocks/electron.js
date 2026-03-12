/**
 * Mock Electron module for unit/integration tests.
 * Captures ipcMain.handle/on registrations for test invocation.
 */
import { vi } from 'vitest';

// --- IPC mock ---
const handlers = new Map();
const listeners = new Map();

export const ipcMain = {
  handle: vi.fn((channel, handler) => {
    handlers.set(channel, handler);
  }),
  on: vi.fn((channel, handler) => {
    if (!listeners.has(channel)) listeners.set(channel, []);
    listeners.get(channel).push(handler);
  }),
  removeHandler: vi.fn((channel) => {
    handlers.delete(channel);
  }),
  _handlers: handlers,
  _listeners: listeners,
  _reset() {
    handlers.clear();
    listeners.clear();
  },
};

export const ipcRenderer = {
  send: vi.fn(),
  on: vi.fn(),
  invoke: vi.fn(),
  removeAllListeners: vi.fn(),
};

export async function simulateInvoke(channel, event, ...args) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler for channel: ${channel}`);
  return handler(event, ...args);
}

export function simulateSend(channel, event, ...args) {
  const fns = listeners.get(channel) || [];
  for (const fn of fns) {
    fn(event, ...args);
  }
}

export const screen = {
  getDisplayNearestPoint: vi.fn(() => ({
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  })),
};

export const session = {
  fromPartition: vi.fn(() => ({
    clearStorageData: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
    webRequest: { onBeforeSendHeaders: vi.fn() },
  })),
};

export function createMockWebContentsView() {
  const webContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    goBack: vi.fn(),
    goForward: vi.fn(),
    insertCSS: vi.fn(async () => 'css-key'),
    removeInsertedCSS: vi.fn(async () => {}),
    setAudioMuted: vi.fn(),
    on: vi.fn(),
  };
  return {
    webContents,
    setVisible: vi.fn(),
    setBounds: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 800 })),
  };
}

export function createMockBaseWindow() {
  return {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 1280, height: 800 })),
    setBounds: vi.fn(),
    getPosition: vi.fn(() => [100, 100]),
    setPosition: vi.fn(),
  };
}

export const contextBridge = {
  exposeInMainWorld: vi.fn(),
};

// Default export for vi.mock(() => import(...))
export default {
  ipcMain,
  ipcRenderer,
  screen,
  session,
  contextBridge,
  simulateInvoke,
  simulateSend,
  createMockWebContentsView,
  createMockBaseWindow,
};
