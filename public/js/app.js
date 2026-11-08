/*
 * app.js — Arranque, puerta de acceso con operación matemática y service worker.
 *
 * AVISO: la operación matemática es una barrera para evitar toques accidentales de niños.
 * NO es seguridad: todo el código se ejecuta en el navegador y cualquiera con conocimientos
 * técnicos puede saltársela.
 */
(function () {
  'use strict';
  var HV = window.HV, UI = HV.ui, h = UI.h;
  var gateFails = 0, LOCK_KEY = 'hv_gate_lock', LOCK_MS = 30000, storageInfo = null;

  function warnText(info) {
    if (!info) { return ''; }
    if (!info.ls && !info.idb) { return 'Este iPad no permite guardar datos para esta web: los cambios no se conservarán.'; }
    if (!info.persisted && info.warnings.length) { return info.warnings.join(' '); }
    return '';
  }

  function applyConfig(cfg, res) {
    if (res) { storageInfo = { ls: res.ls !== false, idb: res.idb !== false, persisted: !!res.ok, warnings: [] }; }
    HV.kiosk.setConfig(cfg);
    HV.kiosk.setWarning(res && !res.ok ? 'Los cambios no se han podido guardar en este iPad.' : warnText(storageInfo));
  }

  function openGate() {
    var until = parseInt(HV.store.lsGet(LOCK_KEY) || '0', 10) || 0;
    if (Date.now() < until) {
      var m0 = UI.modal([h('h2', { text: 'Espera un momento' }), h('p', { text: 'Demasiados intentos. Prueba de nuevo en ' + Math.ceil((until - Date.now()) / 1000) + ' s.' }),
        h('div', { 'class': 'modal-actions' }, h('button', { 'class': 'btn', type: 'button', text: 'Cerrar', onclick: function () { m0.close(); } }))]);
      return;
    }
    var ch = HV.makeChallenge(), entry = '', modal;
    var expr = h('div', { 'class': 'gate-expr', text: ch.text });
    var disp = h('div', { 'class': 'gate-disp', text: ' ' });
    var msg = h('div', { 'class': 'gate-msg', text: 'Solo para adultos. Resuelve la operación.' });
    function setEntry(v) { entry = v; disp.textContent = v || ' '; }
    function key(label, fn, cls) { return h('button', { 'class': 'key ' + (cls || ''), type: 'button', text: label, onclick: fn }); }
    function submit() {
      if (!entry) { return; }
      if (parseInt(entry, 10) === ch.answer) { modal.close(); gateFails = 0; HV.admin.open(HV.kiosk.getConfig()); return; }
      gateFails++;
      if (gateFails >= 3) {
        gateFails = 0; HV.store.lsSet(LOCK_KEY, String(Date.now() + LOCK_MS)); modal.close(); return;
      }
      ch = HV.makeChallenge(); expr.textContent = ch.text; setEntry(''); msg.textContent = 'No es correcto. Prueba con esta otra.';
    }
    var keys = h('div', { 'class': 'keypad' });
    [7, 8, 9, 4, 5, 6, 1, 2, 3].forEach(function (n) { keys.appendChild(key(String(n), function () { if (entry.length < 4) { setEntry(entry + n); } })); });
    keys.appendChild(key('⌫', function () { setEntry(entry.slice(0, -1)); }, 'alt'));
    keys.appendChild(key('0', function () { if (entry.length < 4 && entry !== '') { setEntry(entry + '0'); } else if (entry === '') { setEntry('0'); } }));
    keys.appendChild(key('OK', submit, 'ok'));
    modal = UI.modal([
      h('h2', { text: 'Zona para adultos' }), expr, msg, disp, keys,
      h('div', { 'class': 'modal-actions' }, h('button', { 'class': 'btn', type: 'button', text: 'Cancelar', onclick: function () { modal.close(); } }))
    ]);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') { return; }
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin offline, la app sigue funcionando */ });
  }

  function boot() {
    document.getElementById('gear').addEventListener('click', openGate);
    HV.store.init().then(function (res) {
      storageInfo = res;
      HV.kiosk.start(res.cfg);
      HV.kiosk.setWarning(warnText(res));
      if (res.warnings.length) { UI.toast(res.warnings.join(' '), 'warn'); }
      var w = document.getElementById('boot'); if (w) { w.parentNode.removeChild(w); }
      registerSW();
    });
  }

  HV.app = {
    applyConfig: applyConfig,
    onAdminClosed: function () { HV.kiosk.render(); }
  };
  boot();
})();
