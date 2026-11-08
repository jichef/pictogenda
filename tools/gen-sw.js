/* Regenera la lista de precarga de public/sw.js y la versión de caché (hash del contenido). */
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var root = path.join(__dirname, '..', 'public');
function walk(d, base) {
  return fs.readdirSync(d).reduce(function (acc, f) {
    var p = path.join(d, f), rel = base ? base + '/' + f : f;
    if (fs.statSync(p).isDirectory()) { return acc.concat(walk(p, rel)); }
    if (rel !== 'sw.js') { acc.push(rel); }
    return acc;
  }, []);
}
var files = walk(root, '').sort(), h = crypto.createHash('md5');
files.forEach(function (f) { h.update(f); h.update(fs.readFileSync(path.join(root, f))); });
var ver = h.digest('hex').slice(0, 8);
var sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
sw = sw.replace(/\/\*ASSETS\*\/[\s\S]*?\/\*END\*\//, function () { return '/*ASSETS*/' + JSON.stringify(['./'].concat(files), null, 1) + '/*END*/'; })
       .replace(/var VERSION = '[^']*';/, "var VERSION = '" + ver + "';");
fs.writeFileSync(path.join(root, 'sw.js'), sw);
console.log('sw.js: ' + files.length + ' archivos, versión ' + ver);
