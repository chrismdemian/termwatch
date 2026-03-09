class Settings {
  constructor({ layoutManager, terminalManager, controls }) {
    this.layoutManager = layoutManager;
    this.terminalManager = terminalManager;
    this.controls = controls;
  }

  async load() {
    // Load opacity
    const opacity = await window.storeAPI.get('opacity');
    if (opacity !== undefined && opacity !== null) {
      this.terminalManager.setOpacity(opacity);
      this.controls.setOpacitySlider(opacity);
    }

    // Load layout
    const layout = await window.storeAPI.get('layout');
    if (layout) {
      await this.layoutManager.setLayout(layout);
      document.getElementById('layout-select').value = layout;
    } else {
      await this.layoutManager.setLayout('1x1');
    }

    // Load subtitle zone
    const subtitleZone = await window.storeAPI.get('subtitleZoneHeight');
    if (subtitleZone !== undefined) {
      this.layoutManager.subtitleZonePercent = subtitleZone;
    }

    // Load terminal font size
    const fontSize = await window.storeAPI.get('terminalFontSize');
    if (fontSize) {
      // Applied on next terminal creation
    }
  }

  setupAutoSave() {
    // Save layout on change
    document.getElementById('layout-select').addEventListener('change', (e) => {
      const layout = e.target.value;
      this.layoutManager.setLayout(layout);
      window.storeAPI.set('layout', layout);
    });
  }
}

module.exports = Settings;
