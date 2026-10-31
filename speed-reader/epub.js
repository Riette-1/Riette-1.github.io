// Minimal, dependency-free EPUB reader: unzips with the browser's
// DecompressionStream and flattens the spine into a list of words.
const EPUB = (() => {
  const utf8 = new TextDecoder();

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function readZip(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);

    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This file is not a valid EPUB (zip archive not found).');

    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    const lower = new Map();

    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt EPUB: bad zip directory.');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = utf8.decode(u8.subarray(p + 46, p + 46 + nlen));
      entries.set(name, { method, csize, off });
      lower.set(name.toLowerCase(), name);
      p += 46 + nlen + elen + clen;
    }

    const find = (name) => entries.get(name) || entries.get(lower.get(name.toLowerCase()));

    return {
      has: (name) => !!find(name),
      async bytes(name) {
        const e = find(name);
        if (!e) throw new Error(`Missing file in EPUB: ${name}`);
        const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
        const data = u8.subarray(start, start + e.csize);
        if (e.method === 0) return data;
        if (e.method === 8) return inflateRaw(data);
        throw new Error(`Unsupported compression in EPUB (method ${e.method}).`);
      },
      async text(name) {
        return utf8.decode(await this.bytes(name));
      },
    };
  }

  function parseXml(text, html) {
    const parser = new DOMParser();
    if (!html) {
      const doc = parser.parseFromString(text, 'application/xml');
      if (!doc.getElementsByTagName('parsererror').length) return doc;
    }
    return parser.parseFromString(text, 'text/html');
  }

  // Namespace-agnostic tag lookup that also survives the text/html fallback
  // (which lowercases names like navPoint).
  function byTag(root, name) {
    let list = root.getElementsByTagNameNS('*', name);
    if (!list.length && name !== name.toLowerCase()) list = root.getElementsByTagNameNS('*', name.toLowerCase());
    return Array.from(list);
  }

  function dirOf(path) {
    const i = path.lastIndexOf('/');
    return i < 0 ? '' : path.slice(0, i + 1);
  }

  function resolve(base, href) {
    let clean = href.split('#')[0];
    try { clean = decodeURIComponent(clean); } catch { /* keep as is */ }
    const out = [];
    for (const part of (base + clean).split('/')) {
      if (part === '..') out.pop();
      else if (part && part !== '.') out.push(part);
    }
    return out.join('/');
  }

  const BLOCKS = new Set([
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article',
    'br', 'tr', 'dd', 'dt', 'figcaption', 'pre', 'aside', 'header', 'footer', 'hr', 'table', 'ul', 'ol',
  ]);
  const SKIP = new Set(['script', 'style', 'noscript', 'head', 'svg', 'math']);

  // Paragraph texts in reading order, with { img, alt } entries where the
  // chapter has a picture (an <img>, or an <image> inside an <svg>).
  function extractParagraphs(body) {
    const paras = [];
    let buf = '';
    const flush = () => {
      const t = buf.replace(/\s+/g, ' ').trim();
      if (t) paras.push(t);
      buf = '';
    };
    const walk = (node) => {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) {
          buf += n.nodeValue;
        } else if (n.nodeType === 1) {
          const tag = n.localName.toLowerCase();
          if (tag === 'img') {
            flush();
            const src = n.getAttribute('src');
            if (src) paras.push({ img: src, alt: n.getAttribute('alt') || '' });
            continue;
          }
          if (tag === 'svg') {
            for (const im of byTag(n, 'image')) {
              const src = im.getAttribute('xlink:href') || im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
              if (src) { flush(); paras.push({ img: src, alt: '' }); }
            }
            continue;
          }
          if (SKIP.has(tag)) continue;
          const block = BLOCKS.has(tag);
          if (block) flush();
          walk(n);
          if (block) flush();
        }
      }
    };
    walk(body);
    flush();
    return paras;
  }

  async function readToc(zip, manifest, opf, opfDir) {
    const titles = new Map();
    const add = (href, base, label) => {
      const key = resolve(base, href);
      label = (label || '').replace(/\s+/g, ' ').trim();
      if (label && !titles.has(key)) titles.set(key, label);
    };

    const navItem = [...manifest.values()].find((m) => /\bnav\b/.test(m.properties));
    if (navItem && zip.has(navItem.path)) {
      try {
        const doc = parseXml(await zip.text(navItem.path));
        const navs = byTag(doc, 'nav');
        const toc = navs.find((n) => /toc/.test(n.getAttribute('epub:type') || n.getAttribute('type') || '')) || navs[0];
        if (toc) for (const a of byTag(toc, 'a')) add(a.getAttribute('href') || '', dirOf(navItem.path), a.textContent);
      } catch { /* fall through to NCX */ }
    }

    if (!titles.size) {
      const spine = byTag(opf, 'spine')[0];
      const ncxItem = manifest.get(spine && spine.getAttribute('toc'))
        || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
      if (ncxItem && zip.has(ncxItem.path)) {
        try {
          const doc = parseXml(await zip.text(ncxItem.path));
          for (const np of byTag(doc, 'navPoint')) {
            const label = byTag(np, 'text')[0];
            const content = byTag(np, 'content')[0];
            if (label && content) add(content.getAttribute('src') || '', dirOf(ncxItem.path), label.textContent);
          }
        } catch { /* no titles */ }
      }
    }
    return titles;
  }

  // EPUB 3 marks the cover with properties="cover-image"; EPUB 2 uses
  // <meta name="cover" content="item-id">. Fall back to an image named "cover".
  async function readCover(zip, manifest, opf) {
    const items = [...manifest.values()];
    const isImage = (m) => m && /^image\//.test(m.type) && zip.has(m.path);
    let item = items.find((m) => /\bcover-image\b/.test(m.properties));
    if (!isImage(item)) {
      const meta = byTag(opf, 'meta').find((m) => m.getAttribute('name') === 'cover');
      item = meta && manifest.get(meta.getAttribute('content'));
    }
    if (!isImage(item)) item = items.find((m) => isImage(m) && /cover/i.test(m.path));
    if (!isImage(item)) return null;
    try {
      return new Blob([await zip.bytes(item.path)], { type: item.type });
    } catch {
      return null;
    }
  }

  const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  const MIN_PICTURE_BYTES = 1500;

  // The book's illustrations, keyed by the word they come before. Tiny files
  // (dividers, bullets) are left out.
  async function loadPictures(zip, pics) {
    const byWord = new Map();
    const urls = new Map();
    for (const p of pics) {
      if (!zip.has(p.path)) continue;
      let url = urls.get(p.path);
      if (url === undefined) {
        url = null;
        try {
          const bytes = await zip.bytes(p.path);
          const type = IMAGE_TYPES[(p.path.split('.').pop() || '').toLowerCase()];
          if (type && bytes.length >= MIN_PICTURE_BYTES) url = URL.createObjectURL(new Blob([bytes], { type }));
        } catch { /* skip unreadable pictures */ }
        urls.set(p.path, url);
      }
      if (!url) continue;
      if (!byWord.has(p.at)) byWord.set(p.at, []);
      byWord.get(p.at).push({ url, alt: p.alt });
    }
    return byWord;
  }

  async function load(file, onProgress = () => {}) {
    const zip = readZip(await file.arrayBuffer());

    const container = parseXml(await zip.text('META-INF/container.xml'));
    const rootfile = byTag(container, 'rootfile')[0];
    const opfPath = rootfile && rootfile.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB is missing its package (OPF) file.');
    const opfDir = dirOf(opfPath);
    const opf = parseXml(await zip.text(opfPath));

    const meta = byTag(opf, 'metadata')[0] || opf;
    const title = (byTag(meta, 'title')[0]?.textContent || file.name.replace(/\.epub$/i, '')).trim();
    const author = (byTag(meta, 'creator')[0]?.textContent || '').trim();
    const language = (byTag(meta, 'language')[0]?.textContent || '').trim();

    const manifest = new Map();
    for (const item of byTag(opf, 'item')) {
      manifest.set(item.getAttribute('id'), {
        path: resolve(opfDir, item.getAttribute('href') || ''),
        type: item.getAttribute('media-type') || '',
        properties: item.getAttribute('properties') || '',
      });
    }

    const spine = byTag(opf, 'itemref')
      .filter((r) => r.getAttribute('linear') !== 'no')
      .map((r) => manifest.get(r.getAttribute('idref')))
      .filter((m) => m && /html|xml/.test(m.type) && zip.has(m.path));
    if (!spine.length) throw new Error('No readable chapters found in this EPUB.');

    const tocTitles = await readToc(zip, manifest, opf, opfDir);
    const cover = await readCover(zip, manifest, opf);

    const words = [];
    const paraEnd = [];
    const pics = [];
    let pendingPics = [];
    const chapters = [];

    for (let i = 0; i < spine.length; i++) {
      onProgress((i + 1) / spine.length);
      const item = spine[i];
      let doc;
      try {
        doc = parseXml(await zip.text(item.path), !/xml/.test(item.type));
      } catch {
        continue;
      }
      const body = doc.body || byTag(doc, 'body')[0];
      if (!body) continue;

      const start = words.length;
      for (const para of extractParagraphs(body)) {
        if (typeof para !== 'string') {
          pendingPics.push({ path: resolve(dirOf(item.path), para.img), alt: para.alt });
          continue;
        }
        const parts = para.split(' ').filter(Boolean);
        // Pictures sit just before the words that follow them.
        if (parts.length && pendingPics.length) { pics.push(...pendingPics.map((p) => ({ ...p, at: words.length }))); pendingPics = []; }
        for (const w of parts) { words.push(w); paraEnd.push(0); }
        if (parts.length) paraEnd[paraEnd.length - 1] = 1;
      }
      if (words.length === start) continue;

      const heading = byTag(body, 'h1')[0] || byTag(body, 'h2')[0] || byTag(body, 'h3')[0];
      const chTitle = tocTitles.get(item.path)
        || (heading && heading.textContent.replace(/\s+/g, ' ').trim())
        || (typeof I18n !== 'undefined' ? I18n.t('Section {n}', { n: chapters.length + 1 }) : `Section ${chapters.length + 1}`);
      chapters.push({ title: chTitle.slice(0, 120), start, end: words.length });
    }

    if (!words.length) throw new Error('This EPUB contains no readable text.');
    if (pendingPics.length) pics.push(...pendingPics.map((p) => ({ ...p, at: words.length - 1 })));
    const pictures = await loadPictures(zip, pics);
    return { title, author, language, cover, words, paraEnd: Uint8Array.from(paraEnd), chapters, pictures };
  }

  return { load };
})();
