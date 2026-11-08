/*
 * core.js — Lógica pura (sin DOM): horario, estado actual, progreso, validación,
 * migración de esquema y operación matemática de acceso.
 *
 * IMPORTANTE: sintaxis ES5 deliberada (sin =>, let/const, ?., ??, etc.) para Safari de iOS 12.
 * Se carga tanto en el navegador (window.HV) como en Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.HV = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var HV = {};

  HV.SCHEMA_VERSION = 2;
  HV.DAYS = [
    { n: 1, name: 'Lunes' }, { n: 2, name: 'Martes' }, { n: 3, name: 'Miércoles' },
    { n: 4, name: 'Jueves' }, { n: 5, name: 'Viernes' }, { n: 6, name: 'Sábado' }, { n: 7, name: 'Domingo' }
  ];
  /* Clave de día en cfg.days: 1=lunes … 6=sábado, 7=domingo. dow = Date.getDay() (0=domingo). */
  HV.keyOfDow = function (dow) { return dow === 0 ? 7 : dow; };
  HV.dayName = function (dow) { return HV.DAYS[HV.keyOfDow(dow) - 1].name; };

  /* Pictogramas incorporados (archivos SVG locales en /pictos). */
  var BP = [
    ['matematicas', 'Matemáticas'], ['lengua', 'Lengua'], ['ingles', 'Inglés'], ['ciencias', 'Ciencias'],
    ['plastica', 'Plástica'], ['musica', 'Música'], ['educacion-fisica', 'Educación física'], ['lectura', 'Lectura'],
    ['recreo', 'Recreo'], ['comida', 'Comida'], ['asamblea', 'Asamblea'], ['cuaderno', 'Cuaderno'],
    ['calculo', 'Cálculo'], ['problemas', 'Problemas'], ['material', 'Material manipulativo'],
    ['espera', 'Espera'], ['fin', 'Fin de la jornada']
  ];
  HV.BUILTIN_PICTOS = BP.map(function (p) { return { id: 'b-' + p[0], name: p[1], src: 'pictos/' + p[0] + '.svg' }; });
  HV.PLACEHOLDER = 'pictos/vacio.svg';
  HV.images = {}; /* id -> dataURL de pictogramas subidos (se rellena desde IndexedDB) */

  HV.DEFAULT_SETTINGS = {
    coverColor: '#3d5a80',
    coverOpacity: 0.6,
    showInfoBar: false,        /* barra inferior: horas, cuánto queda, «después», progreso */
    showCounter: true,
    showTimes: true,
    showProgressBar: true,
    pictoSize: 'large',        /* medium | large | xlarge */
    transitions: true,
    showFullSidebar: true,
    showMarks: true,
    milestones: '25-50-75',    /* '25-50-75' | 'none' */
    milestoneEffect: true
  };

  /* ---------- utilidades ---------- */
  HV.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  HV.uid = function () { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  HV.pad = pad;

  HV.parseTime = function (s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s === undefined || s === null ? '' : s));
    if (!m) { return NaN; }
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) { return NaN; }
    return h * 60 + mi;
  };
  HV.formatTime = function (min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  };
  /* Fondo de la cobertura: sólido con borde inferior difuminado (fundido suave, sin línea dura). */
  HV.coverBackground = function (hex, a) {
    return 'linear-gradient(to bottom, ' + HV.hexToRgba(hex, a) + ' 0%, ' + HV.hexToRgba(hex, a) + ' calc(100% - 1.3rem), ' +
      HV.hexToRgba(hex, a * 0.45) + ' calc(100% - .55rem), ' + HV.hexToRgba(hex, 0) + ' 100%)';
  };
  HV.hexToRgba = function (hex, a) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) { m = [0, '3d', '5a', '80']; }
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
  };
  /* Cuenta atrás: minutos:segundos (con horas solo si se pide y hay más de 99 min). */
  HV.fmtCountdown = function (sec, allowHours) {
    var s = Math.max(0, Math.ceil(sec));
    if (allowHours && s >= 3600) {
      return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
    }
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  };
  HV.dayKey = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  /* ---------- pictogramas ---------- */
  HV.findPicto = function (cfg, id) {
    var i;
    for (i = 0; i < HV.BUILTIN_PICTOS.length; i++) { if (HV.BUILTIN_PICTOS[i].id === id) { return HV.BUILTIN_PICTOS[i]; } }
    var cp = (cfg && cfg.customPictos) || [];
    for (i = 0; i < cp.length; i++) { if (cp[i].id === id) { return cp[i]; } }
    return null;
  };
  HV.pictoSrc = function (cfg, id) {
    var p = HV.findPicto(cfg, id);
    if (!p) { return HV.PLACEHOLDER; }
    if (p.src) { return p.src; }
    return HV.images[id] || HV.PLACEHOLDER;
  };
  HV.pictoName = function (cfg, id) { var p = HV.findPicto(cfg, id); return p ? p.name : ''; };

  /* ---------- migración / normalización del esquema ----------
   * Acepta v1 (sin pictogramas secundarios) y v2. Devuelve una copia limpia o null si no es válida. */
  HV.migrate = function (input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { return null; }
    if (!input.days || typeof input.days !== 'object') { return null; }
    var out = {
      schemaVersion: HV.SCHEMA_VERSION,
      savedAt: typeof input.savedAt === 'string' ? input.savedAt : '',
      sameEveryDay: input.sameEveryDay === true,
      settings: {},
      customPictos: [],
      days: {}
    };
    var def = HV.DEFAULT_SETTINGS, s = input.settings || {}, k;
    for (k in def) {
      if (!def.hasOwnProperty(k)) { continue; }
      out.settings[k] = (typeof s[k] === typeof def[k]) ? s[k] : def[k];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(out.settings.coverColor)) { out.settings.coverColor = def.coverColor; }
    var op = +out.settings.coverOpacity;
    out.settings.coverOpacity = isFinite(op) ? Math.min(0.95, Math.max(0.1, op)) : def.coverOpacity;
    if (['medium', 'large', 'xlarge'].indexOf(out.settings.pictoSize) < 0) { out.settings.pictoSize = def.pictoSize; }
    if (['25-50-75', 'none'].indexOf(out.settings.milestones) < 0) { out.settings.milestones = def.milestones; }

    var cp = Array.isArray(input.customPictos) ? input.customPictos : [];
    cp.forEach(function (p) {
      if (p && typeof p.id === 'string' && p.id) { out.customPictos.push({ id: p.id, name: String(p.name || 'Imagen') }); }
    });

    var used = {};
    for (var d = 1; d <= 7; d++) {
      var src = input.days[d] || input.days[String(d)] || [];
      var list = [];
      (Array.isArray(src) ? src : []).forEach(function (a) {
        if (!a || typeof a !== 'object') { return; }
        var id = typeof a.id === 'string' && a.id && !used[a.id] ? a.id : HV.uid();
        used[id] = true;
        var sec = [];
        (Array.isArray(a.secondary) ? a.secondary : []).forEach(function (x) {
          if (x && typeof x.pictoId === 'string' && x.pictoId) { sec.push({ pictoId: x.pictoId, label: String(x.label || '') }); }
        });
        list.push({
          id: id,
          name: String(a.name === undefined ? '' : a.name),
          start: String(a.start === undefined ? '' : a.start),
          end: String(a.end === undefined ? '' : a.end),
          pictoId: String(a.pictoId || a.picto || ''),
          color: /^#[0-9a-fA-F]{6}$/.test(a.color || '') ? a.color : '',
          secondary: sec
        });
      });
      out.days[d] = list;
    }
    return out;
  };

  /* ---------- horario ---------- */
  function validAct(a) {
    var s = HV.parseTime(a.start), e = HV.parseTime(a.end);
    return isFinite(s) && isFinite(e) && e > s;
  }
  /* Copia ordenada cronológicamente (estable). No modifica las horas. */
  HV.sortDay = function (acts) {
    return acts.map(function (a, i) { return { a: a, i: i, s: HV.parseTime(a.start) }; })
      .sort(function (x, y) {
        var xs = isFinite(x.s) ? x.s : 1e9, ys = isFinite(y.s) ? y.s : 1e9;
        return xs - ys || x.i - y.i;
      }).map(function (x) { return x.a; });
  };
  /* Actividades utilizables de un día (dow = getDay()). «Mismo horario» solo afecta de lunes a viernes. */
  HV.scheduleFor = function (cfg, dow) {
    var key = HV.keyOfDow(dow);
    if (cfg.sameEveryDay && key <= 5) { key = 1; }
    return HV.sortDay(cfg.days[key] || []).filter(validAct);
  };
  HV.nextSchoolDay = function (cfg, dow) {
    for (var i = 1; i <= 7; i++) {
      var d = (dow + i) % 7, list = HV.scheduleFor(cfg, d);
      if (list.length) { return { dow: d, offset: i, act: list[0] }; }
    }
    return null;
  };

  /* Estado en un instante. type: active | before | gap | after | weekend | empty */
  HV.getState = function (cfg, date) {
    var dow = date.getDay();
    var secs = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() + date.getMilliseconds() / 1000;
    var st = { dow: dow, secs: secs, dayKey: HV.dayKey(date), list: [], type: 'empty', act: null, next: null, prev: null, index: -1 };
    var list = HV.scheduleFor(cfg, dow);
    st.list = list;
    if (!list.length) { st.type = (dow === 0 || dow === 6) ? 'weekend' : 'empty'; st.nextDay = HV.nextSchoolDay(cfg, dow); return st; }
    var i, s, e, maxEnd = 0;
    for (i = 0; i < list.length; i++) {
      s = HV.parseTime(list[i].start) * 60; e = HV.parseTime(list[i].end) * 60;
      if (e > maxEnd) { maxEnd = e; }
      if (secs >= s && secs < e) {
        st.type = 'active'; st.act = list[i]; st.index = i;
        st.startSec = s; st.endSec = e;
        st.progress = Math.min(1, Math.max(0, (secs - s) / (e - s)));
        st.remaining = e - secs;
        st.next = list[i + 1] || null;
        return st;
      }
    }
    var firstStart = HV.parseTime(list[0].start) * 60;
    if (secs < firstStart) {
      st.type = 'before'; st.next = list[0]; st.toNext = firstStart - secs; return st;
    }
    if (secs >= maxEnd) { st.type = 'after'; st.nextDay = HV.nextSchoolDay(cfg, dow); return st; }
    st.type = 'gap';
    for (i = 0; i < list.length; i++) {
      s = HV.parseTime(list[i].start) * 60;
      if (s > secs) { st.next = list[i]; st.toNext = s - secs; break; }
    }
    return st;
  };

  /* Hitos: devuelve para cada marca (25/50/75) si ya se ha superado. */
  HV.MARKS = [25, 50, 75];
  HV.reachedMarks = function (progress) {
    return HV.MARKS.map(function (m) { return progress * 100 >= m; });
  };

  /* ---------- validación de una jornada ---------- */
  HV.validateDay = function (acts) {
    var errors = [], warnings = [];
    function nm(a) { return '«' + (a.name || 'sin nombre') + '»'; }
    var ok = [];
    acts.forEach(function (a) {
      if (!String(a.name || '').replace(/\s/g, '')) { errors.push('Hay una actividad sin nombre (' + (a.start || '?') + ').'); }
      var s = HV.parseTime(a.start), e = HV.parseTime(a.end);
      if (!isFinite(s) || !isFinite(e)) { errors.push(nm(a) + ': falta la hora de inicio o de fin.'); return; }
      if (e <= s) { errors.push(nm(a) + ': la hora de fin debe ser posterior a la de inicio.'); return; }
      if (!a.pictoId) { errors.push(nm(a) + ': falta el pictograma principal.'); }
      ok.push(a);
    });
    var sorted = HV.sortDay(ok), maxEnd = -1, maxAct = null;
    sorted.forEach(function (a) {
      var s = HV.parseTime(a.start), e = HV.parseTime(a.end);
      if (maxAct !== null) {
        if (s < maxEnd) { errors.push(nm(maxAct) + ' y ' + nm(a) + ' se solapan.'); }
        else if (s > maxEnd) { warnings.push('Hueco sin actividad de ' + HV.formatTime(maxEnd) + ' a ' + HV.formatTime(s) + '.'); }
      }
      if (e > maxEnd) { maxEnd = e; maxAct = a; }
    });
    return { errors: errors, warnings: warnings };
  };

  /* ---------- operación matemática de acceso (sin eval) ---------- */
  /* Analizador recursivo: expr = term (('+'|'-') term)* ; term = factor (('×'|'÷') factor)* */
  HV.evalExpr = function (str) {
    var t = String(str).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[x*]/gi, '×').replace(/\//g, '÷');
    var pos = 0;
    function peek() { return t.charAt(pos); }
    function num() {
      var st = pos;
      while (/[0-9]/.test(peek())) { pos++; }
      if (st === pos) { throw new Error('Expresión no válida'); }
      return parseInt(t.slice(st, pos), 10);
    }
    function factor() {
      if (peek() === '(') { pos++; var v = expr(); if (peek() !== ')') { throw new Error('Falta )'); } pos++; return v; }
      return num();
    }
    function term() {
      var v = factor();
      while (peek() === '×' || peek() === '÷') {
        var op = t.charAt(pos++), r = factor();
        if (op === '×') { v = v * r; }
        else { if (r === 0 || v % r !== 0) { throw new Error('División no entera'); } v = v / r; }
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() === '+' || peek() === '-') {
        var op = t.charAt(pos++), r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    var res = expr();
    if (pos !== t.length) { throw new Error('Sobran caracteres'); }
    return res;
  };

  HV.makeChallenge = function (rnd) {
    rnd = rnd || Math.random;
    function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
    var tries = 0;
    while (tries++ < 50) {
      var a, b, c, q, text;
      switch (ri(1, 4)) {
        case 1: a = ri(2, 6); b = ri(2, 5); c = ri(3, 12); text = '(' + a + ' × ' + b + ') + ' + c; break;
        case 2: b = ri(2, 5); q = ri(2, 8); a = b * q; c = ri(2, 12); text = '(' + a + ' ÷ ' + b + ') + ' + c; break;
        case 3: a = ri(2, 9); b = ri(2, 9); c = ri(2, 4); text = '(' + a + ' + ' + b + ') × ' + c; break;
        default: a = ri(10, 20); b = ri(2, 9); c = ri(2, 9); text = '(' + a + ' − ' + b + ') + ' + c; break;
      }
      var ans;
      try { ans = HV.evalExpr(text); } catch (err) { continue; }
      if (ans > 0 && ans < 100 && Math.floor(ans) === ans) { return { text: text + ' = ?', answer: ans }; }
    }
    return { text: '(4 × 3) + 5 = ?', answer: 17 };
  };

  return HV;
});
