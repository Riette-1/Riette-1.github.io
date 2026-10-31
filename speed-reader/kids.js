// Kids' mode (Kinderhoekie): a parent PIN, reading time, stickers, a reading
// buddy that grows, the reading map and the word jar. Everything stays on
// this device in localStorage.
const Kids = (() => {
  const KEY = 'sr:kids';
  const WORDS_KEY = 'sr:words';
  const tr = (k, v) => I18n.t(k, v);

  const defaults = {
    on: false,
    pinHash: '',
    childName: '',
    adultName: '',
    buddyName: '',
    mode: 'page',
    creature: '',
    theme: 'sunshine',
    days: {},
    stickers: {},
    chapters: 0,
    books: {},
    togetherTurns: 0,
  };

  const load = () => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...defaults }; }
  };
  let state = load();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  };

  const dayKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---- Parent PIN. Hashed so it isn't sitting in storage as plain digits;
  // it keeps small hands out, it isn't meant as strong security.
  async function hash(pin) {
    const data = new TextEncoder().encode(`boekhoek:${pin}`);
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0;
    for (const b of data) h = (h * 31 + b) >>> 0;
    return `x${h}`;
  }
  const checkPin = async (pin) => !!state.pinHash && (await hash(pin)) === state.pinHash;
  async function setPin(pin) { state.pinHash = await hash(pin); save(); }

  // ---- Reading time (all kids' modes count: reading yourself, being read
  // to, and reading together).
  function addTime(ms) {
    const k = dayKey();
    state.days[k] = (state.days[k] || 0) + ms;
    save();
  }
  const minutesToday = () => (state.days[dayKey()] || 0) / 60000;
  const totalMinutes = () => Object.values(state.days).reduce((s, v) => s + v, 0) / 60000;
  function streak() {
    const d = new Date();
    const read = (x) => (state.days[dayKey(x)] || 0) >= 60000;
    if (!read(d)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (read(d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // ---- The reading buddy grows with minutes read. Children pick the
  // creature; each grows through six stages. Pegasus's wings are drawn
  // (there's no reliable winged-horse emoji), shown with `wings: true`.
  const GROW_AT = [0, 10, 30, 90, 240, 600];
  const CREATURES = {
    dragon: { name: 'Dragon', pet: 'Vlammie', stages: [
      { face: '🥚', label: 'a dragon egg' }, { face: '🦎', label: 'a tiny dragon' }, { face: '🐲', label: 'a little dragon' },
      { face: '🐉', label: 'a big dragon' }, { face: '🐉', extra: '🔥', label: 'a fire dragon' }, { face: '🐉', extra: '👑', label: 'the dragon king' }] },
    unicorn: { name: 'Unicorn', pet: 'Sterretjie', stages: [
      { face: '✨', label: 'a sparkle' }, { face: '🐴', label: 'a little foal' }, { face: '🦄', label: 'a unicorn' },
      { face: '🦄', extra: '🌈', label: 'a rainbow unicorn' }, { face: '🦄', extra: '⭐', label: 'a star unicorn' }, { face: '🦄', extra: '👑', label: 'the royal unicorn' }] },
    pegasus: { name: 'Pegasus', pet: 'Wolkie', stages: [
      { face: '☁️', label: 'a little cloud' }, { face: '🐴', label: 'a little foal' }, { face: '🐴', wings: true, label: 'a baby pegasus' },
      { face: '🐎', wings: true, label: 'a flying pegasus' }, { face: '🐎', wings: true, extra: '🌈', label: 'a rainbow pegasus' }, { face: '🐎', wings: true, extra: '👑', label: 'the royal pegasus' }] },
    dinosaur: { name: 'Dinosaur', pet: 'Dino', stages: [
      { face: '🥚', label: 'a dino egg' }, { face: '🦎', label: 'a baby dino' }, { face: '🦕', label: 'a long-neck dino' },
      { face: '🦖', label: 'a T-rex' }, { face: '🦖', extra: '🕶️', label: 'a cool T-rex' }, { face: '🦖', extra: '👑', label: 'the dino king' }] },
    owl: { name: 'Owl', pet: 'Uiltjie', stages: [
      { face: '🥚', label: 'an egg' }, { face: '🐣', label: 'just hatched' }, { face: '🐥', label: 'a little chick' },
      { face: '🦉', label: 'a young owl' }, { face: '🦉', extra: '🎓', label: 'a wise owl' }, { face: '🦉', extra: '👑', label: 'the owl king' }] },
  };
  // Older kids' mode data grew an owl before creatures could be chosen.
  const creatureId = () => state.creature || (totalMinutes() > 0 ? 'owl' : '');

  function buddy(id = creatureId()) {
    const c = CREATURES[id] || CREATURES.owl;
    const m = totalMinutes();
    let i = 0;
    while (i < GROW_AT.length - 1 && m >= GROW_AT[i + 1]) i++;
    const next = GROW_AT[i + 1];
    return {
      ...c.stages[i],
      creature: id,
      chosen: !!state.creature || id === 'owl',
      stage: i,
      last: i === GROW_AT.length - 1,
      toNext: next != null ? Math.max(1, Math.ceil(next - m)) : 0,
      progress: next != null ? (m - GROW_AT[i]) / (next - GROW_AT[i]) : 1,
      name: state.buddyName || tr(c.pet),
    };
  }

  function chooseCreature(id, name) {
    if (!CREATURES[id]) return;
    state.creature = id;
    state.buddyName = (name || '').trim();
    save();
  }

  // ---- Kids' themes, picked by the child.
  const THEMES = [
    { id: 'sunshine', name: 'Sunshine', emoji: '☀️' },
    { id: 'ocean', name: 'Ocean', emoji: '🐠' },
    { id: 'jungle', name: 'Jungle', emoji: '🌴' },
    { id: 'space', name: 'Space', emoji: '🚀' },
    { id: 'candy', name: 'Candy', emoji: '🍭' },
  ];
  function setTheme(id) {
    if (!THEMES.some((th) => th.id === id)) return;
    state.theme = id;
    save();
  }

  // ---- Picture bubbles: story words that have a picture, in English and
  // Afrikaans. Plurals and simple endings are folded onto the base word.
  const PICTURES = {
    '🐶': 'dog dogs puppy puppies hond honde hondjie hondjies', '🐱': 'cat cats kitten kittens kat katte katjie katjies',
    '🐭': 'mouse mice muis muise', '🐰': 'rabbit rabbits bunny bunnies haas hase hasie hasies konyn',
    '🦊': 'fox foxes jakkals', '🐻': 'bear bears teddy beer bere', '🐼': 'panda pandas', '🦁': 'lion lions leeu leeus',
    '🐯': 'tiger tigers tier tiere', '🐘': 'elephant elephants olifant olifante', '🦒': 'giraffe giraffes kameelperd',
    '🦓': 'zebra zebras sebra', '🐵': 'monkey monkeys aap ape', '🐴': 'horse horses perd perde', '🐮': 'cow cows koei koeie',
    '🐷': 'pig pigs vark varke', '🐑': 'sheep lamb skaap skape lam', '🐔': 'chicken chickens hen hoender hoenders',
    '🦆': 'duck ducks eend eende', '🦉': 'owl owls uil uile', '🐦': 'bird birds voël voëls', '🐸': 'frog frogs padda paddas',
    '🐢': 'turtle tortoise skilpad', '🐍': 'snake snakes slang slange', '🐟': 'fish vis visse', '🐋': 'whale whales walvis',
    '🐬': 'dolphin dolphins dolfyn', '🦈': 'shark shark haai haaie', '🐙': 'octopus seekat', '🦀': 'crab krap',
    '🐝': 'bee bees by bye', '🦋': 'butterfly butterflies skoenlapper', '🐌': 'snail slak', '🐞': 'ladybird ladybug liewenheersbesie',
    '🕷️': 'spider spiders spinnekop', '🐉': 'dragon dragons draak drake', '🦄': 'unicorn unicorns eenhoring',
    '🦖': 'dinosaur dinosaurs dino dinosourus', '👑': 'king queen prince princess crown koning koningin prins prinses kroon',
    '🧙': 'wizard witch towenaar heks', '🧚': 'fairy fairies fee feetjie', '👻': 'ghost ghosts spook', '🤖': 'robot robots',
    '👽': 'alien aliens ruimtewese', '🧜': 'mermaid meermin', '🏴‍☠️': 'pirate pirates seerower seerowers', '🦸': 'hero superhero held',
    '👶': 'baby babies baba', '👵': 'grandmother granny grandma ouma', '👴': 'grandfather grandpa oupa',
    '🏰': 'castle palace kasteel paleis', '🏠': 'house home huis huise', '🏫': 'school skool', '⛪': 'church kerk',
    '🌳': 'tree trees forest wood boom bome bos woud', '🌸': 'flower flowers blom blomme', '🌻': 'sunflower sonneblom',
    '🍄': 'mushroom sampioen', '⛰️': 'mountain mountains berg berge', '🌋': 'volcano vulkaan', '🏖️': 'beach strand',
    '🌊': 'sea ocean wave waves see oseaan golf golwe', '🏝️': 'island eiland', '🏞️': 'river rivier', '🏜️': 'desert woestyn',
    '🌙': 'moon night maan nag', '⭐': 'star stars ster sterre', '☀️': 'sun sunny son sonnig', '🌈': 'rainbow reënboog',
    '☁️': 'cloud clouds wolk wolke', '🌧️': 'rain rainy reën', '❄️': 'snow snowflake sneeu', '⛈️': 'storm thunder lightning storm donderweer weerlig',
    '🔥': 'fire flame flames vuur vlam vlamme', '💧': 'water', '🚀': 'rocket rockets vuurpyl', '🛸': 'spaceship ruimteskip',
    '🚗': 'car cars motor kar', '🚌': 'bus', '🚂': 'train trein', '✈️': 'plane aeroplane airplane vliegtuig',
    '⛵': 'boat ship sail boot skip', '🚲': 'bicycle bike fiets', '🎈': 'balloon balloons ballon ballonne',
    '🎂': 'cake birthday koek verjaarsdag', '🍎': 'apple apples appel appels', '🍌': 'banana piesang', '🍪': 'cookie cookies koekie koekies',
    '🍞': 'bread brood', '🍯': 'honey heuning', '🥕': 'carrot carrots wortel', '🍦': 'ice-cream roomys', '🍕': 'pizza',
    '🎁': 'present gift presents geskenk', '💎': 'treasure jewel gem skat juweel', '🗝️': 'key keys sleutel',
    '🗺️': 'map kaart', '📚': 'book books boek boeke', '✏️': 'pencil potlood', '⚽': 'ball soccer football bal sokker',
    '🎵': 'song music sing lied musiek', '💤': 'sleep asleep slaap', '😢': 'cried cry crying sad huil hartseer',
    '😂': 'laughed laugh laughing lag', '❤️': 'love heart liefde hart', '🛏️': 'bed', '🚪': 'door deur',
  };
  const PICTURE_OF = new Map();
  for (const [emoji, list] of Object.entries(PICTURES)) for (const w of list.split(' ')) PICTURE_OF.set(w, emoji);
  function pictureFor(word) {
    const w = word.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}-]+$/gu, '').replace(/['’]s$/, '');
    if (!w || w.length < 3) return '';
    return PICTURE_OF.get(w) || PICTURE_OF.get(w.replace(/(es|s)$/, '')) || PICTURE_OF.get(w.replace(/(tjies|tjie|jies|jie|e)$/, '')) || '';
  }

  // ---- Stickers. Each has a test against the reading so far.
  const STICKERS = [
    { id: 'first-chapter', emoji: '🌱', name: 'First chapter', how: 'Finish your first chapter', test: (s) => s.chapters >= 1 },
    { id: 'minutes15', emoji: '⏰', name: 'Busy reader', how: 'Read for 15 minutes in one day', test: () => minutesToday() >= 15 },
    { id: 'streak3', emoji: '🔥', name: 'On a roll', how: 'Read 3 days in a row', test: () => streak() >= 3 },
    { id: 'chapters10', emoji: '🚀', name: 'Rocket reader', how: 'Finish 10 chapters', test: (s) => s.chapters >= 10 },
    { id: 'first-book', emoji: '📚', name: 'Bookworm', how: 'Finish a whole book', test: (s) => Object.keys(s.books).length >= 1 },
    { id: 'night-owl', emoji: '🌙', name: 'Night owl', how: 'Read at bedtime, after 7 in the evening', test: (s, e) => e === 'time' && new Date().getHours() >= 19 },
    { id: 'quiz-star', emoji: '⭐', name: 'Star brain', how: 'Get every quiz question right first time', test: (s, e, x) => e === 'quiz' && x && x.perfect },
    { id: 'words5', emoji: '🫙', name: 'Word collector', how: 'Put 5 words in your word jar', test: () => words().length >= 5 },
    { id: 'together', emoji: '🤝', name: 'Reading team', how: 'Read together with a grown-up', test: (s) => s.togetherTurns >= 4 },
    { id: 'lekker-leser', emoji: '🦁', name: 'Lekker leser', how: 'Finish a chapter in an Afrikaans book', test: (s, e, x) => e === 'chapter' && x && x.afrikaans },
    { id: 'streak7', emoji: '🌈', name: 'Rainbow week', how: 'Read 7 days in a row', test: () => streak() >= 7 },
    { id: 'three-books', emoji: '🏆', name: 'Book collector', how: 'Finish 3 books', test: (s) => Object.keys(s.books).length >= 3 },
    { id: 'word-match', emoji: '🎯', name: 'Word wizard', how: 'Win a game of word match', test: (s, e) => e === 'game' },
    { id: 'owl-king', emoji: '👑', name: 'Royal buddy', how: 'Grow your buddy all the way', test: () => buddy().last },
  ];

  // Award any stickers newly earned by this event; returns them.
  function check(event, extra) {
    const earned = [];
    for (const s of STICKERS) {
      if (state.stickers[s.id]) continue;
      if (s.test(state, event, extra)) {
        state.stickers[s.id] = Date.now();
        earned.push(s);
      }
    }
    if (earned.length) save();
    return earned;
  }

  function chapterDone(afrikaans) {
    state.chapters++;
    save();
    return check('chapter', { afrikaans });
  }
  function bookDone(key) {
    state.books[key] = Date.now();
    save();
    return check('book');
  }
  function togetherTurn() {
    state.togetherTurns++;
    save();
    return check('together');
  }

  // ---- The reading map: each book is a walk to somewhere.
  const PLACES = [
    { emoji: '🏰', name: 'the castle' },
    { emoji: '🏝️', name: 'the treasure island' },
    { emoji: '🎡', name: 'the fair' },
    { emoji: '⛰️', name: 'the mountain top' },
    { emoji: '🌳', name: 'the giant tree' },
    { emoji: '🚀', name: 'the rocket' },
  ];
  function placeFor(key) {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return PLACES[h % PLACES.length];
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };

  // A winding path with a stop for each chapter and the walker at `pct`.
  function renderMap(host, key, pct, chapterStops, walker) {
    const place = placeFor(key);
    host.replaceChildren();
    const svg = el('svg', { viewBox: '0 0 320 120', class: 'map-svg', role: 'img', 'aria-label': tr('{pct}% of the way to {place}', { pct, place: tr(place.name) }) });
    const d = 'M 18 96 C 70 96, 70 40, 120 46 S 170 100, 214 78 S 262 22, 300 30';
    const path = el('path', { d, class: 'map-path' });
    const walked = el('path', { d, class: 'map-walked' });
    svg.append(path, walked);
    host.append(svg);
    const len = path.getTotalLength();
    walked.setAttribute('stroke-dasharray', `${(len * pct) / 100} ${len}`);
    for (const stop of chapterStops) {
      const pt = path.getPointAtLength(len * stop);
      svg.append(el('circle', { cx: pt.x, cy: pt.y, r: 4, class: stop * 100 <= pct ? 'map-stop done' : 'map-stop' }));
    }
    const end = path.getPointAtLength(len);
    svg.append(el('text', { x: end.x, y: end.y + 4, class: 'map-place', 'text-anchor': 'middle' }, place.emoji));
    const at = path.getPointAtLength((len * Math.min(100, pct)) / 100);
    svg.append(el('text', { x: at.x, y: at.y - 6, class: 'map-walker', 'text-anchor': 'middle' }, walker));
    return place;
  }

  // ---- The word jar: words looked up while reading, with what they mean
  // (when the dictionary knew) and the sentence they came from.
  function words() {
    try { return JSON.parse(localStorage.getItem(WORDS_KEY) || '[]'); } catch { return []; }
  }
  function saveWords(list) {
    try { localStorage.setItem(WORDS_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  }
  function addWord(entry) {
    const list = words();
    const i = list.findIndex((w) => w.word.toLowerCase() === entry.word.toLowerCase());
    if (i >= 0) {
      list[i] = { ...list[i], ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v)) };
      saveWords(list);
      return { added: false, earned: [] };
    }
    list.unshift({ ...entry, at: Date.now() });
    saveWords(list.slice(0, 300));
    return { added: true, earned: check('word') };
  }
  function removeWord(word) {
    saveWords(words().filter((w) => w.word !== word));
  }

  // ---- Confetti, unless the reader prefers less motion.
  function confetti(burst = 36) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    const bits = ['🎉', '⭐', '✨', '🎈', '💛', '💜'];
    for (let i = 0; i < burst; i++) {
      const s = document.createElement('span');
      s.textContent = bits[i % bits.length];
      s.style.left = `${Math.random() * 100}%`;
      s.style.animationDelay = `${Math.random() * 0.3}s`;
      s.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
      s.style.setProperty('--spin', `${(Math.random() - 0.5) * 720}deg`);
      layer.append(s);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 2200);
  }

  return {
    get state() { return state; },
    save,
    get on() { return state.on; },
    set on(v) { state.on = !!v; save(); },
    reload() { state = load(); },
    checkPin,
    setPin,
    hasPin: () => !!state.pinHash,
    addTime,
    minutesToday,
    totalMinutes,
    streak,
    buddy,
    CREATURES,
    chooseCreature,
    THEMES,
    setTheme,
    pictureFor,
    STICKERS,
    check,
    chapterDone,
    bookDone,
    togetherTurn,
    renderMap,
    placeFor,
    words,
    addWord,
    removeWord,
    confetti,
  };
})();
