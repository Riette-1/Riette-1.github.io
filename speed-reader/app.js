(() => {
  const $ = (id) => document.getElementById(id);
  const t = I18n.t;
  const plural = I18n.plural;
  I18n.apply();

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const settings = Object.assign(
    {
      wpm: 300, chunk: 1, pauses: true, ramp: true, bionic: false, fontSize: 100, theme: 'auto', mode: 'pacer', keepAwake: true,
      estPace: 'setting', estCustom: 400, dailyMinutes: 20, storyRate: 1, voiceURI: '', pacerChunk: 1, lang: 'af', quizzes: false,
    },
    store.get('sr:settings', {}),
  );
  const saveSettings = () => store.set('sr:settings', settings);
  // Pacer became the default mode; move everyone onto it once.
  if ((settings.version || 1) < 2) {
    settings.mode = 'pacer';
    settings.version = 2;
    saveSettings();
  }
  const MODES = ['pacer', 'rsvp', 'page', 'story', 'together'];
  if (!MODES.includes(settings.mode)) settings.mode = 'pacer';
  // Children read at their own pace: no speed-reading modes in kids' mode,
  // and reading together is only offered there.
  const allowedModes = () => (Kids.on ? ['page', 'story', 'together'] : ['pacer', 'rsvp', 'page', 'story']);

  let book = null;
  let bookKey = '';
  let pos = 0;
  let playing = false;
  let timer = 0;
  let rampStep = 0;
  // The word (or group) on screen now: when it appeared, how long it stays,
  // and what happens next. Lets a speed change apply mid-word.
  let stepStarted = 0;
  let stepDelay = 0;
  let stepRamp = 1;
  let stepWords = 0;
  let stepAdvance = null;
  let pacerChapter = -1;
  let pacerSpans = [];
  let pacerCurs = [];
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
    showStatus(shelfKey ? t('Finding your bookmark…') : t('Taking “{name}” off the shelf…', { name: file.name.replace(/\.epub$/i, '') }));
    let loaded;
    try {
      loaded = await EPUB.load(file, (f) => showStatus(t('Turning the pages… {pct}%', { pct: Math.round(f * 100) })));
    } catch (err) {
      console.error(err);
      showStatus(shelfKey
        ? t('This book couldn’t be opened any more. Take it off the shelf and add it again.')
        : t(err.message || 'Could not read this file.'), true, 8000);
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
    fillVoices();
    const sel = $('chapterSelect');
    sel.innerHTML = '';
    book.chapters.forEach((c, i) => sel.add(new Option(c.title, i)));
    $('progress').max = book.words.length - 1;

    Library.touch(bookKey);
    if (!shelfKey) {
      Library.add({ key: bookKey, file, cover: book.cover, title: book.title, author: book.author, addedAt: Date.now() })
        .catch((err) => {
          console.warn('Could not put the book on the shelf', err);
          showStatus(t('There’s no room left on this device to keep this book on the shelf, but you can still read it now.'), true, 8000);
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
    $('selBar').hidden = true;
    getSelection().removeAllRanges();
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

  // Minutes left (or for the whole book) at a pace. A speed setting adds the
  // smart pauses; a real pace from the journal already includes them.
  function minutesLeftAt(m, wpm, real, whole) {
    if (!m || !m.total || !wpm) return null;
    const words = whole ? m.total : m.total - m.pos;
    if (real || !settings.pauses) return words / wpm;
    // Older bookmarks only kept the weighted time left as "units".
    const weighted = whole ? m.wTotal : m.wLeft != null ? m.wLeft : m.units;
    return weighted != null ? weighted / wpm : null;
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
      left: minutesLeftAt(m, settings.wpm, false),
      chapter: m.chapter,
    };
  }

  function finishBy(minutes) {
    const end = new Date(Date.now() + minutes * 60000);
    const time = end.toLocaleTimeString(I18n.locale(), { hour: 'numeric', minute: '2-digit' });
    const sameDay = end.toDateString() === new Date().toDateString();
    if (sameDay) return t('finish by {time} today', { time });
    return minutes < 60 * 24 * 6 ? t('finish by {day} {time}', { day: end.toLocaleDateString(I18n.locale(), { weekday: 'long' }), time }) : '';
  }

  async function renderHome() {
    // The buddy, stickers and word jar don't depend on the shelf: draw them now.
    renderKidsHome();
    renderJar();
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
    $('greeting').textContent = t(hour < 5 ? 'Up late?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
    renderKidsHome();

    // The nightstand holds the most recently opened book.
    const cur = shelfBooks[0];
    const p = progressOf(cur);
    renderMap(cur);
    $('nsTitle').textContent = cur.title;
    $('nsAuthor').textContent = cur.author || '';
    const cover = document.querySelector('.ns-cover');
    cover.replaceChildren();
    coverInto(cover, cur);
    $('nsBar').style.width = `${p.pct}%`;
    $('nsPct').textContent = `${p.pct}%`;
    $('nsContinueLabel').textContent = t(p.finished ? 'Read it again' : p.started ? 'Open to my bookmark' : 'Start reading');
    if (p.finished) {
      $('nsWhere').textContent = t('Finished. Time to pick the next one from your shelf?');
    } else if (!p.started) {
      $('nsWhere').textContent = t('Not started yet. The first page is waiting.');
    } else {
      const by = p.left != null ? finishBy(p.left) : '';
      const when = p.left == null ? '' : by ? t(' · {left} to the end, {when}', { left: fmtTime(p.left), when: by }) : t(' · {left} to the end', { left: fmtTime(p.left) });
      $('nsWhere').textContent = t('Bookmarked in {chapter}', { chapter: p.chapter }) + when;
    }

    $('shelfCount').textContent = plural(shelfBooks.length, '{n} book', '{n} books');
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
      const meta = bp.finished ? t('Finished') : !bp.started ? t('Not started') : bp.left != null ? t('{pct}% · {left} left', { pct: bp.pct, left: fmtTime(bp.left) }) : `${bp.pct}%`;
      open.setAttribute('aria-label', `${b.author ? t('{title} by {author}', { title: b.title, author: b.author }) : b.title}, ${meta}`);
      const c = document.createElement('span');
      c.className = 'sb-cover';
      coverInto(c, b);
      if (i === 0) {
        const ribbon = document.createElement('span');
        ribbon.className = 'sb-ribbon';
        ribbon.title = t('On your nightstand');
        ribbon.innerHTML = '<svg width="14" height="14"><use href="#i-bookmark"/></svg>';
        c.append(ribbon);
      }
      if (bp.finished) {
        const done = document.createElement('span');
        done.className = 'sb-done';
        done.textContent = t('Finished');
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
      item.append(open);
      grid.append(item);
    });

    const add = document.createElement('label');
    add.className = 'shelf-book shelf-add';
    add.htmlFor = 'fileInput';
    add.setAttribute('role', 'listitem');
    add.innerHTML = '<span class="sb-cover"><svg width="28" height="28"><use href="#i-plus"/></svg></span><span class="sb-title"></span><span class="sb-meta"></span>';
    add.querySelector('.sb-title').textContent = t('Add a book');
    add.querySelector('.sb-meta').textContent = t('EPUB from your device');
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
      Library.setMark(cur.key, { ...cur.mark, pos: 0, wLeft: cur.mark.wTotal, finished: false });
      if (book && bookKey === cur.key) pos = 0;
    }
    openFromShelf(cur.key);
  });

  $('shelfGrid').addEventListener('click', (e) => {
    const open = e.target.closest('.sb-open');
    if (open && Kids.on) openFromShelf(open.dataset.key);
    else if (open) openBookSheet(open.dataset.key);
  });
  $('nsPlan').addEventListener('click', () => { if (shelfBooks[0]) openBookSheet(shelfBooks[0].key); });

  // ---------- Book card: details and reading-time estimates ----------

  const bookSheet = $('bookSheet');
  let sheetBook = null;
  let sheetCoverUrl = '';

  // Books added before reading stats were kept have no word counts yet;
  // read the stored file once to fill them in.
  async function ensureStats(b) {
    if (b.mark && b.mark.total && b.mark.wTotal != null) return;
    const bk = await EPUB.load(b.file);
    const at = Math.min(store.get(b.key, 0), bk.words.length - 1);
    b.mark = markFor(bk, cumulativeWeights(bk), at);
    Library.setMark(b.key, b.mark);
  }

  function paceChoices() {
    const p = Journal.stats().paceStats;
    const list = [{ id: 'setting', label: t('Speed setting'), wpm: settings.wpm, real: false }];
    if (p.average) list.push({ id: 'average', label: t('Your average'), wpm: p.average, real: true });
    if (p.best) list.push({ id: 'best', label: t('Your best'), wpm: p.best.wpm, real: true });
    list.push({ id: 'custom', label: t('Custom'), wpm: settings.estCustom, real: false });
    return list;
  }

  function renderPaceChoices() {
    const host = $('bsPaces');
    const list = paceChoices();
    if (!list.some((c) => c.id === settings.estPace)) settings.estPace = 'setting';
    host.replaceChildren();
    for (const c of list) {
      const label = document.createElement('label');
      label.className = 'pace-chip';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'estPace';
      input.value = c.id;
      input.checked = c.id === settings.estPace;
      const box = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = c.label;
      const val = document.createElement('small');
      val.textContent = c.id === 'custom' ? t('pick a speed') : t('{wpm} wpm', { wpm: c.wpm });
      box.append(name, val);
      label.append(input, box);
      host.append(label);
    }
  }

  function renderEstimate() {
    const b = sheetBook;
    if (!b) return;
    const choice = paceChoices().find((c) => c.id === settings.estPace) || paceChoices()[0];
    $('bsCustomRow').hidden = choice.id !== 'custom';
    $('bsCustom').value = settings.estCustom;
    $('bsCustomOut').textContent = t('{wpm} wpm', { wpm: settings.estCustom });
    fill($('bsCustom'));

    const m = b.mark;
    if (!m || !m.total) {
      for (const id of ['bsWhole', 'bsLeft']) $(id).textContent = '…';
      $('bsPlan').textContent = '';
      return;
    }
    const p = progressOf(b);
    const whole = minutesLeftAt(m, choice.wpm, choice.real, true);
    const left = p.finished ? 0 : p.started ? minutesLeftAt(m, choice.wpm, choice.real) : whole;
    $('bsWhole').textContent = fmtTime(whole);
    $('bsLeft').textContent = p.finished ? t('Done') : fmtTime(left);
    $('bsLeftLabel').textContent = p.finished ? t('you finished it') : p.started ? t('left to read · {pct}% of the book', { pct: 100 - p.pct }) : t('left to read');

    const daily = settings.dailyMinutes;
    if (p.finished) {
      $('bsPlan').textContent = t('You’ve read this one. Reading it again would take about {time}.', { time: fmtTime(whole) });
    } else if (left <= daily) {
      $('bsPlan').textContent = t('That’s a single sitting: about {time} at {wpm} wpm.', { time: fmtTime(left), wpm: choice.wpm });
    } else {
      const days = Math.ceil(left / daily);
      const end = new Date();
      end.setDate(end.getDate() + days - 1);
      const when = end.toLocaleDateString(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
      const span = days < 14 ? t('{n} days', { n: days }) : days < 60 ? t('about {n} weeks', { n: Math.round(days / 7) }) : t('about {n} months', { n: Math.round(days / 30) });
      $('bsPlan').textContent = t('At {daily} minutes a day you’ll finish in {span}, around {when}.', { daily, span, when });
    }
    $('bsNote').textContent = choice.real
      ? t('Based on your real pace from the reading journal, which already includes pauses.')
      : settings.pauses
        ? t('Includes the smart pauses at punctuation, paragraphs and long words.')
        : t('Smart pauses are off, so this is words divided by speed.');
  }

  async function openBookSheet(key) {
    const b = shelfBooks.find((x) => x.key === key);
    if (!b) return;
    sheetBook = b;
    $('bsTitle').textContent = b.title;
    $('bsAuthor').textContent = b.author || '';
    const cover = $('bsCover');
    cover.replaceChildren();
    if (sheetCoverUrl) URL.revokeObjectURL(sheetCoverUrl);
    coverInto(cover, b);
    sheetCoverUrl = coverUrls.pop() || '';
    const p = progressOf(b);
    $('bsBar').style.width = `${p.pct}%`;
    $('bsPct').textContent = `${p.pct}%`;
    $('bsOpenLabel').textContent = t(p.finished ? 'Read it again' : p.started ? 'Open to my bookmark' : 'Start reading');
    renderPaceChoices();
    for (const r of document.querySelectorAll('input[name="dailyMinutes"]')) r.checked = +r.value === settings.dailyMinutes;
    $('bsFacts').textContent = b.mark && b.mark.chapters ? '' : t('Counting the words…');
    renderEstimate();
    bookSheet.showModal();

    try {
      await ensureStats(b);
    } catch (err) {
      console.warn('Could not read book for estimates', err);
      if (sheetBook === b) $('bsFacts').textContent = t('This book couldn’t be read to count its words.');
      return;
    }
    if (sheetBook !== b) return;
    const m = b.mark;
    $('bsFacts').textContent = plural(m.chapters, '{words} words · {n} chapter', '{words} words · {n} chapters', { words: m.total.toLocaleString(I18n.locale()) });
    renderEstimate();
  }

  $('bsPaces').addEventListener('change', (e) => {
    if (e.target.name !== 'estPace') return;
    settings.estPace = e.target.value;
    saveSettings();
    renderEstimate();
  });
  $('bsCustom').addEventListener('input', (e) => {
    settings.estCustom = +e.target.value;
    saveSettings();
    renderEstimate();
  });
  for (const r of document.querySelectorAll('input[name="dailyMinutes"]')) {
    r.addEventListener('change', () => { settings.dailyMinutes = +r.value; saveSettings(); renderEstimate(); });
  }
  bookSheet.addEventListener('click', (e) => { if (e.target === bookSheet) bookSheet.close(); });

  $('bsOpen').addEventListener('click', () => {
    const b = sheetBook;
    if (!b) return;
    bookSheet.close();
    if (progressOf(b).finished) {
      store.set(b.key, 0);
      Library.setMark(b.key, { ...b.mark, pos: 0, wLeft: b.mark.wTotal, finished: false });
      if (book && bookKey === b.key) pos = 0;
    }
    openFromShelf(b.key);
  });

  $('bsRemove').addEventListener('click', async () => {
    const b = sheetBook;
    if (!b || !confirm(t('Take “{title}” off your shelf? The book is removed from this device. Its bookmark and your reading journal are kept.', { title: b.title }))) return;
    bookSheet.close();
    await Library.remove(b.key);
    renderHome();
  });

  const journalEls = {
    today: $('jToday'), streak: $('jStreak'), streakLabel: $('jStreakLabel'), week: $('jWeek'), words: $('jWords'), finished: $('jFinished'), finishedLabel: $('jFinishedLabel'),
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

  function chapterAt(i, bk = book) {
    const ch = bk.chapters;
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

  // How long word i of a book stays on screen with smart pauses, in units of
  // one plain word.
  function weightOf(bk, i) {
    const w = bk.words[i];
    let m = 1;
    if (bk.paraEnd[i]) m = 2.6;
    else if (SENTENCE_END.test(w)) m = 2.2;
    else if (CLAUSE_END.test(w)) m = 1.5;
    if (w.length > 8) m += Math.min(0.6, (w.length - 8) * 0.05);
    const next = i + 1;
    if (next < bk.words.length && bk.chapters[chapterAt(next, bk)].start === next) m = Math.max(m, 4);
    return m;
  }

  const wordWeight = (i) => (settings.pauses ? weightOf(book, i) : 1);
  const wordDelay = (i) => (60000 / settings.wpm) * wordWeight(i);

  // Running total of word weights, so the time between any two positions is
  // a subtraction: minutes = (cum[to] - cum[from]) / wpm.
  function cumulativeWeights(bk) {
    const n = bk.words.length;
    const cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + weightOf(bk, i);
    return cum;
  }

  function computeTiming() {
    book.cum = cumulativeWeights(book);
  }

  const minutesBetween = (from, to) => (settings.pauses ? book.cum[to] - book.cum[from] : to - from) / settings.wpm;

  // The bookmark summary kept for each book: enough to show progress and
  // estimate reading times on the shelf without opening the book.
  function markFor(bk, cum, at) {
    const total = bk.words.length;
    return {
      pos: at,
      total,
      chapter: bk.chapters[chapterAt(at, bk)].title,
      chapters: bk.chapters.length,
      wTotal: cum[total],
      wLeft: cum[total] - cum[at],
      finished: at >= total - 1,
    };
  }

  // ---------- Playback ----------

  // How many words to show or highlight at once from position i. A Pacer
  // group stops at the end of a paragraph so it never straddles two.
  function stepSize(i = pos) {
    if (settings.mode === 'rsvp') return settings.chunk;
    if (settings.mode !== 'pacer') return 1;
    const n = Math.min(settings.pacerChunk, book.words.length - i);
    for (let k = 0; k < n - 1; k++) if (book.paraEnd[i + k]) return k + 1;
    return n;
  }

  function step() {
    if (!playing) return;
    if (pos >= book.words.length) { pos = book.words.length - 1; pause(); return; }
    const n = Math.min(stepSize(pos), book.words.length - pos);
    render();
    stepRamp = settings.ramp && rampStep < 10 ? 1 + (10 - rampStep) * 0.07 : 1;
    rampStep++;
    stepWords = n;
    stepDelay = groupDelay(pos, n);
    stepStarted = performance.now();
    stepAdvance = () => {
      const fromChapter = chapterAt(pos);
      pos += n;
      Journal.addWords(n);
      if (pos >= book.words.length) {
        pos = book.words.length - 1;
        Journal.finished(bookKey, book.title);
        endOfBook(fromChapter, t('You finished “{title}”. Well read!', { title: book.title }));
        return;
      }
      if (chapterAt(pos) !== fromChapter && endOfChapter(fromChapter, play)) return;
      step();
    };
    timer = setTimeout(stepAdvance, stepDelay);
  }

  function groupDelay(from, n) {
    let d = 0;
    for (let k = 0; k < n; k++) d += wordDelay(from + k);
    return d * stepRamp;
  }

  // Apply a new speed straight away: keep the share of the current word
  // that's already been shown, and show the rest at the new speed.
  function retimeStep() {
    if (!playing || settings.mode === 'story' || !stepAdvance) return;
    const now = performance.now();
    const done = Math.min(1, (now - stepStarted) / (stepDelay || 1));
    const d = groupDelay(pos, stepWords);
    clearTimeout(timer);
    stepDelay = d;
    stepStarted = now - done * d;
    timer = setTimeout(stepAdvance, Math.max(0, (1 - done) * d));
  }

  function play() {
    if (!book || playing || settings.mode === 'page' || settings.mode === 'together') return;
    if (settings.mode === 'story' && !Storytime.supported) {
      showStatus(t('This browser can’t read aloud. Try an up-to-date Chrome, Edge or Safari.'), true, 6000);
      return;
    }
    playing = true;
    rampStep = 0;
    setPlayIcon();
    $('rsvpContext').classList.remove('show');
    closeDefinition();
    keepAwake();
    if (settings.mode === 'story') {
      tell();
    } else {
      Journal.start();
      step();
    }
  }

  function pause() {
    clearTimeout(timer);
    if (!playing) return;
    playing = false;
    if (settings.mode === 'story') Storytime.stop();
    Journal.flush(false);
    setPlayIcon();
    savePos(true);
    render();
    keepAwake();
  }

  function setPlayIcon() {
    const btn = $('play');
    btn.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    btn.dataset.i18nAria = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', t(btn.dataset.i18nAria));
    document.body.classList.toggle('playing', playing);
  }

  const toggle = () => (playing ? pause() : play());

  // In Page mode a seek scrolls the page to the word, unless the reader
  // just tapped it (it's already on screen).
  function seek(i, { scroll = true } = {}) {
    if (!book) return;
    pos = Math.max(0, Math.min(book.words.length - 1, i));
    rampStep = 0;
    if (settings.mode === 'page') pageScrollPending = scroll;
    if (playing && settings.mode === 'story') { render(); tell(); }
    else if (playing) { clearTimeout(timer); step(); }
    else render();
    savePos(true);
  }

  // ---------- Chapter quizzes ----------

  const quizSheet = $('quizSheet');
  let quiz = null;
  let quizCache = { key: '', ci: -1, questions: null };

  // The questions for a chapter, or null when quizzes are off or the
  // chapter is too short. Kept until shown, so a check and the quiz match.
  function quizFor(ci) {
    if (!settings.quizzes || !book || ci < 0) return null;
    if (quizCache.key !== bookKey || quizCache.ci !== ci) quizCache = { key: bookKey, ci, questions: Quiz.make(book, ci, isBreak) };
    return quizCache.questions;
  }

  // Show the quiz for chapter ci if there is one; `then` runs afterwards.
  function offerQuiz(ci, then) {
    const questions = quizFor(ci);
    if (!questions) return false;
    quizCache = { key: '', ci: -1, questions: null };
    quiz = { ci, questions, i: 0, right: 0, then };
    $('quizTitle').textContent = book.chapters[ci].title;
    $('quizDots').replaceChildren(...questions.map(() => document.createElement('span')));
    renderQuestion();
    if (!quizSheet.open) quizSheet.showModal();
    return true;
  }

  const button = (cls, label, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  function renderQuestion() {
    const q = quiz.questions[quiz.i];
    const body = $('quizBody');
    body.replaceChildren();
    $('quizActions').replaceChildren();
    [...$('quizDots').children].forEach((d, k) => d.classList.toggle('done', k < quiz.i));

    const prompt = document.createElement('p');
    prompt.className = 'quiz-prompt';
    prompt.textContent = Kids.on
      ? t(q.type === 'cloze' ? '🔤 Which word is missing?' : '⏳ What happened first?')
      : `${t('Question {n} of {total}', { n: quiz.i + 1, total: quiz.questions.length })} · ${t(q.type === 'cloze' ? 'Fill in the missing word' : 'Which came first in this chapter?')}`;
    quiz.tries = 0;
    body.append(prompt);
    if (q.type === 'cloze') {
      const text = document.createElement('p');
      text.className = 'quiz-text';
      text.textContent = q.text;
      body.append(text);
    }
    const choices = document.createElement('div');
    choices.className = 'quiz-choices';
    for (const c of q.choices) {
      choices.append(button(`quiz-choice${q.type === 'order' ? ' long' : ''}`, c, () => answer(c, choices)));
    }
    body.append(choices);
  }

  function answer(choice, choices) {
    const q = quiz.questions[quiz.i];
    const right = choice === q.answer;
    // Children get to try again: no red, no "wrong".
    if (Kids.on) {
      quiz.tries++;
      const old = $('quizBody').querySelector('.quiz-feedback');
      if (old) old.remove();
      const fb = document.createElement('p');
      fb.className = 'quiz-feedback';
      if (!right) {
        const b = [...choices.children].find((x) => x.textContent === choice);
        if (b) { b.disabled = true; b.classList.add('tried'); }
        fb.textContent = t('Oops, try again! 💪');
        $('quizBody').append(fb);
        return;
      }
      if (quiz.tries === 1) quiz.right++;
      for (const b of choices.children) { b.disabled = true; if (b.textContent === q.answer) b.classList.add('right'); }
      fb.textContent = t(quiz.tries === 1 ? 'Yay! You got it! 🎉' : 'Yes! Well done! 🎉');
      $('quizBody').append(fb);
      Kids.confetti(20);
      const lastKid = quiz.i === quiz.questions.length - 1;
      const nextKid = button('btn primary big', t(lastKid ? 'See my stars' : 'Next question'), () => {
        if (lastKid) showScore();
        else { quiz.i++; renderQuestion(); }
      });
      $('quizActions').replaceChildren(nextKid);
      nextKid.focus();
      return;
    }
    if (right) quiz.right++;
    for (const b of choices.children) {
      b.disabled = true;
      if (b.textContent === q.answer) b.classList.add('right');
      else if (b.textContent === choice) b.classList.add('wrong');
    }
    const fb = document.createElement('p');
    fb.className = 'quiz-feedback';
    fb.textContent = right ? t('Correct!') : q.type === 'cloze' ? t('Not quite. The answer is “{answer}”.', { answer: q.answer }) : t('Not quite. This part came first.');
    $('quizBody').append(fb);
    const last = quiz.i === quiz.questions.length - 1;
    const next = button('btn primary big', t(last ? 'See my score' : 'Next question'), () => {
      if (last) showScore();
      else { quiz.i++; renderQuestion(); }
    });
    $('quizActions').replaceChildren(next);
    next.focus();
  }

  function showScore() {
    const { right, questions, ci } = quiz;
    Journal.quiz(bookKey, ci, right, questions.length);
    [...$('quizDots').children].forEach((d) => d.classList.add('done'));
    const stats = Journal.quizStats();
    const ratio = right / questions.length;
    const box = document.createElement('div');
    box.className = 'quiz-score';
    if (Kids.on) {
      box.append(
        Object.assign(document.createElement('div'), { className: 'quiz-stars', textContent: '⭐'.repeat(right) + '☆'.repeat(questions.length - right) }),
        Object.assign(document.createElement('p'), { textContent: plural(right, 'You earned {n} star!', 'You earned {n} stars!') }),
        Object.assign(document.createElement('p'), { textContent: t(right === questions.length ? 'Super reading! 🌟' : 'Great reading! Every story makes you stronger. 💪') }),
      );
      $('quizBody').replaceChildren(box);
      const goKid = button('btn primary big', t('Keep reading'), () => {
        const earned = Kids.check('quiz', { perfect: right === questions.length });
        const then = quiz && quiz.then;
        quiz = null;
        quizSheet.close();
        showStickers(earned, () => { if (then) then(); });
      });
      $('quizActions').replaceChildren(goKid);
      goKid.focus();
      if (right === questions.length) Kids.confetti(50);
      return;
    }
    const big = document.createElement('span');
    big.className = 'big';
    big.textContent = `${right}/${questions.length}`;
    const lines = [
      t('{right} of {total} right', { right, total: questions.length }),
      t(ratio === 1 ? 'Sharp reading! You took it all in.' : ratio >= 0.5 ? 'Nicely done. Most of it stuck.' : 'Some of it slipped by. Try a slightly slower speed?'),
    ];
    box.append(big, ...lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
    const avg = document.createElement('p');
    avg.className = 'muted';
    avg.textContent = `${plural(stats.count, 'Average over {n} quiz: {pct}%', 'Average over {n} quizzes: {pct}%', { pct: stats.pct })} · ${t('You can turn quizzes off in Settings.')}`;
    box.append(avg);
    $('quizBody').replaceChildren(box);
    const again = button('btn link', t('Read the chapter again'), () => {
      const start = book.chapters[ci].start;
      quiz = null;
      quizSheet.close();
      seek(start);
    });
    const go = button('btn primary big', t('Continue reading'), finishQuiz);
    $('quizActions').replaceChildren(go, again);
    go.focus();
  }

  function finishQuiz() {
    const then = quiz && quiz.then;
    quiz = null;
    quizSheet.close();
    if (then) then();
  }

  $('quizSkip').addEventListener('click', finishQuiz);
  // Escape (or the back gesture) closes the quiz and leaves reading paused.
  quizSheet.addEventListener('close', () => { if (!quizSheet.open) quiz = null; });

  // ---------- End of a chapter or book ----------

  const isAfrikaansBook = () => /^af\b/i.test((book && book.language) || '');

  // Rewards, then the quiz, then `resume`. Returns true when reading paused
  // for something; false means carry straight on.
  function endOfChapter(ci, resume) {
    const earned = Kids.on ? Kids.chapterDone(isAfrikaansBook()) : [];
    if (!earned.length && !quizFor(ci)) return false;
    pause();
    render();
    showStickers(earned, () => { if (!offerQuiz(ci, resume)) resume(); });
    return true;
  }

  function endOfBook(ci, message) {
    pause();
    render();
    const earned = Kids.on ? [...Kids.chapterDone(isAfrikaansBook()), ...Kids.bookDone(bookKey)] : [];
    const done = () => {
      showStatus(message, false, 6000);
      if (Kids.on) Kids.confetti(60);
    };
    showStickers(earned, () => { if (!offerQuiz(ci, done)) done(); });
  }

  // ---------- Kids' mode ----------

  // New stickers one after another, each with confetti; then `then`.
  function showStickers(list, then = () => {}) {
    if (!list.length) { then(); return; }
    const [s, ...rest] = list;
    const pop = document.createElement('div');
    pop.className = 'sticker-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', t('New sticker!'));
    const card = document.createElement('div');
    card.className = 'card';
    const em = Object.assign(document.createElement('span'), { className: 'em', textContent: s.emoji });
    const eyebrow = Object.assign(document.createElement('p'), { className: 'eyebrow', textContent: t('New sticker!') });
    const name = Object.assign(document.createElement('h3'), { textContent: t(s.name) });
    const how = Object.assign(document.createElement('p'), { textContent: t(s.how) });
    const ok = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary big', textContent: t('Yay!') });
    card.append(em, eyebrow, name, how, ok);
    pop.append(card);
    document.body.append(pop);
    Kids.confetti();
    ok.focus();
    ok.addEventListener('click', () => { pop.remove(); showStickers(rest, then); });
  }

  const awardAndShow = (earned) => { if (earned.length) showStickers(earned); };

  function renderKidsHome() {
    if (!Kids.on) return;
    const name = Kids.state.childName;
    const b = Kids.buddy();
    $('greeting').textContent = name ? t('Hello, {name}!', { name }) : t('Hello, reader!');
    const face = $('buddyFace');
    face.textContent = b.face;
    if (b.extra) face.append(Object.assign(document.createElement('span'), { className: 'extra', textContent: b.extra }));
    $('buddyTitle').textContent = t('{buddy} is {stage}', { buddy: b.name, stage: t(b.label) });
    $('buddyText').textContent = b.last
      ? t('{buddy} is all grown up. Keep reading to keep them happy!', { buddy: b.name })
      : t('Read {n} more minutes and {buddy} will grow!', { n: b.toNext, buddy: b.name });
    $('buddyBar').style.width = `${Math.round(b.progress * 100)}%`;
    const today = Math.floor(Kids.minutesToday());
    const streak = Kids.streak();
    $('buddyToday').textContent = `${plural(today, 'You read {n} minute today', 'You read {n} minutes today')}${streak > 1 ? ` · ${plural(streak, '{n} day in a row', '{n} days in a row')} 🔥` : ''}`;

    const grid = $('stickerGrid');
    grid.replaceChildren();
    let got = 0;
    for (const st of Kids.STICKERS) {
      const has = !!Kids.state.stickers[st.id];
      if (has) got++;
      const item = document.createElement('div');
      item.className = `sticker ${has ? 'got' : 'locked'}`;
      item.setAttribute('role', 'listitem');
      item.title = t(st.how);
      item.append(
        Object.assign(document.createElement('span'), { className: 'em', textContent: st.emoji }),
        Object.assign(document.createElement('span'), { className: 'nm', textContent: has ? t(st.name) : '?' }),
        Object.assign(document.createElement('span'), { className: 'hw', textContent: t(st.how) }),
      );
      grid.append(item);
    }
    $('stickerCount').textContent = t('{got} of {total}', { got, total: Kids.STICKERS.length });
  }

  // The reading map on the nightstand card.
  function renderMap(b) {
    if (!Kids.on || !b) return;
    const p = progressOf(b);
    const m = b.mark;
    const stops = [];
    if (m && m.total && b.key === bookKey && book) {
      for (const ch of book.chapters.slice(1)) stops.push(ch.start / m.total);
    }
    const place = Kids.renderMap($('readingMap'), b.key, p.pct, stops, Kids.buddy().face);
    $('mapText').textContent = p.finished
      ? t('You made it to {place}! 🎉', { place: t(place.name) })
      : p.started
        ? t('You’ve walked {pct}% of the way to {place}!', { pct: p.pct, place: t(place.name) })
        : t('Off we go to {place}!', { place: t(place.name) });
  }

  // ---- Tap a word to hear it.
  function sayWord(i) {
    const w = book.words[i];
    if (!Storytime.say(w, { voiceURI: settings.voiceURI, lang: book.language, rate: 0.85 })) return;
    const span = $('pacerText').querySelector(`[data-i="${i}"]`);
    if (span) { span.classList.add('said'); setTimeout(() => span.classList.remove('said'), 1200); }
  }

  // ---- Reading time: a minute counts while reading is active (playing, or
  // turning pages / tapping in the last minute).
  let lastActive = 0;
  for (const tEv of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(tEv, () => { lastActive = Date.now(); }, { passive: true });
  $('pacerStage').addEventListener('scroll', () => { lastActive = Date.now(); }, { passive: true });
  const TICK = 15000;
  setInterval(() => {
    if (!Kids.on || !book || $('reader').hidden || document.hidden) return;
    if (!playing && Date.now() - lastActive > 60000) return;
    const before = Kids.buddy().stage;
    Kids.addTime(TICK);
    const earned = Kids.check('time');
    if (Kids.buddy().stage > before) earned.unshift({ emoji: Kids.buddy().face, name: 'Your buddy grew!', how: 'Keep reading to help it grow even more.' });
    if (earned.length) { if (playing) pause(); showStickers(earned); }
  }, TICK);

  // ---- Read together: child and grown-up take turns, paragraph by paragraph.
  let turnPara = null;

  // Paragraph [start, end] around word i; very short ones (headings) join the next.
  function paragraphAt(i) {
    let s = i;
    while (s > 0 && !book.paraEnd[s - 1]) s--;
    let e = i;
    while (e < book.words.length - 1 && (!book.paraEnd[e] || e - s < 3)) e++;
    return [s, e];
  }

  function turnIndex(start) {
    const ci = chapterAt(start);
    let n = 0;
    for (let i = book.chapters[ci].start; i < start; i++) if (book.paraEnd[i] && i - (paragraphAt(i)[0]) >= 3) n++;
    return n;
  }

  function renderTogether(ci) {
    if (ci !== pacerChapter) buildPacer(ci);
    clearPacerHighlight();
    $('pacerText').querySelectorAll('.turn-child, .turn-adult').forEach((p) => p.classList.remove('turn-child', 'turn-adult'));
    const [s, e] = paragraphAt(pos);
    turnPara = [s, e];
    const child = turnIndex(s) % 2 === 0;
    const base = book.chapters[ci].start;
    const paras = new Set();
    for (let i = s; i <= e; i++) { const sp = pacerSpans[i - base]; if (sp) paras.add(sp.parentElement); }
    paras.forEach((p) => p.classList.add(child ? 'turn-child' : 'turn-adult'));
    const first = [...paras][0];
    if (first) {
      const stage = $('pacerStage');
      stage.scrollTo({ top: stage.scrollTop + first.getBoundingClientRect().top - stage.getBoundingClientRect().top - 40, behavior: 'smooth' });
    }
    const kid = Kids.state.childName || t('you');
    const grown = Kids.state.adultName || t('the grown-up');
    $('turnCard').classList.toggle('adult', !child);
    $('turnFace').textContent = child ? '🧒' : '🧑';
    $('turnWho').textContent = child ? t('Your turn, {name}!', { name: kid }) : t('{name}’s turn!', { name: grown });
    $('turnHint').textContent = child ? t('Read the orange part out loud.') : t('Listen while {name} reads the blue part.', { name: grown });
  }

  function nextTurn(dir = 1) {
    if (!turnPara) return;
    if (dir < 0) {
      if (turnPara[0] > 0) seek(paragraphAt(turnPara[0] - 1)[0]);
      return;
    }
    const next = turnPara[1] + 1;
    awardAndShow(Kids.togetherTurn());
    if (next >= book.words.length) { endOfBook(chapterAt(turnPara[0]), t('You finished “{title}”. Well read!', { title: book.title })); return; }
    const ci = chapterAt(turnPara[0]);
    if (chapterAt(next) !== ci) {
      const go = () => seek(next);
      if (!endOfChapter(ci, go)) go();
      return;
    }
    seek(next);
  }
  $('turnDone').addEventListener('click', () => nextTurn(1));

  // ---- Word jar: words looked up while reading.
  function sentenceAround(i) {
    const s = sentenceStart(i);
    let e = i;
    while (e < book.words.length - 1 && !isBreak(e) && e - s < 30) e++;
    return book.words.slice(s, e + 1).join(' ');
  }

  function rememberWord(i, meaning) {
    const word = Dictionary.clean(book.words[i]) || book.words[i];
    const r = Kids.addWord({ word, meaning: meaning || '', sentence: sentenceAround(i), book: book.title, lang: book.language || '' });
    if (r.added) showStatus(t('“{word}” went into your word jar 🫙', { word }), false, 3000);
    awardAndShow(r.earned);
  }

  function renderJar() {
    const list = Kids.words();
    $('wordJar').hidden = !list.length;
    $('playMatch').hidden = list.length < 4;
    const jar = $('jarWords');
    jar.replaceChildren(...list.slice(0, 60).map((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jar-word';
      b.setAttribute('role', 'listitem');
      b.textContent = w.word;
      b.addEventListener('click', () => openWord(w));
      return b;
    }));
  }

  const wordSheet = $('wordSheet');
  let openWordEntry = null;
  function openWord(w) {
    openWordEntry = w;
    $('wordTitle').textContent = w.word;
    $('wordMeaning').textContent = w.meaning || t('No meaning saved yet. Ask a grown-up what it means!');
    $('wordSentence').textContent = w.sentence ? `“${w.sentence}”` : '';
    $('wordFrom').textContent = w.book ? t('From {book}', { book: w.book }) : '';
    wordSheet.showModal();
  }
  $('wordSay').addEventListener('click', () => {
    if (openWordEntry) Storytime.say(openWordEntry.word, { voiceURI: settings.voiceURI, lang: openWordEntry.lang, rate: 0.8 });
  });
  $('wordRemove').addEventListener('click', () => {
    if (!openWordEntry) return;
    Kids.removeWord(openWordEntry.word);
    wordSheet.close();
    renderJar();
  });

  // ---- Word match: pick the jar word that fits the clue.
  const matchSheet = $('matchSheet');
  let match = null;
  function startMatch() {
    const list = Kids.words();
    if (list.length < 4) return;
    const rounds = list.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(5, list.length));
    match = { rounds, i: 0, stars: 0, all: list };
    $('matchTitle').textContent = t('Which word fits?');
    $('matchDots').replaceChildren(...rounds.map(() => document.createElement('span')));
    renderMatch();
    matchSheet.showModal();
  }
  function renderMatch() {
    const r = match.rounds[match.i];
    [...$('matchDots').children].forEach((d, k) => d.classList.toggle('done', k < match.i));
    const body = $('matchBody');
    const clue = document.createElement('p');
    clue.className = 'quiz-text';
    const blank = r.sentence ? r.sentence.replace(new RegExp(r.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____') : '';
    clue.textContent = r.meaning ? `💡 ${r.meaning}` : `✏️ ${blank}`;
    const others = match.all.filter((w) => w.word !== r.word).sort(() => Math.random() - 0.5).slice(0, 3).map((w) => w.word);
    const choices = [r.word, ...others].sort(() => Math.random() - 0.5);
    const box = document.createElement('div');
    box.className = 'quiz-choices';
    let tries = 0;
    for (const c of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-choice';
      b.textContent = c;
      b.addEventListener('click', () => {
        tries++;
        if (c !== r.word) { b.classList.add('tried'); b.disabled = true; fb.textContent = t('Oops, try again! 💪'); return; }
        box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        b.classList.add('right');
        if (tries === 1) match.stars++;
        fb.textContent = t('Yay! 🎉');
        Kids.confetti(18);
        const last = match.i === match.rounds.length - 1;
        const next = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary big', textContent: t(last ? 'See my stars' : 'Next word') });
        next.addEventListener('click', () => { if (last) endMatch(); else { match.i++; renderMatch(); } });
        $('matchActions').replaceChildren(next);
        next.focus();
      });
      box.append(b);
    }
    const fb = Object.assign(document.createElement('p'), { className: 'quiz-feedback' });
    body.replaceChildren(clue, box, fb);
    $('matchActions').replaceChildren();
  }
  function endMatch() {
    const { stars, rounds } = match;
    const box = document.createElement('div');
    box.className = 'quiz-score';
    box.append(
      Object.assign(document.createElement('div'), { className: 'quiz-stars', textContent: '⭐'.repeat(stars) + '☆'.repeat(rounds.length - stars) }),
      Object.assign(document.createElement('p'), { textContent: plural(stars, 'You earned {n} star!', 'You earned {n} stars!') }),
    );
    $('matchBody').replaceChildren(box);
    const done = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary big', textContent: t('Done') });
    done.addEventListener('click', () => { matchSheet.close(); awardAndShow(Kids.check('game')); });
    $('matchActions').replaceChildren(done);
    Kids.confetti(40);
  }
  $('playMatch').addEventListener('click', startMatch);

  // ---- The parent PIN pad. Resolves true when a grown-up got through.
  const pinSheet = $('pinSheet');
  let pinFlow = null;
  function askPin({ title, help, check }) {
    return new Promise((resolve) => {
      pinFlow = { digits: '', title, help, check, resolve };
      $('pinTitle').textContent = title;
      $('pinHelp').textContent = help;
      $('pinMsg').textContent = '';
      $('pinMath').hidden = true;
      $('pinPad').hidden = false;
      $('pinForgot').hidden = !check;
      renderPinDots();
      pinSheet.showModal();
    });
  }
  function renderPinDots() {
    [...$('pinDots').children].forEach((d, k) => d.classList.toggle('on', k < pinFlow.digits.length));
  }
  async function pinDigit(k) {
    if (!pinFlow) return;
    if (k === 'back') pinFlow.digits = pinFlow.digits.slice(0, -1);
    else if (pinFlow.digits.length < 4) pinFlow.digits += k;
    renderPinDots();
    if (pinFlow.digits.length < 4) return;
    const entered = pinFlow.digits;
    if (pinFlow.check) {
      if (await Kids.checkPin(entered)) return closePin(true);
      pinFlow.digits = '';
      $('pinMsg').textContent = t('That’s not the PIN. Try again.');
      renderPinDots();
      return;
    }
    closePin(entered);
  }
  function closePin(result) {
    const f = pinFlow;
    pinFlow = null;
    pinSheet.close();
    if (f) f.resolve(result);
  }
  $('pinPad').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) pinDigit(b.dataset.k); });
  pinSheet.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinDigit(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); pinDigit('back'); }
  });
  // The close event arrives a moment later, possibly after the pad has
  // reopened for the next step; only a real cancel ends the flow.
  pinSheet.addEventListener('close', () => {
    if (pinFlow && !pinSheet.open) { const f = pinFlow; pinFlow = null; f.resolve(null); }
  });
  // Forgot the PIN: a sum that's easy for grown-ups and hard for little ones.
  let mathAnswer = 0;
  $('pinForgot').addEventListener('click', () => {
    const a = 23 + Math.floor(Math.random() * 60);
    const b = 13 + Math.floor(Math.random() * 30);
    mathAnswer = a * b;
    $('pinMathQ').textContent = t('Grown-ups only: what is {a} × {b}?', { a, b });
    $('pinMathAnswer').value = '';
    $('pinPad').hidden = true;
    $('pinMath').hidden = false;
    $('pinMsg').textContent = '';
    $('pinMathAnswer').focus();
  });
  $('pinMathGo').addEventListener('click', () => {
    if (+$('pinMathAnswer').value === mathAnswer) closePin(true);
    else $('pinMsg').textContent = t('Not quite. Ask a grown-up to help.');
  });

  async function chooseNewPin() {
    const first = await askPin({ title: t('Choose a grown-up PIN'), help: t('Pick 4 numbers that only grown-ups know.'), check: false });
    if (!first) return false;
    const again = await askPin({ title: t('Type the PIN again'), help: t('Just to be sure.'), check: false });
    if (!again) return false;
    if (again !== first) { showStatus(t('The PINs didn’t match. Try again.'), true, 4000); return false; }
    await Kids.setPin(first);
    return true;
  }

  // ---- Switching kids' mode on and off.
  function applyKids() {
    document.body.classList.toggle('kids', Kids.on);
    applyAppearance();
    $('kidsToggle').textContent = t(Kids.on ? 'Turn kids’ mode off' : 'Turn kids’ mode on');
    $('changePin').hidden = !Kids.hasPin();
    $('childName').value = Kids.state.childName;
    $('adultName').value = Kids.state.adultName;
    if (!allowedModes().includes(settings.mode) && book) setMode(Kids.on ? Kids.state.mode || 'page' : 'pacer');
    else if (!allowedModes().includes(settings.mode)) settings.mode = Kids.on ? 'page' : 'pacer';
    renderHome();
  }

  $('kidsToggle').addEventListener('click', async () => {
    if (Kids.on) {
      Kids.on = false;
      settings.mode = settings.adultMode || 'pacer';
      saveSettings();
      dialog.close();
      applyKids();
      return;
    }
    if (!Kids.hasPin() && !(await chooseNewPin())) return;
    settings.adultMode = settings.mode;
    settings.mode = 'page';
    saveSettings();
    Kids.on = true;
    dialog.close();
    applyKids();
    showStatus(t('Kids’ mode is on. Settings now need the grown-up PIN.'), false, 5000);
  });
  $('changePin').addEventListener('click', async () => {
    if (await chooseNewPin()) showStatus(t('The PIN is changed.'), false, 3000);
  });
  for (const id of ['childName', 'adultName']) {
    $(id).addEventListener('input', (e) => { Kids.state[id] = e.target.value.trim(); Kids.save(); });
  }

  // ---------- Storytime ----------

  let storyChunk = null;
  let chunkSpans = [];

  // Softly mark the sentence being read, on top of the current-word highlight.
  function markChunk() {
    chunkSpans.forEach((sp) => sp.classList.remove('speaking'));
    chunkSpans = [];
    if (!storyChunk || settings.mode !== 'story') return;
    const ci = chapterAt(storyChunk[0]);
    if (ci !== pacerChapter) return;
    const base = book.chapters[ci].start;
    for (let i = storyChunk[0]; i <= storyChunk[1]; i++) {
      const sp = pacerSpans[i - base];
      if (sp) { sp.classList.add('speaking'); chunkSpans.push(sp); }
    }
  }

  let storyChapter = -1;

  function tell() {
    storyChapter = chapterAt(pos);
    Storytime.speak({
      words: book.words,
      isBreak,
      from: pos,
      voiceURI: settings.voiceURI,
      lang: book.language,
      rate: settings.storyRate,
      onChunk: (start, end) => {
        const ci = chapterAt(start);
        if (ci !== storyChapter) {
          const finishedChapter = storyChapter;
          storyChapter = ci;
          pos = start;
          if (finishedChapter >= 0 && endOfChapter(finishedChapter, play)) return;
        }
        storyChunk = [start, end];
        pos = start;
        render();
        markChunk();
      },
      onWord: (i) => {
        if (i === pos) return;
        pos = i;
        render();
      },
      onDone: (reachedEnd, error) => {
        if (reachedEnd) {
          pos = book.words.length - 1;
          endOfBook(chapterAt(pos), t('That’s the end of “{title}”. Sweet dreams!', { title: book.title }));
        } else {
          pause();
          showStatus(t('The voice stopped ({error}). Press play to carry on.', { error: error || t('unknown error') }), true, 6000);
        }
      },
    });
  }

  function setStoryRate(v) {
    settings.storyRate = Math.round(Math.max(0.6, Math.min(2, v)) * 10) / 10;
    $('storyRateOut').textContent = `${settings.storyRate.toFixed(1)}×`;
    saveSettings();
    if (playing && settings.mode === 'story') tell();
  }

  // Just the few best voices for the book's language, most natural first.
  function fillVoices() {
    const sel = $('storyVoice');
    const lang = book && book.language;
    sel.replaceChildren();
    if (!Storytime.supported || !Storytime.voices().length) {
      sel.add(new Option(t(Storytime.supported ? 'Default voice' : 'No voices on this browser'), ''));
      sel.disabled = !Storytime.supported;
      return;
    }
    sel.disabled = false;
    const list = Storytime.shortlist(lang);
    const chosen = Storytime.pickVoice(settings.voiceURI, lang);
    if (chosen && !list.includes(chosen)) list.push(chosen);
    for (const v of list) sel.add(new Option(Storytime.describe(v), v.voiceURI));
    if (chosen) sel.value = chosen.voiceURI;
    $('voiceTip').hidden = list.some(Storytime.isNatural);
  }

  // Natural voices are often a free download away in the device's settings.
  function voiceHelp() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return t('On iPhone or iPad: Settings → Accessibility → Spoken Content → Voices → English. Download a voice marked “Enhanced” or “Premium”, such as Ava or Zoe, then pick it here.');
    }
    if (/Android/.test(ua)) {
      return t('On Android: Settings → search “Text-to-speech” → Google Speech Services → Install voice data. Choose your language and download the high-quality voice, then reopen Boekhoek.');
    }
    if (/Macintosh/.test(ua)) {
      return t('On a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices. Download an “Enhanced” or “Premium” voice. Microsoft Edge also has very natural online voices built in.');
    }
    if (/Windows/.test(ua)) {
      return t('On Windows, Microsoft Edge has very natural online voices built in (look for “Natural” in the list). In Chrome, the Google voices are the smoothest.');
    }
    return t('Your device’s settings may offer higher-quality voices to download. Voices marked “Natural” sound the most human.');
  }
  $('voiceHelp').textContent = voiceHelp();

  $('storySlower').addEventListener('click', () => setStoryRate(settings.storyRate - 0.1));
  $('storyFaster').addEventListener('click', () => setStoryRate(settings.storyRate + 0.1));
  $('storyVoice').addEventListener('change', (e) => {
    settings.voiceURI = e.target.value;
    saveSettings();
    if (playing && settings.mode === 'story') tell();
  });
  Storytime.onVoicesChanged(fillVoices);
  fillVoices();
  setStoryRate(settings.storyRate);

  function savePos(force) {
    if (!book) return;
    const now = Date.now();
    if (force || now - lastSaved > 3000) {
      store.set(bookKey, pos);
      Library.setMark(bookKey, markFor(book, book.cum, pos));
      lastSaved = now;
    }
  }

  // ---------- Rendering ----------

  function render() {
    if (!book) return;
    const ci = chapterAt(pos);
    if (settings.mode === 'rsvp') renderRsvp();
    else if (settings.mode === 'page') renderPage(ci);
    else if (settings.mode === 'together') renderTogether(ci);
    else renderPacer(ci);

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
    pacerCurs = [];
    chunkSpans = [];
    markChunk();
    $('pacerStage').scrollTo({ top: 0, behavior: 'instant' });
  }

  // ---------- Page mode: plain reading, the bookmark follows the scroll ----------

  let pageScrollPending = true;
  let pageScrolling = false;

  function renderPage(ci) {
    if (ci !== pacerChapter) buildPacer(ci);
    clearPacerHighlight();
    if (!pageScrollPending) return;
    pageScrollPending = false;
    const span = pacerSpans[pos - book.chapters[ci].start];
    const stage = $('pacerStage');
    pageScrolling = true;
    if (span && pos > book.chapters[ci].start) {
      stage.scrollTo({ top: stage.scrollTop + span.getBoundingClientRect().top - stage.getBoundingClientRect().top - 24, behavior: 'instant' });
    } else {
      stage.scrollTo({ top: 0, behavior: 'instant' });
    }
    requestAnimationFrame(() => { pageScrolling = false; });
  }

  // The first word at the top of the visible page becomes the bookmark.
  function wordAtTopOfPage() {
    const top = $('pacerStage').getBoundingClientRect().top + 8;
    let lo = 0;
    let hi = pacerSpans.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pacerSpans[mid].getBoundingClientRect().bottom < top) lo = mid + 1; else hi = mid;
    }
    return book.chapters[pacerChapter].start + lo;
  }

  let pageScrollTimer = 0;
  $('pacerStage').addEventListener('scroll', () => {
    if (settings.mode !== 'page' || !book || pageScrolling || !pacerSpans.length) return;
    clearTimeout(pageScrollTimer);
    pageScrollTimer = setTimeout(() => {
      pos = wordAtTopOfPage();
      const ci = chapterAt(pos);
      $('progress').value = pos;
      fill($('progress'));
      renderStats(ci);
      // Scrolling is Page mode's only signal, so save as soon as it settles.
      savePos(true);
    }, 120);
  }, { passive: true });

  function turnPage(dir) {
    const stage = $('pacerStage');
    const atEnd = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 4;
    const atStart = stage.scrollTop <= 0;
    const ci = chapterAt(pos);
    // Past the edge of a chapter, carry on into the next or previous one.
    if (dir > 0 && atEnd && ci < book.chapters.length - 1) {
      const next = () => seek(book.chapters[ci + 1].start);
      if (!endOfChapter(ci, next)) next();
      return;
    }
    if (dir > 0 && atEnd && ci === book.chapters.length - 1) {
      endOfBook(ci, t('You finished “{title}”. Well read!', { title: book.title }));
      return;
    }
    if (dir < 0 && atStart && ci > 0) return seek(book.chapters[ci - 1].start);
    stage.scrollBy({ top: dir * stage.clientHeight * 0.85, behavior: 'smooth' });
  }

  function clearPacerHighlight() {
    for (const sp of pacerCurs) sp.classList.remove('cur', 'cur-join');
    pacerCurs = [];
  }

  function renderPacer(ci) {
    if (ci !== pacerChapter) buildPacer(ci);
    clearPacerHighlight();
    const base = book.chapters[ci].start;
    const n = Math.min(stepSize(pos), book.chapters[ci].end - pos);
    for (let k = 0; k < n; k++) {
      const sp = pacerSpans[pos - base + k];
      if (!sp) break;
      sp.classList.add('cur');
      // Every word but the last reaches across the following space, so the
      // group reads as one block.
      if (k < n - 1) sp.classList.add('cur-join');
      pacerCurs.push(sp);
    }
    const span = pacerCurs[0];
    if (!span) return;

    const stage = $('pacerStage');
    const sr = stage.getBoundingClientRect();
    const wr = span.getBoundingClientRect();
    if (wr.top < sr.top + 40 || wr.bottom > sr.bottom - sr.height * 0.35) {
      stage.scrollTop += wr.top - sr.top - sr.height * 0.3;
    }
  }

  function fmtTime(min) {
    if (min < 1) return t('<1 min');
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h ? t('{h}h {m}m', { h, m }) : t('{m} min', { m });
  }

  function renderStats(ci) {
    const ch = book.chapters[ci];
    const total = book.words.length;
    const chLeft = minutesBetween(pos, ch.end);
    const bookLeft = minutesBetween(pos, total);
    const pct = Math.floor((pos / Math.max(1, total - 1)) * 100);
    $('posLabel').textContent = t('Chapter {n} of {total} · {left} left', { n: ci + 1, total: book.chapters.length, left: fmtTime(chLeft) });
    const strong = document.createElement('strong');
    strong.textContent = fmtTime(bookLeft);
    $('timeLabel').replaceChildren(strong, t(' to the end · {pct}%', { pct }));
    $('timeLabel').title = t('At {wpm} wpm you\'ll {when}', { wpm: settings.wpm, when: finishBy(bookLeft) || t('finish in {time}', { time: fmtTime(bookLeft) }) });
  }

  // ---------- Mode & settings ----------

  const BACK_LABELS = { page: ['Previous page', 'Next page'], other: ['Previous sentence (←)', 'Next sentence (→)'] };

  function setNavLabels() {
    const [back, fwd] = BACK_LABELS[settings.mode === 'page' ? 'page' : 'other'];
    for (const [id, key] of [['back', back], ['fwd', fwd]]) {
      const el = $(id);
      el.dataset.i18nTitle = key;
      el.dataset.i18nAria = key.replace(/ \(.\)$/, '');
      el.title = t(key);
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    }
  }

  function setMode(mode) {
    if (playing) pause();
    if (!allowedModes().includes(mode)) mode = allowedModes()[0];
    settings.mode = mode;
    if (Kids.on) { Kids.state.mode = mode; Kids.save(); }
    saveSettings();
    $('turnCard').hidden = mode !== 'together';
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    for (const m of MODES) document.body.classList.toggle(`mode-${m}`, m === mode);
    if (mode === 'story' && !Kids.on && !$('voiceTip').hidden && !settings.voiceTipShown) {
      settings.voiceTipShown = true;
      saveSettings();
      showStatus(t('Tip: for a more natural voice, see Settings → Storytime.'), false, 6000);
    }
    $('rsvpStage').hidden = mode !== 'rsvp';
    $('pacerStage').hidden = mode === 'rsvp';
    setNavLabels();
    storyChunk = null;
    // Each mode draws the chapter differently, so start it afresh.
    pacerChapter = -1;
    pageScrollPending = true;
    render();
  }

  function setWpm(v) {
    settings.wpm = Math.max(100, Math.min(1200, v));
    $('wpm').value = settings.wpm;
    $('wpmOut').textContent = settings.wpm;
    fill($('wpm'));
    saveSettings();
    if (book) renderStats(chapterAt(pos));
    retimeStep();
  }

  function applyAppearance() {
    const theme = Kids.on ? 'kids' : settings.theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty('--scale', (Kids.on ? Math.max(settings.fontSize, 125) : settings.fontSize) / 100);
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
  radios('pacerChunk', settings.pacerChunk, (v) => { settings.pacerChunk = +v; saveSettings(); render(); });
  radios('lang', I18n.lang, (v) => {
    settings.lang = v;
    saveSettings();
    I18n.setLang(v);
    refreshLanguage();
  });

  // Redraw everything whose words are put together in code.
  function refreshLanguage() {
    setPlayIcon();
    setNavLabels();
    applyAppearance();
    $('voiceHelp').textContent = voiceHelp();
    fillVoices();
    renderInstallCard();
    renderDataStatus();
    renderOfflineStatus();
    renderHome();
    if (book) {
      lastChapter = -1;
      render();
    }
  }
  radios('theme', settings.theme, (v) => { settings.theme = v; saveSettings(); applyAppearance(); });

  $('fontSize').value = settings.fontSize;
  $('fontSize').addEventListener('input', (e) => { settings.fontSize = +e.target.value; saveSettings(); applyAppearance(); });

  for (const id of ['pauses', 'ramp', 'bionic', 'keepAwake', 'quizzes']) {
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
  $('openSettings').addEventListener('click', async () => {
    if (Kids.on && !(await askPin({ title: t('Grown-ups only'), help: t('Type the grown-up PIN to open Settings.'), check: true }))) return;
    renderDataStatus();
    renderOfflineStatus();
    applyKids();
    dialog.showModal();
  });

  // ---------- Your data: protection from clean-up, backups ----------

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const fromHomeScreen = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);

  async function renderDataStatus() {
    const st = navigator.storage;
    const persisted = st && st.persisted ? await st.persisted().catch(() => null) : null;
    let used = '';
    if (st && st.estimate) {
      const est = await st.estimate().catch(() => null);
      if (est && est.usage) used = t(' Using {size}.', { size: est.usage < 1e6 ? `${Math.max(1, Math.round(est.usage / 1e3))} KB` : `${(est.usage / 1e6).toFixed(1)} MB` });
    }
    if (persisted) {
      $('dataStatus').textContent = t('✓ Protected: this browser won’t clear Boekhoek’s data by itself.') + used;
    } else if (isIOS && !fromHomeScreen) {
      $('dataStatus').textContent = t('Safari may clear it if you don’t visit for 7 days. Add Boekhoek to your Home Screen to keep it safe, or keep a backup.') + used;
    } else {
      $('dataStatus').textContent = t('Not protected yet: the browser could clear it if your device runs low on space.') + used;
    }
    $('protectData').hidden = !!persisted || !(st && st.persist);
    // On iPhone, Safari and the Home Screen app each keep their own data.
    $('dataWhere').hidden = !isIOS;
    $('dataWhere').textContent = fromHomeScreen
      ? t('You’re using Boekhoek from your Home Screen, which keeps its own data, separate from Safari. Use a backup to move your reading between them.')
      : t('On iPhone, Boekhoek in Safari and Boekhoek on your Home Screen keep separate data. Use a backup to move your reading between them.');
  }

  // ---------- Offline and installing as an app ----------

  async function offlineReady() {
    if (!('serviceWorker' in navigator) || !window.caches) return false;
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    return !!(reg && reg.active) && !!(await caches.match(new URL('./', location.href).href).catch(() => null));
  }

  async function renderOfflineStatus() {
    $('offlineStatus').textContent = (await offlineReady())
      ? t('✓ Works offline: Boekhoek and your books open without internet. Looking up words still needs a connection.')
      : t('Offline use is being set up. Open Boekhoek once with internet and it’ll work offline after that.');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support unavailable', err));
    });
  }
  window.addEventListener('offline', () => showStatus(t('You’re offline. Boekhoek keeps working; looking up words needs internet.'), false, 5000));

  // Chrome, Edge and Android offer an install prompt; iPhone needs Safari's
  // Share menu, so show the steps there instead.
  let installPrompt = null;
  const DISMISS_DAYS = 30;
  const installDismissed = () => Date.now() - (settings.installDismissedAt || 0) < DISMISS_DAYS * 86400000;

  function renderInstallCard() {
    const ios = isIOS && !fromHomeScreen && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    const show = !fromHomeScreen && !installDismissed() && (!!installPrompt || ios);
    $('installCard').hidden = !show;
    $('installBtn').hidden = !installPrompt;
    $('installSteps').hidden = !ios || !!installPrompt;
    $('installText').textContent = ios
      ? t('Add Boekhoek to your Home Screen. It opens full-screen like an app, works without internet, and keeps your reading safe from Safari’s clean-up.')
      : t('Install Boekhoek on this device. It opens in its own window from your home screen or desktop and works without internet.');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    renderInstallCard();
  });
  $('installBtn').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    renderInstallCard();
    if (choice && choice.outcome === 'accepted') showStatus(t('Boekhoek is installed. Find it with your other apps.'), false, 5000);
  });
  $('installDismiss').addEventListener('click', () => {
    settings.installDismissedAt = Date.now();
    saveSettings();
    renderInstallCard();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; renderInstallCard(); });
  renderInstallCard();

  $('protectData').addEventListener('click', async () => {
    const ok = await navigator.storage.persist().catch(() => false);
    showStatus(t(ok ? 'Done. Your reading data is protected.' : 'Your browser didn’t allow it. Keeping a backup is the safest option.'), !ok, 5000);
    renderDataStatus();
  });

  $('backupData').addEventListener('click', async () => {
    Journal.flush(playing);
    savePos(true);
    try {
      const how = await Backup.save();
      if (how !== 'cancelled') showStatus(t('Backup saved. Keep it somewhere safe, like Files or your email.'), false, 5000);
    } catch (err) {
      console.error(err);
      showStatus(t('The backup couldn’t be saved on this browser.'), true, 5000);
    }
  });

  $('restoreFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm(t('Restore this backup? It’s combined with what’s already here, so nothing on this device is lost.'))) return;
    try {
      const r = await Backup.restore(file);
      showStatus(t('Restored {days} of reading and {marks}.', { days: plural(r.days, '{n} day', '{n} days'), marks: plural(r.bookmarks, '{n} bookmark', '{n} bookmarks') }), false, 4000);
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      showStatus(t(err.message || 'That backup couldn’t be read.'), true, 5000);
    }
  });
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
    $('awakeNote').textContent = t('Not supported by this browser. Try an up-to-date Chrome, Edge or Safari.');
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
  $('back').addEventListener('click', () => (settings.mode === 'page' ? turnPage(-1) : settings.mode === 'together' ? nextTurn(-1) : seek(prevSentence())));
  $('fwd').addEventListener('click', () => (settings.mode === 'page' ? turnPage(1) : settings.mode === 'together' ? nextTurn(1) : seek(nextSentence())));
  $('prevChapter').addEventListener('click', () => {
    const ci = chapterAt(pos);
    gotoChapter(pos > book.chapters[ci].start + 20 ? ci : ci - 1);
  });
  $('nextChapter').addEventListener('click', () => gotoChapter(chapterAt(pos) + 1));
  $('chapterSelect').addEventListener('change', (e) => gotoChapter(+e.target.value));
  $('progress').addEventListener('input', (e) => seek(+e.target.value));

  // ---------- Selecting words: look up or share as a quote ----------

  const selHosts = [$('pacerText'), $('rsvpContext')];
  const selBar = $('selBar');
  const MAX_QUOTE_WORDS = 400;
  let selTimer = 0;

  // Tapping a word jumps to it, unless the tap finished a text selection.
  const jumpToWord = (e) => {
    if (!getSelection().isCollapsed) return;
    const s = e.target.closest('[data-i]');
    if (!s) return;
    if (Kids.on && e.currentTarget === $('pacerText')) {
      if (playing) return;
      // Read to me: start from the tapped word too.
      if (settings.mode === 'story') seek(+s.dataset.i, { scroll: false });
      sayWord(+s.dataset.i);
      return;
    }
    seek(+s.dataset.i, { scroll: false });
  };
  $('rsvpContext').addEventListener('click', (e) => { e.stopPropagation(); jumpToWord(e); });
  $('pacerText').addEventListener('click', jumpToWord);

  function currentSelection() {
    const sel = getSelection();
    if (!book || $('reader').hidden || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const host = selHosts.find((h) => h.contains(range.commonAncestorContainer));
    return host ? { range, host } : null;
  }

  // The first and last book word touched by the selection, ignoring a word
  // the selection only grazes at its very edge.
  function selectedWordRange(s) {
    let first = -1;
    let last = -1;
    for (const span of s.host.querySelectorAll('[data-i]')) {
      if (s.range.intersectsNode(span)) {
        if (first < 0) first = +span.dataset.i;
        last = +span.dataset.i;
      } else if (first >= 0) break;
    }
    if (first < 0) return null;
    const { startContainer, startOffset, endContainer, endOffset } = s.range;
    const spanOf = (node) => (node.nodeType === 3 ? node.parentElement : node).closest('[data-i]');
    const startSpan = spanOf(startContainer);
    if (first < last && startSpan && +startSpan.dataset.i === first && startContainer.nodeType === 3
      && startOffset === startContainer.length && startContainer === startSpan.lastChild) first++;
    const endSpan = spanOf(endContainer);
    if (last > first && endSpan && +endSpan.dataset.i === last && endOffset === 0) last--;
    return { first, last };
  }

  function updateSelBar() {
    const s = currentSelection();
    const text = s ? s.range.toString().trim() : '';
    if (!s || !text) { selBar.hidden = true; return; }
    if (playing) pause();
    $('selDefine').hidden = /\s/.test(text);
    selBar.hidden = false;
    // Sit just below the selection (phones show their own menu above it).
    const r = s.range.getBoundingClientRect();
    const bw = selBar.offsetWidth;
    const bh = selBar.offsetHeight;
    let top = r.bottom + 10;
    if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 10);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), window.innerWidth - bw - 8);
    selBar.style.top = `${top}px`;
    selBar.style.left = `${left}px`;
  }

  document.addEventListener('selectionchange', () => {
    clearTimeout(selTimer);
    selTimer = setTimeout(updateSelBar, 120);
  });
  $('pacerStage').addEventListener('scroll', () => { if (!selBar.hidden) updateSelBar(); }, { passive: true });

  $('selDefine').addEventListener('click', () => {
    const s = currentSelection();
    const w = s && selectedWordRange(s);
    if (!w) return;
    selBar.hidden = true;
    lookUp(w.first);
  });
  $('selShare').addEventListener('click', () => {
    const s = currentSelection();
    const w = s && selectedWordRange(s);
    if (w) openShare(w.first, w.last);
  });

  // ---------- Sharing a quote ----------

  const shareSheet = $('shareSheet');
  let shareQuote = '';

  function quoteText(first, last) {
    const end = Math.min(last, first + MAX_QUOTE_WORDS - 1);
    let out = '';
    for (let i = first; i <= end; i++) {
      out += book.words[i];
      if (i < end) out += book.paraEnd[i] ? '\n\n' : ' ';
    }
    return { text: end < last ? `${out}…` : out, cut: end < last };
  }

  function shareMessage() {
    const caption = $('shareCaption').value.trim();
    const source = $('shareSourceToggle').checked ? `\n— ${book.title}${book.author ? `, ${book.author}` : ''}` : '';
    return `${caption ? `${caption}\n\n` : ''}“${shareQuote}”${source}`;
  }

  function renderSharePreview() {
    $('shareSource').hidden = !$('shareSourceToggle').checked;
  }

  function openShare(first, last) {
    selBar.hidden = true;
    const q = quoteText(first, last);
    shareQuote = q.text;
    $('shareQuote').textContent = shareQuote;
    $('shareSource').textContent = `— ${book.title}${book.author ? `, ${book.author}` : ''}`;
    $('shareNote').textContent = q.cut ? t('Long passages are trimmed to the first {n} words.', { n: MAX_QUOTE_WORDS }) : '';
    $('shareCaption').value = '';
    renderSharePreview();
    shareSheet.showModal();
  }

  const finishShare = () => {
    shareSheet.close();
    getSelection().removeAllRanges();
  };

  $('shareSourceToggle').addEventListener('change', renderSharePreview);
  $('shareWhatsApp').addEventListener('click', () => {
    // wa.me opens the WhatsApp app on phones (WhatsApp Web on computers) with
    // the message filled in, ready to pick who to send it to.
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage())}`, '_blank', 'noopener');
    finishShare();
  });
  if (navigator.share) {
    $('shareOther').addEventListener('click', async () => {
      try {
        await navigator.share({ text: shareMessage() });
        finishShare();
      } catch { /* cancelled */ }
    });
  } else {
    $('shareOther').hidden = true;
  }
  $('shareCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareMessage());
      finishShare();
      showStatus(t('Quote copied. Paste it anywhere.'), false, 3000);
    } catch {
      showStatus(t('Couldn’t copy on this browser.'), true, 4000);
    }
  });
  shareSheet.addEventListener('click', (e) => { if (e.target === shareSheet) shareSheet.close(); });

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
    const afrikaans = /^af\b/i.test(book.language || '');
    // Into the word jar straight away; the meaning follows when it arrives.
    rememberWord(i, '');
    $('defMore').href = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}${afrikaans ? '#Afrikaans' : ''}`;
    const body = $('defBody');
    const note = (text) => {
      const p = document.createElement('p');
      p.className = 'def-note';
      p.textContent = text;
      body.replaceChildren(p);
    };
    defPop.hidden = false;
    // The dictionary service only knows English, so Afrikaans books go
    // straight to Wiktionary's Afrikaans entry.
    if (afrikaans) {
      note(t('The dictionary here only knows English words. Look up “{word}” on Wiktionary for its Afrikaans meaning.', { word }));
      return;
    }
    note(t('Looking it up…'));

    let result;
    try {
      result = await Dictionary.define(raw);
      const first = result && result.meanings[0] && result.meanings[0].definitions[0];
      if (first) Kids.addWord({ word, meaning: first.definition });
    } catch {
      if (id !== lookupId) return;
      body.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'def-note';
      p.textContent = navigator.onLine === false
        ? t('You’re offline. Looking up words needs an internet connection.')
        : t('The dictionary couldn’t be reached just now. Please try again in a moment.');
      body.append(p);
      return;
    }
    if (id !== lookupId) return;
    body.replaceChildren();
    if (!result) {
      const p = document.createElement('p');
      p.className = 'def-note';
      p.textContent = t('No definition found for “{word}”. It may be a name, or a word this English dictionary doesn’t know.', { word });
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
    if (!book || $('reader').hidden || e.ctrlKey || e.metaKey || e.altKey || dialog.open || bookSheet.open || shareSheet.open || quizSheet.open || pinSheet.open || wordSheet.open || matchSheet.open) return;
    const tag = e.target.tagName;
    if (tag === 'BUTTON' && e.key === ' ') e.target.blur();
    if ((tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const actions = {
      ' ': () => (settings.mode === 'page' ? turnPage(1) : toggle()),
      ArrowLeft: () => $('back').click(),
      ArrowRight: () => $('fwd').click(),
      ArrowUp: () => setWpm(settings.wpm + 25),
      ArrowDown: () => setWpm(settings.wpm - 25),
      '[': () => $('prevChapter').click(),
      ']': () => $('nextChapter').click(),
      m: () => { const list = allowedModes(); setMode(list[(list.indexOf(settings.mode) + 1) % list.length]); },
      M: () => { const list = allowedModes(); setMode(list[(list.indexOf(settings.mode) + 1) % list.length]); },
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
    // Storytime keeps talking where the browser allows it (e.g. screen off).
    if (document.hidden) { if (settings.mode !== 'story') pause(); }
    // The browser drops the wake lock when the page is hidden; take it again on return.
    else keepAwake();
  });
  window.addEventListener('pagehide', () => { Journal.flush(false); savePos(true); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && playing && settings.mode !== 'story') Journal.start(); });

  setWpm(settings.wpm);
  applyAppearance();
  applyKids();
})();
