// Storytime: reads the book aloud with the device's own speech voices
// (the Web Speech API), a sentence at a time. Short utterances avoid
// browsers cutting off long speech, and let the reader follow along.
const Storytime = (() => {
  const synth = window.speechSynthesis;
  const supported = !!synth && 'SpeechSynthesisUtterance' in window;
  const MAX_CHUNK_WORDS = 45;
  const SHORTLIST = 5;
  let voices = [];
  let session = 0;
  let onVoices = null;

  function loadVoices() {
    voices = supported ? synth.getVoices() : [];
    return voices;
  }
  if (supported) {
    loadVoices();
    synth.addEventListener('voiceschanged', () => { loadVoices(); if (onVoices) onVoices(); });
  }

  // macOS/iOS novelty voices and old formant voices that sound robotic.
  const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|espeak)\b/i;

  // Higher is more natural. Modern neural and "premium" voices sound far
  // more human than the compact voices many devices use by default.
  function quality(v) {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural/.test(n)) s += 50;
    if (/premium/.test(n)) s += 45;
    if (/siri/.test(n)) s += 40;
    if (/enhanced/.test(n)) s += 35;
    if (/google/.test(n)) s += 25;
    if (/online/.test(n)) s += 10;
    if (/compact/.test(n)) s -= 20;
    if (NOVELTY.test(n)) s -= 100;
    if (v.default) s += 3;
    return s;
  }
  const isNatural = (v) => quality(v) >= 25;

  const REGIONS = {
    US: 'American', GB: 'British', AU: 'Australian', IE: 'Irish', ZA: 'South African', IN: 'Indian',
    NZ: 'New Zealand', CA: 'Canadian', SC: 'Scottish',
  };

  // "Microsoft Aria Online (Natural) - English (United States)" -> "Aria".
  function shortName(v) {
    return v.name
      .replace(/^(Microsoft|Google|Apple)\s+/i, '')
      .replace(/\s*[-–]\s*[^-–]*\(.*\)\s*$/, '')
      .replace(/\s*\((natural|enhanced|premium|compact)\)/gi, '')
      .replace(/\s+online\b/i, '')
      .trim() || v.name;
  }

  function describe(v) {
    const region = (v.lang.split(/[-_]/)[1] || '').toUpperCase();
    let name = shortName(v);
    // Android names voices after their language, e.g. "English (United States)".
    if (/^[a-z]+\s*\(?[a-z ]*\)?$/i.test(name) && /\(|^english|^afrikaans/i.test(name)) name = typeof I18n !== 'undefined' ? I18n.t('Voice') : 'Voice';
    const parts = [name];
    const saysRegion = /\b(US|UK|GB)\b/.test(name) || (REGIONS[region] && name.toLowerCase().includes(REGIONS[region].toLowerCase()));
    const tr = (k) => (typeof I18n !== 'undefined' ? I18n.t(k) : k);
    if (REGIONS[region] && !saysRegion) parts.push(tr(REGIONS[region]));
    if (isNatural(v)) parts.push(tr('Natural'));
    return parts.join(' · ');
  }

  const langOf = (lang) => (lang || navigator.language || 'en').slice(0, 2).toLowerCase();

  // The best few voices for a language, most natural first. Falls back to
  // English when the device has nothing for the book's language.
  function shortlist(lang) {
    const want = langOf(lang);
    let pool = voices.filter((v) => v.lang.toLowerCase().startsWith(want) && quality(v) > -50);
    if (!pool.length) pool = voices.filter((v) => v.lang.toLowerCase().startsWith('en') && quality(v) > -50);
    if (!pool.length) pool = voices.slice();
    // Among equally good voices, the reader's own accent comes first.
    const local = (navigator.language || '').toLowerCase().replace('_', '-');
    const score = (v) => quality(v) + (v.lang.toLowerCase().replace('_', '-') === local ? 4 : 0);
    const seen = new Set();
    return pool
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
      .filter((v) => { const k = describe(v); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, SHORTLIST);
  }

  // The saved voice if it's still installed and speaks the book's language,
  // otherwise the most natural one that does.
  function pickVoice(uri, lang) {
    const want = langOf(lang);
    const saved = voices.find((v) => v.voiceURI === uri);
    const hasLang = voices.some((v) => langOf(v.lang) === want);
    if (saved && (langOf(saved.lang) === want || !hasLang)) return saved;
    return shortlist(lang)[0] || null;
  }

  // Read dashes as pauses and drop symbols voices would spell out.
  const speakable = (w) => w.replace(/[—–]/g, ', ').replace(/[*_#~^|<>\\]|\[\d+\]/g, '');

  function stop() {
    session++;
    if (supported) synth.cancel();
  }

  // End of the chunk starting at `start`: the end of the sentence, or for a
  // very long sentence the last comma or semicolon before the limit.
  function chunkEnd(words, isBreak, start) {
    let end = start;
    while (end < words.length - 1 && !isBreak(end) && end - start < MAX_CHUNK_WORDS) end++;
    if (end - start >= MAX_CHUNK_WORDS && !isBreak(end)) {
      for (let k = end; k > start + 8; k--) if (/[,;:]["'”’)]*$/.test(words[k])) return k;
    }
    return end;
  }

  // Speak words from `from` onwards. onChunk(start, end) fires as each
  // sentence starts; onWord(i) as each word is reached (where the voice
  // reports word boundaries); onDone(reachedEnd, error) when it stops by itself.
  function speak({ words, isBreak, from, voiceURI, lang, rate, onChunk, onWord, onDone }) {
    stop();
    const id = ++session;
    const voice = pickVoice(voiceURI, lang);
    let nextStart = from;
    let queued = 0;

    // Keep the next sentence queued behind the current one, so there's no
    // gap while the voice gets ready.
    const fillQueue = () => {
      while (id === session && queued < 2 && nextStart < words.length) {
        const start = nextStart;
        const end = chunkEnd(words, isBreak, start);
        nextStart = end + 1;
        queued++;
        const offsets = [];
        let text = '';
        for (let i = start; i <= end; i++) {
          offsets.push(text.length);
          text += `${speakable(words[i])} `;
        }
        const u = new SpeechSynthesisUtterance(text);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        u.rate = rate;
        u.onstart = () => {
          if (id !== session) return;
          onChunk(start, end);
          onWord(start);
        };
        u.onboundary = (e) => {
          if (id !== session || (e.name && e.name !== 'word')) return;
          let k = offsets.length - 1;
          while (k > 0 && offsets[k] > e.charIndex) k--;
          onWord(start + k);
        };
        u.onend = () => {
          if (id !== session) return;
          queued--;
          if (end >= words.length - 1) onDone(true);
          else fillQueue();
        };
        u.onerror = (e) => {
          if (id !== session || e.error === 'interrupted' || e.error === 'canceled') return;
          onDone(false, e.error);
        };
        synth.speak(u);
      }
    };
    fillQueue();
  }

  // Say a single word or short phrase, e.g. when a child taps a word.
  function say(text, { voiceURI, lang, rate = 0.9 } = {}) {
    if (!supported) return false;
    stop();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const voice = pickVoice(voiceURI, lang);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = rate;
    synth.speak(u);
    return true;
  }

  return {
    supported,
    say,
    voices: () => (voices.length ? voices : loadVoices()),
    onVoicesChanged: (fn) => { onVoices = fn; },
    shortlist,
    describe,
    isNatural,
    pickVoice,
    speak,
    stop,
  };
})();
