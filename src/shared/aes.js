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
