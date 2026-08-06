// ==UserScript==
// @name         VK Downloader
// @namespace    local.vk-downloader
// @version      1.0.8
// @description  Download-Button pro Track auf VK Audio-Seiten (vk.com/vk.ru); lädt den HLS-Stream und speichert MP3 lokal. Tampermonkey-kompatibel.
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

/* VK Downloader — gebaut aus src/. Quellen: src/main.js + src/shared/* */
(function (globalThis) {
'use strict';

/* ===== src/shared/vk-decoder.js ===== */
/* ============================================================================
 * VK Downloader — vk-decoder.js
 * Dekodiert VK-obfuskierte Audio-URLs vom Typ
 *   https://vk.com/audio_api_unavailable?extra=<b64>#<b64>
 * Kanonischer v/r/s/i/x-Algorithmus (öffentlich dokumentierter VK-Decoder,
 * abgeglichen mit GeoXTen/vk-downloader v2.5.2 und der verbreiteten
 * Community-Implementierung). Enthält zusätzlich einen Encoder (nur für
 * Tests, um Encoder/Decoder zyklisch zu verifizieren).
 *
 * Läuft als klassisches Script: hängt sich an globalThis.__VKD an
 * (funktioniert in Tampermonkey-Sandbox und Node.js).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});

  var ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN0PQRSTUVWXYZO123456789+/=';

  function b64Decode(str) {
    if (!str || str.length % 4 === 1) return false;
    var out = '', n = 0, i, pos = 0;
    /* Kanonische VK-Variante: pos wird nur im Ausgabe-Zweig erhöht.
       '='-Padding wird übersprungen (kein Bit-Anteil). */
    while (pos < str.length) {
      var ch = str.charAt(pos);
      if (ch === '=') { pos++; continue; }
      i = ALPHA.indexOf(ch);
      if (i === -1) break;
      n = pos % 4 ? 64 * n + i : i;
      if (pos++ % 4) out += String.fromCharCode(255 & (n >> ((-2 * pos) & 6)));
    }
    return out;
  }

  function b64Encode(str) {
    var out = '', i, b1, b2, b3, c1, c2, c3, c4;
    for (i = 0; i < str.length; i += 3) {
      b1 = str.charCodeAt(i);
      b2 = i + 1 < str.length ? str.charCodeAt(i + 1) : NaN;
      b3 = i + 2 < str.length ? str.charCodeAt(i + 2) : NaN;
      c1 = b1 >> 2;
      c2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
      c3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
      c4 = isNaN(b3) ? 64 : b3 & 63;
      out += ALPHA.charAt(c1) + ALPHA.charAt(c2);
      if (!isNaN(b2)) out += ALPHA.charAt(c3);
      if (!isNaN(b3)) out += ALPHA.charAt(c4);
    }
    return out; /* ungepolstert, wie VK */
  }

  /* Permutation mit Seed (identisch zum VK-Algorithmus) */
  function permute(len, seed) {
    var arr = [], s = len;
    seed = Math.abs(seed);
    while (s--) { seed = (len * (s + 1) ^ seed + s) % len; arr[s] = seed; }
    return arr;
  }

  /* --- Dekodier-Operationen (in der Reihenfolge, in der VK sie anwendet) --- */
  var urlOps = {
    /* Umkehren */
    v: function (t) { return t.split('').reverse().join(''); },
    /* Alphabet-Shift (zyklisch über ALPHA+ALPHA, Länge 130) */
    r: function (t, shift) {
      var chars = t.split(''), full = ALPHA + ALPHA, i, idx;
      shift = (+shift || 0) % full.length;
      for (i = chars.length; i--;) {
        idx = full.indexOf(chars[i]);
        if (~idx) chars[i] = full.charAt((idx - shift + full.length) % full.length);
      }
      return chars.join('');
    },
    /* Permutation */
    s: function (t, seed) {
      if (!t.length) return t;
      var perm = permute(t.length, seed), arr = t.split('');
      for (var a = 0; ++a < t.length;) arr[a] = arr.splice(perm[t.length - 1 - a], 1, arr[a])[0];
      return arr.join('');
    },
    /* Permutation mit Nutzer-ID-XOR */
    i: function (t, seed, userId) { return urlOps.s(t, seed ^ (userId | 0)); },
    /* XOR */
    x: function (t, c) {
      c = String(c).charCodeAt(0);
      return t.split('').map(function (ch) { return String.fromCharCode(ch.charCodeAt(0) ^ c); }).join('');
    }
  };

  /* --- Inverse Operationen (nur für den Test-Encoder) --- */
  var invS = function (t, seed) {
    if (!t.length) return t;
    var perm = permute(t.length, seed), arr = t.split('');
    for (var a = t.length - 1; a > 0; a--) arr[a] = arr.splice(perm[t.length - 1 - a], 1, arr[a])[0];
    return arr.join('');
  };
  var invR = function (t, shift) {
    var chars = t.split(''), full = ALPHA + ALPHA, i, idx;
    shift = (+shift || 0) % full.length;
    for (i = chars.length; i--;) {
      idx = full.indexOf(chars[i]);
      if (~idx) chars[i] = full.charAt((idx + shift) % full.length);
    }
    return chars.join('');
  };
  var inverseOps = {
    v: urlOps.v,
    r: invR,
    s: invS,
    i: function (t, seed, userId) { return invS(t, seed ^ (userId | 0)); },
    x: urlOps.x
  };

  /**
   * Dekodiert eine VK-URL.
   * @param {string} url  Obfuskierte oder normale URL
   * @param {number} userId  VK-Nutzer-ID (für die i-Operation)
   * @returns {string}  Dekodierte URL oder die Eingabe unverändert
   */
  function decodeUrl(url, userId) {
    if (typeof url !== 'string' || url.indexOf('audio_api_unavailable') === -1) return url;
    var parts = url.split('?extra=');
    if (parts.length < 2) return url;
    var segments = parts[1].split('#');
    var data = segments[0] ? b64Decode(segments[0]) : '';
    var opsStr = segments[1] ? b64Decode(segments[1]) : '';
    if (typeof opsStr !== 'string' || !data) return url;
    var ops = opsStr ? opsStr.split('\t') : [];
    for (var i = ops.length; i--;) {
      var op = ops[i].split('\v');
      var fn = op[0];
      var rest = op.slice(1);
      if (!urlOps[fn]) return url;
      var args = [data].concat(rest);
      data = urlOps[fn].apply(null, args.concat(userId | 0));
    }
    return (data && data.indexOf('http') === 0) ? data : url;
  }

  /**
   * Test-Encoder: erzeugt aus einer Klartext-URL eine obfuskierte
   * audio_api_unavailable-URL, die decodeUrl() wieder zurückdekodiert.
   * @param {string} plain
   * @param {number} userId
   * @param {Array<Array<string|number>>} ops  Standard: [['v'],['r','5'],['i','3'],['x','W']]
   */
  function encodeUrl(plain, userId, ops) {
    ops = ops || [['v'], ['r', '5'], ['i', '3'], ['x', 'W']];
    var data = plain, i, name, args;
    /* Der Decoder iteriert rückwärts (i = N-1 → 0); die Inversen müssen daher
       VORWÄRTS angewendet werden, damit op[0] innerst/zuletzt greift. */
    for (i = 0; i < ops.length; i++) {
      name = ops[i][0];
      args = ops[i].slice(1);
      if (!inverseOps[name]) throw new Error('encodeUrl: unbekannte Operation ' + name);
      data = inverseOps[name].apply(null, [data].concat(args, [userId | 0]));
    }
    var opsStr = ops.map(function (op) { return op.join('\v'); }).join('\t');
    return 'https://vk.com/audio_api_unavailable?extra=' + b64Encode(data) + '#' + b64Encode(opsStr);
  }

  NS.decoder = {
    ALPHA: ALPHA,
    b64Decode: b64Decode,
    b64Encode: b64Encode,
    permute: permute,
    urlOps: urlOps,
    decodeUrl: decodeUrl,
    encodeUrl: encodeUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/m3u8.js ===== */
/* ============================================================================
 * VK Downloader — m3u8.js
 * HLS-Playlist-Parser (Master + Media), Varianten-Auswahl, URL-Auflösung
 * relativer Segment-URIs und per-Segment-Key-Status (AES-128 EXT-X-KEY).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});
  var m3u8 = {};

  function parseAttrs(str) {
    var out = {}, re, m;
    re = /([A-Z0-9-]+)="([^"]*)"/g;
    while ((m = re.exec(str)) !== null) out[m[1]] = m[2];
    re = /([A-Z0-9-]+)=([A-Za-z0-9_.\-]+)/g;
    while ((m = re.exec(str)) !== null) out[m[1]] = m[2];
    return out;
  }

  /**
   * @param {string} text Playlist-Inhalt
   * @returns {{type:'master'|'media', variants:Array, segments:Array,
   *            encrypted:boolean, mediaSequence:number}}
   */
  m3u8.parsePlaylist = function (text) {
    var variants = [], segments = [], encrypted = false, type = 'media', mediaSequence = 0;
    var curKey = { method: null, uri: null };
    var cur = null, i, line;
    var lines = String(text || '').split(/\r?\n/);
    for (i = 0; i < lines.length; i++) {
      line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf('#EXT-X-KEY') === 0) {
        var ka = parseAttrs(line.slice('#EXT-X-KEY'.length));
        curKey = { method: ka.METHOD || null, uri: ka.URI || null };
        if (curKey.method === 'AES-128') encrypted = true;
        continue;
      }
      if (line.indexOf('#EXT-X-MEDIA-SEQUENCE') === 0) {
        mediaSequence = parseInt(line.slice('#EXT-X-MEDIA-SEQUENCE'.length), 10) || 0;
        continue;
      }
      if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
        type = 'master';
        var attrs = parseAttrs(line.slice('#EXT-X-STREAM-INF'.length));
        cur = {
          bandwidth: +(attrs.BANDWIDTH || 0),
          codecs: attrs.CODECS || '',
          resolution: attrs.RESOLUTION || '',
          uri: null
        };
        variants.push(cur);
        continue;
      }
      if (line.indexOf('#EXTINF') === 0) {
        var dur = parseFloat((line.indexOf('#EXTINF:') === 0 ? line.slice(8) : '').split(',')[0]) || 0;
        cur = {
          duration: dur,
          uri: null,
          encrypted: curKey.method === 'AES-128',
          keyUri: curKey.uri || null
        };
        segments.push(cur);
        continue;
      }
      if (line.charAt(0) === '#') continue;
      if (cur) cur.uri = line;
      else segments.push({ duration: 0, uri: line, encrypted: curKey.method === 'AES-128', keyUri: curKey.uri || null });
    }
    return { type: type, variants: variants, segments: segments, encrypted: encrypted, mediaSequence: mediaSequence };
  };

  /** Beste Variante: höchste Bandbreite (maximale Bitrate), unabhängig vom Codec. */
  m3u8.pickVariant = function (variants) {
    if (!variants || !variants.length) return null;
    return variants.slice().sort(function (a, b) { return (+b.bandwidth || 0) - (+a.bandwidth || 0); })[0];
  };

  m3u8.resolveUri = function (playlistUrl, uri) {
    if (/^https?:\/\//i.test(uri)) return uri;
    try { return new URL(uri, playlistUrl).href; } catch (e) { /* fallback */ }
    return playlistUrl.replace(/[^/]*$/, '') + uri;
  };

  /** Segment-URLs + Key-Info; IV = Media-Sequence + Index (Big-Endian, 16 Byte). */
  m3u8.segmentUrls = function (playlistUrl, segments, mediaSequence) {
    mediaSequence = mediaSequence || 0;
    return (segments || []).map(function (s, idx) {
      return {
        uri: s.uri,
        url: m3u8.resolveUri(playlistUrl, s.uri),
        duration: s.duration || 0,
        encrypted: !!s.encrypted,
        keyUri: s.keyUri ? m3u8.resolveUri(playlistUrl, s.keyUri) : null,
        sequence: mediaSequence + idx
      };
    });
  };

  NS.m3u8 = m3u8;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/ts-demux.js ===== */
/* ============================================================================
 * VK Downloader — ts-demux.js
 * Minimaler MPEG-TS-Demuxer: PAT → PMT → Audio-PID → PES-Payloads
 * → Elementary Stream (MP3-ES oder AAC-ADTS-ES).
 *
 * Unterstützt MPEG-TS-Pakete (188 Byte), Adaption Fields, PES über
 * Paketgrenzen hinweg sowie PAT/PMT-Wechsel innerhalb des Streams.
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});
  var TS_PKT = 188;
  var tsDemux = {};

  /** Grobe TS-Erkennung: 0x47-Sync an Position 0 und 188. */
  tsDemux.isTs = function (bytes) {
    if (!bytes || bytes.length < TS_PKT) return false;
    if (bytes[0] !== 0x47) return false;
    return bytes.length >= TS_PKT * 2 ? bytes[TS_PKT] === 0x47 : true;
  };

  function readPid(bytes, off) { return (((bytes[off] & 0x1F) << 8) | bytes[off + 1]); }

  function parsePatEntries(bytes, start, end) {
    /* PSI-Sektion: pointer_field(1) + table_id(1) + section_length(2) + tsid(2)
       + version(1) + section_number(1) + last_section_number(1) → Einträge */
    var pos = start;
    var ptr = bytes[pos]; pos += 1;
    if (pos + 8 > end) return [];
    var sectionLength = ((bytes[pos + 1] & 0x0F) << 8) | bytes[pos + 2];
    var entryStart = pos + 8;
    /* Section-Ende minus 4 CRC-Bytes */
    var entryEnd = Math.min(start + 1 + 3 + sectionLength - 4, end - 4);
    if (entryStart > entryEnd) return [];
    var out = [], i;
    for (i = entryStart; i + 4 <= entryEnd; i += 4) {
      out.push({ program: (bytes[i] << 8) | bytes[i + 1], pid: readPid(bytes, i + 2) });
    }
    return out;
  }

  function parsePmtEntries(bytes, start, end) {
    /* pointer_field(1) + table_id(1) + section_length(2) + program_number(2)
       + version(1) + section_number(1) + last_section_number(1)
       + PCR_PID(2) + program_info_length(2) → Streams */
    var pos = start;
    var ptr = bytes[pos]; pos += 1;
    if (pos + 12 > end) return [];
    var sectionLength = ((bytes[pos + 1] & 0x0F) << 8) | bytes[pos + 2];
    var progInfoLen = ((bytes[pos + 10] & 0x0F) << 8) | bytes[pos + 11];
    var streamStart = pos + 12 + progInfoLen;
    /* Section-Ende minus 4 CRC-Bytes */
    var streamEnd = Math.min(start + 1 + 3 + sectionLength - 4, end - 4);
    var out = [], i;
    for (i = streamStart; i + 5 <= streamEnd; ) {
      var streamType = bytes[i];
      var pid = readPid(bytes, i + 1);
      var esLen = ((bytes[i + 3] & 0x0F) << 8) | bytes[i + 4];
      out.push({ streamType: streamType, pid: pid });
      i += 5 + esLen;
    }
    return out;
  }

  /**
   * Demuxt MPEG-TS in den Elementary Stream der ersten Audio-PID.
   * @param {Uint8Array} bytes
   * @returns {{es: Uint8Array, streamType: number|null, pid: number|null, packets: number}}
   */
  tsDemux.demuxTs = function (bytes) {
    var pmtPids = [], audioPid = -1, streamType = null;
    var chunks = [], total = 0, packets = 0;
    var inPes = false, pesDataStart = 0, pesDataLen = -1, pesConsumed = 0;

    for (var off = 0; off + TS_PKT <= bytes.length; off += TS_PKT) {
      if (bytes[off] !== 0x47) continue;
      packets++;
      var b1 = bytes[off + 1], b3 = bytes[off + 3];
      var pid = ((b1 & 0x1F) << 8) | bytes[off + 2];
      var pusi = (b1 & 0x40) !== 0;
      var afc = (b3 >> 4) & 0x03;
      var payloadStart = -1, payloadLen = 0;
      if (afc === 1 || afc === 3) {
        var p = off + 4;
        if (afc === 3) {
          if (bytes[p] === undefined) continue;
          p += 1 + bytes[p]; /* Adaption Field überspringen */
        }
        if (p < off + TS_PKT) { payloadStart = p; payloadLen = off + TS_PKT - p; }
      }
      if (payloadStart < 0) continue;

      /* PAT: PID 0 */
      if (pid === 0 && pusi) {
        var pats = parsePatEntries(bytes, payloadStart, payloadStart + payloadLen);
        for (var a = 0; a < pats.length; a++) {
          if (pats[a].program !== 0 && pmtPids.indexOf(pats[a].pid) === -1) pmtPids.push(pats[a].pid);
        }
        continue;
      }
      /* PMT: eine der gefundenen PMT-PIDs */
      if (pmtPids.length && pmtPids.indexOf(pid) !== -1 && pusi) {
        var pmts = parsePmtEntries(bytes, payloadStart, payloadStart + payloadLen);
        for (var b = 0; b < pmts.length; b++) {
          var st = pmts[b].streamType;
          /* Audio-Streams: 0x03 MP3, 0x0F ADTS-AAC, 0x11 LATM-AAC, 0x04/0x81-MP2-Ähnliche ignorieren */
          if (st === 0x03 || st === 0x0F || st === 0x11) {
            audioPid = pmts[b].pid; streamType = st; break;
          }
        }
        continue;
      }
      /* Audio-PES */
      if (audioPid >= 0 && pid === audioPid) {
        if (pusi) {
          /* Neues PES: 00 00 01 <stream_id> <len_hi> <len_lo> <flags> <flags2> <hdr_len> */
          var p2 = payloadStart;
          if (bytes[p2] === 0x00 && bytes[p2 + 1] === 0x00 && bytes[p2 + 2] === 0x01) {
            var streamId = bytes[p2 + 3];
            if (streamId >= 0xC0 && streamId <= 0xDF) { /* MPEG-Audio-PES */
              var pesLen = (bytes[p2 + 4] << 8) | bytes[p2 + 5];
              var hdrLen = bytes[p2 + 8] !== undefined ? bytes[p2 + 8] : 0;
              var dataStart = p2 + 9 + hdrLen;
              var avail = payloadStart + payloadLen - dataStart;
              if (pesLen > 0) {
                pesDataLen = pesLen - 3 - hdrLen; /* nach PES_packet_length */
                inPes = true;
              } else {
                pesDataLen = -1; /* unbegrenzt */
                inPes = true;
              }
              pesConsumed = 0;
              if (dataStart >= payloadStart && dataStart <= payloadStart + payloadLen && avail > 0) {
                var take = pesDataLen >= 0 ? Math.min(avail, pesDataLen) : avail;
                chunks.push(bytes.subarray(dataStart, dataStart + take));
                total += take;
                pesConsumed += take;
              }
            } else {
              inPes = false;
            }
          } else {
            inPes = false;
          }
        } else if (inPes) {
          var take2 = payloadLen;
          if (pesDataLen >= 0) take2 = Math.min(payloadLen, pesDataLen - pesConsumed);
          if (take2 > 0) {
            chunks.push(bytes.subarray(payloadStart, payloadStart + take2));
            total += take2;
            pesConsumed += take2;
          }
        }
      }
    }

    var es = new Uint8Array(total);
    var off2 = 0;
    for (var c = 0; c < chunks.length; c++) { es.set(chunks[c], off2); off2 += chunks[c].length; }
    return { es: es, streamType: audioPid >= 0 ? streamType : null, pid: audioPid >= 0 ? audioPid : null, packets: packets };
  };

  NS.tsDemux = tsDemux;
  /* Debug-/Test-Helfer */
  NS.tsDemux.parsePatEntries = parsePatEntries;
  NS.tsDemux.parsePmtEntries = parsePmtEntries;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/assemble.js ===== */
/* ============================================================================
 * VK Downloader — assemble.js
 * Codec-/Container-Erkennung und Zusammenführung von HLS-Segmenten:
 *   - raw MP3-ES            → Konkatenation = echtes MP3
 *   - MPEG-TS (MP3 oder AAC) → TS-Demux → Elementary Stream
 *   - ADTS-AAC / fMP4       → nicht ohne Transcode als MP3 speicherbar
 *                               → nativer Container (.aac/.m4a)
 * Zusätzlich: Dateinamen-Sanitizer und MP3-Analyse (für Tests/Info).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});
  var assemble = {};

  var BITRATE_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  var BITRATE_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  var SAMPLE_RATES = [44100, 48000, 32000];

  /** MPEG-Audio-Frame-Sync (0xFF Ex) mit gültigen Version/Layer-Bits. */
  function isMp3Header(b0, b1) {
    if (b0 !== 0xFF || (b1 & 0xE0) !== 0xE0) return false;
    var ver = (b1 >> 3) & 0x03;
    var layer = (b1 >> 1) & 0x03;
    return ver !== 1 && layer !== 0;
  }

  /** ADTS-AAC-Sync (0xFF Fx mit layer==00). */
  function isAdtsHeader(b0, b1) {
    if (b0 !== 0xFF || (b1 & 0xF0) !== 0xF0) return false;
    return ((b1 >> 1) & 0x03) === 0;
  }

  /**
   * Klassifiziert einen Elementary Stream oder Roh-Bytes.
   * @param {Uint8Array} bytes
   * @returns {{codec:'mp3'|'aac-adts'|'unknown', needsTranscode:boolean, ext:string}}
   */
  function classifyEs(bytes) {
    var limit = Math.min(bytes.length - 1, 65536);
    for (var i = 0; i < limit; i++) {
      if (bytes[i] !== 0xFF) continue;
      if (isMp3Header(bytes[i], bytes[i + 1])) return { codec: 'mp3', needsTranscode: false, ext: '.mp3' };
      if (isAdtsHeader(bytes[i], bytes[i + 1])) return { codec: 'aac-adts', needsTranscode: true, ext: '.aac' };
    }
    return { codec: 'unknown', needsTranscode: true, ext: '.bin' };
  }

  /**
   * Klassifiziert Segment-Bytes (Container + Codec).
   * @param {Uint8Array} bytes
   * @returns {{container:'raw'|'ts'|'fmp4'|'unknown', codec:string, needsTranscode:boolean,
   *            ext:string, es?:Uint8Array, streamType?:number}}
   */
  function classify(bytes) {
    if (!bytes || bytes.length < 8) return { container: 'unknown', codec: 'unknown', needsTranscode: true, ext: '.bin' };
    /* fMP4: 'ftyp' an Offset 4 */
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return { container: 'fmp4', codec: 'aac', needsTranscode: true, ext: '.m4a' };
    }
    /* MPEG-TS */
    if (NS.tsDemux && NS.tsDemux.isTs(bytes)) {
      var d = NS.tsDemux.demuxTs(bytes);
      if (d && d.es && d.es.length) {
        var c = classifyEs(d.es);
        return { container: 'ts', codec: c.codec, needsTranscode: c.needsTranscode, ext: c.ext, es: d.es, streamType: d.streamType };
      }
      return { container: 'ts', codec: 'unknown', needsTranscode: true, ext: '.ts' };
    }
    /* Roh-ES */
    var ce = classifyEs(bytes);
    return { container: 'raw', codec: ce.codec, needsTranscode: ce.needsTranscode, ext: ce.ext, es: bytes };
  }

  /**
   * Führt Segmente zusammen.
   * @param {Array<Uint8Array>} segments
   * @param {object} firstClass Ergebnis von classify(segments[0]) (optional)
   * @returns {{bytes:Uint8Array, codec:string, needsTranscode:boolean, ext:string}}
   */
  function concatSegments(segments, firstClass) {
    if (!segments || !segments.length) return { bytes: new Uint8Array(0), codec: 'unknown', needsTranscode: true, ext: '.bin' };
    var total = 0, i;
    for (i = 0; i < segments.length; i++) total += segments[i].length;
    var all = new Uint8Array(total);
    var off = 0;
    for (i = 0; i < segments.length; i++) { all.set(segments[i], off); off += segments[i].length; }
    var cls = firstClass || classify(all);
    if (cls.container === 'ts') {
      var d = NS.tsDemux ? NS.tsDemux.demuxTs(all) : null;
      if (d && d.es && d.es.length) {
        var c2 = classifyEs(d.es);
        return { bytes: d.es, codec: c2.codec, needsTranscode: c2.needsTranscode, ext: c2.ext };
      }
    }
    if (cls.container === 'raw') {
      var c3 = classifyEs(all);
      return { bytes: all, codec: c3.codec, needsTranscode: c3.needsTranscode, ext: c3.ext };
    }
    return { bytes: all, codec: cls.codec, needsTranscode: true, ext: cls.ext };
  }

  /**
   * Analysiert MP3-Struktur (für Tests und Tooltip-Info).
   * @returns {{frames:number, bitrate:number|null, sampleRate:number|null,
   *            channels:number|null, valid:boolean, bytes:number}}
   */
  function analyzeMp3(bytes) {
    var frames = 0, bitrate = null, sampleRate = null, channels = null;
    var i = 0, len = bytes.length;
    while (i + 4 <= len) {
      if (!isMp3Header(bytes[i], bytes[i + 1])) { i++; continue; }
      var b2 = bytes[i + 2], b3 = bytes[i + 3];
      var ver = (bytes[i + 1] >> 3) & 0x03;      /* 3=MPEG1, 2=MPEG2, 0=MPEG2.5 */
      var brIdx = (b2 >> 4) & 0x0F;
      var srIdx = (b2 >> 2) & 0x03;
      var pad = (b2 >> 1) & 0x01;
      var chan = (b3 >> 6) & 0x03;
      if (brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
      var br = ver === 3 ? BITRATE_MPEG1_L3[brIdx] : BITRATE_MPEG2_L3[brIdx];
      var sr = SAMPLE_RATES[srIdx] / (ver === 3 ? 1 : ver === 2 ? 2 : 4);
      var frameLen = Math.floor((ver === 3 ? 144 : 72) * br * 1000 / sr) + pad;
      if (frameLen < 24 || i + frameLen > len) break;
      frames++;
      if (bitrate === null) bitrate = br;
      if (sampleRate === null) sampleRate = sr;
      if (channels === null) channels = chan === 3 ? 1 : 2;
      i += frameLen;
    }
    var coverage = frames > 0 ? (i / len) : 0;
    return {
      frames: frames,
      bitrate: bitrate,
      sampleRate: sampleRate,
      channels: channels,
      valid: frames > 0 && coverage > 0.5,
      bytes: len,
      frameCoverage: coverage
    };
  }

  /**
   * Bereinigt einen Dateinamen (ohne Endung).
   * @returns {string}
   */
  function sanitizeName(raw, fallback) {
    var s = String(raw == null ? '' : raw);
    /* HTML-Entities ohne DOM dekodieren (läuft auch in Node) */
    s = s.replace(/&#([0-9]{1,6});/g, function (_, n) { return String.fromCharCode(+n); })
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
    s = s.replace(/[\/\\:*?"<>|~]+/g, ' ')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/[_\s]+/g, ' ')
      .replace(/\.+$/g, '')
      .trim();
    return (s || fallback || 'vk-track').slice(0, 140);
  }

  /** Hängt eine Endung an (Base enthält keine Endung). */
  function withExt(base, ext) {
    return base + (ext || '');
  }

  NS.assemble = {
    classify: classify,
    classifyEs: classifyEs,
    concatSegments: concatSegments,
    analyzeMp3: analyzeMp3,
    sanitizeName: sanitizeName,
    withExt: withExt
  };
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/aes.js ===== */
/* ============================================================================
 * VK Downloader — aes.js
 * AES-128-CBC-Entschlüsselung für HLS EXT-X-KEY (WebCrypto / Node-crypto).
 * IV = 16-Byte-Big-Endian der Segment-Sequenznummer (HLS-Standard,
 * falls kein EXT-X-KEY IV-Attribut gesetzt ist).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});
  var aes = {};

  function subtle() {
    try { if (g.crypto && g.crypto.subtle) return g.crypto.subtle; } catch (e) {}
    try { if (g.self && g.self.crypto && g.self.crypto.subtle) return g.self.crypto.subtle; } catch (e) {}
    return null;
  }

  /**
   * Entschlüsselt AES-128-CBC (PKCS7).
   * @param {Uint8Array} cipher
   * @param {Uint8Array} keyBytes  16 Bytes
   * @param {Uint8Array} ivBytes   16 Bytes
   * @returns {Promise<Uint8Array>}
   */
  aes.decryptAes128Cbc = function (cipher, keyBytes, ivBytes) {
    return Promise.resolve().then(function () {
      var st = subtle();
      if (!st) return Promise.reject(new Error('crypto.subtle nicht verfügbar'));
      return st.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt'])
        .then(function (key) { return st.decrypt({ name: 'AES-CBC', iv: ivBytes }, key, cipher); })
        .then(function (pt) { return new Uint8Array(pt); });
    });
  };

  /** IV aus Sequenznummer (Big-Endian, 16 Byte). */
  aes.makeIv = function (seq) {
    var iv = new Uint8Array(16);
    var s = seq >>> 0;
    iv[12] = (s >>> 24) & 0xFF;
    iv[13] = (s >>> 16) & 0xFF;
    iv[14] = (s >>> 8) & 0xFF;
    iv[15] = s & 0xFF;
    return iv;
  };

  NS.aes = aes;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/gm-net.js ===== */
/* ============================================================================
 * VK Downloader — gm-net.js
 * Einheitlicher Netzwerk-Wrapper: GM_xmlhttpRequest (Tampermonkey) mit
 * fetch-Fallback (für Tests/Entwicklung ohne TM). Außerdem Normalisierung
 * der GM-API-Objekte (GM-Objekt vs. GM_*-Globals).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});

  /* --- GM-API normalisieren --- */
  var gm = (function () {
    var gmod = null;
    try { if (typeof GM !== 'undefined') gmod = GM; } catch (e) {}
    try { if (!gmod && g.GM) gmod = g.GM; } catch (e) {}
    function pick(objFn, globalFn) {
      try { if (gmod && gmod[objFn]) return gmod[objFn].bind(gmod); } catch (e) {}
      try { if (typeof globalFn !== 'undefined' && g[globalFn]) return g[globalFn]; } catch (e) {}
      try { if (typeof globalFn !== 'undefined' && typeof window !== 'undefined' && window[globalFn]) return window[globalFn]; } catch (e) {}
      return null;
    }
    return {
      xmlhttpRequest: pick('xmlhttpRequest', 'GM_xmlhttpRequest'),
      download: pick('download', 'GM_download'),
      getValue: pick('getValue', 'GM_getValue'),
      setValue: pick('setValue', 'GM_setValue'),
      registerMenuCommand: pick('registerMenuCommand', 'GM_registerMenuCommand'),
      addStyle: pick('addStyle', 'GM_addStyle')
    };
  })();
  NS.gm = gm;

  var net = {};
  net.hasGM = !!gm.xmlhttpRequest;

  /**
   * Einheitlicher Request.
   * @param {object} opts {method,url,headers,data,responseType,timeout}
   * @returns {Promise<{status:number,responseText:string|null,response:*,finalUrl:string}>}
   */
  function request(opts) {
    return new Promise(function (resolve, reject) {
      var method = opts.method || 'GET';
      var url = opts.url;
      var timeout = opts.timeout || 30000;
      var headers = opts.headers || {};
      var data = opts.data;
      var responseType = opts.responseType || 'text'; /* text | arraybuffer */

      if (!url) { reject(new Error('Keine URL')); return; }

      var fetchAttempted = false;
      function viaFetch() {
        fetchAttempted = true;
        if (typeof fetch !== 'function') { reject(new Error('Netzwerkfehler für ' + url)); return; }
        var init = { method: method, headers: headers, credentials: 'include' };
        if (data != null) init.body = data;
        var p = responseType === 'arraybuffer' ? fetch(url, init).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' für ' + url);
          return r.arrayBuffer();
        }).then(function (ab) { return { status: 200, responseText: null, response: ab, finalUrl: url }; })
          : fetch(url, init).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' für ' + url);
            return r.text();
          }).then(function (t) { return { status: 200, responseText: t, response: t, finalUrl: url }; });
        p.then(resolve, reject);
      }

      if (gm.xmlhttpRequest) {
        var payload = {
          method: method,
          url: url,
          headers: headers,
          timeout: timeout,
          responseType: responseType,
          onload: function (r) {
            var res = { status: r.status, responseText: r.responseText, response: r.response, finalUrl: r.finalUrl || url };
            if (r.status >= 200 && r.status < 300) resolve(res);
            else {
              var err = new Error('HTTP ' + r.status + ' für ' + url);
              err.httpStatus = r.status;
              err.response = res;
              reject(err);
            }
          },
          onerror: function () {
            /* Fallback: Page-fetch (VK-CDN erlaubt CORS). Hilft, wenn TM
               GM_xmlhttpRequest blockiert (z. B. @connect-/Redirect-Problem). */
            if (!fetchAttempted && typeof fetch === 'function') viaFetch();
            else reject(new Error('Netzwerkfehler für ' + url));
          },
          ontimeout: function () {
            if (!fetchAttempted && typeof fetch === 'function') viaFetch();
            else reject(new Error('Timeout für ' + url));
          }
        };
        if (data != null) payload.data = data;
        if (opts.anonymous !== undefined) payload.anonymous = opts.anonymous;
        gm.xmlhttpRequest(payload);
        return;
      }

      viaFetch();
    });
  }
  net.request = request;

  net.getText = function (url, opts) {
    return request(Object.assign({ url: url, responseType: 'text' }, opts || {})).then(function (r) { return r.responseText; });
  };

  net.getBytes = function (url, opts) {
    return request(Object.assign({ url: url, responseType: 'arraybuffer' }, opts || {})).then(function (r) {
      if (r.response instanceof ArrayBuffer) return new Uint8Array(r.response);
      if (r.response && r.response.byteLength !== undefined) return new Uint8Array(r.response);
      if (typeof r.response === 'string') return new TextEncoder().encode(r.response);
      throw new Error('Unerwarteter responseType für ' + url);
    });
  };

  net.postForm = function (url, body, opts) {
    return request(Object.assign({
      url: url,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      data: body,
      responseType: 'text'
    }, opts || {}));
  };

  NS.net = net;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/shared/settings.js ===== */
/* ============================================================================
 * VK Downloader — settings.js
 * Einstellungen via GM_setValue/GM_getValue (nur lokal im Browser).
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});

  var DEFAULTS = {
    token: '',           /* optionaler VK-Audio-Token (vkaudiotoken-python / al_audio.php) */
    userAgent: '',       /* zum Token gehörender User-Agent */
    bitrate: 320,        /* MP3-Bitrate bei Transkodierung (falls je nötig) */
    transcode: false,    /* AAC→MP3 experimentell (ffmpeg.wasm) */
    ffmpegCoreUrl: '',   /* URL zur ffmpeg-core.js (leer = deaktiviert) */
    concurrency: 3       /* parallele Segment-Downloads */
  };

  function load() {
    var s = {};
    try {
      if (NS.gm && NS.gm.getValue) {
        var v = NS.gm.getValue('vkd_settings', {});
        if (v && typeof v === 'object') s = v;
      }
    } catch (e) { /* ignorieren */ }
    var out = {};
    var k;
    for (k in DEFAULTS) out[k] = DEFAULTS[k];
    for (k in s) if (s[k] !== undefined) out[k] = s[k];
    return out;
  }

  function save(s) {
    try {
      if (NS.gm && NS.gm.setValue) NS.gm.setValue('vkd_settings', Object.assign({}, s));
    } catch (e) { /* ignorieren */ }
  }

  NS.settings = { DEFAULTS: DEFAULTS, load: load, save: save };
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== src/main.js ===== */
/* ============================================================================
 * VK Downloader — main.js
 * Userscript-Hauptlogik:
 *  1. Download-Button pro Track in [data-testid^="MusicTrack…"]-Zeilen
 *  2. Track-Daten aus React-Fiber (apiAudio) bzw. /audio-Links
 *  3. URL-Auflösung: apiAudio.url → Decoder; Fallback al_audio.php?act=reload_audios
 *  4. Download-Pipeline: m3u8 → Segmente (AES-128-Entschlüsselung) →
 *     Konkatenation → TS-Demux → echtes MP3 → GM_download
 *  5. Optionaler Token-Modus (api.vk.com audio.getById) als Fallback
 * ========================================================================== */
(function (g) {
  'use strict';
  var NS = (g.__VKD = g.__VKD || {});
  if (NS.mainStarted) return;
  NS.mainStarted = true;

  var doc = g.document;
  var decoder = NS.decoder, m3u8 = NS.m3u8, assemble = NS.assemble, aes = NS.aes, net = NS.net, settings = NS.settings;

  var userId = 0;
  var SETTINGS = settings.load();
  var STYLES = '' +
    '.vkd-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;' +
    'width:28px!important;height:28px!important;border-radius:50%!important;cursor:pointer!important;' +
    'flex-shrink:0!important;color:var(--vkui--color_icon_secondary,rgba(0,0,0,.45))!important;' +
    'transition:background .15s,color .15s!important;text-decoration:none!important;margin-left:2px!important;' +
    'position:relative!important;z-index:1000!important;vertical-align:middle!important;' +
    'background:transparent!important;pointer-events:auto!important;border:none!important;padding:0!important;}' +
    '.vkd-btn.vkd-err{color:#e53935!important;}' +
    '.vkd-btn.vkd-err:hover{background:rgba(229,57,53,.12)!important;color:#e53935!important;}' +
    '.vkd-btn:hover{background:rgba(0,123,255,.15)!important;color:#007bff!important;}' +
    '.vkd-btn .vkd-ico{width:16px;height:16px;display:block;}' +
    '.vkd-tip{display:none!important;position:fixed!important;padding:4px 10px!important;' +
    'background:#1a1a2e!important;color:#e0e0e0!important;font:600 11px/1.4 system-ui,sans-serif!important;' +
    'border-radius:20px!important;white-space:nowrap!important;pointer-events:none!important;z-index:2147483647!important;' +
    'box-shadow:0 2px 8px rgba(0,0,0,.25)!important;transform:translate(-50%,-100%);}' +
    '.vkd-btn:hover .vkd-tip{display:block!important;}' +
    '.vkd-modal{position:fixed!important;inset:0!important;background:rgba(0,0,0,.45)!important;z-index:2147483646!important;display:flex!important;align-items:center!important;justify-content:center!important;}' +
    '.vkd-modal-box{background:var(--vkui--color_background_content,#fff)!important;color:var(--vkui--color_text_primary,#000)!important;' +
    'border-radius:12px!important;padding:20px!important;width:min(420px,92vw)!important;font:14px/1.5 system-ui,sans-serif!important;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.35)!important;max-height:86vh!important;overflow:auto!important;}' +
    '.vkd-modal-box h3{margin:0 0 12px!important;font-size:16px!important;}' +
    '.vkd-modal-box label{display:block!important;margin:8px 0!important;font-size:13px!important;}' +
    '.vkd-modal-box input[type=text],.vkd-modal-box select{width:100%!important;box-sizing:border-box!important;margin-top:4px!important;' +
    'padding:6px 8px!important;border:1px solid var(--vkui--color_separator_primary,rgba(0,0,0,.15))!important;border-radius:8px!important;background:var(--vkui--color_field_background,#f5f6f8)!important;color:inherit!important;font:13px/1.4 system-ui!important;}' +
    '.vkd-modal-btns{margin-top:14px!important;display:flex!important;gap:8px!important;justify-content:flex-end!important;}' +
    '.vkd-modal-btns button{padding:7px 14px!important;border:0!important;border-radius:8px!important;cursor:pointer!important;font:600 13px system-ui!important;background:var(--vkui--color_background_accent,#0077ff)!important;color:#fff!important;}' +
    '.vkd-modal-btns button[data-act=cancel]{background:var(--vkui--color_background_secondary,rgba(0,0,0,.08))!important;color:inherit!important;}' +
    '.vkd-hint{font-size:11px!important;color:var(--vkui--color_text_secondary,#828a99)!important;margin-top:6px!important;}';

  /* ---------- Einstellungen (Tampermonkey-Menü) ---------- */
  if (NS.gm && NS.gm.registerMenuCommand) {
    try { NS.gm.registerMenuCommand('⚙ VK Downloader: Einstellungen', openSettingsModal); } catch (e) {}
  }

  function openSettingsModal() {
    var s = settings.load();
    var overlay = doc.createElement('div');
    overlay.className = 'vkd-modal';
    overlay.innerHTML = '<div class="vkd-modal-box">' +
      '<h3>VK Downloader — Einstellungen</h3>' +
      '<label>Token (optional, für api.vk.com-Fallback)<br>' +
      '<input data-k="token" type="text" spellcheck="false" placeholder="aus scripts/get_token.py"></label>' +
      '<label>User-Agent (zum Token gehörig, optional)<br>' +
      '<input data-k="userAgent" type="text" spellcheck="false" placeholder="z. B. Kate Mobile/…"></label>' +
      '<label>Bitrate bei Transkodierung <select data-k="bitrate">' +
      '<option value="128">128 kbps</option><option value="192">192 kbps</option>' +
      '<option value="256">256 kbps</option><option value="320">320 kbps</option></select></label>' +
      '<label><input data-k="transcode" type="checkbox" style="width:auto!important"> AAC→MP3 transkodieren (experimentell)</label>' +
      '<label>ffmpeg-core-URL (leer = deaktiviert)<br>' +
      '<input data-k="ffmpegCoreUrl" type="text" spellcheck="false" placeholder="https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/umd/ffmpeg-core.js"></label>' +
      '<div class="vkd-hint">Session-Modus (eingeloggt in VK) benötigt keinen Token. Token nur für den api.vk.com-Fallback.</div>' +
      '<div class="vkd-modal-btns"><button data-act="save">Speichern</button> <button data-act="cancel">Schließen</button></div>' +
      '</div>';
    var val = function (k) { var el = overlay.querySelector('[data-k="' + k + '"]'); return el ? el.value : ''; };
    overlay.querySelector('[data-k="token"]').value = s.token || '';
    overlay.querySelector('[data-k="userAgent"]').value = s.userAgent || '';
    overlay.querySelector('[data-k="bitrate"]').value = String(s.bitrate || 320);
    overlay.querySelector('[data-k="transcode"]').checked = !!s.transcode;
    overlay.querySelector('[data-k="ffmpegCoreUrl"]').value = s.ffmpegCoreUrl || '';
    function close() { overlay.remove(); }
    overlay.querySelector('[data-act="save"]').addEventListener('click', function () {
      s.token = val('token').trim();
      s.userAgent = val('userAgent').trim();
      s.bitrate = +val('bitrate') || 320;
      s.transcode = overlay.querySelector('[data-k="transcode"]').checked;
      s.ffmpegCoreUrl = val('ffmpegCoreUrl').trim();
      settings.save(s);
      SETTINGS = s;
      close();
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    doc.body.appendChild(overlay);
  }

  /* ---------- DOM-Scan / Button-Injektion ---------- */
  function rowTestIdRe() { return /^(AudioLayer_PlaybackQueue_)?(MusicTrack|PodcastEpisodes?)(Cell|Row|Item)$/; }

  /** Scannt den Knoten bzw. — falls er in einer Track-Row liegt — die Row. */
  function scanContainer(root) {
    if (!root || root.nodeType !== 1) return;
    var row = null;
    try { row = root.closest ? root.closest('[data-testid]') : null; } catch (e) {}
    while (row && !rowTestIdRe().test(row.getAttribute('data-testid') || '')) row = row.parentElement;
    if (row) scanNodes(row);
    else scanNodes(root);
  }

  function scanNodes(root) {
    if (!root || !root.querySelectorAll) return;
    var rows = root.querySelectorAll('[data-testid]');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (rowTestIdRe().test(r.getAttribute('data-testid') || '')) {
        var existing = r.querySelector('.vkd-btn');
        if (existing && existing.isConnected) {
          /* Migration: sobald die Actions-Zelle (mit „Snippet öffnen“) existiert,
             den Button dorthin verschieben (stabil beim Hover). */
          var target = findMount(r);
          if (target.mount !== existing.parentElement) {
            if (target.before) target.mount.insertBefore(existing, target.before);
            else target.mount.appendChild(existing);
          }
          continue;
        }
        injectButton(r);
      }
    }
  }

  /**
   * Platzierung: bevorzugt VOR „Snippet öffnen“ (MusicAudio_OpenSnippet) in der
   * audiorow-actions-Zelle (stabil beim Hover), sonst Duration-Zelle, sonst Row.
   * @returns {{mount:Element, before:Element|null}}
   */
  function findMount(row) {
    var snippet = row.querySelector('[data-testid="MusicAudio_OpenSnippet"]');
    if (snippet && snippet.parentElement) return { mount: snippet.parentElement, before: snippet };
    var actions = row.querySelector('[data-testid="audiorow-actions"]');
    if (actions) {
      var inner = actions.firstElementChild || actions;
      return { mount: inner, before: inner.firstElementChild || null };
    }
    var dur = row.querySelector('[data-testid$="_Duration"], [data-testid*="Duration"]');
    if (dur) return { mount: dur, before: null };
    return { mount: row, before: null };
  }

  function injectButton(row) {
    if (row.__vkdBtn && row.__vkdBtn.isConnected) return;
    var info = extractInfo(row);
    if (!info || (!info.ids && !info.url)) return;

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'vkd-btn';
    btn.title = 'Download (VK Downloader)';
    btn.innerHTML = '<svg class="vkd-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>' +
      '<span class="vkd-tip">bereit</span>';
    var tip = btn.querySelector('.vkd-tip');

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (row.__vkdBusy) return;
      row.__vkdBusy = true;
      btn.classList.remove('vkd-err');
      tip.textContent = 'lade…';
      startDownload(info, btn, tip).then(function () {
        row.__vkdBusy = false;
      }, function () {
        row.__vkdBusy = false;
      });
    });

    var target = findMount(row);
    if (target.before) target.mount.insertBefore(btn, target.before);
    else target.mount.appendChild(btn);
    row.__vkdBtn = btn;
    row.__vkdTip = tip;
  }

  /* ---------- Track-Extraktion ---------- */
  function walkFiber(el, up) {
    var key = el && Object.keys(el).find(function (k) { return k.indexOf('__reactFiber') === 0; });
    if (!key) return (up && el && el.parentElement) ? walkFiber(el.parentElement, true) : null;
    var fiber = el[key], depth = 0;
    while (fiber && depth++ < 15) {
      var p = fiber.memoizedProps;
      if (p && typeof p === 'object') {
        var hit = (p.track && p.track.entity && p.track.entity.apiAudio) ||
          (p.episode && p.episode.entity && p.episode.entity.apiAudio) ||
          (p.audio && p.audio.id && p.audio.url ? p.audio : null) ||
          (p.audio && p.audio.entity && p.audio.entity.apiAudio) ||
          (p.originalAttachment) ||
          (p.track && p.track.data && p.track.data.apiAudio) ||
          (p.episode && p.episode.data && p.episode.data.apiAudio);
        if (hit) return hit;
      }
      fiber = fiber.return;
    }
    return (!up && el.parentElement) ? walkFiber(el.parentElement, true) : null;
  }

  function extractInfo(row) {
    var f = walkFiber(row);
    if (f && (f.id !== undefined || f.url)) {
      return {
        ids: (f.owner_id !== undefined ? f.owner_id : '') + '_' + (f.id !== undefined ? f.id : '') + (f.access_key ? '_' + f.access_key : ''),
        artist: String(f.artist || ''),
        title: String(f.title || ''),
        subtitle: f.subtitle ? String(f.subtitle) : '',
        duration: f.duration || 0,
        url: f.url ? String(f.url) : ''
      };
    }
    /* Fallback: /audio{owner}_{id}_{access}-Link + Text */
    var link = row.querySelector('a[href*="/audio"]');
    if (link) {
      var m = /\/audio(-?\d+)_(\d+)(?:_([0-9a-f]+))?/.exec(link.getAttribute('href') || '');
      if (m) {
        var titleEl = row.querySelector('[data-testid$="_Title"]');
        var artistEl = row.querySelector('[data-testid$="_Authors"]');
        return {
          ids: m[1] + '_' + m[2] + (m[3] ? '_' + m[3] : ''),
          artist: artistEl ? (artistEl.textContent || '').trim() : '',
          title: titleEl ? (titleEl.textContent || '').trim() : '',
          subtitle: '',
          duration: 0,
          url: ''
        };
      }
    }
    return null;
  }

  /* ---------- URL-Auflösung ---------- */
  function resolveUrl(info) {
    return new Promise(function (resolve) {
      if (info.url) {
        var d = decoder.decodeUrl(info.url, userId);
        if (/^https?:/i.test(d)) { resolve({ url: d, source: 'fiber' }); return; }
      }
      if (!info.ids) { resolveTokenFallback(info, resolve); return; }
      var parts = info.ids.split('_');
      var ownerId = parts[0], audioId = parts[1];
      if (!ownerId || !audioId) { resolveTokenFallback(info, resolve); return; }
      /* Session-Pfad: al_audio.php?act=reload_audios (Format wie VK-Web, trailing '_') */
      var body = 'al=1&audio_ids=' + encodeURIComponent(ownerId) + '_' + encodeURIComponent(audioId) + '_';
      net.postForm(location.origin + '/al_audio.php?act=reload_audios', body, { timeout: 20000 })
        .then(function (r) {
          try {
            var json = JSON.parse(r.responseText);
            var list = json && json.payload && json.payload[1] && json.payload[1][0];
            var track = null;
            if (Array.isArray(list)) {
              /* payload[1][0] = Liste von Tracks (VK al_audio.php) */
              if (Array.isArray(list[0]) || (list[0] && typeof list[0] === 'object')) track = list[0];
              /* …oder direkt ein Track-Array (abweichende Formate) */
              else track = list;
            }
            if (Array.isArray(track) && track.length > 5) {
              var url2 = decoder.decodeUrl(track[2], userId);
              if (/^https?:/i.test(url2)) { resolve({ url: url2, source: 'session' }); return; }
              for (var i = 0; i < track.length; i++) {
                if (typeof track[i] === 'string' && /^https?:/i.test(track[i]) && track[i].indexOf('audio_api_unavailable') === -1) {
                  resolve({ url: track[i], source: 'session' }); return;
                }
              }
            }
          } catch (e) { /* Fallback Token */ }
          resolveTokenFallback(info, resolve);
        })
        .catch(function () { resolveTokenFallback(info, resolve); });
    });
  }

  function resolveTokenFallback(info, resolve) {
    var s = settings.load();
    if (s.token && info.ids) {
      var parts = info.ids.split('_');
      var audios = parts[0] + '_' + parts[1];
      var ua = s.userAgent || 'Kate Mobile/4.20 (Android 5.0; en-US; 1080x1920)';
      var url = 'https://api.vk.com/method/audio.getById?access_token=' + encodeURIComponent(s.token) +
        '&audios=' + encodeURIComponent(audios) + '&v=5.95';
      net.request({ url: url, headers: { 'User-Agent': ua } }).then(function (r) {
        try {
          var j = JSON.parse(r.responseText);
          var item = j && j.response && j.response[0];
          if (item && item.url) { resolve({ url: item.url, source: 'token' }); return; }
        } catch (e) { /* ignorieren */ }
        resolve(null);
      }).catch(function () { resolve(null); });
    } else resolve(null);
  }

  /* ---------- Download-Pipeline ---------- */
  function startDownload(info, btn, tip) {
    var baseName = assemble.sanitizeName(info.artist + ' - ' + info.title + (info.subtitle ? ' (' + info.subtitle + ')' : ''), 'vk-track');
    return resolveUrl(info).then(function (res) {
      if (!res || !res.url) { fail(tip, 'URL nicht auflösbar'); throw new Error('resolve failed'); }
      console.log('[VK Downloader] Stream (' + res.source + '):', res.url);
      return fetchAndAssemble(res.url, tip).then(function (result) {
        var ext = result.ext || '.mp3';
        var filename = assemble.withExt(baseName, ext);
        saveResult(result, filename, tip);
      }, function (err) {
        fail(tip, err && err.message ? err.message : 'Download fehlgeschlagen');
        throw err;
      });
    });
  }

  function fail(tip, msg) {
    /* Tooltip kurz halten — volle Details (URL etc.) in die Konsole */
    tip.textContent = String(msg).length > 48 ? String(msg).slice(0, 45) + '…' : String(msg);
    var btn = tip.closest ? tip.closest('.vkd-btn') : null;
    if (btn) btn.classList.add('vkd-err');
    console.warn('[VK Downloader]', msg);
  }

  function fetchAndAssemble(m3u8Url, tip) {
    tip.textContent = 'manifest…';
    return net.getText(m3u8Url).then(function (text) {
      var pl = m3u8.parsePlaylist(text);
      if (pl.type === 'master') {
        var v = m3u8.pickVariant(pl.variants);
        if (!v) throw new Error('keine Variante im Master-Playlist');
        var vUrl = m3u8.resolveUri(m3u8Url, v.uri);
        return net.getText(vUrl).then(function (t2) {
          return { playlistUrl: vUrl, pl: m3u8.parsePlaylist(t2) };
        });
      }
      return { playlistUrl: m3u8Url, pl: pl };
    }).then(function (media) {
      if (media.pl.encrypted && !media.pl.segments.some(function (s) { return s.encrypted; })) {
        /* Verschlüsselung nur zwischenzeitlich markiert — kein verschlüsseltes Segment */
      }
      return downloadSegments(media, tip);
    });
  }

  function downloadSegments(media, tip) {
    var segs = m3u8.segmentUrls(media.playlistUrl, media.pl.segments, media.pl.mediaSequence);
    if (!segs.length) throw new Error('keine Segmente im Playlist');
    var bufs = new Array(segs.length);
    var pending = segs.length;
    var failed = false;
    var keyCache = {};
    var concurrency = Math.max(1, SETTINGS.concurrency || 3);

    function getKey(keyUri) {
      if (keyCache[keyUri]) return keyCache[keyUri];
      keyCache[keyUri] = net.getBytes(keyUri).then(function (b) {
        if (b.length !== 16) throw new Error('Key hat ' + b.length + ' Bytes (erwartet 16)');
        return b;
      });
      return keyCache[keyUri];
    }

    function fetchSegment(s, i) {
      return net.getBytes(s.url, { timeout: 30000 }).then(function (raw) {
        if (!s.encrypted) return raw;
        return getKey(s.keyUri).then(function (keyBytes) {
          return aes.decryptAes128Cbc(raw, keyBytes, aes.makeIv(s.sequence));
        });
      });
    }

    return new Promise(function (resolve, reject) {
      var idx = 0;
      function worker() {
        if (failed) return;
        if (idx >= segs.length) { if (pending === 0) finish(); return; }
        var i = idx++;
        var tries = 0;
        (function attempt() {
          tip.textContent = 'Segment ' + (i + 1) + '/' + segs.length;
          fetchSegment(segs[i], i).then(function (b) {
            bufs[i] = b; pending--; worker();
          }).catch(function (err) {
            if (tries++ < 2) attempt();
            else { failed = true; reject(err); }
          });
        })();
      }
      function finish() {
        try {
          var concat = assemble.concatSegments(bufs);
          tip.textContent = 'verarbeite…';
          resolve(concat);
        } catch (e) { reject(e); }
      }
      for (var c = 0; c < concurrency; c++) worker();
    });
  }

  function saveResult(result, filename, tip) {
    tip.textContent = 'speichere…';
    var blob;
    try {
      blob = new Blob([result.bytes], { type: 'audio/' + (result.ext === '.mp3' ? 'mpeg' : result.ext === '.m4a' ? 'mp4' : result.ext === '.aac' ? 'aac' : 'mpeg') });
    } catch (e) { fail(tip, 'Blob-Fehler'); return; }
    var objUrl = URL.createObjectURL(blob);
    var saved = false;
    var done = function () {
      if (saved) return;
      saved = true;
      tip.textContent = 'gespeichert';
      setTimeout(function () { URL.revokeObjectURL(objUrl); }, 60000);
    };
    if (NS.gm && NS.gm.download) {
      try {
        NS.gm.download({
          url: objUrl,
          name: filename,
          saveAs: false,
          onload: done,
          onerror: function (e) { anchorFallback(objUrl, filename); done(); },
          ontimeout: done
        });
        setTimeout(done, 4000); /* Sicherheitsnetz, falls onload nie feuert */
        return;
      } catch (e) { /* Fallback unten */ }
    }
    anchorFallback(objUrl, filename);
    done();
  }

  function anchorFallback(url, filename) {
    var a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- Init ---------- */
  function init() {
    try {
      var m = (doc.head && doc.head.textContent || '').match(/\bid:\s?(\d+)/);
      if (m) userId = +m[1];
    } catch (e) {}
    var style = doc.createElement('style');
    style.textContent = STYLES;
    (doc.head || doc.documentElement).appendChild(style);
    scanNodes(doc.body || doc.documentElement);

    var lastHref = location.href;
    /* Periodischer Scan: erkennt Row-Rerender, Hover-Actions-Zellen (Migration)
       und SPA-Navigation zuverlässig. */
    setInterval(function () {
      lastHref = location.href;
      scanNodes(doc.body || doc.documentElement);
    }, 1500);
    try {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var mm = muts[i];
          var nodes = mm.addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j] && nodes[j].nodeType === 1) scanContainer(nodes[j]);
          }
          if (mm.type === 'childList' && mm.removedNodes && mm.removedNodes.length) {
            for (var k = 0; k < mm.removedNodes.length; k++) {
              var rn = mm.removedNodes[k];
              if (rn && rn.nodeType === 1 &&
                  ((rn.getAttribute && rn.getAttribute('data-testid') === 'audiorow-actions') ||
                   (rn.querySelector && (rn.querySelector('[data-testid="audiorow-actions"]') || rn.querySelector('.vkd-btn'))))) {
                /* Actions-Zelle oder Button entfernt → Button neu platzieren */
                scanNodes(doc.body || doc.documentElement);
                break;
              }
            }
          }
        }
      }).observe(doc.documentElement, { childList: true, subtree: true });
    } catch (e) { /* ignorieren */ }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

})(typeof window !== 'undefined' ? window : globalThis);
