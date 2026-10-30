// Word lookups via the Free Dictionary API (https://dictionaryapi.dev),
// trying a few simpler forms when the exact word isn't listed.
const Dictionary = (() => {
  const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
  const cache = new Map();

  function clean(raw) {
    return raw
      .toLowerCase()
      .replace(/[’']s$/u, '')
      .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  }

  function candidates(word) {
    const forms = [word];
    if (word.endsWith('ies')) forms.push(`${word.slice(0, -3)}y`);
    if (word.endsWith('es')) forms.push(word.slice(0, -2));
    if (word.endsWith('s')) forms.push(word.slice(0, -1));
    if (word.endsWith('ied')) forms.push(`${word.slice(0, -3)}y`);
    if (word.endsWith('ed')) forms.push(word.slice(0, -2), word.slice(0, -1));
    if (word.endsWith('ing')) forms.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
    if (word.endsWith('ly')) forms.push(word.slice(0, -2));
    return [...new Set(forms)].filter((w) => w.length > 1);
  }

  // Resolves to { word, phonetic, meanings: [{ partOfSpeech, definitions: [{ definition, example }] }] }
  // or null when nothing is found. Rejects on network errors.
  async function define(raw) {
    const word = clean(raw);
    if (!word) return null;
    if (cache.has(word)) return cache.get(word);
    for (const form of candidates(word)) {
      const res = await fetch(API + encodeURIComponent(form));
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`Dictionary error ${res.status}`);
      const entries = await res.json();
      const result = {
        word: entries[0].word || form,
        phonetic: (entries.find((e) => e.phonetic) || {}).phonetic
          || ((entries.flatMap((e) => e.phonetics || []).find((p) => p.text)) || {}).text || '',
        meanings: entries.flatMap((e) => e.meanings || []).slice(0, 3).map((m) => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions || []).slice(0, 2),
        })),
      };
      cache.set(word, result);
      return result;
    }
    cache.set(word, null);
    return null;
  }

  return { clean, define };
})();
