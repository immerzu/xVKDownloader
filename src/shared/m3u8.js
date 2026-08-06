/* ============================================================================
 * xVKDownloader — m3u8.js
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
