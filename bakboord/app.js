// Bakboord na stuurboord: pick a start and destination on Google Maps, then
// every treadmill session moves you along the real road route.
(function () {
  'use strict';

  const VERSION = '0.2.0';
  const SA_CENTER = { lat: -29.0, lng: 24.5 };
  const STICKERS = ['🦒', '🐘', '🦓', '🐧', '🐋', '🦁', '🦏', '🐆', '🌺', '⛰️', '🌊', '🌵'];
  const CHEERS = ['Lekker!', 'Mooi so!', 'Hou aan!', 'Sterk, hoor!', 'Wonderlik!', 'Yebo!'];
  const COLORS = { ink: '#1e1b3a', mint: '#12b5a6', coral: '#ff6b6b', sun: '#ffc93c', grape: '#7b5cff' };
  const MAP_STYLE = [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#8fd8f7' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef8e4' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e2f3d2' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#ffe08a' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#f2c04a' }] },
    { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#3b3561' }] },
    { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#7b5cff' }, { weight: 1.5 }] },
  ];

  const store = BakboordStore.makeStore(safeStorage());
  const $ = sel => document.querySelector(sel);
  const panel = $('#panel');
  const sheet = $('#sheet');

  let gmap = null;
  let mapsReady = false;
  let mapProblem = '';        // shown on every screen until fixed
  let overlays = [];
  let view = { name: 'home' };
  let draft = null;
  let tickTimer = null;

  // ---------- helpers ----------
  function safeStorage() {
    try { const s = window.localStorage; s.setItem('bakboord.test', '1'); s.removeItem('bakboord.test'); return s; }
    catch (e) { return null; }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const fmtInt = n => Math.round(n).toLocaleString('en-ZA');
  const fmtKm = m => { const km = m / 1000; return (km < 10 ? km.toFixed(1) : fmtInt(km)) + ' km'; };
  const fmtDate = ms => new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  }
  function fmtDuration(ms) {
    if (!ms) return '';
    const min = Math.max(1, Math.round(ms / 60000));
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3000);
  }
  function hint(msg) { const h = $('#map-hint'); h.textContent = msg || ''; h.hidden = !msg; }

  function confetti() {
    const box = $('#confetti');
    const colors = [COLORS.sun, COLORS.coral, COLORS.mint, COLORS.grape, '#4cc9f0'];
    box.innerHTML = '';
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
      p.style.animationDelay = (Math.random() * 0.4) + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(p);
    }
    setTimeout(() => { box.innerHTML = ''; }, 3800);
  }

  function openModal(html, bind) {
    const m = $('#modal'), c = $('#modal-card');
    c.innerHTML = html; m.hidden = false;
    m.onclick = e => { if (e.target === m) closeModal(); };
    if (bind) bind(c);
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }
  function confirmBox(title, text, okLabel, onOk) {
    openModal(`<h2>${esc(title)}</h2><p class="center soft">${esc(text)}</p>
      <div class="row mt"><button class="btn" data-a="no">Cancel</button>
      <button class="btn btn-coral" data-a="yes">${esc(okLabel)}</button></div>`, c => {
      c.querySelector('[data-a=no]').onclick = closeModal;
      c.querySelector('[data-a=yes]').onclick = () => { closeModal(); onOk(); };
    });
  }

  function apiKey() {
    const fromConfig = (window.BAKBOORD_CONFIG && window.BAKBOORD_CONFIG.googleMapsApiKey || '').trim();
    return fromConfig || (store.state.settings.apiKey || '').trim();
  }

  // ---------- player totals ----------
  function totals() {
    const sessions = store.state.journeys.flatMap(j => j.sessions);
    const steps = sessions.reduce((s, x) => s + x.steps, 0);
    const postcards = store.state.journeys.reduce((s, j) =>
      s + Math.floor(store.progress(j).doneMeters / store.MILESTONE_M) + (j.status === 'completed' ? 1 : 0), 0);
    const days = new Set(sessions.map(s => new Date(s.date).toDateString()));
    let streak = 0;
    const d = new Date();
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet: count from yesterday
    while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    return { steps, postcards, streak };
  }

  // ---------- Google Maps ----------
  function loadGoogle(key) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.Map) return resolve();
      window.__bakboordMapsReady = () => resolve();
      window.gm_authFailure = () => {
        setProblem('Google said no to the API key. Check that the key is right, billing is on, the Maps JavaScript API is enabled, and the key allows ' + location.origin + '/*.');
      };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&v=weekly&libraries=places&loading=async&callback=__bakboordMapsReady';
      s.async = true;
      s.onerror = () => reject(new Error('Google Maps didn’t load. Check your internet connection and try again.'));
      document.head.appendChild(s);
    });
  }

  function setProblem(msg) { mapProblem = msg; render(); }

  function initMap() {
    gmap = new google.maps.Map($('#map'), {
      center: SA_CENTER, zoom: 5, styles: MAP_STYLE,
      disableDefaultUI: true, clickableIcons: false, gestureHandling: 'greedy',
      keyboardShortcuts: false,
    });
    gmap.addListener('click', e => { if (view.name === 'new') pickFromMap(e.latLng); });
    mapsReady = true;
  }

  function svgIcon(svg, size) {
    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(size / 2, size / 2),
    };
  }
  function pinIcon(letter, color) {
    return svgIcon(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="23" r="17" fill="${COLORS.ink}"/><circle cx="22" cy="20" r="17" fill="${color}" stroke="${COLORS.ink}" stroke-width="3"/>
      <text x="22" y="27" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`, 44);
  }
  function walkerIcon() {
    return svgIcon(`<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="31" r="22" fill="${COLORS.ink}"/><circle cx="28" cy="27" r="22" fill="${COLORS.sun}" stroke="${COLORS.ink}" stroke-width="3"/>
      <text x="28" y="37" font-size="26" text-anchor="middle">🚶</text></svg>`, 56);
  }

  function clearOverlays() { overlays.forEach(o => o.setMap(null)); overlays = []; }
  function add(o) { overlays.push(o); return o; }
  function marker(position, icn, z) { return add(new google.maps.Marker({ map: gmap, position, icon: icn, zIndex: z || 1 })); }
  function line(path, color, weight, z) { return add(new google.maps.Polyline({ map: gmap, path, strokeColor: color, strokeOpacity: 1, strokeWeight: weight, zIndex: z || 1 })); }
  function dotted(path, color) {
    return add(new google.maps.Polyline({
      map: gmap, path, strokeOpacity: 0, zIndex: 2,
      icons: [{ icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: COLORS.ink, strokeWeight: 1.5, scale: 3.2 }, offset: '0', repeat: '16px' }],
    }));
  }

  function drawJourney(j, fit) {
    if (!mapsReady) return;
    clearOverlays();
    const path = Geo.decodePolyline(j.polyline);
    const pr = store.progress(j);
    const parts = Geo.splitAt(path, pr.fraction);
    dotted(parts.todo, COLORS.grape);
    if (parts.done.length > 1) { line(parts.done, COLORS.ink, 10, 3); line(parts.done, COLORS.coral, 6, 4); }
    marker(path[0], pinIcon('A', COLORS.mint), 5);
    marker(path[path.length - 1], pinIcon('B', COLORS.coral), 5);
    if (pr.fraction > 0 && pr.fraction < 1) marker(parts.point, walkerIcon(), 10);
    if (fit) fitPath(path);
  }

  function fitPath(path) {
    const b = new google.maps.LatLngBounds();
    path.forEach(p => b.extend(p));
    const bottom = Math.min(window.innerHeight * 0.65, sheet.getBoundingClientRect().height + 50);
    gmap.fitBounds(b, { top: 90, left: 40, right: 70, bottom });
  }

  async function computeRoute(origin, destination) {
    let routesError = '';
    try {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey(),
          'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
          destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
          travelMode: 'DRIVE',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const r = data.routes && data.routes[0];
        if (!r) throw Object.assign(new Error('There’s no road between those two places. Try spots on the same piece of land.'), { final: true });
        return { distanceMeters: r.distanceMeters, polyline: r.polyline.encodedPolyline };
      }
      routesError = (data.error && data.error.message) || ('HTTP ' + res.status);
    } catch (e) {
      if (e.final) throw e;
      routesError = e.message;
    }
    try {
      const result = await new google.maps.DirectionsService().route({ origin, destination, travelMode: 'DRIVING' });
      const r = result.routes[0];
      return {
        distanceMeters: r.legs.reduce((s, l) => s + l.distance.value, 0),
        polyline: typeof r.overview_polyline === 'string' ? r.overview_polyline : r.overview_polyline.points,
      };
    } catch (e) {
      if (e && e.code === 'ZERO_RESULTS') throw new Error('There’s no road between those two places.');
      throw new Error('Google couldn’t draw the route. Turn on the Routes API for your key in Google Cloud, then try again. (' + routesError + ')');
    }
  }

  async function nameForPoint(p) {
    const fallback = 'Pin at ' + p.lat.toFixed(2) + ', ' + p.lng.toFixed(2);
    try {
      const { results } = await new google.maps.Geocoder().geocode({ location: p });
      const best = results.find(r => r.types.includes('locality')) || results[0];
      if (!best) return fallback;
      const town = best.address_components.find(c => c.types.includes('locality') || c.types.includes('sublocality'));
      return town ? town.long_name : best.formatted_address;
    } catch (e) { return fallback; }
  }

  // ---------- views ----------
  function go(name, extra) {
    view = Object.assign({ name }, extra || {});
    sheet.classList.remove('collapsed');
    hint('');
    render();
    panel.scrollTop = 0;
  }

  function render() {
    stopTick();
    $('#hud-settings').hidden = view.name === 'settings' || !apiKey();
    $('#hud-layers').hidden = !mapsReady;
    if (!apiKey()) return renderSetup();
    if (view.name === 'new') renderNew();
    else if (view.name === 'journey') renderJourney();
    else if (view.name === 'settings') renderSettings();
    else renderHome();
    if (mapProblem) panel.insertAdjacentHTML('afterbegin', `<div class="note bad"><b>Map problem:</b> ${esc(mapProblem)}</div>`);
  }

  function badge(j) {
    const label = { active: 'Walking', paused: 'Paused', completed: 'Done!', abandoned: 'Stopped' }[j.status];
    return `<span class="badge badge-${j.status}">${label}</span>`;
  }

  function track(pr, moving) {
    const pct = (pr.fraction * 100).toFixed(1);
    return `<div class="track ${moving ? '' : 'still'}"><div class="rail"><div class="fill" style="width:${pct}%"></div></div>
      ${pr.fraction < 1 ? `<span class="walker" style="left:max(14px, ${pct}%)">🚶</span><span class="flag">🏁</span>` : '<span class="flag">🏆</span>'}</div>`;
  }

  function renderSetup() {
    panel.innerHTML = `
      <div class="center"><div style="font-size:56px">🗺️</div><h1 style="margin:4px 0">Welkom!</h1>
      <p class="soft">Walk or run anywhere, one treadmill step at a time.</p></div>
      <label for="key">Your Google Maps API key</label>
      <input id="key" type="password" autocomplete="off" placeholder="AIza…" />
      <p class="small soft mt">It's saved on this phone only.</p>
      <button class="btn btn-sun btn-big mt" id="save">Let's go! ${icon('play')}</button>`;
    $('#save').onclick = () => {
      const k = $('#key').value.trim();
      if (!k) return toast('Paste your API key first.');
      store.setSettings({ apiKey: k });
      start();
    };
  }

  function renderHome() {
    const js = store.state.journeys;
    const current = js.filter(j => j.status === 'active' || j.status === 'paused');
    const past = js.filter(j => j.status === 'completed' || j.status === 'abandoned');
    const t = totals();
    const tile = j => {
      const pr = store.progress(j);
      return `<button class="tile ${j.status === 'active' ? 'active' : ''}" data-open="${j.id}">
        <div class="name">${esc(j.name)} ${badge(j)}</div>
        ${track(pr, false)}
        <div class="meta">${j.status === 'paused' ? 'Paused at ' : ''}${fmtKm(pr.doneMeters)} of ${fmtKm(pr.totalMeters)}</div>
      </button>`;
    };
    panel.innerHTML = `
      <div class="trophies">
        <div class="trophy"><span class="num">🔥 ${t.streak}</span><span>day streak</span></div>
        <div class="trophy"><span class="num">${t.steps >= 100000 ? fmtInt(t.steps / 1000) + 'k' : fmtInt(t.steps)}</span><span>steps</span></div>
        <div class="trophy"><span class="num">📮 ${t.postcards}</span><span>postcards</span></div>
      </div>
      <button class="btn btn-sun btn-big" id="new">${icon('plus')} New journey</button>
      ${current.length ? `<h2>Your journeys <span class="count">${current.length}</span></h2>${current.map(tile).join('')}` :
        `<p class="center soft mt">Pick any start and finish on the map,<br>then walk it on your treadmill.</p>`}
      ${past.length ? `<h2>Trophy room</h2>${past.map(tile).join('')}` : ''}
      <footer>Bakboord na stuurboord · v${VERSION}</footer>`;
    $('#new').onclick = () => { draft = { origin: null, destination: null, route: null, name: '' }; go('new'); };
    panel.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => go('journey', { id: b.dataset.open }); });
    const active = js.find(j => j.status === 'active') || current[0];
    if (mapsReady) {
      if (active) drawJourney(active, true);
      else { clearOverlays(); gmap.setCenter(SA_CENTER); gmap.setZoom(5); }
    }
  }

  // ----- planning a new journey -----
  function renderNew() {
    const d = draft;
    const est = d.route ? store.estimate(d.route.distanceMeters) : null;
    const stop = (which, letter, label) => `
      <div class="stop ${letter.toLowerCase()}"><div class="pinbadge">${letter}</div><div class="body">
        <div class="label">${label}</div>
        ${d[which] ? `<div class="picked">${esc(d[which].label)}</div>` : ''}
        <div class="search" id="slot-${which}"></div>
        ${!d[which] && !mapsReady ? '<div class="picked empty">Tap the map</div>' : ''}
      </div></div>`;
    panel.innerHTML = `
      <div class="head"><button class="icon-btn" id="back" aria-label="Back">${icon('back')}</button>
        <h1>New journey<span class="sub">Search, or tap two spots on the map</span></h1></div>
      ${stop('origin', 'A', 'Start')}
      ${stop('destination', 'B', 'Finish')}
      ${d.origin || d.destination ? `<div class="row">
        <button class="btn btn-ghost" id="swap" ${d.origin && d.destination ? '' : 'disabled'}>${icon('swap')} Swap</button>
        <button class="btn btn-ghost" id="clear">${icon('x')} Start over</button></div>` : ''}
      ${d.loading ? '<div class="loading"><span class="spinner"></span> Drawing your route…</div>' : ''}
      ${d.error ? `<div class="note bad">${esc(d.error)}</div>` : ''}
      ${est ? `
        <div class="bubbles">
          <div class="bubble"><span class="num">${fmtKm(d.route.distanceMeters)}</span><span>by road</span></div>
          <div class="bubble"><span class="num">${est.walkKm < 10 ? est.walkKm.toFixed(1) : fmtInt(est.walkKm)} km</span><span>on your treadmill</span></div>
          <div class="bubble"><span class="num">${fmtInt(est.steps)}</span><span>steps</span></div>
          <div class="bubble"><span class="num">~${fmtInt(est.sessions)}</span><span>workouts</span></div>
        </div>
        <label for="jname">Name your journey</label>
        <input id="jname" type="text" value="${esc(d.name || (d.origin.label + ' → ' + d.destination.label))}" />
        <button class="btn btn-sun btn-big mt" id="go">Let's go! ${icon('play')}</button>` : ''}`;
    $('#back').onclick = () => go('home');
    const sw = $('#swap'); if (sw) sw.onclick = () => { [d.origin, d.destination] = [d.destination, d.origin]; d.name = ''; planRoute(); };
    const cl = $('#clear'); if (cl) cl.onclick = () => { draft = { origin: null, destination: null, route: null, name: '' }; renderNew(); };
    if (est) {
      $('#jname').oninput = e => { d.name = e.target.value; };
      $('#go').onclick = () => {
        const j = store.createJourney({
          name: ($('#jname').value || '').trim() || d.origin.label + ' → ' + d.destination.label,
          origin: d.origin, destination: d.destination,
          distanceMeters: d.route.distanceMeters, polyline: d.route.polyline,
        });
        draft = null;
        confetti();
        toast(cheer() + ' Your journey has started.');
        go('journey', { id: j.id });
      };
    }
    mountSearch('origin');
    mountSearch('destination');
    if (mapsReady && !d.loading) {
      if (!d.origin) hint('👆 Tap the map for your start');
      else if (!d.destination) hint('👆 Now tap your finish');
      else hint('');
    }
    drawDraft();
  }

  async function mountSearch(which) {
    const slot = $('#slot-' + which);
    if (!slot || !mapsReady) return;
    try {
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      const el = new PlaceAutocompleteElement({ includedRegionCodes: ['za'] });
      el.setAttribute('placeholder', draft[which] ? 'Change…' : (which === 'origin' ? 'Search for your start' : 'Search for your finish'));
      const handle = async place => {
        try {
          await place.fetchFields({ fields: ['displayName', 'location'] });
          draft[which] = { lat: place.location.lat(), lng: place.location.lng(), label: place.displayName || 'Chosen place' };
          draft.name = '';
          planRoute();
        } catch (e) { toast('Search isn’t working. Tap the map instead.'); }
      };
      el.addEventListener('gmp-select', e => { if (e.placePrediction) handle(e.placePrediction.toPlace()); });
      el.addEventListener('gmp-placeselect', e => { if (e.place) handle(e.place); }); // older event name
      if (slot.isConnected) { slot.innerHTML = ''; slot.appendChild(el); }
    } catch (e) {
      if (slot.isConnected) slot.innerHTML = '<div class="picked empty">Tap the map (search needs the Places API)</div>';
    }
  }

  async function pickFromMap(latLng) {
    if (draft.loading) return;
    const p = { lat: latLng.lat(), lng: latLng.lng() };
    const which = !draft.origin ? 'origin' : 'destination';
    draft[which] = Object.assign(p, { label: 'Finding the name…' });
    draft.name = '';
    hint('');
    renderNew();
    draft[which].label = await nameForPoint(p);
    planRoute();
  }

  async function planRoute() {
    const d = draft;
    d.route = null; d.error = '';
    if (!(d.origin && d.destination)) return renderNew();
    d.loading = true; renderNew();
    try { d.route = await computeRoute(d.origin, d.destination); }
    catch (e) { d.error = e.message; }
    d.loading = false;
    if (view.name === 'new' && draft === d) renderNew();
  }

  function drawDraft() {
    if (!mapsReady) return;
    clearOverlays();
    const d = draft;
    if (d.route) {
      const path = Geo.decodePolyline(d.route.polyline);
      line(path, COLORS.ink, 10, 1); line(path, COLORS.grape, 6, 2);
      fitPath(path);
    }
    if (d.origin) marker(d.origin, pinIcon('A', COLORS.mint), 5);
    if (d.destination) marker(d.destination, pinIcon('B', COLORS.coral), 5);
    if (!d.route && d.origin && !d.destination) gmap.panTo(d.origin);
  }

  // ----- one journey -----
  const RING_C = 2 * Math.PI * 88;
  function ringOffset(ms) { return RING_C * (1 - (ms % 60000) / 60000); }

  function renderJourney() {
    const j = store.journey(view.id);
    if (!j) return go('home');
    const pr = store.progress(j);
    const w = store.state.workout;
    const mine = w && w.journeyId === j.id;
    const other = w && !mine ? store.journey(w.journeyId) : null;
    const open = j.status === 'active' || j.status === 'paused';
    const toNext = store.stepsForMapMeters(pr.nextMilestoneMeters - pr.doneMeters, j);
    const reached = Math.floor(pr.doneMeters / store.MILESTONE_M);

    let workout = '';
    if (open && other) {
      workout = `<div class="note">A workout is running on <b>${esc(other.name)}</b>. <button class="link" id="goto-other">Go there</button></div>`;
    } else if (open && mine) {
      const running = !!w.runningSince, ms = store.workoutElapsed();
      workout = `
        <div class="ring-wrap ${running ? '' : 'paused'}">
          <svg class="ring" viewBox="0 0 210 210"><circle class="bg" cx="105" cy="105" r="88"/>
            <circle class="fg" id="ring-fg" cx="105" cy="105" r="88" stroke-dasharray="${RING_C}" stroke-dashoffset="${ringOffset(ms)}"/>
            <circle class="rim" cx="105" cy="105" r="97"/><circle class="rim" cx="105" cy="105" r="79"/></svg>
          <div class="ring-text"><div class="clock" id="timer">${fmtClock(ms)}</div>
            <div class="state">${running ? 'Keep going!' : 'Paused'}</div></div>
        </div>
        <div class="workout-btns">
          ${running ? `<button class="btn btn-grape btn-big" id="w-pause">${icon('pause')} Pause</button>`
                    : `<button class="btn btn-mint btn-big" id="w-resume">${icon('play')} Resume</button>`}
          <button class="btn btn-sun btn-big" id="w-finish">${icon('check')} Finish</button>
        </div>`;
    } else if (open) {
      workout = `<button class="btn btn-mint btn-big mt" id="w-start">${icon('play')} Start workout</button>
        <div class="center"><button class="link" id="log">Already walked? Add steps</button></div>`;
    }

    const sticker = i => `<div class="sticker"><span class="em">${STICKERS[i % STICKERS.length]}</span><span class="num">${(i + 1) * 50} km</span>${CHEERS[i % CHEERS.length]}</div>`;
    panel.innerHTML = `
      <div class="head"><button class="icon-btn" id="back" aria-label="Back">${icon('back')}</button>
        <h1>${esc(j.name)} ${badge(j)}</h1>
        <button class="icon-btn" id="rename" aria-label="Rename">${icon('edit')}</button></div>
      ${j.status === 'completed' ? `<div class="note good">🏆 <b>${cheer()}</b> You reached ${esc(j.destination.label)} on ${fmtDate(j.finishedAt)}.</div>` : ''}
      ${track(pr, mine && !!w.runningSince)}
      <div class="track-label"><span>${j.status === 'paused' ? 'Paused at ' : ''}<b>${fmtKm(pr.doneMeters)}</b> of ${fmtKm(pr.totalMeters)}</span>
        ${open ? `<span><b>${fmtInt(toNext)}</b> steps to a postcard</span>` : ''}</div>
      ${workout}
      ${open ? `<div class="row mt">
        ${j.status === 'active' ? `<button class="btn btn-ghost" id="j-pause">${icon('pause')} Pause journey</button>`
                                : `<button class="btn btn-sun" id="j-resume">${icon('play')} Resume journey</button>`}
        </div>` : ''}
      <h2>Postcards <span class="count">${reached + (j.status === 'completed' ? 1 : 0)}</span></h2>
      <div class="stickers">
        ${Array.from({ length: reached }, (_, i) => sticker(i)).join('')}
        ${j.status === 'completed' ? `<div class="sticker"><span class="em">🏆</span><span class="num">Arrived!</span>${esc(j.destination.label)}</div>`
          : `<div class="sticker locked"><span class="em">${STICKERS[reached % STICKERS.length]}</span><span class="num">${fmtInt(pr.nextMilestoneMeters / 1000)} km</span>${fmtInt(toNext)} steps</div>`}
      </div>
      <h2>Workouts <span class="count">${j.sessions.length}</span></h2>
      ${j.sessions.length ? `<ul class="sessions">${j.sessions.map(s => `<li><span class="em">👟</span><div>
          <b>${fmtInt(s.steps)} steps</b> · +${fmtKm(s.mapMeters)}
          <div class="small soft">${fmtDate(s.date)} · ${s.walkedKm.toFixed(1)} km walked${s.durationMs ? ' · ' + fmtDuration(s.durationMs) : ''}</div></div>
          <button class="del" data-del="${s.id}" aria-label="Delete workout">${icon('x')}</button></li>`).join('')}</ul>`
        : '<p class="soft small">No workouts yet. Your first one moves the walker!</p>'}
      <div class="center mt">${open ? '<button class="link" id="j-stop">Stop this journey</button>' : '<button class="link" id="j-delete">Delete from trophy room</button>'}</div>`;

    $('#back').onclick = () => go('home');
    $('#rename').onclick = () => openModal(`<h2>Rename</h2><input id="nn" type="text" value="${esc(j.name)}" />
      <div class="row mt"><button class="btn" id="c">Cancel</button><button class="btn btn-sun" id="ok">Save</button></div>`, c => {
      c.querySelector('#c').onclick = closeModal;
      c.querySelector('#ok').onclick = () => { store.renameJourney(j.id, c.querySelector('#nn').value); closeModal(); render(); };
    });
    const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    on('goto-other', () => go('journey', { id: other.id }));
    on('w-start', () => { store.startWorkout(j.id); render(); });
    on('w-pause', () => { store.pauseWorkout(); render(); });
    on('w-resume', () => { store.resumeWorkout(); render(); });
    on('w-finish', () => { store.pauseWorkout(); render(); askSteps(j, store.workoutElapsed(), true); });
    on('log', () => askSteps(j, 0, false));
    on('j-pause', () => { store.pauseJourney(j.id); toast('Paused. Your spot is saved.'); render(); });
    on('j-resume', () => { store.resumeJourney(j.id); toast('Welcome back! ' + cheer()); render(); });
    on('j-stop', () => confirmBox('Stop this journey?', 'It goes to your trophy room with the distance you covered.', 'Stop', () => { store.abandonJourney(j.id); render(); }));
    on('j-delete', () => confirmBox('Delete this journey?', 'It and its workouts are removed from this phone.', 'Delete', () => { store.deleteJourney(j.id); go('home'); }));
    panel.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => confirmBox('Delete this workout?', 'Your walker moves back by its distance.', 'Delete', () => { store.deleteSession(j.id, b.dataset.del); render(); });
    });

    drawJourney(j, !view.fitted);
    view.fitted = true;
    if (mine && w.runningSince) startTick();
  }

  function askSteps(j, durationMs, fromWorkout) {
    let unit = 'steps';
    openModal(`<div class="center" style="font-size:44px">${fromWorkout ? '💪' : '👟'}</div>
      <h2>${fromWorkout ? 'Workout done!' : 'Add a workout'}</h2>
      ${fromWorkout ? `<p class="center soft">You went for <b style="color:var(--ink)">${fmtClock(durationMs)}</b>. What does your Garmin say?</p>` : '<p class="center soft">What does your Garmin say?</p>'}
      <div class="seg"><button class="on" data-u="steps">Steps</button><button data-u="km">Kilometres</button></div>
      <input id="amt" class="amount" type="number" inputmode="decimal" min="0" step="any" placeholder="0" />
      <button class="btn btn-sun btn-big mt" id="ok">${icon('check')} Move my walker</button>
      <div class="row mt"><button class="btn btn-ghost" id="c">${fromWorkout ? 'Not yet' : 'Cancel'}</button>
        ${fromWorkout ? '<button class="btn btn-ghost" id="discard">Throw away</button>' : ''}</div>`, c => {
      const input = c.querySelector('#amt');
      setTimeout(() => input.focus(), 50);
      c.querySelectorAll('[data-u]').forEach(b => {
        b.onclick = () => {
          unit = b.dataset.u;
          c.querySelectorAll('[data-u]').forEach(x => x.classList.toggle('on', x === b));
          input.focus();
        };
      });
      c.querySelector('#c').onclick = closeModal;
      const discard = c.querySelector('#discard');
      if (discard) discard.onclick = () => confirmBox('Throw this workout away?', 'The timer resets and your walker stays where it is.', 'Throw away', () => { store.stopWorkout(); render(); });
      c.querySelector('#ok').onclick = () => {
        const n = parseFloat(String(input.value).replace(',', '.'));
        if (!(n > 0)) { toast('Type your ' + (unit === 'steps' ? 'steps' : 'kilometres') + ' first.'); return input.focus(); }
        let dur = durationMs;
        if (fromWorkout) dur = store.stopWorkout().durationMs;
        const r = store.logSession(j.id, unit === 'steps' ? { steps: n, durationMs: dur } : { km: n, durationMs: dur });
        closeModal();
        render();
        celebrate(store.journey(j.id), r);
      };
    });
  }

  function celebrate(j, r) {
    if (!r) return;
    const pr = store.progress(j);
    if (r.completed) {
      confetti();
      openModal(`<div class="celebrate"><span class="big-em">🏆</span><h2>${cheer()} You made it!</h2>
        <p class="soft">All the way to <b style="color:var(--ink)">${esc(j.destination.label)}</b>: ${fmtKm(j.distanceMeters)} in ${j.sessions.length} workouts.</p>
        <button class="btn btn-sun btn-big mt" id="ok">Kyk na my trofee</button></div>`, c => { c.querySelector('#ok').onclick = closeModal; });
    } else if (r.milestones.length) {
      confetti();
      const km = r.milestones[r.milestones.length - 1] / 1000;
      const em = STICKERS[(km / 50 - 1) % STICKERS.length];
      openModal(`<div class="celebrate"><span class="big-em">${em}</span><h2>New postcard!</h2>
        <p class="soft">${cheer()} You're <b style="color:var(--ink)">${fmtInt(km)} km</b> along the way to ${esc(j.destination.label)}. ${fmtKm(pr.totalMeters - pr.doneMeters)} to go.</p>
        <button class="btn btn-sun btn-big mt" id="ok">Hou aan!</button></div>`, c => { c.querySelector('#ok').onclick = closeModal; });
    } else {
      toast(cheer() + ' +' + fmtKm(r.session.mapMeters));
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      const t = $('#timer');
      if (!t) return stopTick();
      const ms = store.workoutElapsed();
      t.textContent = fmtClock(ms);
      const fg = $('#ring-fg'); if (fg) fg.setAttribute('stroke-dashoffset', ringOffset(ms));
    }, 500);
  }
  function stopTick() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; }

  // ----- settings -----
  function renderSettings() {
    const st = store.state.settings;
    const fromConfig = !!(window.BAKBOORD_CONFIG && window.BAKBOORD_CONFIG.googleMapsApiKey);
    panel.innerHTML = `
      <div class="head"><button class="icon-btn" id="back" aria-label="Back">${icon('back')}</button><h1>Settings</h1></div>
      <label for="scale">Map scale for new journeys</label>
      <select id="scale">${[1, 5, 10, 20, 50].map(n => `<option value="${n}" ${n === st.scale ? 'selected' : ''}>1 km walked = ${n} km on the map</option>`).join('')}</select>
      <label>You mostly…</label>
      <div class="seg" id="gait">
        <button data-spk="1333" class="${st.stepsPerKm === 1333 ? 'on' : ''}">🚶 Walk</button>
        <button data-spk="1000" class="${st.stepsPerKm === 1000 ? 'on' : ''}">🏃 Run</button>
      </div>
      <p class="small soft">Used for step estimates and when you add kilometres. Now: ${fmtInt(st.stepsPerKm)} steps per km.</p>
      <h2>Backup</h2>
      <p class="small soft">Journeys live on this phone. Save a backup now and then, or to move to a new phone.</p>
      <div class="row"><button class="btn" id="export">Save backup</button><button class="btn" id="import">Restore</button></div>
      <input id="file" type="file" accept="application/json,.json" hidden />
      ${fromConfig ? '' : `<h2>Google Maps key</h2>
        <input id="key" type="password" value="${esc(st.apiKey)}" />
        <button class="btn mt" id="save-k">Save key</button>`}
      <footer>Bakboord na stuurboord · v${VERSION} · made by Riëtte</footer>`;
    $('#back').onclick = () => go('home');
    $('#scale').onchange = e => { store.setSettings({ scale: parseInt(e.target.value, 10) }); toast('Saved for new journeys.'); };
    $('#gait').querySelectorAll('[data-spk]').forEach(b => {
      b.onclick = () => { store.setSettings({ stepsPerKm: parseInt(b.dataset.spk, 10) }); renderSettings(); toast('Saved.'); };
    });
    $('#export').onclick = () => {
      const blob = new Blob([store.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bakboord-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import').onclick = () => $('#file').click();
    $('#file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const text = await f.text().catch(() => null);
      if (text == null) return toast('Couldn’t read that file.');
      confirmBox('Restore this backup?', 'It replaces the journeys on this phone.', 'Restore', () => {
        try { store.importData(text); toast('Backup restored.'); go('home'); } catch (err) { toast(err.message); }
      });
    };
    const sk = $('#save-k');
    if (sk) sk.onclick = () => { store.setSettings({ apiKey: $('#key').value.trim() }); location.reload(); };
  }

  // ---------- start ----------
  $('#hud-settings').onclick = () => go('settings');
  $('#hud-layers').onclick = () => {
    if (!mapsReady) return;
    const sat = gmap.getMapTypeId && gmap.getMapTypeId() === 'hybrid';
    gmap.setMapTypeId(sat ? 'roadmap' : 'hybrid');
    toast(sat ? 'Map view' : 'Satellite view');
  };
  $('#handle').onclick = () => sheet.classList.toggle('collapsed');
  $('#logo').onclick = () => { if (view.name !== 'home') go('home'); };

  async function start() {
    render();
    const key = apiKey();
    if (!key) return;
    try {
      await loadGoogle(key);
      initMap();
      render();
    } catch (e) {
      setProblem(e.message);
    }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && view.name === 'journey') render(); });
  start();
})();
