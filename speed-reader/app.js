(() => {
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const settings = Object.assign(
    { wpm: 300, chunk: 1, pauses: true, ramp: true, bionic: false, fontSize: 100, theme: 'auto', mode: 'rsvp', keepAwake: true },
    store.get('sr:settings', {}),
  );
  const saveSettings = () => store.set('sr:settings', settings);

  let book = null;
  let bookKey = '';
  let pos = 0;
  let playing = false;
  let timer = 0;
  let rampStep = 0;
  let pacerChapter = -1;
  let pacerSpans = [];
  let pacerCur = null;
  let lastSaved = 0;
  let lastChapter = -1;

  const fill = (input) => {
    const span = input.max - input.min || 1;
    input.style.setProperty('--fill', `${((input.value - input.min) / span) * 100}%`);
  };

  // ---------- Loading ----------

  const status = $('loadStatus');

  async function openFile(file) {
    if (!file) return;
    pause();
    status.classList.remove('error');
    status.textContent = `Opening “${file.name}”…`;
    try {
      book = await EPUB.load(file, (f) => { status.textContent = `Reading chapters… ${Math.round(f * 100)}%`; });
    } catch (err) {
      console.error(err);
      status.classList.add('error');
      status.textContent = err.message || 'Could not read this file.';
      showWelcome();
      return;
    }
    status.textContent = '';
    bookKey = `sr:pos:${book.title}|${book.author}|${book.words.length}`;
    pos = Math.min(store.get(bookKey, 0), book.words.length - 1);
    pacerChapter = -1;

    $('bookTitle').textContent = book.title;
    lastChapter = -1;

    const sel = $('chapterSelect');
    sel.innerHTML = '';
    book.chapters.forEach((c, i) => sel.add(new Option(c.title, i)));
    $('progress').max = book.words.length - 1;

    $('welcome').hidden = true;
    $('reader').hidden = false;
    document.body.classList.add('reading');
    setMode(settings.mode);
    keepAwake();
  }

  function showWelcome() {
    if (book) return;
    $('welcome').hidden = false;
    $('reader').hidden = true;
  }

  $('fileInput').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });

  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
  document.addEventListener('drop', (e) => openFile(e.dataTransfer.files[0]));

  // ---------- Text helpers ----------

  const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
  const CLAUSE_END = /[,;:—–]["'”’)\]]*$/;

  function chapterAt(i) {
    const ch = book.chapters;
    let lo = 0, hi = ch.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ch[mid].start <= i) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  const isBreak = (i) => i < 0 || book.paraEnd[i] || SENTENCE_END.test(book.words[i]);

  function sentenceStart(i) {
    while (i > 0 && !isBreak(i - 1)) i--;
    return i;
  }

  function prevSentence() {
    const s = sentenceStart(pos);
    return s < pos ? s : sentenceStart(Math.max(0, pos - 1));
  }

  function nextSentence() {
    let i = pos;
    while (i < book.words.length - 1 && !isBreak(i)) i++;
    return Math.min(i + 1, book.words.length - 1);
  }

  // Optimal recognition point: slightly left of centre of the word's letters.
  function orpIndex(word) {
    const lead = word.search(/[\p{L}\p{N}]/u);
    const start = lead < 0 ? 0 : lead;
    const core = word.slice(start).replace(/[^\p{L}\p{N}]+$/u, '').length || word.length;
    const k = core <= 1 ? 0 : core <= 5 ? 1 : core <= 9 ? 2 : core <= 13 ? 3 : 4;
    return Math.min(start + k, word.length - 1);
  }

  function wordDelay(i) {
    const base = 60000 / settings.wpm;
    if (!settings.pauses) return base;
    const w = book.words[i];
    let m = 1;
    if (book.paraEnd[i]) m = 2.6;
    else if (SENTENCE_END.test(w)) m = 2.2;
    else if (CLAUSE_END.test(w)) m = 1.5;
    if (w.length > 8) m += Math.min(0.6, (w.length - 8) * 0.05);
    const next = i + 1;
    if (next < book.words.length && book.chapters[chapterAt(next)].start === next) m = Math.max(m, 4);
    return base * m;
  }

  // ---------- Playback ----------

  function stepSize() {
    return settings.mode === 'rsvp' ? settings.chunk : 1;
  }

  function step() {
    if (!playing) return;
    if (pos >= book.words.length) { pos = book.words.length - 1; pause(); return; }
    const n = Math.min(stepSize(), book.words.length - pos);
    render();
    let d = 0;
    for (let k = 0; k < n; k++) d += wordDelay(pos + k);
    if (settings.ramp && rampStep < 10) d *= 1 + (10 - rampStep) * 0.07;
    rampStep++;
    timer = setTimeout(() => {
      pos += n;
      if (pos >= book.words.length) { pos = book.words.length - 1; pause(); render(); return; }
      step();
    }, d);
  }

  function play() {
    if (!book || playing) return;
    playing = true;
    rampStep = 0;
    setPlayIcon();
    $('rsvpContext').classList.remove('show');
    keepAwake();
    step();
  }

  function pause() {
    clearTimeout(timer);
    if (!playing) return;
    playing = false;
    setPlayIcon();
    savePos(true);
    render();
    keepAwake();
  }

  function setPlayIcon() {
    const btn = $('play');
    btn.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    document.body.classList.toggle('playing', playing);
  }

  const toggle = () => (playing ? pause() : play());

  function seek(i) {
    if (!book) return;
    pos = Math.max(0, Math.min(book.words.length - 1, i));
    rampStep = 0;
    if (playing) { clearTimeout(timer); step(); } else render();
    savePos(true);
  }

  function savePos(force) {
    if (!book) return;
    const now = Date.now();
    if (force || now - lastSaved > 3000) { store.set(bookKey, pos); lastSaved = now; }
  }

  // ---------- Rendering ----------

  function render() {
    if (!book) return;
    const ci = chapterAt(pos);
    if (settings.mode === 'rsvp') renderRsvp(); else renderPacer(ci);

    if (ci !== lastChapter) {
      lastChapter = ci;
      $('chapterSelect').value = ci;
      $('bookSub').textContent = [book.author, book.chapters[ci].title].filter(Boolean).join(' · ');
    }
    $('progress').value = pos;
    fill($('progress'));
    renderStats(ci);
    savePos(false);
  }

  function renderRsvp() {
    const el = $('rsvpWord');
    const [l, pv, r] = el.children;
    const n = Math.min(settings.chunk, book.words.length - pos);
    if (n > 1) {
      el.classList.add('chunk');
      r.textContent = book.words.slice(pos, pos + n).join(' ');
    } else {
      el.classList.remove('chunk');
      const w = book.words[pos];
      const k = orpIndex(w);
      l.textContent = w.slice(0, k);
      pv.textContent = w[k] || '';
      r.textContent = w.slice(k + 1);
    }

    const ctx = $('rsvpContext');
    if (playing) return;
    ctx.innerHTML = '';
    const from = sentenceStart(Math.max(0, pos - 12));
    let to = Math.min(book.words.length, pos + n + 20);
    while (to < book.words.length && to - pos < 40 && !isBreak(to - 1)) to++;
    for (let i = from; i < to; i++) {
      const s = document.createElement('span');
      s.textContent = book.words[i];
      s.dataset.i = i;
      if (i >= pos && i < pos + n) s.className = 'cur';
      ctx.append(s, ' ');
    }
    ctx.classList.add('show');
  }

  function buildPacer(ci) {
    const ch = book.chapters[ci];
    $('pacerTitle').textContent = ch.title;
    const host = $('pacerText');
    host.classList.toggle('bionic', settings.bionic);
    const frag = document.createDocumentFragment();
    pacerSpans = [];
    let p = document.createElement('p');
    for (let i = ch.start; i < ch.end; i++) {
      const w = book.words[i];
      const s = document.createElement('span');
      s.dataset.i = i;
      if (settings.bionic && w.length > 1) {
        const cut = Math.ceil(w.length * 0.45);
        const b = document.createElement('b');
        b.textContent = w.slice(0, cut);
        s.append(b, w.slice(cut));
      } else {
        s.textContent = w;
      }
      p.append(s, ' ');
      pacerSpans.push(s);
      if (book.paraEnd[i]) { frag.append(p); p = document.createElement('p'); }
    }
    if (p.childNodes.length) frag.append(p);
    host.replaceChildren(frag);
    pacerChapter = ci;
    pacerCur = null;
    $('pacerStage').scrollTo({ top: 0, behavior: 'instant' });
  }

  function renderPacer(ci) {
    if (ci !== pacerChapter) buildPacer(ci);
    const span = pacerSpans[pos - book.chapters[ci].start];
    if (pacerCur) pacerCur.classList.remove('cur');
    pacerCur = span;
    if (!span) return;
    span.classList.add('cur');

    const stage = $('pacerStage');
    const sr = stage.getBoundingClientRect();
    const wr = span.getBoundingClientRect();
    if (wr.top < sr.top + 40 || wr.bottom > sr.bottom - sr.height * 0.35) {
      stage.scrollTop += wr.top - sr.top - sr.height * 0.3;
    }
  }

  function fmtTime(min) {
    if (min < 1) return '<1 min';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h ? `${h}h ${m}m` : `${m} min`;
  }

  function renderStats(ci) {
    const ch = book.chapters[ci];
    const total = book.words.length;
    const factor = settings.pauses ? 1.2 : 1;
    const chLeft = ((ch.end - pos) / settings.wpm) * factor;
    const bookLeft = ((total - pos) / settings.wpm) * factor;
    const pct = Math.floor((pos / Math.max(1, total - 1)) * 100);
    $('posLabel').textContent = `Chapter ${ci + 1} of ${book.chapters.length} · ${pct}%`;
    $('timeLabel').textContent = `${fmtTime(chLeft)} left in chapter · ${fmtTime(bookLeft)} in book`;
  }

  // ---------- Mode & settings ----------

  function setMode(mode) {
    settings.mode = mode;
    saveSettings();
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    $('rsvpStage').hidden = mode !== 'rsvp';
    $('pacerStage').hidden = mode !== 'pacer';
    if (playing) { clearTimeout(timer); step(); } else render();
  }

  function setWpm(v) {
    settings.wpm = Math.max(100, Math.min(1200, v));
    $('wpm').value = settings.wpm;
    $('wpmOut').textContent = settings.wpm;
    fill($('wpm'));
    saveSettings();
    if (book) renderStats(chapterAt(pos));
  }

  function applyAppearance() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--scale', settings.fontSize / 100);
    $('fontSizeOut').textContent = `${settings.fontSize}%`;
    fill($('fontSize'));
  }

  $('wpm').addEventListener('input', (e) => setWpm(+e.target.value));
  $('slower').addEventListener('click', () => setWpm(settings.wpm - 25));
  $('faster').addEventListener('click', () => setWpm(settings.wpm + 25));

  const radios = (name, value, onChange) => {
    for (const r of document.querySelectorAll(`input[name="${name}"]`)) {
      r.checked = r.value === String(value);
      r.addEventListener('change', () => onChange(r.value));
    }
  };
  radios('chunk', settings.chunk, (v) => { settings.chunk = +v; saveSettings(); render(); });
  radios('theme', settings.theme, (v) => { settings.theme = v; saveSettings(); applyAppearance(); });

  $('fontSize').value = settings.fontSize;
  $('fontSize').addEventListener('input', (e) => { settings.fontSize = +e.target.value; saveSettings(); applyAppearance(); });

  for (const id of ['pauses', 'ramp', 'bionic', 'keepAwake']) {
    $(id).checked = settings[id];
    $(id).addEventListener('change', (e) => {
      settings[id] = e.target.checked;
      saveSettings();
      if (id === 'bionic') { pacerChapter = -1; render(); }
      else if (id === 'keepAwake') keepAwake();
      else if (book) renderStats(chapterAt(pos));
    });
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  const dialog = $('settings');
  $('openSettings').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // ---------- Keep the screen awake ----------
  // Hold a screen wake lock while a book is open; let it go once the reader
  // has been paused and untouched for a while, so the battery isn't drained.

  const IDLE_RELEASE_MS = 5 * 60 * 1000;
  const wakeSupported = 'wakeLock' in navigator;
  let wakeLock = null;
  let wakePending = false;
  let idleTimer = 0;

  function updateAwakeBadge() {
    $('awakeBadge').hidden = !wakeLock;
  }

  async function keepAwake() {
    clearTimeout(idleTimer);
    if (!book || !settings.keepAwake || !wakeSupported || document.hidden) {
      releaseAwake();
      return;
    }
    if (!playing) idleTimer = setTimeout(releaseAwake, IDLE_RELEASE_MS);
    if (wakeLock || wakePending) return;
    wakePending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { if (wakeLock === lock) { wakeLock = null; updateAwakeBadge(); } });
      wakeLock = lock;
      // Settings may have changed while the request was in flight.
      if (!settings.keepAwake || !book) releaseAwake();
    } catch {
      wakeLock = null;
    } finally {
      wakePending = false;
      updateAwakeBadge();
    }
  }

  function releaseAwake() {
    clearTimeout(idleTimer);
    const lock = wakeLock;
    wakeLock = null;
    if (lock) lock.release().catch(() => {});
    updateAwakeBadge();
  }

  if (!wakeSupported) {
    $('keepAwake').disabled = true;
    $('awakeNote').textContent = 'Not supported by this browser. Try an up-to-date Chrome, Edge or Safari.';
  }

  // Any interaction counts as "still reading" and restarts the idle countdown.
  for (const t of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(t, () => { if (book) keepAwake(); }, { passive: true });
  $('pacerStage').addEventListener('scroll', () => { if (!playing) keepAwake(); }, { passive: true });

  // ---------- Navigation ----------

  const gotoChapter = (ci) => {
    if (!book) return;
    ci = Math.max(0, Math.min(book.chapters.length - 1, ci));
    seek(book.chapters[ci].start);
  };

  $('play').addEventListener('click', toggle);
  $('rsvpWord').parentElement.addEventListener('click', toggle);
  $('back').addEventListener('click', () => seek(prevSentence()));
  $('fwd').addEventListener('click', () => seek(nextSentence()));
  $('prevChapter').addEventListener('click', () => {
    const ci = chapterAt(pos);
    gotoChapter(pos > book.chapters[ci].start + 20 ? ci : ci - 1);
  });
  $('nextChapter').addEventListener('click', () => gotoChapter(chapterAt(pos) + 1));
  $('chapterSelect').addEventListener('change', (e) => gotoChapter(+e.target.value));
  $('progress').addEventListener('input', (e) => seek(+e.target.value));

  const jumpToWord = (e) => {
    const s = e.target.closest('[data-i]');
    if (s) seek(+s.dataset.i);
  };
  $('rsvpContext').addEventListener('click', (e) => { e.stopPropagation(); jumpToWord(e); });
  $('pacerText').addEventListener('click', jumpToWord);

  document.addEventListener('keydown', (e) => {
    if (!book || e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' && e.key === ' ') e.target.blur();
    if ((tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const actions = {
      ' ': toggle,
      ArrowLeft: () => seek(prevSentence()),
      ArrowRight: () => seek(nextSentence()),
      ArrowUp: () => setWpm(settings.wpm + 25),
      ArrowDown: () => setWpm(settings.wpm - 25),
      '[': () => $('prevChapter').click(),
      ']': () => $('nextChapter').click(),
      m: () => setMode(settings.mode === 'rsvp' ? 'pacer' : 'rsvp'),
      M: () => setMode(settings.mode === 'rsvp' ? 'pacer' : 'rsvp'),
      Escape: pause,
    };
    const fn = actions[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });

  // Space on a focused button would otherwise also "click" it.
  document.addEventListener('keyup', (e) => {
    if (book && e.key === ' ' && e.target.tagName === 'BUTTON') e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    // The browser drops the wake lock when the page is hidden; take it again on return.
    else keepAwake();
  });
  window.addEventListener('pagehide', () => savePos(true));

  setWpm(settings.wpm);
  applyAppearance();
})();
