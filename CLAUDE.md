# Notes for working on this site

## Publishing

Riëtte's standing instruction: **always push finished changes straight to `main`** (no pull
requests). Run the checks first, then push to `main` so the change goes live on GitHub Pages.

## Bakboord na stuurboord (`/bakboord/`)

Product decisions from Riëtte, to follow in every change:

- **Mobile phones only.** Design and test at phone size (about 390 × 844). There is no desktop
  layout; on a wide screen the app just shows as a phone-width column.
- **Treadmill walking or running only.** No GPS, location tracking or outdoor-run features. Distance
  always comes from the steps or km the user types in from their Garmin.
- **No predefined route.** The user picks the start and destination of every journey on the map.
- **Google Maps** (Maps JavaScript API, Places API (New), Routes API), not OpenStreetMap.
- Several journeys can be paused at once; only one is active. Pause also stops the workout timer.

Product concept doc: https://claude.ai/artifact/XdUp8RYwuRPVVnqGfhETEE
