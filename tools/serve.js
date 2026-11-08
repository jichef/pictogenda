/* Servidor estático local para pruebas: node tools/serve.js [puerto] */
var http = require('http'), fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', 'public'), port = +process.argv[2] || 8080;
var types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
http.createServer(function (q, r) {
  var p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') { p = '/index.html'; }
  var f = path.join(root, p);
  if (f.indexOf(root) !== 0 || !fs.existsSync(f)) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(port, function () { console.log('http://localhost:' + port); });
