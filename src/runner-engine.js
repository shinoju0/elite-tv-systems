/**
 * ==============================================================================
 * ELITE SYSTEMS - SYNCHRONE ANIMATIONEN (GOKU, RUFFY, SPONGEBOB, GON)
 * ==============================================================================
 * Alle 2 Minuten kommt genau eine Animation, im Wechsel Goku, Ruffy, SpongeBob,
 * Gon. Goku und Ruffy laufen über alle 6 Bildschirme, SpongeBob taucht nur auf
 * TV 6 unten rechts auf, Gon nur auf TV 4 unten in der Mitte. Welche Animation dran ist, ergibt sich aus der
 * synchronisierten Uhrzeit, damit alle TVs sich einig sind.
 *
 * Physische Anordnung über der Theke (von links nach rechts):
 * [TV 1 (Ganz links)] [TV 2] [TV 3] [TV 4] [TV 5] [TV 6 (Ganz rechts)]
 *
 * Die Figur läuft von LINKS nach RECHTS, startet auf TV 1 und endet auf TV 6:
 * Start-Reihenfolge k = N - 1 für TV-Nummer N (TV 1 = 0 ... TV 6 = 5).
 *
 * Nahtloser Übergang:
 * Wenn die vordere Kante der Figur den rechten Rand von TV (k) erreicht (100vw),
 * berührt sie im exakt selben Moment den linken Rand von TV (k+1) (0vw).
 * ==============================================================================
 */

import { getSyncedTime, getState, reportEffectPlayed } from './state-manager.js';
// Über Vite eingebunden: Die Dateinamen bekommen einen Versionsstempel, ein
// ausgetauschtes GIF ist also sofort auf allen TVs zu sehen (kein alter Cache)
import gokuSrc from './assets/goku-running.gif';
import ruffySrc from './assets/ruffy-running.gif';
import spongeSrc from './assets/spongebob.webp';
import gonSrc from './assets/gon.gif';

/**
 * Figuren. Läufer (kind 'run') laufen von TV 1 nach TV 6. heightScale:
 * Elementhöhe relativ zu 1/3 Bildschirmhöhe, aspect: Seitenverhältnis des GIFs.
 * Ruffy ist so skaliert, dass er vom Hut bis zum Fuß so groß ist wie Goku vom
 * Haar bis zum Fuß (die hochgerissene Faust ragt darüber hinaus).
 * Eck-Animationen (kind 'corner') erscheinen nur auf einem TV (screen) für
 * visibleMs. Größe und Position stehen in style.css.
 */
export const RUNNERS = {
  goku: {
    kind: 'run', label: 'Goku', src: gokuSrc, heightScale: 1, aspect: 200 / 176,
    enabledKey: 'gokuEnabled', testKey: 'lastGokuTestTrigger'
  },
  ruffy: {
    kind: 'run', label: 'Ruffy', src: ruffySrc, heightScale: 1.137, aspect: 443 / 498,
    enabledKey: 'ruffyEnabled', testKey: 'lastRuffyTestTrigger'
  },
  sponge: {
    kind: 'corner', label: 'SpongeBob', src: spongeSrc, screen: 6, visibleMs: 4200,
    enabledKey: 'spongeEnabled', testKey: 'lastSpongeTestTrigger'
  },
  gon: {
    kind: 'corner', label: 'Gon', src: gonSrc, screen: 4, visibleMs: 5430,
    enabledKey: 'gonEnabled', testKey: 'lastGonTestTrigger'
  }
};
const ROTATION = ['goku', 'ruffy', 'sponge', 'gon'];

let runnerContainer = null;
let activeScreenNumber = null;
let lastTriggeredMinute = -1;
const lastTestTriggerHandled = { goku: 0, ruffy: 0, sponge: 0, gon: 0 };
// Eck-Animationen einmal laden; jede Anzeige bekommt eine eigene Blob-URL,
// damit die Animation von vorn beginnt statt irgendwo mittendrin
const cornerBlobs = {};
let loopIntervalId = null;
const activeTimeoutIds = {};
// Wie spät ein TV noch einsteigen darf. Wer zu spät dran ist, springt an die
// Stelle, an der die Figur gerade sein müsste, statt hinterherzulaufen.
const MAX_LATE_START_SECONDS = 1.5;
// Nach dem Ausblenden (CSS-Übergang) wird das Bild entfernt, damit ein
// unsichtbares GIF die schwachen TV-Prozessoren nicht weiter beschäftigt
const CORNER_UNLOAD_DELAY_MS = 800;

/**
 * Initialisiert die Läufer für einen bestimmten Bildschirm (1-6)
 * und hängt die Figuren an den Vollbild-Container.
 */
export function initRunnerEngine(containerEl, screenNum) {
  runnerContainer = containerEl;
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;

  ensureRunnerElements();
  preloadOwnCorners();
  runRunnerLoop();
}

export function setRunnerActiveScreen(screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  preloadOwnCorners();
}

function ensureRunnerElements() {
  if (!runnerContainer) return;
  for (const [key, runner] of Object.entries(RUNNERS)) {
    const cls = runner.kind === 'corner' ? 'elite-corner' : 'elite-runner';
    if (runnerContainer.querySelector(`.${cls}-${key}`)) continue;
    const el = document.createElement('div');
    el.className = `${cls} ${cls}-${key}`;
    // Läufer bekommen ihr Bild erst beim Start (siehe playRunnerAnimation),
    // vorgeladen wird es aber gleich, damit es dann sofort da ist
    el.innerHTML = `<img class="${cls}-sprite" alt="${runner.label}" />`;
    runnerContainer.appendChild(el);
    if (runner.kind === 'run') new Image().src = runner.src;
  }
}

/**
 * Lädt SpongeBob/Gon nur auf dem TV vor, auf dem sie auch erscheinen.
 */
function preloadOwnCorners() {
  for (const [key, runner] of Object.entries(RUNNERS)) {
    if (runner.kind === 'corner' && runner.screen === activeScreenNumber) preloadCorner(key);
  }
}

const cornerPreloads = {};
function preloadCorner(key) {
  if (!cornerPreloads[key]) {
    cornerPreloads[key] = loadCornerBlob(key).then(ok => {
      if (!ok) delete cornerPreloads[key]; // Beim nächsten Wechsel nochmal versuchen
    });
  }
}

async function loadCornerBlob(key) {
  try {
    const response = await fetch(RUNNERS[key].src);
    if (!response.ok) return false;
    cornerBlobs[key] = await response.blob();
    return true;
  } catch (err) {
    // Dann wird beim Anzeigen direkt die Datei genommen
    return false;
  }
}

/**
 * Welche Figur beim regulären Lauf dran ist. Gezählt wird in Intervallen seit
 * 1970, dadurch wechseln sich die Figuren ab und alle TVs sind sich einig.
 * Ausgeschaltete Figuren werden übersprungen.
 */
function runnerForSlot(syncedNow, intervalMinutes, settings) {
  const enabled = ROTATION.filter(key => settings[RUNNERS[key].enabledKey] !== false);
  if (enabled.length === 0) return null;
  const slot = Math.floor(syncedNow / (intervalMinutes * 60 * 1000));
  return enabled[slot % enabled.length];
}

function getSpeed(settings) {
  return typeof settings.gokuSpeed === 'number' ? settings.gokuSpeed : 3.5;
}

function getIntervalMinutes(settings) {
  return typeof settings.gokuIntervalMinutes === 'number' ? settings.gokuIntervalMinutes : 2;
}

/**
 * Wie lange eine Animation insgesamt dauert (Läufer: von TV 1 bis sie TV 6
 * verlassen hat; großzügig gerechnet, Figur höchstens eine halbe TV-Breite).
 */
export function animationDurationMs(key, speed) {
  const runner = RUNNERS[key];
  if (runner.kind === 'corner') return runner.visibleMs + 600;
  return (5 + 1.5) * speed * 1000;
}

/**
 * Sucht eine Animation, die zum Zeitpunkt atMs schon läuft (regulär oder Test).
 * Alle TVs und das Handy rechnen das aus denselben Daten, sind sich also einig,
 * welche Animation Vorrang hat: die zuerst gestartete. Damit laufen nie zwei
 * Animationen gleichzeitig, auch wenn während eines Laufs ein Test gedrückt wird.
 * @returns {{ key: string, start: number, end: number } | null}
 */
export function findRunInProgress(atMs, settings) {
  const speed = getSpeed(settings);
  const intervalMs = getIntervalMinutes(settings) * 60 * 1000;
  const runs = [];
  for (const [key, runner] of Object.entries(RUNNERS)) {
    const trigger = Number(settings[runner.testKey]) || 0;
    if (trigger) runs.push({ key, start: trigger });
  }
  const slot = Math.floor(atMs / intervalMs);
  for (const s of [slot - 1, slot]) {
    const start = s * intervalMs + 30 * 1000;
    const key = runnerForSlot(start, getIntervalMinutes(settings), settings);
    if (key) runs.push({ key, start });
  }
  for (const run of runs) {
    run.end = run.start + animationDurationMs(run.key, speed);
    if (run.start < atMs && atMs < run.end) return run;
  }
  return null;
}

/**
 * Berechnet die Gesamtlaufzeit für einen Bildschirm, damit die lineare
 * Geschwindigkeit exakt der Wunschzeit für die Bildschirmbreite entspricht.
 * Strecke = 100vw (Bildschirm) + Figurenbreite.
 * Die Breite wird nicht gemessen, sondern wie in style.css berechnet,
 * damit jeder TV mit demselben Wert rechnet, auch wenn das GIF noch lädt.
 */
function calculateScreenDuration(key, durationPerScreen) {
  const screenWidth = window.innerWidth || 1920;
  const screenHeight = window.innerHeight || 1080;
  const { heightScale, aspect } = RUNNERS[key];
  const runnerWidth = (screenHeight / 3) * heightScale * aspect;

  // Geschwindigkeit v = screenWidth / durationPerScreen
  // Gesamtdauer = (screenWidth + runnerWidth) / v
  return durationPerScreen * (1 + (runnerWidth / screenWidth));
}

/**
 * Löst die CSS-Animation für den Lauf von links nach rechts aus.
 * @param {'goku'|'ruffy'} key Figur
 * @param {number} durationPerScreen Sekunden pro Bildschirmbreite
 * @param {number} lateSeconds Wie viel später als geplant gestartet wird
 * @returns {boolean} ob die Figur wirklich losläuft
 */
export function playRunnerAnimation(key, durationPerScreen = 3.5, lateSeconds = 0) {
  if (!runnerContainer) return false;
  const el = runnerContainer.querySelector(`.elite-runner-${key}`);
  const img = el && el.querySelector('img');
  if (!img) return false;

  const totalDuration = calculateScreenDuration(key, durationPerScreen);
  const late = Math.max(0, lateSeconds);
  if (late >= totalDuration) return false;
  if (!img.getAttribute('src')) img.src = RUNNERS[key].src;

  // Vorherige Animation abbrechen
  el.classList.remove('animating');
  el.style.animationDuration = `${totalDuration.toFixed(3)}s`;
  // Negative Verzögerung = Animation startet mittendrin, an der richtigen Stelle
  el.style.animationDelay = `-${late.toFixed(3)}s`;

  // Reflow erzwingen
  void el.offsetWidth;

  el.classList.add('animating');

  // Nach Ablauf Klasse entfernen
  if (activeTimeoutIds[key]) clearTimeout(activeTimeoutIds[key]);
  activeTimeoutIds[key] = setTimeout(() => {
    el.classList.remove('animating');
    // Ausgeblendete Figur nicht im Hintergrund weiter animieren
    img.removeAttribute('src');
  }, (totalDuration - late) * 1000 + 100);
  return true;
}

/**
 * Zeigt eine Animation auf einem einzelnen TV (SpongeBob unten rechts, Gon unten
 * mittig) für visibleMs, danach verschwindet sie wieder.
 * @param {'sponge'|'gon'} key Figur
 * @param {number} lateSeconds Wie viel später als geplant gestartet wird
 * @returns {boolean} ob die Figur wirklich erscheint
 */
export function playCornerAnimation(key, lateSeconds = 0) {
  if (!runnerContainer) return false;
  const el = runnerContainer.querySelector(`.elite-corner-${key}`);
  const img = el && el.querySelector('img');
  if (!img) return false;
  const remainingMs = RUNNERS[key].visibleMs - Math.max(0, lateSeconds) * 1000;
  if (remainingMs <= 0) return false;

  const oldUrl = img.dataset.blobUrl;
  if (cornerBlobs[key]) {
    const url = URL.createObjectURL(cornerBlobs[key]);
    img.src = url;
    img.dataset.blobUrl = url;
  } else {
    img.src = RUNNERS[key].src;
    delete img.dataset.blobUrl;
  }
  if (oldUrl) URL.revokeObjectURL(oldUrl);

  el.classList.add('visible');
  if (activeTimeoutIds[key]) clearTimeout(activeTimeoutIds[key]);
  activeTimeoutIds[key] = setTimeout(() => {
    el.classList.remove('visible');
    activeTimeoutIds[key] = setTimeout(() => unloadCorner(img), CORNER_UNLOAD_DELAY_MS);
  }, remainingMs);
  return true;
}

function unloadCorner(img) {
  const url = img.dataset.blobUrl;
  img.removeAttribute('src');
  delete img.dataset.blobUrl;
  if (url) URL.revokeObjectURL(url);
}

/**
 * Startet eine Animation, je nach Art als Lauf oder in der Ecke.
 * Eck-Animationen spielt nur ihr eigener TV ab.
 * @returns {boolean} ob dieser TV wirklich etwas abspielt
 */
function playAnimation(key, speed, lateSeconds) {
  const runner = RUNNERS[key];
  if (runner.kind === 'corner') {
    if (activeScreenNumber !== runner.screen) return false;
    return playCornerAnimation(key, lateSeconds);
  }
  return playRunnerAnimation(key, speed, lateSeconds);
}

/**
 * Kontinuierlicher Taktgeber für den synchronen 2-Minuten-Zyklus (alle 100ms statt 60fps Busy-Loop für Smart TVs).
 */
function runRunnerLoop() {
  const check = () => {
    if (!activeScreenNumber) return;
    const settings = getState().settings || {};
    const speed = getSpeed(settings);
    const intervalMinutes = getIntervalMinutes(settings);

    const syncedNow = getSyncedTime();
    const date = new Date(syncedNow);
    const currentMinute = date.getMinutes();
    const currentSecondWithMs = date.getSeconds() + (date.getMilliseconds() / 1000);

    // 1. Manuelle Test-Auslösung je Figur prüfen. Läuft zum Startzeitpunkt
    // schon eine Animation (auch ein früherer Test derselben Figur), wird der
    // Test übersprungen, sonst wären zwei Figuren gleichzeitig unterwegs.
    for (const [key, runner] of Object.entries(RUNNERS)) {
      const trigger = settings[runner.testKey];
      if (trigger && trigger > lastTestTriggerHandled[key]) {
        const previous = lastTestTriggerHandled[key];
        lastTestTriggerHandled[key] = trigger;
        const sameKeyStillRunning = previous && trigger < previous + animationDurationMs(key, speed);
        const blocking = findRunInProgress(trigger, settings);
        if (sameKeyStillRunning || blocking) {
          console.log(`⏸️ [Animation] Test ${runner.label} übersprungen, es läuft schon eine Animation`);
          continue;
        }
        scheduleTestTrigger(key, trigger, speed);
      }
    }

    // 2. Regulärer Zyklus: Alle 2 Minuten zur Sekunde :30.000
    // (Sekunde 30 verhindert Überlagerung mit dem Schneefall zwischen :00 und :20)
    if (currentMinute % intervalMinutes !== 0 || currentMinute === lastTriggeredMinute) return;
    const key = runnerForSlot(syncedNow, intervalMinutes, settings);
    if (!key) return;
    // Läufer: Reihenfolge von links nach rechts, TV 1 = 0, ..., TV 6 = 5.
    // Eck-Animationen starten direkt bei :30.
    const orderIndex = RUNNERS[key].kind === 'run' ? activeScreenNumber - 1 : 0;
    const targetSecond = 30.0 + (orderIndex * speed);
    const diff = currentSecondWithMs - targetSecond;

    if (diff >= 0 && diff < MAX_LATE_START_SECONDS) {
      lastTriggeredMinute = currentMinute;
      // Ein noch laufender Test hat Vorrang, dann fällt dieser Durchgang aus
      const intervalMs = intervalMinutes * 60 * 1000;
      const slotStart = Math.floor(syncedNow / intervalMs) * intervalMs + 30 * 1000;
      if (findRunInProgress(slotStart, settings)) return;
      if (!playAnimation(key, speed, diff)) return;
      console.log(`🏃‍♂️ [Animation] ${RUNNERS[key].label} auf TV ${activeScreenNumber} bei Sekunde ${currentSecondWithMs.toFixed(2)}s`);
      // Gemeldet wird der Start der gesamten Animation (Sekunde :30), nicht der dieses TVs
      reportEffectPlayed(key, syncedNow - (currentSecondWithMs - 30) * 1000);
    }
  };

  if (loopIntervalId) clearInterval(loopIntervalId);
  loopIntervalId = setInterval(check, 100);
}

function scheduleTestTrigger(key, triggerTimestamp, speed) {
  if (!activeScreenNumber) return;
  const runner = RUNNERS[key];
  if (runner.kind === 'corner' && activeScreenNumber !== runner.screen) return;
  // Start-Versatz für Bildschirm N (TV 1 = 0, TV 2 = 1, ..., TV 6 = 5), Ecke sofort
  const orderIndex = runner.kind === 'run' ? activeScreenNumber - 1 : 0;
  const targetOffsetMs = orderIndex * speed * 1000;
  const now = getSyncedTime();
  const timeSinceTrigger = now - triggerTimestamp;
  // Alter Test (z. B. nach dem Neuladen noch im Zustand): längst vorbei
  if (timeSinceTrigger > animationDurationMs(key, speed)) return;
  const waitMs = Math.max(0, targetOffsetMs - timeSinceTrigger);

  setTimeout(() => {
    // Verspätung erst beim tatsächlichen Start messen (Timer auf TVs sind ungenau)
    const lateSeconds = (getSyncedTime() - triggerTimestamp - targetOffsetMs) / 1000;
    if (!playAnimation(key, speed, lateSeconds)) return;
    console.log(`🏃‍♂️ [Animation] Test ${runner.label} auf TV ${activeScreenNumber}`);
    reportEffectPlayed(key, triggerTimestamp);
  }, waitMs);
}

export function stopRunnerEngine() {
  if (loopIntervalId) {
    clearInterval(loopIntervalId);
    loopIntervalId = null;
  }
  for (const key of Object.keys(activeTimeoutIds)) {
    clearTimeout(activeTimeoutIds[key]);
    delete activeTimeoutIds[key];
  }
}
