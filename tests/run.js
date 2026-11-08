/* Pruebas de la lógica (Node, sin dependencias). Uso: npm test */
var assert = require('assert');
var fs = require('fs'), path = require('path');
var HV = require('../public/js/core.js');
var def = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/default-config.json'), 'utf8'));
var cfg = HV.migrate(def);
var passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.log('FALLO ' + name + '\n      ' + e.message); process.exitCode = 1; } }
function at(y, m, d, hh, mm, ss, ms) { return new Date(y, m - 1, d, hh, mm || 0, ss || 0, ms || 0); }
var MON = [2026, 11, 9], SAT = [2026, 11, 14], SUN = [2026, 11, 15], FRI = [2026, 11, 13];
function st(day, hh, mm, ss) { return HV.getState(cfg, at(day[0], day[1], day[2], hh, mm, ss)); }
function near(a, b) { assert(Math.abs(a - b) < 1e-4, a + ' != ' + b); }

console.log('Estado y reloj');
t('1 actividad iniciada al abrir (09:00:00)', function () { var s = st(MON, 9, 0, 0); assert.equal(s.type, 'active'); assert.equal(s.act.id, 'mat'); near(s.progress, 0); });
t('2 mitad del intervalo = 50 %', function () { near(st(MON, 9, 30, 0).progress, 0.5); });
t('progreso exacto 10:15 de 60 min = 17,08 %', function () { var s = st(MON, 9, 10, 15); near(s.progress * 100, 17.0833); });
t('progreso 22:30 = 37,5 % y 43:00 = 71,67 %', function () { near(st(MON, 9, 22, 30).progress * 100, 37.5); near(st(MON, 9, 43, 0).progress * 100, 71.6667); });
t('progreso continuo: monótono segundo a segundo, sin saltos > 1/duración', function () {
  var prev = -1, maxStep = 0;
  for (var s = 0; s < 3600; s++) { var p = st(MON, 9, Math.floor(s / 60), s % 60).progress; if (prev >= 0) { maxStep = Math.max(maxStep, p - prev); assert(p >= prev); } prev = p; }
  assert(maxStep < 1 / 3600 + 1e-9, 'salto ' + maxStep);
});
t('3 cambio automático al terminar la franja', function () { assert.equal(st(MON, 9, 59, 59).act.id, 'mat'); var s = st(MON, 10, 0, 0); assert.equal(s.act.id, 'len'); near(s.progress, 0); });
t('4 salto directo tras reactivar (12:45 -> Inglés)', function () { var s = st(MON, 12, 45, 0); assert.equal(s.act.id, 'ing'); near(s.progress, 0.25); });
t('5 antes de empezar: próxima = primera', function () { var s = st(MON, 7, 30, 0); assert.equal(s.type, 'before'); assert.equal(s.next.id, 'mat'); near(s.toNext, 5400); });
t('6 después de terminar', function () { assert.equal(st(MON, 14, 0, 0).type, 'after'); assert.equal(st(MON, 18, 0, 0).type, 'after'); });
t('7 cambio de día', function () { assert.equal(HV.dayKey(at(2026, 11, 9, 23, 59)) !== HV.dayKey(at(2026, 11, 10, 0, 0)), true); assert.equal(st([2026, 11, 10], 0, 0, 0).type, 'before'); });
t('8 fin de semana y viernes -> lunes', function () {
  assert.equal(st(SAT, 10, 0, 0).type, 'weekend'); assert.equal(st(SUN, 10, 0, 0).type, 'weekend');
  var s = st(FRI, 15, 0, 0); assert.equal(s.type, 'after'); assert.equal(s.nextDay.dow, 1); assert.equal(s.nextDay.offset, 3);
  assert.equal(st(SAT, 10, 0, 0).nextDay.dow, 1);
});
t('sábado y domingo con horario propio (sin afectar a «mismo horario» L-V)', function () {
  var c = HV.clone(cfg); c.days[6] = [{ id: 's', name: 'Taller', start: '10:00', end: '12:00', pictoId: 'b-plastica', color: '', secondary: [] }];
  var s1 = HV.getState(c, at(2026, 11, 14, 11, 0, 0)); assert.equal(s1.type, 'active'); assert.equal(s1.act.id, 's'); near(s1.progress, 0.5);
  assert.equal(HV.getState(c, at(2026, 11, 15, 11, 0, 0)).type, 'weekend');           /* domingo vacío */
  assert.equal(HV.getState(c, at(2026, 11, 13, 9, 30, 0)).act.id, 'mat');              /* viernes usa L-V */
  assert.equal(HV.getState(c, at(2026, 11, 14, 13, 0, 0)).type, 'after');
  var s2 = HV.getState(c, at(2026, 11, 14, 8, 0, 0)); assert.equal(s2.type, 'before');
  var s3 = HV.getState(c, at(2026, 11, 13, 15, 0, 0)); assert.equal(s3.nextDay.dow, 6); assert.equal(HV.dayName(6), 'Sábado'); assert.equal(HV.dayName(0), 'Domingo');
});
t('asignaturas: cambiar la imagen de la asignatura cambia todos los días enlazados', function () {
  var c = HV.clone(cfg); c.sameEveryDay = false;
  c.days[3] = [{ id: 'w', subjectId: 's-mat', name: 'viejo', start: '09:00', end: '10:00', pictoId: 'b-lengua', color: '', secondary: [] }];
  c.subjects[0].pictoId = 'b-lectura'; c.subjects[0].name = 'Mates';
  var lun = HV.getState(c, at(2026, 11, 9, 9, 30)).act, mie = HV.getState(c, at(2026, 11, 11, 9, 30)).act;
  assert.equal(lun.pictoId, 'b-lectura'); assert.equal(mie.pictoId, 'b-lectura'); assert.equal(mie.name, 'Mates');
  assert.equal(mie.secondary.length, 4); assert.equal(mie.start, '09:00');
  c.days[3][0].subjectId = 'inexistente'; assert.equal(HV.getState(c, at(2026, 11, 11, 9, 30)).act.name, 'viejo'); /* enlace roto: usa lo propio */
  assert.equal(HV.migrate(JSON.parse(JSON.stringify(c))).subjects.length, 6);
  assert.equal(HV.migrate({ days: {} }).subjects.length, 0); /* configs antiguas sin asignaturas */
});
t('huecos horarios: pantalla de espera', function () {
  var c = HV.clone(cfg); c.days[1] = [c.days[1][0], c.days[1][2]]; /* 9-10 y 11-11:30 */
  var s = HV.getState(c, at(2026, 11, 9, 10, 30, 0)); assert.equal(s.type, 'gap'); assert.equal(s.next.id, 'rec'); near(s.toNext, 1800);
});
t('horarios independientes por día', function () {
  var c = HV.clone(cfg); c.sameEveryDay = false; c.days[2] = [{ id: 'x', name: 'X', start: '08:00', end: '09:00', pictoId: 'b-lengua', color: '', secondary: [] }];
  assert.equal(HV.getState(c, at(2026, 11, 10, 8, 30)).act.id, 'x'); assert.equal(HV.getState(c, at(2026, 11, 9, 9, 30)).act.id, 'mat');
});

console.log('Hitos');
t('marcas 25/50/75 se superan solo cuando corresponde', function () {
  assert.deepEqual(HV.reachedMarks(0.2499), [false, false, false]); assert.deepEqual(HV.reachedMarks(0.25), [true, false, false]);
  assert.deepEqual(HV.reachedMarks(0.7501), [true, true, true]);
});

console.log('Validación');
t('duración nula/negativa, solapes, huecos', function () {
  var base = { pictoId: 'b-lengua', secondary: [] };
  function A(n, s, e) { return Object.assign({ id: n, name: n }, base, { start: s, end: e }); }
  assert(HV.validateDay([A('a', '09:00', '09:00')]).errors.length === 1);
  assert(HV.validateDay([A('a', '10:00', '09:00')]).errors.length === 1);
  assert(HV.validateDay([A('a', '09:00', '10:00'), A('b', '09:30', '10:30')]).errors.length === 1);
  var r = HV.validateDay([A('a', '09:00', '10:00'), A('b', '11:00', '12:00')]); assert.equal(r.errors.length, 0); assert.equal(r.warnings.length, 1);
  assert(HV.validateDay([A('a', '', '10:00')]).errors.length >= 1);
  assert.equal(HV.validateDay(cfg.days[1]).errors.length + HV.validateDay(cfg.days[1]).warnings.length, 0);
});
t('sortDay no modifica horas', function () {
  var l = [{ start: '10:00', end: '11:00' }, { start: '09:00', end: '10:00' }]; var s = HV.sortDay(l); assert.equal(s[0].start, '09:00'); assert.equal(l[0].start, '10:00');
});

console.log('Esquema / migración');
t('v1 (sin secundarios) migra sin perder datos', function () {
  var v1 = { schemaVersion: 1, days: { 1: [{ id: 'q', name: 'Q', start: '09:00', end: '10:00', pictoId: 'b-lengua' }] } };
  var m = HV.migrate(v1); assert.equal(m.schemaVersion, 2); assert.deepEqual(m.days[1][0].secondary, []); assert.equal(m.days[2].length, 0);
  assert.equal(HV.getState(m, at(2026, 11, 9, 9, 30)).act.id, 'q');
});
t('secundarios se conservan y ordenan', function () { var a = cfg.days[1][0]; assert.deepEqual(a.secondary.map(function (x) { return x.label; }), ['Cálculo', 'Problemas', 'Cuaderno', 'Material']); });
t('ida y vuelta JSON idéntica (persistencia / exportación)', function () { assert.deepEqual(HV.migrate(JSON.parse(JSON.stringify(cfg))), cfg); });
t('datos corruptos se rechazan', function () { assert.equal(HV.migrate(null), null); assert.equal(HV.migrate({}), null); assert.equal(HV.migrate([]), null); assert.equal(HV.migrate('x'), null); });
t('ajustes inválidos vuelven a valores por defecto', function () {
  var m = HV.migrate({ days: {}, settings: { coverColor: 'red', coverOpacity: 7, pictoSize: 'x', showCounter: 'si' } });
  assert.equal(m.settings.coverColor, '#3d5a80'); assert.equal(m.settings.coverOpacity, 0.95); assert.equal(m.settings.pictoSize, 'large'); assert.equal(m.settings.showCounter, true);
});

console.log('Operación matemática');
t('evaluador correcto y sin eval', function () {
  assert.equal(HV.evalExpr('(8 × 4) + 17 − 9'), 40); assert.equal(HV.evalExpr('(36 ÷ 4) + (7 × 3)'), 30); assert.equal(HV.evalExpr('(12 + 8) × 3 - 14'), 46);
  assert.throws(function () { HV.evalExpr('process.exit()'); }); assert.throws(function () { HV.evalExpr('7 ÷ 2'); }); assert.throws(function () { HV.evalExpr('(1+2'); });
});
t('1000 desafíos aleatorios: enteros, positivos, con paréntesis y varias operaciones', function () {
  for (var i = 0; i < 1000; i++) {
    var c = HV.makeChallenge(); assert(Math.floor(c.answer) === c.answer && c.answer > 0 && c.answer < 100);
    assert(/\(/.test(c.text)); assert((c.text.match(/[+−×÷]/g) || []).length === 2);
    assert.equal(HV.evalExpr(c.text.replace(' = ?', '')), c.answer);
  }
});
t('el HTML no contiene respuestas', function () { assert(!/answer|respuesta/i.test(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8'))); });

console.log('Compatibilidad');
t('el código fuente no usa sintaxis moderna evidente', function () {
  ['core', 'storage', 'ui', 'kiosk', 'admin', 'app'].forEach(function (f) {
    var src = fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8');
    assert(!/structuredClone|\beval\(/.test(src), f);
  });
});
console.log('\n' + passed + ' pruebas correctas' + (process.exitCode ? ' (HAY FALLOS)' : ''));
