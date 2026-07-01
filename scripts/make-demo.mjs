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
let _session = { user: { email: 'hr01@demo.local', app_metadata: { role: 'admin', level: 2 }, user_metadata: { name: 'HR Demo' } } };
let _authCb = null;
const _users = [
  { id:'u1', email:'hr01@demo.local',     name:'HR01 (Admin L2)',      role:'admin', level:2, dept:'HR',         hasPassword:true },
  { id:'u4', email:'hr02@demo.local',     name:'HR02 (Admin L2)',      role:'admin', level:2, dept:'HR',         hasPassword:true },
  { id:'u5', email:'view01@demo.local',   name:'Viewer01 (Admin L1)',  role:'admin', level:1, dept:'HR',         hasPassword:true },
  { id:'u6', email:'view02@demo.local',   name:'Viewer02 (Admin L1)',  role:'admin', level:1, dept:'Operations', hasPassword:true },
  { id:'u2', email:'somying@demo.local',  name:'คุณสมหญิง รักงาน',     role:'user',  level:2, dept:'Finance',    hasPassword:true },
  { id:'u3', email:'wittaya@demo.local',  name:'คุณวิทยา รักดี',       role:'user',  level:2, dept:'Operations', hasPassword:true },
];
const _rows = [
  { id:'c1', name:null, position:'Content Creator Officer', department:'Marketing', type:'new_headcount', process_start_date:'2026-05-20', current_step:3, status:'active', steps:[], documents:[], probation:{}, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:null, created_by:'HR Demo' },
  { id:'c2', name:'สมชาย ใจดี', position:'Barista', department:'Operations', type:'new_headcount', process_start_date:'2026-02-01', current_step:6, status:'active', steps:[], documents:[], probation:{ startDate:'2026-02-01', evals:{} }, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:null, created_by:'HR Demo' },
  { id:'c3', name:'อารยา ตั้งใจ', position:'Cashier', department:'Operations', type:'replacement', process_start_date:'2026-01-10', current_step:6, status:'active', steps:[], documents:[], probation:{ startDate:'2026-01-10', direct:true, evals:{} }, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:'เพิ่มเข้าตรง (เดโม้)', created_by:'HR Demo' },
  { id:'c4', name:'ปวีณา รอเริ่ม', position:'Store Manager', department:'Operations', type:'new_headcount', process_start_date:'2026-05-25', current_step:5, status:'active', steps:[], documents:[], probation:{ startDate:'2026-06-25' }, shortlist:[], generated_docs:{}, approval_workflows:{}, distributions:{}, files:[], notes:null, created_by:'HR Demo' },
];
async function listCandidates(){ return _rows.map(r => JSON.parse(JSON.stringify(r))); }
async function createCandidate(row){ const r = { id:'c'+(++_seq), ...row }; _rows.unshift(r); return JSON.parse(JSON.stringify(r)); }
async function updateCandidate(id, patch){ const i=_rows.findIndex(r=>r.id===id); if(i>=0){ _rows[i] = { ..._rows[i], ...patch, id }; } return _rows[i]; }
async function deleteCandidate(id){ const i=_rows.findIndex(r=>r.id===id); if(i>=0) _rows.splice(i,1); }
function subscribeCandidates(_cb){ return () => {}; }
async function signIn(u){
  const s = String(u); const email = (s.includes('@')?s:s+'@demo.local').toLowerCase();
  const known = _users.find(x=>x.email===email);
  // role: ถ้าตรงกับ user ที่รู้จักใช้ role นั้น · ไม่งั้นเดาจาก username (app/user/sign/emp = ผู้ใช้งาน)
  const role = known ? known.role : (/^(app|user|sign|emp)/i.test(s) ? 'user' : 'admin');
  const lv = known ? known.level : (/view|^l1|readonly/i.test(s) ? 1 : 2);
  _session = { user:{ email, app_metadata:{ role, level:lv }, user_metadata:{ name: known?known.name:s } } };
  if(_authCb) _authCb(_session); return _session;
}
async function signOut(){ _session = null; if(_authCb) _authCb(null); }
async function getSession(){ return _session; }
function onAuthChange(cb){ _authCb = cb; return () => { _authCb = null; }; }
function actorFromSession(s){ const e=s&&s.user&&s.user.email||''; return e? e.split('@')[0].toUpperCase():'HR'; }
function roleFromSession(s){ const u=s&&s.user; const r=u&&(u.app_metadata&&u.app_metadata.role||u.user_metadata&&u.user_metadata.role); return r==='user'?'user':'admin'; }
function levelFromSession(s){ const u=s&&s.user; const lv=u&&(u.app_metadata&&u.app_metadata.level!=null?u.app_metadata.level:(u.user_metadata&&u.user_metadata.level)); return Number(lv)===1?1:2; }
function usernameToEmail(u){ const s=String(u||'').trim(); return s.includes('@')?s.toLowerCase():s.toLowerCase()+'@demo.local'; }
function getActor(){ return actorFromSession(_session); }
async function adminListUsers(){ return _users.map(u=>({ ...u })); }
async function adminCreateUser(p){ const u={ id:'u'+(++_seq), email:p.email, name:p.name, dept:p.dept, role:p.role||'user', level:p.level||2, hasPassword:true }; _users.push(u); return u; }
async function adminResetPassword(){ return { ok:true }; }
async function adminSetLevel(p){ const i=_users.findIndex(u=>u.email===p.email||u.id===p.id); if(i>=0) _users[i].level = Number(p.level)===1?1:2; return { ok:true, level:_users[i] && _users[i].level }; }
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
    staff:[{name:'MON TIN LAY',nick:'น้อ',status:'filled'},{name:'SANDAR LWIN',nick:'แสง',status:'filled'},{name:'เจนจิรา ฮันจันทา',nick:'เจน',status:'filled'},{status:'vacant'},{status:'vacant'},{status:'vacant'}] } },
  { id:'b3', brand:'JAI CHAN', name:'Dragon Town', target_pax:13, sort_order:3, manning:{
    sm:[{status:'hold'}],
    asm:[{name:'Naing Tun Oo',nick:'อเล็กซ์',status:'filled',badge:'รักษาการ'},{name:'นภสร พึ่งช่วย',nick:'กุหลาย',status:'filled',badge:'รักษาการ'}],
    staff:[{name:'AUNG ZIN HTWE',nick:'อ่าว',status:'filled',badge:'Full time'},{name:'ชัยสิทธิ์ ดำนวณ',nick:'บูรา',status:'filled',badge:'Part time'},{name:'วรัญชญา ยมนา',nick:'มะยม',status:'filled',badge:'Sat-Sun'},{name:'สายรุ้ง จันทวง',status:'filled',badge:'Full time',join:'2026-07-01',last:'2026-09-30'},{status:'hold'},{status:'hold'}] } },
];
_branches.forEach(b => { if(!b.kind) b.kind='branch'; });
[
  { id:'h1', kind:'hq', brand:'ส่วนกลาง', name:'ฝ่ายทรัพยากรบุคคล (HR)', target_pax:0, sort_order:1, manning:{ sm:[], asm:[], staff:[{name:'ทัศนาวรรณ นาคุ',nick:'หญิง',title:'หัวหน้าฝ่าย HR',status:'filled',badge:'Full time'},{name:'ศุภากิจ สายโน',nick:'แก้ว',title:'ผู้จัดการ',status:'filled',badge:'Full time'},{name:'สมหญิง รักงาน',title:'เจ้าหน้าที่สรรหา',status:'filled',badge:'Full time'},{status:'hold'}] } },
  { id:'h2', kind:'hq', brand:'ส่วนกลาง', name:'ฝ่ายการเงิน-บัญชี', target_pax:0, sort_order:2, manning:{ sm:[], asm:[], staff:[{name:'วิเชียร พงศ์เจริญ',title:'ผู้จัดการฝ่าย',status:'filled',badge:'Full time'},{name:'อารยา ตั้งใจ',title:'เจ้าหน้าที่บัญชี',status:'filled',badge:'Full time'},{status:'vacant'}] } },
  { id:'h3', kind:'hq', brand:'JIAN CHA', name:'ฝ่ายการตลาด', target_pax:0, sort_order:3, manning:{ sm:[], asm:[], staff:[{name:'จิติยากร อ่อนสัมฤทธิ์',title:'Content Creator',status:'filled',badge:'Full time'},{status:'hold'},{status:'hold'}] } },
].forEach(b => _branches.push(b));
async function listBranches(kind){ return JSON.parse(JSON.stringify(_branches.filter(b => !kind || (b.kind||'branch')===kind))); }
async function createBranch(p){ const b={ id:'b'+(++_seq), created_at:_nowIso(), updated_at:_nowIso(), ...p }; _branches.push(b); return JSON.parse(JSON.stringify(b)); }
async function updateBranch(id, patch){ const i=_branches.findIndex(b=>b.id===id); if(i>=0) _branches[i]={ ..._branches[i], ...patch, id }; return _branches[i]; }
async function deleteBranch(id){ const i=_branches.findIndex(b=>b.id===id); if(i>=0) _branches.splice(i,1); }

/* ----- ATS · Candidate Database (mock) ----- */
const _atsPositions = [ { id:'p1', name:'Barista', sort_order:1 }, { id:'p2', name:'Store Manager', sort_order:2 }, { id:'p3', name:'Marketing Officer', sort_order:3 } ];
const _atsSources = ['Job Thai','Jobs DB','Job Fin Fin','Job BKK','Facebook','LinkedIn','Head-hunting','Refer'].map((n,i)=>({ id:'s'+(i+1), name:n, sort_order:i+1 }));
const _atsCandidates = [
  { id:'ac1', position:'Barista', name:'ณิชา พริ้มเพรา', phone:'081-222-3344', email:'nicha.p@gmail.com', source:'Jobs DB', stage:'Onsite Interview', expected_salary:'15000', reason:null, applied_date:'2026-06-10', resume:null, created_at:'2026-06-10T00:00:00Z' },
  { id:'ac2', position:'Store Manager', name:'วีรชัย ตั้งมั่น', phone:'086-555-7788', email:'weerachai.t@gmail.com', source:'Refer', stage:'Offered', expected_salary:'38000', reason:null, applied_date:'2026-06-15', resume:null, created_at:'2026-06-15T00:00:00Z' },
];
async function listAtsPositions(){ return _atsPositions.map(p=>({ ...p })); }
async function createAtsPosition(p){ const r={ id:'p'+(++_seq), ...p }; _atsPositions.push(r); return { ...r }; }
async function deleteAtsPosition(id){ const i=_atsPositions.findIndex(p=>p.id===id); if(i>=0) _atsPositions.splice(i,1); }
async function listAtsSources(){ return _atsSources.map(s=>({ ...s })); }
async function createAtsSource(p){ const r={ id:'s'+(++_seq), ...p }; _atsSources.push(r); return { ...r }; }
async function listAtsCandidates(){ return _atsCandidates.map(c=>JSON.parse(JSON.stringify(c))); }
async function createAtsCandidate(p){ const r={ id:'ac'+(++_seq), created_at:_nowIso(), ...p }; _atsCandidates.unshift(r); return JSON.parse(JSON.stringify(r)); }
async function updateAtsCandidate(id, patch){ const i=_atsCandidates.findIndex(c=>c.id===id); if(i>=0) _atsCandidates[i]={ ..._atsCandidates[i], ...patch, id }; return _atsCandidates[i]; }
async function deleteAtsCandidate(id){ const i=_atsCandidates.findIndex(c=>c.id===id); if(i>=0) _atsCandidates.splice(i,1); }
async function uploadResume(file){ return { path:'ats/demo_'+(file&&file.name||'resume.pdf'), name:file&&file.name||'resume.pdf', size:file&&file.size||10000, uploadedAt:_nowIso(), uploadedBy:getActor() }; }

/* ----- Documents · เซ็นเอกสารออนไลน์ (mock) ----- */
function getActorEmail(){ return (_session&&_session.user&&_session.user.email||'').toLowerCase(); }
const _documents = [
  { id:'d1', doc_number:'HR-2026-001', title:'สัญญาจ้างงาน — นายสมชาย ใจดี', category:'สัญญาจ้างงาน', description:'สัญญาจ้างพนักงานตำแหน่ง Barista เริ่มงาน 1 ก.ค. 2026 · แนบใบสมัคร + สำเนาบัตรประชาชน',
    main_file:{ path:'documents/demo_contract.pdf', name:'contract_somchai.pdf', size:180000, uploadedAt:_nowIso(), uploadedBy:'HR01' },
    attachments:[{ path:'documents/demo_idcard.pdf', name:'idcard_somchai.pdf', size:90000 },{ path:'documents/demo_app.pdf', name:'application_form.pdf', size:120000 }],
    approvers:[
      { id:'s1', name:'HR01 (Admin L2)', email:'hr01@demo.local', role:'HR Manager', sequence:1, status:'pending', signedAt:null, ip:null, signature_data:null, comment:'' },
      { id:'s2', name:'คุณวิทยา รักดี', email:'wittaya@demo.local', role:'Operations Director', sequence:2, status:'waiting', signedAt:null, ip:null, signature_data:null, comment:'' } ],
    status:'pending', current_seq:1, created_by:'HR01', created_at:_nowIso() },
  { id:'d2', doc_number:'HR-2026-002', title:'หนังสือรับรองเงินเดือน — น.ส.อารยา ตั้งใจ', category:'หนังสือรับรอง', description:'ออกให้เพื่อยื่นกู้ธนาคาร',
    main_file:{ path:'documents/demo_cert.pdf', name:'salary_cert.pdf', size:80000, uploadedAt:_nowIso(), uploadedBy:'HR01' }, attachments:[],
    approvers:[
      { id:'s1', name:'คุณวิทยา รักดี', email:'wittaya@demo.local', role:'หัวหน้าต้นสังกัด', sequence:1, status:'approved', signedAt:'2026-06-28T09:00:00Z', ip:'110.78.5.x', signature_data:null, comment:'อนุมัติ' },
      { id:'s2', name:'HR01 (Admin L2)', email:'hr01@demo.local', role:'HR Manager', sequence:2, status:'pending', signedAt:null, ip:null, signature_data:null, comment:'' } ],
    status:'pending', current_seq:2, created_by:'HR02', created_at:_nowIso() },
  { id:'d3', doc_number:'HR-2026-000', title:'NDA — พนักงานใหม่ (เดโม เซ็นครบแล้ว)', category:'NDA / รักษาความลับ', description:'ตัวอย่างเอกสารที่เซ็นครบทุกคนแล้ว',
    main_file:{ path:'documents/demo_nda.pdf', name:'nda.pdf', size:60000, uploadedAt:_nowIso(), uploadedBy:'HR01' }, attachments:[],
    approvers:[ { id:'s1', name:'HR01 (Admin L2)', email:'hr01@demo.local', role:'HR', sequence:1, status:'approved', signedAt:'2026-06-20T10:00:00Z', ip:'127.0.0.1', signature_data:null, comment:'' } ],
    status:'completed', current_seq:1, created_by:'HR01', created_at:_nowIso() },
  { id:'d4', doc_number:'DOC-2026-004', title:'บันทึกขออนุมัติจัดซื้ออุปกรณ์สาขา', category:'บันทึกข้อความ (Memo)', description:'ขออนุมัติจัดซื้อเครื่องชงชา 2 เครื่องสำหรับสาขาใหม่ · แนบใบเสนอราคา',
    main_file:{ path:'documents/demo_memo.pdf', name:'memo_purchase.pdf', size:70000, uploadedAt:_nowIso(), uploadedBy:'HR01' }, attachments:[{ path:'documents/demo_quote.pdf', name:'quotation.pdf', size:50000 }],
    approvers:[ { id:'s1', name:'คุณวิทยา รักดี', email:'wittaya@demo.local', role:'Operations Director', sequence:1, status:'pending', signedAt:null, ip:null, signature_data:null, comment:'' } ],
    status:'pending', current_seq:1, created_by:'HR01', created_at:_nowIso() },
];
async function listDocuments(){ return _documents.map(d=>JSON.parse(JSON.stringify(d))); }
async function createDocument(p){ const r={ id:'d'+(++_seq), created_at:_nowIso(), created_by:getActor(), updated_by:getActor(), ...p }; _documents.unshift(r); return JSON.parse(JSON.stringify(r)); }
async function updateDocument(id, patch){ const i=_documents.findIndex(d=>d.id===id); if(i>=0) _documents[i]={ ..._documents[i], ...patch, id, updated_by:getActor(), updated_at:_nowIso() }; return JSON.parse(JSON.stringify(_documents[i])); }
async function deleteDocument(id){ const i=_documents.findIndex(d=>d.id===id); if(i>=0) _documents.splice(i,1); }
async function uploadDocFile(file){ return { path:'documents/demo_'+(file&&file.name||'file.pdf'), name:file&&file.name||'file.pdf', size:file&&file.size||10000, type:file&&file.type||'', uploadedAt:_nowIso(), uploadedBy:getActor() }; }

/* ----- Branch Sales (mock) ----- */
const _branchSales = { 'Central Lardprao': 850000, 'สาขา 1': 620000, 'สาขา 2': 540000, 'สาขา 3': 410000 };
async function listBranchSales(){ return Object.entries(_branchSales).map(function(e){ return { branch:e[0], sales:e[1] }; }); }
async function upsertBranchSales(branch, sales){ _branchSales[branch] = Number(sales)||0; return { ok:true }; }

/* ----- Employee Database (mock) ----- */
const _emps = [
  { id:'e1', status:'active', dept:'Operations',              position:'Shop Manager',        work_status:'Full time', emp_id:'680014',  branch:'Central Lardprao', nick:'(ตัวอย่าง)', name:'น.ส. ตัวอย่าง หนึ่ง', name_en:'Ms. Example One',   join_date:'2025-01-10', birth_date:'1996-05-20', salary:'28000', created_at:'2025-01-10T00:00:00Z' },
  { id:'e2', status:'active', dept:'Supply Chain Management', position:'Stock Officer',        work_status:'Full time', emp_id:'680084',  branch:'HQ (คลังสินค้า)',  nick:'(เดโม)',     name:'นาย เดโม สอง',        name_en:'Mr. Demo Two',      join_date:'2025-06-04', birth_date:'1992-11-15', salary:'18000', created_at:'2025-06-04T00:00:00Z' },
  { id:'e3', status:'active', dept:'Human Resources',         position:'Recruitment Officer', work_status:'Full time', emp_id:'100025',  branch:'Head Office',      nick:'(พรีวิว)',   name:'น.ส. พรีวิว สาม',      name_en:'Ms. Preview Three', join_date:'2024-08-04', birth_date:'2000-02-05', salary:'22000', created_at:'2024-08-04T00:00:00Z' },
  { id:'e4', status:'active', dept:'Marketing',               position:'Graphic Designer',    work_status:'Part time', emp_id:'102013',  branch:'Head Office',      nick:'(ตัวอย่าง)', name:'นาย ตัวอย่าง สี่',     name_en:'Mr. Sample Four',   join_date:'2025-11-05', birth_date:'1998-10-31', salary:'25000', created_at:'2025-11-05T00:00:00Z' },
  { id:'e5', status:'resign', dept:'Operations',              position:'Sales-Part Time',     work_status:'Part time', emp_id:'680091',  branch:'Central Lardprao', nick:'(ตัวอย่าง)', name:'น.ส. ตัวอย่าง หก',    name_en:'Ms. Example Six',   join_date:'2024-06-19', birth_date:'2002-08-14', salary:'12000', resign_date:'2025-09-15', reason:'ได้งานใหม่', detail:'-', created_at:'2024-06-19T00:00:00Z' },
  { id:'e6', status:'resign', dept:'Human Resources',         position:'HR Operations Officer',work_status:'Full time', emp_id:'100008', branch:'Head Office',      nick:'(พรีวิว)',   name:'น.ส. พรีวิว แปด',      name_en:'Ms. Preview Eight', join_date:'2025-02-10', birth_date:'1995-06-09', salary:'20000', resign_date:'2025-08-08', reason:'ไม่ผ่านการทดลองงาน', detail:'-', created_at:'2025-02-10T00:00:00Z' },
  // ----- พนักงานต่างด้าว (Foreigners Database · kind:'foreign') -----
  { id:'f1', status:'active', kind:'foreign', dept:'Operations', position:'Barista',       work_status:'Full time', emp_id:'F0001', branch:'สาขา 1', nick:'หม่อง', name:'นาย เมียะ ส่วย', name_en:'Mr. Mya Swe',  join_date:'2025-03-01', birth_date:'1998-04-12', salary:'13000', doc_status:'ครบ',    remark:'-',                      created_at:'2025-03-01T00:00:00Z' },
  { id:'f2', status:'active', kind:'foreign', dept:'Operations', position:'Service Staff', work_status:'Full time', emp_id:'F0002', branch:'สาขา 2', nick:'นวล',  name:'น.ส. ตาน นวล',  name_en:'Ms. Than Nwe', join_date:'2025-07-15', birth_date:'2000-09-20', salary:'14000', doc_status:'ไม่ครบ', remark:'รอ Work Permit ต่ออายุ', created_at:'2025-07-15T00:00:00Z' },
  { id:'f3', status:'active', kind:'foreign', dept:'Supply Chain Management', position:'Warehouse Staff', work_status:'Full time', emp_id:'F0003', branch:'สาขา 3', nick:'อ่อง', name:'นาย อ่อง โก', name_en:'Mr. Aung Ko', join_date:'2024-11-10', birth_date:'1995-01-05', salary:'15000', doc_status:'ไม่ครบ', remark:'ขาดสำเนา Passport', created_at:'2024-11-10T00:00:00Z' },
];
// ----- จำลองข้อมูลปริมาณจริง: HQ 10 ฝ่าย ~100+ คน + สาขา 14 สาขา (เพื่อทดสอบเพจกราฟ) -----
(function(){
  const p2 = (n) => String(n).padStart(2,'0');
  let gid = 1000;
  const HQ_DEPTS = ['Human Resources','Information Technology','Operations','Marketing','Business Development','Supply Chain Management','Finance','Learning & Development','Project Management','Legal'];
  HQ_DEPTS.forEach((d, di) => {
    const cnt = 8 + (di % 5);                 // 8..12 คน/ฝ่าย → ~100 คน
    for (let i = 0; i < cnt; i++) {
      const male = (i + di) % 2 === 0;
      _emps.push({ id:'gh'+(++gid), status:'active', dept:d, position:'Officer', work_status: i % 7 === 0 ? 'Part time' : 'Full time',
        emp_id:'H'+(1000+gid), branch:'Head Office', nick:'', name:(male?'นาย':'น.ส.')+' '+d.split(' ')[0]+' '+(i+1), name_en:'',
        join_date:'2025-'+p2((di%12)+1)+'-'+p2((i%27)+1), birth_date:(1985+(i%20))+'-'+p2((di%12)+1)+'-15', salary:'20000' });
    }
  });
  for (let b = 1; b <= 14; b++) {
    const cnt = 5 + (b % 9);                   // 5..13 คน/สาขา
    for (let i = 0; i < cnt; i++) {
      const male = (i + b) % 2 === 0;
      _emps.push({ id:'gb'+(++gid), status:'active', dept:'Operations', position:'Staff', work_status: i % 4 === 0 ? 'Part time' : 'Full time',
        emp_id:'B'+(2000+gid), branch:'สาขา '+b, nick:'', name:(male?'นาย':'น.ส.')+' สาขา'+b+' '+(i+1), name_en:'',
        join_date:'2025-'+p2((b%12)+1)+'-'+p2((i%27)+1), birth_date:(1995+(i%12))+'-06-10', salary:'13000' });
    }
  }
})();
async function listEmployees(){ return _emps.map(e=>JSON.parse(JSON.stringify(e))); }
async function createEmployee(p){ const r={ id:'e'+(++_seq), created_at:_nowIso(), ...p }; _emps.push(r); return JSON.parse(JSON.stringify(r)); }
async function updateEmployee(id, patch){ const i=_emps.findIndex(e=>e.id===id); if(i>=0) _emps[i]={ ..._emps[i], ...patch, id }; return JSON.parse(JSON.stringify(_emps[i])); }
async function deleteEmployee(id){ const i=_emps.findIndex(e=>e.id===id); if(i>=0) _emps.splice(i,1); }
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
