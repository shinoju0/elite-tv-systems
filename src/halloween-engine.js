/**
 * ==============================================================================
 * ELITE SYSTEMS - HALLOWEEN (ALLE 6 TVS, SCHALTER IM ADMIN-PANEL)
 * ==============================================================================
 * Solange `halloweenEnabled` an ist:
 *   - Deko: Spinnennetze in den oberen Ecken und glühende Pixel-Kürbisse, je TV
 *     an festen Stellen ohne Text (siehe DECO), dauerhaft.
 *   - Jede Minute ab Sekunde :00 (Serverzeit, auf allen TVs gleichzeitig):
 *       :00  Spinnen-Wanderung, zwei Spinnen krabbeln von TV 1 bis TV 6
 *       :03  Kürbis-Auftritt, auf jedem TV hüpft ein großer Kürbis ins Bild
 *       :12  Abseilen, auf jedem TV seilt sich eine Spinne aus dem Netz ab
 *     Nach etwa 23 s ist alles vorbei, Goku & Co. starten erst bei :30.
 *
 * Wie beim Schnee wird der Zustand laufend aus der Uhrzeit berechnet. Ein TV,
 * der mitten in einem Auftritt einschaltet, steigt an der richtigen Stelle ein.
 * Bilder existieren nur, solange sie zu sehen sind (schwache TV-Prozessoren).
 * Fehler hier dürfen nie die Speisekarte stören, deshalb alles in try/catch.
 * ==============================================================================
 */

import { getSyncedTime, getState } from './state-manager.js';
import pumpkinSrc from './assets/halloween-pumpkin.gif';
import webSrc from './assets/halloween-web.gif';
import spiderSrc from './assets/halloween-spider.gif';

const SRC = { pumpkin: pumpkinSrc, web: webSrc, spider: spiderSrc };
const CHECK_INTERVAL_MS = 250;
const ROUND_MS = 60 * 1000;

// Deko je TV, Größen in Bildschirmhöhen, x als Anteil der Breite.
// Ausgemessen an den aktuellen Karten, damit kein Text verdeckt wird.
const DECO = {
  1: { webs: [{ at: 'tl', size: .3 }, { at: 'tr', size: .26 }],
       pumpkins: [{ at: 't', x: .5, size: .15 }, { at: 'b', x: .09, size: .18 }] },
  2: { webs: [{ at: 'tl', size: .17 }, { at: 'tr', size: .15 }],
       pumpkins: [{ at: 'b', x: .59, size: .12 }] },
  3: { webs: [{ at: 'tl', size: .22 }],
       pumpkins: [{ at: 't', x: .9, size: .13 }, { at: 'b', x: .62, size: .13 }] },
  4: { webs: [{ at: 'tl', size: .24 }],
       pumpkins: [{ at: 't', x: .82, size: .11 }, { at: 'b', x: .93, size: .16 }] },
  5: { webs: [{ at: 'tl', size: .22 }, { at: 'tr', size: .14 }],
       pumpkins: [{ at: 't', x: .76, size: .12 }, { at: 'b', x: .93, size: .16 }] },
  6: { webs: [{ at: 'tl', size: .18 }],
       pumpkins: [{ at: 't', x: .66, size: .1 }] }
};

// Auftritte einer Runde: Start (ms nach :00) und Gesamtdauer
const ACTS = {
  spiderWalk: { offset: 0, duration: 3400 * 6 + 2600 },
  pumpkinPop: { offset: 3000, duration: 9000 + 5 * 120 },
  spiderDrop: { offset: 12000, duration: 7000 + 5 * 300 }
};

let layer = null;
let activeScreenNumber = null;
let loopId = null;
let decoShown = false;
const startedActs = new Set();
let running = [];

export function initHalloweenEngine(containerEl, screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  layer = containerEl.querySelector('.elite-halloween-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'elite-halloween-layer';
    containerEl.appendChild(layer);
  }
  if (loopId) clearInterval(loopId);
  loopId = setInterval(() => {
    try { check(); } catch (err) { console.warn('🎃 [Halloween] Fehler', err); }
  }, CHECK_INTERVAL_MS);
}

export function setHalloweenActiveScreen(screenNum) {
  activeScreenNumber = screenNum ? parseInt(screenNum, 10) : null;
  clearAll();
}

function check() {
  if (!layer) return;
  const enabled = getState().settings?.halloweenEnabled === true;
  if (!enabled || !activeScreenNumber || !DECO[activeScreenNumber]) {
    if (decoShown || running.length) clearAll();
    return;
  }
  if (!decoShown) showDeco();

  const now = getSyncedTime();
  const round = Math.floor(now / ROUND_MS) * ROUND_MS;
  for (const [name, act] of Object.entries(ACTS)) {
    const id = `${round}:${name}`;
    const elapsed = now - round - act.offset;
    if (startedActs.has(id) || elapsed < 0 || elapsed >= act.duration) continue;
    startedActs.add(id);
    PLAY[name](elapsed);
  }
  // Alte Einträge vergessen
  if (startedActs.size > 12) {
    for (const id of startedActs) if (Number(id.split(':')[0]) < round) startedActs.delete(id);
  }
}

function screen() {
  return {
    k: activeScreenNumber - 1,
    W: window.innerWidth || 1920,
    H: window.innerHeight || 1080
  };
}

function addGif(key, width, extraClass = '') {
  const el = document.createElement('img');
  el.src = SRC[key];
  el.alt = '';
  el.className = `elite-halloween-gif elite-halloween-${key} ${extraClass}`;
  el.style.width = `${width}px`;
  layer.appendChild(el);
  return el;
}

/**
 * Animiert ein Element und entfernt es danach wieder.
 * elapsed: wie viele ms der Auftritt schon läuft (Einstieg mittendrin).
 */
function play(el, frames, { duration, delay = 0, easing = 'linear' }, elapsed) {
  if (typeof el.animate !== 'function') { el.remove(); return null; }
  const anim = el.animate(frames, { duration, delay: delay - elapsed, easing, fill: 'both' });
  const entry = { el, anim };
  running.push(entry);
  anim.onfinish = () => {
    el.remove();
    running = running.filter(r => r !== entry);
  };
  return anim;
}

function showDeco() {
  decoShown = true;
  const s = screen();
  const d = DECO[activeScreenNumber];
  for (const web of d.webs) {
    const w = s.H * web.size;
    const el = addGif('web', w, 'elite-halloween-deco');
    const mirror = web.at === 'tr';
    el.style.transform = `translate(${mirror ? s.W - w : 0}px, 0) scaleX(${mirror ? -1 : 1})`;
  }
  for (const pk of d.pumpkins) {
    const w = s.H * pk.size;
    const el = addGif('pumpkin', w, 'elite-halloween-deco');
    const x = Math.min(s.W - w, Math.max(0, s.W * pk.x - w / 2));
    const y = pk.at === 't' ? s.H * .02 : s.H - w * .98;
    el.style.transform = `translate(${x}px, ${y}px)`;
  }
  console.log(`🎃 [Halloween] Deko auf TV ${activeScreenNumber} an`);
}

function clearAll() {
  running.forEach(r => { try { r.anim.cancel(); } catch (e) {} });
  running = [];
  startedActs.clear();
  decoShown = false;
  if (layer) layer.replaceChildren();
}

const PLAY = {
  // Zwei Spinnen krabbeln in Schlangenlinien von TV 1 bis TV 6, mit kleinen
  // Rucklern. Jeder TV zeigt seinen Ausschnitt der gemeinsamen Strecke.
  spiderWalk(elapsed) {
    const s = screen();
    const perScreenMs = 3400;
    const crawlers = [{ y: .38, amp: .2, freq: 9, size: .17, delay: 0 },
                      { y: .62, amp: .16, freq: 7, size: .14, delay: 2600 }];
    for (const c of crawlers) {
      const w = s.H * c.size, h = w * 390 / 480;
      const el = addGif('spider', w, 'elite-halloween-crawler');
      const start = -w * 1.2, end = 6 * s.W + w * .2;
      const pos = (t) => ({
        x: start + (end - start) * (t + .012 * Math.sin(t * 60)) - s.k * s.W,
        y: s.H * (c.y + c.amp * Math.sin(t * c.freq)) - h / 2
      });
      const frames = [];
      for (let i = 0; i <= 120; i++) {
        const t = i / 120, a = pos(t), b = pos(Math.min(1, t + .004));
        // Das GIF krabbelt nach oben: Winkel der Laufrichtung + 90°
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
        frames.push({ transform: `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)` });
      }
      play(el, frames, { duration: perScreenMs * 6, delay: c.delay }, elapsed);
    }
  },

  // Auf jedem TV hüpft ein großer Kürbis an der Stelle des unteren Deko-Kürbisses
  // ins Bild, glüht ein paar Sekunden und taucht wieder ab
  pumpkinPop(elapsed) {
    const s = screen();
    const w = s.H * .3;
    const spot = DECO[activeScreenNumber].pumpkins.find(p => p.at === 'b') || { x: .85 };
    const x = Math.min(s.W - w, Math.max(0, s.W * spot.x - w / 2));
    const shown = s.H - w * .95, hidden = s.H + 4;
    const el = addGif('pumpkin', w);
    el.style.transformOrigin = '50% 100%';
    const T = (y, sx = 1, sy = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})` });
    play(el, [
      { ...T(hidden), offset: 0, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
      { ...T(shown, .94, 1.07), offset: .08 },
      { ...T(shown), offset: .12 },
      { ...T(shown), offset: .9, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { ...T(hidden), offset: 1 }
    ], { duration: 9000, delay: s.k * 120 }, elapsed);
  },

  // Aus dem Netz in der Ecke seilt sich eine Spinne am Faden ab und klettert wieder hoch
  spiderDrop(elapsed) {
    const s = screen();
    const w = s.H * .14, h = w * 390 / 480;
    const right = DECO[activeScreenNumber].webs[0]?.at === 'tr';
    const x = right ? s.W - s.H * .2 - w / 2 : s.H * .2 - w / 2;
    const el = addGif('spider', w, 'elite-halloween-crawler');
    const thread = document.createElement('div');
    thread.className = 'elite-halloween-thread';
    thread.style.left = `${x + w / 2}px`;
    thread.style.height = `${s.H}px`;
    layer.appendChild(thread);
    const T = (y) => ({ transform: `translate(${x}px, ${y}px) rotate(180deg)` });
    const down = s.H * .42, up = -h;
    const delay = s.k * 300;
    const anim = play(el, [
      { ...T(up), offset: 0, easing: 'cubic-bezier(.3,.8,.4,1)' }, { ...T(down), offset: .3 },
      { ...T(down - 6), offset: .45 }, { ...T(down), offset: .6 },
      { ...T(down), offset: .7, easing: 'ease-in' }, { ...T(up), offset: 1 }
    ], { duration: 7000, delay }, elapsed);
    const reach = (down + h / 2) / s.H;
    play(thread, [
      { transform: 'scaleY(0)' },
      { transform: `scaleY(${reach})`, offset: .3, easing: 'cubic-bezier(.3,.8,.4,1)' },
      { transform: `scaleY(${reach})`, offset: .7, easing: 'ease-in' },
      { transform: 'scaleY(0)' }
    ], { duration: 7000, delay }, elapsed);
    if (!anim) thread.remove();
  }
};

export function stopHalloweenEngine() {
  if (loopId) {
    clearInterval(loopId);
    loopId = null;
  }
  clearAll();
}
