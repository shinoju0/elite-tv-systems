/**
 * ==============================================================================
 * ELITE SYSTEMS - SMART TV DASHBOARD & FULLSCREEN MANAGER
 * ==============================================================================
 * Rendert das 3x2 Kachel-Dashboard, verwaltet den randlosen Vollbild-Modus
 * mit Persistenz (Auto-Boot). Das Einstellungsmodal zeigt nur den QR-Code fürs
 * Handy, eingestellt wird am TV nur, welchen Bildschirm er zeigt (Übersicht).
 * 100% frei von SVG-Icons: Reine Typografie & HTML/CSS.
 * Unterstützt Bilder & Videos in nativer Endlosschleife im Vollbild (100% kostenlos).
 * ==============================================================================
 */

import { getState, subscribeToState, setTvView, reportVideoHealth } from './state-manager.js';
import { setFocus, setFullscreenExitCallback } from './tv-navigation.js';
import { initSnowEngine, setSnowActiveScreen } from './snow-engine.js';
import { initRunnerEngine, setRunnerActiveScreen } from './runner-engine.js';
import { initHalloweenEngine, setHalloweenActiveScreen } from './halloween-engine.js';
import { initChristmasEngine, setChristmasActiveScreen } from './christmas-engine.js';
import { renderDefaultMenuHTML } from './default-menu-data.js';
import {
  resolvePlayableMediaUrl,
  extractGoogleDriveFileId,
  getGoogleDrivePreviewUrl,
  getGoogleDriveStreamUrl,
  getGoogleDriveThumbnailUrl
} from './url-resolver.js';
import QRCode from 'qrcode';

const STORAGE_ASSIGNED_SCREEN_KEY = 'elite_tv_assigned_screen';

let currentAssignedScreen = null;
let videoRetryTimeoutId = null;

const VIDEO_WATCHDOG_MS = 5 * 1000;
const VIDEO_RETRY_MS = 15 * 1000;
// So viele Wächter-Runden ohne Fortschritt, bis das Video neu angestoßen wird
const VIDEO_STUCK_CHECKS = 2;

// Server-Adresse des aktuell gewählten Videos. Bewusst direkt gestreamt: Aus dem Speicher
// (blob:) abgespielt bleibt das Bild auf den meisten TV-Browsern schwarz.
let videoSourceUrl = null;
let videoStalls = 0;
// So lange bleiben Übersicht-Knopf und Mauszeiger nach der letzten Eingabe sichtbar
const CONTROLS_VISIBLE_MS = 4 * 1000;
let isFullscreenActive = false;
let clockInterval = null;

// Physische Anordnung der 6 Bildschirme über der Theke (Ohne TV-Nummern-Label)
const SCREEN_META = {
  1: { tag: "Rechts", color: "#F0820C" },
  2: { tag: "Position 2", color: "#C2410C" },
  3: { tag: "Position 3", color: "#D9651E" },
  4: { tag: "Position 4", color: "#2E7D32" },
  5: { tag: "Position 5", color: "#C84B15" },
  6: { tag: "Links", color: "#E05638" }
};

/**
 * Aktiviert das native Browser-Vollbild (Hardware Kiosk-Modus).
 */
export function requestBrowserFullscreen() {
  const elem = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => { });
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }
}

export function initTVDashboard() {
  const container = document.getElementById('app-root');
  if (!container) return;

  // TV View Shell rendern (Minimalistische Apple tvOS Ästhetik - OHNE SVGs)
  container.innerHTML = `
    <div id="tv-app" class="tv-app-shell">
      <!-- Ambient Orange Glow Mesh Background -->
      <div class="apple-mesh-glow"></div>

      <!-- Minimalist Apple tvOS Header mit lesbaren Text-Buttons -->
      <header class="tv-header">
        <div class="tv-brand">
          <img src="/logo.png" alt="Elite Systems" class="tv-brand-logo" />
          <h1 class="tv-title">Elite Systems</h1>
        </div>

        <div class="tv-header-actions">
          <div class="tv-clock-badge">
            <span id="tv-live-clock">--:--</span>
          </div>
          <button id="tv-settings-btn" class="tv-text-btn apple-glass" data-tv-focus="true" title="Optionen">
            Optionen
          </button>
        </div>
      </header>

      <!-- 3x2 Grid Zentrum -->
      <main class="tv-main-content">
        <div id="tv-grid-container" class="tv-grid-3x2">
          <!-- Dynamisch gerendert aus State -->
        </div>
      </main>

      <!-- Vollbild-Speisekarten-Container (100vw x 100vh) für Video & Bild -->
      <div id="tv-fullscreen-view" class="tv-fullscreen-overlay">
        <!-- 1. Video Container (Autoplay, Dauerschleife, Stumm, 100% flüssig & hardwarebeschleunigt) -->
        <video id="fullscreen-menu-video" class="fullscreen-media fullscreen-video" autoplay loop muted playsinline webkit-playsinline preload="auto" style="display:none;"></video>

        <!-- 2. Bild Container -->
        <img id="fullscreen-menu-image" src="" alt="Live Speisekarte" class="fullscreen-media fullscreen-image" style="display:none;" />

        <!-- 3. Clean 'Speisekarte' Platzhalter (100% SVG-frei) -->
        <div id="fullscreen-default-menu" class="fullscreen-media fullscreen-default-wrapper" style="display:none;"></div>

        <!-- 4. Schneefall (überlagert Video und Bild, auf allen TVs gleichzeitig) -->
        <div class="elite-snow-layer"></div>

        <!-- 4b. Halloween-Deko und -Auftritte (Schalter im Admin-Panel) -->
        <div class="elite-halloween-layer"></div>

        <!-- 4c. Weihnachts-Deko und Dauerschnee (Schalter im Admin-Panel) -->
        <div class="elite-christmas-layer"></div>

        <!-- 5. Goku/Ruffy-Läufer hängt die runner-engine.js hier an (1/3 Bildschirmhöhe unten) -->

        <!-- 6. Eleganter Apple-Glass Zurück-Button (erscheint dezent bei Maus-/Fernbedienungs-Bewegung) -->
        <button id="fullscreen-exit-btn" class="fullscreen-exit-hint apple-glass" aria-label="Zurück zur Übersicht">
          <span class="hint-badge">TV</span>
          <span>Übersicht</span>
        </button>
      </div>

      <!-- TV Einstellungs-Modal (Apple Glassmorphism - Text-Buttons statt Icons) -->
      <div id="tv-settings-modal" class="tv-modal">
        <div class="tv-modal-card apple-glass">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <h2 class="modal-title">Einstellungen</h2>
              <span class="modal-subtitle">Effekte, Fotos und Videos stellst du am Handy ein</span>
            </div>
            <button id="modal-close-btn" class="modal-close-btn apple-glass" data-tv-focus="true" aria-label="Schließen">Schließen</button>
          </div>

          <div class="modal-body">
            <!-- Am TV wird nichts eingestellt: Effekte und Medien laufen über das Handy -->
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Bildschirm wählen</span>
                <span class="setting-desc">Schließen und in der Übersicht die Kachel anklicken, die dieser Fernseher zeigen soll</span>
              </div>
            </div>

            <!-- Alles andere über das Smartphone (QR-Code) -->
            <div class="setting-row qr-section">
              <div class="qr-info-box">
                <div class="qr-badge">SMARTPHONE EINSTELLUNGEN</div>

                <h3 class="qr-heading">Einstellungen & Medien verwalten</h3>
                <p class="qr-description">
                  Scanne den QR-Code mit deinem Smartphone, um die Einstellungen zu öffnen und Speisekarten oder Videos festzulegen.
                </p>
                <div class="qr-url-row">
                  <div class="qr-url-text" id="mobile-admin-url"></div>
                  <button id="modal-copy-link-btn" class="apple-btn-secondary qr-copy-btn" data-tv-focus="true" title="Link kopieren">
                    Link kopieren
                  </button>
                </div>
              </div>
              <div class="qr-code-frame">
                <canvas id="qr-canvas"></canvas>
                <span class="qr-scan-label">Mit Smartphone-Kamera scannen</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Live-Uhr initialisieren
  startLiveClock();

  // Sofortige Reaktion auf lokale & entfernte Medien-Updates
  window.addEventListener('elite_screen_update', (e) => {
    const { screenNumber } = e.detail || {};
    if (isFullscreenActive && currentAssignedScreen === screenNumber) {
      updateFullscreenMedia(getState());
    }
    renderGridTiles(getState());
  });

  // Navigation Callback bei Vollbild-Beenden
  setFullscreenExitCallback(() => {
    exitFullscreenMode();
  });

  const fullscreenView = document.getElementById('tv-fullscreen-view');
  const exitBtn = document.getElementById('fullscreen-exit-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exitFullscreenMode();
    });
  }

  // Übersicht-Knopf nur einblenden, wenn jemand Fernbedienung oder Maus benutzt,
  // und nach kurzer Zeit wieder ausblenden
  let hideControlsTimeoutId = null;
  const showControlsBriefly = () => {
    fullscreenView.classList.add('controls-visible');
    if (hideControlsTimeoutId) clearTimeout(hideControlsTimeoutId);
    hideControlsTimeoutId = setTimeout(() => {
      fullscreenView.classList.remove('controls-visible');
    }, CONTROLS_VISIBLE_MS);
  };
  for (const type of ['mousemove', 'pointerdown', 'touchstart', 'keydown', 'wheel']) {
    window.addEventListener(type, () => {
      if (isFullscreenActive) showControlsBriefly();
    }, { passive: true });
  }

  // Doppelklick auf dem Vollbild schließt ebenfalls
  fullscreenView.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    exitFullscreenMode();
  });

  // Klick auf das Video stellt sicher, dass es läuft (Autoplay Entsperrung)
  const videoEl = document.getElementById('fullscreen-menu-video');
  if (videoEl) {
    videoEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    });

    // Endlosschleife absichern: Manche TV-Browser bleiben am Ende trotz `loop` stehen
    videoEl.addEventListener('ended', () => {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
    });

    // Musste das Video mangels Daten anhalten, zählt das als Ruckler (sichtbar in /api/clients)
    videoEl.addEventListener('waiting', () => {
      if (videoEl.currentTime > 0) reportVideoHealth({ stalls: ++videoStalls });
    });

    // Wächter: Ein sichtbares Video, das angehalten wurde oder hängt, wieder anstoßen
    let lastTime = -1;
    let stuckChecks = 0;
    setInterval(() => {
      if (videoEl.style.display === 'none' || !videoEl.getAttribute('src')) {
        stuckChecks = 0;
        return;
      }
      if (videoEl.paused || videoEl.ended) videoEl.play().catch(() => {});
      stuckChecks = videoEl.currentTime === lastTime ? stuckChecks + 1 : 0;
      lastTime = videoEl.currentTime;
      if (stuckChecks >= VIDEO_STUCK_CHECKS) {
        // Bild steht seit über 10 s: Video neu laden, ab der gleichen Stelle weiter
        console.warn("⚠️ [Elite Systems] Video hängt, starte es neu.");
        stuckChecks = 0;
        const resumeAt = videoEl.currentTime;
        videoEl.load();
        videoEl.addEventListener('loadedmetadata', () => {
          videoEl.currentTime = resumeAt;
        }, { once: true });
        videoEl.play().catch(() => {});
      }
    }, VIDEO_WATCHDOG_MS);
  }

  // Modal Buttons verknüpfen
  setupModalEvents();

  // Schnee-Engine & Läufer am Vollbild-Container anhängen
  initSnowEngine(fullscreenView, currentAssignedScreen);
  initRunnerEngine(fullscreenView, currentAssignedScreen);
  initHalloweenEngine(fullscreenView, currentAssignedScreen);
  initChristmasEngine(fullscreenView, currentAssignedScreen);

  // State-Abonnement
  subscribeToState((state) => {
    renderGridTiles(state);
    if (isFullscreenActive && currentAssignedScreen) {
      updateFullscreenMedia(state);
    }
  });

  // Globaler Einmal-Listener für erste Interaktion zur Aktivierung des Browser-Vollbilds
  const triggerNativeFullscreenOnce = () => {
    requestBrowserFullscreen();
    window.removeEventListener('click', triggerNativeFullscreenOnce);
    window.removeEventListener('keydown', triggerNativeFullscreenOnce);
    window.removeEventListener('touchstart', triggerNativeFullscreenOnce);
  };
  window.addEventListener('click', triggerNativeFullscreenOnce, { once: true });
  window.addEventListener('keydown', triggerNativeFullscreenOnce, { once: true });
  window.addEventListener('touchstart', triggerNativeFullscreenOnce, { once: true });

  // SOFORTIGES VOLLBILD BEIM ÖFFNEN DER WEBAPP:
  const urlParams = new URLSearchParams(window.location.search);
  const screenParam = urlParams.get('screen');

  let targetScreen = null;
  if (screenParam) {
    const parsed = parseInt(screenParam, 10);
    if (parsed >= 1 && parsed <= 6) {
      targetScreen = parsed;
      localStorage.setItem(STORAGE_ASSIGNED_SCREEN_KEY, targetScreen.toString());
    }
  }

  if (!targetScreen) {
    const savedScreen = localStorage.getItem(STORAGE_ASSIGNED_SCREEN_KEY);
    if (savedScreen) {
      const parsed = parseInt(savedScreen, 10);
      if (parsed >= 1 && parsed <= 6) {
        targetScreen = parsed;
      }
    }
  }

  if (!targetScreen) {
    targetScreen = 1;
    localStorage.setItem(STORAGE_ASSIGNED_SCREEN_KEY, "1");
  }

  console.log(`🚀 [Elite Systems] Sofortiger Vollbild-Start für Bildschirm ${targetScreen}!`);
  setTimeout(() => {
    enterFullscreenMode(targetScreen);
    requestBrowserFullscreen();
  }, 100);
}

/**
 * Startet die präzise Live-Uhr im Apple-Stil.
 */
function startLiveClock() {
  const clockEl = document.getElementById('tv-live-clock');
  const update = () => {
    if (!clockEl) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}`;
  };
  update();
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(update, 1000);
}

/**
 * Rendert das 3x2 Kachel-Grid für Bildschirm 1 bis 6.
 */
function renderGridTiles(state) {
  const container = document.getElementById('tv-grid-container');
  if (!container) return;

  const screens = state.screens || {};
  const screenNumbers = [1, 2, 3, 4, 5, 6];

  container.innerHTML = screenNumbers.map(num => {
    const s = screens[num] || {};
    let mediaUrl = s.mediaUrl || s.imageUrl;
    if (mediaUrl) mediaUrl = resolvePlayableMediaUrl(mediaUrl);

    const driveId = extractGoogleDriveFileId(mediaUrl);
    const isVideo = s.mediaType === 'video' || (mediaUrl && (mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || Boolean(driveId)));
    const hasMedia = Boolean(mediaUrl && !mediaUrl.startsWith('/default-menus/'));
    const isAssigned = currentAssignedScreen === num;

    let mediaPreviewHTML = '';
    if (hasMedia) {
      if (isVideo) {
        if (driveId) {
          const thumbUrl = getGoogleDriveThumbnailUrl(driveId, 640);
          mediaPreviewHTML = `
            <img src="${thumbUrl}" alt="Google Drive Video ${num}" class="card-thumbnail" loading="lazy" />
            <span class="media-type-badge video-badge">DRIVE VIDEO</span>
          `;
        } else if (!isFullscreenActive) {
          // Nur im Kachel-Modus abspielen, um Hardware-Decoder auf Smart TVs freizuhalten
          mediaPreviewHTML = `
            <video src="${mediaUrl}" class="card-thumbnail card-video" autoplay loop muted playsinline webkit-playsinline preload="metadata"></video>
            <span class="media-type-badge video-badge">VIDEO</span>
          `;
        } else {
          // Im Vollbild-Modus: Standby-Miniatur (schont Smart-TV Hardware-Decoder komplett)
          mediaPreviewHTML = `
            <div class="card-thumbnail card-video-standby">
              <span class="media-type-badge video-badge">VIDEO</span>
            </div>
          `;
        }
      } else {
        mediaPreviewHTML = `
          <img src="${mediaUrl}" alt="Speisekarte ${num}" class="card-thumbnail" loading="lazy" />
          <span class="media-type-badge photo-badge">FOTO</span>
        `;
      }
    } else {
      // Cleanes, 100% vollflächig oranges Speisekarte-Miniaturdesign ohne jedes TV-Label
      mediaPreviewHTML = renderDefaultMenuHTML(num, true);
    }

    return `
      <div class="tv-card ${isAssigned ? 'card-selected' : ''}" 
           data-screen="${num}" 
           data-tv-focus="true" 
           tabindex="0"
           role="button"
           aria-label="Bildschirm ${num}">
        <div class="tv-card-poster">
          ${mediaPreviewHTML}
        </div>
        ${hasMedia ? `
          <div class="tv-card-caption">
            <span class="tv-card-title">Bildschirm ${num}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Klick-Events auf Kacheln
  container.querySelectorAll('.tv-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const screenNum = parseInt(card.getAttribute('data-screen'), 10);
      enterFullscreenMode(screenNum);
      requestBrowserFullscreen();
    });
  });
}

/**
 * Wechselt weich in den 100% Vollbild-Modus (100vw x 100vh).
 */
export function enterFullscreenMode(screenNumber) {
  const num = parseInt(screenNumber, 10);
  currentAssignedScreen = num;
  isFullscreenActive = true;

  localStorage.setItem(STORAGE_ASSIGNED_SCREEN_KEY, num.toString());

  // 1. Alle Hintergrund-Kachel-Videos sofort stoppen und entladen!
  // Auf Smart TVs existiert nur EIN Hardware-Decoder-Kanal.
  // Werden Kachel-Videos weiter decodiert, stottert das Vollbild-Video extrem!
  const gridVideos = document.querySelectorAll('.card-video');
  gridVideos.forEach(v => {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch (e) {}
  });

  const fullscreenView = document.getElementById('tv-fullscreen-view');

  updateFullscreenMedia(getState());
  fullscreenView.classList.add('active');

  setSnowActiveScreen(num);
  setRunnerActiveScreen(num);
  setHalloweenActiveScreen(num);
  setChristmasActiveScreen(num);
  setTvView('vollbild');
  console.log(`📺 [Elite Systems] Bildschirm ${num} im Vollbild-Modus gestartet.`);
}

/**
 * Beendet den Vollbild-Modus und kehrt zum 3x2 Grid zurück.
 */
export function exitFullscreenMode() {
  isFullscreenActive = false;
  const fullscreenView = document.getElementById('tv-fullscreen-view');
  if (fullscreenView) {
    fullscreenView.classList.remove('active');

    // Vollbild-Video entladen, um Decoder sofort für Kacheln freizugeben
    const videoEl = document.getElementById('fullscreen-menu-video');
    if (videoEl) releaseFullscreenVideo(videoEl);
  }

  setSnowActiveScreen(null);
  setRunnerActiveScreen(null);
  setHalloweenActiveScreen(null);
  setChristmasActiveScreen(null);
  setTvView('übersicht');

  // Kacheln neu rendern, damit Thumbnail-Videos wieder starten
  renderGridTiles(getState());

  if (currentAssignedScreen) {
    const card = document.querySelector(`.tv-card[data-screen="${currentAssignedScreen}"]`);
    if (card) {
      setFocus(card);
    }
  }
}

/**
 * Aktualisiert das Vollbild-Medium (Video, Bild oder cleanen Speisekarte-Platzhalter).
 */
async function updateFullscreenMedia(state) {
  if (!currentAssignedScreen) return;

  const videoEl = document.getElementById('fullscreen-menu-video');
  const imgEl = document.getElementById('fullscreen-menu-image');
  const defaultMenuEl = document.getElementById('fullscreen-default-menu');

  if (!videoEl || !imgEl || !defaultMenuEl) return;

  const screenData = state.screens[currentAssignedScreen] || {};
  let mediaUrl = screenData.mediaUrl || screenData.imageUrl;
  let mediaType = screenData.mediaType || 'image';

  if (mediaUrl) mediaUrl = resolvePlayableMediaUrl(mediaUrl);

  const driveId = extractGoogleDriveFileId(mediaUrl);
  const isVideo = mediaType === 'video' || (mediaUrl && (mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || Boolean(driveId) || mediaUrl.startsWith('blob:')));
  const hasCustomMedia = Boolean(mediaUrl && !mediaUrl.startsWith('/default-menus/'));

  // 1. VIDEO WIEDERGABE (Dauerschleife, Autoplay, Vollbild - 100% ohne Player-Controls)
  if (hasCustomMedia && isVideo) {
    imgEl.style.display = 'none';
    defaultMenuEl.style.display = 'none';

    videoEl.onerror = (e) => {
      console.warn("⚠️ Fehler beim Abspielen des Videos (Code: " + (videoEl.error ? videoEl.error.code : 'unknown') + "):", e);
      // Fail-Safe Fallback: Statt schwarzem Bildschirm saubere Speisekarte anzeigen …
      releaseFullscreenVideo(videoEl);
      defaultMenuEl.innerHTML = renderDefaultMenuHTML(currentAssignedScreen);
      defaultMenuEl.style.display = 'block';
      // … und später erneut versuchen (z. B. nach kurzem WLAN-Aussetzer)
      clearTimeout(videoRetryTimeoutId);
      videoRetryTimeoutId = setTimeout(() => updateFullscreenMedia(getState()), VIDEO_RETRY_MS);
    };

    if (videoSourceUrl !== mediaUrl) {
      videoSourceUrl = mediaUrl;
      videoEl.src = mediaUrl;
      videoEl.load();
    }
    videoEl.style.display = 'block';
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.play().catch(err => {
      console.warn("Autoplay blockiert, warte auf Interaktion:", err);
    });
    return;
  }

  // 2. BILD WIEDERGABE
  if (hasCustomMedia && !isVideo) {
    releaseFullscreenVideo(videoEl);
    defaultMenuEl.style.display = 'none';

    imgEl.style.display = 'block';
    const resolvedImg = new URL(mediaUrl, window.location.href).href;
    if (imgEl.src !== resolvedImg) {
      imgEl.src = mediaUrl;
    }
    return;
  }

  // 3. KEINE ECHTEN MEDIEN HOCHGELADEN -> CLEANES "SPEISEKARTE" DESIGN
  releaseFullscreenVideo(videoEl);
  imgEl.style.display = 'none';

  defaultMenuEl.innerHTML = renderDefaultMenuHTML(currentAssignedScreen);
  defaultMenuEl.style.display = 'block';
}

/**
 * Hält das Vollbild-Video an und gibt den Decoder frei.
 * @param {HTMLVideoElement} videoEl
 */
function releaseFullscreenVideo(videoEl) {
  videoSourceUrl = null;
  try {
    videoEl.pause();
    videoEl.style.display = 'none';
    if (videoEl.getAttribute('src')) {
      videoEl.removeAttribute('src');
      videoEl.load();
    }
  } catch (e) {}
}

/**
 * Konfiguration des Einstellungs-Modals & QR-Codes.
 */
function setupModalEvents() {
  const settingsBtn = document.getElementById('tv-settings-btn');
  const modal = document.getElementById('tv-settings-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const copyBtn = document.getElementById('modal-copy-link-btn');

  // Modal öffnen
  settingsBtn.addEventListener('click', () => {
    modal.classList.add('active');
    renderQRCode();
    setFocus(copyBtn);
  });

  // Modal schließen
  const closeModal = () => {
    modal.classList.remove('active');
    setFocus(settingsBtn);
  };
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Link kopieren Button
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const urlDisplay = document.getElementById('mobile-admin-url');
      if (urlDisplay && urlDisplay.textContent) {
        try {
          await navigator.clipboard.writeText(urlDisplay.textContent);
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'Kopiert!';
          setTimeout(() => { copyBtn.textContent = orig; }, 2000);
        } catch (err) { }
      }
    });
  }
}

/**
 * Erzeugt den dynamischen QR-Code für die Smartphone Einstellungen.
 */
function renderQRCode() {
  const canvas = document.getElementById('qr-canvas');
  const urlDisplay = document.getElementById('mobile-admin-url');
  if (!canvas) return;

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const mobileUrl = isLocal
    ? `${window.location.origin}${window.location.pathname}?mode=mobile`
    : `${window.location.origin}${window.location.pathname}?mode=mobile`;

  if (urlDisplay) {
    urlDisplay.textContent = mobileUrl;
  }

  QRCode.toCanvas(canvas, mobileUrl, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#1C1C1E',
      light: '#FFFFFF'
    }
  }, (error) => {
    if (error) console.error("QR Code Render Fehler:", error);
  });
}
