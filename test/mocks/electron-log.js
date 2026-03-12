/**
 * Mock electron-log: no-op logger with spy functions.
 */
import { vi } from 'vitest';

export const info = vi.fn();
export const warn = vi.fn();
export const error = vi.fn();
export const debug = vi.fn();
export const verbose = vi.fn();
export const silly = vi.fn();

export const transports = {
  file: { level: false },
  console: { level: false },
};

export default { info, warn, error, debug, verbose, silly, transports };
