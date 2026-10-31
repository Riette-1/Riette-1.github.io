// Boekhoek's version, shown in Settings and the footer. With every release:
// bump it, add an entry to CHANGELOG.md, and set the same ?v= on the files
// index.html loads (so phones fetch the matching code).
const APP = {
  version: '1.1.1',
  date: '2026-10-31',
  // What's new in this version, shown in Settings.
  notes: {
    en: [
      'Reading together now uses the grown-up’s name (“Mamma’s turn!”). If it isn’t set yet, Boekhoek asks who’s reading, with quick choices like Mamma, Pappa, Ouma and Oupa, and you can change it any time.',
      'A face that fits the grown-up reading, and tidier wording on the turn card.',
    ],
    af: [
      'Lees saam gebruik nou die grootmens se naam (“Mamma se beurt!”). As dit nog nie gestel is nie, vra Boekhoek wie saamlees, met vinnige keuses soos Mamma, Pappa, Ouma en Oupa, en jy kan dit enige tyd verander.',
      '’n Gesiggie wat by die grootmens pas, en netjieser woorde op die beurtkaart.',
    ],
  },
};
