// Backups: save the reading journal, bookmarks and settings to a file, and
// merge them back in on any browser or device. Book files themselves aren't
// included (they can be large); re-adding a book picks up its bookmark.
const Backup = (() => {
  const PREFIX = 'sr:';

  const parse = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };
  const today = () => new Date().toISOString().slice(0, 10);

  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return { app: 'nook', version: 1, exportedAt: new Date().toISOString(), data };
  }

  // Phones get the share sheet (save to Files, email, WhatsApp...); computers
  // get an ordinary download.
  async function save() {
    const name = `boekhoek-backup-${today()}.json`;
    const text = JSON.stringify(collect());
    const file = new File([text], name, { type: 'application/json' });
    const phone = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
    if (phone && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Boekhoek backup' });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return 'downloaded';
  }

  // Keep the fuller record of each day, and every session and finished book.
  function mergeJournal(mine, theirs) {
    const out = { days: { ...mine.days }, finished: { ...theirs.finished, ...mine.finished }, sessions: [] };
    for (const [k, e] of Object.entries(theirs.days || {})) {
      if (!out.days[k] || e.ms > out.days[k].ms) out.days[k] = e;
    }
    const seen = new Set();
    for (const s of [...(mine.sessions || []), ...(theirs.sessions || [])]) {
      if (seen.has(s.at)) continue;
      seen.add(s.at);
      out.sessions.push(s);
    }
    out.sessions.sort((a, b) => a.at - b.at);
    return out;
  }

  async function restore(file) {
    const json = parse(await file.text(), null);
    if (!json || json.app !== 'nook' || !json.data) throw new Error('This file isn’t a Boekhoek backup.');
    const summary = { days: 0, sessions: 0, bookmarks: 0 };
    for (const [k, v] of Object.entries(json.data)) {
      if (!k.startsWith(PREFIX)) continue;
      const mine = localStorage.getItem(k);
      let next = v;
      if (k === 'sr:journal') {
        const theirs = parse(v, { days: {} });
        const merged = mergeJournal(parse(mine, { days: {}, finished: {}, sessions: [] }) || { days: {} }, theirs);
        summary.days = Object.keys(merged.days).length;
        summary.sessions = merged.sessions.length;
        next = JSON.stringify(merged);
      } else if (k.startsWith('sr:mark|')) {
        // Keep whichever bookmark is further along.
        const a = parse(mine, null);
        const b = parse(v, null);
        if (a && b && a.pos >= b.pos) next = mine;
        summary.bookmarks++;
      } else if (k.startsWith('sr:pos:')) {
        if (mine != null && +mine >= +v) next = mine;
      } else if (k === 'sr:opened') {
        const a = parse(mine, {}) || {};
        const b = parse(v, {}) || {};
        for (const [key, t] of Object.entries(b)) if (!a[key] || t > a[key]) a[key] = t;
        next = JSON.stringify(a);
      }
      localStorage.setItem(k, next);
    }
    return summary;
  }

  return { save, restore };
})();
