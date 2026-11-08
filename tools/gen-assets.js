/* Genera pictogramas SVG incorporados e iconos PNG. Uso: node tools/gen-assets.js */
var fs = require('fs'), path = require('path'), zlib = require('zlib');
var out = path.join(__dirname, '..', 'public');
var P = [
  ['matematicas', '🔢', '#fde2e4'], ['lengua', '📝', '#d8f0ea'], ['ingles', '🇬🇧', '#e4e1fa'], ['ciencias', '🔬', '#e0f1d6'],
  ['plastica', '🎨', '#fbe0ee'], ['musica', '🎵', '#e3ecfb'], ['educacion-fisica', '🏃', '#fdeacf'], ['lectura', '📚', '#f3e6d4'],
  ['recreo', '⚽', '#fdecc8'], ['comida', '🍎', '#fcdcdc'], ['asamblea', '💬', '#dff0fb'], ['cuaderno', '📒', '#fff3c4'],
  ['calculo', '🧮', '#fde2e4'], ['problemas', '🧩', '#e9e3f7'], ['material', '🧱', '#f9e0d0'], ['espera', '⏳', '#e8edf5'],
  ['fin', '🌙', '#dfe6f7'], ['vacio', '', '#eef1f6']
];
P.forEach(function (p) {
  var glyph = p[1] ? '<text x="100" y="138" font-size="108" text-anchor="middle">' + p[1] + '</text>' : '<text x="100" y="125" font-size="90" text-anchor="middle" fill="#b6c0d2">?</text>';
  fs.writeFileSync(path.join(out, 'pictos', p[0] + '.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" rx="36" fill="' + p[2] + '"/>' + glyph + '</svg>\n');
});

/* PNG sin dependencias */
var T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
function crc(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(t, d) { var l = Buffer.alloc(4); l.writeUInt32BE(d.length); var td = Buffer.concat([Buffer.from(t), d]); var cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); }
function png(size) {
  var raw = Buffer.alloc((size * 4 + 1) * size), r = size * 0.32, cx = size / 2, cy = size / 2;
  for (var y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (var x = 0; x < size; x++) {
      var o = y * (size * 4 + 1) + 1 + x * 4, d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      var col = [61, 90, 128];
      if (d < r) col = (y < cy - r * 0.2) ? [150, 170, 200] : [255, 255, 255];
      if (d < r && d > r - size * 0.025) col = [255, 255, 255];
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255;
    }
  }
  var ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
[180, 192, 512].forEach(function (s) { fs.writeFileSync(path.join(out, 'icons', 'icon-' + s + '.png'), png(s)); });
console.log('Assets generados');
