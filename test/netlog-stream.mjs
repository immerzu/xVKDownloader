/* NetLog-Detail: alle Events rund um die m3u8-/Stream-Requests + Initiator + Status */
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'E:\\Downloads\\!rar\\chrome-net-export-log.json';
const log = JSON.parse(readFileSync(file, 'utf8'));

/* Type-Namen: constants.logEventTypes ist {name: num} oder {num: name} */
const rawTypes = (log.constants && log.constants.logEventTypes) || {};
const typeNames = {};
for (const k of Object.keys(rawTypes)) typeNames[rawTypes[k]] = k;
const netErr = (log.constants && log.constants.netError) || {};
const errNames = {};
for (const k of Object.keys(netErr)) errNames[netErr[k]] = k;

const evs = log.events || [];
const streamRows = [];
for (const ev of evs) {
  const p = ev.params || {};
  const url = p.url || (p.request && p.request.url) || '';
  if (/m3u8|vkuseraudio|\.ts(\?|$)|key\.pub/i.test(url)) {
    streamRows.push({
      time: ev.time,
      type: typeNames[ev.type] || ('TYPE_' + ev.type),
      url: url.slice(0, 240),
      status: p.http_response_code || null,
      net_error: p.net_error || null,
      errName: (typeof p.net_error === 'number' && p.net_error !== 0) ? (errNames[p.net_error] || p.net_error) : null,
      initiator: (p.initiator && (p.initiator.url || p.initiator.type)) || null,
      headers: Array.isArray(p.headers) ? p.headers.slice(0, 3) : null
    });
  }
}
streamRows.sort((a, b) => a.time - b.time);
console.log('=== Stream-Events (' + streamRows.length + ') ===');
for (const r of streamRows) {
  console.log(
    (r.status ? 'HTTP ' + r.status + ' ' : '') +
    (r.errName ? ' err=' + r.errName + ' ' : '') +
    '[' + r.type + '] ' + r.url +
    (r.initiator ? ' | init:' + String(r.initiator).slice(0, 60) : '') +
    (r.headers && r.headers[0] ? ' | ' + r.headers[0].slice(0, 70) : '')
  );
}

console.log('\n=== Fehler-Events mit URL (Name) ===');
let c = 0;
for (const ev of evs) {
  const p = ev.params || {};
  const url = p.url || '';
  if (typeof p.net_error === 'number' && p.net_error !== 0 && /vk|audio|music|vkuseraudio|userapi|m3u8/i.test(url)) {
    console.log(' err=' + (errNames[p.net_error] || p.net_error) + ' [' + (typeNames[ev.type] || ev.type) + '] ' + url.slice(0, 180));
    if (++c > 30) break;
  }
}

