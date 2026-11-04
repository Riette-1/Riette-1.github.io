# kokoro-js 1.2.1 (vendored)

`kokoro.web.js` is the browser build of [kokoro-js](https://www.npmjs.com/package/kokoro-js) 1.2.1
(Apache-2.0, see `LICENSE`), which runs the Kokoro-82M text-to-speech model in the browser with
Transformers.js. `voices/` holds the five voices Boekhoek offers, from the same package.

The model itself (`onnx-community/Kokoro-82M-v1.0-ONNX`, q8, about 92 MB) is downloaded from
Hugging Face on the reader’s device when they choose to, together with the 22 MB speech engine
(onnxruntime, from jsDelivr), and kept in the browser cache.
