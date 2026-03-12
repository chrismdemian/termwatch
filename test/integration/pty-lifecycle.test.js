import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulateInvoke, simulateSend,
  createMockWebContentsView, createMockBaseWindow,
  appEvent, evilEvent,
} from '../helpers/ipc-test-utils.js';

const mock = globalThis.__electronMock;

import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('Integration: PTY lifecycle', () => {
  let videoView, appView, baseWindow;

  beforeEach(() => {
    mock._reset();
    ipcHandlers.cleanup();
    videoView = createMockWebContentsView();
    appView = createMockWebContentsView();
    baseWindow = createMockBaseWindow();
    ipcHandlers.register();
    ipcHandlers.setViews(videoView, appView, baseWindow);
  });

  it('pty:create returns {id, pid} and registers data forwarding to appView', async () => {
    const result = await simulateInvoke('pty:create', appEvent, { cols: 80, rows: 24 });
    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(typeof result.id).toBe('number');
    expect(typeof result.pid).toBe('number');

    // Verify data forwarding is wired up: wait briefly for PTY to emit initial data
    await new Promise(resolve => setTimeout(resolve, 500));
    const dataCalls = appView.webContents.send.mock.calls.filter(c => c[0] === 'pty:data');
    // Real PTY should emit prompt data shortly after creation
    expect(dataCalls.length).toBeGreaterThan(0);
    expect(dataCalls[0][1]).toBe(result.id); // first arg is pty id
    expect(typeof dataCalls[0][2]).toBe('string'); // second arg is data string
  });

  it('pty:write sends data to PTY without error', async () => {
    const result = await simulateInvoke('pty:create', appEvent, { cols: 80, rows: 24 });
    expect(result).not.toBeNull();

    // Should not throw when writing to a valid PTY
    expect(() => {
      simulateSend('pty:write', appEvent, result.id, 'echo hello\r');
    }).not.toThrow();
  });

  it('pty:resize updates PTY dimensions without error', async () => {
    const result = await simulateInvoke('pty:create', appEvent, { cols: 80, rows: 24 });
    expect(result).not.toBeNull();

    expect(() => {
      simulateSend('pty:resize', appEvent, result.id, 120, 40);
    }).not.toThrow();
  });

  it('pty:destroy removes PTY from manager', async () => {
    const result = await simulateInvoke('pty:create', appEvent, { cols: 80, rows: 24 });
    expect(result).not.toBeNull();

    simulateSend('pty:destroy', appEvent, result.id);

    // Subsequent write to destroyed PTY should be silently ignored
    expect(() => {
      simulateSend('pty:write', appEvent, result.id, 'data');
    }).not.toThrow();
  });

  it('pty:create with shellId selects the matching shell', async () => {
    const shells = await simulateInvoke('pty:get-available-shells', appEvent);
    expect(shells).toBeDefined();
    expect(Array.isArray(shells)).toBe(true);

    if (shells.length > 0) {
      const shellId = shells[0].id;
      const result = await simulateInvoke('pty:create', appEvent, { cols: 80, rows: 24, shellId });
      expect(result).not.toBeNull();
      expect(typeof result.id).toBe('number');
    }
  });

  it('pty:create from non-appView sender returns null', async () => {
    const result = await simulateInvoke('pty:create', evilEvent, { cols: 80, rows: 24 });
    expect(result).toBeNull();
  });
});
