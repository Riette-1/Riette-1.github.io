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
  let statusTimer = 0;

  function showStatus(text, isError, linger) {
    clearTimeout(statusTimer);
    status.classList.toggle('error', !!isError);
    status.classList.toggle('show', !!text);
    if (text) status.textContent = text;
    if (text && linger) statusTimer = setTimeout(() => showStatus(''), linger);
  }

  // shelfKey is set when the book is opened from the bookshelf.
  async function loadBook(file, shelfKey) {
    if (!file) return;
    pause();
    showStatus(shelfKey ? 'Finding your bookmark…' : `Taking “${file.name.replace(/\.epub$/i, '')}” off the shelf…`);
    let loaded;
    try {
      loaded = await EPUB.load(file, (f) => showStatus(`Turning the pages… ${Math.round(f * 100)}%`));
    } catch (err) {
      console.error(err);
      showStatus(shelfKey
        ? 'This book couldn’t be opened any more. Take it off the shelf and add it again.'
        : err.message || 'Could not read this file.', true, 8000);
      return;
    }
    showStatus('');
    book = loaded;
    bookKey = `sr:pos:${book.title}|${book.author}|${book.words.length}`;
    pos = Math.min(store.get(bookKey, 0), book.words.length - 1);
    pacerChapter = -1;
    lastChapter = -1;
    computeTiming();

    $('bookTitle').textContent = book.title;
    const sel = $('chapterSelect');
    sel.innerHTML = '';
    book.chapters.forEach((c, i) => sel.add(new Option(c.title, i)));
    $('progress').max = book.words.length - 1;

    Library.touch(bookKey);
    if (!shelfKey) {
      Library.add({ key: bookKey, file, cover: book.cover, title: book.title, author: book.author, addedAt: Date.now() })
        .catch((err) => {
          console.warn('Could not put the book on the shelf', err);
          showStatus('There’s no room left on this device to keep this book on the shelf, but you can still read it now.', true, 8000);
        });
    }
    savePos(true);
    showReader();
  }

  function showReader() {
    $('welcome').hidden = true;
    $('reader').hidden = false;
    document.body.classList.add('reading');
    setMode(settings.mode);
    keepAwake();
  }

  function goHome() {
    pause();
    closeDefinition();
    savePos(true);
    $('reader').hidden = true;
    $('welcome').hidden = false;
    document.body.classList.remove('reading');
    releaseAwake();
    renderHome();
  }

  // ---------- Reading nook: nightstand, bookshelf and journal ----------

  let coverUrls = [];
  let shelfBooks = [];

  // A steady colour for books without a cover, picked from the title.
  function coverHue(title) {
    let h = 0;
    for (const ch of title) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  function coverInto(el, b) {
    el.style.setProperty('--hue', coverHue(b.title));
    if (b.cover) {
      const url = URL.createObjectURL(b.cover);
      coverUrls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      el.append(img);
    } else {
      const t = document.createElement('span');
      t.className = 'cover-title';
      t.textContent = b.title;
      el.append(t);
    }
  }

  // Progress summary for a shelved book, from its saved bookmark.
  function progressOf(b) {
    const m = b.mark;
    if (!m || !m.total) return { pct: 0, started: false, finished: false, left: null };
    const finished = !!m.finished || m.pos >= m.total - 1;
    return {
      pct: finished ? 100 : Math.floor((m.pos / Math.max(1, m.total - 1)) * 100),
      started: m.pos > 0,
      finished,
      left: m.units != null ? m.units / settings.wpm : null,
      chapter: m.chapter,
    };
  }

  function finishBy(minutes) {
    const t = new Date(Date.now() + minutes * 60000);
    const time = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const sameDay = t.toDateString() === new Date().toDateString();
    return sameDay ? `finish by ${time} today` : minutes < 60 * 24 * 6 ? `finish by ${t.toLocaleDateString(undefined, { weekday: 'long' })} ${time}` : '';
  }

  async function renderHome() {
    shelfBooks = await Library.books();
    coverUrls.forEach((u) => URL.revokeObjectURL(u));
    coverUrls = [];
    const has = shelfBooks.length > 0;
    $('welcome').classList.toggle('has-books', has);
    $('hero').hidden = has;
    $('techniques').hidden = has;
    $('nightstand').hidden = !has;
    $('shelf').hidden = !has;
    $('journal').hidden = !has && Journal.stats().totalMinutes === 0;
    renderJournal();
    if (!has) return;

    const hour = new Date().getHours();
    $('greeting').textContent = hour < 5 ? 'Up late?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    // The nightstand holds the most recently opened book.
    const cur = shelfBooks[0];
    const p = progressOf(cur);
    $('nsTitle').textContent = cur.title;
    $('nsAuthor').textContent = cur.author || '';
    const cover = document.querySelector('.ns-cover');
    cover.replaceChildren();
    coverInto(cover, cur);
    $('nsBar').style.width = `${p.pct}%`;
    $('nsPct').textContent = `${p.pct}%`;
    $('nsContinueLabel').textContent = p.finished ? 'Read it again' : p.started ? 'Open to my bookmark' : 'Start reading';
    if (p.finished) {
      $('nsWhere').textContent = 'Finished. Time to pick the next one from your shelf?';
    } else if (!p.started) {
      $('nsWhere').textContent = 'Not started yet. The first page is waiting.';
    } else {
      const when = p.left != null ? ` · ${fmtTime(p.left)} to the end, ${finishBy(p.left)}` : '';
      $('nsWhere').textContent = `Bookmarked in ${p.chapter}${when}`.replace(/, $/, '');
    }

    $('shelfCount').textContent = `${shelfBooks.length} ${shelfBooks.length === 1 ? 'book' : 'books'}`;
    const grid = $('shelfGrid');
    grid.replaceChildren();
    shelfBooks.forEach((b, i) => {
      const bp = progressOf(b);
      const item = document.createElement('div');
      item.className = 'shelf-book';
      item.setAttribute('role', 'listitem');

      const open = document.createElement('button');
      open.className = 'sb-open';
      open.dataset.key = b.key;
      const meta = bp.finished ? 'Finished' : !bp.started ? 'Not started' : bp.left != null ? `${bp.pct}% · ${fmtTime(bp.left)} left` : `${bp.pct}%`;
      open.setAttribute('aria-label', `${b.title}${b.author ? ` by ${b.author}` : ''}, ${meta}`);
      const c = document.createElement('span');
      c.className = 'sb-cover';
      coverInto(c, b);
      if (i === 0) {
        const ribbon = document.createElement('span');
        ribbon.className = 'sb-ribbon';
        ribbon.title = 'On your nightstand';
        ribbon.innerHTML = '<svg width="14" height="14"><use href="#i-bookmark"/></svg>';
        c.append(ribbon);
      }
      if (bp.finished) {
        const done = document.createElement('span');
        done.className = 'sb-done';
        done.textContent = 'Finished';
        c.append(done);
      }
      const title = document.createElement('span');
      title.className = 'sb-title';
      title.textContent = b.title;
      const m = document.createElement('span');
      m.className = 'sb-meta';
      m.textContent = meta;
      const bar = document.createElement('span');
      bar.className = 'sb-bar';
      const barFill = document.createElement('span');
      barFill.style.width = `${bp.pct}%`;
      bar.append(barFill);
      open.append(c, title, m, bar);

      const remove = document.createElement('button');
      remove.className = 'sb-remove';
      remove.dataset.remove = b.key;
      remove.title = 'Take off the shelf';
      remove.setAttribute('aria-label', `Take ${b.title} off the shelf`);
      remove.innerHTML = '<svg width="14" height="14"><use href="#i-x"/></svg>';
      item.append(open, remove);
      grid.append(item);
    });

    const add = document.createElement('label');
    add.className = 'shelf-book shelf-add';
    add.htmlFor = 'fileInput';
    add.setAttribute('role', 'listitem');
    add.innerHTML = '<span class="sb-cover"><svg width="28" height="28"><use href="#i-plus"/></svg></span><span class="sb-title">Add a book</span><span class="sb-meta">EPUB from your device</span>';
    grid.append(add);
  }

  function openFromShelf(key) {
    const b = shelfBooks.find((x) => x.key === key);
    if (!b) return;
    if (book && bookKey === b.key) { Library.touch(bookKey); showReader(); }
    else loadBook(b.file, b.key);
  }

  $('nsContinue').addEventListener('click', () => {
    const cur = shelfBooks[0];
    if (!cur) return;
    // Finished books start again from the top.
    if (progressOf(cur).finished) {
      store.set(cur.key, 0);
      Library.setMark(cur.key, { ...cur.mark, pos: 0, finished: false });
      if (book && bookKey === cur.key) pos = 0;
    }
    openFromShelf(cur.key);
  });

  $('shelfGrid').addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const b = shelfBooks.find((x) => x.key === rm.dataset.remove);
      if (!b || !confirm(`Take “${b.title}” off your shelf? The book is removed from this device. Its bookmark and your reading journal are kept.`)) return;
      await Library.remove(b.key);
      renderHome();
      return;
    }
    const open = e.target.closest('.sb-open');
    if (open) openFromShelf(open.dataset.key);
  });

  const journalEls = {
    today: $('jToday'), streak: $('jStreak'), week: $('jWeek'), words: $('jWords'), finished: $('jFinished'), finishedLabel: $('jFinishedLabel'),
    bars: $('jBars'), axis: $('jAxis'), max: $('jMax'), empty: $('jEmpty'),
    paceCard: {
      avg: $('pAvg'), best: $('pBest'), bestLabel: $('pBestLabel'), bestWhen: $('pBestWhen'), change: $('pChange'), changeWhen: $('pChangeWhen'),
      chart: $('pChart'), paceEmpty: $('pEmpty'), paceTip: $('pTip'),
    },
  };
  const renderJournal = () => Journal.render(journalEls);

  // The pace chart is drawn to the card's width, so redraw it when that changes.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('journal').hidden && !$('welcome').hidden) renderJournal(); }, 150);
  });

  // Chart tooltip: follows hover on desktop, tap or focus on touch.
  const tip = $('jTip');
  const showTip = (col) => {
    if (!col) { tip.hidden = true; return; }
    tip.textContent = col.dataset.tip;
    tip.hidden = false;
    const host = tip.parentElement.getBoundingClientRect();
    const r = col.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - host.left, 70), host.width - 70);
    tip.style.left = `${x}px`;
  };
  $('jBars').addEventListener('pointerover', (e) => showTip(e.target.closest('.bar-col')));
  $('jBars').addEventListener('pointerleave', () => showTip(null));
  $('jBars').addEventListener('focusin', (e) => showTip(e.target.closest('.bar-col')));
  $('jBars').addEventListener('focusout', () => showTip(null));

  $('goHome').addEventListener('click', goHome);
  $('brand').addEventListener('click', () => { if (book && !$('reader').hidden) goHome(); });

  $('fileInput').addEventListener('change', (e) => { loadBook(e.target.files[0]); e.target.value = ''; });

  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); document.body.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); document.body.classList.remove('drag-over'); }));
  document.addEventListener('drop', (e) => loadBook(e.dataTransfer.files[0]));

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

  // How long word i stays on screen, in units of one plain word.
  function wordWeight(i) {
    if (!settings.pauses) return 1;
    const w = book.words[i];
    let m = 1;
    if (book.paraEnd[i]) m = 2.6;
    else if (SENTENCE_END.test(w)) m = 2.2;
    else if (CLAUSE_END.test(w)) m = 1.5;
    if (w.length > 8) m += Math.min(0.6, (w.length - 8) * 0.05);
    const next = i + 1;
    if (next < book.words.length && book.chapters[chapterAt(next)].start === next) m = Math.max(m, 4);
    return m;
  }

  const wordDelay = (i) => (60000 / settings.wpm) * wordWeight(i);

  // Running total of word weights, so the time between any two positions is
  // a subtraction: minutes = (cum[to] - cum[from]) / wpm.
  function computeTiming() {
    const n = book.words.length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + wordWeight(i);
    book.cum = cum;
  }

  const minutesBetween = (from, to) => (book.cum[to] - book.cum[from]) / settings.wpm;

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
      Journal.addWords(n);
      if (pos >= book.words.length) {
        pos = book.words.length - 1;
        Journal.finished(bookKey, book.title);
        pause();
        render();
        showStatus(`You finished “${book.title}”. Well read!`, false, 6000);
        return;
      }
      step();
    }, d);
  }

  function play() {
    if (!book || playing) return;
    playing = true;
    rampStep = 0;
    setPlayIcon();
    $('rsvpContext').classList.remove('show');
    closeDefinition();
    keepAwake();
    Journal.start();
    step();
  }

  function pause() {
    clearTimeout(timer);
    if (!playing) return;
    playing = false;
    Journal.flush(false);
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
    if (force || now - lastSaved > 3000) {
      store.set(bookKey, pos);
      const total = book.words.length;
      Library.setMark(bookKey, {
        pos,
        total,
        chapter: book.chapters[chapterAt(pos)].title,
        units: book.cum[total] - book.cum[pos],
        finished: pos >= total - 1,
      });
      lastSaved = now;
    }
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
    const chLeft = minutesBetween(pos, ch.end);
    const bookLeft = minutesBetween(pos, total);
    const pct = Math.floor((pos / Math.max(1, total - 1)) * 100);
    $('posLabel').textContent = `Chapter ${ci + 1} of ${book.chapters.length} · ${fmtTime(chLeft)} left`;
    const strong = document.createElement('strong');
    strong.textContent = fmtTime(bookLeft);
    $('timeLabel').replaceChildren(strong, ` to the end · ${pct}%`);
    $('timeLabel').title = `At ${settings.wpm} wpm you'll ${finishBy(bookLeft) || 'finish in ' + fmtTime(bookLeft)}`;
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
      else if (id === 'pauses' && book) { computeTiming(); renderStats(chapterAt(pos)); }
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
    if (!book || $('reader').hidden || !settings.keepAwake || !wakeSupported || document.hidden) {
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
      if (!settings.keepAwake || !book || $('reader').hidden) releaseAwake();
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

  // A long press (or double-click) on a word looks it up; the click that
  // ends a long press shouldn't also move the bookmark.
  let pressTimer = 0;
  let pressAt = null;
  let suppressClick = false;

  const jumpToWord = (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const s = e.target.closest('[data-i]');
    if (s) seek(+s.dataset.i);
  };
  $('rsvpContext').addEventListener('click', (e) => { e.stopPropagation(); jumpToWord(e); });
  $('pacerText').addEventListener('click', jumpToWord);

  for (const host of [$('pacerText'), $('rsvpContext')]) {
    host.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('[data-i]');
      if (!s) return;
      suppressClick = false;
      pressAt = { x: e.clientX, y: e.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { suppressClick = true; lookUp(+s.dataset.i); }, 500);
    });
    host.addEventListener('pointermove', (e) => {
      if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 10) clearTimeout(pressTimer);
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) host.addEventListener(t, () => clearTimeout(pressTimer));
    host.addEventListener('dblclick', (e) => {
      const s = e.target.closest('[data-i]');
      if (s) { e.stopPropagation(); lookUp(+s.dataset.i); }
    });
    host.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-i]')) e.preventDefault(); });
  }

  const defPop = $('defPop');
  let lookupId = 0;

  async function lookUp(i) {
    if (!book) return;
    pause();
    const raw = book.words[i];
    const word = Dictionary.clean(raw) || raw;
    const id = ++lookupId;
    $('defWord').textContent = word;
    $('defPhon').textContent = '';
    $('defMore').href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
    const body = $('defBody');
    body.innerHTML = '<p class="def-note">Looking it up…</p>';
    defPop.hidden = false;

    let result;
    try {
      result = await Dictionary.define(raw);
    } catch {
      if (id !== lookupId) return;
      body.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'def-note';
      p.textContent = navigator.onLine === false
        ? 'You’re offline. Looking up words needs an internet connection.'
        : 'The dictionary couldn’t be reached just now. Please try again in a moment.';
      body.append(p);
      return;
    }
    if (id !== lookupId) return;
    body.replaceChildren();
    if (!result) {
      const p = document.createElement('p');
      p.className = 'def-note';
      p.textContent = `No definition found for “${word}”. It may be a name, or a word this English dictionary doesn’t know.`;
      body.append(p);
      return;
    }
    $('defWord').textContent = result.word;
    $('defPhon').textContent = result.phonetic;
    for (const m of result.meanings) {
      const kind = document.createElement('p');
      kind.className = 'def-pos';
      kind.textContent = m.partOfSpeech;
      const ol = document.createElement('ol');
      for (const d of m.definitions) {
        const li = document.createElement('li');
        li.textContent = d.definition;
        if (d.example) {
          const ex = document.createElement('span');
          ex.className = 'def-ex';
          ex.textContent = `“${d.example}”`;
          li.append(ex);
        }
        ol.append(li);
      }
      body.append(kind, ol);
    }
  }

  function closeDefinition() {
    lookupId++;
    defPop.hidden = true;
  }

  $('defClose').addEventListener('click', closeDefinition);
  document.addEventListener('pointerdown', (e) => {
    if (!defPop.hidden && !defPop.contains(e.target) && !e.target.closest('[data-i]')) closeDefinition();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !defPop.hidden) { closeDefinition(); return; }
    if (!book || $('reader').hidden || e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
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
      d: () => lookUp(pos),
      D: () => lookUp(pos),
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
  window.addEventListener('pagehide', () => { Journal.flush(playing); savePos(true); });

  setWpm(settings.wpm);
  applyAppearance();
  renderHome();
})();
