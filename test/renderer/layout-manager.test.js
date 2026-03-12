import { describe, it, expect, vi, beforeEach } from 'vitest';
import LayoutManager from '../../src/renderer/js/layout-manager.js';

describe('LayoutManager', () => {
  let lm;
  let mockTerminalManager;
  let containerEl;

  beforeEach(() => {
    mockTerminalManager = {
      destroyAll: vi.fn(),
      create: vi.fn(async () => {}),
      focusTerminal: vi.fn(),
      fitAll: vi.fn(),
      destroy: vi.fn(),
      _opacity: 0.3,
    };

    containerEl = document.createElement('div');
    document.body.appendChild(containerEl);

    lm = new LayoutManager(mockTerminalManager, containerEl);
  });

  describe('LAYOUTS', () => {
    it('has 5 layouts: 1x1, 1x2, 2x1, 2x2, 1x3', () => {
      const names = Object.keys(LayoutManager.LAYOUTS);
      expect(names).toEqual(['1x1', '1x2', '2x1', '2x2', '1x3']);
    });

    it('1x1 has 1 panel', () => {
      expect(LayoutManager.LAYOUTS['1x1'].panels.length).toBe(1);
    });

    it('2x2 has 4 panels', () => {
      expect(LayoutManager.LAYOUTS['2x2'].panels.length).toBe(4);
    });

    it('1x3 has 3 panels', () => {
      expect(LayoutManager.LAYOUTS['1x3'].panels.length).toBe(3);
    });
  });

  describe('getNextLayoutName()', () => {
    it('cycles through layouts in order', () => {
      lm.currentLayout = '1x1';
      expect(lm.getNextLayoutName()).toBe('1x2');
    });

    it('wraps from last to first', () => {
      lm.currentLayout = '1x3';
      expect(lm.getNextLayoutName()).toBe('1x1');
    });
  });

  describe('getLayoutNames()', () => {
    it('returns all 5 names', () => {
      expect(lm.getLayoutNames()).toEqual(['1x1', '1x2', '2x1', '2x2', '1x3']);
      expect(lm.getLayoutNames().length).toBe(5);
    });
  });

  describe('setLayout()', () => {
    it('with invalid name does nothing', async () => {
      await lm.setLayout('invalid-layout');
      expect(mockTerminalManager.destroyAll).not.toHaveBeenCalled();
    });

    it('creates correct number of panels for 2x2', async () => {
      await lm.setLayout('2x2');
      expect(lm.panels.length).toBe(4);
      expect(mockTerminalManager.create).toHaveBeenCalledTimes(4);
    });

    it('sets currentLayout', async () => {
      await lm.setLayout('1x2');
      expect(lm.currentLayout).toBe('1x2');
    });
  });

  describe('grid template calculation', () => {
    it('1x1 with subtitleZone=15 → 85% single row', async () => {
      lm.subtitleZonePercent = 15;
      await lm.setLayout('1x1');
      expect(containerEl.style.gridTemplateRows).toBe('85% 15%');
    });

    it('2x2 with subtitleZone=15 → 42.5% per row', async () => {
      lm.subtitleZonePercent = 15;
      await lm.setLayout('2x2');
      expect(containerEl.style.gridTemplateRows).toBe('42.5% 42.5% 15%');
    });
  });

  describe('panel management', () => {
    it('panel ID increments across calls', async () => {
      await lm.setLayout('1x2');
      const ids = lm.panels.map(p => p.panelId);
      expect(ids[1]).toBe(ids[0] + 1);
    });

    it('removePanel() removes correct panel', async () => {
      await lm.setLayout('1x2');
      const idToRemove = lm.panels[0].panelId;
      lm.removePanel(idToRemove);
      expect(lm.panels.length).toBe(1);
      expect(lm.panels[0].panelId).not.toBe(idToRemove);
    });
  });

  describe('constructor', () => {
    it('initializes with currentLayout = "1x1"', () => {
      const fresh = new LayoutManager(mockTerminalManager, containerEl);
      expect(fresh.currentLayout).toBe('1x1');
    });
  });

  describe('setSubtitleZone()', () => {
    it('updates percentage and re-applies layout', async () => {
      await lm.setLayout('1x1');
      mockTerminalManager.destroyAll.mockClear();
      mockTerminalManager.create.mockClear();

      lm.setSubtitleZone(20);
      expect(lm.subtitleZonePercent).toBe(20);
      expect(mockTerminalManager.destroyAll).toHaveBeenCalled();
    });
  });
});
