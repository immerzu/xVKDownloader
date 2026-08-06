/* ============================================================================
 * xVKDownloader — fetch-ffmpeg-wasm.mjs
 * Lädt ffmpeg.wasm 0.11.6 (UMD) in dist/vendor/ffmpeg/ für die EXPERIMENTELLE
 * AAC→MP3-Transkodierung. Ohne diese Dateien wird bei AAC-Streams der native
 * Container (.aac/.m4a) gespeichert.
 * Aufruf: node scripts/fetch-ffmpeg-wasm.mjs
 * ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/umd';
const FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'vendor', 'ffmpeg');

mkdirSync(outDir, { recursive: true });

for (const f of FILES) {
  const url = BASE + '/' + f;
  process.stdout.write('Lade ' + url + ' … ');
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' für ' + f);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(path.join(outDir, f), buf);
  console.log((buf.length / 1024 / 1024).toFixed(1) + ' MB → dist/vendor/ffmpeg/' + f);
}
console.log('Fertig. ffmpeg.wasm wird vom Userscript nur geladen, wenn "transcode" aktiviert ist.');
