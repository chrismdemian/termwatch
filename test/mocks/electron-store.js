/**
 * Mock electron-store: in-memory Map-backed store with get/set/clear.
 */

class MockStore {
  constructor(opts = {}) {
    this._defaults = opts.defaults || {};
    this._data = new Map();
  }

  get(key) {
    if (this._data.has(key)) return this._data.get(key);
    return this._defaults[key];
  }

  set(key, value) {
    if (typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) {
        this._data.set(k, v);
      }
    } else {
      this._data.set(key, value);
    }
  }

  clear() {
    this._data.clear();
  }

  has(key) {
    return this._data.has(key) || key in this._defaults;
  }

  delete(key) {
    this._data.delete(key);
  }
}

export default MockStore;
