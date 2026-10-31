// "My kuns": children's drawings, kept on this device in IndexedDB (they're
// images, too big for localStorage). Not included in backups.
const Art = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('boekhoek-art', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('art', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('art', mode);
      const req = fn(t.objectStore('art'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = t.onabort = () => rej(t.error);
    });
  };

  return {
    // Newest first.
    async all() {
      try { return (await run('readonly', (s) => s.getAll())).sort((a, b) => b.at - a.at); } catch { return []; }
    },
    add: (entry) => run('readwrite', (s) => s.put({ id: `art-${Date.now()}`, at: Date.now(), ...entry })),
    remove: (id) => run('readwrite', (s) => s.delete(id)).catch(() => {}),
  };
})();
