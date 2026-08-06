/* ============================================================================
 * xVKDownloader — ts-demux.js
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
