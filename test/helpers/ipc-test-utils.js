/**
 * Shared test utilities for integration tests.
 * Provides mock helpers, IPC simulation, and mock factories.
 */

const mock = globalThis.__electronMock;

export function mockFn(impl) {
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

export function simulateInvoke(channel, event, ...args) {
  const handler = mock._handlers.get(channel);
  if (!handler) throw new Error(`No handler: ${channel}`);
  return handler(event, ...args);
}

export function simulateSend(channel, event, ...args) {
  for (const fn of (mock._listeners.get(channel) || [])) fn(event, ...args);
}

export function createMockWebContentsView() {
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

export function createMockBaseWindow() {
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

export const appEvent = { senderFrame: { url: 'file:///C:/app/index.html' } };
export const evilEvent = { senderFrame: { url: 'https://evil.com' } };

export function createFrameEvent(frameId) {
  return {
    senderFrame: {
      url: 'https://video.com/page',
      isDestroyed: () => false,
      send: mockFn(),
    },
  };
}
