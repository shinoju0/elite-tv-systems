/**
 * ==============================================================================
 * ELITE SYSTEMS - WEIHNACHTEN (ALLE 6 TVS, SCHALTER IM ADMIN-PANEL)
 * ==============================================================================
 * Solange `christmasEnabled` an ist:
 *   - Deko je TV an festen Stellen ohne Text (siehe DECO und GIFTS):
 *     Christbaumkugeln in den oberen Ecken, goldene Glocken, Tannenbaum,
 *     Schneemann, Zuckerstange und Geschenke (12 Motive, je TV ohne Doppelte).
 *   - Dauerhafter Schneefall, gleiche Flocken wie der Schnee-Effekt.
 *
 * Die Deko besteht aus Standbildern (PNG, aus LottieFiles-Animationen gerendert,
 * Lottie Simple License). Sie bewegt sich nicht, damit die schwachen
 * TV-Prozessoren nur den Schnee und das Video zu tun haben.
 * Fehler hier dürfen nie die Speisekarte stören, deshalb alles in try/catch.
 * ==============================================================================
 */

import { getState } from './state-manager.js';

const IMAGES = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/weihnachten/*.png', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.split('/').pop().replace('.png', ''), url])
);

const CHECK_INTERVAL_MS = 1000;
const FLAKE_COUNT = 70;

// Plätze wie bei der Halloween-Deko, an den aktuellen Karten ohne Text ausgemessen.
// size = Breite in Bildschirmhöhen, x = Mitte als Anteil der Breite.
// at: 'tl'/'tr' hängt in der oberen Ecke, 't' oben, 'b' steht unten.
const DECO = {
  1: [{ a: 'kugeln-a', at: 'tl', size: .5 }, { a: 'kugeln-b', at: 'tr', size: .34 },
      { a: 'glocken', at: 't', x: .5, size: .19 }, { a: 'tannenbaum', at: 'b', x: .09, size: .32 }],
  2: [{ a: 'kugeln-b', at: 'tr', size: .14 }, { a: 'schneemann', at: 'b', x: .575, size: .19 }],
  // TV 3 zeigt nacheinander mehrere Menüs, die längste Überschrift
  // („Double Chili Cheeseburger Menü“) reicht von 13 % bis 87 % der Breite
  3: [{ a: 'kugeln-b', at: 'tl', size: .14 }, { a: 'glocken', at: 't', x: .94, size: .12 },
      { a: 'zuckerstange', at: 'b', x: .62, size: .18 }],
  4: [{ a: 'kugeln-b', at: 'tl', size: .34 }, { a: 'glocken', at: 't', x: .82, size: .14 },
      { a: 'tannenbaum', at: 'b', x: .94, size: .25 }],
  5: [{ a: 'kugeln-a', at: 'tl', size: .36 }, { a: 'kugeln-b', at: 'tr', size: .14 },
      { a: 'glocken', at: 't', x: .76, size: .15 }, { a: 'schneemann', at: 'b', x: .93, size: .17 }],
  6: [{ a: 'kugeln-b', at: 'tl', size: .17 }, { a: 'glocken', at: 't', x: .66, size: .13 }]
};

// Geschenke unten, je TV ohne doppeltes Motiv: [Motiv, x (Mitte), Größe]
const GIFTS = {
  1: [['geschenk-rot', .19, .12], ['geschenk-blau', .26, .1], ['geschenk-gruen', .315, .08],
      ['geschenk-lila', .45, .1], ['geschenk-orange', .6, .11], ['geschenk-weinrot', .75, .1],
      ['geschenk-rot-gold', .88, .09]],
  2: [['geschenk-pink', .44, .07], ['geschenk-orange', .505, .085]],
  3: [['geschenk-weinrot', .7, .085], ['geschenk-orange-weiss', .79, .08], ['geschenk-blau', .87, .09],
      ['geschenk-violett', .95, .08]],
  4: [['geschenk-rot-gold', .53, .08], ['geschenk-blau-gold', .61, .09], ['geschenk-gruen', .845, .09]],
  5: [['geschenk-lila', .42, .085], ['geschenk-dunkelblau', .51, .08], ['geschenk-pink', .6, .07],
      ['geschenk-orange', .76, .085], ['geschenk-rot', .845, .09]],
  6: [['geschenk-gruen', .68, .07], ['geschenk-weinrot', .77, .075], ['geschenk-violett', .86, .07],
      ['geschenk-orange', .955, .085]]
};
// Diese Motive haben Funkeln oder leeren Rand um das Paket, das Paket selbst
// wäre sonst kleiner als die anderen
const GIFT_SCALE = { 'geschenk-pink': 2, 'geschenk-orange-weiss': 2, 'geschenk-violett': 1.8, 'geschenk-gruen': 1.5, 'geschenk-dunkelblau': 1.8, 'geschenk-blau-gold': 1.6 };

let layer = null;
let activeScreenNumber = null;
let loopId = null;
let shownOnScreen = null;

export function initChristmasEngine(containerEl, screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  layer = containerEl.querySelector('.elite-christmas-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'elite-christmas-layer';
    containerEl.appendChild(layer);
  }
  if (loopId) clearInterval(loopId);
  loopId = setInterval(() => {
    try { check(); } catch (err) { console.warn('🎄 [Weihnachten] Fehler', err); }
  }, CHECK_INTERVAL_MS);
}

export function setChristmasActiveScreen(screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  clear();
}

function check() {
  if (!layer) return;
  const enabled = getState().settings?.christmasEnabled === true;
  if (!enabled || !DECO[activeScreenNumber]) {
    if (shownOnScreen) clear();
    return;
  }
  if (shownOnScreen !== activeScreenNumber) show();
}

function show() {
  clear();
  shownOnScreen = activeScreenNumber;
  const H = window.innerHeight || 1080;
  const items = DECO[activeScreenNumber].concat(
    (GIFTS[activeScreenNumber] || []).map(([a, x, size]) => ({ a, at: 'b', x, size: size * (GIFT_SCALE[a] || 1) }))
  );
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(createDeco(item, H));
  fragment.appendChild(createSnow());
  layer.appendChild(fragment);
  console.log(`🎄 [Weihnachten] Deko und Schnee auf TV ${activeScreenNumber} an`);
}

function createDeco({ a, at, x, size }, H) {
  const el = document.createElement('img');
  el.src = IMAGES[a];
  el.alt = '';
  el.className = 'elite-christmas-deco';
  const w = H * size;
  el.style.width = `${w}px`;
  if (at === 'tl') {
    el.style.left = `${H * .02}px`;
    el.style.top = '0';
  } else if (at === 'tr') {
    el.style.right = `${H * .02}px`;
    el.style.top = '0';
  } else {
    // Mitte bei x, aber nie über den Rand hinaus
    el.style.left = `clamp(0px, calc(${x * 100}vw - ${w / 2}px), calc(100vw - ${w}px))`;
    if (at === 't') el.style.top = `${H * .02}px`;
    else el.style.bottom = '0';
  }
  return el;
}

// Dauerhafter Schnee wie in snow-engine.js, mit negativer Verzögerung, damit
// der Bildschirm sofort voller Flocken ist
function createSnow() {
  const snow = document.createElement('div');
  snow.className = 'elite-christmas-snow';
  for (let i = 0; i < FLAKE_COUNT; i++) {
    const flake = document.createElement('div');
    flake.className = 'elite-snowflake';
    const size = 4 + Math.random() * 10;
    const fallSeconds = 7 + Math.random() * 7;
    flake.style.left = `${(Math.random() * 100).toFixed(2)}vw`;
    flake.style.width = `${size.toFixed(1)}px`;
    flake.style.height = `${size.toFixed(1)}px`;
    flake.style.opacity = (0.55 + Math.random() * 0.45).toFixed(2);
    flake.style.setProperty('--snow-sway', `${(Math.random() * 8 - 4).toFixed(2)}vw`);
    flake.style.animationDuration = `${fallSeconds.toFixed(2)}s`;
    flake.style.animationDelay = `${(-Math.random() * fallSeconds).toFixed(2)}s`;
    snow.appendChild(flake);
  }
  return snow;
}

function clear() {
  shownOnScreen = null;
  if (layer) layer.replaceChildren();
}

export function stopChristmasEngine() {
  if (loopId) {
    clearInterval(loopId);
    loopId = null;
  }
  clear();
}
