/* Service worker: precarga de la aplicación y funcionamiento sin conexión.
 * Estrategia: caché primero con actualización en segundo plano (stale-while-revalidate).
 * Solo toca la Cache Storage; NUNCA toca localStorage ni IndexedDB (los datos del usuario).
 * Límite: Safari puede vaciar esta caché si necesita espacio o tras tiempo sin uso. */
var VERSION = '0cf44c6e';
var CACHE = 'hv-cache-' + VERSION;
var ASSETS = /*ASSETS*/[
 "./",
 "css/admin.css",
 "css/style.css",
 "data/default-config.json",
 "fonts/horario.ttf",
 "icons/icon-180.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "index.html",
 "js/admin.js",
 "js/app.js",
 "js/core.js",
 "js/kiosk.js",
 "js/storage.js",
 "js/ui.js",
 "manifest.json",
 "pictos/asamblea.svg",
 "pictos/calculo.svg",
 "pictos/ciencias.svg",
 "pictos/comida.svg",
 "pictos/cuaderno.svg",
 "pictos/educacion-fisica.svg",
 "pictos/espera.svg",
 "pictos/fin.svg",
 "pictos/ingles.svg",
 "pictos/lectura.svg",
 "pictos/lengua.svg",
 "pictos/matematicas.svg",
 "pictos/material.svg",
 "pictos/musica.svg",
 "pictos/plastica.svg",
 "pictos/problemas.svg",
 "pictos/recreo.svg",
 "pictos/vacio.svg"
]/*END*/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('hv-cache-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || e.request.url.indexOf(self.location.origin) !== 0) { return; }
  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (r) {
        if (r && r.status === 200) { cache.put(e.request, r.clone()); }
        return r;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
