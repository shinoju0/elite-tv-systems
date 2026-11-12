/**
 * ==============================================================================
 * ELITE SYSTEMS - AUTOMATISCHES NEULADEN BEI NEUER VERSION (NUR TV-ANSICHT)
 * ==============================================================================
 * Vite gibt jedem Build einen neuen Dateinamen (assets/index-<hash>.js).
 * Die TVs fragen regelmäßig die index.html ab. Verweist sie auf ein anderes
 * Skript als das laufende, lädt der Fernseher sich selbst neu. Die zugewiesene
 * Bildschirmnummer bleibt im localStorage erhalten.
 *
 * Außerdem kann man im Handy-Admin alle TVs auf einmal neu laden lassen
 * (settings.lastReloadTrigger, siehe initRemoteReload).
 *
 * Für den Dauerbetrieb lädt sich jeder TV zusätzlich einmal pro Nacht frisch neu,
 * damit sich über Wochen kein Speicher im TV-Browser ansammelt. Das passiert nur,
 * wenn der Server gerade erreichbar ist (sonst bliebe eine Fehlerseite stehen).
 * ==============================================================================
 */

import { subscribeToState } from './state-manager.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
// Nächtliches Neuladen zwischen 0 und 1 Uhr, nach Ladenschluss (geöffnet 12–23 Uhr).
// Die Mindestlaufzeit verhindert, dass ein TV in dieser Stunde mehrmals neu lädt.
const NIGHTLY_RELOAD_HOUR = 0;
const NIGHTLY_MIN_UPTIME_MS = 2 * 60 * 60 * 1000;
const pageStartedAt = Date.now();
const SCRIPT_PATTERN = /\/assets\/index-[\w-]+\.js/;
const RELOAD_HANDLED_KEY = 'elite_tv_reload_handled';

function getRunningScript() {
  const script = document.querySelector('script[type="module"][src*="/assets/index-"]');
  const match = script && SCRIPT_PATTERN.exec(script.getAttribute('src'));
  return match ? match[0] : null;
}

async function checkForNewVersion(runningScript) {
  try {
    const response = await fetch('/', { cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return;
    const html = await response.text();
    const match = SCRIPT_PATTERN.exec(html);
    if (!match) return;
    if (match[0] !== runningScript) {
      console.log(`🔄 [Elite Systems] Neue Version gefunden (${match[0]}), lade neu...`);
      reloadWhenIdle();
    } else if (isNightlyReloadDue()) {
      console.log('🔄 [Elite Systems] Nächtliches Neuladen...');
      reloadWhenIdle();
    }
  } catch (err) {
    // Server gerade nicht erreichbar -> nächster Versuch
  }
}

function isNightlyReloadDue() {
  return new Date().getHours() === NIGHTLY_RELOAD_HOUR && Date.now() - pageStartedAt > NIGHTLY_MIN_UPTIME_MS;
}

/**
 * Lädt den TV neu, sobald im Handy-Admin "Alle TVs neu laden" gedrückt wurde.
 * Der zuletzt ausgeführte Befehl wird im localStorage gemerkt, damit ein TV
 * nach dem Neuladen nicht gleich wieder neu lädt. Ein TV, der den Wert noch nie
 * gesehen hat, merkt ihn sich nur (sonst würde er beim ersten Start neu laden).
 */
function initRemoteReload() {
  subscribeToState((state) => {
    const trigger = Number(state.settings?.lastReloadTrigger) || 0;
    try {
      const handled = localStorage.getItem(RELOAD_HANDLED_KEY);
      if (handled !== null && trigger <= Number(handled)) return;
      localStorage.setItem(RELOAD_HANDLED_KEY, String(trigger));
      if (handled === null) return;
    } catch (err) {
      // Ohne localStorage lieber nie neu laden als in einer Schleife
      return;
    }
    console.log('🔄 [Elite Systems] Neu laden per Handy-Admin...');
    reloadWhenIdle();
  });
}

/**
 * Lädt neu, sobald gerade keine Figur über den Bildschirm läuft (sonst
 * verschwindet sie mitten im Lauf). Spätestens nach 30 s wird trotzdem neu geladen.
 */
function reloadWhenIdle(startedAt = Date.now()) {
  const busy = document.querySelector('.elite-runner.animating, .elite-corner.visible');
  if (busy && Date.now() - startedAt < 30 * 1000) {
    setTimeout(() => reloadWhenIdle(startedAt), 500);
    return;
  }
  window.location.reload();
}

export function initVersionCheck() {
  initRemoteReload();

  const runningScript = getRunningScript();
  // Im Vite-Dev-Modus gibt es kein gebautes Skript, dort übernimmt HMR
  if (!runningScript) return;
  setInterval(() => checkForNewVersion(runningScript), CHECK_INTERVAL_MS);
}
