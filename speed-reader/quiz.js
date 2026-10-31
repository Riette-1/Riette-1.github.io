// Chapter quizzes, built from the chapter's own text so they work offline
// and in any language: "fill in the missing word" questions (a name, number
// or meaningful word blanked out of a sentence, with look-alike options from
// the same chapter) and a "what came first?" question.
const Quiz = (() => {
  const MIN_CHAPTER_WORDS = 150;
  const MAX_SNIPPET = 110;

  // Very common English and Afrikaans words make poor blanks.
  const COMMON = new Set(`the a an and or but if then of to in on at by for with from as is was were be been being are am
    this that these those there their them they he she it its his her him you your we our us i me my not no yes all any
    some what which who whom when where why how would could should will shall can may might must have has had do does did
    into onto over under about after before again very just only also than too so such more most other out up down off
    die n en of maar as dan van na in op by vir met uit is was word het nie ek jy hy sy ons hulle julle dit hierdie daardie
    wat wie waar wanneer hoe hoekom sal kan moet wil mag sou al ook nog net baie meer toe nou daar hier vir oor onder bo
    se my jou sy haar hul ons om te teen deur sonder tussen saam weer reeds`.split(/\s+/));

  // Months and weekdays get other months and weekdays as wrong answers.
  const TIME_LISTS = [
    'January February March April May June July August September October November December',
    'Januarie Februarie Maart April Mei Junie Julie Augustus September Oktober November Desember',
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday',
    'Maandag Dinsdag Woensdag Donderdag Vrydag Saterdag Sondag',
  ].map((l) => l.split(' '));
  const timeList = (w) => TIME_LISTS.find((l) => l.some((x) => x.toLowerCase() === w.toLowerCase()));

  const core = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // What kind of word this is, so wrong answers can look like the right one.
  function kind(word, sentenceStart) {
    if (/^\p{N}+$/u.test(word)) return 'number';
    if (timeList(word)) return 'time';
    if (!sentenceStart && /^\p{Lu}\p{Ll}+$/u.test(word)) return 'name';
    if (word.length >= 6 && !COMMON.has(word.toLowerCase())) return 'word';
    return null;
  }

  // Sentences of the chapter as [start, end] word ranges.
  function sentences(book, ch, isBreak) {
    const out = [];
    let start = ch.start;
    for (let i = ch.start; i < ch.end; i++) {
      if (isBreak(i) || i === ch.end - 1) {
        const len = i - start + 1;
        if (len >= 7 && len <= 40) out.push([start, i]);
        start = i + 1;
      }
    }
    return out;
  }

  function snippet(book, [s, e]) {
    const text = book.words.slice(s, e + 1).join(' ');
    return text.length > MAX_SNIPPET ? `${text.slice(0, MAX_SNIPPET).replace(/\s+\S*$/, '')}…` : text;
  }

  function clozeQuestions(book, ch, sents, want) {
    // Every candidate blank in the chapter, grouped by kind for distractors.
    const pool = { number: new Set(), name: new Set(), word: new Set(), time: new Set() };
    const candidates = [];
    for (const [s, e] of sents) {
      for (let i = s; i <= e; i++) {
        const w = core(book.words[i]);
        const k = kind(w, i === s);
        if (!k) continue;
        pool[k].add(w);
        candidates.push({ s, e, i, w, k });
      }
    }
    // Names and numbers make the clearest questions, so try those first.
    const rank = { name: 0, time: 1, number: 1, word: 2 };
    const ordered = shuffle(candidates).sort((a, b) => rank[a.k] - rank[b.k]);
    const used = new Set();
    const usedSentences = new Set();
    const out = [];
    for (const c of ordered) {
      if (out.length >= want) break;
      if (used.has(c.w.toLowerCase()) || usedSentences.has(c.s)) continue;
      let options = c.k === 'time' ? timeList(c.w) : [...pool[c.k]];
      options = options.filter((x) => x.toLowerCase() !== c.w.toLowerCase());
      if (c.k === 'word') {
        // Look-alikes: similar length reads as a fair choice.
        options.sort((a, b) => Math.abs(a.length - c.w.length) - Math.abs(b.length - c.w.length));
        options = options.slice(0, 8);
      }
      if (options.length < 3) continue;
      const wrong = shuffle(options).slice(0, 3);
      const raw = book.words[c.i];
      const blanked = book.words.slice(c.s, c.e + 1).map((w, k) => (c.s + k === c.i ? raw.replace(c.w, '_____') : w)).join(' ');
      used.add(c.w.toLowerCase());
      usedSentences.add(c.s);
      out.push({ type: 'cloze', text: blanked, choices: shuffle([c.w, ...wrong]), answer: c.w });
    }
    return out;
  }

  function orderQuestion(book, sents) {
    if (sents.length < 4) return null;
    const a = Math.floor(Math.random() * Math.floor(sents.length / 3));
    const b = sents.length - 1 - Math.floor(Math.random() * Math.floor(sents.length / 3));
    if (b - a < 2) return null;
    const first = snippet(book, sents[a]);
    const later = snippet(book, sents[b]);
    if (first === later) return null;
    return { type: 'order', choices: shuffle([first, later]), answer: first };
  }

  // Up to three questions for chapter ci, or null if it's too short to quiz.
  function make(book, ci, isBreak) {
    const ch = book.chapters[ci];
    if (!ch || ch.end - ch.start < MIN_CHAPTER_WORDS) return null;
    const sents = sentences(book, ch, isBreak);
    const order = orderQuestion(book, sents);
    const questions = clozeQuestions(book, ch, sents, order ? 2 : 3);
    if (order) questions.push(order);
    return questions.length >= 2 ? questions : null;
  }

  return { make };
})();
