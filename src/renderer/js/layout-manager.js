class LayoutManager {
  constructor(terminalManager, containerEl) {
    this.terminalManager = terminalManager;
    this.container = containerEl;
    this.currentLayout = '1x1';
    this.panels = [];
    this.subtitleZonePercent = 15;
    this._nextPanelId = 0;
  }

  // Layout definitions: each is an array of { row, col, rowSpan, colSpan }
  static LAYOUTS = {
    '1x1': { rows: 1, cols: 1, panels: [{ r: 0, c: 0, rs: 1, cs: 1 }] },
    '1x2': {
      rows: 1,
      cols: 2,
      panels: [
        { r: 0, c: 0, rs: 1, cs: 1 },
        { r: 0, c: 1, rs: 1, cs: 1 },
      ],
    },
    '2x1': {
      rows: 2,
      cols: 1,
      panels: [
        { r: 0, c: 0, rs: 1, cs: 1 },
        { r: 1, c: 0, rs: 1, cs: 1 },
      ],
    },
    '2x2': {
      rows: 2,
      cols: 2,
      panels: [
        { r: 0, c: 0, rs: 1, cs: 1 },
        { r: 0, c: 1, rs: 1, cs: 1 },
        { r: 1, c: 0, rs: 1, cs: 1 },
        { r: 1, c: 1, rs: 1, cs: 1 },
      ],
    },
    '1x3': {
      rows: 1,
      cols: 3,
      panels: [
        { r: 0, c: 0, rs: 1, cs: 1 },
        { r: 0, c: 1, rs: 1, cs: 1 },
        { r: 0, c: 2, rs: 1, cs: 1 },
      ],
    },
  };

  async setLayout(layoutName) {
    const layout = LayoutManager.LAYOUTS[layoutName];
    if (!layout) return;

    // Destroy existing terminals
    this.terminalManager.destroyAll();
    this.container.innerHTML = '';
    this.panels = [];
    this.currentLayout = layoutName;

    // Set grid template
    const subtitleZone = this.subtitleZonePercent;
    const terminalHeight = 100 - subtitleZone;

    // Build grid rows/cols
    const rowTemplate = Array(layout.rows)
      .fill(`${terminalHeight / layout.rows}%`)
      .join(' ');
    const colTemplate = Array(layout.cols).fill('1fr').join(' ');

    this.container.style.gridTemplateRows = `${rowTemplate} ${subtitleZone}%`;
    this.container.style.gridTemplateColumns = colTemplate;

    // Create panels
    for (const panelDef of layout.panels) {
      await this._createPanel(panelDef, layout);
    }

    // Fit all terminals after layout settles
    requestAnimationFrame(() => {
      this.terminalManager.fitAll();
    });
  }

  async _createPanel(panelDef, layout) {
    const panelId = this._nextPanelId++;

    // Panel wrapper
    const panel = document.createElement('div');
    panel.className = 'terminal-panel';
    panel.dataset.panelId = panelId;
    panel.style.gridRow = `${panelDef.r + 1} / span ${panelDef.rs}`;
    panel.style.gridColumn = `${panelDef.c + 1} / span ${panelDef.cs}`;
    panel.style.background = `rgba(12, 12, 20, ${this.terminalManager._opacity})`;

    // Terminal container
    const termContainer = document.createElement('div');
    termContainer.className = 'terminal-container';
    termContainer.style.width = '100%';
    termContainer.style.height = '100%';
    panel.appendChild(termContainer);

    // Focus on click
    panel.addEventListener('mousedown', () => {
      this.terminalManager.focusTerminal(panelId);
    });

    this.container.appendChild(panel);
    this.panels.push({ panelId, element: panel });

    // Create terminal instance
    await this.terminalManager.create(termContainer, panelId);
  }

  removePanel(panelId) {
    const idx = this.panels.findIndex((p) => p.panelId === panelId);
    if (idx === -1) return;

    this.terminalManager.destroy(panelId);
    this.panels[idx].element.remove();
    this.panels.splice(idx, 1);
  }

  setSubtitleZone(percent) {
    this.subtitleZonePercent = percent;
    // Re-apply current layout
    this.setLayout(this.currentLayout);
  }

  cycleLayout() {
    const layouts = Object.keys(LayoutManager.LAYOUTS);
    const idx = layouts.indexOf(this.currentLayout);
    const next = layouts[(idx + 1) % layouts.length];
    this.setLayout(next);
    return next;
  }

  getLayoutNames() {
    return Object.keys(LayoutManager.LAYOUTS);
  }
}

module.exports = LayoutManager;
