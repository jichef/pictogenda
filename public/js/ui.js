/* ui.js — Ayudas mínimas de DOM (ES5). */
(function () {
  'use strict';
  var HV = window.HV;
  var UI = {};

  /* h('div', {class:'x', onclick:fn, value:'..'}, [hijos | texto]) */
  UI.h = function (tag, props, kids) {
    var e = document.createElement(tag), k, v, after = {};
    if (props) {
      for (k in props) {
        if (!props.hasOwnProperty(k)) { continue; }
        v = props[k];
        if (k === 'class') { e.className = v; }
        else if (k === 'text') { e.textContent = v; }
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') { after[k] = v; }
        else if (k.indexOf('on') === 0) { e.addEventListener(k.slice(2), v); }
        else if (v !== false && v !== null && v !== undefined) { e.setAttribute(k, v); }
      }
    }
    (function add(list) {
      if (list === undefined || list === null || list === false) { return; }
      if (Array.isArray(list)) { for (var i = 0; i < list.length; i++) { add(list[i]); } return; }
      e.appendChild(typeof list === 'object' ? list : document.createTextNode(String(list)));
    })(kids);
    for (k in after) { if (after.hasOwnProperty(k)) { e[k] = after[k]; } } /* value tras crear <option>s */
    return e;
  };

  UI.clear = function (node) { while (node.firstChild) { node.removeChild(node.firstChild); } return node; };

  /* Ventana modal sencilla. Devuelve {close, body}. */
  UI.modal = function (content, opts) {
    var root = document.getElementById('modalRoot');
    var back = UI.h('div', { 'class': 'modal-back' });
    var box = UI.h('div', { 'class': 'modal-box' + (opts && opts.wide ? ' wide' : '') }, content);
    back.appendChild(box);
    root.appendChild(back);
    var api = {
      body: box,
      close: function () { if (back.parentNode) { back.parentNode.removeChild(back); } if (opts && opts.onClose) { opts.onClose(); } }
    };
    if (!(opts && opts.sticky)) {
      back.addEventListener('click', function (ev) { if (ev.target === back) { api.close(); } });
    }
    return api;
  };

  UI.toast = function (text, kind) {
    var root = document.getElementById('modalRoot');
    var t = UI.h('div', { 'class': 'toast ' + (kind || '') , text: text });
    t.style.bottom = (3 + root.getElementsByClassName('toast').length * 5) + 'rem'; /* apila los avisos */
    root.appendChild(t);
    setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 3500);
  };

  /* Imagen cuadrada reducida (máx. 400 px) -> dataURL. Mantiene proporción, centrada en lienzo cuadrado. */
  UI.processImage = function (file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//i.test(file.type || '') && !/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name || '')) { reject(new Error('Formato no admitido (usa JPG, PNG o WebP).')); return; }
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('No se pudo leer el archivo.')); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Este navegador no puede abrir esa imagen (¿WebP en iOS 12? Conviértela a PNG o JPG).')); };
        img.onload = function () {
          try {
            var MAX = 400, w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
            var sc = Math.min(1, MAX / Math.max(w, hh)), dw = Math.max(1, Math.round(w * sc)), dh = Math.max(1, Math.round(hh * sc));
            var side = Math.max(dw, dh);
            var c = document.createElement('canvas'); c.width = side; c.height = side;
            var ctx = c.getContext('2d');
            var png = /png|webp|gif/i.test(file.type || file.name || '');
            if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, side, side); }
            ctx.drawImage(img, Math.round((side - dw) / 2), Math.round((side - dh) / 2), dw, dh);
            resolve(png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85));
          } catch (e) { reject(new Error('No se pudo reducir la imagen.')); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* Selector de pictograma (biblioteca completa). cb(pictoId) */
  UI.pickPicto = function (cfg, cb, current, upload) {
    var grid = UI.h('div', { 'class': 'picker-grid' });
    var m, fileIn = UI.h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: function () {
      var files = Array.prototype.slice.call(this.files || []); this.value = '';
      m.close(); upload(files, function () { UI.pickPicto(cfg, cb, current, upload); });
    } });
    fileIn.multiple = true;
    function item(p) {
      return UI.h('button', {
        'class': 'picker-item' + (p.id === current ? ' sel' : ''), type: 'button',
        onclick: function () { m.close(); cb(p.id); }
      }, [UI.h('img', { src: HV.pictoSrc(cfg, p.id), alt: '' }), UI.h('span', { text: p.name })]);
    }
    HV.BUILTIN_PICTOS.forEach(function (p) { grid.appendChild(item(p)); });
    cfg.customPictos.forEach(function (p) { grid.appendChild(item(p)); });
    m = UI.modal([
      UI.h('h2', { text: 'Elegir pictograma' }),
      UI.h('div', { 'class': 'picker-scroll scrollable' }, grid), fileIn,
      UI.h('div', { 'class': 'modal-actions' }, [
        upload ? UI.h('button', { 'class': 'btn primary', type: 'button', text: '+ Subir imágenes', onclick: function () { fileIn.click(); } }) : null,
        UI.h('button', { 'class': 'btn', type: 'button', text: 'Cancelar', onclick: function () { m.close(); } })
      ])
    ], { wide: true });
  };

  HV.ui = UI;
})();
