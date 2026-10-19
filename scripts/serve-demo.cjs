const http = require('http'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'demo.html');
const org = path.join(__dirname, '..', 'public', 'org-studio', 'index.html');
// same header as deploy/* sends for /org-studio/ — local testing matches production
const ORG_CSP = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; connect-src https://cdnjs.cloudflare.com; worker-src blob: https://cdnjs.cloudflare.com; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-modals allow-downloads allow-forms";
http.createServer((req, res) => {
  // JC Org Studio (iframe) — ไฟล์เดียวกับที่ build ไปอยู่ใน dist/org-studio/
  if (req.url.split('?')[0] === '/org-studio/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ORG_CSP });
    return res.end(fs.readFileSync(org));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
}).listen(8788, () => console.log('demo server on http://localhost:8788'));
