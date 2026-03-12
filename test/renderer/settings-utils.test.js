import { describe, it, expect } from 'vitest';
import { hexToRgba, normalizeHex } from '../../src/renderer/js/settings-utils.js';

describe('hexToRgba()', () => {
  it('#e8e6e3 with alpha 0.3', () => {
    expect(hexToRgba('#e8e6e3', 0.3)).toBe('rgba(232, 230, 227, 0.3)');
  });

  it('#000000 with alpha 1', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });

  it('#ffffff with alpha 0', () => {
    expect(hexToRgba('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
  });
});

describe('normalizeHex()', () => {
  it('lowercases uppercase hex with #', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc');
  });

  it('prepends # when missing', () => {
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
  });

  it('returns null for invalid hex (#xyz)', () => {
    expect(normalizeHex('#xyz')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeHex('')).toBeNull();
  });

  it('returns null for short hex (3-char)', () => {
    expect(normalizeHex('#abc')).toBeNull();
  });

  it('handles already-normalized input', () => {
    expect(normalizeHex('#aabbcc')).toBe('#aabbcc');
  });
});
