const http = require('http'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'demo.html');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
}).listen(8788, () => console.log('demo server on http://localhost:8788'));
