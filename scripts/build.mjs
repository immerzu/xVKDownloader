/* ============================================================================
 * xVKDownloader — build.mjs
 * Baut dist/xvkdownloader.user.js aus src/-Modulen (mit Userscript-Header).
 * Aufruf: node scripts/build.mjs
 * ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEADER = `// ==UserScript==
// @name         xVKDownloader
// @namespace    local.xvkdownloader
// @version      1.0.15
// @description  Download-Button pro Track auf VK Audio-Seiten (vk.com/vk.ru); lädt den HLS-Stream und speichert MP3 lokal. Tampermonkey-kompatibel.
// @description:en  Download button for each track on VK Audio pages (vk.com/vk.ru); loads the HLS stream and saves MP3 locally. Tampermonkey-compatible.
// @description:ru  Кнопка загрузки для каждого трека на страницах VK Audio (vk.com/vk.ru); загружает HLS-поток и сохраняет MP3 локально. Совместимо с Tampermonkey.
// @author       Ede
// @match        https://vk.com/*
// @match        https://www.vk.com/*
// @match        https://vk.ru/*
// @match        https://www.vk.ru/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// @connect      vk.com
// @connect      vk.ru
// @connect      api.vk.com
// @connect      *.vkuseraudio.net
// @connect      *.vkuseraudio.ru
// @connect      *.vkuservideo.net
// @connect      *.userapi.com
// @connect      *.okcdn.ru
// @connect      *.mycdn.me
// @connect      *.vk-cdn.net
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @noframes
// @license      MIT (nur private Nutzung)
// ==/UserScript==

/* xVKDownloader — gebaut aus src/. Quellen: src/main.js + src/shared/* */
(function (globalThis) {
'use strict';
`;

const FOOTER = `})(typeof window !== 'undefined' ? window : globalThis);
`;

const FILES = [
  'src/shared/vk-decoder.js',
  'src/shared/m3u8.js',
  'src/shared/ts-demux.js',
  'src/shared/assemble.js',
  'src/shared/aes.js',
  'src/shared/gm-net.js',
  'src/shared/settings.js',
  'src/main.js'
];

let out = HEADER;
for (const f of FILES) {
  const src = readFileSync(path.join(root, f), 'utf8');
  out += '\n/* ===== ' + f + ' ===== */\n' + src + '\n';
}
out += FOOTER;

mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(path.join(root, 'dist/xvkdownloader.user.js'), out);

/* Header-Validierung */
const head = out.slice(0, 2000);
const issues = [];
if (!head.startsWith('// ==UserScript==')) issues.push('Header fehlt');
for (const g of ['GM_xmlhttpRequest', 'GM_download', 'GM_setValue', 'GM_getValue', 'GM_registerMenuCommand']) {
  if (head.indexOf('@grant        ' + g) === -1) issues.push('Grant fehlt: ' + g);
}
if (issues.length) { console.error('BUILD-FEHLER:', issues.join(', ')); process.exit(1); }

console.log('dist/xvkdownloader.user.js geschrieben: ' + (out.length / 1024).toFixed(1) + ' KB');
