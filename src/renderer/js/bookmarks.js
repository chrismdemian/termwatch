class Bookmarks {
  constructor() {
    this.bookmarks = [];
    this.visible = false;
    this._init();
  }

  async _init() {
    // Load saved bookmarks
    this.bookmarks = (await window.storeAPI.get('bookmarks')) || [];
    this._render();

    // Toggle button
    document.getElementById('btn-bookmarks').addEventListener('click', () => {
      this.toggle();
    });

    // Add bookmark
    document.getElementById('btn-add-bookmark').addEventListener('click', () => {
      this.addCurrent();
    });
  }

  toggle() {
    this.visible = !this.visible;
    const bar = document.getElementById('bookmarks-bar');
    bar.classList.toggle('hidden', !this.visible);
    document.getElementById('btn-bookmarks').classList.toggle('active', this.visible);
  }

  addCurrent() {
    const url = document.getElementById('url-input').value.trim();
    if (!url) return;

    // Don't add duplicates
    if (this.bookmarks.some((b) => b.url === url)) return;

    let title = url;
    try {
      title = new URL(url).hostname;
    } catch (e) {
      // Use full URL
    }

    const favicon = this._getFaviconUrl(url);
    const bookmark = {
      id: Date.now().toString(36),
      url,
      title,
      favicon,
    };

    this.bookmarks.push(bookmark);
    this._save();
    this._render();

    // Show bar if hidden
    if (!this.visible) this.toggle();
  }

  remove(id) {
    const el = document.querySelector(`.bookmark-item[data-id="${id}"]`);
    if (el) {
      el.classList.add('removing');
      setTimeout(() => {
        this.bookmarks = this.bookmarks.filter((b) => b.id !== id);
        this._save();
        this._render();
      }, 150);
    }
  }

  _getFaviconUrl(url) {
    try {
      const origin = new URL(url).origin;
      return `${origin}/favicon.ico`;
    } catch {
      return null;
    }
  }

  _save() {
    window.storeAPI.set('bookmarks', this.bookmarks);
  }

  _render() {
    const list = document.getElementById('bookmarks-list');
    list.innerHTML = '';

    this.bookmarks.forEach((bookmark, i) => {
      const item = document.createElement('div');
      item.className = 'bookmark-item';
      item.dataset.id = bookmark.id;
      item.dataset.url = bookmark.url;
      item.style.animationDelay = `${i * 50}ms`;

      if (bookmark.favicon) {
        const img = document.createElement('img');
        img.src = bookmark.favicon;
        img.onerror = () => {
          img.remove();
          const letter = document.createElement('span');
          letter.className = 'bookmark-letter';
          letter.textContent = bookmark.title[0] || '?';
          item.appendChild(letter);
        };
        item.appendChild(img);
      } else {
        const letter = document.createElement('span');
        letter.className = 'bookmark-letter';
        letter.textContent = bookmark.title[0] || '?';
        item.appendChild(letter);
      }

      // Click to navigate
      item.addEventListener('click', () => {
        window.videoControlAPI.navigate(bookmark.url);
      });

      // Right-click to remove
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.remove(bookmark.id);
      });

      list.appendChild(item);
    });
  }
}

module.exports = Bookmarks;
