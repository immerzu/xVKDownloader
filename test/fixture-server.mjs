/* ============================================================================
 * VK Downloader — Fixture-HTTP-Server (Tests)
 * Simuliert eine VK-ähnliche Umgebung für den Browser-End-to-End-Test:
 *   GET  /                       → fixture.html (VK-ähnliches DOM)
 *   POST /al_audio.php           → Track-Payload mit obfuskierter Stream-URL
 *   GET  /stream/master.m3u8     → Master-Playlist
 *   GET  /stream/media.m3u8      → Media-Playlist (AES-128)
 *   GET  /stream/key.pub         → AES-Schlüssel (16 Byte)
 *   GET  /stream/seg-*.ts        → verschlüsselte TS-Segmente
 *   GET  /modules/<datei>        → src/-Dateien als JavaScript
 * Start: node test/fixture-server.mjs [port]
 * ========================================================================== */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { makeMp3, makeTs, makeMediaPlaylist, makeMasterPlaylist, aesEncrypt } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* Decoder (echtes src-Modul) für die Obfuskierung laden */
require(path.join(root, 'src/shared/vk-decoder.js'));
const VKD = globalThis.__VKD;

const PORT = +(process.argv[2] || 8765);
const USER_ID = 123456;
const FIXTURE_MP3 = makeMp3(3);                    // ~3 s echtes MP3-ES (synthetisch)
const AES_KEY = crypto.randomBytes(16);
const SEG_COUNT = 3;
/* TS in SEG_COUNT Teilsegmente aufteilen (jedes mit eigenem PAT/PMT) */
const SEGMENTS = (() => {
  const third = Math.floor(FIXTURE_MP3.length / SEG_COUNT);
  return Array.from({ length: SEG_COUNT }, (_, i) => {
    const start = i * third;
    const end = i === SEG_COUNT - 1 ? FIXTURE_MP3.length : (i + 1) * third;
    return aesEncrypt(makeTs(FIXTURE_MP3.subarray(start, end)), AES_KEY, makeIv(i));
  });
})();

function obfuscate(url) { return VKD.decoder.encodeUrl(url, USER_ID); }

function makeIv(seq) {
  const iv = Buffer.alloc(16);
  iv[15] = seq & 0xFF;
  return iv;
}

function fixtureHtml() {
  /* VK-ähnlich: audiorow-actions-Zelle wird beim Hover per JS eingefügt (wie React),
     bei Mouseleave wieder entfernt. */
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>VK Fixture</title>
<script>window.__fixtureId = { id: ${USER_ID} };</script>
<style>
  .row-wrap { width: 600px; margin: 8px; }
  .row-inner { display: flex; align-items: center; gap: 8px; }
  [data-testid="audiorow-actions"] { display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; }
  .act { padding: 4px 8px; font: 12px system-ui; border: 1px solid #ccc; border-radius: 6px; background: #f5f6f8; cursor: pointer; }
</style>
<script>
  /* Actions-Zelle erst beim Hover in den DOM einfügen (wie VK) */
  function buildActions() {
    const d = document.createElement('div');
    d.setAttribute('data-testid', 'audiorow-actions');
    d.innerHTML = '<button class="act" data-testid="MusicAudio_OpenSnippet">Snippet öffnen</button>' +
      '<button class="act" data-testid="MusicAudio_OpenEditing">Titel bearbeiten</button>';
    return d;
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.row-wrap').forEach(wrap => {
      const row = wrap.querySelector('[data-testid="MusicTrackRow"]');
      const inner = row.querySelector('.row-inner');
      wrap.addEventListener('mouseenter', () => { if (!inner.querySelector('[data-testid="audiorow-actions"]')) inner.appendChild(buildActions()); });
      wrap.addEventListener('mouseleave', () => { const a = inner.querySelector('[data-testid="audiorow-actions"]'); if (a) a.remove(); });
    });
  });
</script>
</head>
<body>
<h1>VK Downloader Fixture</h1>
<div class="row-wrap">
  <div data-testid="MusicTrackRow">
    <div class="row-inner">
      <div data-testid="MusicTrackRow_Duration">2:56</div>
      <a href="/audio292900105_456239046_f32fce830564ee2bbf">Make You Fight</a>
      <div data-testid="MusicTrackRow_Title">Make You Fight</div>
      <div data-testid="MusicTrackRow_Authors">Chris Lake, ATRIP</div>
    </div>
  </div>
</div>
<div class="row-wrap">
  <div data-testid="MusicTrackRow">
    <div class="row-inner">
      <div data-testid="MusicTrackRow_Duration">2:41</div>
      <a href="/audio292900105_456239045_abc123">Car Crash</a>
      <div data-testid="MusicTrackRow_Title">Car Crash</div>
      <div data-testid="MusicTrackRow_Authors">Jigitz, Charlotte Plank</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

function trackPayload(ownerId, audioId) {
  /* Track 2 (456239045) zeigt auf eine defekte Playlist → Fehlerpfad-Test */
  const streamUrl = audioId === 456239045
    ? 'http://127.0.0.1:' + PORT + '/stream/broken.m3u8'
    : 'http://127.0.0.1:' + PORT + '/stream/master.m3u8';
  /* Echte VK-Form: payload[1][0] = Liste von Tracks */
  return JSON.stringify({
    payload: [0, [[
      [audioId, ownerId,
        obfuscate(streamUrl),
        'Car Crash', 'Jigitz, Charlotte Plank', 161,
        0, 0, '', 0, 34, '', '{"like":true}', '', '', '', '', '', '', false, 'hash', 0, 0, true, 'abc123', '', false, '', false, '', '', 0, []
      ]
    ]]]
  });
}

const MIME = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.pub': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const p = u.pathname;

  if (p === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(fixtureHtml());
    return;
  }
  if (p === '/al_audio.php' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = /audio_ids=(\d+)_(\d+)/.exec(body || '');
      const ownerId = m ? +m[1] : 292900105;
      const audioId = m ? +m[2] : 456239045;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(trackPayload(ownerId, audioId));
    });
    return;
  }
  if (p === '/stream/master.m3u8') {
    res.writeHead(200, { 'Content-Type': MIME['.m3u8'], 'Access-Control-Allow-Origin': '*' });
    res.end(makeMasterPlaylist('media.m3u8'));
    return;
  }
  if (p === '/stream/broken.m3u8') {
    res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('kaputt');
    return;
  }
  if (p === '/stream/media.m3u8') {
    res.writeHead(200, { 'Content-Type': MIME['.m3u8'], 'Access-Control-Allow-Origin': '*' });
    res.end(makeMediaPlaylist(SEG_COUNT, 'http://127.0.0.1:' + PORT + '/stream'));
    return;
  }
  if (p === '/stream/key.pub') {
    res.writeHead(200, { 'Content-Type': MIME['.pub'], 'Access-Control-Allow-Origin': '*' });
    res.end(AES_KEY);
    return;
  }
  const segM = /^\/stream\/seg-(\d+)\.ts$/.exec(p);
  if (segM) {
    const i = +segM[1];
    res.writeHead(200, { 'Content-Type': MIME['.ts'], 'Access-Control-Allow-Origin': '*' });
    res.end(SEGMENTS[i] || SEGMENTS[0]);
    return;
  }
  if (p === '/stream/source.mp3') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*' });
    res.end(FIXTURE_MP3);
    return;
  }
  const modM = /^\/modules\/(.+)$/.exec(p);
  if (modM) {
    const rel = modM[1].replace(/\.\./g, '');
    const file = path.join(root, 'src', rel);
    const ext = path.extname(file);
    try {
      const data = require('node:fs').readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('not found: ' + rel); return;
    }
  }
  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('404');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Fixture-Server: http://127.0.0.1:' + PORT);
  console.log('UserId für Obfuskierung: ' + USER_ID);
});
