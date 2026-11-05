// Bakboord na stuurboord: pick a start and destination on Google Maps, then
// every treadmill session moves you along the real road route.
(function () {
  'use strict';

  const VERSION = '0.1.0';
  const SA_CENTER = { lat: -29.0, lng: 24.5 };
  const store = BakboordStore.makeStore(safeStorage());
  const $ = sel => document.querySelector(sel);
  const panel = $('#panel');

  let gmap = null;            // google.maps.Map
  let mapsReady = false;
  let overlays = [];          // things drawn on the map for the current view
  let view = { name: 'home' };
  let draft = null;           // the journey being planned in the "new" view
  let tickTimer = null;

  // ---------- helpers ----------
  function safeStorage() {
    try { const s = window.localStorage; s.setItem('bakboord.test', '1'); s.removeItem('bakboord.test'); return s; }
    catch (e) { return null; }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtInt = n => Math.round(n).toLocaleString('en-ZA');
  const fmtKm = m => {
    const km = m / 1000;
    return (km < 10 ? km.toFixed(1) : fmtInt(km)) + ' km';
  };
  const fmtDate = ms => new Date(ms).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  function fmtClock(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0');
  }
  function fmtDuration(ms) {
    const min = Math.round(ms / 60000);
    if (!ms) return '';
    return min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  const cheers = ['Lekker!', 'Mooi so!', 'Hou aan!', 'Sterk, hoor!', 'Wonderlik!'];
  const cheer = () => cheers[Math.floor(Math.random() * cheers.length)];

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function hint(msg) { const h = $('#map-hint'); h.textContent = msg || ''; h.hidden = !msg; }

  function openModal(html, bind) {
    const m = $('#modal'), c = $('#modal-card');
    c.innerHTML = html; m.hidden = false;
    m.onclick = e => { if (e.target === m) closeModal(); };
    if (bind) bind(c);
    const f = c.querySelector('input, button.btn-primary'); if (f) f.focus();
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-card').innerHTML = ''; }
  function confirmBox(title, text, okLabel, onOk, danger) {
    openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="btn-row"><button data-a="no">Cancel</button>
      <button data-a="yes" class="${danger ? 'btn-danger' : 'btn-primary'}">${esc(okLabel)}</button></div>`, c => {
      c.querySelector('[data-a=no]').onclick = closeModal;
      c.querySelector('[data-a=yes]').onclick = () => { closeModal(); onOk(); };
    });
  }

  function apiKey() {
    const fromConfig = (window.BAKBOORD_CONFIG && window.BAKBOORD_CONFIG.googleMapsApiKey || '').trim();
    return fromConfig || (store.state.settings.apiKey || '').trim();
  }

  // ---------- Google Maps ----------
  function loadGoogle(key) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.Map) return resolve();
      window.__bakboordMapsReady = () => resolve();
      window.gm_authFailure = () => {
        mapsReady = false;
        showMapProblem('Google refused the API key. Check that the key is correct, that the Maps JavaScript API is enabled, ' +
          'that billing is set up, and that the key’s website restriction includes ' + location.origin + '/*.');
      };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&v=weekly&libraries=places,geometry&loading=async&callback=__bakboordMapsReady';
      s.async = true;
      s.onerror = () => reject(new Error('Could not load Google Maps. Check your internet connection.'));
      document.head.appendChild(s);
    });
  }

  function initMap() {
    gmap = new google.maps.Map($('#map'), {
      center: SA_CENTER, zoom: 5,
      mapTypeControl: true,
      mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'], position: google.maps.ControlPosition.TOP_RIGHT },
      streetViewControl: false, fullscreenControl: false, clickableIcons: false,
      gestureHandling: 'greedy',
    });
    gmap.addListener('click', e => { if (view.name === 'new') pickFromMap(e.latLng); });
    mapsReady = true;
  }

  function showMapProblem(msg) {
    const box = document.createElement('div');
    box.className = 'notice error';
    box.textContent = msg;
    panel.prepend(box);
  }

  function clearOverlays() { overlays.forEach(o => o.setMap(null)); overlays = []; }

  function pin(position, label, color) {
    return new google.maps.Marker({
      map: gmap, position, label: { text: label, color: '#fff', fontWeight: '700' },
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
    });
  }

  function drawJourney(j, fit) {
    if (!mapsReady) return;
    clearOverlays();
    const path = Geo.decodePolyline(j.polyline);
    const pr = store.progress(j);
    const parts = Geo.splitAt(path, pr.fraction);
    overlays.push(new google.maps.Polyline({ map: gmap, path: parts.todo, strokeColor: '#8a7f70', strokeOpacity: 0.85, strokeWeight: 6 }));
    overlays.push(new google.maps.Polyline({ map: gmap, path: parts.done, strokeColor: '#1f7a80', strokeOpacity: 1, strokeWeight: 7 }));
    overlays.push(pin(path[0], 'A', '#1f7a80'));
    overlays.push(pin(path[path.length - 1], 'B', '#d9577a'));
    if (pr.fraction > 0 && pr.fraction < 1) {
      overlays.push(new google.maps.Marker({
        map: gmap, position: parts.point, zIndex: 10, title: 'You are here',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#c98a2b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 4 },
      }));
    }
    if (fit) fitPath(path);
  }

  function fitPath(path) {
    const b = new google.maps.LatLngBounds();
    path.forEach(p => b.extend(p));
    gmap.fitBounds(b, 40);
  }

  // Ask Google for the road route. Uses the Routes API; falls back to the
  // older Directions service on projects that still have it.
  async function computeRoute(origin, destination) {
    const key = apiKey();
    let routesError = '';
    try {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
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
        if (!r) throw Object.assign(new Error('There is no road route between these two places. Try points on the same landmass.'), { final: true });
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
      const meters = r.legs.reduce((s, l) => s + l.distance.value, 0);
      const poly = typeof r.overview_polyline === 'string' ? r.overview_polyline : r.overview_polyline.points;
      return { distanceMeters: meters, polyline: poly };
    } catch (e) {
      if (e && e.code === 'ZERO_RESULTS') throw new Error('There is no road route between these two places.');
      const err = new Error('Google couldn’t work out the route. Make sure the Routes API is enabled for your API key in Google Cloud. (' + routesError + ')');
      err.setup = true;
      throw err;
    }
  }

  async function nameForPoint(latLng) {
    const fallback = 'Pin at ' + latLng.lat.toFixed(3) + ', ' + latLng.lng.toFixed(3);
    try {
      const { results } = await new google.maps.Geocoder().geocode({ location: latLng });
      const best = results.find(r => r.types.includes('locality')) || results.find(r => r.types.includes('sublocality')) || results[0];
      if (!best) return fallback;
      const town = best.address_components.find(c => c.types.includes('locality') || c.types.includes('sublocality'));
      return town ? town.long_name : best.formatted_address;
    } catch (e) { return fallback; }
  }

  // ---------- views ----------
  function go(name, extra) {
    view = Object.assign({ name }, extra || {});
    hint('');
    render();
    window.scrollTo(0, 0);
    panel.scrollTop = 0;
  }

  function render() {
    stopTick();
    if (!apiKey()) return renderSetup();
    if (view.name === 'new') return renderNew();
    if (view.name === 'journey') return renderJourney();
    if (view.name === 'settings') return renderSettings();
    return renderHome();
  }

  function statusChip(j) {
    const label = { active: 'Active', paused: 'Paused', completed: 'Completed', abandoned: 'Stopped' }[j.status];
    return `<span class="chip chip-${j.status}">${label}</span>`;
  }

  function renderSetup() {
    panel.innerHTML = `
      <h1>Bakboord na stuurboord</h1>
      <p class="tagline">Walk or run anywhere, one treadmill step at a time.</p>
      <div class="notice">To show Google Maps, the app needs your Google Maps API key.</div>
      <label for="key">Google Maps API key</label>
      <input id="key" type="password" autocomplete="off" placeholder="AIza…" />
      <p class="small muted">The key is kept on this device only. To use it on every device,
        put it in <code>bakboord/config.js</code> instead.</p>
      <button class="btn-primary btn-big" id="save">Save and open the map</button>`;
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
    const card = j => {
      const pr = store.progress(j);
      return `<button class="card journey-card ${j.status === 'active' ? 'active' : ''}" data-open="${j.id}">
        <div class="name">${esc(j.name)} ${statusChip(j)}</div>
        <div class="bar"><span style="width:${(pr.fraction * 100).toFixed(1)}%"></span></div>
        <div class="small muted">${j.status === 'paused' ? 'Paused at ' : ''}${fmtKm(pr.doneMeters)} of ${fmtKm(pr.totalMeters)}</div>
      </button>`;
    };
    panel.innerHTML = `
      <div class="topbar"><h1>Bakboord na stuurboord</h1>
        <button class="icon-btn" id="settings" aria-label="Settings">⚙️</button></div>
      <p class="tagline">Pick any start and destination, then walk the real road route on your treadmill.</p>
      <button class="btn-primary btn-big" id="new">+ New journey</button>
      ${current.length ? `<h2>Your journeys</h2>${current.map(card).join('')}` :
        `<p class="muted" style="margin-top:18px">No journeys yet. Tap <b>New journey</b>, then choose where you start and where you’re going.</p>`}
      ${past.length ? `<h2>History</h2>${past.map(card).join('')}` : ''}
      <footer>Version ${VERSION}</footer>`;
    $('#new').onclick = () => { draft = { origin: null, destination: null, route: null, name: '' }; go('new'); };
    $('#settings').onclick = () => go('settings');
    panel.querySelectorAll('[data-open]').forEach(b => { b.onclick = () => go('journey', { id: b.dataset.open }); });
    const active = js.find(j => j.status === 'active') || current[0];
    if (mapsReady) { if (active) drawJourney(active, true); else { clearOverlays(); gmap.setCenter(SA_CENTER); gmap.setZoom(5); } }
  }

  // ----- planning a new journey -----
  function renderNew() {
    const d = draft;
    const est = d.route ? store.estimate(d.route.distanceMeters) : null;
    panel.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Back">←</button><h1>New journey</h1></div>
      <label>From</label>
      <div class="place-slot" id="slot-origin"></div>
      <div class="picked ${d.origin ? '' : 'empty'}">${d.origin ? '📍 ' + esc(d.origin.label) : 'Search, or tap the map'}</div>
      <label>To</label>
      <div class="place-slot" id="slot-destination"></div>
      <div class="picked ${d.destination ? '' : 'empty'}">${d.destination ? '🏁 ' + esc(d.destination.label) : 'Search, or tap the map'}</div>
      <div class="btn-row" style="margin-top:10px">
        <button id="swap" ${d.origin && d.destination ? '' : 'disabled'}>⇅ Swap</button>
        <button id="clear" ${d.origin || d.destination ? '' : 'disabled'}>Clear</button>
      </div>
      <div id="route-box">${d.loading ? '<p class="muted">Working out the route…</p>' : ''}
        ${d.error ? `<div class="notice error">${esc(d.error)}</div>` : ''}
        ${est ? `
          <div class="stats">
            <div class="stat"><b>${fmtKm(d.route.distanceMeters)}</b><span>route by road</span></div>
            <div class="stat"><b>${est.walkKm < 10 ? est.walkKm.toFixed(1) : fmtInt(est.walkKm)} km</b><span>you walk (${store.state.settings.scale}:1)</span></div>
            <div class="stat"><b>${fmtInt(est.steps)}</b><span>steps</span></div>
            <div class="stat"><b>~${fmtInt(est.sessions)}</b><span>sessions of ${fmtInt(est.perSession)} steps</span></div>
          </div>
          <label for="jname">Journey name</label>
          <input id="jname" type="text" value="${esc(d.name || (d.origin.label + ' → ' + d.destination.label))}" />
          <button class="btn-primary btn-big" id="go" style="margin-top:14px">Start journey</button>` : ''}
      </div>`;
    $('#back').onclick = () => go('home');
    $('#swap').onclick = () => { [d.origin, d.destination] = [d.destination, d.origin]; d.name = ''; planRoute(); };
    $('#clear').onclick = () => { draft = { origin: null, destination: null, route: null, name: '' }; renderNew(); };
    if (est) {
      $('#jname').oninput = e => { d.name = e.target.value; };
      $('#go').onclick = () => {
        const j = store.createJourney({
          name: ($('#jname').value || '').trim() || d.origin.label + ' → ' + d.destination.label,
          origin: d.origin, destination: d.destination,
          distanceMeters: d.route.distanceMeters, polyline: d.route.polyline,
        });
        draft = null;
        toast(cheer() + ' Your journey has started.');
        go('journey', { id: j.id });
      };
    }
    mountSearch('origin');
    mountSearch('destination');
    if (!d.origin) hint('Tap the map to set your start');
    else if (!d.destination) hint('Tap the map to set your destination');
    drawDraft();
  }

  async function mountSearch(which) {
    const slot = $('#slot-' + which);
    if (!slot || !mapsReady) return;
    try {
      const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
      const el = new PlaceAutocompleteElement({ includedRegionCodes: ['za'] });
      el.setAttribute('placeholder', which === 'origin' ? 'Search for a start' : 'Search for a destination');
      const handle = async place => {
        await place.fetchFields({ fields: ['displayName', 'location'] });
        const loc = place.location;
        draft[which] = { lat: loc.lat(), lng: loc.lng(), label: place.displayName || 'Chosen place' };
        draft.name = '';
        planRoute();
      };
      el.addEventListener('gmp-select', e => { if (e.placePrediction) handle(e.placePrediction.toPlace()); });
      el.addEventListener('gmp-placeselect', e => { if (e.place) handle(e.place); }); // older event name
      if (slot.isConnected) { slot.innerHTML = ''; slot.appendChild(el); }
    } catch (e) {
      slot.innerHTML = '<p class="small muted">Search isn’t available (the Places API isn’t enabled for this key). Tap the map instead.</p>';
    }
  }

  async function pickFromMap(latLng) {
    const p = { lat: latLng.lat(), lng: latLng.lng() };
    const which = !draft.origin ? 'origin' : (!draft.destination ? 'destination' : 'destination');
    draft[which] = Object.assign(p, { label: '…' });
    draft.name = '';
    hint('');
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
      overlays.push(new google.maps.Polyline({ map: gmap, path, strokeColor: '#1f7a80', strokeOpacity: 0.9, strokeWeight: 7 }));
      fitPath(path);
    }
    if (d.origin) overlays.push(pin(d.origin, 'A', '#1f7a80'));
    if (d.destination) overlays.push(pin(d.destination, 'B', '#d9577a'));
    if (!d.route && d.origin && !d.destination) gmap.panTo(d.origin);
  }

  // ----- one journey -----
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

    let workoutHtml = '';
    if (open) {
      if (other) {
        workoutHtml = `<div class="notice">A workout is running on <b>${esc(other.name)}</b>.
          <button class="link" id="goto-other">Go to it</button></div>`;
      } else if (mine) {
        const running = !!w.runningSince;
        workoutHtml = `<div class="card"><div class="small muted" style="text-align:center">${running ? 'Workout running' : 'Workout paused'}</div>
          <div class="timer ${running ? '' : 'paused'}" id="timer">${fmtClock(store.workoutElapsed())}</div>
          <div class="btn-row">
            ${running ? '<button class="btn-teal btn-big" id="w-pause">⏸ Pause</button>' : '<button class="btn-teal btn-big" id="w-resume">▶ Resume</button>'}
            <button class="btn-primary btn-big" id="w-finish">✓ Finish</button>
          </div></div>`;
      } else {
        workoutHtml = `<button class="btn-primary btn-big" id="w-start">▶ Start workout</button>
          <div style="text-align:center"><button class="link" id="log">Or log steps without the timer</button></div>`;
      }
    }

    panel.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Back">←</button>
        <h1>${esc(j.name)} ${statusChip(j)}</h1>
        <button class="icon-btn" id="rename" aria-label="Rename journey">✎</button></div>
      ${j.status === 'completed' ? `<div class="notice">🎉 ${cheer()} You reached ${esc(j.destination.label)} on ${fmtDate(j.finishedAt)}.</div>` : ''}
      <div class="bar"><span style="width:${(pr.fraction * 100).toFixed(1)}%"></span></div>
      <div class="muted">${j.status === 'paused' ? 'Paused at ' : ''}<b style="color:var(--ink)">${fmtKm(pr.doneMeters)}</b> of ${fmtKm(pr.totalMeters)} (${(pr.fraction * 100).toFixed(pr.fraction < 0.1 ? 1 : 0)}%)</div>
      ${open ? `<div class="stats">
        <div class="stat"><b>${fmtInt(pr.stepsToGo)}</b><span>steps to ${esc(j.destination.label)}</span></div>
        <div class="stat"><b>${fmtInt(toNext)}</b><span>steps to the next postcard</span></div>
      </div>` : ''}
      ${workoutHtml}
      ${open ? `<div class="btn-row" style="margin-top:12px">
        ${j.status === 'active' ? '<button id="j-pause">⏸ Pause journey</button>' : '<button class="btn-teal" id="j-resume">▶ Resume journey</button>'}
        <button class="btn-danger" id="j-stop">Stop journey</button></div>` : ''}
      <h2>Postcards</h2>
      <div class="postcards">
        <div class="postcard"><span class="big">📍</span>Set off from ${esc(j.origin.label)}</div>
        ${Array.from({ length: reached }, (_, i) => `<div class="postcard"><span class="big">${(i + 1) * 50} km</span>${['Hou aan!', 'Mooi so!', 'Lekker!'][i % 3]}</div>`).join('')}
        ${j.status === 'completed' ? `<div class="postcard"><span class="big">🏁</span>Arrived in ${esc(j.destination.label)}</div>` : ''}
      </div>
      <h2>Sessions</h2>
      ${j.sessions.length ? `<ul class="list">${j.sessions.map(s => `<li><div>
          <b>${fmtInt(s.steps)} steps</b> · ${s.walkedKm.toFixed(1)} km walked ${s.durationMs ? '· ' + fmtDuration(s.durationMs) : ''}
          <div class="small muted">${fmtDate(s.date)} · +${fmtKm(s.mapMeters)} on the map</div></div>
          <button class="x" data-del="${s.id}" aria-label="Delete session">✕</button></li>`).join('')}</ul>`
        : '<p class="muted">No sessions yet.</p>'}
      ${!open ? '<div class="btn-row" style="margin-top:18px"><button class="btn-danger" id="j-delete">Delete from history</button></div>' : ''}`;

    $('#back').onclick = () => go('home');
    $('#rename').onclick = () => openModal(`<h2>Rename journey</h2><input id="nn" type="text" value="${esc(j.name)}" />
      <div class="btn-row" style="margin-top:14px"><button id="c">Cancel</button><button class="btn-primary" id="ok">Save</button></div>`, c => {
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
    on('j-pause', () => { store.pauseJourney(j.id); toast('Journey paused. Your spot is saved.'); render(); });
    on('j-resume', () => { store.resumeJourney(j.id); toast('Welcome back! Carry on from where you stopped.'); render(); });
    on('j-stop', () => confirmBox('Stop this journey?', 'It moves to your history with the distance you covered. This can’t be undone.', 'Stop journey', () => { store.abandonJourney(j.id); render(); }, true));
    on('j-delete', () => confirmBox('Delete this journey?', 'It and its sessions are removed from this device.', 'Delete', () => { store.deleteJourney(j.id); go('home'); }, true));
    panel.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => confirmBox('Delete this session?', 'Your marker moves back by this session’s distance.', 'Delete', () => { store.deleteSession(j.id, b.dataset.del); render(); }, true);
    });

    drawJourney(j, !view.fitted);
    view.fitted = true;
    if (mine && w.runningSince) startTick();
  }

  function askSteps(j, durationMs, fromWorkout) {
    let unit = 'steps';
    openModal(`<h2>${fromWorkout ? 'Workout done! ' + cheer() : 'Log a session'}</h2>
      ${fromWorkout ? `<p class="muted">Time: <b style="color:var(--ink)">${fmtClock(durationMs)}</b>. Now check your Garmin.</p>` : ''}
      <div class="seg"><button class="on" data-u="steps">Steps</button><button data-u="km">Kilometres</button></div>
      <input id="amt" type="number" inputmode="decimal" min="0" step="any" placeholder="Steps from your Garmin" />
      <div class="btn-row" style="margin-top:14px">
        <button id="c">${fromWorkout ? 'Keep timer paused' : 'Cancel'}</button>
        <button class="btn-primary" id="ok">Add to journey</button></div>
      ${fromWorkout ? '<div style="text-align:center"><button class="link" id="discard">Throw this workout away</button></div>' : ''}`, c => {
      const input = c.querySelector('#amt');
      c.querySelectorAll('[data-u]').forEach(b => {
        b.onclick = () => {
          unit = b.dataset.u;
          c.querySelectorAll('[data-u]').forEach(x => x.classList.toggle('on', x === b));
          input.placeholder = unit === 'steps' ? 'Steps from your Garmin' : 'Kilometres from your Garmin';
          input.focus();
        };
      });
      c.querySelector('#c').onclick = closeModal;
      const discard = c.querySelector('#discard');
      if (discard) discard.onclick = () => confirmBox('Throw this workout away?', 'The timer resets and nothing is added to your journey.', 'Throw away', () => { store.stopWorkout(); render(); }, true);
      c.querySelector('#ok').onclick = () => {
        const n = parseFloat(String(input.value).replace(',', '.'));
        if (!(n > 0)) { toast('Type how many ' + (unit === 'steps' ? 'steps' : 'kilometres') + ' you did.'); return input.focus(); }
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
      openModal(`<div class="celebrate"><div class="emoji">🏁</div><h2>${cheer()} You made it!</h2>
        <p>You walked all the way to <b>${esc(j.destination.label)}</b>: ${fmtKm(j.distanceMeters)} on the map, in ${j.sessions.length} sessions.</p>
        <button class="btn-primary btn-big" id="ok">Kyk na my reis</button></div>`, c => { c.querySelector('#ok').onclick = closeModal; });
    } else if (r.milestones.length) {
      const km = r.milestones[r.milestones.length - 1] / 1000;
      openModal(`<div class="celebrate"><div class="emoji">📮</div><h2>New postcard: ${fmtInt(km)} km!</h2>
        <p>${cheer()} You're ${fmtInt(km)} km along the way to <b>${esc(j.destination.label)}</b>.
        ${fmtKm(pr.totalMeters - pr.doneMeters)} to go.</p>
        <button class="btn-primary btn-big" id="ok">Hou aan!</button></div>`, c => { c.querySelector('#ok').onclick = closeModal; });
    } else {
      toast(cheer() + ' +' + fmtKm(r.session.mapMeters) + ' on the map.');
    }
  }

  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      const t = $('#timer');
      if (!t) return stopTick();
      t.textContent = fmtClock(store.workoutElapsed());
    }, 500);
  }
  function stopTick() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; }

  // ----- settings -----
  function renderSettings() {
    const st = store.state.settings;
    const fromConfig = !!(window.BAKBOORD_CONFIG && window.BAKBOORD_CONFIG.googleMapsApiKey);
    panel.innerHTML = `
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Back">←</button><h1>Settings</h1></div>
      <label for="scale">Map scale for new journeys</label>
      <select id="scale">${[1, 5, 10, 20, 50].map(n => `<option value="${n}" ${n === st.scale ? 'selected' : ''}>${n}:1 — 1 km walked = ${n} km on the map</option>`).join('')}</select>
      <label for="spk">Steps per kilometre</label>
      <input id="spk" type="number" min="500" max="3000" value="${st.stepsPerKm}" />
      <p class="small muted">About 1,333 for walking (75 cm stride), about 1,000 for running. Used when you log kilometres and for estimates.</p>
      <button class="btn-primary" id="save-s">Save</button>
      <h2>Back up your journeys</h2>
      <p class="small muted">Your journeys are kept in this browser. Download a backup now and then, or to move them to another device.</p>
      <div class="btn-row"><button id="export">Download backup</button><button id="import">Restore from backup</button></div>
      <input id="file" type="file" accept="application/json,.json" hidden />
      <h2>Google Maps key</h2>
      ${fromConfig ? '<p class="small muted">The key is set in <code>config.js</code>.</p>' :
        `<input id="key" type="password" value="${esc(st.apiKey)}" />
         <div class="btn-row" style="margin-top:10px"><button id="save-k">Save key</button></div>`}
      <footer>Bakboord na stuurboord · version ${VERSION} · made by Riëtte</footer>`;
    $('#back').onclick = () => go('home');
    $('#save-s').onclick = () => {
      const spk = parseInt($('#spk').value, 10);
      store.setSettings({ scale: parseInt($('#scale').value, 10), stepsPerKm: spk >= 500 && spk <= 3000 ? spk : 1333 });
      toast('Saved. New journeys use these settings.');
    };
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
      try {
        const text = await f.text();
        confirmBox('Restore this backup?', 'It replaces the journeys on this device.', 'Restore', () => {
          try { store.importData(text); toast('Backup restored.'); go('home'); } catch (err) { toast(err.message); }
        }, true);
      } catch (err) { toast('Could not read that file.'); }
    };
    const sk = $('#save-k');
    if (sk) sk.onclick = () => { store.setSettings({ apiKey: $('#key').value.trim() }); location.reload(); };
  }

  // ---------- start ----------
  async function start() {
    const key = apiKey();
    render();
    if (!key) return;
    try {
      await loadGoogle(key);
      initMap();
      render();
    } catch (e) {
      showMapProblem(e.message);
    }
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && view.name === 'journey') render(); });
  start();
})();
