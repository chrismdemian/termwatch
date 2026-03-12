import { describe, it, expect, vi, beforeEach } from 'vitest';

// electron-store is mocked via Module._load in setup-electron-mock.js (returns MockStore class).
// store.js creates a singleton `new MockStore({defaults: {...}})`.
// We import it once and clear its internal state between tests.

import store from '../../src/main/store.js';

describe('store', () => {
  beforeEach(() => {
    // Reset internal MockStore data so defaults are returned
    store.clear();
  });

  it('initializes with all expected default keys', () => {
    const expectedKeys = [
      'windowBounds', 'layout', 'customPanelSizes', 'opacity',
      'shadowIntensity', 'bookmarks', 'lastVideoUrl', 'subtitleZoneHeight',
      'terminalFontSize', 'terminalFontFamily', 'terminalTextColor',
      'terminalSelectionColor', 'terminalCursorStyle', 'terminalCursorBlink',
      'terminalScrollback', 'autoHideDelay', 'defaultLayout',
      'startInVideoMode', 'disableHardwareAcceleration', 'isFullscreen', 'shellConfig',
    ];
    for (const key of expectedKeys) {
      expect(store.get(key)).toBeDefined();
    }
  });

  it('windowBounds default: width=1280, height=800', () => {
    const bounds = store.get('windowBounds');
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(800);
  });

  it('layout default is 1x1', () => {
    expect(store.get('layout')).toBe('1x1');
  });

  it('opacity default is 0.3', () => {
    expect(store.get('opacity')).toBe(0.3);
  });

  it('bookmarks default is empty array', () => {
    expect(store.get('bookmarks')).toEqual([]);
  });

  it('get() returns default when key not explicitly set', () => {
    expect(store.get('terminalFontSize')).toBe(14);
  });

  it('set() then get() roundtrip works', () => {
    store.set('opacity', 0.7);
    expect(store.get('opacity')).toBe(0.7);
  });

  it('clear() resets to defaults', () => {
    store.set('opacity', 0.9);
    store.clear();
    expect(store.get('opacity')).toBe(0.3);
  });
});
