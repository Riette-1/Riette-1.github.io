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
    {
      wpm: 300, chunk: 1, pauses: true, ramp: true, bionic: false, fontSize: 100, theme: 'auto', mode: 'pacer', keepAwake: true,
      estPace: 'setting', estCustom: 400, dailyMinutes: 20, storyRate: 1, voiceURI: '', pacerChunk: 1,
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
  const MODES = ['pacer', 'rsvp', 'page', 'story'];
  if (!MODES.includes(settings.mode)) settings.mode = 'pacer';

  let book = null;
  let bookKey = '';
  let pos = 0;
  let playing = false;
  let timer = 0;
  let rampStep = 0;
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
      item.append(open);
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
      Library.setMark(cur.key, { ...cur.mark, pos: 0, wLeft: cur.mark.wTotal, finished: false });
      if (book && bookKey === cur.key) pos = 0;
    }
    openFromShelf(cur.key);
  });

  $('shelfGrid').addEventListener('click', (e) => {
    const open = e.target.closest('.sb-open');
    if (open) openBookSheet(open.dataset.key);
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
    const list = [{ id: 'setting', label: 'Speed setting', wpm: settings.wpm, real: false }];
    if (p.average) list.push({ id: 'average', label: 'Your average', wpm: p.average, real: true });
    if (p.best) list.push({ id: 'best', label: 'Your best', wpm: p.best.wpm, real: true });
    list.push({ id: 'custom', label: 'Custom', wpm: settings.estCustom, real: false });
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
      val.textContent = c.id === 'custom' ? 'pick a speed' : `${c.wpm} wpm`;
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
    $('bsCustomOut').textContent = `${settings.estCustom} wpm`;
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
    $('bsLeft').textContent = p.finished ? 'Done' : fmtTime(left);
    $('bsLeftLabel').textContent = p.finished ? 'you finished it' : p.started ? `left to read · ${100 - p.pct}% of the book` : 'left to read';

    const daily = settings.dailyMinutes;
    if (p.finished) {
      $('bsPlan').textContent = `You’ve read this one. Reading it again would take about ${fmtTime(whole)}.`;
    } else if (left <= daily) {
      $('bsPlan').textContent = `That’s a single sitting: about ${fmtTime(left)} at ${choice.wpm} wpm.`;
    } else {
      const days = Math.ceil(left / daily);
      const end = new Date();
      end.setDate(end.getDate() + days - 1);
      const when = end.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
      const span = days < 14 ? `${days} days` : days < 60 ? `about ${Math.round(days / 7)} weeks` : `about ${Math.round(days / 30)} months`;
      $('bsPlan').textContent = `At ${daily} minutes a day you’ll finish in ${span}, around ${when}.`;
    }
    $('bsNote').textContent = choice.real
      ? 'Based on your real pace from the reading journal, which already includes pauses.'
      : settings.pauses
        ? 'Includes the smart pauses at punctuation, paragraphs and long words.'
        : 'Smart pauses are off, so this is words divided by speed.';
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
    $('bsOpenLabel').textContent = p.finished ? 'Read it again' : p.started ? 'Open to my bookmark' : 'Start reading';
    renderPaceChoices();
    for (const r of document.querySelectorAll('input[name="dailyMinutes"]')) r.checked = +r.value === settings.dailyMinutes;
    $('bsFacts').textContent = b.mark && b.mark.chapters ? '' : 'Counting the words…';
    renderEstimate();
    bookSheet.showModal();

    try {
      await ensureStats(b);
    } catch (err) {
      console.warn('Could not read book for estimates', err);
      if (sheetBook === b) $('bsFacts').textContent = 'This book couldn’t be read to count its words.';
      return;
    }
    if (sheetBook !== b) return;
    const m = b.mark;
    $('bsFacts').textContent = `${m.total.toLocaleString()} words · ${m.chapters} ${m.chapters === 1 ? 'chapter' : 'chapters'}`;
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
    if (!b || !confirm(`Take “${b.title}” off your shelf? The book is removed from this device. Its bookmark and your reading journal are kept.`)) return;
    bookSheet.close();
    await Library.remove(b.key);
    renderHome();
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
    if (!book || playing || settings.mode === 'page') return;
    if (settings.mode === 'story' && !Storytime.supported) {
      showStatus('This browser can’t read aloud. Try an up-to-date Chrome, Edge or Safari.', true, 6000);
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
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
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

  function tell() {
    Storytime.speak({
      words: book.words,
      isBreak,
      from: pos,
      voiceURI: settings.voiceURI,
      lang: book.language,
      rate: settings.storyRate,
      onChunk: (start, end) => {
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
          pause();
          showStatus(`That’s the end of “${book.title}”. Sweet dreams!`, false, 6000);
        } else {
          pause();
          showStatus(`The voice stopped (${error || 'unknown error'}). Press play to carry on.`, true, 6000);
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
      sel.add(new Option(Storytime.supported ? 'Default voice' : 'No voices on this browser', ''));
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
      return 'On iPhone or iPad: Settings → Accessibility → Spoken Content → Voices → English. Download a voice marked “Enhanced” or “Premium”, such as Ava or Zoe, then pick it here.';
    }
    if (/Android/.test(ua)) {
      return 'On Android: Settings → search “Text-to-speech” → Google Speech Services → Install voice data. Choose your language and download the high-quality voice, then reopen Nook.';
    }
    if (/Macintosh/.test(ua)) {
      return 'On a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices. Download an “Enhanced” or “Premium” voice. Microsoft Edge also has very natural online voices built in.';
    }
    if (/Windows/.test(ua)) {
      return 'On Windows, Microsoft Edge has very natural online voices built in (look for “Natural” in the list). In Chrome, the Google voices are the smoothest.';
    }
    return 'Your device’s settings may offer higher-quality voices to download. Voices marked “Natural” sound the most human.';
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
    if (dir > 0 && atEnd && ci < book.chapters.length - 1) return seek(book.chapters[ci + 1].start);
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

  const BACK_LABELS = { page: ['Previous page', 'Next page'], other: ['Previous sentence (←)', 'Next sentence (→)'] };

  function setMode(mode) {
    if (playing) pause();
    settings.mode = mode;
    saveSettings();
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.mode === mode)));
    for (const m of MODES) document.body.classList.toggle(`mode-${m}`, m === mode);
    if (mode === 'story' && !$('voiceTip').hidden && !settings.voiceTipShown) {
      settings.voiceTipShown = true;
      saveSettings();
      showStatus('Tip: for a more natural voice, see Settings → Storytime.', false, 6000);
    }
    $('rsvpStage').hidden = mode !== 'rsvp';
    $('pacerStage').hidden = mode === 'rsvp';
    const [back, fwd] = BACK_LABELS[mode === 'page' ? 'page' : 'other'];
    $('back').title = back; $('back').setAttribute('aria-label', back);
    $('fwd').title = fwd; $('fwd').setAttribute('aria-label', fwd);
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
  radios('pacerChunk', settings.pacerChunk, (v) => { settings.pacerChunk = +v; saveSettings(); render(); });
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
  $('back').addEventListener('click', () => (settings.mode === 'page' ? turnPage(-1) : seek(prevSentence())));
  $('fwd').addEventListener('click', () => (settings.mode === 'page' ? turnPage(1) : seek(nextSentence())));
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
    if (s) seek(+s.dataset.i, { scroll: false });
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
    $('shareNote').textContent = q.cut ? `Long passages are trimmed to the first ${MAX_QUOTE_WORDS} words.` : '';
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
      showStatus('Quote copied. Paste it anywhere.', false, 3000);
    } catch {
      showStatus('Couldn’t copy on this browser.', true, 4000);
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
    if (!book || $('reader').hidden || e.ctrlKey || e.metaKey || e.altKey || dialog.open || bookSheet.open || shareSheet.open) return;
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
      m: () => setMode(MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length]),
      M: () => setMode(MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length]),
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
  window.addEventListener('pagehide', () => { Journal.flush(playing); savePos(true); });

  setWpm(settings.wpm);
  applyAppearance();
  renderHome();
})();
