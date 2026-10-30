// Reading journal: time spent reading (while playing), words read per day,
// and books finished. Stored in localStorage on this device.
const Journal = (() => {
  const KEY = 'sr:journal';
  const MAX_SEGMENT_MS = 2 * 60 * 60 * 1000;
  const CHART_DAYS = 14;

  const load = () => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.days) return { finished: {}, ...j };
    } catch { /* fall through */ }
    return { days: {}, finished: {} };
  };
  const save = (j) => {
    try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* storage unavailable */ }
  };

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let since = 0;
  let words = 0;

  function start() {
    since = Date.now();
    words = 0;
  }

  // Write the time and words since the last flush into today's entry.
  function flush(keepGoing) {
    if (!since) return;
    const now = Date.now();
    const j = load();
    const d = j.days[dayKey()] || (j.days[dayKey()] = { ms: 0, words: 0 });
    d.ms += Math.min(now - since, MAX_SEGMENT_MS);
    d.words += words;
    save(j);
    since = keepGoing ? now : 0;
    words = 0;
  }

  function addWords(n) {
    if (!since) return;
    words += n;
    if (Date.now() - since > 30000) flush(true);
  }

  function finished(key, title) {
    const j = load();
    if (j.finished[key]) return;
    j.finished[key] = { title, date: dayKey() };
    save(j);
  }

  function stats() {
    const j = load();
    const today = new Date();
    const minutesOn = (d) => ((j.days[dayKey(d)] || {}).ms || 0) / 60000;

    const days = [];
    for (let i = CHART_DAYS - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const e = j.days[dayKey(d)] || { ms: 0, words: 0 };
      days.push({ date: d, minutes: e.ms / 60000, words: e.words });
    }

    // A day counts towards the streak with at least a minute of reading; an
    // empty today doesn't break a streak that ran up to yesterday.
    let streak = 0;
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (minutesOn(cursor) < 1) cursor.setDate(cursor.getDate() - 1);
    while (minutesOn(cursor) >= 1) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    let totalMs = 0;
    let totalWords = 0;
    for (const e of Object.values(j.days)) { totalMs += e.ms; totalWords += e.words; }

    return {
      today: minutesOn(today),
      week: days.slice(-7).reduce((s, d) => s + d.minutes, 0),
      streak,
      pace: totalMs >= 60000 ? Math.round(totalWords / (totalMs / 60000)) : 0,
      finished: Object.keys(j.finished).length,
      totalMinutes: totalMs / 60000,
      days,
    };
  }

  const fmtMinutes = (m) => {
    if (m < 1) return m > 0 ? '<1 min' : '0 min';
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return r ? `${h}h ${r}m` : `${h}h`;
  };

  // Round the axis top up to a tidy number of minutes.
  const niceMax = (v) => {
    for (const step of [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]) if (v <= step) return step;
    return Math.ceil(v / 60) * 60;
  };

  function render(els) {
    const s = stats();
    els.today.textContent = fmtMinutes(s.today);
    els.streak.textContent = String(s.streak);
    els.week.textContent = fmtMinutes(s.week);
    els.pace.textContent = s.pace ? String(s.pace) : '–';
    els.finished.textContent = String(s.finished);
    els.finishedLabel.textContent = s.finished === 1 ? 'book finished' : 'books finished';
    els.empty.hidden = s.totalMinutes > 0;

    const max = niceMax(Math.max(1, ...s.days.map((d) => d.minutes)));
    els.max.textContent = `${max} min`;
    els.bars.replaceChildren();
    els.axis.replaceChildren();
    const dayName = (d) => d.toLocaleDateString(undefined, { weekday: 'short' });
    const longDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    s.days.forEach((d, i) => {
      const isToday = i === s.days.length - 1;
      const col = document.createElement('div');
      col.className = 'bar-col';
      col.setAttribute('role', 'listitem');
      col.tabIndex = 0;
      const mins = Math.round(d.minutes);
      const tip = `${isToday ? 'Today' : longDate(d.date)} · ${d.minutes > 0 && mins === 0 ? '<1' : mins} min · ${d.words.toLocaleString()} words`;
      col.dataset.tip = tip;
      col.setAttribute('aria-label', tip);
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.height = d.minutes > 0 ? `max(4px, ${(d.minutes / max) * 100}%)` : '0';
      col.append(bar);
      els.bars.append(col);

      const label = document.createElement('span');
      label.textContent = isToday ? 'Today' : dayName(d.date).slice(0, 2);
      if (!isToday && i % 2 === 1) label.className = 'odd';
      els.axis.append(label);
    });
  }

  return { start, flush, addWords, finished, stats, render };
})();
