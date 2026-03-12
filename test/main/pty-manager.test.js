import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real @lydell/node-pty has native bindings that vi.mock can't intercept
// reliably after vi.resetModules(). We test what we can without mocking.
// The pty-manager is tested via ipc-handlers integration tests in Session 2.

// Mock only the logger and tree-kill (pure JS modules mock fine)
vi.mock('electron-log', () => ({
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
vi.mock('tree-kill', () => ({
  default: (pid, signal, cb) => cb && cb(null),
}));

describe('pty-manager', () => {
  let ptyManager;

  beforeEach(async () => {
    vi.resetModules();
    ptyManager = await import('../../src/main/pty-manager.js');
  });

  describe('getAvailableShells()', () => {
    it('returns array with at least one entry', () => {
      const shells = ptyManager.getAvailableShells();
      expect(Array.isArray(shells)).toBe(true);
      expect(shells.length).toBeGreaterThanOrEqual(1);
    });

    it('caches result on second call', () => {
      const first = ptyManager.getAvailableShells();
      const second = ptyManager.getAvailableShells();
      expect(first).toBe(second);
    });

    it('marks exactly one shell as default', () => {
      const shells = ptyManager.getAvailableShells();
      const defaults = shells.filter(s => s.default);
      expect(defaults.length).toBe(1);
    });

    it('each shell has required properties', () => {
      const shells = ptyManager.getAvailableShells();
      for (const s of shells) {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('command');
        expect(s).toHaveProperty('args');
        expect(typeof s.id).toBe('string');
        expect(typeof s.name).toBe('string');
      }
    });

    it('on win32, includes powershell', () => {
      if (process.platform !== 'win32') return;
      const shells = ptyManager.getAvailableShells();
      const ps = shells.find(s => s.id === 'powershell');
      expect(ps).toBeTruthy();
      expect(ps.command).toBe('powershell.exe');
    });
  });

  describe('createPty()', () => {
    it('returns { id, pid } on success', () => {
      const result = ptyManager.createPty(80, 24);
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('pid');
      expect(typeof result.id).toBe('number');
      expect(typeof result.pid).toBe('number');
    });

    it('increments ID on each call', () => {
      const r1 = ptyManager.createPty(80, 24);
      const r2 = ptyManager.createPty(80, 24);
      expect(r2.id).toBe(r1.id + 1);
      // Clean up
      ptyManager.forceKillAll();
    });
  });

  describe('writePty()', () => {
    it('no-ops for invalid ID without throwing', () => {
      expect(() => ptyManager.writePty(999, 'hello')).not.toThrow();
    });

    it('writes to valid PTY without throwing', () => {
      const result = ptyManager.createPty(80, 24);
      expect(() => ptyManager.writePty(result.id, 'echo test\n')).not.toThrow();
      ptyManager.forceKillAll();
    });
  });

  describe('resizePty()', () => {
    it('does not throw for nonexistent ID', () => {
      expect(() => ptyManager.resizePty(999, 100, 50)).not.toThrow();
    });

    it('resizes valid PTY without throwing', () => {
      const result = ptyManager.createPty(80, 24);
      expect(() => ptyManager.resizePty(result.id, 100, 50)).not.toThrow();
      ptyManager.forceKillAll();
    });
  });

  describe('destroyPty()', () => {
    it('resolves for nonexistent ID', async () => {
      await expect(ptyManager.destroyPty(999)).resolves.toBeUndefined();
    });

    it('removes pty from map after destroy', async () => {
      const result = ptyManager.createPty(80, 24);
      expect(ptyManager.getPty(result.id)).toBeTruthy();
      await ptyManager.destroyPty(result.id);
      expect(ptyManager.getPty(result.id)).toBeUndefined();
    });
  });

  describe('destroyAll()', () => {
    it('destroys all active PTYs', async () => {
      const r1 = ptyManager.createPty(80, 24);
      const r2 = ptyManager.createPty(80, 24);
      await ptyManager.destroyAll();
      expect(ptyManager.getPty(r1.id)).toBeUndefined();
      expect(ptyManager.getPty(r2.id)).toBeUndefined();
    });
  });

  describe('forceKillAll()', () => {
    it('clears map after force kill', () => {
      const r1 = ptyManager.createPty(80, 24);
      const r2 = ptyManager.createPty(80, 24);
      ptyManager.forceKillAll();
      expect(ptyManager.getPty(r1.id)).toBeUndefined();
      expect(ptyManager.getPty(r2.id)).toBeUndefined();
    });
  });
});
