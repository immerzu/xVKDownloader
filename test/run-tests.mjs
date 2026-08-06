/* ============================================================================
 * VK Downloader — Unit-Tests (Node)
 * Testet die echten src/-Module (gleiche Dateien, die in das Userscript
 * gebaut werden). Fixtures: strukturell gültige MP3/TS/ADTS/fMP4-Bytes.
 * Aufruf: node test/run-tests.mjs
 * ========================================================================== */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { makeMp3, makeTs, makeAdtsAac, makeFmp4, aesEncrypt } from './fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* WebCrypto für aes-Tests (Node 18: globalThis.crypto setzen) */
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  globalThis.crypto = crypto.webcrypto;
}

for (const f of ['vk-decoder.js', 'm3u8.js', 'ts-demux.js', 'assemble.js', 'aes.js', 'gm-net.js', 'settings.js']) {
  require(path.join(root, 'src/shared', f));
}
const VKD = globalThis.__VKD;

let pass = 0, fail = 0;
const pending = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(() => { pass++; console.log('  ✔ ' + name); }, (e) => { fail++; console.error('  ✘ ' + name + ' — ' + e.message); }));
    } else {
      pass++;
      console.log('  ✔ ' + name);
    }
  } catch (e) {
    fail++;
    console.error('  ✘ ' + name + ' — ' + e.message);
  }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'Vergleich') + ': erwartet ' + JSON.stringify(b) + ', erhalten ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'Bedingung nicht erfüllt'); }
function bytesEq(a, b, msg) {
  if (a.length !== b.length) throw new Error((msg || 'Bytes') + ': Länge ' + a.length + ' ≠ ' + b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error((msg || 'Bytes') + ': Byte ' + i + ' (' + a[i] + ' ≠ ' + b[i] + ')');
}

console.log('--- Decoder ---');
test('b64-Roundtrip', () => {
  eq(VKD.decoder.b64Decode(VKD.decoder.b64Encode('https://cs9.vkuseraudio.ru/x?a=1&b=2')), 'https://cs9.vkuseraudio.ru/x?a=1&b=2', 'b64');
});
test('decodeUrl(encodeUrl) für alle Ops + Kombis', () => {
  const plain = 'https://cs9-4v4.vkuseraudio.ru/s/v1/ac/hash/index.m3u8?siren=1';
  const userId = 292900105;
  const seqs = [
    [['v']], [['r', '5']], [['s', '7']], [['i', '3']], [['x', 'W']],
    [['v'], ['r', '5'], ['i', '3'], ['x', 'W']],
    [['x', 'A'], ['s', '2'], ['r', '9'], ['v']],
    [['i', '111'], ['x', 'Z'], ['r', '1']]
  ];
  for (const ops of seqs) {
    eq(VKD.decoder.decodeUrl(VKD.decoder.encodeUrl(plain, userId, ops), userId), plain, 'ops ' + JSON.stringify(ops));
  }
});
test('decodeUrl lässt normale URLs unverändert', () => {
  eq(VKD.decoder.decodeUrl('https://vk.com/audio123_456', 1), 'https://vk.com/audio123_456');
});
test('Regressions-Vektor: i-Op mit userId (wie reale VK-URL)', () => {
  /* Reale URL-Struktur: nur Op i(415) mit userId 292900105. Hier generiert. */
  const plain = 'https://cs9-4v4.vkuseraudio.ru/s/v1/ac/2XtP5/index.m3u8?siren=1';
  const enc = VKD.decoder.encodeUrl(plain, 292900105, [['i', '415']]);
  ok(enc.indexOf('audio_api_unavailable') !== -1, 'obfuskiert');
  eq(VKD.decoder.decodeUrl(enc, 292900105), plain, 'i-Op mit userId');
  ok(VKD.decoder.decodeUrl(enc, 999) !== plain, 'falsche userId schlägt fehl');
});

console.log('--- m3u8 ---');
test('Media-Playlist + relative URLs + ../', () => {
  const pl = VKD.m3u8.parsePlaylist('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2.0,\nseg-00.ts?siren=1\n#EXTINF:3.5,\n../up/seg-01.ts\n#EXT-X-ENDLIST\n');
  eq(pl.type, 'media');
  eq(pl.segments.length, 2);
  eq(pl.segments[0].uri, 'seg-00.ts?siren=1');
  const segs = VKD.m3u8.segmentUrls('https://x.ru/stream/index.m3u8', pl.segments, pl.mediaSequence);
  eq(segs[0].url, 'https://x.ru/stream/seg-00.ts?siren=1');
  eq(segs[1].url, 'https://x.ru/up/seg-01.ts');
  eq(segs[0].sequence, 0);
  eq(segs[1].sequence, 1);
});
test('Master-Playlist + pickVariant wählt höchste Bandbreite (AAC > MP3)', () => {
  const pl = VKD.m3u8.parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=320000,CODECS="mp4a.40.2"\naac.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp3"\nmp3.m3u8\n');
  eq(pl.type, 'master');
  eq(pl.variants.length, 2);
  eq(VKD.m3u8.pickVariant(pl.variants).uri, 'aac.m3u8');
});
test('Master-Playlist + pickVariant wählt höchste Bandbreite (MP3 > AAC)', () => {
  const pl = VKD.m3u8.parsePlaylist('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=320000,CODECS="mp3"\nmp3.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"\naac.m3u8\n');
  eq(VKD.m3u8.pickVariant(pl.variants).uri, 'mp3.m3u8');
});
test('AES-128-Key-Status pro Segment (METHOD=AES-128 unquotiert)', () => {
  const pl = VKD.m3u8.parsePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://x.ru/key.pub"\n#EXTINF:2,\na.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:2,\nb.ts\n#EXTINF:2,\nc.ts\n');
  eq(pl.encrypted, true);
  eq(pl.segments[0].encrypted, true);
  eq(pl.segments[0].keyUri, 'https://x.ru/key.pub');
  eq(pl.segments[1].encrypted, false);
  eq(pl.segments[2].encrypted, false);
});

console.log('--- TS-Demux ---');
test('isTs erkennt TS', () => {
  const ts = makeTs(makeMp3(1));
  ok(VKD.tsDemux.isTs(new Uint8Array(ts)));
  ok(!VKD.tsDemux.isTs(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])));
  ok(!VKD.tsDemux.isTs(new Uint8Array(10)));
});
test('Demux TS → MP3-ES bytegleich', () => {
  const mp3 = makeMp3(2);
  const ts = makeTs(mp3);
  const d = VKD.tsDemux.demuxTs(new Uint8Array(ts));
  eq(d.streamType, 3, 'streamType');
  eq(d.pid, 0x101, 'pid');
  bytesEq(d.es, new Uint8Array(mp3), 'ES bytegleich');
});
test('PAT ohne CRC-Pseudo-Programm (Regression CRC-Bug)', () => {
  const ts = makeTs(makeMp3(1));
  const payload = new Uint8Array(ts).subarray(4, 188);
  const pats = VKD.tsDemux.parsePatEntries(payload, 0, payload.length);
  eq(pats.length, 1, 'nur 1 Programm');
  eq(pats[0].program, 1);
  eq(pats[0].pid, 0x100);
  const pmts = VKD.tsDemux.parsePmtEntries(new Uint8Array(ts).subarray(192, 376), 0, 184);
  eq(pmts.length, 1, 'nur 1 Stream');
  eq(pmts[0].streamType, 3);
  eq(pmts[0].pid, 0x101);
});

console.log('--- Assemble ---');
test('classify: rohes MP3', () => {
  const c = VKD.assemble.classify(new Uint8Array(makeMp3(1)));
  eq(c.codec, 'mp3');
  eq(c.needsTranscode, false);
  eq(c.ext, '.mp3');
});
test('classify: ADTS-AAC', () => {
  const c = VKD.assemble.classify(new Uint8Array(makeAdtsAac()));
  eq(c.codec, 'aac-adts');
  eq(c.needsTranscode, true);
  eq(c.ext, '.aac');
});
test('classify: fMP4', () => {
  const c = VKD.assemble.classify(new Uint8Array(makeFmp4()));
  eq(c.container, 'fmp4');
  eq(c.needsTranscode, true);
  eq(c.ext, '.m4a');
});
test('concat: zwei TS(MP3)-Segmente → komplettes MP3-ES', () => {
  const mp3 = makeMp3(3);
  const half = Math.floor(mp3.length / 2);
  const segs = [makeTs(mp3.subarray(0, half)), makeTs(mp3.subarray(half))];
  const u8 = segs.map((b) => new Uint8Array(b));
  const first = VKD.assemble.classify(u8[0]);
  eq(first.container, 'ts');
  const res = VKD.assemble.concatSegments(u8, first);
  eq(res.codec, 'mp3');
  eq(res.needsTranscode, false);
  bytesEq(res.bytes, new Uint8Array(mp3), 'konkateniertes ES');
  const ana = VKD.assemble.analyzeMp3(res.bytes);
  ok(ana.frames >= 200, 'Frames: ' + ana.frames);
  eq(ana.bitrate, 128);
  eq(ana.sampleRate, 44100);
  eq(ana.channels, 2);
  ok(ana.valid);
});
test('analyzeMp3 auf synthetischem MP3', () => {
  const ana = VKD.assemble.analyzeMp3(new Uint8Array(makeMp3(2)));
  eq(ana.bitrate, 128);
  eq(ana.sampleRate, 44100);
  eq(ana.channels, 2);
  ok(ana.frames > 100, 'Frames: ' + ana.frames);
  ok(ana.valid);
});
test('analyzeMp3: MPEG2 Layer3 mit korrekter Bitrate (Regression)', () => {
  /* MPEG2-L3-Frame: Byte1=0xF5 (Sync 111 + Version 10=MPEG2 + Layer 01=III + no CRC),
     brIdx=1 (8 kbps — MPEG2-L3-Tabelle; Halbierung von MPEG1-L3[1]=32 ergäbe fälschlich 16),
     srIdx=0 → SampleRate 44100/2 = 22050 Hz. frameLen = 72 * 8000 / 22050 = 26 (Padding 0). */
  const len = Math.floor((72 * 8 * 1000) / 22050);
  const b = new Uint8Array(len);
  b[0] = 0xFF; b[1] = 0xF5; b[2] = (1 << 4) | (0 << 2); b[3] = 0x00;
  const ana = VKD.assemble.analyzeMp3(b);
  eq(ana.bitrate, 8, 'MPEG2-Bitrate');
  eq(ana.sampleRate, 22050, 'MPEG2-SampleRate');
  eq(ana.frames, 1, 'Frames');
  ok(ana.valid, 'valid');
});

console.log('--- Dateiname ---');
test('sanitizeName: normale Namen', () => {
  eq(VKD.assemble.sanitizeName('Chris Lake, ATRIP - Make You Fight'), 'Chris Lake, ATRIP - Make You Fight');
});
test('sanitizeName: entfernt Sonderzeichen', () => {
  eq(VKD.assemble.sanitizeName('A/B:C*D?E"F<G>H|I'), 'A B C D E F G H I');
});
test('sanitizeName: Fallback bei leer', () => {
  eq(VKD.assemble.sanitizeName(''), 'vk-track');
  eq(VKD.assemble.sanitizeName('   _ _  '), 'vk-track');
});
test('sanitizeName: HTML-Entities', () => {
  eq(VKD.assemble.sanitizeName('Delerium &amp; Sarah McLachlan'), 'Delerium & Sarah McLachlan');
});
test('withExt', () => {
  eq(VKD.assemble.withExt('Artist - Title', '.mp3'), 'Artist - Title.mp3');
});

console.log('--- AES ---');
test('makeIv Big-Endian', () => {
  const iv1 = VKD.aes.makeIv(1);
  eq(iv1[15], 1); eq(iv1[0], 0);
  const iv258 = VKD.aes.makeIv(258);
  eq(iv258[14], 1); eq(iv258[15], 2);
});
test('AES-128-CBC Roundtrip (WebCrypto)', async () => {
  const key = crypto.randomBytes(16);
  const plain = crypto.randomBytes(200);
  const cipher = aesEncrypt(plain, key);
  const dec = await VKD.aes.decryptAes128Cbc(new Uint8Array(cipher), new Uint8Array(key), new Uint8Array(16));
  bytesEq(dec, new Uint8Array(plain), 'AES-Roundtrip');
});

Promise.all(pending).then(() => {
  console.log('\nErgebnis: ' + pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  process.exit(fail ? 1 : 0);
});
