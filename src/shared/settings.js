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
