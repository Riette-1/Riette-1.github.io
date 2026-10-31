// Reading buddies, drawn as SVG so they look the same on every phone (emoji
// differ wildly between devices). One cartoon style for all five creatures:
// a dark outline, a big head, a round body and a light belly. They grow in
// six stages: egg, hatching, little, grown, grown with something special,
// and royal (with a crown).
const Buddies = (() => {
  const INK = '#3b2a4a';
  const line = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;

  const PALETTES = {
    dragon: { body: '#5fd08a', dark: '#2f9e5e', belly: '#fff1c4', egg: '#d9f7e2', spots: '#5fd08a', extra: '#ffb347' },
    unicorn: { body: '#ffffff', dark: '#d8c4f6', belly: '#fff0f7', egg: '#fdf4ff', spots: '#f9a8d4', horn: '#ffcf4d' },
    pegasus: { body: '#f2f6ff', dark: '#b4c8f0', belly: '#ffffff', egg: '#dbeeff', spots: '#ffffff' },
    dinosaur: { body: '#ff9f5a', dark: '#e2703b', belly: '#ffe7bf', egg: '#fff3dc', spots: '#ff9f5a', plates: '#3cc2ae' },
    owl: { body: '#b47d48', dark: '#8a5a2c', belly: '#f8ddb2', egg: '#f3e6d3', spots: '#b47d48' },
  };
  const RAINBOW = ['#ff7a9c', '#ffb347', '#ffe066', '#7ee0a8', '#79c4ff', '#b79bff'];

  // ---- Shared parts --------------------------------------------------------

  const eyes = (y = 50, dx = 10) => [-dx, dx].map((o) => `
    <ellipse cx="${60 + o}" cy="${y}" rx="4.6" ry="5.6" fill="${INK}"/>
    <circle cx="${61.6 + o}" cy="${y - 2.2}" r="1.7" fill="#ffffff"/>`).join('');
  const cheeks = (y = 60) => `<ellipse cx="42" cy="${y}" rx="5.2" ry="3.2" fill="#ff8fab" opacity=".55"/><ellipse cx="78" cy="${y}" rx="5.2" ry="3.2" fill="#ff8fab" opacity=".55"/>`;
  const smile = (y = 61) => `<path d="M55 ${y} Q60 ${y + 5} 65 ${y}" fill="none" ${line}/>`;
  const body = (p) => `<ellipse cx="60" cy="85" rx="27" ry="23" fill="${p.body}" ${line}/>`;
  const belly = (p) => `<ellipse cx="60" cy="90" rx="16" ry="14" fill="${p.belly}"/>`;
  const head = (p) => `<circle cx="60" cy="50" r="26" fill="${p.body}" ${line}/>`;
  const feet = (fill) => `<ellipse cx="47" cy="107" rx="9.5" ry="5.5" fill="${fill}" ${line}/><ellipse cx="73" cy="107" rx="9.5" ry="5.5" fill="${fill}" ${line}/>`;
  const arms = (fill) => `<ellipse cx="35" cy="86" rx="6" ry="9" transform="rotate(20 35 86)" fill="${fill}" ${line}/><ellipse cx="85" cy="86" rx="6" ry="9" transform="rotate(-20 85 86)" fill="${fill}" ${line}/>`;
  const star = (x, y, r, fill = '#ffe066') => `<path d="M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r}Z" fill="${fill}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  const crown = (y = 24) => `<g>
    <path d="M44 ${y + 6} L42 ${y - 10} L51 ${y - 2} L60 ${y - 14} L69 ${y - 2} L78 ${y - 10} L76 ${y + 6} Z" fill="#ffd23f" ${line}/>
    <circle cx="60" cy="${y - 1}" r="2.6" fill="#ff5c8a"/><circle cx="49" cy="${y + 1}" r="2" fill="#5cc8ff"/><circle cx="71" cy="${y + 1}" r="2" fill="#5cc8ff"/></g>`;

  // ---- Creatures (grown form; smaller stages are scaled) -------------------

  function dragon(p, stage) {
    const wing = (side) => {
      const s = side === 'l' ? 1 : -1;
      const x = (v) => 60 - s * (60 - v);
      return `<path d="M${x(40)} 76 C${x(22)} 58 ${x(10)} 52 ${x(6)} 60 C${x(14)} 62 ${x(14)} 70 ${x(9)} 74 C${x(17)} 74 ${x(20)} 80 ${x(16)} 86 C${x(24)} 84 ${x(30)} 86 ${x(38)} 90 Z" fill="${p.dark}" ${line}/>`;
    };
    // A little puff of fire with three flickering tongues.
    const fire = stage >= 4 ? `<g><path d="M83 62 C88 58 94 58 98 60 C100 52 106 48 112 50 C108 54 110 58 114 60 C108 60 108 64 114 68 C108 70 104 68 102 66 C100 72 94 74 88 70 C86 68 84 66 83 62 Z" fill="#ff8a3d" ${line}/>
      <path d="M88 63 C92 61 96 61 99 63 C101 58 104 56 108 56 C105 59 106 62 109 63 C105 64 104 66 100 66 C96 68 92 67 88 63 Z" fill="#ffd23f"/></g>` : '';
    return `
      <path d="M80 96 C96 100 104 92 108 84 L114 86 L110 76 L102 80 C100 88 94 92 82 90 Z" fill="${p.body}" ${line}/>
      ${wing('l')}${wing('r')}
      ${body(p)}${belly(p)}
      <path d="M50 77 h20 M48 84 h24 M50 91 h20" stroke="#f3dd99" stroke-width="2.4" stroke-linecap="round"/>
      ${feet(p.body)}${arms(p.body)}
      <path d="M44 32 L38 14 L50 27 Z" fill="#fff1c4" ${line}/><path d="M76 32 L82 14 L70 27 Z" fill="#fff1c4" ${line}/>
      ${head(p)}
      <path d="M54 25 L57 19 L60 25 L63 19 L66 25" fill="${p.dark}" ${line}/>
      ${eyes()}${cheeks()}${smile()}
      <circle cx="56" cy="56" r="1.2" fill="${INK}"/><circle cx="64" cy="56" r="1.2" fill="${INK}"/>
      ${fire}`;
  }

  function unicorn(p, stage) {
    const rainbow = stage >= 4 ? `<g opacity=".95">${RAINBOW.map((c, i) => `<path d="M${8 + i * 4} 70 A${52 - i * 4} ${52 - i * 4} 0 0 1 ${112 - i * 4} 70" fill="none" stroke="${c}" stroke-width="4.2"/>`).join('')}</g>` : '';
    const mane = [['#ff7a9c', 40, 30, 9], ['#ffb347', 34, 42, 8], ['#ffe066', 33, 55, 7.5], ['#7ee0a8', 36, 67, 7], ['#79c4ff', 52, 25, 8], ['#b79bff', 64, 24, 7]]
      .map(([c, x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${line}/>`).join('');
    return `
      ${rainbow}
      <path d="M82 92 C96 92 102 82 98 72 C106 76 110 90 100 100 C94 106 84 104 80 98 Z" fill="#b79bff" ${line}/>
      <path d="M84 96 C94 96 98 88 97 80" fill="none" stroke="#ff7a9c" stroke-width="3.5" stroke-linecap="round"/>
      ${body(p)}${belly(p)}
      ${feet('#d8c4f6')}${arms(p.body)}
      <path d="M44 32 L42 16 L54 27 Z" fill="#ffffff" ${line}/><path d="M76 32 L78 16 L66 27 Z" fill="#ffffff" ${line}/>
      <path d="M45.5 29 L44.5 21 L50 26 Z" fill="#ffc2dc"/><path d="M74.5 29 L75.5 21 L70 26 Z" fill="#ffc2dc"/>
      ${head(p)}
      ${mane}
      <path d="M54 27 L60 2 L66 27 Z" fill="${p.horn}" ${line}/>
      <path d="M56 21 L64 17 M57.5 14 L62.5 11" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
      ${eyes(52)}${cheeks(62)}${smile(63)}`;
  }

  function pegasus(p, stage) {
    const wing = (side) => {
      const s = side === 'l' ? 1 : -1;
      const x = (v) => 60 - s * (60 - v);
      return `<path d="M${x(40)} 80 C${x(30)} 60 ${x(14)} 46 ${x(4)} 48 C${x(8)} 54 ${x(6)} 58 ${x(10)} 62 C${x(6)} 64 ${x(8)} 70 ${x(14)} 72 C${x(10)} 76 ${x(14)} 82 ${x(22)} 82 C${x(26)} 88 ${x(34)} 88 ${x(42)} 90 Z" fill="#ffffff" ${line}/>
        <path d="M${x(14)} 60 C${x(22)} 64 ${x(28)} 70 ${x(34)} 78 M${x(18)} 72 C${x(24)} 76 ${x(30)} 80 ${x(36)} 84" fill="none" stroke="${p.dark}" stroke-width="2" stroke-linecap="round"/>`;
    };
    const sparkles = stage >= 4 ? `${star(14, 26, 7)}${star(106, 22, 6, '#ffb8e1')}${star(102, 98, 5, '#9ad0ff')}${star(18, 100, 5)}` : '';
    const mane = [['#9ad0ff', 42, 30, 8.5], ['#c7b8ff', 52, 24, 8], ['#ffb8e1', 64, 23, 7.5], ['#9ad0ff', 36, 42, 7.5]]
      .map(([c, x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${line}/>`).join('');
    return `
      ${sparkles}
      <path d="M82 94 C96 96 104 86 102 76 C108 82 110 94 100 102 C94 106 86 104 81 99 Z" fill="#c7b8ff" ${line}/>
      ${wing('l')}${wing('r')}
      ${body(p)}${belly(p)}
      ${feet('#b4c8f0')}${arms(p.body)}
      <path d="M76 32 L80 16 L67 27 Z" fill="${p.body}" ${line}/><path d="M74.5 29 L77 21 L71 26 Z" fill="#ffc2dc"/>
      ${head(p)}
      ${mane}
      ${eyes(52)}${cheeks(62)}${smile(63)}`;
  }

  function dinosaur(p, stage) {
    const shades = stage >= 4 ? `<g><rect x="40" y="43" width="17" height="11" rx="5" fill="${INK}"/><rect x="63" y="43" width="17" height="11" rx="5" fill="${INK}"/><path d="M57 47 h6" stroke="${INK}" stroke-width="3"/><path d="M44 46 l5 0" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M67 46 l5 0" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".7"/></g>` : '';
    return `
      <path d="M80 92 C98 96 110 90 116 80 C114 92 104 104 82 102 Z" fill="${p.body}" ${line}/>
      <path d="M94 92 l4 -7 l3 6 M104 88 l4 -6 l2 6" fill="${p.plates}" ${line}/>
      ${body(p)}${belly(p)}
      ${feet(p.body)}${arms(p.body)}
      <path d="M44 30 L42 17 L53 26 Z M56 25 L60 11 L64 25 Z M76 30 L78 17 L67 26 Z" fill="${p.plates}" ${line}/>
      ${head(p)}
      ${shades || eyes()}${cheeks()}${smile()}
      <path d="M58 61.5 l1.2 2.8 l1.2 -2.8" fill="#ffffff" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <circle cx="49" cy="38" r="2.6" fill="${p.dark}" opacity=".5"/><circle cx="72" cy="36" r="2" fill="${p.dark}" opacity=".5"/>`;
  }

  function owl(p, stage) {
    const cap = stage >= 4 && stage < 5 ? `<g><path d="M36 28 L60 18 L84 28 L60 37 Z" fill="${INK}"/><rect x="50" y="29" width="20" height="8" fill="${INK}"/><path d="M80 29 v12" stroke="#ffd23f" stroke-width="2.4" stroke-linecap="round"/><circle cx="80" cy="42" r="2.6" fill="#ffd23f"/></g>` : '';
    const eye = (x) => `<circle cx="${x}" cy="49" r="11" fill="#fff6dc" ${line}/><circle cx="${x}" cy="49" r="6.2" fill="${INK}"/><circle cx="${x + 2}" cy="46.5" r="2" fill="#ffffff"/>`;
    return `
      <path d="M33 74 C22 86 24 100 36 104 C38 94 40 86 42 80 Z" fill="${p.dark}" ${line}/>
      <path d="M87 74 C98 86 96 100 84 104 C82 94 80 86 78 80 Z" fill="${p.dark}" ${line}/>
      ${body(p)}
      <ellipse cx="60" cy="90" rx="16" ry="15" fill="${p.belly}"/>
      <path d="M52 84 q3 3 6 0 M62 84 q3 3 6 0 M57 92 q3 3 6 0 M51 98 q3 3 6 0 M63 98 q3 3 6 0" fill="none" stroke="${p.dark}" stroke-width="1.8" stroke-linecap="round"/>
      ${feet('#ffb347')}
      <path d="M38 34 L34 16 L50 28 Z" fill="${p.body}" ${line}/><path d="M82 34 L86 16 L70 28 Z" fill="${p.body}" ${line}/>
      ${head(p)}
      <ellipse cx="60" cy="54" rx="21" ry="17" fill="${p.belly}"/>
      ${eye(50)}${eye(70)}
      <path d="M56 58 L64 58 L60 66 Z" fill="#ffb347" ${line}/>
      <ellipse cx="40" cy="62" rx="4" ry="2.6" fill="#ff8fab" opacity=".55"/><ellipse cx="80" cy="62" rx="4" ry="2.6" fill="#ff8fab" opacity=".55"/>
      ${cap}`;
  }

  const DRAW = { dragon, unicorn, pegasus, dinosaur, owl };

  // ---- Eggs ----------------------------------------------------------------

  const EGG = 'M60 26 C80 26 92 56 92 76 C92 96 78 108 60 108 C42 108 28 96 28 76 C28 56 40 26 60 26 Z';
  function eggPattern(kind, p) {
    if (kind === 'unicorn') return `${star(48, 58, 6, '#f9a8d4')}${star(72, 76, 7, '#c4b5fd')}${star(52, 92, 5, '#fde68a')}<path d="M30 80 Q60 70 90 80" fill="none" stroke="#a5f3fc" stroke-width="5" opacity=".8"/>`;
    if (kind === 'pegasus') return `<path d="M40 64 a7 7 0 0 1 12 -4 a8 8 0 0 1 14 3 a6 6 0 0 1 2 11 h-26 a6 6 0 0 1 -2 -10 Z" fill="#ffffff" opacity=".95"/><path d="M58 90 a6 6 0 0 1 10 -3 a7 7 0 0 1 12 3 a5 5 0 0 1 1 9 h-22 a5 5 0 0 1 -1 -9 Z" fill="#ffffff" opacity=".95"/>`;
    if (kind === 'owl') return [[46, 52], [70, 60], [54, 76], [76, 86], [44, 92], [62, 98], [58, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.6" fill="${p.spots}" opacity=".7"/>`).join('');
    return [[48, 50, 6], [70, 62, 8], [50, 82, 7], [74, 92, 5], [62, 40, 4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.spots}" opacity=".85"/>`).join('');
  }
  const egg = (kind, p) => `<g class="buddy-egg"><path d="${EGG}" fill="${p.egg}" ${line}/>${eggPattern(kind, p)}<path d="M44 46 C46 38 52 34 56 33" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".8"/></g>`;
  // The bottom half of a cracked egg, for a baby that's just hatched.
  const shell = (kind, p) => `<path d="M28 82 L36 76 L42 84 L50 75 L58 84 L66 75 L74 84 L82 76 L92 82 C92 98 78 110 60 110 C42 110 28 98 28 82 Z" fill="${p.egg}" ${line}/>
    <clipPath id="sh-${kind}"><path d="M28 82 L36 76 L42 84 L50 75 L58 84 L66 75 L74 84 L82 76 L92 82 C92 98 78 110 60 110 C42 110 28 98 28 82 Z"/></clipPath>
    <g clip-path="url(#sh-${kind})">${eggPattern(kind, p)}</g>`;

  // ---- Putting a stage together --------------------------------------------

  const SCALE = [0, 0.7, 0.82, 1, 1, 1];

  function markup(kind, stage) {
    const p = PALETTES[kind] || PALETTES.owl;
    if (stage <= 0) return egg(kind, p);
    const s = SCALE[Math.min(stage, 5)];
    // Babies sit low in their shell; the rest stand on the ground line.
    const drop = stage === 1 ? 6 : 0;
    const creature = `<g transform="translate(60 ${112 + drop}) scale(${s}) translate(-60 -112)">${DRAW[kind](p, stage)}${stage >= 5 ? crown(kind === 'unicorn' ? 20 : 24) : ''}</g>`;
    // A hatchling sits inside its shell: nothing pokes out underneath.
    if (stage === 1) return `<clipPath id="in-${kind}"><rect x="22" y="0" width="76" height="98"/></clipPath><g clip-path="url(#in-${kind})">${creature}</g>${shell(kind, p)}`;
    return creature;
  }

  // An <svg> element for a creature at a stage; `cls` for styling hooks.
  function svg(kind, stage, cls = '') {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="buddy-art ${cls}" aria-hidden="true">${markup(kind, stage)}</svg>`;
    return wrap.firstElementChild;
  }

  return { svg, markup, KINDS: Object.keys(PALETTES) };
})();
