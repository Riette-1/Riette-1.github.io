// Boekhoek's version, shown in Settings and the footer. With every release:
// bump it, add an entry to CHANGELOG.md, and set the same ?v= on the files
// index.html loads (so phones fetch the matching code).
const APP = {
  version: '1.7.0',
  date: '2026-11-04',
  // What's new in this version, shown in Settings.
  notes: {
    en: [
      'Kids’ mode and grown-up mode now have separate bookshelves: books added in kids’ mode only show in kids’ mode, and the other way round.',
      'Grown-ups can hand a book to the kids with “Move to the kids’ shelf” on the book’s card.',
    ],
    af: [
      'Kindermodus en grootmensmodus het nou elk hul eie boekrak: boeke wat in kindermodus bygevoeg is, wys net in kindermodus, en andersom.',
      'Grootmense kan ’n boek vir die kinders gee met “Skuif na die kinders se rak” op die boek se kaart.',
    ],
  },
};
