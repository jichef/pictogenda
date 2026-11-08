/* Comprueba que public/js y sw.js son ES5 válido (compatible con Safari iOS 12) usando acorn. */
var acorn = require('acorn'), fs = require('fs'), path = require('path'), bad = 0;
var dir = path.join(__dirname, '..', 'public');
var files = fs.readdirSync(path.join(dir, 'js')).map(function (f) { return 'js/' + f; }).concat(['sw.js']);
files.forEach(function (f) {
  try { acorn.parse(fs.readFileSync(path.join(dir, f), 'utf8'), { ecmaVersion: 5 }); console.log('ES5 OK  ' + f); }
  catch (e) { bad++; console.log('FALLO   ' + f + ': ' + e.message); }
});
process.exit(bad ? 1 : 0);
