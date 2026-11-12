/**
 * ==============================================================================
 * ELITE SYSTEMS - STREAMING MEDIA URL RESOLVER
 * ==============================================================================
 * Erkennt und konvertiert Cloud-Links (Google Drive, Dropbox etc.) automatisch
 * in direkt streambare Video- & Bild-URLs für Smart TVs.
 * ==============================================================================
 */

/**
 * Extrahiert die File-ID aus beliebigen Google Drive Linkformaten.
 * Unterstützt:
 * - https://drive.google.com/file/d/ID/view?usp=sharing
 * - https://drive.google.com/open?id=ID
 * - https://drive.google.com/uc?id=ID
 * - https://docs.google.com/file/d/ID
 * @param {string} url 
 * @returns {string|null}
 */
export function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/(?:(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)|drive\.usercontent\.google\.com\/download\?(?:.*&)?id=)([a-zA-Z0-9_-]{15,})/i);
  return match ? match[1] : null;
}

/**
 * Erzeugt die direkte Stream-URL für Google Drive.
 * Verwendet drive.usercontent.google.com mit confirm=t, um die
 * Google-Virus-Warnseite bei Dateien > 100MB (wie 166MB Werbevideos) zuverlässig
 * zu umgehen und direkt den echten MP4-Stream an das <video>-Element zu liefern.
 * @param {string} driveId 
 * @returns {string}
 */
export function getGoogleDriveStreamUrl(driveId) {
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
}

/**
 * Erzeugt die offizielle Google Drive Preview-Player URL (Embed).
 * @param {string} driveId 
 * @returns {string}
 */
export function getGoogleDrivePreviewUrl(driveId) {
  return `https://drive.google.com/file/d/${driveId}/preview`;
}

/**
 * Erzeugt die direkte Thumbnail-URL für ein Google Drive Medium.
 * @param {string} driveId 
 * @param {number} width 
 * @returns {string}
 */
export function getGoogleDriveThumbnailUrl(driveId, width = 640) {
  return `https://lh3.googleusercontent.com/d/${driveId}=w${width}`;
}

/**
 * Wandelt Google Drive, Dropbox und Standard-Links in direkt abspielbare Stream-URLs um.
 * @param {string} rawUrl 
 * @returns {string}
 */
export function resolvePlayableMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();

  // 1. Google Drive Link zu direktem Video-Stream für das HTML5 <video> Tag
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    // Wenn es sich um das Elite Burger Werbevideo handelt:
    // Nutze den lokal gehosteten, web-optimierten 1080p FastStart-Stream (H.264 + AAC),
    // um Google Drive Quota-Limits, HEVC-Codec-Inkompatibilitäten und TV-Blackscreens zu vermeiden.
    if (driveId === 'DRIVE-ID-DES-WERBEVIDEOS') {
      return '/videos/werbung-elite-burger.mp4';
    }
    return getGoogleDriveStreamUrl(driveId);
  }

  // 2. Dropbox Link (dl=0 -> raw=1 für direkte Stream-Wiedergabe)
  if (trimmed.includes('dropbox.com')) {
    return trimmed.replace('?dl=0', '?raw=1').replace('&dl=0', '&raw=1');
  }

  return trimmed;
}

/**
 * Prüft, ob es sich um einen Google Drive Link handelt.
 * @param {string} url 
 * @returns {boolean}
 */
export function isGoogleDriveUrl(url) {
  return Boolean(extractGoogleDriveFileId(url));
}

