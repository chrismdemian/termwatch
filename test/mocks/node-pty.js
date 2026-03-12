/**
 * Mock node-pty for testing pty-manager without spawning real processes.
 */
import { vi } from 'vitest';

let nextPid = 1000;

export function createMockPty() {
  const dataCallbacks = [];
  const exitCallbacks = [];

  return {
    pid: nextPid++,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((cb) => { dataCallbacks.push(cb); }),
    onExit: vi.fn((cb) => { exitCallbacks.push(cb); }),
    _emitData(data) {
      for (const cb of dataCallbacks) cb(data);
    },
    _emitExit(exitCode = 0, signal = 0) {
      for (const cb of exitCallbacks) cb({ exitCode, signal });
    },
  };
}

export const spawn = vi.fn(() => createMockPty());

export function _reset() {
  nextPid = 1000;
  spawn.mockClear();
  spawn.mockImplementation(() => createMockPty());
}

export default { spawn, createMockPty, _reset };
