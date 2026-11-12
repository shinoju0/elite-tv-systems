/**
 * ==============================================================================
 * ELITE SYSTEMS - CLIENT-SIDE MEDIA PROCESSOR & STORAGE UPLOADER
 * ==============================================================================
 * Unterstützt Bilder (Canvas-Komprimierung auf 1080p/WebP/JPG)
 * UND Videos (MP4, WebM). Uploads landen auf dem eigenen Elite-Server
 * (`/api/upload`). Klappt das nicht, gibt es eine klare Fehlermeldung, denn
 * nur Dateien auf dem Server sehen alle 6 TVs.
 * ==============================================================================
 */

import { getAdminHeaders } from './state-manager.js';

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const QUALITY = 0.85;
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
// Unvorbereitete Handy-Videos (z. B. HEVC mit 14 Mbit/s) ruckeln auf den TV-Browsern,
// deshalb wandelt das Handy jedes Video vor dem Upload in dieses Format um
const MAX_SOURCE_VIDEO_BYTES = 1024 * 1024 * 1024; // vor dem Umwandeln bis 1 GB
const TV_VIDEO_BITRATE = 5_000_000;
const TV_VIDEO_FPS = 30;
const API_UPLOAD = '/api/upload';

// Fehler mit HTTP-Status, damit das Handy bei abgelaufener PIN neu fragen kann
function uploadError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Lädt eine Datei per XHR auf den Elite-Server (XHR statt fetch wegen Upload-Fortschritt).
 * @param {number} screenNumber 
 * @param {Blob} blob 
 * @param {string} ext 
 * @param {(percent: number) => void} onProgress 
 * @returns {Promise<string>} Öffentliche URL des Mediums, z. B. /media/screen_1_123.webp
 */
function uploadToServer(screenNumber, blob, ext, onProgress = () => { }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_UPLOAD}?screen=${encodeURIComponent(screenNumber)}&ext=${encodeURIComponent(ext)}`);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    Object.entries(getAdminHeaders()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body.url);
        else reject(uploadError(body.error || `Upload fehlgeschlagen (HTTP ${xhr.status})`, xhr.status));
      } catch (err) {
        reject(uploadError(`Upload fehlgeschlagen (HTTP ${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(uploadError("Server nicht erreichbar – Internet prüfen und nochmal versuchen", 0));
    xhr.send(blob);
  });
}

/**
 * Komprimiert eine Bilddatei im Browser via HTML5 Canvas.
 * @param {File} file 
 * @returns {Promise<{ blob: Blob, width: number, height: number, sizeKb: number }>}
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error("Bitte wähle eine gültige Bilddatei (PNG, JPG, WebP) aus."));
      return;
    }

    // Direkt aus der Datei laden statt über einen riesigen Base64-Text (spart Handy-Speicher)
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Konnte Bild nicht dekodieren."));
    };
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      // Seitenverhältnis beibehalten und auf maximal 1920x1080 herunterskalieren
      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Bessere Bildglättung für gestochen scharfe Speisekarten-Texte
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Zuerst WebP versuchen, sonst JPEG (Safari liefert statt WebP stillschweigend PNG)
      const finish = (blob) => {
        if (!blob) {
          reject(new Error("Canvas-Blob Erstellung fehlgeschlagen."));
          return;
        }
        resolve({ blob, width, height, sizeKb: Math.round(blob.size / 1024) });
      };
      canvas.toBlob((blob) => {
        if (blob && blob.type === 'image/webp') finish(blob);
        else canvas.toBlob(finish, 'image/jpeg', QUALITY);
      }, 'image/webp', QUALITY);
    };
    img.src = objectUrl;
  });
}

/**
 * Lädt ein Bild oder Video auf den Server und gibt { mediaUrl, mediaType } zurück.
 * Schlägt der Upload fehl, wirft die Funktion einen Fehler mit lesbarer Meldung.
 * @param {number} screenNumber 
 * @param {File} file 
 * @param {(progress: number, statusText?: string) => void} onProgress 
 * @returns {Promise<{ mediaUrl: string, mediaType: 'image' | 'video' }>}
 */
export async function uploadMediaFile(screenNumber, file, onProgress = () => { }) {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
  const isImage = file.type.startsWith('image/');

  if (!isVideo && !isImage) {
    throw new Error("Nicht unterstütztes Format. Bitte lade ein Bild (JPG, PNG, WebP) oder Video (MP4, MOV, WebM) hoch.");
  }

  // --- 1. VIDEO UPLOAD WORKFLOW ---
  if (isVideo) {
    if (file.size > MAX_SOURCE_VIDEO_BYTES) {
      throw new Error(`Video ist zu groß (${(file.size / 1024 / 1024).toFixed(0)} MB, max. 1 GB). Tipp: kürzer oder in 1080p exportieren.`);
    }

    onProgress(2, "Video wird für die TVs optimiert...");
    let upload = await convertVideoForTv(file, (p) => {
      onProgress(Math.round(2 + p * 58), `Video wird für die TVs optimiert: ${Math.round(p * 100)}%`);
    });
    let fileExt = 'mp4';
    if (!upload) {
      // Handy kann nicht umwandeln (sehr alter Browser) -> Original, sofern nicht zu groß
      if (file.size > MAX_VIDEO_SIZE_BYTES) {
        throw new Error(`Dieses Handy kann das Video nicht verkleinern und es ist zu groß (${(file.size / 1024 / 1024).toFixed(0)} MB, max. 100 MB). Bitte in 1080p exportieren oder ein anderes Handy nehmen.`);
      }
      fileExt = (file.name.split('.').pop() || 'mp4').toLowerCase();
      if (!['mp4', 'webm'].includes(fileExt)) {
        throw new Error("Dieses Handy kann das Video nicht umwandeln. Bitte als MP4 exportieren oder ein anderes Handy nehmen.");
      }
      upload = file;
    }

    onProgress(60, "Video wird auf den Server hochgeladen...");
    const serverUrl = await uploadToServer(screenNumber, upload, fileExt, (percent) => {
      onProgress(Math.max(60, Math.min(98, 60 + Math.round(percent * 0.38))), `Upload: ${percent}%`);
    });
    onProgress(100, "Auf dem Server gespeichert!");
    return { mediaUrl: serverUrl, mediaType: 'video' };
  }

  // --- 2. BILD UPLOAD WORKFLOW ---
  onProgress(20, "Bild wird für TV optimiert (100% kostenlos)...");
  const compressed = await compressImage(file);

  onProgress(50, "Wird gespeichert...");
  const fileExt = compressed.blob.type === 'image/webp' ? 'webp' : 'jpg';
  const imageUrl = await uploadToServer(screenNumber, compressed.blob, fileExt, (p) => {
    onProgress(Math.max(50, Math.min(95, p)), `Übertragung: ${p}%`);
  });

  return { mediaUrl: imageUrl, mediaType: 'image' };
}

/**
 * Wandelt ein Video im Handy-Browser in ein Format, das die TVs ruckelfrei abspielen:
 * H.264, höchstens 1920x1080 und 30 fps, ca. 5 Mbit/s, ohne Ton, Abspiel-Infos am Dateianfang.
 * Gibt null zurück, wenn der Browser das nicht kann (dann wird das Original hochgeladen).
 * @param {File} file
 * @param {(progress: number) => void} onProgress Fortschritt von 0 bis 1
 * @returns {Promise<Blob | null>}
 */
async function convertVideoForTv(file, onProgress) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;

  // Erst hier nachladen, damit die TVs den Video-Umwandler nie mitladen müssen
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS, Quality, canEncodeVideo } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("In der Datei wurde kein Video gefunden.");

    // Nur verkleinern, nie vergrößern; gerade Maße, weil H.264 das verlangt
    const scale = Math.min(1, MAX_WIDTH / track.displayWidth, MAX_HEIGHT / track.displayHeight);
    const width = Math.round(track.displayWidth * scale / 2) * 2;
    const height = Math.round(track.displayHeight * scale / 2) * 2;
    const quality = new Quality({ bitrate: TV_VIDEO_BITRATE });
    if (!await canEncodeVideo('avc', { width, height, quality })) return null;

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        width,
        height,
        fit: 'fill',
        frameRate: TV_VIDEO_FPS,
        quality,
        keyFrameInterval: 2,
        allowTransformationMetadata: false,
        forceTranscode: true
      },
      audio: { discard: true },
      showWarnings: false
    });
    if (!conversion.isValid) return null;
    conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)));
    await conversion.execute();
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (err) {
    if (err.message === "In der Datei wurde kein Video gefunden.") throw err;
    console.warn("⚠️ Video konnte nicht umgewandelt werden, nutze Original:", err);
    return null;
  } finally {
    input.dispose();
  }
}
