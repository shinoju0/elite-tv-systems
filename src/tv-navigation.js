/**
 * ==============================================================================
 * ELITE SYSTEMS - SMART TV REMOTE CONTROL NAVIGATION ENGINE
 * ==============================================================================
 * Hochoptimierte 4-Wege-Steuerkreuz-Navigation (D-Pad) für Hisense VIDAA OS,
 * Samsung Tizen, LG webOS und Standard-Browser mit Apple tvOS Fokus-Effekten.
 * ==============================================================================
 */

let currentFocusedElement = null;
let isNavigationActive = true;
let onFullscreenExitCallback = null;

export function setFullscreenExitCallback(fn) {
  onFullscreenExitCallback = fn;
}

export function pauseNavigation() {
  isNavigationActive = false;
}

export function resumeNavigation() {
  isNavigationActive = true;
}

/**
 * Holt alle aktuell sichtbaren, fokussierbaren Elemente.
 */
function getFocusableElements(scopeContainer = document) {
  // Wenn ein modales Fenster aktiv ist, beschränke die Navigation auf das Modal
  const modal = document.querySelector('.tv-modal.active');
  const root = modal ? modal : scopeContainer;

  const selector = '[data-tv-focus="true"]:not([disabled]):not([style*="display: none"])';
  const elements = Array.from(root.querySelectorAll(selector));
  return elements.filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}

/**
 * Hebt ein bestimmtes Element mit dem tvOS-Fokusring hervor.
 */
export function setFocus(element, scrollIntoView = true) {
  if (!element) return;

  // Vorherigen Fokus entfernen
  if (currentFocusedElement && currentFocusedElement !== element) {
    currentFocusedElement.classList.remove('tv-focused');
  }

  currentFocusedElement = element;
  currentFocusedElement.classList.add('tv-focused');

  try {
    currentFocusedElement.focus({ preventScroll: true });
  } catch (e) {}

  if (scrollIntoView) {
    try {
      currentFocusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
  }
}

/**
 * Sucht das nächstgelegene Element in der gewünschten Pfeilrichtung (Spatial Navigation).
 */
function navigateDirection(direction) {
  const focusables = getFocusableElements();
  if (focusables.length === 0) return;

  if (!currentFocusedElement || !focusables.includes(currentFocusedElement)) {
    setFocus(focusables[0]);
    return;
  }

  const currentRect = currentFocusedElement.getBoundingClientRect();
  const currentCenter = {
    x: currentRect.left + currentRect.width / 2,
    y: currentRect.top + currentRect.height / 2
  };

  let bestCandidate = null;
  let minDistance = Infinity;

  focusables.forEach(candidate => {
    if (candidate === currentFocusedElement) return;

    const candRect = candidate.getBoundingClientRect();
    const candCenter = {
      x: candRect.left + candRect.width / 2,
      y: candRect.top + candRect.height / 2
    };

    const dx = candCenter.x - currentCenter.x;
    const dy = candCenter.y - currentCenter.y;

    let isEligible = false;
    let primaryDist = 0;
    let secondaryDist = 0;

    switch (direction) {
      case 'left':
        if (dx < -10) {
          isEligible = true;
          primaryDist = Math.abs(dx);
          secondaryDist = Math.abs(dy);
        }
        break;
      case 'right':
        if (dx > 10) {
          isEligible = true;
          primaryDist = Math.abs(dx);
          secondaryDist = Math.abs(dy);
        }
        break;
      case 'up':
        if (dy < -10) {
          isEligible = true;
          primaryDist = Math.abs(dy);
          secondaryDist = Math.abs(dx);
        }
        break;
      case 'down':
        if (dy > 10) {
          isEligible = true;
          primaryDist = Math.abs(dy);
          secondaryDist = Math.abs(dx);
        }
        break;
    }

    if (isEligible) {
      // Gewichtete Distanz: Primäre Richtung wird stärker bevorzugt
      const weightedDist = primaryDist + (secondaryDist * 1.8);
      if (weightedDist < minDistance) {
        minDistance = weightedDist;
        bestCandidate = candidate;
      }
    }
  });

  if (bestCandidate) {
    setFocus(bestCandidate);
  }
}

/**
 * Globaler Keydown-Listener für Smart-TV-Fernbedienungen.
 */
function handleKeyDown(event) {
  // Wenn Vollbild-Modus aktiv ist: Nur echte Zurück-/Exit-Tasten kehren zurück
  const fullscreenView = document.getElementById('tv-fullscreen-view');
  if (fullscreenView && fullscreenView.classList.contains('active')) {
    const isBackOrExit = (
      event.key === 'Escape' ||
      event.key === 'Backspace' ||
      event.keyCode === 27 ||
      event.keyCode === 8 ||
      event.keyCode === 10009 || // Samsung Tizen Return
      event.keyCode === 461       // LG webOS Back
    );

    if (isBackOrExit) {
      event.preventDefault();
      if (onFullscreenExitCallback) {
        onFullscreenExitCallback();
      }
      return;
    }

    // Bei Menü-Taste ('m' oder 'o') Optionen öffnen
    if (event.key === 'm' || event.key === 'o' || event.key === 'M' || event.key === 'O') {
      event.preventDefault();
      if (onFullscreenExitCallback) {
        onFullscreenExitCallback();
      }
      setTimeout(() => {
        const settingsBtn = document.getElementById('tv-settings-btn');
        if (settingsBtn) settingsBtn.click();
      }, 100);
      return;
    }

    // Jede andere Taste (z.B. OK/Enter) stellt sicher, dass Hardware-Vollbild aktiv bleibt
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  if (!isNavigationActive) return;

  const key = event.key;
  const keyCode = event.keyCode;

  // Pfeil links
  if (key === 'ArrowLeft' || keyCode === 37) {
    event.preventDefault();
    navigateDirection('left');
  }
  // Pfeil rechts
  else if (key === 'ArrowRight' || keyCode === 39) {
    event.preventDefault();
    navigateDirection('right');
  }
  // Pfeil oben
  else if (key === 'ArrowUp' || keyCode === 38) {
    event.preventDefault();
    navigateDirection('up');
  }
  // Pfeil unten
  else if (key === 'ArrowDown' || keyCode === 40) {
    event.preventDefault();
    navigateDirection('down');
  }
  // OK / Enter Taste
  else if (key === 'Enter' || keyCode === 13 || key === 'Select') {
    if (currentFocusedElement) {
      event.preventDefault();
      // Leichter haptischer Scale-Down Feedback
      currentFocusedElement.classList.add('tv-pressed');
      setTimeout(() => {
        if (currentFocusedElement) currentFocusedElement.classList.remove('tv-pressed');
        currentFocusedElement?.click();
      }, 120);
    }
  }
  // Escape / Zurück Taste
  else if (key === 'Escape' || keyCode === 27 || keyCode === 10009 || keyCode === 461) {
    const modal = document.querySelector('.tv-modal.active');
    if (modal) {
      event.preventDefault();
      const closeBtn = modal.querySelector('.modal-close-btn');
      if (closeBtn) closeBtn.click();
    }
  }
}

/**
 * Initialisiert die Navigation und bindet Maus-Hover als Fokus-Synchronisation ein.
 */
export function initTVNavigation() {
  window.addEventListener('keydown', handleKeyDown);

  // Maus-Hover synchronisiert den Fokus für hybride Bedienung
  document.addEventListener('mouseover', (e) => {
    const focusable = e.target.closest('[data-tv-focus="true"]');
    if (focusable && focusable !== currentFocusedElement) {
      setFocus(focusable, false);
    }
  });

  // Initialer Fokus auf die erste Kachel nach Laden
  setTimeout(() => {
    const focusables = getFocusableElements();
    if (focusables.length > 0 && !currentFocusedElement) {
      setFocus(focusables[0]);
    }
  }, 200);
}
