/* ============================================================================
 * xVKDownloader — NetLog-Analyse (chrome-net-export-log.json)
 * Extrahiert aus dem Chrome-NetLog alle Audio-relevanten Requests
 * (vk.com/vk.ru/al_audio/vkuseraudio/userapi/m3u8/ts/key) mit
 * Status-Codes, Initiatoren und net_error-Fehlercodes, zeitlich sortiert.
 * Aufruf: node test/netlog-analyze.mjs "E:\Downloads\!rar\chrome-net-export-log.json"
 * ========================================================================== */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'E:\\Downloads\\!rar\\chrome-net-export-log.json';
console.log('Lese ' + file + ' …');
const raw = readFileSync(file, 'utf8');
console.log('Parse JSON …');
const log = JSON.parse(raw);

const typeNames = log.constants && log.constants.logEventTypes || {};
const RELEVANT = /vk\.(ru|com)|al_audio|music|audio|m3u8|\.ts(\?|$)|key\.pub|vkuseraudio|userapi|okcdn|mycdn|vk-cdn|api\.vk/i;

const rows = [];
let netErrors = 0;

for (const ev of log.events || []) {
  const t = ev.type;
  const name = typeNames[t] || ('TYPE_' + t);
  const p = ev.params || {};
  const url = p.url || (p.request && p.request.url) || '';
  const hasNetError = typeof p.net_error === 'number' && p.net_error !== 0;
  if (hasNetError) netErrors++;
  if (!url && !hasNetError) continue;
  if (!RELEVANT.test(url) && !(hasNetError && /vk|audio|music|vkuseraudio|userapi/i.test(url))) continue;

  let status = null;
  if (p.headers && Array.isArray(p.headers) && p.headers.length && /^HTTP\/\d/.test(p.headers[0] || '')) {
    status = p.headers[0];
  }
  const initiator = p.initiator ? (p.initiator.url || p.initiator.type || '') : '';
  rows.push({
    time: ev.time,
    name: name,
    url: (url || '').slice(0, 170),
    status: status,
    err: hasNetError ? p.net_error : null,
    initiator: (initiator || '').slice(0, 90),
    extra: p.error_lib_name ? p.error_lib_name : null
  });
}

rows.sort((a, b) => a.time - b.time);
console.log('Relevante Events: ' + rows.length + ' (net_error-Events gesamt: ' + netErrors + ')');

/* Kompakte Timeline: je Request URL + erste Status-/Fehler-Meldung */
const seen = new Map();
for (const r of rows) {
  const key = r.url;
  if (!seen.has(key)) seen.set(key, { first: r, responses: [], errs: [] });
  const s = seen.get(key);
  if (r.status) s.responses.push(r.status);
  if (r.err) s.errs.push(r.err);
}
console.log('\n=== REQUESTS (einmalig pro URL) ===');
let i = 0;
for (const [url, s] of seen) {
  i++;
  const statusStr = s.responses.length ? s.responses.map(x => x.split('\r\n')[0]).join(' | ') : '-';
  const errStr = s.errs.length ? ' FEHLER=' + s.errs.join(',') : '';
  console.log((i + ')').padEnd(4) + ' ' + statusStr.padEnd(22) + ' ' + (s.first.initiator ? '(' + s.first.initiator.slice(0, 40) + ') ' : '') + url.slice(0, 150) + errStr);
}

/* Nur Fehler-Requests kompakt */
console.log('\n=== FEHLER (net_error != 0) ===');
const errRows = rows.filter(r => r.err);
if (!errRows.length) console.log(' (keine)');
errRows.slice(0, 40).forEach(r => {
  console.log(' err=' + r.err + '  ' + r.name + '  ' + r.url.slice(0, 150));
});
