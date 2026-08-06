/* ============================================================================
 * VK Downloader — CDP-Live-Analyse am echten Yandex-Browser (Port 9222)
 * 1) VK-Audio-Tab öffnen (falls keiner da), warten bis der .vkd-btn erscheint
 * 2) Klick → Netzwerk/Konsole/Fehler für 40 s mitschneiden
 * 3) Download-Ordner danach nach frischen MP3 prüfen
 * Aufruf: node test/cdp-live.mjs
 * ========================================================================== */
import { readdirSync, statSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const DOWNLOAD_DIRS = ['E:\\Downloads\\!rar', 'C:\\Users\\lolo\\Downloads'];

async function getTabs() { return (await (await fetch(CDP + '/json/list')).json()).filter((t) => t.type === 'page'); }

/* Tab sicherstellen */
let tabs = await getTabs();
let tab = tabs.find((t) => /vk\.(ru|com)\/audio/.test(t.url));
if (!tab) {
  const url = encodeURIComponent('https://vk.ru/audio?performer=1&q=Chris Lake, ATRIP');
  const created = await (await fetch(CDP + '/json/new?' + url, { method: 'PUT' })).json();
  tab = created;
  console.log('Neuer Tab geöffnet.');
} else {
  console.log('Vorhandener Tab: ' + tab.url.slice(0, 100));
}

const ws = new WebSocket(tab.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const events = [];
function send(method, params) {
  return new Promise((resolve) => {
    const mid = ++msgId;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
  else if (m.method) events.push(m);
};
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable');
await send('Network.enable');

/* 1) Zustand + auf Button warten (bis 25 s) */
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result && r.result.value;
}
let state = await evalJs(`JSON.stringify({ url: location.href.slice(0,120), title: document.title.slice(0,50), rows: document.querySelectorAll('[data-testid="MusicTrackRow"]').length, btns: document.querySelectorAll('.vkd-btn').length, loginForm: !!document.querySelector('input[name="email"], input[name="phone"]') })`);
console.log('ZUSTAND (t=0):', state);
let btns = 0;
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 500));
  btns = await evalJs(`document.querySelectorAll('.vkd-btn').length`);
  if (btns > 0) break;
}
console.log('Buttons nach Wartezeit: ' + btns);

/* 2) Klick */
if (btns > 0) {
  console.log('KLICKE .vkd-btn …');
  await evalJs(`(() => { const b = document.querySelector('.vkd-btn'); if (b) b.click(); return 'geklickt'; })()`);
} else {
  console.log('KEIN Button — Abbruch (kein Login oder Skript inaktiv?)');
}

/* 40 s Events sammeln */
await new Promise((r) => setTimeout(r, 40000));

const typeNames = {};
const rawT = JSON.parse('{}');
/* Type-Namen aus einem zweiten Lesen vermeiden: Namen aus Events direkt ableiten */
const reqs = [];
const cons = [];
const errs = [];
for (const e of events) {
  if (e.method === 'Network.requestWillBeSent') {
    const u = e.params.request.url;
    if (/vkuseraudio|m3u8|\.ts(\?|$)|key\.pub|al_audio|audio|userapi/i.test(u)) {
      reqs.push({ kind: 'REQ', url: u.slice(0, 200) });
    }
  }
  if (e.method === 'Network.responseReceived') {
    const u = e.params.response.url;
    if (/vkuseraudio|m3u8|\.ts(\?|$)|key\.pub|al_audio|audio|userapi/i.test(u)) {
      reqs.push({ kind: 'RESP', status: e.params.response.status, url: u.slice(0, 200) });
    }
  }
  if (e.method === 'Network.loadingFailed') {
    errs.push({ kind: 'LOAD-FEHLER', errorText: e.params.errorText, requestId: e.params.requestId });
  }
  if (e.method === 'Runtime.consoleAPICalled') {
    const args = (e.params.args || []).map((a) => a.value !== undefined ? String(a.value).slice(0, 140) : (a.description || a.type)).join(' ');
    cons.push({ type: e.params.type, text: args.slice(0, 220) });
  }
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    errs.push({ kind: 'EXCEPTION', text: d.exception ? d.exception.description : d.text });
  }
}

console.log('\n=== NETZWERK (Audio-relevant) ===');
reqs.forEach((r) => console.log(' ' + r.kind + (r.status ? ' ' + r.status : '') + '  ' + r.url));
console.log('\n=== KONSOLE (VK Downloader) ===');
cons.filter((c) => /VK Downloader|vkd|manifest|Segment|gespeichert|Netzwerkfehler|Timeout/i.test(c.text)).forEach((c) => console.log(' [' + c.type + '] ' + c.text));
console.log('\n=== FEHLER ===');
errs.length ? errs.forEach((e) => console.log(' ' + JSON.stringify(e).slice(0, 200))) : console.log(' (keine)');

/* 3) Download-Ordner prüfen */
console.log('\n=== DOWNLOAD-ORDNER (frische MP3) ===');
const now = Date.now();
for (const dir of DOWNLOAD_DIRS) {
  try {
    const fresh = readdirSync(dir)
      .filter((f) => /\.(mp3|m4a|aac)$/i.test(f))
      .map((f) => ({ f, mtime: statSync(dir + '\\' + f).mtimeMs }))
      .filter((x) => now - x.mtime < 15 * 60 * 1000);
    if (fresh.length) fresh.forEach((x) => console.log(' ' + dir + '\\' + x.f + ' (' + new Date(x.mtime).toLocaleTimeString() + ')'));
    else console.log(' ' + dir + ': keine frischen Audio-Dateien');
  } catch (e) { console.log(' ' + dir + ': nicht lesbar'); }
}

const tip = await evalJs(`document.querySelector('.vkd-tip') ? document.querySelector('.vkd-tip').textContent : null`);
console.log('\nTOOLTIP jetzt: ' + tip);
ws.close();
process.exit(0);
