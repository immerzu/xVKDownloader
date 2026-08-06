/* ============================================================================
 * xVKDownloader — gm-net.js
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
