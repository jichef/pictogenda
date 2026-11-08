/*
 * admin.js — Panel de administración (Horarios, Pictogramas, Apariencia, Datos).
 * Trabaja sobre un borrador (draft); nada se guarda hasta pulsar "Guardar".
 */
(function () {
  'use strict';
  var HV = window.HV, UI = HV.ui, h = UI.h;
  var root, draft, saved, tab = 'schedule', day = 1, uploadedIds = [], valBox, dirtyBadge, body;
  var SWATCHES = ['#e8505b', '#f4a261', '#e9c46a', '#5a9e3a', '#2a9d8f', '#3d8bd9', '#6c63c7', '#d6609b'];
  var COVERS = ['#3d5a80', '#5c6b7a', '#6c63c7', '#2a6f6b', '#7a4e3a', '#222a36'];

  function cfgString(c) { var x = HV.clone(c); x.savedAt = ''; return JSON.stringify(x); }
  function isDirty() { return cfgString(draft) !== cfgString(saved); }
  function editKey() { return draft.sameEveryDay && day <= 5 ? 1 : day; }
  function acts() { return draft.days[editKey()]; }
  function btn(label, fn, cls, extra) {
    var p = { 'class': 'btn ' + (cls || ''), type: 'button', text: label, onclick: fn };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) { p[k] = extra[k]; } } }
    return h('button', p);
  }
  function usedKeys() { return draft.sameEveryDay ? [1, 6, 7] : [1, 2, 3, 4, 5, 6, 7]; }
  function keyLabel(k) { return draft.sameEveryDay && k === 1 ? 'Lunes a viernes' : HV.DAYS[k - 1].name; }
  function dayTabs() { return HV.DAYS.filter(function (d) { return !draft.sameEveryDay || d.n === 1 || d.n >= 6; }).map(function (d) { return { n: d.n, name: keyLabel(d.n) }; }); }
  function validateAll() {
    var errors = [], warnings = [];
    usedKeys().forEach(function (k) {
      var r = HV.validateDay(draft.days[k].map(function (x) { return HV.resolveAct(draft, x); })), label = keyLabel(k);
      r.errors.forEach(function (m) { errors.push(label + ': ' + m); });
      r.warnings.forEach(function (m) { warnings.push(label + ': ' + m); });
    });
    return { errors: errors, warnings: warnings };
  }
  function refreshStatus() {
    if (dirtyBadge) { dirtyBadge.textContent = isDirty() ? '● Sin guardar' : '✓ Guardado'; dirtyBadge.className = 'dirty ' + (isDirty() ? 'yes' : 'no'); }
    if (valBox) {
      UI.clear(valBox);
      var r = validateAll();
      r.errors.forEach(function (m) { valBox.appendChild(h('div', { 'class': 'msg err', text: '✖ ' + m })); });
      r.warnings.forEach(function (m) { valBox.appendChild(h('div', { 'class': 'msg warn', text: '⚠ ' + m })); });
      if (!r.errors.length && !r.warnings.length) { valBox.appendChild(h('div', { 'class': 'msg ok', text: '✓ Horario correcto' })); }
      valBox.style.display = (tab === 'schedule') ? '' : 'none';
    }
  }

  /* ---------- estructura ---------- */
  function open(cfg) {
    saved = HV.clone(cfg); draft = HV.clone(cfg); uploadedIds = []; tab = 'schedule'; day = 1;
    root = document.getElementById('adminRoot');
    root.style.display = 'block';
    render();
  }
  function closeAdmin() {
    /* Descarta imágenes subidas que no llegaron a guardarse. */
    var keep = HV.imageIds(saved);
    uploadedIds.forEach(function (id) { if (keep.indexOf(id) < 0) { HV.store.deleteImage(id); } });
    root.style.display = 'none'; UI.clear(root);
    HV.app.onAdminClosed();
  }
  function exit() {
    if (isDirty() && !window.confirm('Hay cambios sin guardar. ¿Salir y descartarlos?')) { return; }
    closeAdmin();
  }

  function render() {
    UI.clear(root);
    dirtyBadge = h('span', { 'class': 'dirty' });
    var tabs = [['schedule', 'Horarios'], ['subjects', 'Asignaturas'], ['pictos', 'Pictogramas'], ['look', 'Apariencia'], ['data', 'Datos y copias']];
    var head = h('div', { 'class': 'adm-head' }, [
      h('div', { 'class': 'adm-title', text: 'Ajustes' }),
      h('div', { 'class': 'adm-tabs' }, tabs.map(function (t) {
        return btn(t[1], function () { tab = t[0]; render(); }, 'tab' + (tab === t[0] ? ' on' : ''));
      })),
      h('div', { 'class': 'adm-spacer' }),
      dirtyBadge,
      btn('Vista previa', startPreview, ''),
      btn('Guardar', save, 'primary'),
      btn('Salir', exit, '')
    ]);
    valBox = h('div', { 'class': 'val-box' });
    body = h('div', { 'class': 'adm-body scrollable' });
    root.appendChild(head); root.appendChild(valBox); root.appendChild(body);
    ({ schedule: renderSchedule, subjects: renderSubjects, pictos: renderPictos, look: renderLook, data: renderData })[tab]();
    refreshStatus();
  }

  /* ---------- Vista previa ----------
   * Muestra el kiosco con el BORRADOR actual (aunque no esté guardado) y un reloj simulado.
   * No guarda nada; al salir se restaura la configuración real. */
  function startPreview() {
    var pcfg = HV.migrate(draft), real = HV.kiosk.getConfig(), d;
    for (d = 1; d <= 7; d++) { pcfg.days[d] = HV.sortDay(pcfg.days[d]); }
    var dow = new Date().getDay();
    var base = 9 * 3600, t0 = Date.now(), speed = 0, timer;
    function cur() { return Math.min(86399, base + (speed ? (Date.now() - t0) / 1000 * speed : 0)); }
    function mkDate() {
      var s = cur(), x = new Date(2026, 10, 8 + dow, 0, 0, 0, 0); /* 9-nov-2026 es lunes */
      x.setHours(Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60), Math.floor((s % 1) * 1000));
      return x;
    }
    function setTime(sec) { base = Math.max(0, Math.min(86399, sec)); t0 = Date.now(); sync(); HV.kiosk.render(); }
    var slider = h('input', { type: 'range', min: '0', max: '1439', step: '1', value: String(Math.floor(base / 60)), 'class': 'pv-slider',
      oninput: function () { setTime(parseInt(this.value, 10) * 60); } });
    var label = h('strong', { 'class': 'pv-time' });
    function sync() {
      var s = Math.floor(cur());
      label.textContent = HV.pad(Math.floor(s / 3600)) + ':' + HV.pad(Math.floor((s % 3600) / 60)) + ':' + HV.pad(s % 60);
      slider.value = String(Math.floor(s / 60));
    }
    var daySel = h('select', { onchange: function () { dow = parseInt(this.value, 10); HV.kiosk.render(); } },
      HV.DAYS.map(function (x) { return h('option', { value: String(x.n % 7), text: x.name, selected: x.n % 7 === dow }); }));
    var speedSel = h('select', { onchange: function () { var s = cur(); speed = parseInt(this.value, 10); base = s; t0 = Date.now(); } }, [
      ['0', 'Pausa'], ['1', '×1 (tiempo real)'], ['10', '×10'], ['60', '×60 (1 min/s)'], ['300', '×300']
    ].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    function jump(frac) {
      var st = HV.getState(pcfg, mkDate()), a = st.act;
      if (!a) { var l = HV.scheduleFor(pcfg, dow); if (!l.length) { return; } a = l[0]; }
      var s = HV.parseTime(a.start) * 60, e = HV.parseTime(a.end) * 60;
      setTime(s + (e - s) * frac - 8);
    }
    var bar = h('div', { 'class': 'pv-bar' }, [
      h('div', { 'class': 'pv-row' }, [h('span', { 'class': 'pv-badge', text: 'VISTA PREVIA' }), daySel, label, speedSel,
        btn('Salir de la vista previa', exitPreview, 'primary')]),
      h('div', { 'class': 'pv-row' }, [slider]),
      h('div', { 'class': 'pv-row' }, [
        btn('Inicio actividad', function () { jump(0); }, ''), btn('Antes del 25 %', function () { jump(0.25); }, ''),
        btn('Antes del 50 %', function () { jump(0.5); }, ''), btn('Antes del 75 %', function () { jump(0.75); }, ''),
        btn('Antes del final', function () { jump(1); }, '')
      ])
    ]);
    function exitPreview() {
      clearInterval(timer);
      HV.kiosk.setClock(null); HV.kiosk.setConfig(real);
      if (bar.parentNode) { bar.parentNode.removeChild(bar); }
      document.getElementById('app').style.bottom = '';
      HV.kiosk.relayout();
      root.style.display = 'block';
    }
    root.style.display = 'none';
    document.body.appendChild(bar);
    document.getElementById('app').style.bottom = bar.offsetHeight + 'px';
    HV.kiosk.setClock(mkDate);
    HV.kiosk.setConfig(pcfg);
    HV.kiosk.relayout();
    sync();
    timer = setInterval(sync, 500);
  }

  function save() {
    var r = validateAll();
    if (r.errors.length) { window.alert('No se puede guardar. Corrige primero:\n\n- ' + r.errors.join('\n- ')); return; }
    if (r.warnings.length && !window.confirm('Hay huecos horarios sin actividad (se mostrará una pantalla de espera):\n\n- ' + r.warnings.join('\n- ') + '\n\n¿Guardar igualmente?')) { return; }
    var next = HV.clone(draft);
    for (var d = 1; d <= 7; d++) { next.days[d] = HV.sortDay(next.days[d]); } /* orden cronológico; no se tocan las horas */
    HV.store.save(next).then(function (res) {
      if (!res.ok) { window.alert('⚠ No se ha podido guardar en este dispositivo (almacenamiento bloqueado o lleno). Los cambios solo durarán mientras la app siga abierta. Exporta una copia en "Datos y copias".'); }
      else if (!res.ls || !res.idb) { UI.toast('Guardado, pero solo en ' + (res.ls ? 'localStorage' : 'IndexedDB') + ' (el otro almacén falló).', 'warn'); }
      else { UI.toast('Guardado y verificado ✓', 'ok'); }
      /* borra imágenes de pictogramas eliminados */
      var keepIds = HV.imageIds(res.cfg);
      HV.imageIds(saved).forEach(function (iid) { if (keepIds.indexOf(iid) < 0) { HV.store.deleteImage(iid); } });
      saved = HV.clone(res.cfg); draft = HV.clone(res.cfg); uploadedIds = [];
      HV.app.applyConfig(res.cfg, res);
      render();
    }, function (err) { window.alert(err.message); });
  }

  /* ---------- A. Horarios ---------- */
  function renderSchedule() {
    var same = h('input', { type: 'checkbox', checked: draft.sameEveryDay, onchange: function () {
      if (this.checked) {
        if (!window.confirm('Se usará el horario del LUNES para todos los días. Los horarios de martes a viernes se conservan, pero no se usarán mientras esta opción esté activa.')) { this.checked = false; return; }
      }
      draft.sameEveryDay = this.checked; render();
    } });
    body.appendChild(h('label', { 'class': 'check big' }, [same, ' Usar el mismo horario de lunes a viernes']));

    if (draft.sameEveryDay && day >= 2 && day <= 5) { day = 1; }
    {
      var tabs = dayTabs();
      body.appendChild(h('div', { 'class': 'daytabs' }, tabs.map(function (d) {
        return btn(d.name, function () { day = d.n; render(); }, 'tab' + (day === d.n ? ' on' : ''));
      })));
      var sel = h('select', { id: 'copyTarget' }, [h('option', { value: '0', text: 'Copiar este día a…' })]
        .concat(tabs.filter(function (d) { return d.n !== editKey(); }).map(function (d) { return h('option', { value: String(d.n), text: d.name }); }))
        .concat([h('option', { value: 'all', text: 'Todos los demás días' })]));
      body.appendChild(h('div', { 'class': 'row' }, [sel, btn('Copiar', function () {
        var v = sel.value; if (v === '0') { return; }
        var targets = v === 'all' ? tabs.map(function (t) { return t.n; }).filter(function (n) { return n !== editKey(); }) : [parseInt(v, 10)];
        var names = targets.map(keyLabel).join(', ');
        if (!window.confirm('Se SUSTITUIRÁ el horario de: ' + names + '.\n¿Continuar?')) { return; }
        targets.forEach(function (n) {
          draft.days[n] = HV.clone(draft.days[editKey()]).map(function (a) { a.id = HV.uid(); return a; });
        });
        UI.toast('Horario copiado (recuerda guardar)', 'ok'); render();
      }, '')]));
    }

    var list = acts();
    list.forEach(function (a, i) { body.appendChild(entryCard(list, a, i, 'act')); });
    if (!list.length) { body.appendChild(h('p', { 'class': 'hint', text: 'No hay actividades. Pulsa «Añadir actividad».' })); }
    body.appendChild(btn('+ Añadir actividad', function () {
      var last = HV.sortDay(list).filter(function (x) { return isFinite(HV.parseTime(x.end)); }).pop();
      var s = last ? HV.parseTime(last.end) : 9 * 60, e = Math.min(s + 60, 23 * 60 + 59);
      list.push({ id: HV.uid(), name: 'Nueva actividad', start: HV.formatTime(s), end: HV.formatTime(e), pictoId: 'b-cuaderno', color: '', secondary: [] });
      render();
    }, 'add'));
  }

  /* Intercambia dos actividades contiguas conservando duraciones y el hueco entre ellas. */
  function moveAct(list, i, dir) {
    var j = i + dir; if (j < 0 || j >= list.length) { return; }
    var A = list[Math.min(i, j)], B = list[Math.max(i, j)];
    var as = HV.parseTime(A.start), ae = HV.parseTime(A.end), bs = HV.parseTime(B.start), be = HV.parseTime(B.end);
    if ([as, ae, bs, be].every(isFinite) && ae > as && be > bs && bs >= ae) {
      var dA = ae - as, dB = be - bs, gap = bs - ae;
      B.start = HV.formatTime(as); B.end = HV.formatTime(as + dB);
      A.start = HV.formatTime(as + dB + gap); A.end = HV.formatTime(as + dB + gap + dA);
    }
    var t = list[i]; list[i] = list[j]; list[j] = t;
    render();
  }

  /* Tarjeta de actividad (mode 'act') o de asignatura (mode 'subject'). */
  function entryCard(list, a, i, mode) {
    var isSub = mode === 'subject';
    var sb = (!isSub && a.subjectId) ? HV.findSubject(draft, a.subjectId) : null;
    var view = sb || a;
    var card = h('div', { 'class': 'card act', style: 'border-left-color:' + (view.color || '#c9d3e4') });
    var thumb = sb
      ? h('div', { 'class': 'thumb static' }, h('img', { src: HV.pictoSrc(draft, view.pictoId), alt: '' }))
      : h('button', { 'class': 'thumb', type: 'button', onclick: function () {
        pick(function (id) { a.pictoId = id; render(); }, a.pictoId);
      } }, [h('img', { src: HV.pictoSrc(draft, a.pictoId), alt: '' }), h('span', { text: 'Cambiar imagen' })]);
    var name = sb
      ? h('div', { 'class': 'name-ro', text: view.name || '(sin nombre)' })
      : h('input', { type: 'text', value: a.name, 'class': 'in-name', placeholder: isSub ? 'Nombre de la asignatura' : 'Nombre', oninput: function () { a.name = this.value; refreshStatus(); } });
    function timeIn(field) {
      return h('input', { type: 'time', value: a[field], 'class': 'in-time', onchange: function () { a[field] = this.value; refreshStatus(); }, oninput: function () { a[field] = this.value; refreshStatus(); } });
    }
    var colors = h('div', { 'class': 'swatches' }, [
      h('button', { 'class': 'sw none' + (!a.color ? ' on' : ''), type: 'button', text: '∅', title: 'Sin color', onclick: function () { a.color = ''; render(); } })
    ].concat(SWATCHES.map(function (c) {
      return h('button', { 'class': 'sw' + (a.color === c ? ' on' : ''), type: 'button', style: 'background:' + c, onclick: function () { a.color = c; render(); } });
    })));
    var subjSel = null;
    if (!isSub && draft.subjects.length) {
      subjSel = h('select', { 'class': 'in-subject', onchange: function () {
        var v = this.value;
        if (!v) { a.subjectId = ''; }
        else { var s = HV.findSubject(draft, v); a.subjectId = v; a.name = s.name; a.pictoId = s.pictoId; a.color = s.color; a.secondary = HV.clone(s.secondary); }
        render();
      } }, [h('option', { value: '', text: 'Asignatura: ninguna (personalizada)', selected: !a.subjectId })].concat(draft.subjects.map(function (s) {
        return h('option', { value: s.id, text: 'Asignatura: ' + (s.name || '(sin nombre)'), selected: a.subjectId === s.id });
      })));
    }
    function swap(d) { var j = i + d; if (j < 0 || j >= list.length) { return; } var t = list[i]; list[i] = list[j]; list[j] = t; render(); }
    var tools = h('div', { 'class': 'tools' }, [
      btn('▲', function () { if (isSub) { swap(-1); } else { moveAct(list, i, -1); } }, 'sq', { disabled: i === 0, 'aria-label': 'Subir' }),
      btn('▼', function () { if (isSub) { swap(1); } else { moveAct(list, i, 1); } }, 'sq', { disabled: i === list.length - 1, 'aria-label': 'Bajar' }),
      btn('Duplicar', function () {
        var c = HV.clone(a); c.id = HV.uid(); c.name = a.name + ' (copia)'; list.splice(i + 1, 0, c); render();
      }, ''),
      btn('Eliminar', function () {
        if (!window.confirm('¿Eliminar «' + (a.name || (isSub ? 'asignatura' : 'actividad')) + '»?')) { return; }
        if (isSub) { /* las actividades que la usaban conservan su aspecto actual */
          for (var d = 1; d <= 7; d++) {
            draft.days[d].forEach(function (x) {
              if (x.subjectId === a.id) { x.subjectId = ''; x.name = a.name; x.pictoId = a.pictoId; x.color = a.color; x.secondary = HV.clone(a.secondary); }
            });
          }
        }
        list.splice(i, 1); render();
      }, 'danger')
    ]);
    var fields = [subjSel, name];
    if (!isSub) { fields.push(h('div', { 'class': 'row' }, [h('label', { text: 'Inicio ' }, timeIn('start')), h('label', { text: 'Fin ' }, timeIn('end'))])); }
    if (sb) { fields.push(btn('Editar esta asignatura…', function () { tab = 'subjects'; render(); }, 'ghost')); }
    else { fields.push(colors); }
    if (!isSub && !sb) { /* aviso: actividad suelta con el nombre de una asignatura existente */
      var nm = String(a.name).trim().toLowerCase(), twin = null;
      if (nm) { draft.subjects.forEach(function (s) { if (!twin && s.name.trim().toLowerCase() === nm) { twin = s; } }); }
      if (twin) {
        fields.push(h('div', { 'class': 'hint' }, [
          'Existe la asignatura «' + twin.name + '» pero esta actividad no está vinculada; puede verse distinto. ',
          btn('Vincular', function () {
            a.subjectId = twin.id; a.name = twin.name; a.pictoId = twin.pictoId; a.color = twin.color; a.secondary = HV.clone(twin.secondary); render();
          }, 'ghost')
        ]));
      }
    }
    card.appendChild(h('div', { 'class': 'act-main' }, [thumb, h('div', { 'class': 'act-fields' }, fields), tools]));

    /* pictogramas secundarios */
    if (sb) {
      if (sb.secondary.length) {
        card.appendChild(h('div', { 'class': 'sec-edit' }, [
          h('div', { 'class': 'sec-title', text: 'Pictogramas secundarios (de la asignatura)' }),
          h('div', { 'class': 'sec-ro' }, sb.secondary.map(function (sx) {
            return h('div', { 'class': 'sec-ro-item' }, [h('img', { src: HV.pictoSrc(draft, sx.pictoId), alt: '' }), h('span', { text: sx.label })]);
          }))
        ]));
      }
      return card;
    }
    var sec = h('div', { 'class': 'sec-edit' }, [h('div', { 'class': 'sec-title', text: 'Pictogramas secundarios (informativos)' })]);
    a.secondary.forEach(function (sx, k) {
      sec.appendChild(h('div', { 'class': 'sec-row' }, [
        h('button', { 'class': 'mini', type: 'button', onclick: function () { pick(function (id) { sx.pictoId = id; render(); }, sx.pictoId); } },
          h('img', { src: HV.pictoSrc(draft, sx.pictoId), alt: '' })),
        h('input', { type: 'text', value: sx.label, placeholder: 'Texto (opcional)', oninput: function () { sx.label = this.value; refreshStatus(); } }),
        btn('▲', function () { if (k > 0) { var t = a.secondary[k - 1]; a.secondary[k - 1] = sx; a.secondary[k] = t; render(); } }, 'sq', { disabled: k === 0, 'aria-label': 'Subir' }),
        btn('▼', function () { if (k < a.secondary.length - 1) { var t = a.secondary[k + 1]; a.secondary[k + 1] = sx; a.secondary[k] = t; render(); } }, 'sq', { disabled: k === a.secondary.length - 1, 'aria-label': 'Bajar' }),
        btn('✕', function () { a.secondary.splice(k, 1); render(); }, 'sq danger', { 'aria-label': 'Quitar' })
      ]));
    });
    sec.appendChild(btn('+ Añadir pictograma secundario', function () {
      pick(function (id) { a.secondary.push({ pictoId: id, label: HV.pictoName(draft, id) }); render(); });
    }, ''));
    card.appendChild(sec);
    return card;
  }

  /* ---------- Asignaturas ---------- */
  function renderSubjects() {
    body.appendChild(h('p', { 'class': 'hint', text: 'Define cada asignatura una sola vez (imagen, color y pictogramas secundarios) y úsala en cualquier franja de cualquier día. Si la cambias aquí, cambia en todos los días.' }));
    var list = draft.subjects;
    list.forEach(function (s, i) { body.appendChild(entryCard(list, s, i, 'subject')); });
    if (!list.length) { body.appendChild(h('p', { 'class': 'hint', text: 'Todavía no hay asignaturas.' })); }
    body.appendChild(btn('+ Añadir asignatura', function () {
      list.push({ id: 's' + HV.uid(), name: 'Nueva asignatura', pictoId: 'b-cuaderno', color: '', secondary: [] }); render();
    }, 'add'));
    var loose = 0, d;
    for (d = 1; d <= 7; d++) { draft.days[d].forEach(function (x) { if (!x.subjectId && String(x.name).replace(/\s/g, '')) { loose++; } }); }
    if (loose) {
      body.appendChild(btn('Crear asignaturas a partir de mis ' + loose + ' actividades', function () {
        if (!window.confirm('Se creará una asignatura por cada nombre distinto y se enlazarán las actividades (conservan su aspecto actual). ¿Continuar?')) { return; }
        var byName = {};
        list.forEach(function (s) { byName[s.name.trim().toLowerCase()] = s; });
        for (var dd = 1; dd <= 7; dd++) {
          draft.days[dd].forEach(function (x) {
            var k = String(x.name).trim().toLowerCase();
            if (x.subjectId || !k) { return; }
            if (!byName[k]) { byName[k] = { id: 's' + HV.uid(), name: x.name.trim(), pictoId: x.pictoId, color: x.color, secondary: HV.clone(x.secondary) }; list.push(byName[k]); }
            x.subjectId = byName[k].id;
          });
        }
        render();
      }, 'ghost'));
    }
  }

  /* ---------- B. Pictogramas ---------- */
  function renderPictos() {
    body.appendChild(h('p', { 'class': 'hint', text: 'Las imágenes que subas se reducen (máx. 400 px) y se guardan solo en este iPad. Formatos: JPG, PNG (WebP solo si el iPad lo abre).' }));
    var file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: function () {
      var files = Array.prototype.slice.call(this.files || []); this.value = '';
      uploadFiles(files, render);
    } });
    file.multiple = true; /* varias imágenes a la vez */
    body.appendChild(file);
    body.appendChild(btn('+ Subir imágenes', function () { file.click(); }, 'primary big'));

    body.appendChild(h('h3', { text: 'Mis imágenes' }));
    var mine = h('div', { 'class': 'lib-grid' });
    draft.customPictos.forEach(function (p) {
      var usedIn = countUse(p.id);
      mine.appendChild(h('div', { 'class': 'lib-item' }, [
        h('img', { src: HV.pictoSrc(draft, p.id), alt: '' }),
        h('input', { type: 'text', value: p.name, oninput: function () { p.name = this.value; refreshStatus(); } }),
        h('small', { text: usedIn ? 'En uso: ' + usedIn : 'Sin usar' }),
        btn('Eliminar', function () {
          if (usedIn && !window.confirm('Esta imagen se usa en ' + usedIn + ' sitio(s). Si la eliminas, esas actividades mostrarán un recuadro vacío hasta que elijas otra. ¿Eliminar?')) { return; }
          draft.customPictos = draft.customPictos.filter(function (q) { return q.id !== p.id; }); render();
        }, 'danger')
      ]));
    });
    if (!draft.customPictos.length) { mine.appendChild(h('p', { 'class': 'hint', text: 'Todavía no has subido ninguna.' })); }
    body.appendChild(mine);

    body.appendChild(h('h3', { text: 'Incorporados (puedes cambiar su imagen o nombre)' }));
    var built = h('div', { 'class': 'lib-grid' });
    HV.BUILTIN_PICTOS.forEach(function (p) { built.appendChild(builtinItem(p)); });
    body.appendChild(built);
  }
  /* Procesa varias imágenes seguidas (reducción + guardado). done() al terminar. */
  function uploadFiles(files, done) {
    var total = files.length, okc = 0;
    if (!total) { done(); return; }
    files.reduce(function (p, f, i) {
      return p.then(function () {
        return UI.processImage(f).then(function (data) {
          var id = 'c-' + HV.uid(), nm = f.name.replace(/.[^.]+$/, '').slice(0, 40);
          if (!nm || /^image\d*$/i.test(nm)) { nm = 'Imagen ' + (draft.customPictos.length + 1); } /* iOS nombra todas «image» */
          draft.customPictos.push({ id: id, name: nm });
          uploadedIds.push(id); okc++;
          return HV.store.saveImage(id, data).then(function (ok) { if (!ok) { UI.toast('Una imagen no se pudo guardar de forma permanente.', 'warn'); } });
        }, function (err) { UI.toast((f.name || 'Imagen ' + (i + 1)) + ': ' + err.message, 'warn'); });
      });
    }, Promise.resolve()).then(function () {
      UI.toast(okc + ' de ' + total + ' imagen(es) añadida(s)' + (okc ? ' · recuerda Guardar' : ''), okc ? 'ok' : 'warn');
      done();
    });
  }
  function pick(cb, current) { UI.pickPicto(draft, cb, current, uploadFiles); }

  /* Pictograma incorporado sustituible (imagen y/o nombre). Se guarda en cfg.overrides. */
  function builtinItem(p) {
    var ov = draft.overrides[p.id];
    var fin = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) { return; }
      UI.processImage(f).then(function (data) {
        var iid = 'o-' + p.id + '-' + HV.uid();
        return HV.store.saveImage(iid, data).then(function () {
          uploadedIds.push(iid);
          var o = draft.overrides[p.id] || { name: '', imageId: '' };
          o.imageId = iid; draft.overrides[p.id] = o; render();
        });
      }, function (err) { UI.toast(err.message, 'warn'); });
    } });
    var nameIn = h('input', { type: 'text', value: HV.pictoName(draft, p.id), oninput: function () {
      var v = this.value.trim(), o = draft.overrides[p.id] || { name: '', imageId: '' };
      o.name = (v === p.name) ? '' : v;
      if (!o.name && !o.imageId) { delete draft.overrides[p.id]; } else { draft.overrides[p.id] = o; }
      refreshStatus();
    } });
    return h('div', { 'class': 'lib-item' }, [
      h('img', { src: HV.pictoSrc(draft, p.id), alt: '' }), nameIn, fin,
      btn('Cambiar imagen', function () { fin.click(); }, ''),
      ov ? btn('Restaurar original', function () { delete draft.overrides[p.id]; render(); }, 'ghost') : null
    ]);
  }

  function countUse(id) {
    var n = 0;
    function cnt(x) { if (x.pictoId === id) { n++; } x.secondary.forEach(function (q) { if (q.pictoId === id) { n++; } }); }
    draft.subjects.forEach(cnt);
    for (var d = 1; d <= 7; d++) { draft.days[d].forEach(function (x) { if (!x.subjectId) { cnt(x); } }); }
    return n;
  }

  /* ---------- C. Apariencia ---------- */
  function renderLook() {
    var s = draft.settings;
    function toggle(key, label) {
      return h('label', { 'class': 'check' }, [h('input', { type: 'checkbox', checked: s[key], onchange: function () { s[key] = this.checked; refreshStatus(); preview(); } }), ' ' + label]);
    }
    var prev = h('div', { 'class': 'prev-box' }, [h('img', { src: HV.pictoSrc(draft, 'b-matematicas'), alt: '' }), h('div', { 'class': 'prev-cover' })]);
    function preview() {
      var c = prev.lastChild;
      c.style.background = HV.coverBackground(s.coverColor, s.coverOpacity);
    }
    var hex = h('input', { type: 'text', value: s.coverColor, maxlength: 7, 'class': 'in-hex', oninput: function () {
      if (/^#[0-9a-fA-F]{6}$/.test(this.value)) { s.coverColor = this.value; preview(); refreshStatus(); }
    } });
    body.appendChild(h('div', { 'class': 'card' }, [
      h('h3', { text: 'Cobertura del pictograma' }),
      h('div', { 'class': 'look-row' }, [
        prev,
        h('div', {}, [
          h('div', { 'class': 'swatches' }, COVERS.map(function (c) {
            return h('button', { 'class': 'sw', type: 'button', style: 'background:' + c, onclick: function () { s.coverColor = c; hex.value = c; preview(); refreshStatus(); } });
          })),
          h('label', {}, ['Color (#RRGGBB) ', hex]),
          h('label', {}, ['Opacidad ', h('input', { type: 'range', min: '0.1', max: '0.95', step: '0.05', value: String(s.coverOpacity), oninput: function () { s.coverOpacity = parseFloat(this.value); preview(); refreshStatus(); } })])
        ])
      ])
    ]));
    preview();
    body.appendChild(h('div', { 'class': 'card' }, [
      h('h3', { text: 'Hitos de progreso' }),
      toggle('showMarks', 'Mostrar líneas de referencia'),
      h('label', {}, ['Hitos ', h('select', { onchange: function () { s.milestones = this.value; refreshStatus(); } }, [
        h('option', { value: '25-50-75', text: '25 % · 50 % · 75 %', selected: s.milestones === '25-50-75' }),
        h('option', { value: 'none', text: 'Sin hitos', selected: s.milestones === 'none' })
      ])]),
      toggle('milestoneEffect', 'Efecto visual breve al alcanzar un hito')
    ]));
    body.appendChild(h('div', { 'class': 'card' }, [
      h('h3', { text: 'Pantalla' }),
      toggle('showInfoBar', 'Mostrar la barra inferior (horas, tiempo que queda, «Después» y progreso)'),
      h('p', { 'class': 'hint', text: 'Las opciones siguientes solo se ven si la barra inferior está activada.' }),
      toggle('showCounter', 'Mostrar el contador (minutos y segundos)'),
      toggle('showTimes', 'Mostrar las horas'),
      toggle('showProgressBar', 'Mostrar barra de progreso'),
      toggle('transitions', 'Activar transiciones'),
      toggle('showFullSidebar', 'Mostrar el horario lateral completo'),
      h('label', {}, ['Tamaño de los pictogramas ', h('select', { onchange: function () { s.pictoSize = this.value; refreshStatus(); } }, [
        h('option', { value: 'medium', text: 'Mediano', selected: s.pictoSize === 'medium' }),
        h('option', { value: 'large', text: 'Grande', selected: s.pictoSize === 'large' }),
        h('option', { value: 'xlarge', text: 'Muy grande', selected: s.pictoSize === 'xlarge' })
      ])])
    ]));
  }

  /* ---------- D. Datos y copias ---------- */
  function renderData() {
    var status = h('div', { 'class': 'card' }, [h('h3', { text: 'Estado del almacenamiento' }), h('p', { id: 'stState', text: 'Pulsa «Comprobar» para verificar.' })]);
    var when = saved.savedAt ? new Date(saved.savedAt).toLocaleString() : 'Nunca (se está usando la configuración inicial)';
    status.appendChild(h('p', {}, ['Último guardado: ', h('strong', { text: when })]));
    status.appendChild(btn('Comprobar almacenamiento', function () {
      var el = document.getElementById('stState'); el.textContent = 'Comprobando…';
      HV.store.verify(saved).then(function (r) {
        el.textContent = 'localStorage: ' + (r.ls ? 'OK' : 'NO DISPONIBLE') + ' · IndexedDB: ' + (r.idb ? 'OK' : 'NO DISPONIBLE') +
          ' · Copia local: ' + (r.hasLocal ? 'sí' : 'no') + ' · Copia interna: ' + (r.hasIdb ? 'sí' : 'no') +
          (r.hasLocal && r.hasIdb ? (r.match ? ' · Coinciden ✓' : ' · NO coinciden ⚠') : '') +
          (r.ls || r.idb ? '' : '  ⚠ Los cambios no se conservarán: exporta copias a menudo.');
      });
    }, ''));
    status.appendChild(h('p', { 'class': 'hint', text: 'Safari puede borrar los datos de una web si se queda sin espacio, si se limpian los datos del sitio o tras mucho tiempo sin usarla. Exporta una copia cuando termines de configurar.' }));
    body.appendChild(status);

    var ta = h('textarea', { id: 'jsonText', rows: '6', placeholder: 'Aquí aparece el texto de la copia, o pega uno para importar.' });
    var fileIn = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: 'display:none', onchange: function () {
      var f = this.files && this.files[0]; if (!f) { return; }
      var fr = new FileReader(); var self = this;
      fr.onload = function () { ta.value = fr.result; self.value = ''; doImport(); };
      fr.readAsText(f);
    } });
    function doImport() {
      var b;
      try { b = HV.store.parseBackup(ta.value); } catch (e) { window.alert(e.message + '\nNo se ha modificado nada.'); return; }
      var n = 0; for (var d = 1; d <= 7; d++) { n += b.cfg.days[d].length; }
      if (!window.confirm('⚠ SE SUSTITUIRÁ todo el horario, la apariencia y las imágenes actuales por la copia (' + n + ' actividades, ' + Object.keys(b.images).length + ' imágenes). Esta acción no se puede deshacer.\n\n¿Continuar?')) { return; }
      HV.store.applyBackup(b).then(function (res) {
        saved = HV.clone(res.cfg); draft = HV.clone(res.cfg); uploadedIds = [];
        HV.app.applyConfig(res.cfg, res); UI.toast(res.ok ? 'Copia importada ✓' : 'Importada, pero NO se pudo guardar', res.ok ? 'ok' : 'warn'); render();
      });
    }
    var outBox = h('div', { 'class': 'out-box' });
    body.appendChild(h('div', { 'class': 'card' }, [
      h('h3', { text: 'Copia de seguridad' }),
      h('div', { 'class': 'row' }, [
        btn('1. Preparar copia', function () { prepareExport(ta, outBox); }, 'primary'),
        btn('Importar desde archivo…', function () { fileIn.click(); }, ''),
        btn('Importar el texto de abajo', doImport, ''),
        btn('Comprobar el texto de abajo', function () { checkText(ta); }, 'ghost')
      ]),
      h('p', { 'class': 'hint', text: 'La copia incluye lo que ves ahora (también los cambios e imágenes aún sin guardar), pero pulsa Guardar para conservarlos en este iPad. Pulsa «1. Preparar copia»: se genera el archivo y después aparecen los botones para descargarlo, compartirlo o copiar el texto. Para importar, pega el texto en el cuadro y pulsa «Importar el texto de abajo».' }),
      outBox, fileIn, ta
    ]));
    body.appendChild(h('div', { 'class': 'card' }, [
      h('h3', { text: 'Restaurar configuración inicial' }),
      h('p', { 'class': 'hint', text: 'Vuelve al horario de ejemplo incluido en la aplicación y borra las imágenes subidas.' }),
      btn('Restaurar configuración inicial…', function () {
        if (!window.confirm('⚠ SE BORRARÁN tus horarios, apariencia e imágenes y se cargará la configuración inicial.\n¿Has exportado antes una copia?\n\n¿Restaurar de todos modos?')) { return; }
        HV.store.resetToDefault().then(function (res) {
          saved = HV.clone(res.cfg); draft = HV.clone(res.cfg); uploadedIds = [];
          HV.app.applyConfig(res.cfg, res); UI.toast('Configuración inicial restaurada', 'ok'); render();
        });
      }, 'danger')
    ]));
  }

  /* Lo que se exporta es el borrador actual (lo que se ve), con sus imágenes. */
  function currentForExport() {
    var c = HV.migrate(draft);
    for (var d = 1; d <= 7; d++) { c.days[d] = HV.sortDay(c.days[d]); }
    if (isDirty()) { UI.toast('La copia incluye cambios sin guardar.', 'warn'); }
    return c;
  }

  /* Paso 1: genera la copia. Paso 2: botones reales (cada uno actúa en su propio toque, como exige iOS). */
  function prepareExport(ta, box) {
    var text = JSON.stringify(HV.store.exportAll(currentForExport()), null, 1);
    var name = 'horario-visual-' + HV.dayKey(new Date()) + '.json';
    var kb = Math.max(1, Math.round(text.length / 1024));
    var expected = Object.keys(HV.store.parseBackup(text).images).length;
    ta.value = text; UI.clear(box);
    box.appendChild(h('p', { 'class': 'hint', text: 'Copia lista: ' + name + ' (' + kb + ' KB).' }));
    var row = h('div', { 'class': 'row' });
    var canBlob = window.Blob && window.URL && window.URL.createObjectURL;
    if (canBlob) {
      var url = window.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = h('a', { 'class': 'btn primary', href: url, text: 'Descargar archivo' });
      if ('download' in a) { a.setAttribute('download', name); } else { a.setAttribute('target', '_blank'); } /* iOS 12: se abre y se guarda con el botón Compartir de Safari */
      row.appendChild(a);
    }
    if (navigator.share) { row.appendChild(btn('Compartir…', function () { shareText(ta, text, name); }, '')); }
    row.appendChild(btn('Copiar texto', function () { copyText(ta); }, ''));
    row.appendChild(btn('Comprobar texto', function () { checkText(ta, expected); }, 'ghost'));
    box.appendChild(row);
    if (canBlob && !('download' in document.createElement('a'))) {
      box.appendChild(h('p', { 'class': 'hint', text: 'En este iPad «Descargar archivo» abre el contenido en otra pestaña: pulsa el botón Compartir de Safari y elige «Guardar en Archivos» o copia el texto.' }));
    }
  }

  /* Comprueba, sin importar nada, que el texto del cuadro es una copia completa. */
  function checkText(ta, expected) {
    var b, n = 0, d;
    try { b = HV.store.parseBackup(ta.value); } catch (e) { window.alert('El texto NO es una copia válida (¿está cortado?): ' + e.message); return; }
    for (d = 1; d <= 7; d++) { n += b.cfg.days[d].length; }
    var imgs = Object.keys(b.images).length;
    var ok = expected === undefined || imgs === expected;
    var msg = (ok ? 'Copia correcta ✓' : 'Copia INCOMPLETA ⚠') + '\n' + n + ' actividades, ' + b.cfg.subjects.length + ' asignaturas, ' + imgs + ' imágenes';
    msg += (expected === undefined ? '' : ' (esperadas ' + expected + ')') + '.\nNo se ha modificado nada.';
    window.alert(msg);
  }

  function exportFile(ta) {
    var text = JSON.stringify(HV.store.exportAll(currentForExport()), null, 1);
    var name = 'horario-visual-' + HV.dayKey(new Date()) + '.json';
    ta.value = text;
    try {
      var a = document.createElement('a');
      if ('download' in a && window.Blob && window.URL && window.URL.createObjectURL) {
        a.href = window.URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        UI.toast('Copia exportada: ' + name, 'ok');
      } else {
        /* iOS < 13: sin atributo download. Se ofrece la hoja de compartir (si existe) o copiar el texto. */
        shareText(ta, text, name);
      }
    } catch (e) { copyText(ta); }
  }
  function copyText(ta) {
    var ok = false;
    try { ta.focus(); ta.setSelectionRange(0, ta.value.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
    UI.toast(ok ? 'Texto copiado. Pégalo en Notas o en un correo y guárdalo.' : 'Mantén pulsado el cuadro › Seleccionar todo › Copiar.', ok ? 'ok' : 'warn');
  }
  function shareText(ta, text, name) {
    ta.value = text;
    if (navigator.share) {
      navigator.share({ title: name, text: text }).then(function () {}, function () { copyText(ta); });
    } else { copyText(ta); }
  }

  HV.admin = { open: open };
})();
