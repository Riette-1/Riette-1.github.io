# Boekhoek changelog

Boekhoek shows its version in **Settings → About Boekhoek** and in the footer.
With every release: bump `speed-reader/version.js`, set the same `?v=` on the files
`speed-reader/index.html` loads, and add an entry here.

## 1.8.1 · 4 November 2026

- **More books in Kinderhoekie:** the kids' bookshelf now ends with an *Add a book* tile marked
  "🔒 For grown-ups". It asks for the grown-up PIN and then opens the file picker, so books can be
  added after the first one (before, the tile was hidden in kids' mode).
- Dropping an EPUB onto the page in Kinderhoekie also asks for the PIN first.

## 1.8.0 · 4 November 2026

- **Switching between grown-ups and kids is on the home screen:** a *Grown-ups / Kinderhoekie* switch
  sits at the top of the reading nook.
  - The first time, Kinderhoekie opens a short welcome that asks for the child's name and who reads
    with them, then a PIN, then the child picks a reading buddy.
  - After that, tapping Kinderhoekie goes straight in. Tapping Grown-ups asks for the PIN (shown with a
    🔒).
  - The switch in Settings still works too.
- **Adding a book in Kinderhoekie:** the empty kids' shelf has a *Grown-ups: add a book* button that asks
  for the PIN and opens the file picker, without going through Settings.
- The kids' welcome screen no longer shows the grown-up speed-reading text.

## 1.7.0 · 4 November 2026

- **Separate shelves for kids and grown-ups:** every book now belongs to the shelf it was added on.
  Books added in kids' mode only appear (and open) in kids' mode, and books added in grown-up mode only
  in grown-up mode. The same book can be on both shelves, each with its own bookmark.
- Switching kids' mode on or off while a book is open puts that book away, so it can't be read from the
  other mode.
- A grown-up book's card has **Move to the kids' shelf**. If the kids already have their own copy,
  they keep their bookmark.
- Books added before this version are on the grown-ups' shelf.

## 1.6.0 · 4 November 2026

- **Natural AI voice for English books:** Storytime can now use Kokoro, an open AI text-to-speech model
  that runs entirely on the device (kokoro-js 1.2.1, vendored in `speed-reader/vendor/kokoro/`).
  - Settings → Storytime has a "Natural AI voice (English)" card. One tap downloads it (about 92 MB
    for the model from Hugging Face, plus the 22 MB speech engine from jsDelivr), with a progress bar.
    It stays in the browser cache and works offline. Also has "Hear a sample" and "Remove from this
    device".
  - Five voices appear at the top of the Storytime voice list for English books: Heart, Bella and
    Michael (American), Emma and George (British). Afrikaans books keep the phone's own voices.
  - The voice runs in a background worker (`aivoice-worker.js`), a sentence or so at a time, with the
    next sentence prepared while the current one plays. The highlight follows the speech, with a
    slightly longer breath at the end of paragraphs.
  - Tapping a word in kids' mode and hearing a looked-up word use the AI voice too.
- The offline cache no longer clears other caches when Boekhoek updates, so the AI voice isn't
  downloaded again with every new version.

## 1.5.0 · 4 November 2026

- **Landscape on phones:** turn the phone on its side and the reader becomes two columns (for screens
  in landscape up to 540 px high). The text fills the left under the reading-mode tabs. A side panel on
  the right holds the book title with the home and settings buttons, the chapter list, Page mode's
  scroll / turn switch, the kids' turn card and the controls (progress, buttons, speed or voice). The
  text gets about twice the height it had before. Flash uses a word size that fits the shorter screen.
  Portrait and tablets are unchanged.

## 1.4.0 · 1 November 2026

- **Turn pages in Page mode:** a new *Scroll / Turn pages* (*Rol / Blaai*) switch above the text. With
  *Turn pages*, the chapter is laid out in pages the size of the screen (CSS columns); swipe left or right,
  or use the arrow buttons or keys, to slide to the next or previous page. Turning past the last page goes
  on to the next chapter (with its quiz, if quizzes are on), and turning back from the first page opens
  the previous chapter at its last page. The page number shows in the corner, and the bookmark is the
  first word on the page. The choice is remembered.
- **Pinch to change the text size:** spread two fingers on the text to make it bigger, pinch to make it
  smaller (70% to 160%, the same as Settings → Text size). Works in every reading mode, and Page mode
  stays on the same place in the book.

## 1.3.0 · 31 October 2026

- **New logo, "boek in die hoek":** two walls meeting in a corner, with a yellow book standing in it and a
  white book leaning on it. Replaces the moon-and-book mark on the app icon (normal, maskable and Apple),
  the favicon and the in-app logo (top bar, welcome screen, footer). The favicon uses thicker lines so it
  stays clear at 16 px.

## 1.2.0 · 31 October 2026

- **Hand-drawn reading buddies:** the dragon, unicorn, pegasus, dinosaur and owl are now drawn in one
  matching cartoon style (SVG in `buddies.js`) instead of a mix of emoji, so they look the same on every
  phone. Six stages each: an egg in the creature's colours (wobbling), a hatchling in its cracked shell,
  little, grown, grown with something special (fire, rainbow, sparkles, sunglasses, graduation cap) and
  royal with a crown. Used on the buddy card, in the picker, in the "your buddy grew" pop-up and on the
  reading map.
- Fixes Pegasus's wings covering the picker card.

## 1.1.1 · 31 October 2026

- **Reading together uses the grown-up's name** ("Mamma se beurt!" instead of "die grootmens se beurt!").
  If no name is set, Boekhoek asks *"Wie lees saam met jou?"* with quick choices (Mamma, Pappa, Ouma,
  Oupa) or any other name, and "Someone else reading?" on the turn card changes it any time.
- A face that fits the grown-up (👩 👨 👵 👴), the turn title always starts with a capital, and
  "Jou beurt!" when the child's name isn't set.
- The name boxes in Settings now show "e.g. Mia" / "e.g. Mamma", so the examples don't look filled in.

## 1.1.0 · 31 October 2026

- **Draw it yourself:** after a chapter in kids' mode, children can draw their favourite moment, with
  10 colours, three brush sizes, an eraser, undo and stamps taken from the chapter's pictures.
  Drawings hang in a **My art** gallery on the kids' home screen (tap to see them big, save them to the
  device, or take them out). New *Little artist* sticker. Grown-ups can switch the end-of-chapter
  prompt off in Settings.
- **Version numbers:** the app now shows its version and what's new in Settings, and in the footer.

## 1.0.0 · 31 October 2026

The first numbered release, covering everything built so far:

- EPUB speed reading in four modes: Pacer (1–4 words per highlight), Flash, Page and Storytime
  (read aloud with the device's voices, in Afrikaans or English).
- Bookshelf and nightstand, reading journal with pace stats and charts, reading-time estimates,
  chapter quizzes, word look-ups, a word jar, sharing quotes on WhatsApp, and backups.
- Afrikaans by default with an English switch; six themes; offline use and installing as an app.
- Kids' mode (Kinderhoekie) behind a parent PIN: read-along with names, read together, stickers,
  a reading buddy to choose and grow, five kids' themes, the book's own pictures, picture bubbles
  and kid-friendly quizzes.
