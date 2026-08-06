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
