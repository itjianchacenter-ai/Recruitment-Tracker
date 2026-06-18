// Static server for ATS preview files (ats-preview.html, ats-react-test.html)
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
http.createServer((q,s)=>{
  let p=decodeURIComponent(q.url.split('?')[0]);
  if(p==='/'||p==='') p='/ats-preview.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){ s.writeHead(404); s.end('not found'); return; }
  s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); s.end(fs.readFileSync(f));
}).listen(8790,()=>console.log('ats static on http://localhost:8790'));
