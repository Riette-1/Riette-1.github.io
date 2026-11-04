// Boekhoek's AI voice, running in the background so reading stays smooth.
// It loads the Kokoro text-to-speech model (downloaded once, then kept in the
// browser cache) and turns sentences into audio for aivoice.js to play.
import { KokoroTTS } from './vendor/kokoro/kokoro.web.js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICES = ['af_heart', 'af_bella', 'bf_emma', 'am_michael', 'bm_george'];
// kokoro-js looks voices up in this cache under their Hugging Face address,
// so fill it from the copies that ship with Boekhoek.
const VOICE_URL = (v) => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${v}.bin`;

async function seedVoices() {
  const cache = await caches.open('kokoro-voices');
  await Promise.all(VOICES.map(async (v) => {
    if (await cache.match(VOICE_URL(v))) return;
    const res = await fetch(new URL(`./vendor/kokoro/voices/${v}.bin`, import.meta.url));
    if (res.ok) await cache.put(VOICE_URL(v), res);
  }));
}

let loading = null;
function load() {
  if (!loading) {
    loading = seedVoices()
      .then(() => KokoroTTS.from_pretrained(MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
        },
      }))
      .then((tts) => { postMessage({ type: 'ready' }); return tts; });
    loading.catch(() => { loading = null; });
  }
  return loading;
}

// One sentence at a time, in order. Requests from a reading session that has
// since been stopped are skipped.
let skipBefore = 0;
let queue = Promise.resolve();

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'cancel') { skipBefore = m.session; return; }
  if (m.type === 'load') {
    load().catch((err) => postMessage({ type: 'error', message: String((err && err.message) || err) }));
    return;
  }
  if (m.type !== 'speak') return;
  queue = queue.then(async () => {
    if (m.session < skipBefore) return;
    try {
      const tts = await load();
      if (m.session < skipBefore) return;
      const out = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const pcm = out.audio;
      postMessage({ type: 'audio', id: m.id, pcm, rate: out.sampling_rate }, [pcm.buffer]);
    } catch (err) {
      postMessage({ type: 'error', id: m.id, message: String((err && err.message) || err) });
    }
  });
};
