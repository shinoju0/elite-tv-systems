/**
 * ==============================================================================
 * ELITE SYSTEMS - MAIN APPLICATION ROUTER & BOOTSTRAPPER
 * ==============================================================================
 * Erkennt automatisch, ob die WebApp auf einem Hisense VIDAA OS Smart TV
 * (>= 768px, TV User-Agent) oder auf einem Smartphone läuft und startet die
 * passende Apple-Design Ansicht.
 * ==============================================================================
 */

import '../style.css';
import { initStateManager, enableTvReporting } from './state-manager.js';
import { initTVDashboard } from './tv-dashboard.js';
import { initTVNavigation } from './tv-navigation.js';
import { initMobileAdmin } from './mobile-admin.js';
import { initVersionCheck } from './version-check.js';

function isMobileMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const modeParam = urlParams.get('mode');

  // 1. Expliziter URL-Parameter hat höchste Priorität
  if (modeParam === 'mobile') return true;
  if (modeParam === 'tv') return false;

  // 2. Viewport-Breite Prüfung (< 768px ist Smartphone)
  const isSmallScreen = window.innerWidth < 768;

  // 3. Typische Mobile Touch User-Agents
  const userAgent = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  return isSmallScreen || isMobileUA;
}

/**
 * Übernimmt die Bildschirmnummer aus der Adresse (?screen=1 bis 6). So behält ein
 * TV beim Umzug auf eine neue Domain seine Nummer, denn der gespeicherte Wert der
 * alten Adresse ist dort nicht verfügbar.
 */
function adoptScreenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const screen = parseInt(params.get('screen'), 10);
  if (screen >= 1 && screen <= 6) {
    try {
      localStorage.setItem('elite_tv_assigned_screen', String(screen));
    } catch (err) { }
    params.delete('screen');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }
}

function bootstrap() {
  console.log("🚀 [Elite Systems] Initialisiere WebApp...");

  // 1. Globalen State & Server-/Lokal-Synchronisation starten
  initStateManager();

  // 2. Modus ermitteln
  const mobile = isMobileMode();

  if (mobile) {
    console.log("📱 [Elite Systems] Starte Smartphone Admin Ansicht...");
    initMobileAdmin();
  } else {
    console.log("📺 [Elite Systems] Starte Smart TV Ansicht...");
    adoptScreenFromUrl();
    enableTvReporting();
    initTVDashboard();
    initTVNavigation();
    initVersionCheck();
  }
}

// Starten, sobald DOM geladen ist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
