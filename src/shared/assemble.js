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
