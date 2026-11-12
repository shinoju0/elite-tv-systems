/**
 * ==============================================================================
 * ELITE SYSTEMS - CLEAN MENU PLACEHOLDER RENDERER
 * ==============================================================================
 * Ersetzt Beispieldaten durch einen minimalistischen, eleganten Apple-Design-
 * Platzhalter: Reines, cleanes "SPEISEKARTE" ohne störende TV-Nummern-Labels
 * und in edlem Elite-Orange für Kacheln bzw. Liquid-Glass für Vollbild.
 * ==============================================================================
 */

/**
 * Erzeugt sauberen HTML-Code für den puren "Speisekarte"-Platzhalter ohne TV-Nummern-Pille.
 * @param {number} screenNumber 
 * @param {boolean} isThumbnail 
 * @returns {string} HTML-String
 */
export function renderDefaultMenuHTML(screenNumber, isThumbnail = false) {
  if (isThumbnail) {
    return `
      <div class="clean-menu-thumb">
        <div class="clean-thumb-header">
          <img src="/logo.png" alt="" class="clean-thumb-logo" />
          <span class="clean-thumb-brand">Elite Systems</span>
        </div>
        <div class="clean-thumb-title">SPEISEKARTE</div>
      </div>
    `;
  }

  return `
    <div class="clean-menu-placeholder">
      <!-- Sanfter Mesh Glow im Hintergrund -->
      <div class="clean-menu-glow"></div>

      <div class="clean-menu-card apple-glass">
        <!-- Titel "Elite Systems" mit Logo links daneben -->
        <div class="clean-menu-header">
          <img src="/logo.png" alt="" class="clean-menu-logo" />
          <span class="clean-menu-header-title">Elite Systems</span>
        </div>

        <!-- Cleanes Speisekarte Zentrum in edler Apple-Typografie -->
        <h1 class="clean-menu-title">SPEISEKARTE</h1>

        <div class="clean-menu-divider"></div>

        <p class="clean-menu-brand">DIGITAL SIGNAGE</p>
      </div>
    </div>
  `;
}
