// Reading journal: time spent reading (while playing), words read per day,
// reading sessions, and books finished. Stored in localStorage on this device.
const Journal = (() => {
  const KEY = 'sr:journal';
  const MAX_SEGMENT_MS = 2 * 60 * 60 * 1000;
  const CHART_DAYS = 14;
  const PACE_DAYS = 30;
  const MAX_SESSIONS = 1000;
  // Shorter sessions and days are too noisy to say much about pace.
  const MIN_PACE_MS = 60000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const tr = (key, vars) => I18n.t(key, vars);

  const load = () => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.days) return { finished: {}, sessions: [], ...j };
    } catch { /* fall through */ }
    return { days: {}, finished: {}, sessions: [] };
  };
  const save = (j) => {
    try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* storage unavailable */ }
  };

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let since = 0;
  let words = 0;
  let sessionMs = 0;
  let sessionWords = 0;

  function start() {
    since = Date.now();
    words = 0;
    sessionMs = 0;
    sessionWords = 0;
  }

  // Write the time and words since the last flush into today's entry. When
  // reading stops, the whole stretch since play was pressed is kept as a session.
  function flush(keepGoing) {
    if (!since) return;
    const now = Date.now();
    const ms = Math.min(now - since, MAX_SEGMENT_MS);
    const j = load();
    const d = j.days[dayKey()] || (j.days[dayKey()] = { ms: 0, words: 0 });
    d.ms += ms;
    d.words += words;
    sessionMs += ms;
    sessionWords += words;
    if (!keepGoing && sessionMs >= MIN_PACE_MS) {
      j.sessions.push({ day: dayKey(), at: now, ms: sessionMs, words: sessionWords });
      if (j.sessions.length > MAX_SESSIONS) j.sessions.splice(0, j.sessions.length - MAX_SESSIONS);
    }
    save(j);
    since = keepGoing ? now : 0;
    words = 0;
    if (!keepGoing) { sessionMs = 0; sessionWords = 0; }
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
    for (const e of Object.values(j.days)) totalMs += e.ms;

    return {
      paceStats: paceStats(j, today),
      today: minutesOn(today),
      week: days.slice(-7).reduce((s, d) => s + d.minutes, 0),
      weekWords: days.slice(-7).reduce((s, d) => s + d.words, 0),
      streak,
      finished: Object.keys(j.finished).length,
      totalMinutes: totalMs / 60000,
      days,
    };
  }

  const wpmOf = (e) => Math.round(e.words / (e.ms / 60000));
  const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

  function paceStats(j, today) {
    const readingDays = Object.entries(j.days)
      .filter(([, e]) => e.ms >= MIN_PACE_MS && e.words > 0)
      .map(([k, e]) => ({ key: k, date: parseDay(k), ms: e.ms, words: e.words, wpm: wpmOf(e) }))
      .sort((a, b) => a.date - b.date);

    let totalMs = 0;
    let totalWords = 0;
    for (const d of readingDays) { totalMs += d.ms; totalWords += d.words; }
    const average = totalMs ? Math.round(totalWords / (totalMs / 60000)) : 0;

    // Best session when sessions exist; older journals only have daily totals.
    const sessions = (j.sessions || []).filter((x) => x.ms >= MIN_PACE_MS && x.words > 0);
    let best = null;
    if (sessions.length) {
      const top = sessions.reduce((a, b) => (wpmOf(b) > wpmOf(a) ? b : a));
      best = { wpm: wpmOf(top), date: new Date(top.at), kind: 'session' };
    } else if (readingDays.length) {
      const top = readingDays.reduce((a, b) => (b.wpm > a.wpm ? b : a));
      best = { wpm: top.wpm, date: top.date, kind: 'day' };
    }

    // Progress: the first week of reading against the most recent week.
    let change = null;
    if (readingDays.length >= 2) {
      const first = readingDays[0].date;
      const weekAfterFirst = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7);
      const lastWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      const pool = (days) => {
        let ms = 0, w = 0;
        for (const d of days) { ms += d.ms; w += d.words; }
        return ms ? w / (ms / 60000) : 0;
      };
      const early = readingDays.filter((d) => d.date < weekAfterFirst);
      const recent = readingDays.filter((d) => d.date >= lastWeekStart && d.date >= weekAfterFirst);
      if (early.length && recent.length) {
        const from = pool(early);
        const to = pool(recent);
        change = { wpm: Math.round(to - from), pct: Math.round(((to - from) / from) * 100) };
      }
    }

    const chartFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (PACE_DAYS - 1));
    return {
      average,
      best,
      change,
      readingDays: readingDays.length,
      from: chartFrom,
      to: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      points: readingDays.filter((d) => d.date >= chartFrom),
    };
  }

  const fmtMinutes = (m) => {
    if (m < 1) return m > 0 ? '<1 min' : '0 min';
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const r = Math.round(m % 60);
    return r ? tr('{h}h {m}m', { h, m: r }) : tr('{h}h', { h });
  };

  // Round the axis top up to a tidy number of minutes.
  const niceMax = (v) => {
    for (const step of [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]) if (v <= step) return step;
    return Math.ceil(v / 60) * 60;
  };

  const svg = (tag, attrs) => {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // Tidy y-axis bounds and ticks in steps of 25/50/100 wpm.
  function paceScale(values) {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = Math.max(hi - lo, 40);
    const step = span > 300 ? 100 : span > 120 ? 50 : 25;
    const min = Math.max(0, Math.floor((lo - span * 0.15) / step) * step);
    const max = Math.ceil((hi + span * 0.15) / step) * step;
    const ticks = [];
    for (let v = min; v <= max; v += step) ticks.push(v);
    return { min, max, ticks };
  }

  function renderPace(els, p) {
    const shortDate = (d) => d.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short' });
    els.avg.textContent = p.average ? String(p.average) : '–';
    els.best.textContent = p.best ? String(p.best.wpm) : '–';
    els.bestLabel.textContent = tr(p.best && p.best.kind === 'day' ? 'best day, wpm' : 'best session, wpm');
    els.bestWhen.textContent = p.best ? shortDate(p.best.date) : '';
    if (p.change) {
      const sign = p.change.wpm > 0 ? '+' : p.change.wpm < 0 ? '−' : '±';
      els.change.textContent = `${sign}${Math.abs(p.change.wpm)}`;
      els.changeWhen.textContent = `${sign}${Math.abs(p.change.pct)}%`;
      els.change.classList.toggle('up', p.change.wpm > 0);
    } else {
      els.change.textContent = '–';
      els.changeWhen.textContent = tr('shows after a week of reading');
      els.change.classList.remove('up');
    }

    const host = els.chart;
    host.replaceChildren();
    els.paceEmpty.hidden = p.points.length > 0;
    if (!p.points.length) return;

    const W = Math.max(260, host.clientWidth || 600);
    const H = 170;
    const pad = { l: 40, r: 12, t: 12, b: 24 };
    const values = p.points.map((d) => d.wpm).concat(p.average);
    const sc = paceScale(values);
    const days = (p.to - p.from) / 86400000 || 1;
    const x = (d) => pad.l + ((d - p.from) / 86400000 / days) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - sc.min) / (sc.max - sc.min)) * (H - pad.t - pad.b);

    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': tr('Reading pace per day over the last {days} days. Average {avg} words per minute.', { days: PACE_DAYS, avg: p.average }) });

    for (const t of sc.ticks) {
      root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: 'pc-grid' }));
      const label = svg('text', { x: pad.l - 8, y: y(t) + 4, class: 'pc-tick', 'text-anchor': 'end' });
      label.textContent = t;
      root.append(label);
    }
    for (const [d, anchor] of [[p.from, 'start'], [p.to, 'end']]) {
      const label = svg('text', { x: x(d), y: H - 6, class: 'pc-tick', 'text-anchor': anchor });
      label.textContent = d === p.to ? tr('Today') : shortDate(d);
      root.append(label);
    }

    // Average reference line, labelled at the right.
    root.append(svg('line', { x1: pad.l, x2: W - pad.r, y1: y(p.average), y2: y(p.average), class: 'pc-avg' }));
    const avgLabel = svg('text', { x: W - pad.r, y: y(p.average) - 6, class: 'pc-avg-label', 'text-anchor': 'end' });
    avgLabel.textContent = tr('average {n}', { n: p.average });
    root.append(avgLabel);

    if (p.points.length > 1) {
      const d = p.points.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.date).toFixed(1)},${y(pt.wpm).toFixed(1)}`).join('');
      root.append(svg('path', { d, class: 'pc-line' }));
    }
    const dots = p.points.map((pt) => {
      const c = svg('circle', { cx: x(pt.date), cy: y(pt.wpm), r: 4, class: 'pc-dot' });
      root.append(c);
      return c;
    });

    // Crosshair and tooltip for the nearest reading day.
    const cross = svg('line', { y1: pad.t, y2: H - pad.b, class: 'pc-cross', visibility: 'hidden' });
    root.insertBefore(cross, root.firstChild);
    const hit = svg('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' });
    root.append(hit);
    const longDate = (dt) => dt.toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    let active = -1;
    const show = (clientX) => {
      const r = root.getBoundingClientRect();
      const px = clientX - r.left;
      let i = 0;
      p.points.forEach((pt, k) => { if (Math.abs(x(pt.date) - px) < Math.abs(x(p.points[i].date) - px)) i = k; });
      if (active >= 0) dots[active].classList.remove('on');
      active = i;
      dots[i].classList.add('on');
      const pt = p.points[i];
      cross.setAttribute('x1', x(pt.date));
      cross.setAttribute('x2', x(pt.date));
      cross.setAttribute('visibility', 'visible');
      els.paceTip.textContent = tr('{day} · {wpm} wpm · {time}', { day: longDate(pt.date), wpm: pt.wpm, time: fmtMinutes(pt.ms / 60000) });
      els.paceTip.hidden = false;
      els.paceTip.style.left = `${Math.min(Math.max(x(pt.date), 90), W - 90)}px`;
    };
    const hide = () => {
      if (active >= 0) dots[active].classList.remove('on');
      active = -1;
      cross.setAttribute('visibility', 'hidden');
      els.paceTip.hidden = true;
    };
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointerleave', hide);
    host.append(root);
  }

  function render(els) {
    const s = stats();
    renderPace(els.paceCard, s.paceStats);
    els.today.textContent = fmtMinutes(s.today);
    els.streak.textContent = String(s.streak);
    els.streakLabel.textContent = tr('day streak', { n: s.streak });
    els.week.textContent = fmtMinutes(s.week);
    els.words.textContent = s.weekWords.toLocaleString(I18n.locale());
    els.finished.textContent = String(s.finished);
    els.finishedLabel.textContent = tr(s.finished === 1 ? 'book finished' : 'books finished');
    els.empty.hidden = s.totalMinutes > 0;

    const max = niceMax(Math.max(1, ...s.days.map((d) => d.minutes)));
    els.max.textContent = tr('{m} min', { m: max });
    els.bars.replaceChildren();
    els.axis.replaceChildren();
    const dayName = (d) => d.toLocaleDateString(I18n.locale(), { weekday: 'short' });
    const longDate = (d) => d.toLocaleDateString(I18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' });

    s.days.forEach((d, i) => {
      const isToday = i === s.days.length - 1;
      const col = document.createElement('div');
      col.className = 'bar-col';
      col.setAttribute('role', 'listitem');
      col.tabIndex = 0;
      const mins = Math.round(d.minutes);
      const tip = tr('{day} · {min} min · {words} words', { day: isToday ? tr('Today') : longDate(d.date), min: d.minutes > 0 && mins === 0 ? '<1' : mins, words: d.words.toLocaleString(I18n.locale()) });
      col.dataset.tip = tip;
      col.setAttribute('aria-label', tip);
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.height = d.minutes > 0 ? `max(4px, ${(d.minutes / max) * 100}%)` : '0';
      col.append(bar);
      els.bars.append(col);

      const label = document.createElement('span');
      label.textContent = isToday ? tr('Today') : dayName(d.date).replace('.', '').slice(0, 2);
      if (!isToday && i % 2 === 1) label.className = 'odd';
      els.axis.append(label);
    });
  }

  return { start, flush, addWords, finished, stats, render };
})();
