/**
 * ==============================================================================
 * ELITE SYSTEMS - SELF-HOSTED SYNC & MEDIA SERVER (ersetzt Firebase)
 * ==============================================================================
 * Ein einziger Node-Prozess ohne Zusatzpakete:
 *   - liefert die gebaute WebApp aus `dist/` aus (inkl. Range-Requests für Videos)
 *   - speichert den gemeinsamen Zustand aller 6 TVs in `data/state.json`
 *   - nimmt Uploads vom Smartphone-Admin entgegen und legt sie in `data/media/` ab
 *   - verteilt jede Änderung live per Server-Sent Events an alle Bildschirme
 *   - Schreibzugriffe nur mit Admin-PIN (Header `X-Admin-Pin`), mit Sperre
 *     nach zu vielen Fehlversuchen
 *
 * Start:  ADMIN_PIN=xxxx node server/server.mjs   (Port über PORT, Standard 8787)
 * ==============================================================================
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PORT = parseInt(process.env.PORT || '8787', 10);
const ADMIN_PIN = process.env.ADMIN_PIN || '';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const MAX_STATE_BYTES = 2 * 1024 * 1024;     // Zustand inkl. evtl. Base64-Fallbacks
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;  // Videos bis 150 MB
const ALLOWED_EXT = new Set(['webp', 'jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

fs.mkdirSync(MEDIA_DIR, { recursive: true });

let currentState = null;
try {
  currentState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch {
  currentState = null; // Noch nichts gespeichert -> Clients nutzen ihren Standardzustand
}

const sseClients = new Set();
const failedAttempts = new Map(); // IP -> { count, lockedUntil }
const tvClients = new Map();      // Geräte-ID -> zuletzt gemeldete TV-Daten
const MAX_TV_CLIENTS = 50;

if (!ADMIN_PIN) {
  console.warn('⚠️ [Elite Server] ADMIN_PIN ist nicht gesetzt – alle Schreibzugriffe werden abgelehnt.');
}

// ------------------------------------------------------------------------------
// HILFSFUNKTIONEN
// ------------------------------------------------------------------------------
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Datei zu groß'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Hinter dem Cloudflare-Tunnel kommt jede Anfrage von localhost, die echte IP steht im Header.
// Dem Header nur vertrauen, wenn die Verbindung wirklich vom lokalen Tunnel kommt.
function clientIp(req) {
  const remote = req.socket.remoteAddress || 'unbekannt';
  const fromLocalTunnel = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  return (fromLocalTunnel && req.headers['cf-connecting-ip']) || remote;
}

function pinMatches(pin) {
  if (!ADMIN_PIN || typeof pin !== 'string') return false;
  const a = crypto.createHash('sha256').update(pin).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PIN).digest();
  return crypto.timingSafeEqual(a, b);
}

// Prüft die PIN und schreibt bei Fehlern selbst die Antwort. true = weiter
function requireAdmin(req, res) {
  const ip = clientIp(req);
  const entry = failedAttempts.get(ip);
  if (entry && entry.lockedUntil > Date.now()) {
    sendJson(res, 429, { error: 'Zu viele falsche PIN-Eingaben. Bitte später erneut versuchen.' });
    return false;
  }

  if (pinMatches(req.headers['x-admin-pin'])) {
    failedAttempts.delete(ip);
    return true;
  }

  // Nach Ablauf einer Sperre wird wieder bei 0 gezählt
  const count = (entry && entry.lockedUntil === 0 ? entry.count : 0) + 1;
  failedAttempts.set(ip, { count, lockedUntil: count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 });
  if (count >= MAX_FAILED_ATTEMPTS) console.warn(`[Elite Server] PIN-Sperre für ${ip}`);
  sendJson(res, 401, { error: 'Falsche PIN' });
  return false;
}

async function saveState(state) {
  currentState = state;
  const tmp = `${STATE_FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(state));
  await fsp.rename(tmp, STATE_FILE);
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of sseClients) client.write(payload);
}

// Alte Uploads löschen, sobald sie im Zustand nicht mehr vorkommen.
// Frische Dateien bleiben verschont: zwischen Upload und Zustands-Update liegen ein paar Sekunden.
async function cleanupMedia() {
  const stateJson = JSON.stringify(currentState || {});
  const cutoff = Date.now() - 10 * 60 * 1000;
  const files = await fsp.readdir(MEDIA_DIR);
  for (const name of files) {
    if (stateJson.includes(`/media/${name}`)) continue;
    const filePath = path.join(MEDIA_DIR, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fsp.unlink(filePath).catch(() => { });
  }
}

// Statische Datei mit Range-Unterstützung (Smart-TV-Videoplayer springen per Range)
async function serveFile(req, res, filePath, cacheControl) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    return false;
  }

  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': cacheControl, 'Accept-Ranges': 'bytes' };
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);

  if (range) {
    let start = range[1] === '' ? stat.size - parseInt(range[2], 10) : parseInt(range[1], 10);
    let end = range[1] !== '' && range[2] !== '' ? parseInt(range[2], 10) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end(), true;
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return true;
  }

  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ------------------------------------------------------------------------------
// API
// ------------------------------------------------------------------------------
async function handleApi(req, res, url) {
  if (url.pathname === '/api/state' && req.method === 'GET') {
    const device = url.searchParams.get('device');
    if (device) {
      tvClients.delete(device);
      tvClients.set(device.slice(0, 32), {
        screen: url.searchParams.get('screen') || null,
        version: (url.searchParams.get('version') || '').slice(0, 40),
        offsetMs: parseInt(url.searchParams.get('offset'), 10) || 0,
        view: (url.searchParams.get('view') || '').slice(0, 20),
        loadedAt: parseInt(url.searchParams.get('loaded'), 10) || 0,
        goku: parseInt(url.searchParams.get('goku'), 10) || 0,
        ruffy: parseInt(url.searchParams.get('ruffy'), 10) || 0,
        sponge: parseInt(url.searchParams.get('sponge'), 10) || 0,
        gon: parseInt(url.searchParams.get('gon'), 10) || 0,
        snow: parseInt(url.searchParams.get('snow'), 10) || 0,
        stalls: parseInt(url.searchParams.get('stalls'), 10) || 0,
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').slice(0, 160),
        lastSeen: Date.now()
      });
      if (tvClients.size > MAX_TV_CLIENTS) tvClients.delete(tvClients.keys().next().value);
    }
    return sendJson(res, 200, { state: currentState });
  }

  // Übersicht, welcher Fernseher sich mit welcher Nummer und Version meldet
  if (url.pathname === '/api/clients' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const now = Date.now();
    const clients = [...tvClients.entries()]
      .map(([device, info]) => ({ device, ...info, secondsAgo: Math.round((now - info.lastSeen) / 1000) }))
      .sort((a, b) => String(a.screen).localeCompare(String(b.screen)));
    return sendJson(res, 200, { clients });
  }

  // Millisekundengenaue Serverzeit für die synchronen Effekte über alle 6 TVs
  if (url.pathname === '/api/time' && req.method === 'GET') {
    return sendJson(res, 200, { now: Date.now() });
  }

  if (url.pathname === '/api/auth' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/state' && req.method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const raw = await readBody(req, MAX_STATE_BYTES);
    const body = JSON.parse(raw.toString('utf8'));
    if (!body || typeof body !== 'object' || !body.screens || !body.settings) {
      return sendJson(res, 400, { error: 'Ungültiger Zustand' });
    }
    await saveState({ settings: body.settings, screens: body.screens });
    cleanupMedia().catch(() => { });
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    if (currentState) res.write(`data: ${JSON.stringify(currentState)}\n\n`);
    sseClients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
    return;
  }

  if (url.pathname === '/api/upload' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const screen = parseInt(url.searchParams.get('screen'), 10);
    const ext = (url.searchParams.get('ext') || '').toLowerCase();
    if (!(screen >= 1 && screen <= 6) || !ALLOWED_EXT.has(ext)) {
      return sendJson(res, 400, { error: 'Ungültiger Bildschirm oder Dateityp' });
    }
    const data = await readBody(req, MAX_UPLOAD_BYTES);
    const fileName = `screen_${screen}_${Date.now()}.${ext}`;
    await fsp.writeFile(path.join(MEDIA_DIR, fileName), data);
    return sendJson(res, 200, { url: `/media/${fileName}` });
  }

  return sendJson(res, 404, { error: 'Unbekannter Endpunkt' });
}

// ------------------------------------------------------------------------------
// HTTP SERVER
// ------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }

    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith('/media/')) {
      const filePath = path.join(MEDIA_DIR, path.basename(pathname));
      if (await serveFile(req, res, filePath, 'public, max-age=31536000, immutable')) return;
      return sendJson(res, 404, { error: 'Medium nicht gefunden' });
    }

    const filePath = path.join(DIST_DIR, path.normalize(pathname));
    if (filePath.startsWith(DIST_DIR + path.sep) && pathname !== '/') {
      const cache = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
      if (await serveFile(req, res, filePath, cache)) return;
    }

    // SPA-Fallback: alles andere bekommt die App
    await serveFile(req, res, path.join(DIST_DIR, 'index.html'), 'no-cache, no-store, must-revalidate');
  } catch (err) {
    console.error('[Elite Server] Fehler:', err.message);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📺 [Elite Server] läuft auf Port ${PORT} (Daten: ${DATA_DIR})`);
});
