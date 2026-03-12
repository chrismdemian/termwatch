import { describe, it, expect } from 'vitest';
import { formatTime, normalizeUrl } from '../../src/renderer/js/controls-utils.js';

describe('formatTime()', () => {
  it('formatTime(0) → "0:00"', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formatTime(65) → "1:05"', () => {
    expect(formatTime(65)).toBe('1:05');
  });

  it('formatTime(3661) → "61:01"', () => {
    expect(formatTime(3661)).toBe('61:01');
  });

  it('formatTime(-1) → "0:00"', () => {
    expect(formatTime(-1)).toBe('0:00');
  });

  it('formatTime(NaN) → "0:00"', () => {
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('formatTime(Infinity) → "0:00"', () => {
    expect(formatTime(Infinity)).toBe('0:00');
  });
});

describe('normalizeUrl()', () => {
  it('prepends https:// when missing', () => {
    expect(normalizeUrl('youtube.com')).toBe('https://youtube.com');
  });

  it('leaves https:// URLs unchanged', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('leaves http:// URLs unchanged', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeUrl('  youtube.com  ')).toBe('https://youtube.com');
  });

  it('returns falsy input as-is', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeUndefined();
  });
});
