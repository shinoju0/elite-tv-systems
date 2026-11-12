/**
 * ==============================================================================
 * ELITE SYSTEMS - MOBILE SMARTPHONE EINSTELLUNGEN & PIN LOCK SCREEN
 * ==============================================================================
 * Exklusives iOS-optimiertes Einstellungs-Dashboard für das Smartphone.
 * Beinhaltet einen minimalistischen Apple-PIN-Sperrbildschirm (PIN liegt nur auf dem Server),
 * Live-Steuerung von Schneefall, Goku, Ruffy, SpongeBob & Gon und Verwaltung für Bilder & Dauerschleifen-Videos
 * für die Bildschirme 1 (ganz links) bis 6 (ganz rechts).
 * Fotos und Videos landen auf dem eigenen Server, damit alle 6 TVs sie sehen.
 * 100% frei von SVG-Icons: Reine, elegante Apple-Typografie und lesbare Text-Buttons.
 * ==============================================================================
 */

import { getState, subscribeToState, updateState, updateScreenMedia, resetScreenImage, triggerSnowTest, triggerRunnerTest, nextTestStart, triggerTvReload, verifyAdminPin, setAdminPin, hasAdminPin, fetchTvClients, getSyncedTime } from './state-manager.js';
import { uploadMediaFile } from './image-compressor.js';
import { RUNNERS, findRunInProgress } from './runner-engine.js';
import { resolvePlayableMediaUrl, isGoogleDriveUrl } from './url-resolver.js';


// Physische Zuordnung der 6 TVs (Theken-Positionen)
const SCREEN_META = {
  1: { tag: "Ganz links (Theke 1)", color: "#F0820C" },
  2: { tag: "Position 2 (Theke 2)", color: "#C2410C" },
  3: { tag: "Position 3 (Theke 3)", color: "#D9651E" },
  4: { tag: "Position 4 (Theke 4)", color: "#2E7D32" },
  5: { tag: "Position 5 (Theke 5)", color: "#C84B15" },
  6: { tag: "Ganz rechts (Theke 6)", color: "#E05638" }
};

let enteredPin = "";
// Wann nach "Alle TVs neu laden" geprüft wird, ob alle TVs neu geladen haben
const RELOAD_CHECK_FIRST_MS = 20 * 1000;
const RELOAD_CHECK_SECOND_MS = 20 * 1000;
let isUploading = {};
// Damit die Karten nur neu aufgebaut werden, wenn sich an den Bildschirmen etwas ändert
let lastScreenCardsKey = '';
let toastTimeoutId = null;

export function initMobileAdmin() {
  const container = document.getElementById('app-root');
  if (!container) return;

  const isAuthenticated = hasAdminPin();

  container.innerHTML = `
    <div id="mobile-app" class="mobile-app-shell">
      <!-- Ambient Orange Glow Mesh Background -->
      <div class="apple-mesh-glow"></div>

      <!-- 1. MINIMALISTISCHER APPLE PIN LOCK SCREEN (OHNE SVGS) -->
      <div id="mobile-pin-screen" class="mobile-pin-screen ${isAuthenticated ? 'hidden' : 'active'}">
        <div class="pin-header">
          <div class="pin-brand-badge">EINSTELLUNGEN</div>
          <div class="pin-title-row">
            <img src="/logo.png" alt="" class="pin-logo" />
            <h1 class="pin-title">Elite Systems Login</h1>
          </div>
          <p class="pin-subtitle">Code eingeben</p>

          <!-- 4 Passcode-Kreise -->
          <div class="pin-dots-container" id="pin-dots-container">
            <div class="pin-dot" data-index="0"></div>
            <div class="pin-dot" data-index="1"></div>
            <div class="pin-dot" data-index="2"></div>
            <div class="pin-dot" data-index="3"></div>
          </div>

          <div id="pin-error-text" class="pin-error-text">Falscher Code. Bitte erneut versuchen.</div>
        </div>

        <!-- Clean Apple Keypad mit lesbarem 'Löschen'-Text -->
        <div class="ios-keypad">
          <button class="keypad-btn" data-key="1"><span class="key-num">1</span><span class="key-sub">&nbsp;</span></button>
          <button class="keypad-btn" data-key="2"><span class="key-num">2</span><span class="key-sub">ABC</span></button>
          <button class="keypad-btn" data-key="3"><span class="key-num">3</span><span class="key-sub">DEF</span></button>
          <button class="keypad-btn" data-key="4"><span class="key-num">4</span><span class="key-sub">GHI</span></button>
          <button class="keypad-btn" data-key="5"><span class="key-num">5</span><span class="key-sub">JKL</span></button>
          <button class="keypad-btn" data-key="6"><span class="key-num">6</span><span class="key-sub">MNO</span></button>
          <button class="keypad-btn" data-key="7"><span class="key-num">7</span><span class="key-sub">PQRS</span></button>
          <button class="keypad-btn" data-key="8"><span class="key-num">8</span><span class="key-sub">TUV</span></button>
          <button class="keypad-btn" data-key="9"><span class="key-num">9</span><span class="key-sub">WXYZ</span></button>
          <div class="keypad-spacer"></div>
          <button class="keypad-btn" data-key="0"><span class="key-num">0</span><span class="key-sub">&nbsp;</span></button>
          <button class="keypad-btn key-action" id="keypad-delete" aria-label="Löschen">
            <span class="key-del-label">Löschen</span>
          </button>
        </div>
      </div>

      <!-- 2. MOBILE EINSTELLUNGEN DASHBOARD (NACH PIN) -->
      <div id="mobile-dashboard" class="mobile-dashboard ${isAuthenticated ? 'active' : 'hidden'}">
        <!-- Top App Bar mit 'Einstellungen' Badge und Text-Logout -->
        <header class="mobile-nav-bar apple-glass">
          <div class="mobile-brand">
            <img src="/logo.png" alt="Logo" class="mobile-logo" />
            <div class="mobile-brand-meta">
              <h2 class="mobile-app-title">Elite Systems</h2>
              <span class="mobile-status-tag">Einstellungen</span>
            </div>
          </div>
          <div class="mobile-nav-actions">
            <button id="mobile-logout-btn" class="mobile-logout-btn" title="Abmelden">
              Abmelden
            </button>
          </div>
        </header>

        <main class="mobile-scroll-content">
          <!-- Globale Steuerung Sektion -->
          <div class="mobile-section-header">
            <span class="mobile-eyebrow">LIVE SIGNAGE STEUERUNG</span>
            <h3 class="mobile-section-title">Globale Effekte</h3>
          </div>

          <!-- Weihnachten: Deko und Dauerschnee auf allen TVs, aus = wieder nur Goku & Co. -->
          <div class="mobile-card apple-glass mb-6">
            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">🎄 Weihnachten</span>
                <span class="setting-caption">Kugeln, Glocken, Bäume, Geschenke und Dauerschnee auf allen TVs. Aus = wieder nur Goku & Co.</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-christmas-toggle" />
                <span class="ios-switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- Halloween: Deko und Spinnen auf allen TVs, aus = wieder nur Goku & Co. -->
          <div class="mobile-card apple-glass mb-6">
            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">🎃 Halloween</span>
                <span class="setting-caption">Netze, Kürbisse und Spinnen auf allen TVs. Aus = wieder nur Goku & Co.</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-halloween-toggle" />
                <span class="ios-switch-slider"></span>
              </label>
            </div>
          </div>

          <!-- Globale Steuerung Card -->
          <div class="mobile-card apple-glass">
            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">Schneefall</span>
                <span class="setting-caption">Alle 5 Minuten 20 Sekunden Schnee auf allen TVs gleichzeitig</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-snow-toggle" checked />
                <span class="ios-switch-slider"></span>
              </label>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-test-snow-btn" class="apple-btn-secondary w-full">
              Schneefall testen
            </button>

            <div class="mobile-divider"></div>

            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">Goku-Lauf</span>
                <span class="setting-caption">Goku, Ruffy, SpongeBob und Gon wechseln sich alle 2 Minuten ab</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-goku-toggle" checked />
                <span class="ios-switch-slider"></span>
              </label>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-test-goku-btn" class="apple-btn-secondary w-full">
              Goku-Lauf testen
            </button>

            <div class="mobile-divider"></div>

            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">Ruffy-Lauf</span>
                <span class="setting-caption">Läuft wie Goku von TV 1 bis TV 6</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-ruffy-toggle" checked />
                <span class="ios-switch-slider"></span>
              </label>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-test-ruffy-btn" class="apple-btn-secondary w-full">
              Ruffy-Lauf testen
            </button>

            <div class="mobile-divider"></div>

            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">SpongeBob</span>
                <span class="setting-caption">Erscheint klein unten rechts auf TV 6. Ausgeschaltete Figuren werden übersprungen</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-sponge-toggle" checked />
                <span class="ios-switch-slider"></span>
              </label>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-test-sponge-btn" class="apple-btn-secondary w-full">
              SpongeBob testen
            </button>

            <div class="mobile-divider"></div>

            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">Gon</span>
                <span class="setting-caption">Erscheint unten in der Mitte von TV 4</span>
              </div>
              <label class="ios-switch">
                <input type="checkbox" id="mobile-gon-toggle" checked />
                <span class="ios-switch-slider"></span>
              </label>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-test-gon-btn" class="apple-btn-secondary w-full">
              Gon testen
            </button>
          </div>

          <!-- Alle Fernseher auf einmal neu laden -->
          <div class="mobile-card apple-glass mt-6">
            <div class="mobile-setting-row">
              <div class="setting-text">
                <span class="setting-title">Alle TVs neu laden</span>
                <span class="setting-caption">Lädt die Seite auf allen 6 Fernsehern gleichzeitig neu, z. B. wenn ein TV hängt</span>
              </div>
            </div>

            <div class="mobile-divider"></div>

            <button id="mobile-reload-tvs-btn" class="apple-btn-secondary w-full">
              Alle TVs neu laden
            </button>
          </div>

          <!-- Bildschirme 1 bis 6 Upload Sektion (Bilder & Videos) -->
          <div class="mobile-section-header mt-6">
            <span class="mobile-eyebrow">BILDSCHIRME</span>
            <h3 class="mobile-section-title">Speisekarten & Videos</h3>
            <p class="mobile-section-sub">
              Lade eigene Fotos hoch oder trage Video-Links für Vollbild-Dauerschleifen ein.
            </p>
          </div>

          <div id="mobile-screens-list" class="mobile-screens-container">
            <!-- Dynamisch gerendert aus State -->
          </div>
        </main>
      </div>

      <!-- Toast Feedback -->
      <div id="mobile-toast" class="mobile-toast"></div>
    </div>
  `;

  setupPinLock();
  setupDashboardEvents();

  subscribeToState((state) => {
    updateMobileDashboardControls(state);
    renderMobileScreenCards(state);
  });
}

function setupPinLock() {
  const pinDots = document.querySelectorAll('.pin-dot');
  const errorText = document.getElementById('pin-error-text');
  const pinScreen = document.getElementById('mobile-pin-screen');
  const dashboard = document.getElementById('mobile-dashboard');

  const updateDots = () => {
    pinDots.forEach((dot, index) => {
      dot.classList.toggle('filled', index < enteredPin.length);
    });
  };

  const handleKey = (digit) => {
    if (enteredPin.length < 4) {
      enteredPin += digit;
      updateDots();
      errorText?.classList.remove('visible');

      if (enteredPin.length === 4) {
        setTimeout(validatePin, 120);
      }
    }
  };

  const handleDelete = () => {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updateDots();
      errorText?.classList.remove('visible');
    }
  };

  const validatePin = async () => {
    const result = await verifyAdminPin(enteredPin);
    if (result.ok) {
      setAdminPin(enteredPin);
      pinScreen.classList.remove('active');
      pinScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      dashboard.classList.add('active');
      showToast("Einstellungen geöffnet");
    } else {
      // Falsche PIN: freundlicher Standardtext, sonst z. B. Sperre oder kein Netz
      if (errorText) errorText.textContent = result.status === 401 || !result.error ? 'Falscher Code. Bitte erneut versuchen.' : result.error;
      errorText?.classList.add('visible');
      const dotsContainer = document.getElementById('pin-dots-container');
      dotsContainer?.classList.add('shake');
      setTimeout(() => {
        dotsContainer?.classList.remove('shake');
        enteredPin = "";
        updateDots();
      }, 500);
    }
  };

  document.querySelectorAll('.keypad-btn[data-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      if (key !== null) handleKey(key);
    });
  });

  const delBtn = document.getElementById('keypad-delete');
  delBtn?.addEventListener('click', handleDelete);
}

function showPinScreen() {
  setAdminPin(null);
  enteredPin = "";
  const pinDots = document.querySelectorAll('.pin-dot');
  pinDots.forEach(d => d.classList.remove('filled'));

  const pinScreen = document.getElementById('mobile-pin-screen');
  const dashboard = document.getElementById('mobile-dashboard');
  dashboard.classList.remove('active');
  dashboard.classList.add('hidden');
  pinScreen.classList.remove('hidden');
  pinScreen.classList.add('active');
}

/**
 * Prüft nach einem Test, auf welchen Fernsehern der Effekt wirklich lief
 * (die TVs melden ihre Effekte bei jeder Abfrage an den Server).
 * @param {'goku'|'ruffy'|'sponge'|'gon'|'snow'} effect 
 * @param {number} startsAt Geplanter Start (Serverzeit)
 * @param {number} checkAfterMs Wann nach dem Start geprüft wird
 * @param {string} label 
 * @param {string[]} screens Auf welchen TVs der Effekt laufen soll
 */
async function reportTestResult(effect, startsAt, checkAfterMs, label, screens = ['1', '2', '3', '4', '5', '6']) {
  const waitMs = Math.max(0, startsAt - getSyncedTime()) + checkAfterMs;
  await new Promise(resolve => setTimeout(resolve, waitMs));

  const clients = await fetchTvClients();
  if (!clients) return;
  const played = new Set(clients
    .filter(c => c.screen && Number(c[effect]) >= startsAt - 1000)
    .map(c => String(c.screen)));
  const missing = screens.filter(n => !played.has(n));

  if (missing.length === 0) {
    showToast(screens.length === 1 ? `✅ ${label} lief auf TV ${screens[0]}` : `✅ ${label} lief auf allen ${screens.length} TVs`);
  } else if (screens.length === 1) {
    showToast(`${label}: keine Rückmeldung von TV ${screens[0]}`);
  } else {
    showToast(`${label} lief auf ${screens.length - missing.length} von ${screens.length} TVs – keine Rückmeldung von TV ${missing.join(', ')}`);
  }
}

/**
 * Prüft nach "Alle TVs neu laden", welche Fernseher sich mit frisch geladener
 * Seite zurückgemeldet haben. Wer nach dem ersten Blick noch fehlt, bekommt
 * eine zweite Chance (langsame TVs brauchen länger zum Laden).
 * @param {number} triggeredAt Zeitpunkt des Befehls (Serverzeit)
 */
async function reportReloadResult(triggeredAt) {
  let missing = [];
  for (const waitMs of [RELOAD_CHECK_FIRST_MS, RELOAD_CHECK_SECOND_MS]) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const clients = await fetchTvClients();
    if (!clients) return;
    const reloaded = new Set(clients
      .filter(c => c.screen && Number(c.loadedAt) >= triggeredAt)
      .map(c => String(c.screen)));
    missing = ['1', '2', '3', '4', '5', '6'].filter(n => !reloaded.has(n));
    if (missing.length === 0) break;
  }

  if (missing.length === 0) {
    showToast('✅ Alle 6 TVs wurden neu geladen');
  } else {
    showToast(`${6 - missing.length} von 6 TVs neu geladen – keine Rückmeldung von TV ${missing.join(', ')}`);
  }
}

/**
 * Zeigt auf dem Test-Knopf einen Countdown bis zum Start und danach, dass der
 * Effekt läuft, damit sofort sichtbar ist, dass der Befehl angekommen ist.
 * @param {HTMLButtonElement} btn 
 * @param {number} startsAt Geplanter Start (Serverzeit)
 * @param {number} runningMs Wie lange der Effekt sichtbar läuft
 */
function runButtonCountdown(btn, startsAt, runningMs) {
  const originalLabel = btn.dataset.label || btn.textContent.trim();
  btn.dataset.label = originalLabel;
  btn.disabled = true;

  const tick = () => {
    const remainingMs = startsAt - getSyncedTime();
    if (remainingMs > 0) {
      btn.textContent = `Startet in ${Math.ceil(remainingMs / 1000)} …`;
    } else if (remainingMs > -runningMs) {
      btn.textContent = 'Läuft auf den TVs …';
    } else {
      clearInterval(timer);
      btn.textContent = originalLabel;
      btn.disabled = false;
    }
  };
  const timer = setInterval(tick, 200);
  tick();
}

function setupDashboardEvents() {
  const logoutBtn = document.getElementById('mobile-logout-btn');
  const snowToggle = document.getElementById('mobile-snow-toggle');
  const testSnowBtn = document.getElementById('mobile-test-snow-btn');

  logoutBtn?.addEventListener('click', showPinScreen);

  // Speichern fehlgeschlagen -> ehrlich anzeigen statt Erfolg vorzutäuschen
  window.addEventListener('elite_save_failed', (e) => {
    const { status, message } = e.detail || {};
    if (status === 401) {
      showPinScreen();
      showToast("Nicht gespeichert – bitte PIN neu eingeben");
    } else {
      showToast(`⚠️ Nicht gespeichert: ${message}`);
    }
  });

  document.getElementById('mobile-christmas-toggle')?.addEventListener('change', async (e) => {
    const ok = await updateState({
      settings: { christmasEnabled: e.target.checked }
    });
    if (ok) showToast(e.target.checked ? "Weihnachten aktiviert" : "Weihnachten deaktiviert – wieder nur Goku & Co.");
  });

  document.getElementById('mobile-halloween-toggle')?.addEventListener('change', async (e) => {
    const ok = await updateState({
      settings: { halloweenEnabled: e.target.checked }
    });
    if (ok) showToast(e.target.checked ? "Halloween aktiviert" : "Halloween deaktiviert – wieder nur Goku & Co.");
  });

  snowToggle?.addEventListener('change', async (e) => {
    const ok = await updateState({
      settings: { snowEnabled: e.target.checked }
    });
    if (ok) showToast(e.target.checked ? "Schneefall aktiviert" : "Schneefall deaktiviert");
  });

  testSnowBtn?.addEventListener('click', async () => {
    testSnowBtn.classList.add('btn-animating');
    const { ok, startsAt } = await triggerSnowTest();
    setTimeout(() => testSnowBtn.classList.remove('btn-animating'), 1000);
    if (!ok) return;
    const snowDurationMs = (getState().settings?.snowDurationSeconds || 20) * 1000;
    runButtonCountdown(testSnowBtn, startsAt, snowDurationMs);
    // Der Schnee meldet sich beim Start, die TVs fragen alle 5 s nach
    reportTestResult('snow', startsAt, 7000, 'Schnee');
  });

  const reloadTvsBtn = document.getElementById('mobile-reload-tvs-btn');
  reloadTvsBtn?.addEventListener('click', async () => {
    reloadTvsBtn.classList.add('btn-animating');
    const { ok, triggeredAt } = await triggerTvReload();
    setTimeout(() => reloadTvsBtn.classList.remove('btn-animating'), 1000);
    if (!ok) return;
    reloadTvsBtn.disabled = true;
    reloadTvsBtn.textContent = 'TVs laden neu …';
    showToast('Befehl gesendet – die TVs laden in den nächsten Sekunden neu');
    // Die TVs fragen alle 5 s nach, das Neuladen selbst dauert auf den TVs ein paar Sekunden
    await reportReloadResult(triggeredAt);
    reloadTvsBtn.textContent = 'Alle TVs neu laden';
    reloadTvsBtn.disabled = false;
  });

  // Goku, Ruffy, SpongeBob und Gon: je ein Schalter und ein Test-Knopf
  for (const [key, label, enabledKey] of [['goku', 'Goku', 'gokuEnabled'], ['ruffy', 'Ruffy', 'ruffyEnabled'], ['sponge', 'SpongeBob', 'spongeEnabled'], ['gon', 'Gon', 'gonEnabled']]) {
    const toggle = document.getElementById(`mobile-${key}-toggle`);
    const testBtn = document.getElementById(`mobile-test-${key}-btn`);

    toggle?.addEventListener('change', async (e) => {
      const ok = await updateState({
        settings: { [enabledKey]: e.target.checked }
      });
      if (ok) showToast(e.target.checked ? `${label} aktiviert` : `${label} deaktiviert`);
    });

    testBtn?.addEventListener('click', async () => {
      // Läuft zum Startzeitpunkt noch eine Animation, würden die TVs den Test
      // überspringen (nie zwei Figuren gleichzeitig) – dann lieber gleich sagen
      const busy = findRunInProgress(nextTestStart(), getState().settings || {});
      if (busy) {
        const waitSeconds = Math.max(1, Math.ceil((busy.end - nextTestStart()) / 1000) + 1);
        showToast(`Gerade läuft noch ${RUNNERS[busy.key].label} – bitte in ${waitSeconds} s nochmal testen`);
        return;
      }
      testBtn.classList.add('btn-animating');
      const { ok, startsAt } = await triggerRunnerTest(key);
      setTimeout(() => testBtn.classList.remove('btn-animating'), 1000);
      if (!ok) return;
      const runner = RUNNERS[key];
      if (runner.kind === 'corner') {
        // SpongeBob/Gon erscheinen nur auf ihrem TV, der meldet sich spätestens 5 s später
        runButtonCountdown(testBtn, startsAt, runner.visibleMs);
        reportTestResult(key, startsAt, runner.visibleMs + 7000, label, [String(runner.screen)]);
        return;
      }
      // Eine Figur braucht etwa 6 × 3,5 s von TV 1 bis TV 6
      const speed = getState().settings?.gokuSpeed || 3.5;
      runButtonCountdown(testBtn, startsAt, 6 * speed * 1000);
      // TV 6 startet 5 × 3,5 s nach TV 1, dazu kommen bis zu 5 s bis zur nächsten Meldung
      reportTestResult(key, startsAt, 5 * speed * 1000 + 7000, label);
    });
  }
}

function updateMobileDashboardControls(state) {
  const settings = state.settings || {};
  const snowToggle = document.getElementById('mobile-snow-toggle');
  const gokuToggle = document.getElementById('mobile-goku-toggle');
  const ruffyToggle = document.getElementById('mobile-ruffy-toggle');
  const spongeToggle = document.getElementById('mobile-sponge-toggle');
  const gonToggle = document.getElementById('mobile-gon-toggle');
  const halloweenToggle = document.getElementById('mobile-halloween-toggle');
  const christmasToggle = document.getElementById('mobile-christmas-toggle');

  if (snowToggle && settings.snowEnabled !== undefined) {
    snowToggle.checked = settings.snowEnabled;
  }
  if (gokuToggle && settings.gokuEnabled !== undefined) {
    gokuToggle.checked = settings.gokuEnabled;
  }
  if (ruffyToggle) {
    ruffyToggle.checked = settings.ruffyEnabled !== false;
  }
  if (spongeToggle) {
    spongeToggle.checked = settings.spongeEnabled !== false;
  }
  if (gonToggle) {
    gonToggle.checked = settings.gonEnabled !== false;
  }
  if (halloweenToggle) {
    halloweenToggle.checked = settings.halloweenEnabled === true;
  }
  if (christmasToggle) {
    christmasToggle.checked = settings.christmasEnabled === true;
  }
}

/**
 * Rendert die Karten für Bildschirme 1 bis 6 (Bilder & Dauerschleifen-Videos).
 */
function renderMobileScreenCards(state) {
  const container = document.getElementById('mobile-screens-list');
  if (!container) return;

  const screens = state.screens || {};
  const screenNumbers = [1, 2, 3, 4, 5, 6];

  // Effekt-Tests und Schalter ändern nur die Einstellungen – dann bleiben die
  // Karten stehen, statt alle Vorschauen neu zu laden
  const key = JSON.stringify({ screens, uploading: Object.keys(isUploading) });
  if (key === lastScreenCardsKey) return;
  lastScreenCardsKey = key;

  container.innerHTML = screenNumbers.map(num => {
    const s = screens[num] || {};
    const meta = SCREEN_META[num] || { tag: `TV ${num}`, color: '#F0820C' };
    const uploading = isUploading[num];
    const mediaUrl = s.mediaUrl || s.imageUrl;
    const hasCustomMedia = Boolean(mediaUrl && !mediaUrl.startsWith('/default-menus/'));
    const isVideo = s.mediaType === 'video' || (mediaUrl && (mediaUrl.includes('.mp4') || mediaUrl.includes('.webm')));

    return `
      <div class="mobile-screen-card apple-glass" data-screen="${num}">
        <div class="screen-card-header">
          <div class="screen-header-left">
            <h4 class="screen-name">Bildschirm ${num}</h4>
            <span class="screen-pos-tag" style="color: ${meta.color}">${meta.tag}</span>
          </div>
          ${hasCustomMedia ? `
            <span class="media-type-badge ${isVideo ? 'video-badge' : 'photo-badge'}">
              ${isVideo ? 'VIDEO' : 'FOTO'}
            </span>
          ` : ''}
        </div>

        <div class="screen-thumbnail-wrap">
          ${hasCustomMedia ? (
            isVideo ? `
              <video src="${mediaUrl}#t=0.5" class="screen-thumb" muted playsinline preload="metadata"></video>
            ` : `
              <img src="${mediaUrl}" alt="Speisekarte ${num}" class="screen-thumb" />
            `
          ) : `
            <div class="screen-tv-placeholder">
              <span class="tv-placeholder-badge">TV STANDBY</span>
              <span class="tv-placeholder-title">Cleane „Speisekarte“ aktiv</span>
              <span class="tv-placeholder-hint">Foto oder Video (MP4) hochladen</span>
            </div>
          `}

          ${uploading ? `
            <div class="upload-progress-overlay">
              <div class="progress-spinner"></div>
              <span class="progress-text">${uploading.status || `${uploading.percent}% verarbeitet`}</span>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${uploading.percent}%"></div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="screen-card-actions">
          <input type="file" id="file-photo-${num}" class="hidden-file-input" accept="image/png,image/jpeg,image/webp" />
          <input type="file" id="file-video-${num}" class="hidden-file-input" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" />

          <div class="action-btn-row">
            <button class="apple-btn-primary btn-upload-photo" data-screen="${num}" ${uploading ? 'disabled' : ''}>
              Foto wählen
            </button>
            <button class="apple-btn-primary btn-upload-video" data-screen="${num}" ${uploading ? 'disabled' : ''}>
              Video wählen
            </button>
          </div>

          <div class="action-btn-subrow">
            <button class="apple-link-btn btn-set-video-url" data-screen="${num}">
              Video-Link eingeben
            </button>
            ${hasCustomMedia ? `
              <button class="apple-link-btn btn-reset text-danger" data-screen="${num}" title="Auf Speisekarte zurücksetzen">
                Zurücksetzen
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // 1. Foto- und Video-Upload Buttons (öffnen die jeweilige Dateiauswahl)
  container.querySelectorAll('.btn-upload-photo, .btn-upload-video').forEach(btn => {
    btn.addEventListener('click', () => {
      const num = btn.getAttribute('data-screen');
      const kind = btn.classList.contains('btn-upload-video') ? 'video' : 'photo';
      const input = document.getElementById(`file-${kind}-${num}`);
      if (input) input.click();
    });
  });

  // 2. Video-URL Button (100% kostenlos: Vorinstalliert, Cloud oder Direct Stream)
  container.querySelectorAll('.btn-set-video-url').forEach(btn => {
    btn.addEventListener('click', async () => {
      const num = parseInt(btn.getAttribute('data-screen'), 10);
      const current = screens[num]?.mediaUrl || '';
      const promptValue = (screens[num]?.mediaType === 'video' && current) ? current : '/videos/werbung-elite-burger.mp4';

      const entered = window.prompt(
        `Video für Bildschirm ${num} einstellen:\n\n` +
        `• „1“ tippen: Vorinstalliertes Elite Burger Werbevideo (1080p Web-Optimiert, Fast-Start)\n` +
        `• Oder direkten MP4-Stream / Google Drive Link eingeben:`,
        promptValue
      );

      if (entered !== null) {
        let cleanUrl = entered.trim();
        if (cleanUrl === '1' || cleanUrl.toLowerCase() === 'burger' || cleanUrl.toLowerCase() === 'elite burger') {
          cleanUrl = '/videos/werbung-elite-burger.mp4';
        }
        if (cleanUrl) {
          const streamUrl = resolvePlayableMediaUrl(cleanUrl);
          if (!await updateScreenMedia(num, streamUrl, 'video')) return;
          if (streamUrl === '/videos/werbung-elite-burger.mp4') {
            showToast(`Elite Burger Video für Bildschirm ${num} aktiv!`);
          } else if (isGoogleDriveUrl(cleanUrl)) {
            showToast(`Google Drive Video für Bildschirm ${num} verknüpft!`);
          } else {
            showToast(`Video-URL für Bildschirm ${num} gespeichert!`);
          }
        } else if (promptValue) {
          if (!await resetScreenImage(num)) return;
          showToast(`Bildschirm ${num} auf Speisekarte zurückgesetzt`);
        }
      }
    });
  });

  // 3. File-Inputs Listener
  container.querySelectorAll('.hidden-file-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const num = parseInt(input.id.replace(/^file-(photo|video|media)-/, ''), 10);
      await handleFileUpload(num, file);
      input.value = '';
    });
  });

  // 5. Reset Buttons
  container.querySelectorAll('.btn-reset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const num = parseInt(btn.getAttribute('data-screen'), 10);
      if (!await resetScreenImage(num)) return;
      showToast(`Bildschirm ${num} zurückgesetzt`);
    });
  });
}

/**
 * Aktualisiert nur Balken und Text des laufenden Uploads, statt alle Karten neu
 * aufzubauen.
 */
function updateUploadProgress(screenNumber) {
  const card = document.querySelector(`.mobile-screen-card[data-screen="${screenNumber}"]`);
  const uploading = isUploading[screenNumber];
  const text = card?.querySelector('.progress-text');
  const fill = card?.querySelector('.progress-bar-fill');
  if (!uploading || !text || !fill) {
    renderMobileScreenCards(getState());
    return;
  }
  text.textContent = uploading.status || `${uploading.percent}% verarbeitet`;
  fill.style.width = `${uploading.percent}%`;
}

/**
 * Lädt ein Bild oder Video auf den Server und trägt es für den Bildschirm ein.
 * Klappt etwas nicht, steht es als Meldung auf dem Handy.
 */
async function handleFileUpload(screenNumber, file) {
  try {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    isUploading[screenNumber] = { percent: 2, status: isVideo ? "Video wird vorbereitet..." : "Bild wird optimiert..." };
    renderMobileScreenCards(getState());

    const result = await uploadMediaFile(screenNumber, file, (percent, statusText) => {
      isUploading[screenNumber] = { percent, status: statusText };
      updateUploadProgress(screenNumber);
    });

    // Medien im globalen State & auf dem Elite-Server aktualisieren
    const saved = await updateScreenMedia(screenNumber, result.mediaUrl, result.mediaType);

    delete isUploading[screenNumber];
    renderMobileScreenCards(getState());
    // Fehlgeschlagenes Speichern meldet bereits der elite_save_failed-Listener
    if (saved) showToast(`Bildschirm ${screenNumber} (${result.mediaType === 'video' ? 'Video' : 'Bild'}) aktualisiert`);
  } catch (error) {
    delete isUploading[screenNumber];
    renderMobileScreenCards(getState());
    console.error("Upload Fehler:", error);
    if (error.status === 401) {
      showPinScreen();
      showToast("Nicht hochgeladen – bitte PIN neu eingeben");
    } else {
      showToast(`⚠️ Nicht hochgeladen: ${error.message || 'Fehler beim Hochladen'}`);
    }
  }
}

/**
 * Toast-Benachrichtigung im Apple-Stil.
 */
function showToast(message) {
  const toast = document.getElementById('mobile-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('visible');

  // Eine neue Meldung bekommt ihre volle Zeit, statt mit der alten zu verschwinden
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}
