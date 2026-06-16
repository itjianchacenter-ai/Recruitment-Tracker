// Generate a standalone, openable demo.html from the CURRENT src/App.jsx.
// Replaces the Supabase backend with an in-memory MOCK layer and reuses
// preview.html's HTML shell (Babel + Tailwind CDN + styles). Re-run anytime
// App.jsx changes:  node scripts/make-demo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const shell = readFileSync('preview.html', 'utf8');
const TAG = '<script type="text/babel" data-presets="react">';
const head = shell.slice(0, shell.indexOf(TAG) + TAG.length);

let app = readFileSync('src/App.jsx', 'utf8');
app = app.replace(/[ \t]*import React[^\n]*\n/, '');
app = app.replace(/import \{[\s\S]*?\} from '\.\/lib\/supabase\.js';\n/, '');
app = app.replace(/\n?export default App;\s*$/, '\n');

const MOCKS = `
const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ===================== MOCK BACKEND (standalone demo · no Supabase) ===================== */
let _seq = 2000;
const _nowIso = () => new Date().toISOString();
let _session = { user: { email: 'hr01@demo.local', app_metadata: { role: 'admin' }, user_metadata: { name: 'HR Demo' } } };
let _authCb = null;
const _users = [
  { id:'u1', email:'hr01@demo.local',     name:'HR Demo (admin)',     role:'admin', dept:'HR',         hasPassword:true },
  { id:'u2', email:'somying@demo.local',  name:'คุณสมหญิง รักงาน',     role:'user',  dept:'Finance',    hasPassword:true },
  { id:'u3', email:'wittaya@demo.local',  name:'คุณวิทยา รักดี',       role:'user',  dept:'Operations', hasPassword:true },
];
const _rows = [
  { id:'c1', name:null, position:'Content Creator Officer', department:'Marketing', type:'new_headcount', process_start_date:'2026-05-20', current_step:3, status:'active', steps:[], documents:[], probation:{}, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:null, created_by:'HR Demo' },
  { id:'c2', name:'สมชาย ใจดี', position:'Barista', department:'Operations', type:'new_headcount', process_start_date:'2026-02-01', current_step:6, status:'active', steps:[], documents:[], probation:{ startDate:'2026-02-01', evals:{} }, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:null, created_by:'HR Demo' },
  { id:'c3', name:'อารยา ตั้งใจ', position:'Cashier', department:'Operations', type:'replacement', process_start_date:'2026-01-10', current_step:6, status:'active', steps:[], documents:[], probation:{ startDate:'2026-01-10', direct:true, evals:{} }, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:'เพิ่มเข้าตรง (เดโม้)', created_by:'HR Demo' },
];
async function listCandidates(){ return _rows.map(r => JSON.parse(JSON.stringify(r))); }
async function createCandidate(row){ const r = { id:'c'+(++_seq), ...row }; _rows.unshift(r); return JSON.parse(JSON.stringify(r)); }
async function updateCandidate(id, patch){ const i=_rows.findIndex(r=>r.id===id); if(i>=0){ _rows[i] = { ..._rows[i], ...patch, id }; } return _rows[i]; }
async function deleteCandidate(id){ const i=_rows.findIndex(r=>r.id===id); if(i>=0) _rows.splice(i,1); }
function subscribeCandidates(_cb){ return () => {}; }
async function signIn(u){ _session = { user:{ email:(String(u).includes('@')?String(u):String(u)+'@demo.local').toLowerCase(), app_metadata:{ role:'admin' }, user_metadata:{ name:String(u) } } }; if(_authCb) _authCb(_session); return _session; }
async function signOut(){ _session = null; if(_authCb) _authCb(null); }
async function getSession(){ return _session; }
function onAuthChange(cb){ _authCb = cb; return () => { _authCb = null; }; }
function actorFromSession(s){ const e=s&&s.user&&s.user.email||''; return e? e.split('@')[0].toUpperCase():'HR'; }
function roleFromSession(s){ const u=s&&s.user; const r=u&&(u.app_metadata&&u.app_metadata.role||u.user_metadata&&u.user_metadata.role); return r==='user'?'user':'admin'; }
function usernameToEmail(u){ const s=String(u||'').trim(); return s.includes('@')?s.toLowerCase():s.toLowerCase()+'@demo.local'; }
function getActor(){ return actorFromSession(_session); }
async function adminListUsers(){ return _users.map(u=>({ ...u })); }
async function adminCreateUser(p){ const u={ id:'u'+(++_seq), email:p.email, name:p.name, dept:p.dept, role:p.role||'user', hasPassword:true }; _users.push(u); return u; }
async function adminResetPassword(){ return { ok:true }; }
async function adminDeleteUser(p){ const i=_users.findIndex(u=>u.email===p.email); if(i>=0) _users.splice(i,1); return { ok:true }; }
async function findUnregisteredEmails(){ return []; }
async function getClientIp(){ return '127.0.0.1'; }
async function uploadFile(candidateId, step, file){ return { path:'demo/'+candidateId+'/'+step+'/'+(file&&file.name||'file'), name:file&&file.name||'file.pdf', size:file&&file.size||12345, step, uploadedAt:_nowIso(), uploadedBy:getActor() }; }
async function getSignedUrl(){ return '#demo-file'; }
const _branches = [
  { id:'b1', brand:'JIAN CHA', name:'Central Lardprao', target_pax:16, sort_order:1, manning:{
    sm:[{name:'สุนันทา กระวีนทร์',nick:'ต้นน้ำ',status:'filled',badge:'รักษาการ'}],
    asm:[{name:'ธนกร ดุษฎีเดช',nick:'ดีโอ',status:'filled'},{status:'hold'}],
    staff:[{name:'Min Zaw Khaing',nick:'ลุย',status:'filled'},{name:'ชญาภา จันทะขาตร',nick:'ครีม',status:'filled'},{name:'Kai Intrabusorn',nick:'ไก่',status:'filled'},{status:'hold'},{status:'hold'},{status:'hold'},{status:'hold'}] } },
  { id:'b2', brand:'POLLY', name:'Central World 7Fl.', target_pax:9, sort_order:2, manning:{
    sm:[{name:'อุมาพร ลีดา',nick:'เขม',status:'filled'}], asm:[],
    staff:[{name:'MON TIN LAY',nick:'น้อ',status:'filled'},{name:'SANDAR LWIN',nick:'แสง',status:'filled'},{name:'เจนจิรา ฮันจันทา',nick:'เจน',status:'filled'},{status:'vacant'}] } },
  { id:'b3', brand:'JAI CHAN', name:'Dragon Town', target_pax:13, sort_order:3, manning:{
    sm:[{status:'hold'}],
    asm:[{name:'Naing Tun Oo',nick:'อเล็กซ์',status:'filled',badge:'รักษาการ'},{name:'นภสร พึ่งช่วย',nick:'กุหลาย',status:'filled',badge:'รักษาการ'}],
    staff:[{name:'AUNG ZIN HTWE',nick:'อ่าว',status:'filled',badge:'Full time'},{name:'ชัยสิทธิ์ ดำนวณ',nick:'บูรา',status:'filled',badge:'Part time'},{name:'วรัญชญา ยมนา',nick:'มะยม',status:'filled',badge:'Sat-Sun'},{name:'สายรุ้ง จันทวง',status:'filled',badge:'Full time',join:'2026-07-01',last:'2026-09-30'},{status:'hold'},{status:'hold'}] } },
];
async function listBranches(){ return JSON.parse(JSON.stringify(_branches)); }
async function createBranch(p){ const b={ id:'b'+(++_seq), created_at:_nowIso(), updated_at:_nowIso(), ...p }; _branches.push(b); return JSON.parse(JSON.stringify(b)); }
async function updateBranch(id, patch){ const i=_branches.findIndex(b=>b.id===id); if(i>=0) _branches[i]={ ..._branches[i], ...patch, id }; return _branches[i]; }
async function deleteBranch(id){ const i=_branches.findIndex(b=>b.id===id); if(i>=0) _branches.splice(i,1); }
/* ===================== END MOCK BACKEND ===================== */
`;

const TAIL = `
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
`;

const out = head + '\n' + MOCKS + '\n' + app + TAIL;
writeFileSync('demo.html', out, 'utf8');
console.log('wrote demo.html ·', out.length, 'chars');
