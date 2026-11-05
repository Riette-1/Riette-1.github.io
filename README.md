# Riette-1.github.io
Countdown to christmas

## Boekhoek

*Lees vinniger, uit jou gunstelinghoekie.* Geskep deur Riëtte.

Current version: **1.8.2** (see [CHANGELOG.md](CHANGELOG.md)). The version is shown in the app under Settings → About Boekhoek.

[Boekhoek](https://riette-1.github.io/boekhoek/) (previously Nook) is a browser-only speed reading app for `.epub` files, in Afrikaans with an English option. It's served from [`/speed-reader/`](https://riette-1.github.io/speed-reader/); `/boekhoek/` and `/nook/` forward there. Open or drop a book; nothing is uploaded.

- **Flash (RSVP)**: shows one word (or a 2–4 word chunk) at a time at a fixed point, with the optimal recognition point in red.
- **Pacer**: a highlight moves through the chapter at your target speed, with optional Bionic bolding.
- **Smart timing**: longer pauses at punctuation, paragraph ends, chapter breaks and long words, plus an ease-in after you press play.
- 100–1200 wpm, chapter navigation, time remaining, themes, and your position in each book is remembered.
- **Chapter quizzes** (optional): a short quiz at the end of each chapter, built from the chapter's own text (fill in a missing name, number or word; which moment came first), with a running average.
- **Kids' mode (Kinderhoekie)**, locked behind a 4-digit parent PIN: a bright, rounded look with no speed reading; *Ek lees self* (I read), *Lees vir my* (read-along karaoke with tap-to-hear words) and *Lees saam* (child and grown-up take turns by paragraph); a sticker album; a reading buddy the child chooses (dragon, unicorn, pegasus, dinosaur or owl) that grows with minutes read; five playful themes (sunshine, ocean, jungle, space, candy); drawing a favourite moment after each chapter, kept in a "My art" gallery; a read-along voice that greets and cheers the child and grown-up by name; the book's own illustrations in the text, picture bubbles for story words and a scene strip when reading together; a reading map for each book; gentle quizzes with stars and "try again"; and a word jar with a word-match game.
- **Works offline and installs like an app**: a service worker keeps the app's files on the device, and the web app manifest lets it be installed (Chrome/Edge/Android) or added to the iPhone Home Screen.

Shortcuts: `Space` play/pause, `←`/`→` sentence, `↑`/`↓` speed, `[`/`]` chapter, `M` switch mode.

## Bakboord na stuurboord

[Bakboord na stuurboord](https://riette-1.github.io/bakboord/) (version 0.1.0) turns treadmill steps into a journey on Google Maps. It's made for mobile phones and for treadmill walking or running only (no GPS or outdoor tracking). It lives in [`/bakboord/`](bakboord/).

- **Pick any route:** search for a start and destination, or tap them on the map. The app draws the road route and shows its distance, the steps needed (10 map km per km walked, by default) and roughly how many sessions it will take.
- **Workout timer:** start, pause and resume during a workout; paused time doesn't count, and a paused timer survives closing the browser. Finish, then type the steps (or km) from your Garmin.
- **Journeys:** keep several at once. Pause one and resume it any time later from exactly the same spot; only one is active at a time.
- **Postcards** every 50 map km and on arrival, a session history (delete a wrong entry and the marker moves back), and a backup file to move journeys to another device.

Needs a Google Maps API key in `bakboord/config.js` (or pasted into the app on each device), with the Maps JavaScript API, Places API (New) and Routes API enabled. Restrict the key to `https://riette-1.github.io/*`. Everything else stays in the browser.
