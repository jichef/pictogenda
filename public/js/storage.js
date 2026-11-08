/*
 * storage.js — Persistencia local (ES5, compatible con iOS 12).
 *
 *  - localStorage: configuración (JSON pequeño).
 *  - IndexedDB:    copia adicional de la configuración + imágenes subidas (dataURL reducidas).
 *  - data/default-config.json: configuración inicial; se usa solo si no hay datos locales válidos.
 *
 * Reglas: nunca se sobrescribe una configuración válida con datos corruptos, nunca se borra nada
 * al actualizar la app, y todas las escrituras se verifican leyendo de vuelta.
 */
(function () {
  'use strict';
  var HV = window.HV;
  var LS_KEY = 'hv_config_v2';
  var LS_CORRUPT = 'hv_corrupt_backup';
  var DB_NAME = 'horario-visual';
  var dbPromise = null;

  /* ---------- localStorage ---------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsWorks() {
    try {
      var k = 'hv_probe'; window.localStorage.setItem(k, '1');
      var ok = window.localStorage.getItem(k) === '1'; window.localStorage.removeItem(k); return ok;
    } catch (e) { return false; }
  }

  /* ---------- IndexedDB (con tiempo máximo: en Safari antiguo puede quedarse colgada) ---------- */
  function openDB() {
    if (dbPromise) { return dbPromise; }
    dbPromise = new Promise(function (resolve) {
      var done = false;
      function finish(db) { if (!done) { done = true; clearTimeout(timer); resolve(db); } }
      var timer = setTimeout(function () { finish(null); }, 4000);
      try {
        if (!window.indexedDB) { finish(null); return; }
        var req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('kv')) { db.createObjectStore('kv'); }
          if (!db.objectStoreNames.contains('images')) { db.createObjectStore('images'); }
        };
        req.onsuccess = function () { finish(req.result); };
        req.onerror = function () { finish(null); };
        req.onblocked = function () { finish(null); };
      } catch (e) { finish(null); }
    });
    return dbPromise;
  }
  function idbOp(store, mode, fn) { /* fn(objectStore) -> request; resuelve con result o undefined */
    return openDB().then(function (db) {
      if (!db) { return undefined; }
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(store, mode), result;
          var req = fn(tx.objectStore(store));
          if (req) { req.onsuccess = function () { result = req.result; }; }
          tx.oncomplete = function () { resolve(mode === 'readwrite' ? true : result); };
          tx.onerror = tx.onabort = function () { resolve(mode === 'readwrite' ? false : undefined); };
        } catch (e) { resolve(mode === 'readwrite' ? false : undefined); }
      });
    });
  }
  function idbGet(store, key) { return idbOp(store, 'readonly', function (s) { return s.get(key); }); }
  function idbPut(store, key, val) { return idbOp(store, 'readwrite', function (s) { return s.put(val, key); }); }
  function idbDel(store, key) { return idbOp(store, 'readwrite', function (s) { return s['delete'](key); }); }
  function idbClear(store) { return idbOp(store, 'readwrite', function (s) { return s.clear(); }); }

  /* ---------- configuración inicial ---------- */
  function loadDefault() {
    return new Promise(function (resolve) {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', 'data/default-config.json?_=' + Date.now(), true);
        x.onload = function () {
          try { resolve(HV.migrate(JSON.parse(x.responseText)) || emptyConfig()); } catch (e) { resolve(emptyConfig()); }
        };
        x.onerror = function () { resolve(emptyConfig()); };
        x.send();
      } catch (e) { resolve(emptyConfig()); }
    });
  }
  function emptyConfig() {
    return HV.migrate({ schemaVersion: 2, days: { 1: [], 2: [], 3: [], 4: [], 5: [] }, sameEveryDay: true });
  }
  function stamp(c) { var t = c && c.savedAt ? Date.parse(c.savedAt) : 0; return isFinite(t) ? t : 0; }
  function parseCfg(raw) {
    if (!raw || typeof raw !== 'string') { return null; }
    try { return HV.migrate(JSON.parse(raw)); } catch (e) { return null; }
  }

  /* ---------- API ---------- */
  var store = {
    lsGet: lsGet, lsSet: lsSet,

    /* Carga la configuración. Resuelve {cfg, source, warnings, ls, idb, persisted}. */
    init: function () {
      var res = { cfg: null, source: 'default', warnings: [], ls: lsWorks(), idb: false, persisted: false };
      var raw = lsGet(LS_KEY), cfgLS = parseCfg(raw), cfgIDB = null;
      if (raw && !cfgLS) {
        res.warnings.push('Los datos guardados estaban dañados. Se conservó una copia aparte y no se han sobrescrito.');
        if (!lsGet(LS_CORRUPT)) { lsSet(LS_CORRUPT, raw); }
      }
      return openDB().then(function (db) {
        res.idb = !!db;
        return idbGet('kv', 'config');
      }).then(function (rawIdb) {
        cfgIDB = parseCfg(rawIdb);
        var best = null;
        if (cfgLS && cfgIDB) { best = stamp(cfgIDB) > stamp(cfgLS) ? cfgIDB : cfgLS; res.source = best === cfgIDB ? 'idb' : 'local'; }
        else if (cfgLS) { best = cfgLS; res.source = 'local'; }
        else if (cfgIDB) { best = cfgIDB; res.source = 'idb'; res.warnings.push('Se recuperó la configuración desde la copia interna (IndexedDB).'); }
        if (best) {
          res.persisted = true;
          var s = JSON.stringify(best);
          /* Reparar la copia que falte o esté desactualizada (sin cambiar savedAt). */
          if (res.ls && (!cfgLS || stamp(cfgLS) < stamp(best))) { lsSet(LS_KEY, s); }
          if (res.idb && (!cfgIDB || stamp(cfgIDB) < stamp(best))) { idbPut('kv', 'config', s); }
          return best;
        }
        return loadDefault();
      }).then(function (cfg) {
        res.cfg = cfg;
        /* Imágenes subidas */
        var jobs = HV.imageIds(cfg).map(function (iid) {
          return idbGet('images', iid).then(function (d) { if (typeof d === 'string') { HV.images[iid] = d; } });
        });
        return Promise.all(jobs);
      }).then(function () { return res; });
    },

    /* Guarda y verifica. Resuelve {ok, ls, idb, cfg}. Rechaza configuraciones no válidas. */
    save: function (cfg) {
      var c = HV.migrate(cfg);
      if (!c) { return Promise.reject(new Error('Configuración no válida: no se ha guardado.')); }
      c.savedAt = new Date().toISOString();
      var s = JSON.stringify(c);
      var lsOk = lsSet(LS_KEY, s) && lsGet(LS_KEY) === s;
      return idbPut('kv', 'config', s).then(function (put) {
        return idbGet('kv', 'config').then(function (back) {
          var idbOk = put === true && back === s;
          return { ok: lsOk || idbOk, ls: lsOk, idb: idbOk, cfg: c };
        });
      });
    },

    saveImage: function (id, dataUrl) {
      HV.images[id] = dataUrl;
      return idbPut('images', id, dataUrl).then(function (ok) {
        return idbGet('images', id).then(function (back) { return ok === true && back === dataUrl; });
      });
    },
    deleteImage: function (id) { delete HV.images[id]; return idbDel('images', id); },

    /* Comprueba escritura y lectura reales en ambos almacenes. */
    verify: function (cfg) {
      var out = { ls: false, idb: false, match: false, savedAt: '' };
      var probe = 'p' + Date.now();
      out.ls = lsWorks();
      var raw = lsGet(LS_KEY), c = parseCfg(raw);
      out.savedAt = c ? c.savedAt : '';
      return idbPut('kv', 'probe', probe).then(function (ok) {
        return idbGet('kv', 'probe').then(function (back) {
          out.idb = ok === true && back === probe;
          return idbGet('kv', 'config');
        });
      }).then(function (rawIdb) {
        var ci = parseCfg(rawIdb);
        out.hasLocal = !!c; out.hasIdb = !!ci;
        out.match = !!c && !!ci && JSON.stringify(c) === JSON.stringify(ci);
        return out;
      });
    },

    /* Restaura la configuración inicial del proyecto y borra imágenes subidas. */
    resetToDefault: function () {
      return loadDefault().then(function (cfg) {
        var ids = Object.keys(HV.images);
        ids.forEach(function (id) { delete HV.images[id]; });
        return idbClear('images').then(function () { return store.save(cfg); });
      });
    },

    exportAll: function (cfg) {
      var images = {};
      HV.imageIds(cfg).forEach(function (iid) { if (HV.images[iid]) { images[iid] = HV.images[iid]; } });
      return { format: 'horario-visual-backup', version: HV.SCHEMA_VERSION, exportedAt: new Date().toISOString(), config: cfg, images: images };
    },

    /* Valida una copia (texto JSON). Lanza Error si no es válida; no toca nada. */
    parseBackup: function (text) {
      var obj;
      try { obj = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
      var cfg = HV.migrate(obj && obj.config ? obj.config : obj);
      if (!cfg) { throw new Error('El archivo no contiene un horario válido.'); }
      var images = {};
      if (obj && obj.images && typeof obj.images === 'object') {
        HV.imageIds(cfg).forEach(function (iid) {
          var d = obj.images[iid];
          if (typeof d === 'string' && /^data:image\//.test(d)) { images[iid] = d; }
        });
      }
      return { cfg: cfg, images: images };
    },

    /* Aplica una copia ya validada (sustituye lo actual). */
    applyBackup: function (b) {
      return idbClear('images').then(function () {
        Object.keys(HV.images).forEach(function (id) { delete HV.images[id]; });
        var jobs = Object.keys(b.images).map(function (id) { return store.saveImage(id, b.images[id]); });
        return Promise.all(jobs);
      }).then(function () { return store.save(b.cfg); });
    }
  };

  HV.store = store;
})();
