/**
 * GlassSelect — replaces native <select> elements with custom glass-themed dropdowns.
 * Wraps the native select so existing JS code (value reads, change events) keeps working.
 */
class GlassSelect {
  static initAll() {
    document.querySelectorAll('select.settings-select, select.layout-select').forEach(select => {
      if (!select._glassSelect) new GlassSelect(select);
    });

    // Close all dropdowns on outside click (only attach once)
    if (!GlassSelect._clickListenerAttached) {
      GlassSelect._clickListenerAttached = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.glass-select') && !e.target.closest('.glass-select-menu')) {
          GlassSelect.closeAll();
        }
      });
    }
  }

  /** Transform a single select element (for dynamically created selects) */
  static upgrade(select) {
    if (!select._glassSelect) new GlassSelect(select);
  }

  static closeAll() {
    document.querySelectorAll('.glass-select.open').forEach(el => {
      el.classList.remove('open');
    });
    document.querySelectorAll('.glass-select-menu.visible').forEach(el => {
      el.classList.remove('visible');
    });
  }

  constructor(nativeSelect) {
    this._native = nativeSelect;
    nativeSelect._glassSelect = this;
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

    // Append menu to body so it escapes overflow:hidden and backdrop-filter containment
    document.body.appendChild(menu);

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
      GlassSelect.closeAll();
      if (!wasOpen) {
        this._wrapper.classList.add('open');
        this._positionMenu();
        this._menu.classList.add('visible');
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
      this._menu.classList.remove('visible');
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
    const rect = this._trigger.getBoundingClientRect();
    const menu = this._menu;

    // Temporarily show to measure height
    menu.style.opacity = '0';
    menu.style.pointerEvents = 'none';
    menu.style.display = 'block';
    const menuHeight = menu.scrollHeight;
    menu.style.display = '';
    menu.style.opacity = '';
    menu.style.pointerEvents = '';

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    menu.style.left = rect.left + 'px';
    menu.style.minWidth = rect.width + 'px';

    // Prefer opening downward; only open upward if not enough space below
    if (spaceBelow < menuHeight + 8 && spaceAbove > menuHeight + 8) {
      // Open upward
      menu.style.top = '';
      menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
    } else {
      // Open downward (default)
      menu.style.bottom = '';
      menu.style.top = (rect.bottom + 6) + 'px';
    }
  }
}

module.exports = GlassSelect;
