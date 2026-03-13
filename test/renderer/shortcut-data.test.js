import { describe, it, expect } from 'vitest';
import SHORTCUT_DATA from '../../src/renderer/js/shortcut-data.js';

describe('SHORTCUT_DATA', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SHORTCUT_DATA)).toBe(true);
    expect(SHORTCUT_DATA.length).toBeGreaterThan(0);
  });

  it('each group has a category string and shortcuts array', () => {
    for (const group of SHORTCUT_DATA) {
      expect(typeof group.category).toBe('string');
      expect(group.category.length).toBeGreaterThan(0);
      expect(Array.isArray(group.shortcuts)).toBe(true);
      expect(group.shortcuts.length).toBeGreaterThan(0);
    }
  });

  it('each shortcut has a non-empty keys array and action string', () => {
    for (const group of SHORTCUT_DATA) {
      for (const shortcut of group.shortcuts) {
        expect(Array.isArray(shortcut.keys)).toBe(true);
        expect(shortcut.keys.length).toBeGreaterThan(0);
        for (const key of shortcut.keys) {
          expect(typeof key).toBe('string');
          expect(key.length).toBeGreaterThan(0);
        }
        expect(typeof shortcut.action).toBe('string');
        expect(shortcut.action.length).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate actions', () => {
    const actions = SHORTCUT_DATA.flatMap(g => g.shortcuts.map(s => s.action));
    const unique = new Set(actions);
    expect(unique.size).toBe(actions.length);
  });
});
