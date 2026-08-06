/* ============================================================================
 * VK Downloader — Test-Fixtures (Node)
 * Erzeugt synthetische, strukturell gültige MP3-Frames, MPEG-TS-Container
 * (PAT/PMT/PES) und AES-128-CBC-verschlüsselte HLS-Segmente.
 * Kein echtes Audio — nur Byte-Struktur (Frame-Syncs, Container), ausreichend
 * für Parser-/Assembler-/Entschlüsselungs-Tests.
 * ========================================================================== */
import crypto from 'node:crypto';

const BITRATE_IDX = { 32: 1, 40: 2, 48: 3, 56: 4, 64: 5, 80: 6, 96: 7, 112: 8, 128: 9, 160: 10, 192: 11, 224: 12, 256: 13, 320: 14 };
const SAMPLE_IDX = { 44100: 0, 48000: 1, 32000: 2 };

/** Ein MPEG1-Layer3-Frame (Header + Nutzdaten). */
export function makeMp3Frame({ bitrate = 128, sampleRate = 44100 } = {}) {
  const bi = BITRATE_IDX[bitrate] || 9;
  const si = SAMPLE_IDX[sampleRate] ?? 0;
  const frameLen = Math.floor((144 * bitrate * 1000) / sampleRate); // padding 0
  const f = Buffer.alloc(frameLen);
  f[0] = 0xFF;
  f[1] = 0xFB; // 111 11 01 1: Sync(3) + MPEG1(2) + Layer3(2) + no CRC
  f[2] = (bi << 4) | (si << 2) | 0;
  f[3] = 0x00;
  for (let i = 4; i < frameLen; i++) f[i] = (i * 7 + 13) & 0xFF; // deterministischer "Payload"
  return f;
}

export function makeMp3(seconds = 3, opts = {}) {
  const frame = makeMp3Frame(opts);
  const sr = opts.sampleRate || 44100;
  const br = opts.bitrate || 128;
  const frameLen = Math.floor((144 * br * 1000) / sr);
  const frames = Math.max(1, Math.round((seconds * sr) / frameLen));
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function tsPacket(pid, payload, pusi, cont) {
  const pkt = Buffer.alloc(188, 0xFF);
  pkt[0] = 0x47;
  pkt[1] = (pusi ? 0x40 : 0) | ((pid >> 8) & 0x1F);
  pkt[2] = pid & 0xFF;
  pkt[3] = 0x10 | (cont & 0x0F); // adaption 00, payload only
  payload.copy(pkt, 4, 0, Math.min(payload.length, 184));
  return pkt;
}

function patPacket() {
  // pointer(0) table_id(0x00) section_length(B0 0D = 13) tsid(1) ver(C1) sec(0) last(0)
  // prog(00 01) pmtpid(E100) crc(0000) — wie echtes VK-TS
  return tsPacket(0x0000, Buffer.from([0x00, 0x00, 0xB0, 0x0D, 0x00, 0x01, 0xC1, 0x00, 0x00, 0x00, 0x01, 0xE1, 0x00, 0x00, 0x00, 0x00, 0x00]), true, 0);
}

function pmtPacket() {
  // pointer(0) table_id(0x02) section_length(B0 12 = 18) prog(1) ver(C1) sec(0) last(0)
  // pcrpid(E100) pinfo(0) stream_type(0x03) pid(E101) eslen(0) crc(0000)
  return tsPacket(0x0100, Buffer.from([0x00, 0x02, 0xB0, 0x12, 0x00, 0x01, 0xC1, 0x00, 0x00, 0xE1, 0x00, 0x00, 0x00, 0x03, 0xE1, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), true, 0);
}

/** Muxed MP3-ES in MPEG-TS (Audio-PID 0x101, stream_type 0x03). */
export function makeTs(mp3Bytes) {
  const chunks = [patPacket(), pmtPacket()];
  let cont = 0;
  const MAX_PES = 175; /* PES-Header 9 B + Payload ≤ 184 B TS-Payload */
  for (let off = 0; off < mp3Bytes.length; ) {
    const len = Math.min(MAX_PES, mp3Bytes.length - off);
    const part = mp3Bytes.subarray(off, off + len);
    off += len;
    const pes = Buffer.alloc(9 + len);
    pes[0] = 0x00; pes[1] = 0x00; pes[2] = 0x01; pes[3] = 0xC0; // MPEG-Audio-PES
    pes[4] = (3 + len) >> 8; pes[5] = (3 + len) & 0xFF;
    pes[6] = 0x80; pes[7] = 0x00; pes[8] = 0x00;
    part.copy(pes, 9);
    chunks.push(tsPacket(0x101, pes, true, cont++ & 0x0F));
  }
  return Buffer.concat(chunks);
}

/** ADTS-AAC-Frame (Header + Payload) für Codec-Erkennungs-Tests. */
export function makeAdtsAac(payloadLen = 200) {
  const frameLen = 7 + payloadLen;
  const b = Buffer.alloc(frameLen);
  b[0] = 0xFF; b[1] = 0xF1; // syncword 0xFFF, MPEG4, layer 00, protection absent
  b[2] = (1 << 6) | (4 << 2); // AAC-LC, 44100
  b[3] = (2 << 6) | ((frameLen >> 11) & 0x03);
  b[4] = (frameLen >> 3) & 0xFF;
  b[5] = ((frameLen & 0x07) << 5) | 0x1F; // buffer fullness high
  b[6] = 0xFC; // buffer fullness low + 0 raw blocks
  return b;
}

/** fMP4-artige Bytes (ftyp) für Container-Erkennungs-Tests. */
export function makeFmp4(len = 1024) {
  const b = Buffer.alloc(len);
  b.writeUInt32BE(0x18, 0);
  b.write('ftyp', 4, 'ascii');
  b.write('isom', 8, 'ascii');
  b.writeUInt32BE(0x200, 12);
  b.write('iso2', 16, 'ascii');
  b.writeUInt32BE(len - 24, 20);
  b.write('mdat', 24, 'ascii');
  return b;
}

export function makeMediaPlaylist(segCount, baseUrl, { encrypted = true } = {}) {
  let out = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n';
  for (let i = 0; i < segCount; i++) {
    if (encrypted) out += `#EXT-X-KEY:METHOD=AES-128,URI="${baseUrl}/key.pub"\n`;
    out += `#EXTINF:2.0,\nseg-${String(i).padStart(2, '0')}.ts\n`;
  }
  out += '#EXT-X-ENDLIST\n';
  return out;
}

export function makeMasterPlaylist(variantUrl) {
  return '#EXTM3U\n#EXT-X-VERSION:3\n' +
    `#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2"\n${variantUrl}\n`;
}

/** PKCS7-Padding + AES-128-CBC (createCipheriv autoPadding). */
export function aesEncrypt(plain, key, iv = Buffer.alloc(16)) {
  const c = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([c.update(plain), c.final()]);
}
