const { ipcRenderer } = require('electron');
const Pickr = require('@simonwep/pickr');
const { hexToRgba, normalizeHex } = require('./settings-utils');

class Settings {
  constructor({ layoutManager, terminalManager, controls }) {
    this.layoutManager = layoutManager;
    this.terminalManager = terminalManager;
    this.controls = controls;
    this.isOpen = false;
    this._pickrs = {};

    this._values = {
      opacity: 0.3,
      shadowIntensity: 1.0,
      terminalFontSize: 14,
      terminalFontFamily: "'JetBrains Mono', monospace",
      terminalTextColor: '#e8e6e3',
      terminalSelectionColor: '#d4915e',
      terminalCursorStyle: 'bar',
      terminalCursorBlink: true,
      terminalScrollback: 1000,
      autoHideDelay: 3000,
      defaultLayout: '1x1',
      startInVideoMode: false,
      disableHardwareAcceleration: false,
      shellConfig: {},
    };

    this._overlay = document.getElementById('settings-overlay');
    this._modal = document.getElementById('settings-modal');
  }

  async load() {
    // Load all settings from store
    const keys = Object.keys(this._values);
    for (const key of keys) {
      const val = await window.storeAPI.get(key);
      if (val !== undefined && val !== null) {
        this._values[key] = val;
      }
    }

    // Migration: old shellType → new shellConfig
    const oldShellType = await window.storeAPI.get('shellType');
    if (oldShellType && oldShellType !== 'auto') {
      // Populate all layout sizes with the old global shell
      const layouts = this.layoutManager.getLayoutNames();
      const LayoutDefs = this.layoutManager.constructor.LAYOUTS;
      for (const name of layouts) {
        const panelCount = LayoutDefs[name].panels.length;
        this._values.shellConfig[name] = Array(panelCount).fill(oldShellType);
      }
      window.storeAPI.set('shellConfig', this._values.shellConfig);
      window.storeAPI.set('shellType', undefined);
    }

    // Apply opacity
    this.terminalManager.setOpacity(this._values.opacity);

    // Apply shadow intensity
    this.terminalManager.setShadowIntensity(this._values.shadowIntensity);

    // Apply terminal options
    this.terminalManager.setTerminalDefaults({
      fontSize: this._values.terminalFontSize,
      fontFamily: this._values.terminalFontFamily,
      cursorStyle: this._values.terminalCursorStyle,
      cursorBlink: this._values.terminalCursorBlink,
      scrollback: this._values.terminalScrollback,
      theme: {
        foreground: this._values.terminalTextColor,
        selectionBackground: this._hexToRgba(this._values.terminalSelectionColor, 0.3),
      },
    });

    // Apply auto-hide delay
    this.controls.setAutoHideDelay(this._values.autoHideDelay);

    // Load layout (use defaultLayout if no saved layout)
    const layout = await window.storeAPI.get('layout');
    const layoutName = layout || this._values.defaultLayout;
    const shellIds = this._getShellsForLayout(layoutName);
    await this.layoutManager.setLayout(layoutName, shellIds);
    document.getElementById('layout-select').value = layoutName;

    // Load subtitle zone
    const subtitleZone = await window.storeAPI.get('subtitleZoneHeight');
    if (subtitleZone !== undefined) {
      this.layoutManager.subtitleZonePercent = subtitleZone;
    }
  }

  setupAutoSave() {
    // Layout selector in controls bar
    document.getElementById('layout-select').addEventListener('change', (e) => {
      this.switchLayout(e.target.value);
    });

    this._setupModal();
  }

  _setupModal() {
    // Close button
    document.getElementById('settings-close-btn').addEventListener('click', () => this.close());

    // Gear button
    document.getElementById('btn-settings').addEventListener('click', () => this.toggle());

    // Click backdrop to close
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Prevent clicks inside modal from closing
    this._modal.addEventListener('click', (e) => e.stopPropagation());

    // Stop keydown propagation from settings inputs so hotkeys don't fire
    this._modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this._modal.addEventListener('keyup', (e) => e.stopPropagation());

    // Stepper buttons (custom +/- for number inputs)
    this._modal.querySelectorAll('.settings-stepper-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const delta = parseInt(btn.dataset.delta, 10);
        const min = parseInt(input.min, 10);
        const max = parseInt(input.max, 10);
        let val = parseInt(input.value, 10) + delta;
        val = Math.max(min, Math.min(max, val));
        input.value = val;
        input.dispatchEvent(new Event('change'));
      });
    });

    // --- Terminal Settings ---

    // Opacity
    const opacitySlider = document.getElementById('setting-opacity');
    const opacityValueLabel = document.getElementById('setting-opacity-value');
    opacitySlider.addEventListener('input', () => {
      const val = parseFloat(opacitySlider.value);
      this._values.opacity = val;
      this._applyOpacity(val);
      opacityValueLabel.textContent = Math.round(val * 100) + '%';
      window.storeAPI.set('opacity', val);
    });

    // Shadow intensity
    const shadowSlider = document.getElementById('setting-shadow-intensity');
    const shadowValueLabel = document.getElementById('setting-shadow-intensity-value');
    shadowSlider.addEventListener('input', () => {
      const val = parseFloat(shadowSlider.value);
      this._values.shadowIntensity = val;
      this._applyShadowIntensity(val);
      shadowValueLabel.textContent = Math.round(val * 100) + '%';
      window.storeAPI.set('shadowIntensity', val);
    });

    // Font size
    const fontSizeInput = document.getElementById('setting-font-size');
    fontSizeInput.addEventListener('change', () => {
      let val = parseInt(fontSizeInput.value, 10);
      val = Math.max(8, Math.min(32, val || 14));
      fontSizeInput.value = val;
      this._values.terminalFontSize = val;
      this._applyTerminalFont();
      window.storeAPI.set('terminalFontSize', val);
    });

    // Font family
    const fontFamilySelect = document.getElementById('setting-font-family');
    fontFamilySelect.addEventListener('change', () => {
      this._values.terminalFontFamily = fontFamilySelect.value;
      this._applyTerminalFont();
      window.storeAPI.set('terminalFontFamily', fontFamilySelect.value);
    });

    // Text color (Pickr)
    this._pickrs.textColor = this._createPickr(
      '#setting-text-color-trigger',
      this._values.terminalTextColor,
      (hex) => {
        document.getElementById('setting-text-color-hex').value = hex;
        this._values.terminalTextColor = hex;
        this._applyTerminalColors();
        window.storeAPI.set('terminalTextColor', hex);
      }
    );
    const textColorHex = document.getElementById('setting-text-color-hex');
    textColorHex.addEventListener('change', () => {
      const hex = this._normalizeHex(textColorHex.value);
      if (hex) {
        textColorHex.value = hex;
        this._pickrs.textColor.setColor(hex);
        this._values.terminalTextColor = hex;
        this._applyTerminalColors();
        window.storeAPI.set('terminalTextColor', hex);
      }
    });

    // Selection color (Pickr)
    this._pickrs.selectionColor = this._createPickr(
      '#setting-selection-color-trigger',
      this._values.terminalSelectionColor,
      (hex) => {
        document.getElementById('setting-selection-color-hex').value = hex;
        this._values.terminalSelectionColor = hex;
        this._applyTerminalColors();
        window.storeAPI.set('terminalSelectionColor', hex);
      }
    );
    const selColorHex = document.getElementById('setting-selection-color-hex');
    selColorHex.addEventListener('change', () => {
      const hex = this._normalizeHex(selColorHex.value);
      if (hex) {
        selColorHex.value = hex;
        this._pickrs.selectionColor.setColor(hex);
        this._values.terminalSelectionColor = hex;
        this._applyTerminalColors();
        window.storeAPI.set('terminalSelectionColor', hex);
      }
    });

    // Cursor style (segmented control)
    const cursorStyleGroup = document.getElementById('setting-cursor-style');
    cursorStyleGroup.querySelectorAll('.settings-segmented-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        cursorStyleGroup.querySelectorAll('.settings-segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._values.terminalCursorStyle = btn.dataset.value;
        this._applyTerminalCursor();
        window.storeAPI.set('terminalCursorStyle', btn.dataset.value);
      });
    });

    // Cursor blink
    const cursorBlinkToggle = document.getElementById('setting-cursor-blink');
    cursorBlinkToggle.addEventListener('change', () => {
      this._values.terminalCursorBlink = cursorBlinkToggle.checked;
      this._applyTerminalCursor();
      window.storeAPI.set('terminalCursorBlink', cursorBlinkToggle.checked);
    });

    // Scrollback
    const scrollbackInput = document.getElementById('setting-scrollback');
    scrollbackInput.addEventListener('change', () => {
      let val = parseInt(scrollbackInput.value, 10);
      val = Math.max(100, Math.min(50000, val || 1000));
      scrollbackInput.value = val;
      this._values.terminalScrollback = val;
      this._applyScrollback();
      window.storeAPI.set('terminalScrollback', val);
    });

    // Refresh terminals
    document.getElementById('setting-refresh-terminals').addEventListener('click', () => {
      this.terminalManager.restartAll();
    });

    // --- Behavior Settings ---

    // Auto-hide delay
    const autoHideSelect = document.getElementById('setting-auto-hide-delay');
    autoHideSelect.addEventListener('change', () => {
      const val = parseInt(autoHideSelect.value, 10);
      this._values.autoHideDelay = val;
      this._applyAutoHideDelay();
      window.storeAPI.set('autoHideDelay', val);
    });

    // Default layout
    const defaultLayoutSelect = document.getElementById('setting-default-layout');
    defaultLayoutSelect.addEventListener('change', () => {
      this._values.defaultLayout = defaultLayoutSelect.value;
      window.storeAPI.set('defaultLayout', defaultLayoutSelect.value);
    });

    // Start in video mode
    const startVideoModeToggle = document.getElementById('setting-start-video-mode');
    startVideoModeToggle.addEventListener('change', () => {
      this._values.startInVideoMode = startVideoModeToggle.checked;
      window.storeAPI.set('startInVideoMode', startVideoModeToggle.checked);
    });

    // Disable hardware acceleration
    const disableGpuToggle = document.getElementById('setting-disable-gpu');
    disableGpuToggle.addEventListener('change', () => {
      this._values.disableHardwareAcceleration = disableGpuToggle.checked;
      window.storeAPI.set('disableHardwareAcceleration', disableGpuToggle.checked);
      // Show restart notice
      alert('Hardware acceleration setting changed. Please restart the app for this to take effect.');
    });

    // Update download/install button
    const updateBtn = document.getElementById('update-download-btn');
    if (updateBtn) {
      updateBtn.addEventListener('click', () => {
        if (updateBtn.dataset.state === 'install') {
          ipcRenderer.send('app:install-update');
        } else {
          ipcRenderer.send('app:download-update');
          updateBtn.textContent = 'Downloading...';
          updateBtn.disabled = true;
        }
      });

      ipcRenderer.on('app:download-progress', (_event, progress) => {
        const pct = Math.round(progress.percent);
        updateBtn.textContent = `Downloading ${pct}%...`;
        const bar = document.getElementById('update-progress-bar');
        if (bar) bar.style.setProperty('--progress', pct);
      });

      ipcRenderer.on('app:update-downloaded', () => {
        updateBtn.textContent = 'Install & Restart';
        updateBtn.disabled = false;
        updateBtn.dataset.state = 'install';
        const bar = document.getElementById('update-progress-bar');
        if (bar) bar.style.setProperty('--progress', 100);
      });

      ipcRenderer.on('app:update-error', (_event, { message }) => {
        updateBtn.textContent = 'Download';
        updateBtn.disabled = false;
        updateBtn.dataset.state = '';
        const banner = document.getElementById('settings-update-banner');
        if (banner) {
          const existing = banner.querySelector('.update-error');
          if (existing) existing.remove();
          const errEl = document.createElement('span');
          errEl.className = 'update-error';
          errEl.textContent = message;
          banner.querySelector('.update-info').appendChild(errEl);
          setTimeout(() => errEl.remove(), 8000);
        }
      });
    }

    // Check for updates button
    const checkBtn = document.getElementById('btn-check-updates');
    if (checkBtn) {
      checkBtn.addEventListener('click', async () => {
        checkBtn.textContent = 'Checking...';
        checkBtn.disabled = true;
        clearTimeout(this._checkUpdateTimeout);
        await ipcRenderer.invoke('app:check-for-updates');
        // If no update event arrives within 10s, reset
        this._checkUpdateTimeout = setTimeout(() => {
          checkBtn.textContent = 'Check Now';
          checkBtn.disabled = false;
        }, 10000);
      });

      ipcRenderer.on('app:update-not-available', () => {
        clearTimeout(this._checkUpdateTimeout);
        checkBtn.textContent = 'Up to date!';
        checkBtn.disabled = true;
        setTimeout(() => {
          checkBtn.textContent = 'Check Now';
          checkBtn.disabled = false;
        }, 3000);
      });

      ipcRenderer.on('app:update-available', () => {
        clearTimeout(this._checkUpdateTimeout);
        checkBtn.textContent = 'Check Now';
        checkBtn.disabled = false;
        // Update banner will be shown by _showUpdateBanner via app.js
        if (this.isOpen) this._showUpdateBanner();
      });

      ipcRenderer.on('app:update-error', () => {
        clearTimeout(this._checkUpdateTimeout);
        checkBtn.textContent = 'Check Now';
        checkBtn.disabled = false;
      });
    }

    // Update channel selector
    const channelSelect = document.getElementById('setting-update-channel');
    if (channelSelect) {
      channelSelect.addEventListener('change', () => {
        ipcRenderer.send('app:set-update-channel', channelSelect.value);
      });
    }

    // Clear all data
    document.getElementById('setting-clear-all-data').addEventListener('click', async () => {
      const confirmed = confirm(
        'This will delete all settings, bookmarks, and browsing data (cookies, cache, login sessions).\n\nThe app will restart. Continue?'
      );
      if (!confirmed) return;
      await window.storeAPI.clearAllData();
      window.location.reload();
    });
  }

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;

    // Render per-terminal shell dropdowns
    await this._renderShellDropdowns();

    // Sync inputs to current values
    document.getElementById('setting-opacity').value = this._values.opacity;
    document.getElementById('setting-opacity-value').textContent = Math.round(this._values.opacity * 100) + '%';
    document.getElementById('setting-shadow-intensity').value = this._values.shadowIntensity;
    document.getElementById('setting-shadow-intensity-value').textContent = Math.round(this._values.shadowIntensity * 100) + '%';
    document.getElementById('setting-font-size').value = this._values.terminalFontSize;
    document.getElementById('setting-font-family').value = this._values.terminalFontFamily;
    document.getElementById('setting-text-color-hex').value = this._values.terminalTextColor;
    this._pickrs.textColor.setColor(this._values.terminalTextColor);
    document.getElementById('setting-selection-color-hex').value = this._values.terminalSelectionColor;
    this._pickrs.selectionColor.setColor(this._values.terminalSelectionColor);

    // Cursor style segmented
    const cursorStyleGroup = document.getElementById('setting-cursor-style');
    cursorStyleGroup.querySelectorAll('.settings-segmented-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === this._values.terminalCursorStyle);
    });

    document.getElementById('setting-cursor-blink').checked = this._values.terminalCursorBlink;
    document.getElementById('setting-scrollback').value = this._values.terminalScrollback;
    document.getElementById('setting-auto-hide-delay').value = this._values.autoHideDelay;
    document.getElementById('setting-default-layout').value = this._values.defaultLayout;
    document.getElementById('setting-start-video-mode').checked = this._values.startInVideoMode;
    document.getElementById('setting-disable-gpu').checked = this._values.disableHardwareAcceleration;

    // Load update channel
    const savedChannel = await window.storeAPI.get('updateChannel');
    const channelSelect = document.getElementById('setting-update-channel');
    if (channelSelect) {
      channelSelect.value = savedChannel || 'latest';
    }

    // Fetch and display version
    this._loadVersion();

    // Show update banner if available
    if (window._updateInfo) {
      this._showUpdateBanner();
    }

    // Show overlay
    this._overlay.classList.add('visible');

    // Pause auto-hide while settings open
    this.controls.pauseAutoHide();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._overlay.classList.remove('visible');
    this.controls.resumeAutoHide();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  getOpacity() {
    return this._values.opacity;
  }

  setOpacity(val) {
    val = Math.max(0, Math.min(1, val));
    this._values.opacity = val;
    this._applyOpacity(val);
    document.getElementById('setting-opacity').value = val;
    document.getElementById('setting-opacity-value').textContent = Math.round(val * 100) + '%';
    window.storeAPI.set('opacity', val);
  }

  getValue(key) {
    return this._values[key];
  }

  _applyOpacity(val) {
    this.terminalManager.setOpacity(val);
  }

  _applyShadowIntensity(val) {
    this.terminalManager.setShadowIntensity(val);
  }

  _applyTerminalFont() {
    this.terminalManager.updateOptions({
      fontSize: this._values.terminalFontSize,
      fontFamily: this._values.terminalFontFamily,
    });
  }

  _applyTerminalColors() {
    this.terminalManager.updateOptions({
      theme: {
        foreground: this._values.terminalTextColor,
        selectionBackground: this._hexToRgba(this._values.terminalSelectionColor, 0.3),
      },
    });
  }

  _applyTerminalCursor() {
    this.terminalManager.updateOptions({
      cursorStyle: this._values.terminalCursorStyle,
      cursorBlink: this._values.terminalCursorBlink,
    });
  }

  _applyScrollback() {
    this.terminalManager.updateOptions({
      scrollback: this._values.terminalScrollback,
    });
  }

  _applyAutoHideDelay() {
    this.controls.setAutoHideDelay(this._values.autoHideDelay);
  }

  _createPickr(selector, defaultColor, onChange) {
    const triggerEl = document.querySelector(selector);
    triggerEl.style.background = defaultColor;

    const pickr = Pickr.create({
      el: selector,
      useAsButton: true,
      theme: 'nano',
      appClass: 'termwatch-pickr',
      container: this._modal,
      default: defaultColor,
      defaultRepresentation: 'HEX',
      comparison: false,
      swatches: [
        '#e8e6e3', '#d4915e', '#c45c5c', '#5cc45c',
        '#5c8ac4', '#9b59b6', '#5cc4b8', '#ffffff',
      ],
      components: {
        preview: true,
        opacity: false,
        hue: true,
        interaction: {
          hex: true,
          input: true,
          save: true,
        },
      },
    });

    pickr.on('save', (color) => {
      if (color) {
        const hex = color.toHEXA().toString().slice(0, 7);
        triggerEl.style.background = hex;
        onChange(hex);
      }
      pickr.hide();
    });

    pickr.on('change', (color) => {
      if (color) {
        const hex = color.toHEXA().toString().slice(0, 7);
        triggerEl.style.background = hex;
      }
    });

    return pickr;
  }

  _hexToRgba(hex, alpha) {
    return hexToRgba(hex, alpha);
  }

  _normalizeHex(value) {
    return normalizeHex(value);
  }

  _getShellsForLayout(layoutName) {
    const LayoutDefs = this.layoutManager.constructor.LAYOUTS;
    const layoutDef = LayoutDefs[layoutName];
    if (!layoutDef) return ['auto'];
    const panelCount = layoutDef.panels.length;
    const saved = this._values.shellConfig[layoutName] || [];
    const result = [];
    for (let i = 0; i < panelCount; i++) {
      result.push(saved[i] || 'auto');
    }
    return result;
  }

  async _renderShellDropdowns() {
    const container = document.getElementById('shell-config-container');
    container.innerHTML = '';

    let shells = [];
    try {
      shells = await window.terminalAPI.getAvailableShells();
    } catch (e) {
      // No shells available
    }

    const layoutName = this.layoutManager.currentLayout;
    const shellIds = this._getShellsForLayout(layoutName);
    const panelCount = shellIds.length;

    for (let i = 0; i < panelCount; i++) {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const label = document.createElement('span');
      label.className = 'settings-label';
      label.textContent = panelCount === 1 ? 'Shell' : `Terminal ${i + 1}`;
      row.appendChild(label);

      const select = document.createElement('select');
      select.className = 'settings-select';

      // Default option
      const defaultOpt = document.createElement('option');
      defaultOpt.value = 'auto';
      defaultOpt.textContent = 'Default';
      select.appendChild(defaultOpt);

      for (const s of shells) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.default ? `${s.name} (default)` : s.name;
        select.appendChild(opt);
      }

      // Set current value
      select.value = shellIds[i];
      // If saved shell is no longer available, reset to auto
      if (select.value !== shellIds[i]) {
        shellIds[i] = 'auto';
        this._values.shellConfig[layoutName] = shellIds;
        window.storeAPI.set('shellConfig', this._values.shellConfig);
        select.value = 'auto';
      }

      const panelIndex = i;
      select.addEventListener('change', () => {
        const currentLayout = this.layoutManager.currentLayout;
        const newShellId = select.value;
        // Update config
        if (!this._values.shellConfig[currentLayout]) {
          this._values.shellConfig[currentLayout] = [];
        }
        this._values.shellConfig[currentLayout][panelIndex] = newShellId;
        window.storeAPI.set('shellConfig', this._values.shellConfig);

        // Keep layout manager's cached shell IDs in sync
        if (this.layoutManager._currentShellIds) {
          this.layoutManager._currentShellIds[panelIndex] = newShellId;
        }

        // Update the terminal entry's shellId and restart just that terminal
        const panels = this.layoutManager.panels;
        if (panels[panelIndex]) {
          const panelId = panels[panelIndex].panelId;
          const entry = this.terminalManager.terminals.get(panelId);
          if (entry) {
            entry.shellId = newShellId;
            this.terminalManager.restartPty(panelId);
          }
        }
      });

      row.appendChild(select);
      container.appendChild(row);

      // Upgrade to glass dropdown if GlassSelect is available
      try {
        const GlassSelect = require('./glass-select');
        GlassSelect.upgrade(select);
      } catch (_) { /* GlassSelect not loaded yet during initial settings.load() */ }
    }
  }

  async _loadVersion() {
    const el = document.getElementById('settings-version');
    if (!el) return;
    try {
      const version = await ipcRenderer.invoke('app:get-version');
      el.textContent = version ? `TermWatch v${version}` : '';
    } catch {
      el.textContent = '';
    }
  }

  _showUpdateBanner() {
    const banner = document.getElementById('settings-update-banner');
    if (!banner || !window._updateInfo) return;
    const label = banner.querySelector('.update-label');
    if (label) {
      label.textContent = `Update available: v${window._updateInfo.version}`;
    }
    // Display release notes summary
    const notesEl = document.getElementById('update-notes');
    if (notesEl && window._updateInfo.releaseNotes) {
      let notes = window._updateInfo.releaseNotes;
      // releaseNotes can be a string or array of { version, note }
      if (Array.isArray(notes)) {
        notes = notes.map(n => n.note || n).join('; ');
      }
      // Strip HTML tags and truncate
      notes = notes.replace(/<[^>]+>/g, '').trim();
      if (notes.length > 120) notes = notes.slice(0, 117) + '...';
      notesEl.textContent = notes;
      notesEl.title = notes;
    }
    banner.classList.add('visible');
  }

  async switchLayout(layoutName) {
    const shellIds = this._getShellsForLayout(layoutName);
    await this.layoutManager.setLayout(layoutName, shellIds);
    window.storeAPI.set('layout', layoutName);
    document.getElementById('layout-select').value = layoutName;

    // Re-render shell dropdowns if settings is open
    if (this.isOpen) {
      await this._renderShellDropdowns();
    }
  }
}

module.exports = Settings;
