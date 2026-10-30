// The bookshelf: every book the reader has added, kept on this device.
// EPUB files live in IndexedDB (too big for localStorage); each book's small
// bookmark summary and when it was last opened live in localStorage.
const Library = (() => {
  const ls = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    },
  };

  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('speed-reader', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('books');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('books', mode);
      const req = fn(t.objectStore('books'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  };

  const markKey = (key) => `sr:mark|${key}`;

  // Earlier versions kept a single book under the key "nightstand".
  async function migrate() {
    try {
      const old = await run('readonly', (s) => s.get('nightstand'));
      if (old && old.key) {
        await run('readwrite', (s) => {
          s.put({ ...old, addedAt: old.savedAt || Date.now() }, old.key);
          return s.delete('nightstand');
        });
      }
    } catch { /* no IndexedDB: the shelf simply stays empty */ }
    const bm = ls.get('sr:bookmark');
    if (bm && bm.key) {
      ls.set(markKey(bm.key), bm);
      ls.remove('sr:bookmark');
    }
  }
  const ready = migrate();

  const openedAt = () => ls.get('sr:opened', {});

  return {
    // All books, most recently opened first.
    async books() {
      await ready;
      let all = [];
      try { all = await run('readonly', (s) => s.getAll()); } catch { return []; }
      const opened = openedAt();
      return all
        .filter((b) => b && b.key && b.file)
        .map((b) => ({ ...b, mark: ls.get(markKey(b.key)), opened: opened[b.key] || b.addedAt || 0 }))
        .sort((a, b) => b.opened - a.opened);
    },
    async add(rec) {
      await ready;
      await run('readwrite', (s) => s.put(rec, rec.key));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    },
    async remove(key) {
      await ready;
      await run('readwrite', (s) => s.delete(key)).catch(() => {});
      const opened = openedAt();
      delete opened[key];
      ls.set('sr:opened', opened);
    },
    touch(key) {
      const opened = openedAt();
      opened[key] = Date.now();
      ls.set('sr:opened', opened);
    },
    mark: (key) => ls.get(markKey(key)),
    setMark: (key, mark) => ls.set(markKey(key), mark),
  };
})();
