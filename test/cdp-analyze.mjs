/* ============================================================================
 * VK Downloader — CDP-Live-Analyse am echten Yandex-Browser (Port 9222)
 * Verbindet sich per CDP-WebSocket, klickt den .vkd-btn und loggt
 * Netzwerk-Requests, Konsolen-Ausgaben und Fehler für ~25 s.
 * Aufruf: node test/cdp-analyze.mjs
 * ========================================================================== */
const LIST_URL = 'http://127.0.0.1:9222/json/list';

const tabs = await (await fetch(LIST_URL)).json();
const pages = tabs.filter((t) => t.type === 'page');
const vkTab = pages.find((t) => /vk\.(ru|com)\/audio/.test(t.url)) || pages.find((t) => /vk\.(ru|com)/.test(t.url));

if (!vkTab) {
  console.log('KEIN VK-Tab gefunden. Offene Tabs:');
  pages.forEach((t) => console.log('  - ' + t.url.slice(0, 110)));
  process.exit(1);
}
console.log('Tab: ' + vkTab.url.slice(0, 120));

const ws = new WebSocket(vkTab.webSocketDebuggerUrl);
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
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result || {});
    pending.delete(msg.id);
  } else if (msg.method) {
    events.push(msg);
  }
};

await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable');
await send('Network.enable');

/* Zustand vor dem Klick */
const state = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ url: location.href.slice(0,140), btns: document.querySelectorAll('.vkd-btn').length, firstTip: document.querySelector('.vkd-tip') ? document.querySelector('.vkd-tip').textContent : null, tmskript: !!window.__VKD })`,
  returnByValue: true
});
console.log('ZUSTAND:', state.result && state.result.value);

/* Klick auslösen */
const click = await send('Runtime.evaluate', {
  expression: `(() => { const b = document.querySelector('.vkd-btn'); if (!b) return 'KEIN BUTTON'; b.click(); return 'GEKLICKT'; })()`,
  returnByValue: true
});
console.log('KLICK:', click.result && click.result.value);

/* Events sammeln */
await new Promise((r) => setTimeout(r, 25000));

const reqs = [];
const cons = [];
const errs = [];
for (const e of events) {
  if (e.method === 'Network.requestWillBeSent' && /audio|music|m3u8|ts\?|key\.pub|vkuseraudio|userapi|okcdn|mycdn|api\.vk/i.test(e.params.request.url)) {
    reqs.push({ kind: 'REQ', url: e.params.request.url.slice(0, 150), method: e.params.request.method });
  }
  if (e.method === 'Network.responseReceived' && /audio|music|m3u8|ts\?|key\.pub|vkuseraudio|userapi|okcdn|mycdn|api\.vk/i.test(e.params.response.url)) {
    reqs.push({ kind: 'RESP', status: e.params.response.status, url: e.params.response.url.slice(0, 150) });
  }
  if (e.method === 'Network.loadingFailed') {
    errs.push({ kind: 'LOAD-FEHLER', url: (e.params && e.params.requestId || ''), errorText: e.params.errorText });
  }
  if (e.method === 'Runtime.consoleAPICalled') {
    const args = (e.params.args || []).map((a) => a.value !== undefined ? String(a.value).slice(0, 120) : a.description || a.type).join(' ');
    cons.push({ type: e.params.type, text: args.slice(0, 200) });
  }
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    errs.push({ kind: 'EXCEPTION', text: d.exception ? d.exception.description : d.text });
  }
}

console.log('\n=== NETZWERK (Audio-relevant) ===');
reqs.forEach((r) => console.log(' ' + r.kind + (r.status ? ' ' + r.status : '') + '  ' + r.url));
console.log('\n=== KONSOLE ===');
cons.forEach((c) => console.log(' [' + c.type + '] ' + c.text));
console.log('\n=== FEHLER ===');
errs.length ? errs.forEach((e) => console.log(' ' + JSON.stringify(e))) : console.log(' (keine)');

/* Fazit */
const downloadOk = cons.some((c) => /gespeichert/.test(c.text));
console.log('\n=== FAZIT ===');
console.log('Download-Status im Tooltip: ' + (downloadOk ? 'OK (gespeichert)' : 'kein "gespeichert" sichtbar'));
ws.close();
process.exit(0);
