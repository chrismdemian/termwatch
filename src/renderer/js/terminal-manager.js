const log = require('electron-log/renderer');
const { Terminal } = require('@xterm/xterm');
const { CanvasAddon } = require('@xterm/addon-canvas');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');

class TerminalManager {
  constructor() {
    this.terminals = new Map(); // id -> { terminal, fitAddon, container, ptyId }
    this.focusedId = null;
    this._dataCleanup = null;
    this._exitCleanup = null;
    this._opacity = 0.3;
    this._shadowIntensity = 1.0;
    this._terminalDefaults = {
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      cursorStyle: 'bar',
      cursorBlink: true,
      cursorInactiveStyle: 'outline',
      scrollback: 1000,
      theme: {
        background: 'transparent',
        foreground: '#e8e6e3',
        cursor: '#d4915e',
        selectionBackground: 'rgba(212, 145, 94, 0.3)',
        black: '#1a1a2e',
        red: '#c45c5c',
        green: '#5cc45c',
        yellow: '#d4915e',
        blue: '#5c8ac4',
        magenta: '#9b59b6',
        cyan: '#5cc4b8',
        white: '#e8e6e3',
        brightBlack: '#4a4858',
        brightRed: '#e07070',
        brightGreen: '#70e070',
        brightYellow: '#e0a36e',
        brightBlue: '#70a0e0',
        brightMagenta: '#b070d0',
        brightCyan: '#70e0d0',
        brightWhite: '#ffffff',
      },
    };
    this._setupPtyListeners();
    this._createShadowStyleElement();
  }

  _setupPtyListeners() {
    this._dataCleanup = window.terminalAPI.onPtyData((ptyId, data) => {
      for (const [id, t] of this.terminals) {
        if (t.ptyId === ptyId) {
          t.terminal.write(data);
          break;
        }
      }
    });

    this._exitCleanup = window.terminalAPI.onPtyExit((ptyId, exitCode) => {
      for (const [id, t] of this.terminals) {
        if (t.ptyId === ptyId) {
          this._showExitOverlay(id, exitCode);
          break;
        }
      }
    });
  }

  async create(container, panelId, shellId) {
    const terminal = new Terminal({
      allowTransparency: true,
      ...this._terminalDefaults,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(container);
    log.info('Terminal opened. Container size:', container.offsetWidth, 'x', container.offsetHeight);

    // Load canvas addon after opening
    try {
      terminal.loadAddon(new CanvasAddon());
    } catch (e) {
      log.warn('Canvas addon failed, using default renderer:', e.message);
    }

    fitAddon.fit();
    log.info('Terminal fitted. Cols:', terminal.cols, 'Rows:', terminal.rows);

    // Create PTY
    const result = await window.terminalAPI.createPty(terminal.cols, terminal.rows, shellId);
    if (!result) {
      log.error('Failed to create PTY');
      return null;
    }
    log.info('PTY created. ID:', result.id);

    const entry = {
      terminal,
      fitAddon,
      container,
      ptyId: result.id,
      panelId,
      shellId: shellId || 'auto',
    };
    this.terminals.set(panelId, entry);

    // Terminal input -> PTY (use entry.ptyId so restartPty updates are picked up)
    terminal.onData((data) => {
      window.terminalAPI.writePty(entry.ptyId, data);
    });

    // Resize
    terminal.onResize(({ cols, rows }) => {
      window.terminalAPI.resizePty(entry.ptyId, cols, rows);
    });

    // Focus tracking
    entry.focusHandler = () => {
      this._setFocused(panelId);
    };
    terminal.textarea?.addEventListener('focus', entry.focusHandler);

    // ResizeObserver for auto-fit
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore fit errors during transitions
      }
    });
    ro.observe(container);
    entry.resizeObserver = ro;

    // Focus the first terminal
    if (this.terminals.size === 1) {
      terminal.focus();
      this._setFocused(panelId);
    }

    return panelId;
  }

  _setFocused(panelId) {
    if (this.focusedId === panelId) return;

    // Remove focus from previous
    if (this.focusedId !== null) {
      const prev = this.terminals.get(this.focusedId);
      if (prev) {
        prev.container.closest('.terminal-panel')?.classList.remove('focused');
      }
    }

    this.focusedId = panelId;
    const current = this.terminals.get(panelId);
    if (current) {
      current.container.closest('.terminal-panel')?.classList.add('focused');
    }
  }

  focusTerminal(panelId) {
    const entry = this.terminals.get(panelId);
    if (entry) {
      entry.terminal.focus();
      this._setFocused(panelId);
    }
  }

  destroy(panelId) {
    const entry = this.terminals.get(panelId);
    if (!entry) return;

    if (entry.resizeObserver) entry.resizeObserver.disconnect();
    if (entry.focusHandler && entry.terminal.textarea) {
      entry.terminal.textarea.removeEventListener('focus', entry.focusHandler);
    }
    window.terminalAPI.destroyPty(entry.ptyId);
    entry.terminal.dispose();
    this.terminals.delete(panelId);

    if (this.focusedId === panelId) {
      this.focusedId = null;
      const first = this.terminals.keys().next().value;
      if (first !== undefined) this.focusTerminal(first);
    }
  }

  destroyAll() {
    for (const id of [...this.terminals.keys()]) {
      this.destroy(id);
    }
  }

  dispose() {
    this.destroyAll();
    if (this._dataCleanup) { this._dataCleanup(); this._dataCleanup = null; }
    if (this._exitCleanup) { this._exitCleanup(); this._exitCleanup = null; }
  }

  fitAll() {
    for (const [, entry] of this.terminals) {
      try {
        entry.fitAddon.fit();
      } catch (e) {
        // Ignore
      }
    }
  }

  _createShadowStyleElement() {
    let style = document.getElementById('terminal-shadow-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'terminal-shadow-style';
      document.head.appendChild(style);
    }
    this._shadowStyleEl = style;
    this._updateShadowStyle();
  }

  _updateShadowStyle() {
    if (!this._shadowStyleEl) return;
    const i = this._shadowIntensity;
    if (i <= 0) {
      this._shadowStyleEl.textContent = `.terminal-panel .xterm-screen canvas { filter: none; }`;
    } else {
      const l1 = (1.0 * i).toFixed(2);
      const l2 = (0.9 * i).toFixed(2);
      const l3 = (0.4 * i).toFixed(2);
      this._shadowStyleEl.textContent = `.terminal-panel .xterm-screen canvas {
  filter: drop-shadow(0 0 1px rgba(0,0,0,${l1}))
          drop-shadow(0 0 3px rgba(0,0,0,${l2}))
          drop-shadow(0 0 8px rgba(0,0,0,${l3}));
}`;
    }
  }

  setShadowIntensity(intensity) {
    this._shadowIntensity = Math.max(0, Math.min(1, intensity));
    this._updateShadowStyle();
  }

  setTerminalDefaults(opts) {
    if (opts.fontSize !== undefined) this._terminalDefaults.fontSize = opts.fontSize;
    if (opts.fontFamily !== undefined) this._terminalDefaults.fontFamily = opts.fontFamily;
    if (opts.cursorStyle !== undefined) this._terminalDefaults.cursorStyle = opts.cursorStyle;
    if (opts.cursorBlink !== undefined) this._terminalDefaults.cursorBlink = opts.cursorBlink;
    if (opts.scrollback !== undefined) this._terminalDefaults.scrollback = opts.scrollback;
    if (opts.theme) {
      this._terminalDefaults.theme = { ...this._terminalDefaults.theme, ...opts.theme };
    }
  }

  updateOptions(opts) {
    let needFit = false;
    for (const [, entry] of this.terminals) {
      const t = entry.terminal;
      if (opts.fontSize !== undefined) { t.options.fontSize = opts.fontSize; needFit = true; }
      if (opts.fontFamily !== undefined) { t.options.fontFamily = opts.fontFamily; needFit = true; }
      if (opts.cursorStyle !== undefined) t.options.cursorStyle = opts.cursorStyle;
      if (opts.cursorBlink !== undefined) t.options.cursorBlink = opts.cursorBlink;
      if (opts.scrollback !== undefined) t.options.scrollback = opts.scrollback;
      if (opts.theme) {
        // xterm.js requires the full theme object — no partial merge
        t.options.theme = { ...this._terminalDefaults.theme, ...opts.theme };
      }
    }
    if (needFit) this.fitAll();
    // Also update defaults for future terminals
    this.setTerminalDefaults(opts);
  }

  setOpacity(opacity) {
    this._opacity = opacity;
    document.querySelectorAll('.terminal-panel').forEach((panel) => {
      panel.style.background = `rgba(12, 12, 20, ${opacity})`;
    });
  }

  _showExitOverlay(panelId, exitCode) {
    const entry = this.terminals.get(panelId);
    if (!entry) return;

    const panel = entry.container.closest('.terminal-panel');
    if (!panel) return;

    const overlay = document.createElement('div');
    overlay.className = 'pty-exit-overlay';

    const span = document.createElement('span');
    span.textContent = `Shell exited (code ${exitCode})`;

    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn restart-btn';
    restartBtn.textContent = 'Restart Shell';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn close-btn';
    closeBtn.textContent = 'Close Panel';

    overlay.append(span, restartBtn, closeBtn);

    restartBtn.addEventListener('click', async () => {
      overlay.remove();
      entry.terminal.clear();
      const result = await window.terminalAPI.createPty(
        entry.terminal.cols,
        entry.terminal.rows,
        entry.shellId
      );
      if (result) {
        entry.ptyId = result.id;
      }
    });

    closeBtn.addEventListener('click', () => {
      if (window._layoutManager) {
        window._layoutManager.removePanel(panelId);
      }
    });

    panel.appendChild(overlay);
  }

  async restartPty(panelId) {
    const entry = this.terminals.get(panelId);
    if (!entry) return;
    window.terminalAPI.destroyPty(entry.ptyId);
    entry.terminal.clear();
    const result = await window.terminalAPI.createPty(
      entry.terminal.cols,
      entry.terminal.rows,
      entry.shellId
    );
    if (result) {
      entry.ptyId = result.id;
    }
  }

  async restartAll() {
    const promises = [];
    for (const [panelId, entry] of this.terminals) {
      // Remove any exit overlay on this panel
      const panel = entry.container.closest('.terminal-panel');
      if (panel) {
        const overlay = panel.querySelector('.pty-exit-overlay');
        if (overlay) overlay.remove();
      }
      // Destroy old PTY, clear terminal, create new PTY
      window.terminalAPI.destroyPty(entry.ptyId);
      entry.terminal.clear();
      entry.terminal.reset();
      promises.push(
        window.terminalAPI.createPty(entry.terminal.cols, entry.terminal.rows, entry.shellId)
          .then((result) => {
            if (result) {
              entry.ptyId = result.id;
            }
          })
      );
    }
    await Promise.all(promises);
  }
}

module.exports = TerminalManager;
