// Storytime: reads the book aloud with the device's own speech voices
// (the Web Speech API), one sentence at a time. Short utterances avoid
// browsers cutting off long speech, and let the reader follow along.
const Storytime = (() => {
  const synth = window.speechSynthesis;
  const supported = !!synth && 'SpeechSynthesisUtterance' in window;
  const MAX_CHUNK_WORDS = 40;
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

  // The saved voice if it's still installed, otherwise one for the
  // reader's language, preferring the system default.
  function pickVoice(uri) {
    const lang = (navigator.language || 'en').slice(0, 2);
    return voices.find((v) => v.voiceURI === uri)
      || voices.find((v) => v.default && v.lang.startsWith(lang))
      || voices.find((v) => v.lang.startsWith(lang))
      || voices.find((v) => v.lang.startsWith('en'))
      || voices[0]
      || null;
  }

  function stop() {
    session++;
    if (supported) synth.cancel();
  }

  // Speak words from `from` onwards. onChunk(start, end) fires as each
  // sentence starts; onWord(i) as each word is reached (where the voice
  // reports word boundaries); onDone(reachedEnd, error) when it stops by itself.
  function speak({ words, isBreak, from, voiceURI, rate, onChunk, onWord, onDone }) {
    stop();
    const id = ++session;
    const next = (start) => {
      if (id !== session) return;
      if (start >= words.length) { onDone(true); return; }
      let end = start;
      while (end < words.length - 1 && end - start < MAX_CHUNK_WORDS && !isBreak(end)) end++;
      const offsets = [];
      let text = '';
      for (let i = start; i <= end; i++) {
        offsets.push(text.length);
        text += `${words[i]} `;
      }
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(voiceURI);
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
      u.onend = () => next(end + 1);
      u.onerror = (e) => {
        if (id !== session || e.error === 'interrupted' || e.error === 'canceled') return;
        onDone(false, e.error);
      };
      synth.speak(u);
    };
    next(from);
  }

  return {
    supported,
    voices: () => (voices.length ? voices : loadVoices()),
    onVoicesChanged: (fn) => { onVoices = fn; },
    pickVoice,
    speak,
    stop,
  };
})();
