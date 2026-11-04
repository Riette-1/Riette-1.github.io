// Boekhoek's version, shown in Settings and the footer. With every release:
// bump it, add an entry to CHANGELOG.md, and set the same ?v= on the files
// index.html loads (so phones fetch the matching code).
const APP = {
  version: '1.8.0',
  date: '2026-11-04',
  // What's new in this version, shown in Settings.
  notes: {
    en: [
      'A “Grown-ups / Kinderhoekie” switch at the top of the reading nook. The first time, it asks for names and a PIN; going back to grown-ups needs the PIN.',
      'In Kinderhoekie, a grown-up can add a book straight from the home screen with the PIN.',
    ],
    af: [
      '’n “Grootmense / Kinderhoekie”-skakelaar bo-aan die leeshoekie. Die eerste keer vra dit name en ’n PIN; terug na grootmense vra die PIN.',
      'In Kinderhoekie kan ’n grootmens met die PIN ’n boek reg van die tuisskerm af byvoeg.',
    ],
  },
};
