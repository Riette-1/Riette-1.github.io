// Boekhoek's version, shown in Settings and the footer. With every release:
// bump it, add an entry to CHANGELOG.md, and set the same ?v= on the files
// index.html loads (so phones fetch the matching code).
const APP = {
  version: '1.4.0',
  date: '2026-11-01',
  // What's new in this version, shown in Settings.
  notes: {
    en: [
      'Page mode can now turn pages like a book: tap “Turn pages” at the top, then swipe left or right (or use the arrows). The page number shows at the bottom.',
      'Pinch the text with two fingers to make it bigger or smaller, in any reading mode.',
    ],
    af: [
      'Bladsy kan nou blaai soos ’n boek: tik bo op “Blaai”, en swiep dan links of regs (of gebruik die pyltjies). Die bladsynommer staan onderaan.',
      'Knyp die teks met twee vingers om dit groter of kleiner te maak, in enige leesmodus.',
    ],
  },
};
