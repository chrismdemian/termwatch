import { describe, it, expect, beforeEach } from 'vitest';
import {
  simulateInvoke, simulateSend,
  createMockWebContentsView, createMockBaseWindow,
  appEvent, evilEvent,
} from '../helpers/ipc-test-utils.js';

const mock = globalThis.__electronMock;

import * as ipcHandlers from '../../src/main/ipc-handlers.js';

describe('Integration: Settings persistence', () => {
  beforeEach(() => {
    mock._reset();
    mock._resetSessionMock();
    ipcHandlers.cleanup();
    ipcHandlers.register();
    ipcHandlers.setViews(
      createMockWebContentsView(),
      createMockWebContentsView(),
      createMockBaseWindow(),
    );
  });

  it('store:set followed by store:get returns the same value', async () => {
    simulateSend('store:set', appEvent, 'opacity', 0.75);
    const value = await simulateInvoke('store:get', appEvent, 'opacity');
    expect(value).toBe(0.75);
  });

  it('app:clear-all-data clears store and session data', async () => {
    // Set a value first
    simulateSend('store:set', appEvent, 'opacity', 0.9);

    const result = await simulateInvoke('app:clear-all-data', appEvent);
    expect(result).toBe(true);

    // After clearing, store should return defaults
    const opacity = await simulateInvoke('store:get', appEvent, 'opacity');
    expect(opacity).toBe(0.3); // default value
  });

  it('store:get from non-appView sender returns undefined', async () => {
    const value = await simulateInvoke('store:get', evilEvent, 'opacity');
    expect(value).toBeUndefined();
  });

  it('store:get with non-string key returns undefined', async () => {
    const value = await simulateInvoke('store:get', appEvent, 123);
    expect(value).toBeUndefined();
  });
});
