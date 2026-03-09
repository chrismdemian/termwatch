const Pickr = require('@simonwep/pickr');

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
    if (layout) {
      await this.layoutManager.setLayout(layout);
      document.getElementById('layout-select').value = layout;
    } else {
      await this.layoutManager.setLayout(this._values.defaultLayout);
      document.getElementById('layout-select').value = this._values.defaultLayout;
    }

    // Load subtitle zone
    const subtitleZone = await window.storeAPI.get('subtitleZoneHeight');
    if (subtitleZone !== undefined) {
      this.layoutManager.subtitleZonePercent = subtitleZone;
    }
  }

  setupAutoSave() {
    // Layout selector in controls bar
    document.getElementById('layout-select').addEventListener('change', (e) => {
      const layout = e.target.value;
      this.layoutManager.setLayout(layout);
      window.storeAPI.set('layout', layout);
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
    opacitySlider.addEventListener('input', () => {
      const val = parseFloat(opacitySlider.value);
      this._values.opacity = val;
      this._applyOpacity(val);
      window.storeAPI.set('opacity', val);
    });

    // Shadow intensity
    const shadowSlider = document.getElementById('setting-shadow-intensity');
    shadowSlider.addEventListener('input', () => {
      const val = parseFloat(shadowSlider.value);
      this._values.shadowIntensity = val;
      this._applyShadowIntensity(val);
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
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;

    // Sync inputs to current values
    document.getElementById('setting-opacity').value = this._values.opacity;
    document.getElementById('setting-shadow-intensity').value = this._values.shadowIntensity;
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
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  _normalizeHex(value) {
    const match = value.match(/^#?([0-9a-fA-F]{6})$/);
    if (match) return '#' + match[1].toLowerCase();
    return null;
  }
}

module.exports = Settings;
