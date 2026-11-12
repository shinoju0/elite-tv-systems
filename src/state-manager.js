/**
 * ==============================================================================
 * ELITE SYSTEMS - STATE MANAGER & GLOBAL TIME SYNCHRONIZATION
 * ==============================================================================
 * Synchronisiert Echtzeitdaten für alle 6 TV-Bildschirme und das Mobile Admin.
 * Unterstützt Bilder & Dauerschleifen-Videos über den eigenen Elite-Server
 * (`/api/state` + Server-Sent Events auf `/api/events`) sowie unterbrechungsfreien
 * lokalen Fallback via BroadcastChannel & LocalStorage.
 * ==============================================================================
 */

import { resolvePlayableMediaUrl } from './url-resolver.js';

const STORAGE_KEY = 'elite_systems_state_v1';
const API_STATE = '/api/state';
const API_EVENTS = '/api/events';
// Abfrage zusätzlich zu den Live-Events: Proxys können Server-Sent Events
// puffern (beim Cloudflare-Quick-Tunnel komplett), dann greift diese Abfrage
const POLL_INTERVAL_MS = 5 * 1000;
// Test-Effekte starten mit kurzem Vorlauf: eine Abfragerunde plus Reserve.
// Ohne Live-Events (PHP-Webhosting) hat so jeder TV den Befehl vor dem Start.
const TEST_TRIGGER_LEAD_MS = POLL_INTERVAL_MS + 1000;
// Hängt eine Anfrage bei schlechtem WLAN, wird sie nach dieser Zeit abgebrochen,
// statt dass sich offene Verbindungen stapeln und auch das Video ausbremsen
const REQUEST_TIMEOUT_MS = 10 * 1000;
const SESSION_PIN_KEY = 'elite_admin_pin';
const DEVICE_ID_KEY = 'elite_tv_device_id';
const ASSIGNED_SCREEN_KEY = 'elite_tv_assigned_screen';

let reportAsTv = false;
let tvView = 'übersicht';
const lastEffectRuns = { goku: 0, ruffy: 0, sponge: 0, gon: 0, snow: 0 };

/**
 * Die Effekt-Engines melden hier, wann sie zuletzt gelaufen sind (geplanter
 * Startzeitpunkt). Das geht mit der nächsten Abfrage an den Server, damit man
 * prüfen kann, ob ein Test auf allen TVs angekommen ist.
 */
export function reportEffectPlayed(effect, plannedStart) {
  lastEffectRuns[effect] = Math.round(plannedStart || getSyncedTime());
}

/**
 * Das Vollbild-Video meldet hier, wie oft es mangels Daten anhalten musste (Ruckler).
 * Geht mit der nächsten Abfrage an den Server.
 */
const videoHealth = { stalls: 0 };
export function reportVideoHealth(update) {
  Object.assign(videoHealth, update);
}

export function setTvView(view) {
  tvView = view;
}

/**
 * Nur Fernseher melden bei jeder Abfrage Nummer, Version und Uhr-Abweichung,
 * damit man auf dem Server sieht, welcher TV was anzeigt (/api/clients).
 */
export function enableTvReporting() {
  reportAsTv = true;
}

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (err) {
    return 'unbekannt';
  }
}

function getStateUrl() {
  if (!reportAsTv) return API_STATE;
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]');
  const params = new URLSearchParams({
    device: getDeviceId(),
    screen: localStorage.getItem(ASSIGNED_SCREEN_KEY) || '',
    version: script ? script.getAttribute('src').replace('/assets/', '') : 'dev',
    offset: String(Math.round(timeOffset)),
    view: tvView,
    // Wann diese Seite geladen wurde (Serverzeit), für "Alle TVs neu laden"
    loaded: String(Math.round(performance.timeOrigin + timeOffset)),
    goku: String(lastEffectRuns.goku),
    ruffy: String(lastEffectRuns.ruffy),
    sponge: String(lastEffectRuns.sponge),
    gon: String(lastEffectRuns.gon),
    snow: String(lastEffectRuns.snow),
    stalls: String(videoHealth.stalls)
  });
  return `${API_STATE}?${params}`;
}

/**
 * Header für Schreibzugriffe. Nur das entsperrte Smartphone-Admin kennt die PIN,
 * Änderungen direkt am TV bleiben deshalb lokal auf diesem Gerät.
 */
export function getAdminHeaders() {
  const pin = sessionStorage.getItem(SESSION_PIN_KEY);
  return pin ? { 'X-Admin-Pin': pin } : {};
}

export function setAdminPin(pin) {
  if (pin) sessionStorage.setItem(SESSION_PIN_KEY, pin);
  else sessionStorage.removeItem(SESSION_PIN_KEY);
}

export function hasAdminPin() {
  return Boolean(sessionStorage.getItem(SESSION_PIN_KEY));
}

/**
 * Prüft die PIN beim Server.
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function verifyAdminPin(pin) {
  try {
    const response = await fetch('/api/auth', { method: 'POST', headers: { 'X-Admin-Pin': pin } });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    return { ok: false, status: response.status, error: body.error };
  } catch (err) {
    return { ok: false, error: 'Server nicht erreichbar' };
  }
}

// Standardzustand für die 6 Bildschirme & globalen Einstellungen
export const DEFAULT_STATE = {
  settings: {
    snowEnabled: true,
    snowIntervalMinutes: 5,    // Alle 5 Minuten zur vollen Minute
    snowDurationSeconds: 20,   // Auf allen TVs gleichzeitig
    lastSnowTestTrigger: 0,
    gokuEnabled: true,
    gokuSpeed: 3.5,            // Sekunden pro Bildschirm (ruhiger, gut sichtbarer Lauf)
    gokuIntervalMinutes: 2,    // Alle 2 Minuten eine Animation, im Wechsel Goku, Ruffy, SpongeBob, Gon
    lastGokuTestTrigger: 0,
    ruffyEnabled: true,
    lastRuffyTestTrigger: 0,
    spongeEnabled: true,
    lastSpongeTestTrigger: 0,
    gonEnabled: true,
    lastGonTestTrigger: 0,
    halloweenEnabled: true,    // Netze, Kürbisse und Spinnen auf allen TVs (Admin-Schalter)
    christmasEnabled: false,   // Weihnachts-Deko und Dauerschnee auf allen TVs (Admin-Schalter)
    lastReloadTrigger: 0
  },
  screens: {
    1: { id: 1, name: "Bildschirm 1", positionLabel: "Ganz links (TV 1)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 },
    2: { id: 2, name: "Bildschirm 2", positionLabel: "Position 2 (TV 2)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 },
    3: { id: 3, name: "Bildschirm 3", positionLabel: "Position 3 (TV 3)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 },
    4: { id: 4, name: "Bildschirm 4", positionLabel: "Position 4 (TV 4)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 },
    5: { id: 5, name: "Bildschirm 5", positionLabel: "Position 5 (TV 5)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 },
    6: { id: 6, name: "Bildschirm 6", positionLabel: "Ganz rechts (TV 6)", mediaUrl: null, mediaType: 'image', imageUrl: null, updatedAt: 0 }
  }
};

let currentState = loadInitialState();
const listeners = new Set();
let broadcastChannel = null;
let timeOffset = 0; // Millisekunden Offset zum Server

// ------------------------------------------------------------------------------
// ZEITSYNCHRONISATION (FÜR SYNCHRONEN SCHNEE & GOKU ÜBER ALLE TVS)
// ------------------------------------------------------------------------------
export async function syncGlobalTime() {
  // Mehrere Messungen gegen /api/time, die mit der kürzesten Laufzeit ist am
  // genauesten (NTP-Prinzip). Der Date-Header unten ist nur sekundengenau.
  let best = null;
  for (let i = 0; i < 5; i++) {
    try {
      const start = Date.now();
      const response = await fetch('/api/time', { cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const { now } = await response.json();
      const end = Date.now();
      const roundTrip = end - start;
      if (typeof now === 'number' && (!best || roundTrip < best.roundTrip)) {
        best = { roundTrip, offset: now + (roundTrip / 2) - end };
      }
    } catch (err) {
      // Nächster Versuch bzw. Fallback
    }
  }
  if (best) {
    timeOffset = best.offset;
    return;
  }

  const startTime = Date.now();
  try {
    const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const serverDateHeader = response.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const endTime = Date.now();
      const roundTrip = endTime - startTime;
      const estimatedServerTime = serverTime + (roundTrip / 2);
      timeOffset = estimatedServerTime - endTime;
      return;
    }
  } catch (err) {
    // Fallback: Lokaler Takt
  }
  timeOffset = 0;
}

export function getSyncedTime() {
  return Date.now() + timeOffset;
}

// ------------------------------------------------------------------------------
// STATE MANAGEMENT & LISTENERS
// ------------------------------------------------------------------------------
function loadInitialState() {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const screens = { ...DEFAULT_STATE.screens, ...parsed.screens };
        for (let i = 1; i <= 6; i++) {
          if (screens[i]?.mediaUrl && screens[i].mediaUrl.startsWith('/default-menus/')) {
            screens[i].mediaUrl = null;
            screens[i].imageUrl = null;
          }
        }
        return {
          settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
          screens
        };
      }
    }
  } catch (e) {
    console.warn("Fehler beim Laden von localStorage:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function persistLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Konnte State nicht lokal speichern:", e);
  }
}

function notifyListeners() {
  listeners.forEach(cb => {
    try {
      cb(currentState);
    } catch (e) {
      console.error("Error in state subscriber callback:", e);
    }
  });
}

// ------------------------------------------------------------------------------
// SERVER-SYNCHRONISATION
// ------------------------------------------------------------------------------
/**
 * Speichert den Zustand auf dem Server. Schlägt das im Admin fehl, geht ein
 * `elite_save_failed`-Event raus, damit das Handy es anzeigen kann, statt
 * einen Erfolg vorzutäuschen.
 * @returns {Promise<boolean>} true, wenn der Server gespeichert hat
 */
async function pushStateToServer() {
  if (!hasAdminPin()) {
    // Fernseher speichern nie zentral, nur das entsperrte Handy
    if (!reportAsTv) notifySaveFailed(401, 'Nicht angemeldet');
    return false;
  }
  try {
    const response = await fetch(API_STATE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
      body: JSON.stringify({ settings: currentState.settings, screens: currentState.screens })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      notifySaveFailed(response.status, body.error || `HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("⚠️ [Elite Systems] Konnte Zustand nicht zum Server senden:", err);
    notifySaveFailed(0, 'Server nicht erreichbar');
    return false;
  }
}

function notifySaveFailed(status, message) {
  window.dispatchEvent(new CustomEvent('elite_save_failed', { detail: { status, message } }));
}

function applyRemoteState(remote) {
  if (!remote || !remote.screens || !remote.settings) return;
  if (JSON.stringify(remote) === JSON.stringify(currentState)) return;

  const previous = currentState;
  currentState = {
    settings: { ...DEFAULT_STATE.settings, ...remote.settings },
    screens: { ...DEFAULT_STATE.screens, ...remote.screens }
  };
  persistLocal(currentState);
  notifyListeners();

  for (let i = 1; i <= 6; i++) {
    const before = previous.screens[i] || {};
    const after = currentState.screens[i] || {};
    if (before.mediaUrl !== after.mediaUrl || before.mediaType !== after.mediaType) {
      window.dispatchEvent(new CustomEvent('elite_screen_update', {
        detail: { screenNumber: i, mediaUrl: after.mediaUrl, mediaType: after.mediaType, updatedAt: after.updatedAt }
      }));
    }
  }
}

let pollInFlight = false;

async function fetchServerState() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const response = await fetch(getStateUrl(), { cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return;
    const { state } = await response.json();
    if (state) {
      applyRemoteState(state);
    } else {
      // Server ist noch leer -> mit dem Zustand dieses Geräts befüllen (nur Admin)
      await pushStateToServer();
    }
  } catch (err) {
    console.warn("⚠️ [Elite Systems] Server nicht erreichbar, nutze lokalen Zustand:", err);
  } finally {
    pollInFlight = false;
  }
}

function startServerSync() {
  fetchServerState();

  if ('EventSource' in window) {
    const events = new EventSource(API_EVENTS);
    events.onmessage = (event) => {
      try {
        applyRemoteState(JSON.parse(event.data));
      } catch (err) { }
    };
    // Nach einem Verbindungsabbruch verbindet EventSource sich selbst neu
    events.onopen = () => fetchServerState();
  }

  setInterval(fetchServerState, POLL_INTERVAL_MS);
}

export function subscribeToState(callback) {
  listeners.add(callback);
  callback(currentState);
  return () => listeners.delete(callback);
}

export function getState() {
  return currentState;
}

export async function updateState(partialUpdates) {
  const newState = {
    settings: {
      ...currentState.settings,
      ...(partialUpdates.settings || {})
    },
    screens: {
      ...currentState.screens,
      ...(partialUpdates.screens || {})
    }
  };

  currentState = newState;
  persistLocal(currentState);
  notifyListeners();

  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'STATE_UPDATE', state: currentState });
    } catch (err) { }
  }

  return pushStateToServer();
}

/**
 * Aktualisiert die Medien (Bild oder Video) eines Bildschirms.
 * @param {number} screenNumber 
 * @param {string|null} mediaUrl 
 * @param {'image'|'video'} mediaType 
 */
export async function updateScreenMedia(screenNumber, mediaUrl, mediaType = 'image') {
  const num = parseInt(screenNumber, 10);
  const screenObj = currentState.screens[num] || DEFAULT_STATE.screens[num];
  const now = Date.now();
  const resolvedUrl = mediaUrl ? resolvePlayableMediaUrl(mediaUrl) : null;

  currentState = {
    ...currentState,
    screens: {
      ...currentState.screens,
      [num]: {
        ...screenObj,
        mediaUrl: resolvedUrl,
        mediaType: mediaType || 'image',
        imageUrl: resolvedUrl, // Abwärtskompatibilität
        updatedAt: now
      }
    }
  };

  persistLocal(currentState);
  notifyListeners();

  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'STATE_UPDATE', state: currentState });
    } catch (err) { }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('elite_screen_update', {
      detail: { screenNumber: num, mediaUrl: resolvedUrl, mediaType, updatedAt: now }
    }));
  }

  return pushStateToServer();
}

/**
 * Legacy Wrapper für reine Bild-Updates.
 */
export async function updateScreenImage(screenNumber, imageUrl) {
  return updateScreenMedia(screenNumber, imageUrl, 'image');
}

/**
 * Setzt ein Bildschirmmedium zurück.
 * @returns {Promise<boolean>} true, wenn der Server gespeichert hat
 */
export async function resetScreenImage(screenNumber) {
  const num = parseInt(screenNumber, 10);
  return updateScreenMedia(num, null, 'image');
}

/**
 * Lässt es zum Test auf allen Bildschirmen gleichzeitig schneien.
 * @returns {Promise<{ ok: boolean, startsAt: number }>}
 */
export async function triggerSnowTest() {
  const startsAt = Math.round(getSyncedTime() + TEST_TRIGGER_LEAD_MS);
  const ok = await updateState({
    settings: {
      ...currentState.settings,
      lastSnowTestTrigger: startsAt
    }
  });
  return { ok, startsAt };
}

const TEST_KEYS = { goku: 'lastGokuTestTrigger', ruffy: 'lastRuffyTestTrigger', sponge: 'lastSpongeTestTrigger', gon: 'lastGonTestTrigger' };

/**
 * Wann ein jetzt ausgelöster Test auf den TVs starten würde (Serverzeit).
 */
export function nextTestStart() {
  return Math.round(getSyncedTime() + TEST_TRIGGER_LEAD_MS);
}

/**
 * Löst eine Test-Animation aus: Goku/Ruffy laufen synchron von TV 1 nach TV 6,
 * SpongeBob erscheint auf TV 6.
 * @param {'goku'|'ruffy'|'sponge'|'gon'} runner
 * @param {number} [startsAt] Startzeitpunkt (Serverzeit), sonst nextTestStart()
 * @returns {Promise<{ ok: boolean, startsAt: number }>}
 */
export async function triggerRunnerTest(runner, startsAt = nextTestStart()) {
  const testKey = TEST_KEYS[runner];
  const ok = await updateState({
    settings: {
      ...currentState.settings,
      [testKey]: startsAt
    }
  });
  return { ok, startsAt };
}

/**
 * Lässt alle Fernseher die Seite neu laden (siehe version-check.js).
 * @returns {Promise<{ ok: boolean, triggeredAt: number }>}
 */
export async function triggerTvReload() {
  const triggeredAt = Math.round(getSyncedTime());
  const ok = await updateState({
    settings: {
      ...currentState.settings,
      lastReloadTrigger: triggeredAt
    }
  });
  return { ok, triggeredAt };
}

/**
 * Fragt beim Server ab, welche Fernseher sich melden und wann sie welche
 * Effekte zuletzt abgespielt haben (nur mit Admin-PIN).
 * @returns {Promise<Array|null>}
 */
export async function fetchTvClients() {
  try {
    const response = await fetch('/api/clients', { cache: 'no-store', headers: getAdminHeaders() });
    if (!response.ok) return null;
    const { clients } = await response.json();
    return clients;
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------------------------
// INITIALISIERUNG
// ------------------------------------------------------------------------------
export function initStateManager() {
  syncGlobalTime();
  setInterval(syncGlobalTime, 5 * 60 * 1000);

  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel('elite_systems_sync_channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'STATE_UPDATE') {
          currentState = event.data.state;
          persistLocal(currentState);
          notifyListeners();
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel nicht verfügbar:", e);
    }
  }

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        currentState = JSON.parse(e.newValue);
        notifyListeners();
      } catch (err) { }
    }
  });

  startServerSync();
}
