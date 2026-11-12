/**
 * ==============================================================================
 * ELITE SYSTEMS - SYNCHRONER SCHNEEFALL (ALLE 6 TVS GLEICHZEITIG)
 * ==============================================================================
 * Anders als Goku läuft der Schnee nicht von TV zu TV, sondern startet und
 * endet auf allen Bildschirmen im selben Moment.
 *
 * Zeitplan (über die synchronisierte Serverzeit):
 *   - Regulär: alle `snowIntervalMinutes` zur vollen Minute für
 *     `snowDurationSeconds` (Standard: alle 5 Minuten für 20 s, also immer
 *     zwischen :00 und :20 – Goku startet erst bei :30).
 *   - Test: ab `lastSnowTestTrigger` für dieselbe Dauer.
 *
 * Der Zustand wird nicht als Ereignis ausgelöst, sondern laufend aus der Uhrzeit
 * berechnet. Ein TV, der mitten im Schneefall einschaltet, steigt deshalb direkt
 * mit ein, statt den Durchlauf zu verpassen.
 *
 * Die Flocken sind einfache CSS-Elemente (nur transform-Animationen), damit
 * auch die schwachen TV-Prozessoren flüssig bleiben. Sie existieren nur,
 * solange es schneit.
 * ==============================================================================
 */

import { getSyncedTime, getState, reportEffectPlayed } from './state-manager.js';

const FLAKE_COUNT = 70;
const FADE_OUT_MS = 1500;
const CHECK_INTERVAL_MS = 250;

let snowContainer = null;
let activeScreenNumber = null;
let snowLayer = null;
let isSnowing = false;
let currentRunStart = 0;
let loopId = null;
let cleanupTimeoutId = null;

/**
 * Initialisiert die Schnee-Engine und hängt die Schneeschicht an den Vollbild-Container.
 */
export function initSnowEngine(containerEl, screenNum) {
  snowContainer = containerEl;
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;

  snowLayer = snowContainer.querySelector('.elite-snow-layer');
  if (!snowLayer) {
    snowLayer = document.createElement('div');
    snowLayer.className = 'elite-snow-layer';
    snowContainer.appendChild(snowLayer);
  }

  if (loopId) clearInterval(loopId);
  loopId = setInterval(checkSchedule, CHECK_INTERVAL_MS);
}

export function setSnowActiveScreen(screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  if (!activeScreenNumber && isSnowing) stopSnow();
}

/**
 * Ermittelt, ob es gerade schneien soll und seit wann (ms, Serverzeit).
 * @returns {number} Startzeitpunkt des laufenden Schneefalls oder 0
 */
function getActiveRunStart(settings, now) {
  const durationMs = (typeof settings.snowDurationSeconds === 'number' ? settings.snowDurationSeconds : 20) * 1000;
  const intervalMinutes = typeof settings.snowIntervalMinutes === 'number' ? settings.snowIntervalMinutes : 5;

  // Test hat Vorrang, auch wenn der reguläre Schnee ausgeschaltet ist
  const testStart = settings.lastSnowTestTrigger || 0;
  if (now >= testStart && now - testStart < durationMs) return testStart;

  if (settings.snowEnabled === false || intervalMinutes <= 0) return 0;
  const periodMs = intervalMinutes * 60 * 1000;
  const cycleStart = Math.floor(now / periodMs) * periodMs;
  return now - cycleStart < durationMs ? cycleStart : 0;
}

function checkSchedule() {
  if (!snowLayer) return;
  const runStart = activeScreenNumber ? getActiveRunStart(getState().settings || {}, getSyncedTime()) : 0;

  if (runStart && (!isSnowing || runStart !== currentRunStart)) {
    startSnow(runStart, (getSyncedTime() - runStart) / 1000);
  } else if (!runStart && isSnowing) {
    stopSnow();
  }
}

function startSnow(runStart, lateSeconds) {
  if (cleanupTimeoutId) {
    clearTimeout(cleanupTimeoutId);
    cleanupTimeoutId = null;
  }

  // Wer spät einsteigt (TV gerade eingeschaltet), bekommt sofort einen vollen
  // Bildschirm. Sonst fallen die Flocken von oben herein.
  const joinMidway = lateSeconds > 1;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < FLAKE_COUNT; i++) {
    const flake = document.createElement('div');
    flake.className = 'elite-snowflake';
    const size = 4 + Math.random() * 10;
    const fallSeconds = 7 + Math.random() * 7;
    const delay = joinMidway ? -Math.random() * fallSeconds : Math.random() * 5;
    flake.style.left = `${(Math.random() * 100).toFixed(2)}vw`;
    flake.style.width = `${size.toFixed(1)}px`;
    flake.style.height = `${size.toFixed(1)}px`;
    flake.style.opacity = (0.55 + Math.random() * 0.45).toFixed(2);
    flake.style.setProperty('--snow-sway', `${(Math.random() * 8 - 4).toFixed(2)}vw`);
    flake.style.animationDuration = `${fallSeconds.toFixed(2)}s`;
    flake.style.animationDelay = `${delay.toFixed(2)}s`;
    fragment.appendChild(flake);
  }

  snowLayer.replaceChildren(fragment);
  void snowLayer.offsetWidth;
  snowLayer.classList.add('active');

  isSnowing = true;
  currentRunStart = runStart;
  reportEffectPlayed('snow', runStart);
  console.log(`❄️ [Snow Engine] Schneefall auf TV ${activeScreenNumber} gestartet`);
}

function stopSnow() {
  isSnowing = false;
  currentRunStart = 0;
  snowLayer.classList.remove('active');
  // Flocken erst nach dem Ausblenden entfernen
  cleanupTimeoutId = setTimeout(() => {
    snowLayer.replaceChildren();
    cleanupTimeoutId = null;
  }, FADE_OUT_MS);
}

export function stopSnowEngine() {
  if (loopId) {
    clearInterval(loopId);
    loopId = null;
  }
  if (isSnowing) stopSnow();
}
