// Journeys, sessions and the workout timer for Bakboord na stuurboord.
// Everything is saved in this browser (localStorage). No Google code here.
(function (root) {
  'use strict';

  const KEY = 'bakboord.v1';
  const MILESTONE_M = 50000; // a postcard every 50 map km
  const DEFAULT_STEPS_PER_SESSION = 5000;

  function blank() {
    return {
      journeys: [],
      settings: { scale: 10, stepsPerKm: 1333, apiKey: '' },
      workout: null, // { journeyId, elapsedMs, runningSince (ms or null) }
    };
  }

  function makeStore(storage, now) {
    now = now || (() => Date.now());
    let state = blank();
    try {
      const raw = storage && storage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state = Object.assign(blank(), saved);
        state.settings = Object.assign(blank().settings, saved.settings || {});
      }
    } catch (e) { /* unreadable or blocked storage: start fresh */ }

    function save() {
      try { storage && storage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
    }

    const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 7);
    const get = id => state.journeys.find(j => j.id === id) || null;

    function doneMeters(j) { return j.sessions.reduce((s, x) => s + x.mapMeters, 0); }

    function progress(j) {
      const done = Math.min(doneMeters(j), j.distanceMeters);
      return {
        doneMeters: done,
        totalMeters: j.distanceMeters,
        fraction: j.distanceMeters ? done / j.distanceMeters : 0,
        stepsToGo: stepsForMapMeters(j.distanceMeters - done, j),
        nextMilestoneMeters: Math.min(j.distanceMeters, (Math.floor(done / MILESTONE_M) + 1) * MILESTONE_M),
      };
    }

    function stepsForMapMeters(m, j) {
      const scale = (j && j.scale) || state.settings.scale;
      const spk = (j && j.stepsPerKm) || state.settings.stepsPerKm;
      return Math.ceil((m / 1000 / scale) * spk);
    }

    function averageSessionSteps() {
      const all = state.journeys.flatMap(j => j.sessions).filter(s => s.steps > 0);
      if (!all.length) return DEFAULT_STEPS_PER_SESSION;
      return Math.round(all.reduce((s, x) => s + x.steps, 0) / all.length);
    }

    function estimate(distanceMeters) {
      const steps = stepsForMapMeters(distanceMeters);
      const perSession = averageSessionSteps();
      return {
        walkKm: distanceMeters / 1000 / state.settings.scale,
        steps,
        perSession,
        sessions: Math.max(1, Math.ceil(steps / perSession)),
      };
    }

    function pauseOthers(exceptId) {
      for (const j of state.journeys) {
        if (j.id !== exceptId && j.status === 'active') { j.status = 'paused'; j.pausedAt = now(); }
      }
      if (state.workout && state.workout.journeyId !== exceptId) pauseWorkout();
    }

    function createJourney({ name, origin, destination, distanceMeters, polyline }) {
      const j = {
        id: uid(), name, origin, destination, distanceMeters, polyline,
        scale: state.settings.scale, stepsPerKm: state.settings.stepsPerKm,
        status: 'active', createdAt: now(), pausedAt: null, finishedAt: null,
        sessions: [],
      };
      pauseOthers(j.id);
      state.journeys.unshift(j);
      save();
      return j;
    }

    function pauseJourney(id) {
      const j = get(id);
      if (!j || j.status !== 'active') return j;
      if (state.workout && state.workout.journeyId === id) pauseWorkout();
      j.status = 'paused'; j.pausedAt = now();
      save();
      return j;
    }

    function resumeJourney(id) {
      const j = get(id);
      if (!j || j.status !== 'paused') return j;
      pauseOthers(id);
      j.status = 'active'; j.pausedAt = null;
      save();
      return j;
    }

    function abandonJourney(id) {
      const j = get(id);
      if (!j) return j;
      if (state.workout && state.workout.journeyId === id) state.workout = null;
      j.status = 'abandoned'; j.finishedAt = now();
      save();
      return j;
    }

    function deleteJourney(id) {
      if (state.workout && state.workout.journeyId === id) state.workout = null;
      state.journeys = state.journeys.filter(j => j.id !== id);
      save();
    }

    function renameJourney(id, name) {
      const j = get(id);
      if (j && name.trim()) { j.name = name.trim(); save(); }
      return j;
    }

    // Log a session: give steps, or km walked. Returns what changed.
    function logSession(id, { steps, km, durationMs }) {
      const j = get(id);
      if (!j) return null;
      const walkedKm = steps > 0 ? steps / j.stepsPerKm : (km > 0 ? km : 0);
      if (!walkedKm) return null;
      const before = doneMeters(j);
      const session = {
        id: uid(), date: now(),
        steps: steps > 0 ? Math.round(steps) : Math.round(km * j.stepsPerKm),
        walkedKm, durationMs: durationMs || 0,
        mapMeters: walkedKm * 1000 * j.scale,
      };
      j.sessions.unshift(session);
      const after = doneMeters(j);
      const milestones = [];
      const capped = Math.min(after, j.distanceMeters);
      for (let m = (Math.floor(before / MILESTONE_M) + 1) * MILESTONE_M; m <= capped; m += MILESTONE_M) {
        if (m < j.distanceMeters) milestones.push(m);
      }
      let completed = false;
      if (after >= j.distanceMeters && j.status !== 'completed') {
        j.status = 'completed'; j.finishedAt = now(); completed = true;
      } else if (j.status === 'paused') {
        resumeJourney(id); // logging steps on a paused journey resumes it
      }
      save();
      return { session, milestones, completed };
    }

    function deleteSession(id, sessionId) {
      const j = get(id);
      if (!j) return;
      j.sessions = j.sessions.filter(s => s.id !== sessionId);
      if (j.status === 'completed' && doneMeters(j) < j.distanceMeters) {
        j.status = 'paused'; j.pausedAt = now(); j.finishedAt = null;
      }
      save();
    }

    // ----- workout timer -----
    function workoutElapsed() {
      const w = state.workout;
      if (!w) return 0;
      return w.elapsedMs + (w.runningSince ? now() - w.runningSince : 0);
    }
    function startWorkout(journeyId) {
      const j = get(journeyId);
      if (!j) return;
      if (j.status === 'paused') resumeJourney(journeyId);
      state.workout = { journeyId, elapsedMs: 0, runningSince: now() };
      save();
    }
    function pauseWorkout() {
      const w = state.workout;
      if (!w || !w.runningSince) return;
      w.elapsedMs += now() - w.runningSince;
      w.runningSince = null;
      save();
    }
    function resumeWorkout() {
      const w = state.workout;
      if (!w || w.runningSince) return;
      const j = get(w.journeyId);
      if (j && j.status === 'paused') resumeJourney(j.id);
      w.runningSince = now();
      save();
    }
    function stopWorkout() {
      const ms = workoutElapsed();
      const journeyId = state.workout && state.workout.journeyId;
      state.workout = null;
      save();
      return { journeyId, durationMs: ms };
    }

    function setSettings(patch) { Object.assign(state.settings, patch); save(); }

    function exportData() { return JSON.stringify(Object.assign({}, state, { settings: Object.assign({}, state.settings, { apiKey: '' }) }), null, 1); }
    function importData(text) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.journeys)) throw new Error('Not a Bakboord backup file');
      const key = state.settings.apiKey;
      state = Object.assign(blank(), data);
      state.settings = Object.assign(blank().settings, data.settings || {}, { apiKey: key });
      save();
    }

    return {
      get state() { return state; },
      journey: get, progress, estimate, stepsForMapMeters, averageSessionSteps,
      createJourney, pauseJourney, resumeJourney, abandonJourney, deleteJourney, renameJourney,
      logSession, deleteSession,
      startWorkout, pauseWorkout, resumeWorkout, stopWorkout, workoutElapsed,
      setSettings, exportData, importData,
      MILESTONE_M,
    };
  }

  const api = { makeStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BakboordStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
