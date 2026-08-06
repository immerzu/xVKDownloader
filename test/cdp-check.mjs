/* CDP-Diagnose: Login-Status + Tampermonkey + DOM auf dem VK-Tab */
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const vk = tabs.find((t) => t.type === 'page' && /vk\.(ru|com)/.test(t.url));
if (!vk) { console.log('Kein VK-Tab'); process.exit(1); }
const ws = new WebSocket(vk.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
function send(method, params) { return new Promise((r) => { const m = ++id; pending.set(m, r); ws.send(JSON.stringify({ id: m, method, params: params || {} })); }); }
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
await new Promise((r) => { ws.onopen = r; });
const res = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    url: location.href.slice(0,120),
    title: document.title.slice(0,60),
    eingeloggtElement: (document.body.innerText.match(/Ede|Konto|Войти|Вход|Log in|Login/i) || [])[0] || null,
    cookieRemix: document.cookie.slice(0, 80),
    trackRows: document.querySelectorAll('[data-testid="MusicTrackRow"]').length,
    audioRows: document.querySelectorAll('[data-testid^="MusicTrack"]').length,
    vkdBtns: document.querySelectorAll('.vkd-btn').length,
    headId: (document.head.textContent.match(/\\bid:\\s?(\\d+)/) || [])[1] || null
  })`,
  returnByValue: true
});
console.log(res.result.value);
ws.close();
