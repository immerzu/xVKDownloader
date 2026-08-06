/* Timeline der Stream-Events mit Zeiten + letzte Events des Logs */
import { readFileSync } from 'node:fs';
const file = process.argv[2] || 'E:\\Downloads\\!rar\\chrome-net-export-log.json';
const log = JSON.parse(readFileSync(file, 'utf8'));
const rawTypes = (log.constants && log.constants.logEventTypes) || {};
const typeNames = {};
for (const k of Object.keys(rawTypes)) typeNames[rawTypes[k]] = k;
const evs = log.events || [];
const t0 = evs.length ? evs[0].time : 0;

const stream = evs.filter(ev => {
  const p = ev.params || {};
  const url = p.url || (p.request && p.request.url) || '';
  return /vkuseraudio|m3u8|key\.pub|\.ts(\?|$)/i.test(url);
});
console.log('=== Stream-Events-Timeline (t-relative, ms) ===');
stream.forEach(ev => {
  const p = ev.params || {};
  const url = (p.url || (p.request && p.request.url) || '').split('/').pop();
  console.log(
    String(ev.time - t0).padStart(8) + 'ms  ' +
    (typeNames[ev.type] || ev.type).padEnd(30) +
    (p.http_response_code ? ' HTTP ' + p.http_response_code : '') +
    (p.net_error ? ' err=' + p.net_error : '') +
    '  ' + url.slice(0, 60)
  );
});

console.log('\n=== Letzte 12 Events des Logs überhaupt ===');
evs.slice(-12).forEach(ev => {
  const p = ev.params || {};
  const url = (p.url || '').split('/').pop() || '';
  console.log(String(ev.time - t0).padStart(8) + 'ms  ' + (typeNames[ev.type] || ev.type) + '  ' + (p.http_response_code ? 'HTTP ' + p.http_response_code + ' ' : '') + (p.net_error ? 'err=' + p.net_error + ' ' : '') + url.slice(0, 70));
});
console.log('\nEventanzahl gesamt:', evs.length, '| Zeitraum: ' + t0 + ' → ' + evs[evs.length - 1].time + ' (' + (evs[evs.length - 1].time - t0) + ' ms)');
