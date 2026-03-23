/**
 * GlassSelect — replaces native <select> elements with custom glass-themed dropdowns.
 * Wraps the native select so existing JS code (value reads, change events) keeps working.
 */
class GlassSelect {
  static initAll() {
    document.querySelectorAll('select.settings-select, select.layout-select').forEach(select => {
      new GlassSelect(select);
    });

    // Close all dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.glass-select')) {
        document.querySelectorAll('.glass-select.open').forEach(el => {
          el.classList.remove('open');
        });
      }
    });
  }

  constructor(nativeSelect) {
    this._native = nativeSelect;
    this._build();
    this._listen();
  }

  _build() {
    const sel = this._native;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'glass-select';

    // Create trigger button showing current value
    const trigger = document.createElement('button');
    trigger.className = 'glass-select-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-label', sel.getAttribute('aria-label') || '');

    const label = document.createElement('span');
    label.className = 'glass-select-label';
    const selectedOpt = sel.options[sel.selectedIndex];
    label.textContent = selectedOpt ? selectedOpt.textContent : '';

    const arrow = document.createElement('span');
    arrow.className = 'glass-select-arrow';
    arrow.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="2 4 5 7 8 4"/></svg>';

    trigger.appendChild(label);
    trigger.appendChild(arrow);

    // Create dropdown menu
    const menu = document.createElement('div');
    menu.className = 'glass-select-menu';
    menu.setAttribute('role', 'listbox');

    Array.from(sel.options).forEach((opt, i) => {
      const item = document.createElement('button');
      item.className = 'glass-select-item';
      item.type = 'button';
      item.setAttribute('role', 'option');
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      if (i === sel.selectedIndex) item.classList.add('selected');
      menu.appendChild(item);
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    // Hide native select and insert custom one
    sel.style.display = 'none';
    sel.parentNode.insertBefore(wrapper, sel.nextSibling);

    this._wrapper = wrapper;
    this._trigger = trigger;
    this._label = label;
    this._menu = menu;
  }

  _listen() {
    // Toggle dropdown on trigger click
    this._trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = this._wrapper.classList.contains('open');
      // Close all others first
      document.querySelectorAll('.glass-select.open').forEach(el => {
        el.classList.remove('open');
      });
      if (!wasOpen) {
        this._wrapper.classList.add('open');
        this._positionMenu();
      }
    });

    // Select item on click
    this._menu.addEventListener('click', (e) => {
      const item = e.target.closest('.glass-select-item');
      if (!item) return;

      // Update native select
      this._native.value = item.dataset.value;
      this._native.dispatchEvent(new Event('change', { bubbles: true }));

      // Update UI
      this._label.textContent = item.textContent;
      this._menu.querySelectorAll('.glass-select-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');

      // Close
      this._wrapper.classList.remove('open');
    });

    // Sync when native select changes programmatically
    const observer = new MutationObserver(() => this._syncFromNative());
    observer.observe(this._native, { attributes: true, childList: true, subtree: true });

    // Also listen for change events dispatched by JS
    this._native.addEventListener('change', () => this._syncFromNative());
  }

  _syncFromNative() {
    const sel = this._native;
    const selectedOpt = sel.options[sel.selectedIndex];
    if (selectedOpt) {
      this._label.textContent = selectedOpt.textContent;
      this._menu.querySelectorAll('.glass-select-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.value === sel.value);
      });
    }
  }

  _positionMenu() {
    // Check if menu would go off screen upward, if so open downward (default is up for controls bar)
    const rect = this._wrapper.getBoundingClientRect();
    const menuHeight = this._menu.scrollHeight;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    this._menu.classList.remove('open-up', 'open-down');
    if (spaceAbove > menuHeight + 8 || spaceAbove > spaceBelow) {
      this._menu.classList.add('open-up');
    } else {
      this._menu.classList.add('open-down');
    }
  }
}

module.exports = GlassSelect;
