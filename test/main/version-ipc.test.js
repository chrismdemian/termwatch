import { describe, it, expect, beforeEach } from 'vitest';

const handlers = globalThis.__electronMock._handlers;

function simulateInvoke(channel, event, ...args) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`No handler: ${channel}`);
  return handler(event, ...args);
}

describe('app:get-version IPC handler', () => {
  beforeEach(() => {
    globalThis.__electronMock._reset();
    // Re-register handlers by re-requiring ipc-handlers
    // Clear the module cache first
    const modPath = require.resolve('../../src/main/ipc-handlers');
    delete require.cache[modPath];
    // Also clear store and pty-manager caches to avoid stale state
    try { delete require.cache[require.resolve('../../src/main/store')]; } catch {}
    try { delete require.cache[require.resolve('../../src/main/pty-manager')]; } catch {}
    try { delete require.cache[require.resolve('../../src/main/logger')]; } catch {}

    const ipcHandlers = require('../../src/main/ipc-handlers');
    ipcHandlers.register();
  });

  it('should register the app:get-version handler', () => {
    expect(handlers.has('app:get-version')).toBe(true);
  });

  it('should return a semver-like version string', async () => {
    const event = { senderFrame: { url: 'file:///app.html' } };
    const version = await simulateInvoke('app:get-version', event);
    // Should be a string matching semver pattern (e.g., 1.0.0)
    expect(typeof version).toBe('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should reject non-app-view requests', async () => {
    const event = { senderFrame: { url: 'https://example.com' } };
    const version = await simulateInvoke('app:get-version', event);
    expect(version).toBeNull();
  });
});
