// Boekhoek's version, shown in Settings and the footer. With every release:
// bump it, add an entry to CHANGELOG.md, and set the same ?v= on the files
// index.html loads (so phones fetch the matching code).
const APP = {
  version: '1.8.2',
  date: '2026-11-04',
  // What's new in this version, shown in Settings.
  notes: {
    en: [
      'Books can be taken off Kinderhoekie’s shelf: tap the ✕ on a book’s corner and type the grown-up PIN.',
    ],
    af: [
      'Boeke kan van Kinderhoekie se rak afgehaal word: tik die ✕ op ’n boek se hoek en tik die grootmens-PIN.',
    ],
  },
};
