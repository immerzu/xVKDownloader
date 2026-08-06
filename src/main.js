/* ============================================================================
 * xVKDownloader — main.js
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
    try { NS.gm.registerMenuCommand('⚙ xVKDownloader: Einstellungen', openSettingsModal); } catch (e) {}
  }

  function openSettingsModal() {
    var s = settings.load();
    var overlay = doc.createElement('div');
    overlay.className = 'vkd-modal';
    overlay.innerHTML = '<div class="vkd-modal-box">' +
      '<h3>xVKDownloader — Einstellungen</h3>' +
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
    btn.title = 'Download (xVKDownloader)';
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
      console.log('[xVKDownloader] Stream (' + res.source + '):', res.url);
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
    console.warn('[xVKDownloader]', msg);
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
      }).catch(function (err) {
        /* Abgelehnte Promises nicht cachen: ein transienter Key-Fehler
           darf den Download nicht dauerhaft blockieren (Segment-Retry
           lädt den Key dann erneut). */
        delete keyCache[keyUri];
        throw err;
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
