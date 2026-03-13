const SHORTCUT_DATA = require('./shortcut-data');

class HelpModal {
  constructor() {
    this.isOpen = false;
    this._overlay = document.getElementById('help-overlay');
    this._modal = document.getElementById('help-modal');

    this._setupListeners();
  }

  _setupListeners() {
    // Close button
    document.getElementById('help-close-btn').addEventListener('click', () => this.close());

    // Click backdrop to close
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Prevent clicks inside modal from closing
    this._modal.addEventListener('click', (e) => e.stopPropagation());
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._render();
    this._overlay.classList.add('visible');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this._overlay.classList.remove('visible');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _render() {
    const body = document.getElementById('help-body');
    body.innerHTML = '';

    for (const group of SHORTCUT_DATA) {
      const section = document.createElement('div');
      section.className = 'help-section';

      const title = document.createElement('div');
      title.className = 'help-section-title';
      title.textContent = group.category;
      section.appendChild(title);

      for (const shortcut of group.shortcuts) {
        const row = document.createElement('div');
        row.className = 'help-shortcut-row';

        const keysSpan = document.createElement('span');
        keysSpan.className = 'help-keys';
        for (let i = 0; i < shortcut.keys.length; i++) {
          if (i > 0) {
            const sep = document.createTextNode(' + ');
            keysSpan.appendChild(sep);
          }
          const kbd = document.createElement('kbd');
          kbd.textContent = shortcut.keys[i];
          keysSpan.appendChild(kbd);
        }

        const actionSpan = document.createElement('span');
        actionSpan.className = 'help-action';
        actionSpan.textContent = shortcut.action;

        row.appendChild(keysSpan);
        row.appendChild(actionSpan);
        section.appendChild(row);
      }

      body.appendChild(section);
    }
  }
}

module.exports = HelpModal;
