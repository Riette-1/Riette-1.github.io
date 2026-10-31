// Languages: Afrikaans (the default) and English. The English text is the
// key, so code and markup read naturally; AF holds the Afrikaans for each.
// Markup tags plain text with data-i18n, mixed text (bold, links) with
// data-i18n-html, and title / aria-label / placeholder are translated too.
const I18n = (() => {
  const AF = {
    // ---- Home: nightstand, shelf, journal
    'Welcome back': 'Welkom terug',
    'Your book is right where you left it.': 'Jou boek is net waar jy dit gelos het.',
    'On your nightstand': 'Op jou bedkassie',
    'Open to my bookmark': 'Maak oop by my boekmerk',
    'Start reading': 'Begin lees',
    'Read it again': 'Lees dit weer',
    'How long will it take?': 'Hoe lank sal dit vat?',
    'Up late?': 'Laat op?',
    'Good morning': 'Goeiemôre',
    'Good afternoon': 'Goeiemiddag',
    'Good evening': 'Goeienaand',
    'Finished. Time to pick the next one from your shelf?': 'Klaar gelees. Tyd om die volgende een van jou rak af te haal?',
    'Not started yet. The first page is waiting.': 'Nog nie begin nie. Die eerste bladsy wag.',
    'Bookmarked in {chapter}': 'Boekmerk in {chapter}',
    ' · {left} to the end, {when}': ' · {left} tot die einde, {when}',
    ' · {left} to the end': ' · {left} tot die einde',
    'finish by {time} today': 'klaar teen {time} vandag',
    'finish by {day} {time}': 'klaar teen {day} {time}',
    'Put a book on the shelf': 'Sit ’n boek op die rak',
    'or drop an EPUB here': 'of los ’n EPUB hier',
    'Read faster, from your favourite corner.': 'Lees vinniger, uit jou gunstelinghoekie.',
    'Your bookshelf': 'Jou boekrak',
    '{n} book': '{n} boek',
    '{n} books': '{n} boeke',
    'Drop an EPUB anywhere on this page to add it.': 'Los ’n EPUB enige plek op hierdie bladsy om dit by te voeg.',
    'Finished': 'Klaar gelees',
    'Not started': 'Nog nie begin nie',
    '{pct}% · {left} left': '{pct}% · {left} oor',
    '{title} by {author}': '{title} deur {author}',
    'Add a book': 'Voeg ’n boek by',
    'EPUB from your device': 'EPUB van jou toestel',
    'Reading journal': 'Leesdagboek',
    'Time counted while a book is playing': 'Tyd tel terwyl ’n boek speel',
    'read today': 'vandag gelees',
    'day streak': ['dag aaneen', 'dae aaneen'],
    'read this week': 'hierdie week gelees',
    'words this week': 'woorde hierdie week',
    'books finished': 'boeke klaar gelees',
    'book finished': 'boek klaar gelees',
    'Minutes read · last 14 days': 'Minute gelees · laaste 14 dae',
    'Minutes read per day, last 14 days': 'Minute gelees per dag, laaste 14 dae',
    'Press play on a book and your reading time will be written here.': 'Druk speel op ’n boek, en jou leestyd word hier opgeteken.',
    'Today': 'Vandag',
    '{day} · {min} min · {words} words': '{day} · {min} min · {words} woorde',
    'Reading pace': 'Leestempo',
    'average, wpm': 'gemiddeld, wpm',
    'best session, wpm': 'beste sessie, wpm',
    'best day, wpm': 'beste dag, wpm',
    'wpm since your first week': 'wpm sedert jou eerste week',
    'shows after a week of reading': 'wys ná ’n week se lees',
    'Read for a minute or more and your pace will appear here.': 'Lees vir ’n minuut of langer, en jou tempo verskyn hier.',
    'Real pace is the words you actually read per minute, pauses at punctuation included, so it runs a little below your speed setting.': 'Werklike tempo is die woorde wat jy regtig per minuut lees, met pouses by leestekens ingesluit, so dit is effens stadiger as jou spoedinstelling.',
    'Reading pace per day over the last {days} days. Average {avg} words per minute.': 'Leestempo per dag oor die laaste {days} dae. Gemiddeld {avg} woorde per minuut.',
    'average {n}': 'gemiddeld {n}',
    '{day} · {wpm} wpm · {time}': '{day} · {wpm} wpm · {time}',

    // ---- Techniques
    'Flash': 'Flits',
    'Pacer': 'Tempo',
    'Page': 'Bladsy',
    'Storytime': 'Storietyd',
    'Smart timing': 'Slim tydsberekening',
    'One word at a time in a fixed spot, so your eyes never have to travel. The red letter marks where your eye naturally locks on.': 'Een woord op ’n slag op een plek, sodat jou oë nooit hoef te beweeg nie. Die rooi letter wys waar jou oog vanself vasvat.',
    'A highlight sweeps through the page at your speed, like running a finger under the line, so you don\'t drift back.': '’n Uitlig beweeg teen jou spoed deur die bladsy, soos ’n vinger onder die reël, sodat jy nie terugdwaal nie.',
    'Slightly longer pauses at commas, sentence ends, paragraphs and long words keep comprehension up.': 'Effens langer pouses by kommas, sinseindes, paragrawe en lang woorde hou jou begrip skerp.',

    // ---- Install
    'Install Boekhoek': 'Installeer Boekhoek',
    'Not now': 'Nie nou nie',
    'Install Boekhoek on this device. It opens in its own window from your home screen or desktop and works without internet.': 'Installeer Boekhoek op hierdie toestel. Dit maak in sy eie venster oop vanaf jou tuisskerm of rekenaar en werk sonder internet.',
    'Install Boekhoek on this device. It opens full-screen from your home screen and works without internet.': 'Installeer Boekhoek op hierdie toestel. Dit maak volskerm oop vanaf jou tuisskerm en werk sonder internet.',
    'Add Boekhoek to your Home Screen. It opens full-screen like an app, works without internet, and keeps your reading safe from Safari’s clean-up.': 'Voeg Boekhoek by jou tuisskerm. Dit maak volskerm oop soos ’n toep, werk sonder internet en hou jou leeswerk veilig teen Safari se opruiming.',
    'Boekhoek is installed. Find it with your other apps.': 'Boekhoek is geïnstalleer. Jy kry dit by jou ander toepe.',

    // ---- Reader
    'Reading nook': 'Leeshoekie',
    'Back to your reading nook': 'Terug na jou leeshoekie',
    'Screen on': 'Skerm aan',
    'The screen won\'t dim or lock while you read': 'Die skerm word nie dof of sluit nie terwyl jy lees',
    'Settings': 'Instellings',
    'Reading mode': 'Leesmodus',
    'Chapter': 'Hoofstuk',
    'Tap to play · select words below to look them up or share': 'Tik om te speel · kies woorde hieronder om op te soek of te deel',
    'Position in book': 'Plek in die boek',
    'Slower': 'Stadiger',
    'Faster': 'Vinniger',
    'Slower (↓)': 'Stadiger (↓)',
    'Faster (↑)': 'Vinniger (↑)',
    'Words per minute': 'Woorde per minuut',
    'Previous chapter': 'Vorige hoofstuk',
    'Next chapter': 'Volgende hoofstuk',
    'Previous chapter ([)': 'Vorige hoofstuk ([)',
    'Next chapter (])': 'Volgende hoofstuk (])',
    'Previous sentence': 'Vorige sin',
    'Next sentence': 'Volgende sin',
    'Previous sentence (←)': 'Vorige sin (←)',
    'Next sentence (→)': 'Volgende sin (→)',
    'Previous page': 'Vorige bladsy',
    'Next page': 'Volgende bladsy',
    'Play': 'Speel',
    'Pause': 'Pouse',
    'Play / pause (Space)': 'Speel / pouse (Spasie)',
    'Speak slower': 'Praat stadiger',
    'Speak faster': 'Praat vinniger',
    'voice': 'stem',
    'Voice': 'Stem',
    'Chapter {n} of {total} · {left} left': 'Hoofstuk {n} van {total} · {left} oor',
    ' to the end · {pct}%': ' tot die einde · {pct}%',
    'At {wpm} wpm you\'ll {when}': 'Teen {wpm} wpm is jy {when}',
    'finish in {time}': 'klaar oor {time}',
    '<1 min': '<1 min',
    '{m} min': '{m} min',
    '{h}h {m}m': '{h} u {m} min',
    '{h}h': '{h} u',

    // ---- Loading and finishing
    'Finding your bookmark…': 'Soek jou boekmerk…',
    'Taking “{name}” off the shelf…': 'Haal “{name}” van die rak af…',
    'Turning the pages… {pct}%': 'Blaai deur die bladsye… {pct}%',
    'This book couldn’t be opened any more. Take it off the shelf and add it again.': 'Hierdie boek kan nie meer oopgemaak word nie. Haal dit van die rak af en voeg dit weer by.',
    'Could not read this file.': 'Kon nie hierdie lêer lees nie.',
    'There’s no room left on this device to keep this book on the shelf, but you can still read it now.': 'Daar is nie meer plek op hierdie toestel om dié boek op die rak te hou nie, maar jy kan dit nou nog lees.',
    'You finished “{title}”. Well read!': 'Jy het “{title}” klaar gelees. Mooi so!',
    'This file is not a valid EPUB (zip archive not found).': 'Hierdie lêer is nie ’n geldige EPUB nie.',
    'Corrupt EPUB: bad zip directory.': 'Die EPUB is beskadig.',
    'EPUB is missing its package (OPF) file.': 'Die EPUB kort ’n belangrike lêer (OPF).',
    'No readable chapters found in this EPUB.': 'Geen leesbare hoofstukke in hierdie EPUB gevind nie.',
    'This EPUB contains no readable text.': 'Hierdie EPUB bevat geen leesbare teks nie.',
    'Section {n}': 'Afdeling {n}',

    // ---- Book card
    'From your bookshelf': 'Van jou boekrak',
    'At this pace': 'Teen hierdie tempo',
    'Reading pace ': 'Leestempo ',
    'Custom words per minute': 'Eie woorde per minuut',
    'the whole book': 'die hele boek',
    'left to read': 'oor om te lees',
    'left to read · {pct}% of the book': 'oor om te lees · {pct}% van die boek',
    'you finished it': 'jy het dit klaar gelees',
    'Done': 'Klaar',
    'Reading a little each day': 'Lees elke dag ’n bietjie',
    'Minutes a day': 'Minute per dag',
    '1 hr': '1 uur',
    'Take off the shelf': 'Haal van die rak af',
    'Speed setting': 'Spoedinstelling',
    'Your average': 'Jou gemiddeld',
    'Your best': 'Jou beste',
    'Custom': 'Eie keuse',
    'pick a speed': 'kies ’n spoed',
    '{wpm} wpm': '{wpm} wpm',
    'You’ve read this one. Reading it again would take about {time}.': 'Jy het hierdie een klaar gelees. Om dit weer te lees, sal sowat {time} vat.',
    'That’s a single sitting: about {time} at {wpm} wpm.': 'Dis een sitting: sowat {time} teen {wpm} wpm.',
    'At {daily} minutes a day you’ll finish in {span}, around {when}.': 'Teen {daily} minute per dag is jy oor {span} klaar, so teen {when}.',
    '{n} days': '{n} dae',
    'about {n} weeks': 'sowat {n} weke',
    'about {n} months': 'sowat {n} maande',
    'Based on your real pace from the reading journal, which already includes pauses.': 'Gebaseer op jou werklike tempo uit die leesdagboek, wat pouses reeds insluit.',
    'Includes the smart pauses at punctuation, paragraphs and long words.': 'Sluit die slim pouses by leestekens, paragrawe en lang woorde in.',
    'Smart pauses are off, so this is words divided by speed.': 'Slim pouses is af, so dit is woorde gedeel deur spoed.',
    'Counting the words…': 'Tel die woorde…',
    'This book couldn’t be read to count its words.': 'Hierdie boek kon nie gelees word om die woorde te tel nie.',
    '{words} words · {n} chapter': '{words} woorde · {n} hoofstuk',
    '{words} words · {n} chapters': '{words} woorde · {n} hoofstukke',
    'Take “{title}” off your shelf? The book is removed from this device. Its bookmark and your reading journal are kept.': 'Haal “{title}” van jou rak af? Die boek word van hierdie toestel verwyder. Sy boekmerk en jou leesdagboek bly behoue.',

    // ---- Storytime
    'This browser can’t read aloud. Try an up-to-date Chrome, Edge or Safari.': 'Hierdie blaaier kan nie hardop lees nie. Probeer ’n nuwe weergawe van Chrome, Edge of Safari.',
    'That’s the end of “{title}”. Sweet dreams!': 'Dis die einde van “{title}”. Lekker slaap!',
    'The voice stopped ({error}). Press play to carry on.': 'Die stem het gestop ({error}). Druk speel om aan te gaan.',
    'unknown error': 'onbekende fout',
    'Default voice': 'Verstekstem',
    'No voices on this browser': 'Geen stemme op hierdie blaaier nie',
    'Tip: for a more natural voice, see Settings → Storytime.': 'Wenk: vir ’n meer natuurlike stem, kyk by Instellings → Storietyd.',
    'This device only has basic voices at the moment, which can sound robotic.': 'Hierdie toestel het tans net basiese stemme, wat soos ’n robot kan klink.',
    'On iPhone or iPad: Settings → Accessibility → Spoken Content → Voices → English. Download a voice marked “Enhanced” or “Premium”, such as Ava or Zoe, then pick it here.': 'Op iPhone of iPad: Settings → Accessibility → Spoken Content → Voices. Kies jou taal en laai ’n stem gemerk “Enhanced” of “Premium” af, en kies dit dan hier.',
    'On Android: Settings → search “Text-to-speech” → Google Speech Services → Install voice data. Choose your language and download the high-quality voice, then reopen Boekhoek.': 'Op Android: Instellings → soek “Teks-na-spraak” → Google Speech Services → Installeer stemdata. Kies jou taal (Afrikaans is beskikbaar), laai die hoëgehalte-stem af en maak Boekhoek weer oop.',
    'On a Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices. Download an “Enhanced” or “Premium” voice. Microsoft Edge also has very natural online voices built in.': 'Op ’n Mac: System Settings → Accessibility → Spoken Content → System voice → Manage Voices. Laai ’n “Enhanced”- of “Premium”-stem af. Microsoft Edge het ook baie natuurlike aanlynstemme ingebou.',
    'On Windows, Microsoft Edge has very natural online voices built in (look for “Natural” in the list). In Chrome, the Google voices are the smoothest.': 'Op Windows het Microsoft Edge baie natuurlike aanlynstemme ingebou (soek “Natuurlik” in die lys). In Chrome klink die Google-stemme die gladste.',
    'Your device’s settings may offer higher-quality voices to download. Voices marked “Natural” sound the most human.': 'Jou toestel se instellings bied dalk beter stemme om af te laai. Stemme gemerk “Natuurlik” klink die menslikste.',
    'Natural': 'Natuurlik',
    'American': 'Amerikaans',
    'British': 'Brits',
    'Australian': 'Australies',
    'Irish': 'Iers',
    'South African': 'Suid-Afrikaans',
    'Indian': 'Indies',
    'New Zealand': 'Nieu-Seeland',
    'Canadian': 'Kanadees',
    'Scottish': 'Skots',

    // ---- Words: look up and share
    'Look up': 'Soek op',
    'Share quote': 'Deel aanhaling',
    'Selected text': 'Gekose teks',
    'Look up the current word': 'Soek die huidige woord op',
    'Looking it up…': 'Soek dit op…',
    'More on Wiktionary': 'Meer op Wiktionary',
    'You’re offline. Looking up words needs an internet connection.': 'Jy is vanlyn. Om woorde op te soek, het jy internet nodig.',
    'The dictionary couldn’t be reached just now. Please try again in a moment.': 'Die woordeboek kan nou nie bereik word nie. Probeer asseblief weer oor ’n oomblik.',
    'No definition found for “{word}”. It may be a name, or a word this English dictionary doesn’t know.': 'Geen betekenis vir “{word}” gevind nie. Dit is dalk ’n naam, of ’n woord wat hierdie Engelse woordeboek nie ken nie.',
    'The dictionary here only knows English words. Look up “{word}” on Wiktionary for its Afrikaans meaning.': 'Die woordeboek hier ken net Engelse woorde. Soek “{word}” op Wiktionary vir die Afrikaanse betekenis.',
    'Share a quote': 'Deel ’n aanhaling',
    'Add a caption': 'Voeg ’n onderskrif by',
    'This line made me think of you…': 'Hierdie reël het my aan jou laat dink…',
    'Include the book’s title': 'Sluit die boek se titel in',
    'Adds the title and author under the quote': 'Voeg die titel en skrywer onder die aanhaling by',
    'Send on WhatsApp': 'Stuur op WhatsApp',
    'Other apps': 'Ander toepe',
    'Copy text': 'Kopieer teks',
    'Long passages are trimmed to the first {n} words.': 'Lang gedeeltes word tot die eerste {n} woorde ingekort.',
    'Quote copied. Paste it anywhere.': 'Aanhaling gekopieer. Plak dit enige plek.',
    'Couldn’t copy on this browser.': 'Kon nie op hierdie blaaier kopieer nie.',
    'Close': 'Maak toe',

    // ---- Settings
    'Display': 'Vertoning',
    'Theme': 'Tema',
    'Auto': 'Outomaties',
    'Light': 'Lig',
    'Dark': 'Donker',
    'Sepia': 'Sepia',
    'Ocean': 'Oseaan',
    'Blossom': 'Bloeisel',
    'Text size': 'Teksgrootte',
    'Reading': 'Lees',
    'Words per highlight (Pacer)': 'Woorde per uitlig (Tempo)',
    'Words per highlight in Pacer': 'Woorde per uitlig in Tempo',
    'Words per flash (Flash)': 'Woorde per flits (Flits)',
    'Words per flash': 'Woorde per flits',
    'Smart pauses': 'Slim pouses',
    'Linger at punctuation, paragraphs and long words': 'Talm by leestekens, paragrawe en lang woorde',
    'Ease in': 'Begin saggies',
    'Start a little slower each time you press play': 'Begin effens stadiger elke keer as jy speel druk',
    'Bionic bolding': 'Bioniese vetdruk',
    'Bold the start of each word in Pacer': 'Druk die begin van elke woord vet in Tempo',
    'Screen': 'Skerm',
    'Keep screen on': 'Hou skerm aan',
    'Stops the screen dimming while you read. Turns off after 5 minutes paused.': 'Keer dat die skerm dof word terwyl jy lees. Skakel af ná 5 minute se pouse.',
    'Not supported by this browser. Try an up-to-date Chrome, Edge or Safari.': 'Hierdie blaaier ondersteun dit nie. Probeer ’n nuwe weergawe van Chrome, Edge of Safari.',
    'Your data': 'Jou data',
    'Protect my data': 'Beskerm my data',
    'Download a backup': 'Laai ’n rugsteun af',
    'Restore from a backup': 'Herstel uit ’n rugsteun',
    'A backup keeps your journal, pace and bookmarks. Book files aren’t included, but adding a book again picks up its bookmark.': '’n Rugsteun bewaar jou dagboek, tempo en boekmerke. Boeklêers is nie ingesluit nie, maar as jy ’n boek weer byvoeg, gaan dit voort by sy boekmerk.',
    ' Using {size}.': ' Gebruik {size}.',
    '✓ Protected: this browser won’t clear Boekhoek’s data by itself.': '✓ Beskerm: hierdie blaaier sal nie Boekhoek se data uit eie beweging uitvee nie.',
    'Safari may clear it if you don’t visit for 7 days. Add Boekhoek to your Home Screen to keep it safe, or keep a backup.': 'Safari vee dit dalk uit as jy 7 dae lank nie besoek nie. Voeg Boekhoek by jou tuisskerm om dit veilig te hou, of hou ’n rugsteun.',
    'Not protected yet: the browser could clear it if your device runs low on space.': 'Nog nie beskerm nie: die blaaier kan dit uitvee as jou toestel se spasie min raak.',
    'You’re using Boekhoek from your Home Screen, which keeps its own data, separate from Safari. Use a backup to move your reading between them.': 'Jy gebruik Boekhoek vanaf jou tuisskerm, wat sy eie data apart van Safari hou. Gebruik ’n rugsteun om jou leeswerk tussen hulle te skuif.',
    'On iPhone, Boekhoek in Safari and Boekhoek on your Home Screen keep separate data. Use a backup to move your reading between them.': 'Op iPhone hou Boekhoek in Safari en Boekhoek op jou tuisskerm aparte data. Gebruik ’n rugsteun om jou leeswerk tussen hulle te skuif.',
    '✓ Works offline: Boekhoek and your books open without internet. Looking up words still needs a connection.': '✓ Werk vanlyn: Boekhoek en jou boeke maak sonder internet oop. Om woorde op te soek, het jy steeds ’n verbinding nodig.',
    'Offline use is being set up. Open Boekhoek once with internet and it’ll work offline after that.': 'Vanlyn gebruik word opgestel. Maak Boekhoek een keer met internet oop, en daarna werk dit vanlyn.',
    'You’re offline. Boekhoek keeps working; looking up words needs internet.': 'Jy is vanlyn. Boekhoek werk steeds; om woorde op te soek, het jy internet nodig.',
    'Done. Your reading data is protected.': 'Klaar. Jou leesdata is beskerm.',
    'Your browser didn’t allow it. Keeping a backup is the safest option.': 'Jou blaaier het dit nie toegelaat nie. ’n Rugsteun is die veiligste keuse.',
    'Backup saved. Keep it somewhere safe, like Files or your email.': 'Rugsteun gestoor. Hou dit iewers veilig, soos in Lêers of jou e-pos.',
    'The backup couldn’t be saved on this browser.': 'Die rugsteun kon nie op hierdie blaaier gestoor word nie.',
    'Restore this backup? It’s combined with what’s already here, so nothing on this device is lost.': 'Herstel hierdie rugsteun? Dit word saamgevoeg met wat reeds hier is, so niks op hierdie toestel gaan verlore nie.',
    'Restored {days} of reading and {marks}.': '{days} se leeswerk en {marks} herstel.',
    '{n} day': '{n} dag',
    '{n} bookmark': '{n} boekmerk',
    '{n} bookmarks': '{n} boekmerke',
    'That backup couldn’t be read.': 'Daardie rugsteun kon nie gelees word nie.',
    'This file isn’t a Boekhoek backup.': 'Hierdie lêer is nie ’n Boekhoek-rugsteun nie.',
    'Keyboard': 'Sleutelbord',
    'Play / pause': 'Speel / pouse',
    'Previous / next sentence': 'Vorige / volgende sin',
    'Faster / slower': 'Vinniger / stadiger',
    'Previous / next chapter': 'Vorige / volgende hoofstuk',
    'Next mode: Pacer, Flash, Page, Storytime': 'Volgende modus: Tempo, Flits, Bladsy, Storietyd',
    'Language · Taal': 'Language · Taal',
  };

  // Text that contains markup, keyed by name rather than by English.
  const HTML = {
    credit: {
      en: '<strong>Boekhoek</strong> · Created by <strong>Riëtte</strong>',
      af: '<strong>Boekhoek</strong> · Geskep deur <strong>Riëtte</strong>',
    },
    welcome: { en: 'Welcome to Boekhoek', af: 'Welkom by Boekhoek' },
    emptyShelf: {
      en: 'Your bookshelf is empty. Add an <strong>.epub</strong> to get started. Books stay on this device and are never uploaded.',
      af: 'Jou boekrak is leeg. Voeg ’n <strong>.epub</strong> by om te begin. Boeke bly op hierdie toestel en word nooit opgelaai nie.',
    },
    demoFlash: { en: 're<span>a</span>ding', af: 'l<span>e</span>es' },
    demoPacer: { en: 'read <span>along</span> with it', af: 'lees <span>saam</span> daarmee' },
    demoTiming: { en: 'pause<span>,</span> breathe<span>.</span>', af: 'rus<span>,</span> asem<span>.</span>' },
    installTitle: { en: 'Get the Boekhoek app', af: 'Kry die Boekhoek-toep' },
    installStep1: {
      en: 'Tap the <strong>Share</strong> button <svg class="ic" width="16" height="16" aria-hidden="true"><use href="#i-share"/></svg> in Safari’s toolbar.',
      af: 'Tik die <strong>Deel</strong>-knoppie <svg class="ic" width="16" height="16" aria-hidden="true"><use href="#i-share"/></svg> in Safari se nutsbalk.',
    },
    installStep2: {
      en: 'Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.',
      af: 'Kies <strong>Add to Home Screen</strong> (Voeg by tuisskerm), dan <strong>Add</strong>.',
    },
    defSource: {
      en: 'From the <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">Free Dictionary</a>',
      af: 'Uit die <a href="https://dictionaryapi.dev/" target="_blank" rel="noopener">Free Dictionary</a>',
    },
    voicesNote: {
      en: '<strong>Voices come from your device.</strong> Boekhoek picks the most natural ones it can find and lists just the best few.',
      af: '<strong>Stemme kom van jou toestel.</strong> Boekhoek kies die natuurlikste wat dit kan vind en wys net die beste paar.',
    },
    dataNote: {
      en: '<strong>Saved on this device.</strong> Your bookshelf, bookmarks, reading journal, pace history and settings stay in this browser between visits.',
      af: '<strong>Op hierdie toestel gestoor.</strong> Jou boekrak, boekmerke, leesdagboek, tempogeskiedenis en instellings bly tussen besoeke in hierdie blaaier.',
    },
    keyboardNote: {
      en: 'Tap any word in Pacer, or in the paused Flash preview, to jump to it. Select words (press and drag, or double-click one) to look a word up or share a quote on WhatsApp.',
      af: 'Tik enige woord in Tempo, of in die gepouseerde Flits-voorskou, om daarheen te spring. Kies woorde (druk en sleep, of dubbelklik een) om ’n woord op te soek of ’n aanhaling op WhatsApp te deel.',
    },
  };

  let lang = 'af';
  try {
    const saved = JSON.parse(localStorage.getItem('sr:settings') || '{}');
    if (saved && (saved.lang === 'en' || saved.lang === 'af')) lang = saved.lang;
  } catch { /* storage unavailable: Afrikaans */ }

  const missing = new Set();

  // Translate English text, filling in {name} placeholders. An Afrikaans
  // entry can be [singular, plural], chosen by vars.n.
  function t(key, vars) {
    let s = key;
    if (lang === 'af') {
      if (Object.prototype.hasOwnProperty.call(AF, key)) s = AF[key];
      else missing.add(key);
    }
    if (Array.isArray(s)) s = vars && vars.n === 1 ? s[0] : s[1];
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  }

  // Pick the singular or plural form, e.g. plural(2, '{n} book', '{n} books').
  const plural = (n, one, many, vars) => t(n === 1 ? one : many, { n, ...vars });

  const ATTRS = [['title', 'i18nTitle'], ['aria-label', 'i18nAria'], ['placeholder', 'i18nPlaceholder']];

  // Translate everything tagged in the page. The English originals are kept
  // in data attributes so switching back and forth always starts from them.
  function apply(root = document) {
    document.documentElement.lang = lang;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-html]')) {
      const entry = HTML[el.dataset.i18nHtml];
      if (entry) el.innerHTML = entry[lang] || entry.en;
    }
    for (const [attr, store] of ATTRS) {
      for (const el of root.querySelectorAll(`[${attr}]`)) {
        if (!(store in el.dataset)) el.dataset[store] = el.getAttribute(attr);
        el.setAttribute(attr, t(el.dataset[store]));
      }
    }
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'af';
    apply();
  }

  return {
    t,
    plural,
    apply,
    setLang,
    get lang() { return lang; },
    // Dates and times in the chosen language.
    locale: () => (lang === 'af' ? 'af-ZA' : undefined),
    missing,
  };
})();
