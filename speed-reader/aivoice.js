// The natural AI voice for English books (Kokoro). The model is a one-time
// download of about 115 MB that stays in the browser cache, so it works
// offline afterwards. aivoice-worker.js makes the audio in the background;
// this file downloads it, plays sentences back to back and moves the
// highlight along with the speech.
const AIVoice = (() => {
  const KEY = 'sr:aivoice';
  const CACHES = ['transformers-cache', 'kokoro-voices', 'nook-voice-v1'];
  // The best-rated Kokoro voices, two accents, women and men.
  const VOICES = [
    { id: 'af_heart', name: 'Heart', accent: 'American' },
    { id: 'af_bella', name: 'Bella', accent: 'American' },
    { id: 'bf_emma', name: 'Emma', accent: 'British' },
    { id: 'am_michael', name: 'Michael', accent: 'American' },
    { id: 'bm_george', name: 'George', accent: 'British' },
  ];
  const PREFIX = 'kokoro:';
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const supported = typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && 'caches' in window && !!AudioCtx;

  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

  // none → downloading → ready; "loading" while a downloaded model wakes up.
  let state = supported && saved().ready ? 'ready' : 'none';
  let warm = false;
  let pct = 0;
  let lastError = '';
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn({ state, pct, warm, error: lastError }));

  let worker = null;
  const pending = new Map();
  let nextId = 1;
  const files = new Map();

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('aivoice-worker.js', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        files.set(m.file, m);
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        const next = total ? Math.min(99, Math.floor((loaded / total) * 100)) : 0;
        if (next !== pct) { pct = next; emit(); }
      } else if (m.type === 'ready') {
        warm = true;
        pct = 100;
        lastError = '';
        if (state !== 'ready') { state = 'ready'; save({ ready: true }); }
        emit();
      } else if (m.type === 'audio') {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (p) p.resolve({ pcm: m.pcm, rate: m.rate });
      } else if (m.type === 'error') {
        if (m.id != null) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          if (p) p.reject(new Error(m.message));
          return;
        }
        // The model itself failed to load.
        lastError = m.message;
        if (state === 'downloading') state = 'none';
        for (const p of pending.values()) p.reject(new Error(m.message));
        pending.clear();
        emit();
      }
    };
    worker.onerror = (e) => {
      lastError = e.message || 'worker error';
      if (state === 'downloading') state = 'none';
      for (const p of pending.values()) p.reject(new Error(lastError));
      pending.clear();
      worker = null;
      emit();
    };
    return worker;
  }

  function download() {
    if (!supported || state === 'downloading') return;
    if (state !== 'ready') { state = 'downloading'; pct = 0; files.clear(); }
    lastError = '';
    emit();
    ensureWorker().postMessage({ type: 'load' });
  }

  async function remove() {
    stop();
    if (worker) { worker.terminate(); worker = null; }
    pending.clear();
    await Promise.all(CACHES.map((c) => caches.delete(c).catch(() => {})));
    save({});
    state = 'none';
    warm = false;
    pct = 0;
    emit();
  }

  // ---------- Playing ----------

  let ctx = null;
  function audio() {
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  let session = 0;
  let sources = [];
  let timers = [];
  const later = (ms, fn) => { timers.push(setTimeout(fn, Math.max(0, ms))); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function stop() {
    session++;
    for (const s of sources) { try { s.stop(); } catch { /* already stopped */ } }
    sources = [];
    timers.forEach(clearTimeout);
    timers = [];
    if (worker) worker.postMessage({ type: 'cancel', session });
  }

  function synth(text, voice, speed, id) {
    return new Promise((resolve, reject) => {
      const reqId = nextId++;
      pending.set(reqId, { resolve, reject });
      ensureWorker().postMessage({ type: 'speak', id: reqId, session: id, text, voice, speed });
    });
  }

  // Where the speech starts and ends inside the clip, skipping the quiet edges.
  function speechSpan(pcm) {
    const loud = 0.02;
    let a = 0;
    let b = pcm.length - 1;
    while (a < b && Math.abs(pcm[a]) < loud) a++;
    while (b > a && Math.abs(pcm[b]) < loud) b--;
    return [a, b + 1];
  }

  // Each word gets a share of the speaking time by its length, plus a little
  // for the pause after punctuation.
  function wordTimes(words, start, end, from, to) {
    const weights = [];
    for (let i = start; i <= end; i++) {
      const w = words[i];
      let x = w.length + 2;
      if (/[.!?…]["'”’)]*$/.test(w)) x += 6;
      else if (/[,;:—–]["'”’)]*$/.test(w)) x += 3;
      weights.push(x);
    }
    const total = weights.reduce((s, x) => s + x, 0) || 1;
    const times = [];
    let acc = 0;
    for (const x of weights) { times.push(from + ((to - from) * acc) / total); acc += x; }
    return times;
  }

  const voiceId = (uri) => (uri || '').slice(PREFIX.length) || VOICES[0].id;

  // Same callbacks as Storytime.speak: onChunk(start, end) as each sentence
  // starts, onWord(i) as each word is reached, onDone(reachedEnd, error).
  async function speak({ words, isBreak, from, voiceURI, rate, onChunk, onWord, onDone, intro, chunkEnd }) {
    stop();
    const id = session;
    const c = audio();
    const voice = voiceId(voiceURI);
    let playHead = c.currentTime + 0.05;
    let nextStart = from;
    const queue = [];

    const fill = () => {
      while (id === session && queue.length < 2 && nextStart < words.length) {
        const start = nextStart;
        const end = chunkEnd(words, isBreak, start);
        nextStart = end + 1;
        let text = '';
        for (let i = start; i <= end; i++) text += `${words[i]} `;
        queue.push(synth(text.trim(), voice, rate, id).then((a) => ({ start, end, a })));
      }
    };

    // Put a clip on the timeline right after the previous one.
    const schedule = ({ pcm, rate: hz }, gap) => {
      const buf = c.createBuffer(1, pcm.length, hz);
      buf.copyToChannel(pcm, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      const at = Math.max(playHead, c.currentTime + 0.05);
      src.start(at);
      sources.push(src);
      src.onended = () => { sources = sources.filter((s) => s !== src); };
      playHead = at + buf.duration + gap;
      return { at, buf };
    };

    if (intro) queue.push(synth(intro, voice, rate, id).then((a) => ({ intro: true, a })));
    fill();
    while (queue.length) {
      let r;
      try {
        r = await queue.shift();
      } catch (err) {
        if (id === session) onDone(false, err.message);
        return;
      }
      if (id !== session) return;
      fill();
      if (r.intro) { schedule(r.a, 0.35); continue; }
      const { start, end, a } = r;
      // A longer breath at the end of a paragraph.
      const { at, buf } = schedule(a, isBreak(end) && /[.!?…"”’)]$/.test(words[end]) ? 0.12 : 0.04);
      const [s0, s1] = speechSpan(a.pcm);
      const startsIn = (at - c.currentTime) * 1000;
      const times = wordTimes(words, start, end, s0 / buf.sampleRate, s1 / buf.sampleRate);
      later(startsIn, () => { if (id === session) { onChunk(start, end); onWord(start); } });
      times.forEach((tm, k) => { if (k) later(startsIn + tm * 1000, () => { if (id === session) onWord(start + k); }); });
      if (end >= words.length - 1) {
        later((playHead - c.currentTime) * 1000, () => { if (id === session) onDone(true); });
        return;
      }
      // Don't run far ahead of what's being heard.
      while (id === session && playHead - c.currentTime > 12) await sleep(400);
      if (id !== session) return;
    }
  }

  // Say a word or short phrase, e.g. when a child taps a word.
  async function say(text, { voiceURI, rate = 0.9, onEnd } = {}) {
    stop();
    const id = session;
    const c = audio();
    try {
      const { pcm, rate: hz } = await synth(text, voiceId(voiceURI), rate, id);
      if (id !== session) return;
      const buf = c.createBuffer(1, pcm.length, hz);
      buf.copyToChannel(pcm, 0);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.onended = () => { if (id === session && onEnd) onEnd(); };
      sources.push(src);
      src.start();
    } catch {
      if (id === session && onEnd) onEnd();
    }
  }

  return {
    supported,
    PREFIX,
    VOICES,
    isAI: (uri) => typeof uri === 'string' && uri.startsWith(PREFIX),
    uriOf: (v) => PREFIX + v.id,
    ready: () => state === 'ready',
    state: () => ({ state, pct, warm, error: lastError }),
    onChange: (fn) => { listeners.add(fn); },
    download,
    remove,
    speak,
    say,
    stop,
  };
})();
