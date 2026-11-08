/*
 * kiosk.js — Pantalla principal.
 *
 * El progreso SIEMPRE se calcula a partir de la hora real (HV.getState) en cada actualización.
 * Entre actualizaciones (1 s) la capa se desplaza con una transición CSS lineal de 1 s hacia
 * el valor que tendrá el reloj en el siguiente tic: es solo interpolación visual. No hay
 * ninguna animación de duración igual a la actividad, así que no puede desincronizarse.
 */
(function () {
  'use strict';
  var HV = window.HV, UI = HV.ui, h = UI.h;
  var cfg = null, cfgVersion = 0;
  var els = {};
  var curKey = '', sideKey = '', switching = false;
  var lastWall = 0, lastProg = -1, lastActId = '', firedMarks = {}, lastSideCurrent = -2;
  var reduceMotion = false, clock = null;
  function nowDate() { return clock ? clock() : new Date(); }
  var timer = null;
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var SIZES = { medium: 0.7, large: 0.88, xlarge: 1 };

  function $(id) { return document.getElementById(id); }
  function setT(el, v) { el.style.webkitTransform = v; el.style.transform = v; }
  function setTr(el, v) { el.style.webkitTransition = v; el.style.transition = v; }
  function text(el, t) { if (el.textContent !== t) { el.textContent = t; } }
  function show(el, on) { el.style.display = on ? '' : 'none'; }
  function timesText(a) { return a.start + ' – ' + a.end; }

  function init() {
    ['main', 'content', 'actName', 'stage', 'pbox', 'pimg', 'coverClip', 'cover', 'marks', 'secondary', 'info', 'times', 'counterWrap',
      'counterLabel', 'counter', 'nextCard', 'pbar', 'pbarFill', 'sideScroll', 'dayName', 'dayDate', 'sideList', 'gear', 'warn', 'subtitle'].forEach(function (id) { els[id] = $(id); });
    try { reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduceMotion = false; }
    /* marcas fijas (25/50/75) */
    HV.MARKS.forEach(function (m) {
      els.marks.appendChild(h('div', { 'class': 'mark', 'data-m': m, style: 'top:' + m + '%' }, [h('div', { 'class': 'mark-line' }), h('div', { 'class': 'mark-dot' })]));
    });
    window.addEventListener('resize', function () { layout(); render({ instant: true }); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { layout(); render({ instant: true }); }, 250); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { resume(); } });
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }); });
    document.addEventListener('touchmove', function (e) {
      /* solo permite desplazar la columna lateral y el panel de administración */
      var t = e.target, ok = !!(t && t.tagName === 'INPUT');
      while (t && t !== document.body) { if (t.className && /(^| )(scrollable)( |$)/.test(t.className)) { ok = true; break; } t = t.parentNode; }
      if (!ok) { e.preventDefault(); }
    }, { passive: false });
    layout();
  }

  function resume() { layout(); render({ instant: true }); schedule(); }

  /* Un tic cada segundo, alineado con el cambio de segundo del reloj. */
  function schedule() {
    if (timer) { clearTimeout(timer); }
    var delay = 1000 - (Date.now() % 1000) + 8;
    timer = setTimeout(function () { render({}); schedule(); }, delay);
  }

  function applySettings() {
    var s = cfg.settings;
    els.cover.style.background = HV.coverBackground(s.coverColor, s.coverOpacity);
    show(els.counterWrap, s.showCounter);
    show(els.times, s.showTimes);
    document.body.className = (s.transitions && !reduceMotion ? 'anim' : 'noanim');
    layout();
  }

  /* Dimensiona el pictograma (cuadrado) al espacio disponible y la unidad rem. */
  function layout() {
    var H = window.innerHeight, W = window.innerWidth;
    document.documentElement.style.fontSize = (Math.min(H, W * 0.75) / 50) + 'px';
    var scale = cfg ? (SIZES[cfg.settings.pictoSize] || 0.88) : 0.88;
    var w = els.stage.clientWidth, hh = els.stage.clientHeight;
    var side = Math.max(60, Math.floor(Math.min(w, hh) * scale));
    els.pbox.style.width = side + 'px';
    els.pbox.style.height = side + 'px';
  }

  function structKey(st) {
    return [st.type, st.act ? st.act.id : '', st.next ? st.next.id : '', st.dayKey, cfgVersion].join('|');
  }

  function render(opts) {
    if (!cfg || switching) { return; }
    opts = opts || {};
    var now = nowDate(), st = HV.getState(cfg, now);
    var wall = Date.now();
    var jump = lastWall && Math.abs(wall - lastWall) > 3500; /* app suspendida / cambio de hora */
    lastWall = wall;
    var instant = !!opts.instant || jump;
    var key = structKey(st);
    if (key !== curKey) {
      var animate = curKey !== '' && !instant && cfg.settings.transitions && !reduceMotion;
      if (animate) {
        switching = true;
        els.content.className = 'fading';
        setTimeout(function () {
          switching = false;
          var st2 = HV.getState(cfg, nowDate());
          curKey = structKey(st2);
          build(st2);
          els.content.className = '';
          update(st2, true);
        }, 280);
        return;
      }
      curKey = key;
      build(st);
      instant = true;
    }
    update(st, instant);
  }

  /* Reconstruye los elementos que solo cambian al cambiar de actividad / pantalla. */
  function build(st) {
    var s = cfg.settings, a = st.act, i;
    var active = st.type === 'active';
    els.pbox.className = '';
    UI.clear(els.secondary);
    UI.clear(els.nextCard);
    /* color de la actividad: fondo suave, halo del pictograma y subrayado del título */
    var acc = (a && a.color) ? a.color : '#7d8aa3', rs = document.documentElement.style;
    rs.setProperty('--acc', acc); rs.setProperty('--acc-soft', HV.hexToRgba(acc, 0.22)); rs.setProperty('--acc-bg', HV.hexToRgba(acc, 0.1));
    var dd = new Date(st.dayKey.replace(/-/g, '/') + ' 12:00');
    text(els.dayName, HV.dayName(st.dow)); text(els.dayDate, dd.getDate() + ' de ' + MONTHS[dd.getMonth()]);
    show(els.coverClip, active);
    show(els.pbar, active && s.showProgressBar && s.showInfoBar);
    show(els.info, s.showInfoBar || !active); /* en pantallas de espera se muestra siempre: dice qué viene */
    show(els.marks, active && s.showMarks && s.milestones !== 'none');
    firedMarks = {};
    lastProg = -1;
    lastActId = a ? a.id : '';

    if (active) {
      text(els.actName, a.name);
      text(els.subtitle, '');
      els.pimg.src = HV.pictoSrc(cfg, a.pictoId);
      /* La cobertura se recorta con la silueta del propio pictograma (canal alfa). */
      var mk = 'url("' + els.pimg.src.replace(/"/g, '%22') + '")';
      els.coverClip.style.webkitMaskImage = mk; els.coverClip.style.maskImage = mk;
      els.pimg.alt = a.name;
      text(els.times, timesText(a));
      text(els.counterLabel, 'Quedan');
      (a.secondary || []).forEach(function (sx) {
        els.secondary.appendChild(h('div', { 'class': 'sec-item' }, [
          h('img', { src: HV.pictoSrc(cfg, sx.pictoId), alt: '' }),
          sx.label ? h('span', { text: sx.label }) : null
        ]));
      });
      els.secondary.className = 'secondary n' + Math.min((a.secondary || []).length, 7);
    } else {
      els.secondary.className = 'secondary n0';
      var after = st.type === 'after' || st.type === 'weekend' || st.type === 'empty';
      els.pimg.src = HV.pictoSrc(cfg, after ? 'b-fin' : 'b-espera');
      els.pimg.alt = '';
      text(els.times, '');
      if (st.type === 'before') { text(els.actName, 'Todavía no empezamos'); text(els.subtitle, 'La primera actividad será a las ' + st.next.start); text(els.counterLabel, 'Falta'); }
      else if (st.type === 'gap') { text(els.actName, 'Un momento de espera'); text(els.subtitle, 'Enseguida empieza la siguiente actividad'); text(els.counterLabel, 'Falta'); }
      else if (st.type === 'weekend') { text(els.actName, '¡Buen fin de semana!'); text(els.subtitle, ''); text(els.counterLabel, ''); }
      else if (st.type === 'after') { text(els.actName, '¡Hemos terminado por hoy!'); text(els.subtitle, ''); text(els.counterLabel, ''); }
      else { text(els.actName, 'Hoy no hay actividades'); text(els.subtitle, ''); text(els.counterLabel, ''); }
    }

    /* "Después": siguiente actividad */
    var nx = active || st.type === 'before' || st.type === 'gap' ? st.next : null;
    var nxLabel = 'Después';
    if (!nx && st.nextDay && st.nextDay.act) {
      nx = st.nextDay.act;
      nxLabel = st.nextDay.offset === 1 ? 'Mañana' : HV.dayName(st.nextDay.dow);
    }
    if (st.type === 'before') { nxLabel = 'Primero'; }
    if (nx) {
      els.nextCard.appendChild(h('div', { 'class': 'next-label', text: nxLabel }));
      els.nextCard.appendChild(h('img', { src: HV.pictoSrc(cfg, nx.pictoId), alt: '' }));
      els.nextCard.appendChild(h('div', { 'class': 'next-name', text: nx.name }));
      if (cfg.settings.showTimes) { els.nextCard.appendChild(h('div', { 'class': 'next-time', text: nx.start })); }
      show(els.nextCard, true);
    } else { show(els.nextCard, false); }

    buildSide(st);
    layout();
  }

  function buildSide(st) {
    var key = st.dayKey + '|' + cfgVersion;
    if (key === sideKey) { return; }
    sideKey = key; lastSideCurrent = -2;
    UI.clear(els.sideList);
    var s = cfg.settings;
    st.list.forEach(function (a) {
      els.sideList.appendChild(h('div', { 'class': 'side-item pending', 'data-id': a.id, style: a.color ? '--ic:' + a.color : '' }, [
        h('img', { src: HV.pictoSrc(cfg, a.pictoId), alt: '' }),
        h('div', { 'class': 'side-text' }, [
          h('div', { 'class': 'side-name', text: a.name }),
          s.showTimes ? h('div', { 'class': 'side-time', text: a.start + ' – ' + a.end }) : null
        ]),
        h('div', { 'class': 'side-check', text: '✓' })
      ]));
    });
    if (!st.list.length) { els.sideList.appendChild(h('div', { 'class': 'side-empty', text: 'Sin actividades' })); }
  }

  /* Parte dinámica: se ejecuta cada segundo. */
  function update(st, instant) {
    var s = cfg.settings;
    var active = st.type === 'active';

    if (active) {
      var p = st.progress, dur = st.endSec - st.startSec;
      /* Objetivo visual = lo que marcará el reloj dentro de 1 s (interpolación). */
      var target = instant ? p : Math.min(1, (st.secs + 1 - st.startSec) / dur);
      var tr = (instant || reduceMotion) ? 'none' : 'transform 1s linear';
      setTr(els.cover, tr);
      setT(els.cover, 'translateY(' + (-(1 - target) * 100) + '%)');
      if (s.showProgressBar) {
        setTr(els.pbarFill, tr);
        setT(els.pbarFill, 'scaleX(' + target + ')');
      }
      if (instant) { void els.cover.offsetHeight; } /* fuerza aplicar sin animar */
      text(els.counter, HV.fmtCountdown(st.remaining, false));
      updateMarks(st, p, instant);
      lastProg = p;
    } else if (st.toNext !== undefined) {
      text(els.counter, HV.fmtCountdown(st.toNext, true));
    } else {
      text(els.counter, '');
    }
    show(els.counterWrap, s.showCounter && (active || st.toNext !== undefined));
    updateSide(st);
  }

  function updateMarks(st, p, instant) {
    if (!(cfg.settings.showMarks && cfg.settings.milestones !== 'none')) { return; }
    var reached = HV.reachedMarks(p), nodes = els.marks.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], m = HV.MARKS[i], isOn = reached[i];
      var wasOn = /(^| )passed( |$)/.test(node.className);
      if (isOn !== wasOn) { node.className = 'mark' + (isOn ? ' passed' : ''); }
      /* Efecto: solo la primera vez que se cruza, en tiempo real (no al reanudar). */
      var fk = st.dayKey + '|' + st.act.id + '|' + m;
      if (isOn) {
        if (!firedMarks[fk]) {
          firedMarks[fk] = true;
          if (!instant && lastProg >= 0 && lastProg * 100 < m && cfg.settings.milestoneEffect && !reduceMotion && cfg.settings.transitions) {
            pulse(node);
          }
        }
      }
    }
  }
  function pulse(node) {
    node.className = 'mark passed hit';
    setTimeout(function () { node.className = 'mark passed'; }, 2200);
  }

  function updateSide(st) {
    var items = els.sideList.childNodes, curIdx = -1, doneAll = false;
    var s = cfg.settings;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], a = st.list[i];
      if (!a) { continue; }
      var e = HV.parseTime(a.end) * 60, sSec = HV.parseTime(a.start) * 60, cls;
      if (st.secs >= e) { cls = 'done'; }
      else if (st.type === 'active' && st.act.id === a.id) { cls = 'current'; curIdx = i; }
      else { cls = 'pending'; }
      var full = 'side-item ' + cls;
      if (!s.showFullSidebar) {
        var isNext = st.next && st.next.id === a.id;
        if (cls !== 'current' && !isNext) { full += ' hidden'; }
      }
      if (it.className !== full) { it.className = full; }
    }
    if (curIdx !== lastSideCurrent) {
      lastSideCurrent = curIdx;
      if (curIdx >= 0) {
        var node = items[curIdx];
        els.sideScroll.scrollTop = Math.max(0, node.offsetTop - (els.sideScroll.clientHeight - node.offsetHeight) / 2);
      }
    }
  }

  HV.kiosk = {
    start: function (config) {
      init();
      this.setConfig(config);
      schedule();
    },
    setConfig: function (config) {
      cfg = config; cfgVersion++; curKey = ''; sideKey = ''; switching = false;
      applySettings();
      render({ instant: true });
    },
    getConfig: function () { return cfg; },
    render: function () { render({ instant: true }); },
    setClock: function (fn) { clock = fn; },
    relayout: function () { layout(); render({ instant: true }); },
    setWarning: function (msg) { show(els.warn, !!msg); els.warn.setAttribute('title', msg || ''); els.warn.setAttribute('data-msg', msg || ''); }
  };
})();
