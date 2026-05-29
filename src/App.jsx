import { useEffect, useMemo, useState, useRef, Fragment } from 'react';
import {
  Plus, Search, Users, CheckCircle2, AlertTriangle, AlertCircle, ClipboardCheck,
  X, ChevronRight, Calendar, Trash2, Edit2, FileText, FileCheck, Briefcase,
  CalendarClock, ShieldCheck, UserCircle2, Loader2, BarChart3, TrendingUp,
  Building2, Wallet, Clock, PenLine, LogOut, Lock, Mail, Send
} from 'lucide-react';
import {
  listCandidates, createCandidate, updateCandidate, deleteCandidate,
  subscribeCandidates, signIn, signOut, getSession, onAuthChange, actorFromSession, roleFromSession, sendEmail
} from './lib/supabase.js';

// ============================================================================
// Constants — 6-step workflow (ตรงกับ preview.html)
// ============================================================================

const STEPS = [
  { id: 1, name: 'Requisition Approval',       thai: 'ขออนุมัติอัตรากำลังคน',   owner: 'Dept Head + HR',        note: 'สร้างเอกสาร + เซ็นอนุมัติตามลำดับ' },
  { id: 2, name: 'Sourcing',                   thai: 'ดำเนินการสรรหา',          owner: 'HR Recruiter',          note: 'นับถอยหลัง 30 วัน' },
  { id: 3, name: 'Screening & Shortlist',      thai: 'คัดกรอง + ส่ง shortlist', owner: 'HR Recruiter',          note: 'อัปโหลด resume + อีเมลต้นสังกัด' },
  { id: 4, name: 'Interview Evaluation',       thai: 'ประเมินสัมภาษณ์',         owner: 'Hiring Mgr → HR',       note: 'scorecard + ใส่ชื่อผู้ผ่าน' },
  { id: 5, name: 'Offer Approval & Extension', thai: 'ขออนุมัติรับ + ส่ง Offer', owner: 'HR + Approvers',        note: 'สร้างเอกสาร + เซ็นอนุมัติตามลำดับ' },
  { id: 6, name: 'Probation Period',           thai: 'ทดลองงาน 120 วัน',        owner: 'Hiring Mgr · HR',       note: 'ประเมิน Day 30/60/90 · ผ่านโปร Day 119' }
];
const TOTAL_STEPS = STEPS.length;
const APPROVAL_STEPS = [1, 5]; // steps ที่ต้องเซ็นอนุมัติก่อนผ่าน

const DOCUMENT_TEMPLATE = [
  { key: 'id_card',      label: 'สำเนาบัตรประชาชน' },
  { key: 'house_reg',    label: 'สำเนาทะเบียนบ้าน' },
  { key: 'education',    label: 'วุฒิการศึกษา' },
  { key: 'work_cert',    label: 'ใบผ่านงาน' },
  { key: 'photo',        label: 'รูปถ่าย' },
  { key: 'medical_cert', label: 'ใบรับรองแพทย์' }
];

const DEFAULT_DEPARTMENTS = [
  'Operations', 'Marketing', 'Sales & BD', 'Supply Chain', 'Finance',
  'HR & People', 'IT', 'R&D / Product'
];

// JIANCHA Grade/Level (JG1–JG15 + UC1–UC4)
const LEVELS = [
  { code: 'JG1', label: 'Entry' }, { code: 'JG2', label: 'Jr. Entry' }, { code: 'JG3', label: 'Sr. Entry' },
  { code: 'JG4', label: 'Jr. Officer' }, { code: 'JG5', label: 'Officer' }, { code: 'JG6', label: 'Sr. Officer' },
  { code: 'JG7', label: 'Supervisor' }, { code: 'JG8', label: 'Asst. Manager' }, { code: 'JG9', label: 'Manager' },
  { code: 'JG10', label: 'Senior Manager' }, { code: 'JG11', label: 'Head of Dept' }, { code: 'JG12', label: 'Director' },
  { code: 'JG13', label: 'VP' }, { code: 'JG14', label: 'SVP' }, { code: 'JG15', label: 'EVP' },
  { code: 'UC1', label: 'FEVP' }, { code: 'UC2', label: 'SEVP' }, { code: 'UC3', label: 'C-Level / Pres.' }, { code: 'UC4', label: 'CEO' }
];

const NECESSITY_OPTIONS = [
  'เพิ่มกำลังคนเพื่อรองรับงานที่เพิ่มขึ้น',
  'ทดแทนพนักงาน',
  'ขยายสายงานหรือแผนกใหม่',
  'รองรับแผนกลยุทธ์ของบริษัทในอนาคต',
  'รองรับการเปลี่ยนแปลงด้านกฎหมาย',
  'สนับสนุนโครงการเฉพาะกิจ',
  'ปรับเปลี่ยนโครงสร้างตามแผนพัฒนา',
  'รองรับการเข้าสู่ตลาดใหม่หรือขยายกลุ่มเป้าหมาย',
  'รองรับความต้องการด้านเทคโนโลยีหรือเครื่องมือใหม่ๆ'
];

const DOC_LABELS = {
  1: { name: 'Manpower Requisition Form',          thai: 'แบบฟอร์มขออนุมัติกำลังคน' },
  4: { name: 'Interview Evaluation Form',          thai: 'แบบฟอร์มประเมินการสัมภาษณ์งาน' },
  5: { name: 'Employee Recruitment Approval Form', thai: 'แบบฟอร์มขออนุมัติรับพนักงาน' },
  6: { name: 'Probation Evaluation Form',          thai: 'แบบฟอร์มประเมินผลการทดลองงาน' }
};

// Step 4 — interview evaluation criteria + score definitions
const EVAL_CRITERIA = [
  { cat: '1. ด้านความพร้อมของผู้สมัคร', items: [
    { key: 'a1', label: 'ความเหมาะสมด้านบุคลิกภาพในตำแหน่งงาน' },
    { key: 'a2', label: 'ตรงต่อเวลาในการสัมภาษณ์งาน' }
  ] },
  { cat: '2. ทักษะการตอบคำถาม', items: [
    { key: 'b1', label: 'ความสามารถในการให้คำตอบตรงประเด็นกับคำถาม' },
    { key: 'b2', label: 'ความมั่นใจในการตอบคำถาม' },
    { key: 'b3', label: 'ความสามารถในการเข้าใจคำถาม' },
    { key: 'b4', label: 'ความสุภาพและทักษะในการสื่อสารอย่างมืออาชีพ' },
    { key: 'b5', label: 'ความรอบรู้และความเชี่ยวชาญในการตอบคำถาม' },
    { key: 'b6', label: 'การแสดงทัศนคติต่อลักษณะงานหรือตำแหน่งงาน' }
  ] },
  { cat: '3. ทักษะการเป็นผู้นำในระดับตำแหน่งงาน', items: [
    { key: 'c1', label: 'ความสามารถในการกำหนดวิสัยทัศน์และเป้าหมาย' },
    { key: 'c2', label: 'ความสามารถในการแก้ไขความขัดแย้งและสร้างความเข้าใจ' },
    { key: 'c3', label: 'ความสามารถด้านการสร้างวัฒนธรรมทีม' }
  ] },
  { cat: '4. ความรู้และความเข้าใจในตำแหน่งงาน', items: [
    { key: 'd1', label: 'ความรู้และเทคนิคและความเชี่ยวชาญเฉพาะด้าน' },
    { key: 'd2', label: 'ความเข้าใจองค์ประกอบของงานและกระบวนการทำงาน' },
    { key: 'd3', label: 'ความรู้ด้านการแก้ไขปัญหาในตำแหน่งงาน' }
  ] }
];
const SCORE_DEFS = [
  { n: 5, label: 'ยอดเยี่ยม', desc: 'เหนือกว่าความคาดหวัง · ผลลัพธ์โดดเด่น' },
  { n: 4, label: 'ดีมาก', desc: 'เหนือกว่ามาตรฐาน · รับมือความท้าทายได้ดี' },
  { n: 3, label: 'มาตรฐาน', desc: 'ระดับคาดหวัง · ทำงานได้ตามเกณฑ์' },
  { n: 2, label: 'พอใช้', desc: 'มีพื้นฐาน · ต้องพัฒนาเพิ่ม' },
  { n: 1, label: 'น้อยมาก', desc: 'ขาดความรู้/ทักษะ · ตอบสนองพื้นฐานไม่ได้' }
];

// Step 6 — probation evaluation criteria
const PROB_CRITERIA = [
  { section: '1. เรื่องเวลาการเข้างาน (Time & Attendance)', items: [
    { key: 't1', label: 'ตรงต่อเวลาในการมาทำงาน · ไม่มาสาย' },
    { key: 't2', label: 'จำนวนวันลา/ขาด อยู่ในระดับยอมรับได้' },
    { key: 't3', label: 'ปฏิบัติตามเวลาพักและเลิกงาน' },
    { key: 't4', label: 'แจ้งล่วงหน้าเมื่อต้องลา' }
  ] },
  { section: '2. เรื่องการทำงาน (Work Performance)', items: [
    { key: 'w1', label: 'ความรู้และทักษะตามตำแหน่ง' },
    { key: 'w2', label: 'คุณภาพงาน · ความถูกต้องและละเอียดรอบคอบ' },
    { key: 'w3', label: 'ปริมาณงานที่ทำได้ในแต่ละช่วงเวลา' },
    { key: 'w4', label: 'การทำงานร่วมกับทีม · มนุษยสัมพันธ์' },
    { key: 'w5', label: 'ความรับผิดชอบและความน่าเชื่อถือ' },
    { key: 'w6', label: 'ทัศนคติต่อการทำงานและองค์กร' },
    { key: 'w7', label: 'ความสามารถในการเรียนรู้และพัฒนาตัวเอง' }
  ] }
];

const HR_EMAIL = 'Hr.jc@jianchatea.com';
const STEP_2_DEADLINE_DAYS = 30;
const PROBATION_DAYS       = 120;
const PROBATION_ELIGIBLE   = 119;

// ============================================================================
// Helpers
// ============================================================================

const today = () => new Date(new Date().toISOString().slice(0, 10));
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86_400_000);
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const parseMoney = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

function deriveStatus(c) {
  if (c.status === 'passed')    return { tone: 'green', label: 'ผ่านโปร',       icon: CheckCircle2 };
  if (c.status === 'cancelled') return { tone: 'gray',  label: 'ยกเลิกตำแหน่ง', icon: X };
  if (c.status === 'rejected')  return { tone: 'gray',  label: 'ยกเลิก',         icon: X };

  // Step 1: requisition approval state
  if (c.current_step === 1) {
    const wf = c.approval_workflows?.['1'];
    if (!wf) return { tone: 'gray', label: 'ยังไม่ส่งอนุมัติ', icon: ClipboardCheck };
    if (wf.status === 'in_progress') {
      const done = (wf.approvers || []).filter((a) => a.status === 'approved').length;
      return { tone: 'blue', label: `รออนุมัติ (${done}/${(wf.approvers || []).length})`, icon: Clock };
    }
    if (wf.status === 'completed') return { tone: 'green', label: 'อนุมัติครบ พร้อมสรรหา', icon: CheckCircle2 };
  }

  const daysSinceStart = daysBetween(c.process_start_date, today());
  if (c.current_step === 2) {
    const dd = STEP_2_DEADLINE_DAYS - daysSinceStart;
    if (dd < 0)  return { tone: 'red',    label: `เกิน deadline ${Math.abs(dd)} วัน`, icon: AlertCircle };
    if (dd <= 3) return { tone: 'yellow', label: `ใกล้ deadline (${dd} วัน)`,        icon: AlertTriangle };
  }

  // Step 5: offer approval state
  if (c.current_step === 5) {
    const wf = c.approval_workflows?.['5'];
    if (wf?.status === 'in_progress') {
      const done = (wf.approvers || []).filter((a) => a.status === 'approved').length;
      return { tone: 'blue', label: `รออนุมัติ Offer (${done}/${(wf.approvers || []).length})`, icon: Clock };
    }
  }

  // Step 6: probation
  if (c.current_step === TOTAL_STEPS) {
    const ps = c.probation?.startDate ?? c.process_start_date;
    const dp = daysBetween(ps, today());
    if (dp >= PROBATION_DAYS + 5) return { tone: 'red',  label: 'เกินกำหนดประเมิน', icon: AlertCircle };
    if (dp >= PROBATION_ELIGIBLE)  return { tone: 'blue', label: 'พร้อมผ่านโปร',     icon: ShieldCheck };
  }
  return { tone: 'green', label: 'ปกติ', icon: CheckCircle2 };
}

function progressPercent(c) {
  if (c.status === 'passed') return 100;
  if (c.current_step < TOTAL_STEPS) return Math.round((c.current_step / TOTAL_STEPS) * 100);
  const ps = c.probation?.startDate ?? c.process_start_date;
  const d = Math.min(daysBetween(ps, today()), PROBATION_DAYS);
  return 90 + Math.round((d / PROBATION_DAYS) * 10);
}

function bucketOf(c) {
  if (c.status === 'passed') return 'probation';
  if (c.current_step <= 4)   return 'open';
  if (c.current_step <= 5)   return 'onboarding';
  return 'probation';
}

const toneClasses = {
  green:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  yellow: 'bg-amber-100   text-amber-800   border-amber-200',
  red:    'bg-rose-100    text-rose-800    border-rose-200',
  blue:   'bg-sky-100     text-sky-800     border-sky-200',
  gray:   'bg-slate-100   text-slate-700   border-slate-200'
};

// ============================================================================
// Root component
// ============================================================================

export default function App() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [filter, setFilter]         = useState({ dept: '', step: '', type: '', q: '' });
  const [tab, setTab]               = useState('pipeline'); // 'pipeline' | 'reports'
  const [editing, setEditing]       = useState(null);
  const [opening, setOpening]       = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [session, setSession]       = useState(undefined); // undefined=checking · null=logged out · obj=logged in
  const actor = actorFromSession(session);
  const role  = roleFromSession(session);

  // Auth: check session + subscribe to changes
  useEffect(() => {
    let mounted = true;
    getSession().then((s) => { if (mounted) setSession(s ?? null); });
    const unsub = onAuthChange((s) => { if (mounted) setSession(s ?? null); });
    return () => { mounted = false; unsub?.(); };
  }, []);

  // Data: load + realtime — only when logged in
  useEffect(() => {
    if (!session) { setCandidates([]); return; }
    let mounted = true;
    setLoading(true); setError(null);
    listCandidates()
      .then((rows) => { if (mounted) { setCandidates(rows); setLoading(false); } })
      .catch((e)  => { if (mounted) { setError(e.message); setLoading(false); } });

    const unsub = subscribeCandidates((payload) => {
      setCandidates((prev) => {
        if (payload.eventType === 'INSERT') return [payload.new, ...prev.filter((c) => c.id !== payload.new.id)];
        if (payload.eventType === 'UPDATE') return prev.map((c) => c.id === payload.new.id ? payload.new : c);
        if (payload.eventType === 'DELETE') return prev.filter((c) => c.id !== payload.old.id);
        return prev;
      });
    });
    return () => { mounted = false; unsub?.(); };
  }, [session]);

  const departments = useMemo(() => {
    const set = new Set(DEFAULT_DEPARTMENTS);
    candidates.forEach((c) => c.department && set.add(c.department));
    return Array.from(set).sort();
  }, [candidates]);

  const filtered = useMemo(() => candidates.filter((c) => {
    if (filter.dept && c.department !== filter.dept) return false;
    if (filter.step && c.current_step !== Number(filter.step)) return false;
    if (filter.type && c.type !== filter.type) return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      if (![c.name, c.position, c.department].some((s) => (s ?? '').toLowerCase().includes(q))) return false;
    }
    return true;
  }), [candidates, filter]);

  const stats = useMemo(() => ({
    total:   candidates.length,
    active:  candidates.filter((c) => c.status === 'active').length,
    passed:  candidates.filter((c) => c.status === 'passed').length,
    overdue: candidates.filter((c) => deriveStatus(c).tone === 'red').length
  }), [candidates]);

  const opened = opening ? candidates.find((c) => c.id === opening) : null;

  async function handleSave(payload, id) {
    try {
      if (id) await updateCandidate(id, payload);
      else    await createCandidate(payload);
      setEditing(null);
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('ลบ candidate รายนี้ใช่หรือไม่? (ลบแล้วกู้คืนได้จาก audit log)')) return;
    try {
      await deleteCandidate(id);
      setCandidates((prev) => prev.filter((x) => x.id !== id)); // อัปเดตทันที (ไม่รอ realtime)
      setOpening(null);
    } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
  }

  async function advanceStep(c) {
    if (c.current_step >= TOTAL_STEPS) return;
    if (APPROVAL_STEPS.includes(c.current_step) && c.approval_workflows?.[String(c.current_step)]?.status !== 'completed') {
      alert(`ต้องบันทึก "อนุมัติครบ" ของ Step ${c.current_step} ก่อนถึงจะไปต่อได้`);
      return;
    }
    if (c.current_step === 4 && !c.name?.trim()) {
      alert('ใส่ชื่อผู้สมัครที่ผ่านสัมภาษณ์ก่อนไป Step 5 (Offer Approval)');
      return;
    }
    const next = c.current_step + 1;
    const steps = [...(c.steps ?? []), { step: c.current_step, completedDate: todayISO(), completedBy: actor }];
    const patch = { current_step: next, steps };
    if (next === TOTAL_STEPS) {
      const start = todayISO();
      patch.probation = {
        startDate: start, evaluationSentDate: start, returnDate: null, passed: false,
        milestones: { day30: { done: false }, day60: { done: false }, day90: { done: false }, day120: { done: false } }
      };
    }
    await updateCandidate(c.id, patch);
  }

  // Interim bridge until the full e-signature portal is built (Phase 2):
  // record the approval workflow for Step 1/5 as completed.
  async function markApprovalComplete(c, step) {
    const wf = {
      status: 'completed',
      createdAt: c.approval_workflows?.[String(step)]?.createdAt ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
      approvers: c.approval_workflows?.[String(step)]?.approvers ?? [],
      recordedBy: actor
    };
    const approval_workflows = { ...(c.approval_workflows ?? {}), [String(step)]: wf };
    await updateCandidate(c.id, { approval_workflows });
  }

  async function setCandidateName(c, name) {
    await updateCandidate(c.id, { name: name?.trim() || null });
  }

  async function dropCandidate(c) {
    if (!c.name) return;
    if (!confirm(`ลบ "${c.name}" ออกจากตำแหน่งนี้?\n\nระบบจะเก็บประวัติใน audit log แล้วย้อนกลับไป Step 4 หา candidate อื่น`)) return;
    const droppedName = c.name;
    const dateStr = todayISO();
    const { ['5']: _drop, ...keepWf } = c.approval_workflows ?? {};
    await updateCandidate(c.id, {
      name: null,
      current_step: 4,
      steps: [...(c.steps ?? []), { step: c.current_step, completedDate: dateStr, completedBy: actor, note: `ผู้สมัคร "${droppedName}" ถอน` }],
      documents: [],
      approval_workflows: keepWf,
      probation: {},
      notes: (c.notes ? c.notes + '\n' : '') + `📌 ${dateStr}: "${droppedName}" ถอน · กลับมาที่ Step 4`
    });
  }

  async function cancelPosition(c) {
    if (!confirm(`ยกเลิกตำแหน่ง "${c.position}"?\n\nตำแหน่งจะหายจาก dashboard (audit log เก็บประวัติไว้)`)) return;
    try {
      await deleteCandidate(c.id);
      setCandidates((prev) => prev.filter((x) => x.id !== c.id)); // อัปเดตทันที (ไม่รอ realtime DELETE)
      setOpening(null);
    } catch (e) { alert('ยกเลิกไม่สำเร็จ: ' + e.message); }
  }

  async function toggleDoc(c, key) {
    const base = c.documents?.length ? c.documents : DOCUMENT_TEMPLATE.map((d) => ({ ...d, received: false, receivedDate: null }));
    const docs = base.map((d) => d.key === key
      ? { ...d, received: !d.received, receivedDate: !d.received ? todayISO() : null }
      : d);
    await updateCandidate(c.id, { documents: docs });
  }

  async function recordMilestone(c, dayKey, score, note) {
    const probation = {
      ...(c.probation ?? {}),
      milestones: {
        ...(c.probation?.milestones ?? {}),
        [dayKey]: { done: true, date: todayISO(), score: Number(score) || null, note: note || '' }
      }
    };
    await updateCandidate(c.id, { probation });
  }

  async function markProbationPassed(c) {
    const probation = { ...(c.probation ?? {}), returnDate: todayISO(), passed: true };
    const steps = [...(c.steps ?? []), { step: TOTAL_STEPS, completedDate: probation.returnDate, completedBy: actor }];
    await updateCandidate(c.id, { probation, steps, status: 'passed' });
  }

  // Save a generated document (per step) + optional sequential approval workflow
  async function saveDoc(c, step, data, approvers) {
    const generated_docs = { ...(c.generated_docs ?? {}), [step]: { data, createdAt: new Date().toISOString(), createdBy: actor } };
    const patch = { generated_docs };
    if (approvers && APPROVAL_STEPS.includes(step)) {
      patch.approval_workflows = {
        ...(c.approval_workflows ?? {}),
        [step]: {
          status: 'in_progress',
          createdAt: new Date().toISOString(),
          approvers: approvers.map((a, i) => ({ ...a, status: i === 0 ? 'pending' : 'waiting', sequence: i + 1 }))
        }
      };
    }
    await updateCandidate(c.id, patch);
  }

  // Log a sent email into the candidate's distributions[step] timeline
  async function logEmail(c, step, entry) {
    const dist = c.distributions ?? {};
    const distributions = { ...dist, [step]: [...(dist[step] ?? []), entry] };
    await updateCandidate(c.id, { distributions });
  }

  const sectionDefs = [
    { key: 'open',       title: '🔍 Open Position',        sub: 'Sourcing · ยังไม่มีผู้สมัคร · Step 1–4' },
    { key: 'onboarding', title: '✍️ Process รับเข้าทำงาน',  sub: 'ได้ผู้สมัครแล้ว · Step 5' },
    { key: 'probation',  title: '🛡 Process Probation',     sub: 'ทดลองงาน 120 วัน · Step 6 + ผ่านโปร' }
  ];

  async function signMyApproval(candidate, step, signatureData, myEmail) {
    const wfs = { ...(candidate.approval_workflows || {}) };
    const wf  = { ...(wfs[step] || {}) };
    let signed = false;
    let approvers = (wf.approvers || []).map((a) => {
      if (!signed && (a.email || '').toLowerCase() === (myEmail || '').toLowerCase() && a.status === 'pending') {
        signed = true;
        return { ...a, status: 'approved', signedAt: new Date().toISOString(), signature_data: signatureData };
      }
      return a;
    });
    if (!signed) return;
    const nextIdx = approvers.findIndex((a) => a.status === 'waiting');
    if (nextIdx >= 0) approvers = approvers.map((a, i) => i === nextIdx ? { ...a, status: 'pending' } : a);
    const allApproved = approvers.every((a) => a.status === 'approved');
    wfs[step] = { ...wf, approvers, status: allApproved ? 'completed' : 'in_progress' };
    await updateCandidate(candidate.id, { approval_workflows: wfs });
  }

  async function fillEvalDoc(candidate, step, data) {
    const generated_docs = { ...(candidate.generated_docs ?? {}), [step]: { data, createdAt: new Date().toISOString(), createdBy: actor, filledBy: actor } };
    await updateCandidate(candidate.id, { generated_docs });
  }
  async function setShortlistVerdict(candidate, itemId, verdict) {
    const shortlist = (candidate.shortlist ?? []).map((it) => it.id === itemId ? { ...it, verdict, verdictAt: new Date().toISOString(), verdictBy: actor } : it);
    await updateCandidate(candidate.id, { shortlist });
  }

  if (session === undefined) {
    return <div className="min-h-screen grid place-items-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!session) {
    return <Login />;
  }
  if (role !== 'admin') {
    return <MyWorkPortal candidates={candidates} email={session.user?.email || ''} actor={actor} loading={loading} onSignOut={signOut}
             onSign={(c, step, sig) => signMyApproval(c, step, sig, session.user?.email || '')}
             onFillEval={(c, step, data) => fillEvalDoc(c, step, data)}
             onShortlistVerdict={(c, itemId, v) => setShortlistVerdict(c, itemId, v)} />;
  }

  return (
    <div className="min-h-screen">
      <Header
        actor={actor}
        onSignOut={signOut}
        onNew={() => setEditing('new')}
      />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="inline-flex bg-slate-100 rounded-xl p-1 text-sm">
          <button onClick={() => setTab('pipeline')} className={`px-4 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 ${tab === 'pipeline' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            <ClipboardCheck className="w-4 h-4" /> Pipeline
          </button>
          <button onClick={() => setTab('reports')} className={`px-4 py-1.5 rounded-lg font-medium inline-flex items-center gap-1.5 ${tab === 'reports' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            <BarChart3 className="w-4 h-4" /> Reports / KPI
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลดข้อมูล…
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
            โหลดข้อมูลไม่สำเร็จ: {error}
            <div className="text-xs mt-1 text-rose-700/80">ตรวจสอบ .env.local (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) และรัน schema.sql ใน Supabase</div>
          </div>
        ) : tab === 'reports' ? (
          <ReportsView candidates={candidates} />
        ) : (
          <>
            <StatsRow stats={stats} />
            <FilterBar filter={filter} setFilter={setFilter} departments={departments} />
            {filtered.length === 0 ? (
              <EmptyState onNew={() => setEditing('new')} hasFilter={Object.values(filter).some(Boolean)} />
            ) : (
              <div className="space-y-8">
                {sectionDefs.map((sec) => {
                  const list = filtered.filter((c) => bucketOf(c) === sec.key);
                  if (list.length === 0) return null;
                  return (
                    <section key={sec.key}>
                      <div className="mb-3">
                        <h2 className="text-sm font-semibold text-slate-800">{sec.title} <span className="text-slate-400 font-normal">({list.length})</span></h2>
                        <p className="text-xs text-slate-500">{sec.sub}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {list.map((c) => <CandidateCard key={c.id} c={c} onOpen={() => setOpening(c.id)} />)}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <CandidateForm
          initial={editing === 'new' ? null : editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSave={(payload) => handleSave(payload, editing === 'new' ? null : editing.id)}
        />
      )}

      {opened && (
        <CandidateDetail
          c={opened}
          onClose={() => setOpening(null)}
          onEdit={() => { setEditing(opened); setOpening(null); }}
          onDelete={() => handleDelete(opened.id)}
          onAdvance={() => advanceStep(opened)}
          onApprove={(step) => markApprovalComplete(opened, step)}
          onToggleDoc={(key) => toggleDoc(opened, key)}
          onRecordMilestone={(dayKey, score, note) => recordMilestone(opened, dayKey, score, note)}
          onProbationPassed={() => markProbationPassed(opened)}
          onEditName={() => setEditingName(opened)}
          onDropCandidate={() => dropCandidate(opened)}
          onCancelPosition={() => cancelPosition(opened)}
          onSaveDoc={(step, data, approvers) => saveDoc(opened, step, data, approvers)}
          onLogEmail={(step, entry) => logEmail(opened, step, entry)}
          actor={actor}
        />
      )}

      {editingName && (
        <CandidateNameForm
          initial={editingName.name}
          position={editingName.position}
          onClose={() => setEditingName(null)}
          onSave={async (name) => { await setCandidateName(editingName, name); setEditingName(null); }}
        />
      )}
    </div>
  );
}

function typedSignature(name) {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='260' height='64'><text x='12' y='44' font-family='Segoe Script, Brush Script MT, cursive' font-size='34' fill='#0f172a'>" + (name || '') + "</text></svg>";
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function emailOf(e) { return (e?.to || e?.email || e?.recipient || (typeof e === 'string' ? e : '') || '').toString().toLowerCase(); }
function distHasMe(c, step, me) { return (c.distributions?.[step] || []).some((e) => emailOf(e).includes(me)); }
function sentToHasMe(sentTo, me) { return Array.isArray(sentTo) && sentTo.some((s) => emailOf(s).includes(me)); }

function SignPad({ onChange }) {
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState('');
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const getCtx = () => canvasRef.current?.getContext('2d');
  const posOf = (e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { drawing.current = true; const ctx = getCtx(); const p = posOf(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const draw = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = getCtx(); const p = posOf(e); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a'; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const stop = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current.toDataURL('image/png')); };
  const clearCanvas = () => { const cv = canvasRef.current; if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); onChange(null); };
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => onChange(rd.result); rd.readAsDataURL(f); };
  const onTyped = (v) => { setTyped(v); onChange(v.trim() ? typedSignature(v.trim()) : null); };
  const Tab = ({ id, label }) => (
    <button type="button" onClick={() => { setMode(id); onChange(null); }} className={`text-xs px-3 py-1.5 rounded-lg ${mode === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
  );
  return (
    <div className="space-y-2">
      <div className="flex gap-2"><Tab id="draw" label="✍️ วาด" /><Tab id="upload" label="📤 อัปโหลด" /><Tab id="type" label="⌨️ พิมพ์" /></div>
      {mode === 'draw' && (
        <div>
          <canvas ref={canvasRef} width={400} height={120} className="border-2 border-dashed border-slate-300 rounded-lg bg-white w-full touch-none"
            onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
          <button type="button" onClick={clearCanvas} className="text-xs text-slate-500 hover:text-slate-800 mt-1">ล้างลายเซ็น</button>
        </div>
      )}
      {mode === 'upload' && (<input type="file" accept="image/*" onChange={onFile} className="text-xs" />)}
      {mode === 'type' && (
        <div>
          <input className="input w-full" value={typed} onChange={(e) => onTyped(e.target.value)} placeholder="พิมพ์ชื่อ-นามสกุล" />
          {typed.trim() && <img src={typedSignature(typed.trim())} alt="sig" style={{ height: 40 }} className="mt-2" />}
        </div>
      )}
    </div>
  );
}

function MyWorkPortal({ candidates, email, actor, loading, onSignOut, onSign, onFillEval, onShortlistVerdict }) {
  const myEmail = (email || '').toLowerCase();
  const [signing, setSigning]   = useState(null);
  const [evalForm, setEvalForm] = useState(null);
  const [viewDoc, setViewDoc]   = useState(null);
  const [sigData, setSigData]   = useState(null);
  const [busy, setBusy]         = useState(false);

  const signTasks = (candidates || []).flatMap((c) => {
    const wfs = c.approval_workflows || {};
    return Object.entries(wfs).flatMap(([step, wf]) => {
      const mine = (wf.approvers || []).find((a) => (a.email || '').toLowerCase() === myEmail);
      return mine ? [{ c, step, wf, mine }] : [];
    });
  });
  const signPending = signTasks.filter((t) => t.mine.status === 'pending');
  const signOther   = signTasks.filter((t) => t.mine.status !== 'pending');

  const evalTasks = myEmail ? (candidates || []).flatMap((c) =>
    ['4', '6'].flatMap((step) => (distHasMe(c, step, myEmail) && !c.generated_docs?.[step]) ? [{ c, step }] : [])
  ) : [];
  const evalDone = myEmail ? (candidates || []).flatMap((c) =>
    ['4', '6'].flatMap((step) => (distHasMe(c, step, myEmail) && c.generated_docs?.[step]) ? [{ c, step }] : [])
  ) : [];

  const reviewTasks = myEmail ? (candidates || []).flatMap((c) => {
    const assigned = distHasMe(c, '3', myEmail) || (c.shortlist || []).some((it) => sentToHasMe(it.sentTo, myEmail));
    const items = (c.shortlist || []).filter((it) => !it.verdict);
    return (assigned && items.length) ? [{ c, items }] : [];
  }) : [];

  const totalPending = signPending.length + evalTasks.length + reviewTasks.reduce((n, r) => n + r.items.length, 0);

  async function doSign() {
    if (!sigData || !signing) return;
    setBusy(true);
    try { await onSign(signing.c, signing.step, sigData); setSigning(null); setSigData(null); }
    catch (e) { alert('ลงนามไม่สำเร็จ: ' + (e?.message || e)); }
    finally { setBusy(false); }
  }
  async function doVerdict(c, itemId, verdict) {
    try { await onShortlistVerdict(c, itemId, verdict); }
    catch (e) { alert('บันทึกผลไม่สำเร็จ: ' + (e?.message || e)); }
  }

  const FormComp = evalForm ? (evalForm.step === '4' ? ScorecardForm : ProbationEvalForm) : null;

  function renderDoc(vd) {
    const c = vd.c, step = vd.step, data = c.generated_docs?.[step]?.data;
    if (step === '1') return <ManpowerRequestDoc data={data} candidate={c} workflow={c.approval_workflows?.['1']} />;
    if (step === '5') return <ApprovalDoc data={data} candidate={c} workflow={c.approval_workflows?.['5']} />;
    if (step === '4') return <ScorecardDoc data={data} candidate={c} />;
    if (step === '6') return <ProbationEvalDoc data={data} candidate={c} />;
    return <div className="text-sm text-slate-500">ไม่มีเอกสาร</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <JianchaLogo size={30} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">งานของฉัน</div>
              <div className="text-[11px] text-slate-500 truncate">{email}</div>
            </div>
          </div>
          <button onClick={onSignOut} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg whitespace-nowrap">ออกจากระบบ</button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> กำลังโหลดงาน…</div>
        ) : (
          <>
            {totalPending === 0 && evalDone.length === 0 && signOther.length === 0 && (
              <div className="text-sm text-slate-400 border border-dashed border-slate-300 rounded-xl p-8 text-center">ยังไม่มีงานที่รอคุณ</div>
            )}

            {signPending.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-800 mb-2">✍️ รอลงนาม ({signPending.length})</h2>
                <div className="space-y-2">{signPending.map((t, i) => (
                  <PortalRow key={'s' + i} c={t.c} step={t.step} role={t.mine.role} highlight actionLabel="ตรวจ + ลงนาม" onAction={() => setSigning(t)} />
                ))}</div>
              </section>
            )}

            {evalTasks.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-800 mb-2">📝 รอประเมิน ({evalTasks.length})</h2>
                <div className="space-y-2">{evalTasks.map((t, i) => (
                  <PortalRow key={'e' + i} c={t.c} step={t.step} role={t.step === '4' ? 'ประเมินสัมภาษณ์' : 'ประเมินทดลองงาน'} highlight actionLabel="เปิดฟอร์มประเมิน" onAction={() => setEvalForm(t)} />
                ))}</div>
              </section>
            )}

            {reviewTasks.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-800 mb-2">👥 พิจารณา Shortlist (Step 3)</h2>
                <div className="space-y-3">{reviewTasks.map((r, i) => (
                  <div key={'r' + i} className="bg-white border border-slate-200 rounded-xl p-3">
                    <div className="text-sm font-medium text-slate-900 mb-2">{r.c.position} · แผนก {r.c.department || '—'}</div>
                    <div className="space-y-2">{r.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 flex-wrap">
                        <span className="text-sm flex-1 min-w-0 truncate">👤 {it.name || '(ไม่ระบุชื่อ)'}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => doVerdict(r.c, it.id, 'pass')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg">✓ ผ่าน</button>
                          <button onClick={() => doVerdict(r.c, it.id, 'reject')} className="text-xs border-2 border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-1 rounded-lg">✕ ไม่ผ่าน</button>
                        </div>
                      </div>
                    ))}</div>
                  </div>
                ))}</div>
              </section>
            )}

            {(signOther.length > 0 || evalDone.length > 0) && (
              <section>
                <h2 className="text-sm font-semibold text-slate-800 mb-2">📋 งานที่ดำเนินการแล้ว ({signOther.length + evalDone.length})</h2>
                <div className="space-y-2">
                  {signOther.map((t, i) => (
                    <PortalRow key={'o' + i} c={t.c} step={t.step} role={t.mine.role} status={t.mine.status} onView={() => setViewDoc({ c: t.c, step: t.step })} />
                  ))}
                  {evalDone.map((t, i) => (
                    <PortalRow key={'d' + i} c={t.c} step={t.step} role={t.step === '4' ? 'ประเมินสัมภาษณ์' : 'ประเมินทดลองงาน'} status="done" onView={() => setViewDoc({ c: t.c, step: t.step })} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {signing && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 grid place-items-center p-4" onClick={() => !busy && setSigning(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold text-slate-900 mb-1">ตรวจเอกสาร + ลงนาม</div>
            <div className="text-xs text-slate-500 mb-3">{signing.c.position}{signing.c.name ? ` · ${signing.c.name}` : ''} · Step {signing.step} · บทบาท: {signing.mine.role || '—'}</div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 mb-3">กรุณาตรวจสอบเอกสารก่อนลงนาม · เมื่อลงนามแล้วระบบจะบันทึกลายเซ็น + วันเวลา และส่งต่อผู้อนุมัติลำดับถัดไปอัตโนมัติ</div>
            <div className="text-xs font-medium text-slate-600 mb-1">ลายเซ็น (วาด / อัปโหลด / พิมพ์)</div>
            <SignPad onChange={setSigData} />
            <div className="flex justify-end gap-2 mt-4">
              <button disabled={busy} onClick={() => { setSigning(null); setSigData(null); }} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button disabled={busy || !sigData} onClick={doSign} className={`px-4 py-2 text-sm rounded-lg text-white ${busy || !sigData ? 'bg-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{busy ? 'กำลังบันทึก…' : '✓ ลงนามและอนุมัติ'}</button>
            </div>
          </div>
        </div>
      )}

      {evalForm && FormComp && (
        <FormComp candidate={evalForm.c} user={{ name: actor }} onClose={() => setEvalForm(null)}
          onSave={async (data) => { try { await onFillEval(evalForm.c, evalForm.step, data); setEvalForm(null); } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e?.message || e)); } }} />
      )}

      {viewDoc && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 overflow-y-auto p-2 sm:p-6" onClick={() => setViewDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl mx-auto my-2 sm:my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div className="text-base font-semibold text-slate-900">📄 เอกสารที่เสร็จแล้ว · Step {viewDoc.step}</div>
              <button onClick={() => setViewDoc(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="p-6 sm:p-10 print-document">{renderDoc(viewDoc)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function PortalRow({ c, step, role, status, highlight, actionLabel, onAction, onView }) {
  const statusLabel = status === 'approved' ? '✓ เซ็นแล้ว' : status === 'waiting' ? '○ รอคิว' : status === 'done' ? '✓ ประเมินแล้ว' : '';
  const tone = (status === 'approved' || status === 'done') ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500';
  return (
    <div className={`bg-white border rounded-xl p-3 flex items-center justify-between gap-3 ${highlight ? 'border-sky-300' : 'border-slate-200'}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">{c.position}{c.name ? ` · ${c.name}` : ''}</div>
        <div className="text-[11px] text-slate-500">แผนก {c.department || '—'} · Step {step} · บทบาท: {role || '—'}</div>
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap">
        {statusLabel && <span className={`text-xs px-2 py-1 rounded-lg ${tone}`}>{statusLabel}</span>}
        {onView && <button onClick={onView} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg">👁 ดูเอกสาร</button>}
        {onAction && <button onClick={onAction} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg">{actionLabel}</button>}
      </div>
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

function Header({ actor, onSignOut, onNew }) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 grid place-items-center text-white">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900">Recruitment 120 Days</h1>
            <p className="text-xs text-slate-500">ระบบติดตามกระบวนการสรรหา · HR Internal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
            <UserCircle2 className="w-4 h-4" /> {actor}
          </span>
          <button onClick={onNew}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> New Requisition
          </button>
          <button onClick={onSignOut}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-sm px-2 py-2 rounded-lg"
            title="ออกจากระบบ">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Login (HR sign-in)
// ============================================================================

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      await signIn(username, password);
      // onAuthChange in App will flip to the app automatically
    } catch (e2) {
      setErr('เข้าสู่ระบบไม่สำเร็จ — ตรวจสอบ Username / รหัสผ่าน');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 mx-auto mb-3 grid place-items-center text-white">
            <Briefcase className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Recruitment 120 Days</h1>
          <p className="text-xs text-slate-500 mt-1">เข้าสู่ระบบสำหรับทีม HR</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Username</label>
            <div className="relative mt-1">
              <UserCircle2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="HR01" autoComplete="username"
                className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">รหัสผ่าน (6 หลัก)</label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" inputMode="numeric" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••" autoComplete="current-password"
                className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          </div>
          {err && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
          <button type="submit" disabled={busy || !username || !password}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Stats / Filter / Card / Empty
// ============================================================================

function StatsRow({ stats }) {
  const items = [
    { label: 'ทั้งหมด',       value: stats.total,   icon: Users,          tone: 'slate' },
    { label: 'กำลังดำเนินการ', value: stats.active,  icon: ClipboardCheck, tone: 'sky' },
    { label: 'ผ่านโปร',        value: stats.passed,  icon: CheckCircle2,   tone: 'emerald' },
    { label: 'เกิน Deadline',  value: stats.overdue, icon: AlertCircle,    tone: 'rose' }
  ];
  const toneBg = { slate: 'bg-slate-100 text-slate-700', sky: 'bg-sky-100 text-sky-700', emerald: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700' };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl grid place-items-center ${toneBg[it.tone]}`}><it.icon className="w-5 h-5" /></div>
          <div>
            <div className="text-2xl font-semibold text-slate-900 leading-tight">{it.value}</div>
            <div className="text-xs text-slate-500">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterBar({ filter, setFilter, departments }) {
  const setOne = (k, v) => setFilter((f) => ({ ...f, [k]: v }));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={filter.q} onChange={(e) => setOne('q', e.target.value)} placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก…"
          className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300" />
      </div>
      <select value={filter.dept} onChange={(e) => setOne('dept', e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
        <option value="">ทุกแผนก</option>
        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={filter.step} onChange={(e) => setOne('step', e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
        <option value="">ทุก Step</option>
        {STEPS.map((s) => <option key={s.id} value={s.id}>Step {s.id} · {s.name}</option>)}
      </select>
      <select value={filter.type} onChange={(e) => setOne('type', e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
        <option value="">ทุกประเภท</option>
        <option value="replacement">ทดแทนคนลาออก</option>
        <option value="new_headcount">อัตราใหม่</option>
      </select>
      {Object.values(filter).some(Boolean) && (
        <button onClick={() => setFilter({ dept: '', step: '', type: '', q: '' })} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1">ล้างตัวกรอง</button>
      )}
    </div>
  );
}

function CandidateCard({ c, onOpen }) {
  const status = deriveStatus(c);
  const pct = progressPercent(c);
  const step = STEPS.find((s) => s.id === c.current_step);
  const hasName = !!c.name?.trim();
  const title = hasName ? c.name : c.position;
  const subtitle = hasName ? `${c.position} · ${c.department}` : `${c.department} · ${c.type === 'replacement' ? 'ทดแทน' : 'อัตราใหม่'}`;
  return (
    <button onClick={onOpen} className="text-left bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {!hasName && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">อัตรา</span>}
            <div className="font-semibold text-slate-900 truncate">{title}</div>
          </div>
          <div className="text-xs text-slate-500 truncate">{subtitle}</div>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${toneClasses[status.tone]}`}>
          <status.icon className="w-3 h-3" /> {status.label}
        </span>
      </div>
      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>Step {c.current_step}/{TOTAL_STEPS} · {step?.name}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${status.tone === 'red' ? 'bg-rose-500' : status.tone === 'yellow' ? 'bg-amber-500' : status.tone === 'blue' ? 'bg-sky-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> เริ่ม {fmtDate(c.process_start_date)}</span>
        <span className="inline-flex items-center gap-1">{c.type === 'replacement' ? 'ทดแทน' : 'อัตราใหม่'}<ChevronRight className="w-3 h-3" /></span>
      </div>
    </button>
  );
}

function EmptyState({ onNew, hasFilter }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
      <div className="font-medium text-slate-700">{hasFilter ? 'ไม่พบรายการตามตัวกรอง' : 'ยังไม่มีอัตราในระบบ'}</div>
      <p className="text-sm text-slate-500 mt-1">{hasFilter ? 'ลองปรับหรือล้างตัวกรอง' : 'เริ่มต้นโดยกดปุ่ม "New Requisition" ด้านบน'}</p>
      {!hasFilter && (
        <button onClick={onNew} className="mt-4 inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm px-3 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> New Requisition
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Reports / KPI view
// ============================================================================

function ReportsView({ candidates }) {
  const R = useMemo(() => {
    const now = new Date();
    const yr = now.getFullYear(), mo = now.getMonth();
    const inThisMonth = (iso) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === yr && d.getMonth() === mo; };
    const monthLabel = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const stepDate = (c, step) => c.steps?.find((s) => s.step === step)?.completedDate ?? null;
    const offerDate = (c) => c.approval_workflows?.['5']?.completedAt ?? stepDate(c, 5);

    const openedThisMonth = candidates.filter((c) => inThisMonth(c.process_start_date));
    const filledThisMonth = candidates.filter((c) => { const d = offerDate(c); return d && inThisMonth(d); });
    const passedThisMonth = candidates.filter((c) => c.probation?.returnDate && inThisMonth(c.probation.returnDate));

    const active = candidates.filter((c) => c.status === 'active');
    const funnel = STEPS.map((s) => ({ id: s.id, thai: s.thai, count: active.filter((c) => c.current_step === s.id).length }));
    const funnelMax = Math.max(1, ...funnel.map((f) => f.count));

    const ttf = candidates.map((c) => { const d = offerDate(c); return d ? daysBetween(c.process_start_date, d) : null; }).filter((x) => x != null && x >= 0);
    const avgTTF = ttf.length ? Math.round(ttf.reduce((a, b) => a + b, 0) / ttf.length) : null;

    const s2 = candidates.map((c) => { const d = stepDate(c, 2); return d ? daysBetween(c.process_start_date, d) : null; }).filter((x) => x != null && x >= 0);
    const slaMet = s2.filter((x) => x <= STEP_2_DEADLINE_DAYS).length;
    const slaPct = s2.length ? Math.round(slaMet / s2.length * 100) : null;

    const overdue = active.filter((c) => deriveStatus(c).tone === 'red');

    const appr = [];
    candidates.forEach((c) => [1, 5].forEach((st) => { const wf = c.approval_workflows?.[String(st)]; if (wf?.status === 'completed' && wf.createdAt && wf.completedAt) appr.push(daysBetween(wf.createdAt, wf.completedAt)); }));
    const avgAppr = appr.length ? (appr.reduce((a, b) => a + b, 0) / appr.length).toFixed(1) : null;

    const depts = Array.from(new Set(candidates.map((c) => c.department)));
    const byDept = depts.map((d) => {
      const list = candidates.filter((c) => c.department === d);
      return { dept: d, total: list.length, active: list.filter((c) => c.status === 'active').length, passed: list.filter((c) => c.status === 'passed').length, overdue: list.filter((c) => deriveStatus(c).tone === 'red').length };
    }).sort((a, b) => b.total - a.total);
    const deptMax = Math.max(1, ...byDept.map((d) => d.total));

    const inProb = candidates.filter((c) => c.current_step === TOTAL_STEPS && c.status === 'active');
    const probScores = [];
    candidates.forEach((c) => { const ms = c.probation?.milestones; if (ms) ['day30', 'day60', 'day90', 'day120'].forEach((k) => { if (ms[k]?.score != null) probScores.push(ms[k].score); }); });
    const avgProb = probScores.length ? (probScores.reduce((a, b) => a + b, 0) / probScores.length).toFixed(1) : null;

    const offers = candidates.map((c) => c.generated_docs?.['5']).filter(Boolean);
    const sal = offers.map((o) => parseMoney(o.salary_new)).filter((x) => x > 0);
    const inc = offers.map((o) => o.total_income != null ? o.total_income : parseMoney(o.salary_new)).filter((x) => x > 0);
    const avgSal = sal.length ? Math.round(sal.reduce((a, b) => a + b, 0) / sal.length) : null;
    const avgInc = inc.length ? Math.round(inc.reduce((a, b) => a + b, 0) / inc.length) : null;

    const wl = {};
    candidates.forEach((c) => (c.steps || []).forEach((s) => { if (s.completedBy) wl[s.completedBy] = (wl[s.completedBy] || 0) + 1; }));
    const workload = Object.entries(wl).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const wlMax = Math.max(1, ...workload.map((w) => w.count));

    return { monthLabel, openedThisMonth, filledThisMonth, passedThisMonth, funnel, funnelMax, active,
      avgTTF, slaPct, slaMet, s2, overdue, avgAppr, byDept, deptMax, inProb, avgProb, probScores,
      avgSal, avgInc, offers, workload, wlMax,
      replacement: candidates.filter((c) => c.type === 'replacement').length,
      newHC: candidates.filter((c) => c.type === 'new_headcount').length };
  }, [candidates]);

  const toneMap = { slate: 'text-slate-900', sky: 'text-sky-600', emerald: 'text-emerald-600', rose: 'text-rose-600', amber: 'text-amber-600', indigo: 'text-indigo-600' };
  const Big = ({ label, value, sub, tone }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${toneMap[tone] || toneMap.slate}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
  const Bar = ({ value, max, color }) => (
    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.round(value / max * 100)}%` }} />
    </div>
  );
  const Panel = ({ title, hint, icon: Icon, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">{Icon && <Icon className="w-4 h-4 text-slate-500" />} {title}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold text-slate-700 mb-2">📅 สรุปเดือนนี้ · {R.monthLabel}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Big tone="sky"     label="เปิดตำแหน่งใหม่"          value={R.openedThisMonth.length} sub="New requisitions" />
          <Big tone="amber"   label="ได้ผู้สมัคร (อนุมัติ Offer)" value={R.filledThisMonth.length} sub="Positions filled" />
          <Big tone="emerald" label="ผ่านโปรเดือนนี้"          value={R.passedThisMonth.length} sub="Passed probation" />
          <Big tone="rose"    label="เกิน Deadline ตอนนี้"     value={R.overdue.length} sub="ต้อง follow up" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Big tone="indigo"  label="Time-to-fill เฉลี่ย"    value={R.avgTTF != null ? `${R.avgTTF} วัน` : '—'} sub="เปิดอัตรา → อนุมัติ Offer" />
        <Big tone="sky"     label="Sourcing SLA (≤30 วัน)" value={R.slaPct != null ? `${R.slaPct}%` : '—'} sub={`ทำได้ ${R.slaMet}/${R.s2.length} ตำแหน่ง`} />
        <Big tone="emerald" label="เวลาอนุมัติเฉลี่ย"        value={R.avgAppr != null ? `${R.avgAppr} วัน` : '—'} sub="Step 1 & 6 (สร้าง → เซ็นครบ)" />
        <Big tone="slate"   label="กำลังดำเนินการ"          value={R.active.length} sub={`ทดแทน ${R.replacement} · ใหม่ ${R.newHC}`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Pipeline Funnel" icon={TrendingUp} hint="ตำแหน่ง active แยกตาม Step">
          <div className="space-y-2">
            {R.funnel.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <div className="w-6 text-slate-400 text-right">{f.id}</div>
                <div className="w-40 truncate text-slate-600">{f.thai}</div>
                <Bar value={f.count} max={R.funnelMax} color="bg-sky-500" />
                <div className="w-6 text-right font-semibold text-slate-700">{f.count}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="แยกตามแผนก" icon={Building2} hint="total · active · ผ่านโปร">
          <div className="space-y-2">
            {R.byDept.map((d) => (
              <div key={d.dept} className="flex items-center gap-2 text-xs">
                <div className="w-32 truncate text-slate-600">{d.dept}</div>
                <Bar value={d.total} max={R.deptMax} color="bg-indigo-500" />
                <div className="w-24 text-right text-slate-500"><b className="text-slate-700">{d.total}</b> · {d.active}🔵 · {d.passed}✓{d.overdue ? ` · ${d.overdue}⚠` : ''}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="สุขภาพการทดลองงาน" icon={ShieldCheck} hint={`กำลังทดลองงาน ${R.inProb.length} คน`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">คะแนนประเมินเฉลี่ย</div><div className="text-xl font-bold text-emerald-600">{R.avgProb ?? '—'} <span className="text-xs text-slate-400">/ 10</span></div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">รอบประเมินที่บันทึก</div><div className="text-xl font-bold text-slate-700">{R.probScores.length}</div></div>
          </div>
        </Panel>
        <Panel title="ค่าตอบแทน (จาก Offer ที่อนุมัติ)" icon={Wallet} hint={`${R.offers.length} ตำแหน่ง`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">เงินเดือนเริ่มต้นเฉลี่ย</div><div className="text-xl font-bold text-slate-800">{R.avgSal != null ? fmtMoney(R.avgSal) : '—'} <span className="text-xs text-slate-400">บาท</span></div></div>
            <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">รวมรายได้เฉลี่ย/เดือน</div><div className="text-xl font-bold text-emerald-600">{R.avgInc != null ? fmtMoney(R.avgInc) : '—'} <span className="text-xs text-slate-400">บาท</span></div></div>
          </div>
        </Panel>
      </div>

      <Panel title="ภาระงานทีม HR (Step ที่ทำเสร็จ)" icon={Users} hint="นับจาก completedBy">
        <div className="space-y-2">
          {R.workload.map((w) => (
            <div key={w.name} className="flex items-center gap-2 text-xs">
              <div className="w-40 truncate text-slate-600">{w.name}</div>
              <Bar value={w.count} max={R.wlMax} color="bg-amber-500" />
              <div className="w-8 text-right font-semibold text-slate-700">{w.count}</div>
            </div>
          ))}
          {R.workload.length === 0 && <div className="text-xs text-slate-400 italic">ยังไม่มีข้อมูล</div>}
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Add/Edit form
// ============================================================================

function CandidateForm({ initial, departments, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    name:               initial?.name ?? '',
    position:           initial?.position ?? '',
    department:         initial?.department ?? '',
    type:               initial?.type ?? 'replacement',
    process_start_date: initial?.process_start_date ?? todayISO(),
    notes:              initial?.notes ?? ''
  }));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    if (!form.position.trim() || !form.department.trim()) { alert('กรุณากรอก ตำแหน่ง / แผนก ให้ครบ'); return; }
    onSave({ ...form, name: form.name.trim() || null });
  };
  return (
    <Modal title={initial ? 'แก้ไขตำแหน่ง' : 'New Requisition'} subtitle={initial ? undefined : 'เริ่ม Step 1 · ชื่อผู้สมัครใส่ภายหลังเมื่อผ่านสัมภาษณ์'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="ตำแหน่ง" required>
          <input className="input" value={form.position} onChange={(e) => set('position', e.target.value)} placeholder="เช่น Store Manager, Barista Lead" autoFocus />
        </Field>
        {initial && (
          <Field label="ชื่อผู้สมัคร (หลังผ่านสัมภาษณ์)">
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="ใส่หลังผ่าน Step 4" />
          </Field>
        )}
        <Field label="แผนก" required>
          <input list="dept-list" className="input" value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="เลือกหรือพิมพ์ชื่อแผนก" />
          <datalist id="dept-list">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ประเภท">
            <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="replacement">ทดแทนคนลาออก</option>
              <option value="new_headcount">อัตราใหม่</option>
            </select>
          </Field>
          <Field label="วันเริ่ม Process">
            <input type="date" className="input" value={form.process_start_date} onChange={(e) => set('process_start_date', e.target.value)} />
          </Field>
        </div>
        <Field label="หมายเหตุ (ถ้ามี)">
          <textarea rows={3} className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-lg">บันทึก</button>
        </div>
      </form>
      <style>{`.input{ width:100%; border:1px solid #e2e8f0; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; background:white;} .input:focus{ outline:none; box-shadow:0 0 0 2px #cbd5e1;}`}</style>
    </Modal>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1">{label} {required && <span className="text-rose-500">*</span>}</div>
      {children}
    </label>
  );
}

function CandidateNameForm({ initial, position, onClose, onSave }) {
  const [name, setName] = useState(initial ?? '');
  const submit = (e) => { e.preventDefault(); if (!name.trim()) { alert('กรุณาใส่ชื่อ-นามสกุลผู้สมัคร'); return; } onSave(name.trim()); };
  return (
    <Modal title="ใส่ชื่อผู้สมัครที่ผ่านสัมภาษณ์" subtitle={position} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="ชื่อ-นามสกุล ผู้สมัคร" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สมศรี รักงาน" autoFocus />
        </Field>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
          ✓ หลังบันทึก การ์ดจะเปลี่ยนจาก "{position}" เป็นชื่อผู้สมัครคนนี้
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-lg">บันทึก</button>
        </div>
      </form>
      <style>{`.input{ width:100%; border:1px solid #e2e8f0; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; background:white;} .input:focus{ outline:none; box-shadow:0 0 0 2px #cbd5e1;}`}</style>
    </Modal>
  );
}

// ============================================================================
// Candidate detail
// ============================================================================

function CandidateDetail({ c, onClose, onEdit, onDelete, onAdvance, onApprove, onToggleDoc, onRecordMilestone, onProbationPassed, onEditName, onDropCandidate, onCancelPosition, onSaveDoc, onLogEmail, actor }) {
  const status = deriveStatus(c);
  const documents = c.documents?.length ? c.documents : DOCUMENT_TEMPLATE.map((d) => ({ ...d, received: false, receivedDate: null }));
  const probation = c.probation ?? {};
  const probationStart = probation.startDate ?? c.process_start_date;
  const daysInProbation = c.current_step === TOTAL_STEPS ? daysBetween(probationStart, today()) : 0;
  const [docForm, setDocForm] = useState(null); // step number for create/edit form
  const [docView, setDocView] = useState(null); // step number for view/print
  const [emailStep, setEmailStep] = useState(null); // step number for email composer
  const hasName = !!c.name?.trim();
  const title = hasName ? c.name : c.position;
  const subtitle = hasName ? `${c.position} · ${c.department}` : `${c.department} · ${c.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'}`;

  function handleMilestone(dayKey) {
    const score = prompt(`บันทึกคะแนนประเมิน ${dayKey.replace('day', 'Day ')} (1–10):`, '8');
    if (score === null) return;
    const note = prompt('หมายเหตุ (ถ้ามี):', '') ?? '';
    onRecordMilestone(dayKey, score, note);
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} wide>
      <div className="flex items-center justify-between gap-2 -mt-2 mb-4 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${toneClasses[status.tone]}`}>
          <status.icon className="w-3.5 h-3.5" /> {status.label}
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {!hasName && c.status === 'active' && (
            <button onClick={onEditName} className="text-xs bg-sky-600 hover:bg-sky-700 text-white inline-flex items-center gap-1 px-2.5 py-1 rounded-lg"><UserCircle2 className="w-3.5 h-3.5" /> + ใส่ชื่อผู้สมัคร</button>
          )}
          {hasName && c.status === 'active' && (
            <button onClick={onEditName} className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100"><Edit2 className="w-3.5 h-3.5" /> แก้ชื่อ</button>
          )}
          <button onClick={onEdit} className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100"><Edit2 className="w-3.5 h-3.5" /> แก้ตำแหน่ง</button>
          {hasName && c.status === 'active' && (
            <button onClick={onDropCandidate} className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-50"><X className="w-3.5 h-3.5" /> ผู้สมัครถอน</button>
          )}
          {c.status === 'active' && (
            <button onClick={onCancelPosition} className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50"><Trash2 className="w-3.5 h-3.5" /> ยกเลิกตำแหน่ง</button>
          )}
        </div>
      </div>

      {!hasName && c.current_step >= 5 && c.status === 'active' && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div className="flex-1"><b>ต้องใส่ชื่อผู้สมัครก่อน</b> · ผ่านสัมภาษณ์แล้วใส่ชื่อก่อนถึงจะไป Step ถัดไปได้</div>
          <button onClick={onEditName} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg whitespace-nowrap">+ ใส่ชื่อ</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-5">
        <Info icon={Calendar} label="วันเริ่ม Process" value={fmtDate(c.process_start_date)} />
        <Info icon={CalendarClock} label="Deadline สรรหา (Step 2)" value={fmtDate(addDays(c.process_start_date, STEP_2_DEADLINE_DAYS))} />
        <Info icon={Briefcase} label="ประเภท" value={c.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'} />
        <Info icon={UserCircle2} label="ผู้สร้าง" value={c.created_by || '—'} />
      </div>

      {/* Step tracker */}
      <Section icon={ClipboardCheck} title={`ขั้นตอนทั้งหมด (${TOTAL_STEPS} Steps)`}>
        <ol className="space-y-1.5">
          {STEPS.map((s) => {
            const done = s.id < c.current_step || c.status === 'passed';
            const current = s.id === c.current_step && c.status === 'active';
            const log = c.steps?.find((x) => x.step === s.id);
            const needsApproval = APPROVAL_STEPS.includes(s.id);
            const wf = c.approval_workflows?.[String(s.id)];
            const approved = wf?.status === 'completed';
            return (
              <li key={s.id} className={`flex items-start gap-3 p-2.5 rounded-lg border ${current ? 'bg-sky-50 border-sky-200' : done ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-slate-100'}`}>
                <div className={`mt-0.5 w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold ${done ? 'bg-emerald-500 text-white' : current ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{s.id}. {s.name} <span className="text-slate-400 font-normal">· {s.thai}</span></div>
                  <div className="text-[11px] text-slate-500">{s.owner}{s.note ? ` · ${s.note}` : ''}{log ? ` · เสร็จ ${fmtDate(log.completedDate)}${log.completedBy ? ` (${log.completedBy})` : ''}` : ''}</div>
                </div>
                {current && needsApproval && !approved && (
                  <button onClick={() => onApprove(s.id)} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg whitespace-nowrap inline-flex items-center gap-1"><PenLine className="w-3.5 h-3.5" /> บันทึกอนุมัติครบ</button>
                )}
                {current && c.current_step < TOTAL_STEPS && (!needsApproval || approved) && (
                  <button onClick={onAdvance} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg whitespace-nowrap">ผ่าน Step →</button>
                )}
                {current && c.current_step === TOTAL_STEPS && c.status === 'active' && daysInProbation >= PROBATION_ELIGIBLE && (
                  <button onClick={onProbationPassed} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg whitespace-nowrap">ผ่านโปร ✓</button>
                )}
              </li>
            );
          })}
        </ol>
        {APPROVAL_STEPS.includes(c.current_step) && c.approval_workflows?.[String(c.current_step)]?.status !== 'completed' && (
          <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
            ⓘ Step นี้ต้องเซ็นอนุมัติตามลำดับ — portal e-signature จริงอยู่ในเฟสถัดไป (ดูสเปกใน <code>preview.html</code>). ตอนนี้กด "บันทึกอนุมัติครบ" เพื่อบันทึกว่าอนุมัติเสร็จแล้ว
          </div>
        )}
      </Section>

      {/* Documents (สร้าง/พิมพ์เอกสารแต่ละ step) */}
      <Section icon={FileText} title="เอกสาร (Documents)" subtitle="สร้าง · กรอก · พิมพ์/PDF">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.keys(DOC_LABELS).map((k) => {
            const step = Number(k);
            const info = DOC_LABELS[step];
            const ported = [1, 4, 5, 6].includes(step); // เอกสารที่พอร์ตเข้าระบบจริงแล้วครบ
            const made = !!c.generated_docs?.[step];
            return (
              <div key={step} className={`p-3 rounded-lg border ${made ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                <div className="text-[11px] text-slate-400">Step {step}</div>
                <div className="text-sm font-medium text-slate-800">{info.thai}</div>
                <div className="text-[11px] text-slate-500 mb-2">{info.name}</div>
                {!ported ? (
                  <div className="text-[11px] text-slate-400 italic">กำลังพอร์ตเข้าระบบ (เร็วๆ นี้)</div>
                ) : made ? (
                  <div className="flex gap-2">
                    <button onClick={() => setDocView(step)} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg">👁 ดู/พิมพ์</button>
                    <button onClick={() => setDocForm(step)} className="text-xs text-slate-600 hover:text-slate-900 border border-slate-300 px-2.5 py-1 rounded-lg">✎ แก้ไข</button>
                  </div>
                ) : (
                  <button onClick={() => setDocForm(step)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg">+ สร้างเอกสาร</button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Shortlist + ผลพิจารณาต้นสังกัด (Step 3) */}
      {c.shortlist?.length > 0 && (
        <Section icon={Users} title="Shortlist · ผลพิจารณาต้นสังกัด" subtitle="ผ่าน/ไม่ผ่าน รายผู้สมัคร (Step 3)">
          <div className="space-y-2">
            {c.shortlist.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2 flex-wrap">
                <span className="text-sm flex-1 min-w-0 truncate">👤 {it.name || '(ไม่ระบุชื่อ)'}</span>
                {it.verdict ? (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${it.verdict === 'pass' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-700 border-rose-300'}`}>{it.verdict === 'pass' ? '✓ ผ่าน · ให้นัดสัมภาษณ์' : '✕ ไม่ผ่าน'}{it.verdictBy ? ` · ${it.verdictBy}` : ''}</span>
                ) : (
                  <span className="text-xs text-slate-400">⏳ รอต้นสังกัดพิจารณา</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Email (ส่งอีเมลจากระบบ ผ่านกล่องกลาง HR) */}
      <Section icon={Mail} title="อีเมล (Email)" subtitle={`ส่งจาก ${HR_EMAIL}`}>
        {(() => {
          const sent = c.distributions?.[c.current_step] ?? [];
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setEmailStep(c.current_step)} className="text-xs inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg">
                  <Send className="w-3.5 h-3.5" /> ส่งอีเมล (Step {c.current_step})
                </button>
                <span className="text-[11px] text-slate-400">ระบบเติมหัวเรื่อง/เนื้อหาให้ตาม step · แก้ไขผู้รับ/ข้อความได้ก่อนส่ง</span>
              </div>
              {sent.length > 0 && (
                <ul className="text-[11px] text-slate-600 space-y-1">
                  {sent.map((e, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-emerald-600">✓</span>
                      <span className="flex-1 truncate">{e.subject} → {e.to}</span>
                      <span className="text-slate-400 whitespace-nowrap">{fmtDate(e.sentAt)} · {e.by}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}
      </Section>

      {emailStep != null && (
        <EmailComposer
          candidate={c}
          step={emailStep}
          actor={actor}
          onClose={() => setEmailStep(null)}
          onSent={(entry) => { onLogEmail(emailStep, entry); setEmailStep(null); }}
        />
      )}

      {docForm === 1 && (
        <ManpowerRequestForm
          initial={c.generated_docs?.[1]?.data ?? null}
          candidate={c}
          user={{ name: actor }}
          onClose={() => setDocForm(null)}
          onSave={(data, approvers) => { onSaveDoc(1, data, approvers); setDocForm(null); }}
        />
      )}
      {docView === 1 && c.generated_docs?.[1] && (
        <DocViewer title={DOC_LABELS[1].thai} onClose={() => setDocView(null)}>
          <ManpowerRequestDoc data={c.generated_docs[1].data} candidate={c} workflow={c.approval_workflows?.[1]} />
        </DocViewer>
      )}
      {docForm === 5 && (
        <ApprovalForm
          initial={c.generated_docs?.[5]?.data ?? null}
          candidate={c}
          user={{ name: actor }}
          onClose={() => setDocForm(null)}
          onSave={(data, approvers) => { onSaveDoc(5, data, approvers); setDocForm(null); }}
        />
      )}
      {docView === 5 && c.generated_docs?.[5] && (
        <DocViewer title={DOC_LABELS[5].thai} onClose={() => setDocView(null)}>
          <ApprovalDoc data={c.generated_docs[5].data} candidate={c} workflow={c.approval_workflows?.[5]} />
        </DocViewer>
      )}
      {docForm === 4 && (
        <ScorecardForm initial={c.generated_docs?.[4]?.data ?? null} candidate={c} user={{ name: actor }}
          onClose={() => setDocForm(null)} onSave={(data) => { onSaveDoc(4, data); setDocForm(null); }} />
      )}
      {docView === 4 && c.generated_docs?.[4] && (
        <DocViewer title={DOC_LABELS[4].thai} onClose={() => setDocView(null)}>
          <ScorecardDoc data={c.generated_docs[4].data} candidate={c} />
        </DocViewer>
      )}
      {docForm === 6 && (
        <ProbationEvalForm initial={c.generated_docs?.[6]?.data ?? null} candidate={c} user={{ name: actor }}
          onClose={() => setDocForm(null)} onSave={(data) => { onSaveDoc(6, data); setDocForm(null); }} />
      )}
      {docView === 6 && c.generated_docs?.[6] && (
        <DocViewer title={DOC_LABELS[6].thai} onClose={() => setDocView(null)}>
          <ProbationEvalDoc data={c.generated_docs[6].data} candidate={c} />
        </DocViewer>
      )}

      {/* Probation tracker (Step 6 / passed) */}
      {(c.current_step === TOTAL_STEPS || c.status === 'passed') && (
        <Section icon={ShieldCheck} title="ทดลองงาน 120 วัน (Step 6)" subtitle={c.status === 'passed' ? 'ผ่านโปรแล้ว' : `วันที่ ${Math.min(daysInProbation, PROBATION_DAYS)} / ${PROBATION_DAYS}`}>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="grid grid-cols-4 gap-2 mb-3 text-center text-[11px]">
              {[['day30', 30], ['day60', 60], ['day90', 90], ['day120', 119]].map(([key, day]) => {
                const ms = probation.milestones?.[key];
                const eligible = daysInProbation >= day;
                const isPassMilestone = key === 'day120';
                return (
                  <div key={key} className={`rounded-lg py-2 ${ms?.done ? 'bg-emerald-100 text-emerald-800' : eligible ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    <div className="font-semibold">{isPassMilestone ? 'Day 119' : `Day ${day}`}</div>
                    <div>{ms?.done ? (ms.score != null ? `${ms.score}/10` : '✓') : (eligible ? 'ถึงกำหนด' : '—')}</div>
                    {!isPassMilestone && c.status === 'active' && eligible && !ms?.done && (
                      <button onClick={() => handleMilestone(key)} className="mt-1 text-[10px] bg-amber-600 hover:bg-amber-700 text-white px-1.5 py-0.5 rounded">บันทึก</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (daysInProbation / PROBATION_DAYS) * 100)}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-xs">
              <Info icon={Calendar} label="วันเริ่มงาน" value={fmtDate(probation.startDate)} />
              <Info icon={FileText} label="ส่งฟอร์มประเมินแล้ว" value={fmtDate(probation.evaluationSentDate)} />
              <Info icon={FileCheck} label="ผ่านโปรเมื่อ" value={probation.returnDate ? fmtDate(probation.returnDate) : 'ยังไม่ผ่าน'} />
            </div>
            {c.status === 'active' && daysInProbation >= PROBATION_ELIGIBLE && (
              <button onClick={onProbationPassed} className="mt-4 w-full inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4" /> บันทึก "ผ่านโปร" (Day 119+)
              </button>
            )}
          </div>
        </Section>
      )}

      {c.notes && (
        <Section icon={FileText} title="หมายเหตุ">
          <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded-xl p-3">{c.notes}</div>
        </Section>
      )}

      <div className="text-[11px] text-slate-400 mt-2">📤 อีเมลทุกฉบับส่งจากกล่องกลาง HR: <b>{HR_EMAIL}</b> · เอกสาร/ลายเซ็น/อีเมลแบบเต็มดูใน preview.html (เฟสถัดไป)</div>
    </Modal>
  );
}

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5"><Icon className="w-4 h-4 text-slate-500" /> {title}</h3>
        {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className="text-sm text-slate-800 font-medium mt-0.5">{value}</div>
    </div>
  );
}

// ============================================================================
// Modal shell
// ============================================================================

function Modal({ title, subtitle, onClose, wide, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-6" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full ${wide ? 'max-w-3xl' : 'max-w-md'} mx-auto my-2 sm:my-8`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 truncate">{title}</div>
            {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Document components (printable JIANCHA forms)
// ============================================================================

function JianchaLogo({ size = 64 }) {
  return <img src="/jiancha-logo.jpg" alt="JIANCHA" style={{ height: size, width: 'auto', display: 'block' }} />;
}

function DocHeader({ step, candidate }) {
  const info = DOC_LABELS[step];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', borderBottom: '2px solid #0f172a', paddingBottom: '10px', marginBottom: '8px' }}>
        <JianchaLogo size={64} />
        <div style={{ textAlign: 'right', flex: 1 }}>
          <h1 style={{ margin: 0 }}>{info.thai}</h1>
          <div className="form-title-en">{info.name}</div>
        </div>
      </div>
      {candidate && (
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#475569', fontSize: '10px', fontWeight: 600 }}>เกี่ยวกับ:</span>
          <span style={{ fontWeight: 700 }}>{candidate.name || candidate.position}</span>
          {candidate.name && <span style={{ color: '#475569' }}>· ตำแหน่ง <b>{candidate.position}</b></span>}
          <span style={{ color: '#475569' }}>· แผนก <b>{candidate.department}</b></span>
          <span style={{ color: '#64748b' }}>· {candidate.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'}</span>
        </div>
      )}
    </>
  );
}

function Cb({ checked, label }) {
  return (
    <span className="check-item"><span className={`checkbox ${checked ? 'checked' : ''}`}></span><span>{label}</span></span>
  );
}

function SignatureBlocks({ labels, workflow }) {
  const useWf = workflow?.approvers?.length > 0;
  const items = useWf
    ? workflow.approvers.map((a) => ({ label: a.role, sublabel: 'Approver', approver: a }))
    : labels.map((l) => ({ label: l.th, sublabel: l.en, approver: null }));
  const cols = Math.min(items.length || 1, 4);
  return (
    <div className="sig-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((it, i) => (
        <div key={i} className="sig-box">
          <div className="sig-label">{it.label}</div>
          <div className="sig-label-en">{it.sublabel}</div>
          {it.approver?.status === 'approved' && it.approver.signature_data ? (
            <div style={{ marginTop: 'auto', textAlign: 'center' }}>
              <img src={it.approver.signature_data} alt="signature" style={{ height: '34px', maxWidth: '95%', margin: '0 auto', display: 'block' }} />
              <div className="sig-line">({it.approver.name})<br />{it.approver.role}<br />✓ ลงนาม {fmtDate(it.approver.signedAt)}</div>
            </div>
          ) : it.approver ? (
            <div className="sig-line">
              {it.approver.status === 'approved' ? '✓ อนุมัติแล้ว' : it.approver.status === 'pending' ? '⏳ รอลงนาม' : '○ รอคิว'}<br />
              ({it.approver.name})<br />{it.approver.role}
            </div>
          ) : (
            <div className="sig-line">ลงชื่อ ...........................<br />(...........................)<br />วันที่ ___ / ___ / ______</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ApproverList({ approvers, setApprovers, label }) {
  const set = (i, k, v) => setApprovers(approvers.map((a, j) => j === i ? { ...a, [k]: v } : a));
  const add = () => setApprovers([...approvers, { name: '', email: '', role: '' }]);
  const rm = (i) => setApprovers(approvers.filter((_, j) => j !== i));
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">{label} (เซ็นตามลำดับ)</div>
        <button type="button" onClick={add} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-800 text-white">+ เพิ่มผู้อนุมัติ</button>
      </div>
      {approvers.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-4 text-center">{i + 1}</span>
          <input className="input text-xs flex-1" placeholder="ชื่อ-นามสกุล" value={a.name} onChange={(e) => set(i, 'name', e.target.value)} />
          <input className="input text-xs flex-1" placeholder="email" value={a.email} onChange={(e) => set(i, 'email', e.target.value)} />
          <input className="input text-xs flex-1" placeholder="ตำแหน่ง/บทบาท" value={a.role} onChange={(e) => set(i, 'role', e.target.value)} />
          <button type="button" onClick={() => rm(i)} className="text-rose-500 hover:text-rose-700 text-sm px-1">✕</button>
        </div>
      ))}
    </div>
  );
}

function DocViewer({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 overflow-y-auto p-2 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl mx-auto my-4" onClick={(e) => e.stopPropagation()}>
        <div className="no-print flex items-center justify-between p-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg">🖨 พิมพ์ / PDF</button>
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1.5">ปิด</button>
          </div>
        </div>
        <div className="p-4 sm:p-6 print-area">{children}</div>
      </div>
    </div>
  );
}

// ===== Step 1: Manpower Requisition Form =====
function ManpowerRequestForm({ initial, candidate, user, onClose, onSave }) {
  const [form, setForm] = useState(initial ?? {
    proposed_date: todayISO(),
    division: candidate.department,
    level: 'JG5',
    jd: '',
    gender: 'ไม่ระบุ',
    age_min: 25,
    age_max: 35,
    experience_required: 'required',
    experience_years: 3,
    education: ['ปริญญาตรี'],
    additional: '',
    reason_type: 'new_plan',
    replace_name: '',
    replace_reason: 'ลาออก',
    employment_type: 'monthly',
    contract_months: 12,
    necessities: ['เพิ่มกำลังคนเพื่อรองรับงานที่เพิ่มขึ้น'],
    proposer_name: user?.name ?? '',
    proposer_position: '',
    proposer_division: candidate.department,
    hr_received_date: '',
    hr_duration: '30',
    hr_recruiter_name: user?.name ?? '',
    hr_recruiter_position: 'HR Recruiter'
  });
  const [approvers, setApprovers] = useState(() =>
    (initial?._approvers) ?? [
      { name: '', email: '', role: 'หัวหน้าต้นสังกัด' },
      { name: '', email: '', role: 'HR Manager / Director' },
      { name: '', email: '', role: 'MD / CEO' }
    ]
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const submit = (e) => {
    e.preventDefault();
    if (!form.jd.trim()) { alert('กรุณากรอกหน้าที่และความรับผิดชอบ'); return; }
    if (form.age_min !== '' && form.age_max !== '' && Number(form.age_min) > Number(form.age_max)) { alert('อายุต่ำสุดต้องน้อยกว่าหรือเท่ากับอายุสูงสุด'); return; }
    if (!approvers.every((a) => a.name && a.email)) { alert('กรุณากรอกชื่อ + อีเมลผู้อนุมัติให้ครบทุกคน (หรือลบคนที่ไม่ใช้)'); return; }
    onSave({ ...form, _approvers: approvers }, approvers);
  };
  return (
    <Modal title="สร้าง Manpower Requisition Form" subtitle={`Step 1 · ${candidate.position} · ${candidate.department}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันที่เสนอขอ"><input type="date" className="input" value={form.proposed_date} onChange={(e) => set('proposed_date', e.target.value)} /></Field>
          <Field label="ฝ่าย (Division)"><input className="input" value={form.division} onChange={(e) => set('division', e.target.value)} /></Field>
        </div>
        <Field label="เกรด/ระดับ" required>
          <select className="input" value={form.level} onChange={(e) => set('level', e.target.value)}>
            {LEVELS.map((l) => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}
          </select>
        </Field>
        <Field label="หน้าที่และความรับผิดชอบ (JD เบื้องต้น)" required>
          <textarea rows={5} className="input" value={form.jd} onChange={(e) => set('jd', e.target.value)} placeholder="เขียน JD เป็นข้อ ๆ หรือเป็นย่อหน้า" />
        </Field>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">คุณสมบัติผู้สมัคร</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="เพศ">
              <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}><option>ไม่ระบุ</option><option>ชาย</option><option>หญิง</option></select>
            </Field>
            <Field label="อายุ (ปี)">
              <div className="flex items-center gap-1">
                <input type="number" min="15" max="80" className="input text-center" placeholder="ต่ำ" value={form.age_min} onChange={(e) => set('age_min', e.target.value ? Number(e.target.value) : '')} />
                <span className="text-slate-400">–</span>
                <input type="number" min="15" max="80" className="input text-center" placeholder="สูง" value={form.age_max} onChange={(e) => set('age_max', e.target.value ? Number(e.target.value) : '')} />
              </div>
            </Field>
            <Field label="ประสบการณ์">
              <select className="input" value={form.experience_required} onChange={(e) => set('experience_required', e.target.value)}><option value="not_required">ไม่จำเป็น</option><option value="required">มีประสบการณ์</option></select>
            </Field>
          </div>
          {form.experience_required === 'required' && (
            <Field label="ประสบการณ์อย่างน้อย (ปี)"><input type="number" min="0" className="input" value={form.experience_years} onChange={(e) => set('experience_years', Number(e.target.value))} /></Field>
          )}
          <Field label="วุฒิการศึกษา (เลือกได้หลายข้อ)">
            <div className="flex flex-wrap gap-2 text-xs">
              {['ต่ำกว่า ม.6 / ปวช.', 'ปวส.', 'ปริญญาตรี', 'ปริญญาโท'].map((e) => (
                <label key={e} className={`px-2 py-1 rounded border cursor-pointer ${form.education.includes(e) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 text-slate-600'}`}>
                  <input type="checkbox" className="mr-1" checked={form.education.includes(e)} onChange={() => toggleArr('education', e)} />{e}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Field label="รายละเอียดเพิ่มเติม (คุณสมบัติพิเศษ)">
          <textarea rows={3} className="input" value={form.additional} onChange={(e) => set('additional', e.target.value)} placeholder="เช่น ใช้ภาษาอังกฤษได้ดี · มี certification เฉพาะ" />
        </Field>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">เหตุผลการขอว่าจ้าง</div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'new_plan'} onChange={() => set('reason_type', 'new_plan')} /> อัตราใหม่ ตามแผนอัตรากำลังคนประจำปี</label>
            <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'new_unplanned'} onChange={() => set('reason_type', 'new_unplanned')} /> อัตราใหม่ นอกแผน</label>
            <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'replace'} onChange={() => set('reason_type', 'replace')} /> เพื่อทดแทน</label>
            {form.reason_type === 'replace' && (
              <div className="grid grid-cols-2 gap-2 ml-6">
                <input className="input" placeholder="ชื่อ-นามสกุล" value={form.replace_name} onChange={(e) => set('replace_name', e.target.value)} />
                <select className="input" value={form.replace_reason} onChange={(e) => set('replace_reason', e.target.value)}><option>ลาออก</option><option>ไม่ผ่านทดลองงาน</option><option>โยกย้าย/เกษียณ</option></select>
              </div>
            )}
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ลักษณะการจ้างงาน</div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'monthly'} onChange={() => set('employment_type', 'monthly')} /> พนักงานรายเดือน</label>
            <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'daily'} onChange={() => set('employment_type', 'daily')} /> พนักงานรายวัน</label>
            <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'contract'} onChange={() => set('employment_type', 'contract')} /> พนักงานรายสัญญาจ้าง</label>
            {form.employment_type === 'contract' && (
              <div className="ml-6"><input type="number" min="1" className="input" style={{ maxWidth: 120 }} value={form.contract_months} onChange={(e) => set('contract_months', Number(e.target.value))} /> เดือน</div>
            )}
          </div>
        </div>
        <Field label="ความจำเป็นการขอว่าจ้าง (เลือกได้มากกว่า 1)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
            {NECESSITY_OPTIONS.map((n) => (
              <label key={n} className={`p-2 rounded border cursor-pointer ${form.necessities.includes(n) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                <input type="checkbox" className="mr-1" checked={form.necessities.includes(n)} onChange={() => toggleArr('necessities', n)} />{n}
              </label>
            ))}
          </div>
        </Field>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ผู้เสนอขอ (Proposer)</div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="ชื่อ-นามสกุล" value={form.proposer_name} onChange={(e) => set('proposer_name', e.target.value)} />
            <input className="input" placeholder="ตำแหน่ง" value={form.proposer_position} onChange={(e) => set('proposer_position', e.target.value)} />
            <input className="input" placeholder="ฝ่าย" value={form.proposer_division} onChange={(e) => set('proposer_division', e.target.value)} />
          </div>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-indigo-800">ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล (HR กรอก)</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="วันที่รับแบบขออัตรากำลังคน"><input type="date" className="input" value={form.hr_received_date} onChange={(e) => set('hr_received_date', e.target.value)} /></Field>
            <Field label="ระยะเวลาการสรรหา">
              <select className="input" value={form.hr_duration} onChange={(e) => set('hr_duration', e.target.value)}><option value="30">ภายใน 30 วัน</option><option value="45">ภายใน 45 วัน</option><option value="60">ภายใน 60 วัน</option></select>
            </Field>
            <Field label="ชื่อผู้รับผิดชอบการสรรหา"><input className="input" value={form.hr_recruiter_name} onChange={(e) => set('hr_recruiter_name', e.target.value)} placeholder="ชื่อ-นามสกุล" /></Field>
            <Field label="ตำแหน่ง"><input className="input" value={form.hr_recruiter_position} onChange={(e) => set('hr_recruiter_position', e.target.value)} placeholder="เช่น HR Recruiter" /></Field>
          </div>
        </div>
        <ApproverList approvers={approvers} setApprovers={setApprovers} label="ผู้อนุมัติเปิดอัตรา" />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึกเอกสาร + ส่งอนุมัติ</button>
        </div>
      </form>
      <style>{`.input{ width:100%; border:1px solid #e2e8f0; border-radius:0.5rem; padding:0.5rem 0.75rem; font-size:0.875rem; background:white;} .input:focus{ outline:none; box-shadow:0 0 0 2px #cbd5e1;}`}</style>
    </Modal>
  );
}

function ManpowerRequestDoc({ data, candidate, workflow }) {
  const levelObj = LEVELS.find((l) => l.code === data.level) ?? { code: data.level, label: '' };
  const edu = data.education ?? [];
  const nec = data.necessities ?? [];
  return (
    <div className="print-document">
      <DocHeader step={1} candidate={candidate} />
      <div className="section-bar">ส่วนที่ 1 : สำหรับต้นสังกัดกรอกรายละเอียด</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ตำแหน่ง</td><td className="val" style={{ width: '35%' }}><b>{candidate.position}</b></td>
            <td className="lbl" style={{ width: '15%' }}>วันที่เสนอขอ</td><td className="val" style={{ width: '35%' }}>{fmtDate(data.proposed_date)}</td></tr>
        <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td><td className="lbl">ฝ่าย</td><td className="val">{data.division}</td></tr>
        <tr><td className="lbl">เกรด/ระดับ</td><td className="val" colSpan="3"><b>{levelObj.code}</b> ({levelObj.label})</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>หน้าที่และความรับผิดชอบ (JD เบื้องต้น)</div>
      <div style={{ border: '1px solid #94a3b8', borderTop: 'none', padding: '10px', whiteSpace: 'pre-wrap', fontSize: '11px', minHeight: '100px' }}>{data.jd}</div>
      <div className="section-bar" style={{ marginTop: '12px' }}>คุณสมบัติ</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl">เพศ</td><td className="val">{data.gender}</td><td className="lbl">อายุ</td><td className="val">{data.age_min && data.age_max ? `${data.age_min} – ${data.age_max} ปี` : '—'}</td></tr>
        <tr><td className="lbl">ประสบการณ์ทำงาน</td><td className="val" colSpan="3">{data.experience_required === 'not_required' ? 'ไม่จำเป็น' : `${data.experience_years} ปีขึ้นไป`}</td></tr>
        <tr><td className="lbl">วุฒิการศึกษา</td><td className="val" colSpan="3">{['ต่ำกว่า ม.6 / ปวช.', 'ปวส.', 'ปริญญาตรี', 'ปริญญาโท'].map((e) => <span key={e} style={{ marginRight: '14px' }}><Cb checked={edu.includes(e)} label={e} /></span>)}</td></tr>
        <tr><td className="lbl">รายละเอียดเพิ่มเติม</td><td className="val" colSpan="3" style={{ whiteSpace: 'pre-wrap' }}>{data.additional || '—'}</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>เหตุผลการขอว่าจ้าง / ลักษณะการจ้างงาน</div>
      <div className="check-grid">
        <Cb checked={data.reason_type === 'new_plan'} label="อัตราใหม่ ตามแผนอัตรากำลังคนประจำปี" />
        <Cb checked={data.employment_type === 'monthly'} label="พนักงานรายเดือน" />
        <Cb checked={data.reason_type === 'new_unplanned'} label="อัตราใหม่ นอกแผน" />
        <Cb checked={data.employment_type === 'daily'} label="พนักงานรายวัน" />
        <Cb checked={data.reason_type === 'replace'} label={`เพื่อทดแทน ${data.reason_type === 'replace' ? `(${data.replace_name} · ${data.replace_reason})` : ''}`} />
        <Cb checked={data.employment_type === 'contract'} label={`พนักงานรายสัญญาจ้าง ${data.employment_type === 'contract' ? `(${data.contract_months} เดือน)` : ''}`} />
      </div>
      <div className="section-bar" style={{ marginTop: '12px' }}>ความจำเป็นการขอว่าจ้าง</div>
      <div className="check-grid">{NECESSITY_OPTIONS.map((n) => <Cb key={n} checked={nec.includes(n)} label={n} />)}</div>
      <table className="form-table" style={{ marginTop: '12px' }}><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ผู้เสนอขอ</td><td className="val" style={{ width: '35%' }}>{data.proposer_name}</td>
            <td className="lbl" style={{ width: '15%' }}>ตำแหน่ง</td><td className="val" style={{ width: '35%' }}>{data.proposer_position} · {data.proposer_division}</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '18px' }}>ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '25%' }}>วันที่รับแบบขออัตรากำลังคน</td><td className="val">{data.hr_received_date ? fmtDate(data.hr_received_date) : '_____ / _____ / _________'}</td>
            <td className="lbl" style={{ width: '15%' }}>ระยะเวลาการสรรหา</td><td className="val"><Cb checked={data.hr_duration === '30'} label="30 วัน" /> &nbsp; <Cb checked={data.hr_duration === '45'} label="45 วัน" /> &nbsp; <Cb checked={data.hr_duration === '60'} label="60 วัน" /></td></tr>
        <tr><td className="lbl">ชื่อผู้รับผิดชอบการสรรหา</td><td className="val">{data.hr_recruiter_name || '...........................'}</td><td className="lbl">ตำแหน่ง</td><td className="val">{data.hr_recruiter_position || '...........................'}</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '14px' }}>ส่วนที่ 3 : สำหรับฝ่ายบริหารพิจารณาอนุมัติ</div>
      <SignatureBlocks
        labels={[{ th: 'ต้นสังกัด', en: 'Requested by' }, { th: 'ผู้ตรวจสอบ (HR)', en: 'Verified by' }, { th: 'ผู้พิจารณา', en: 'Reviewed by' }, { th: 'ผู้อนุมัติ', en: 'Approved by' }]}
        workflow={workflow}
      />
    </div>
  );
}

// ===== Step 5: Recruitment Approval Form =====
function ApprovalForm({ initial, candidate, user, onClose, onSave }) {
  const [form, setForm] = useState(initial ?? {
    division: candidate.department,
    start_date: addDays(todayISO(), 14),
    end_probation_date: addDays(todayISO(), 14 + 120),
    level: 'JG5',
    salary_current: '', salary_new: '', salary_post_probation: '',
    allowance_items: [], remarks: '',
    reason_type: 'new', replace_name: '', replace_reason: 'ลาออก',
    employment_type: 'monthly', contract_months: 12, contract_start: todayISO(),
    necessities: ['ขยายสายงานหรือแผนกใหม่'],
    hr_received_date: '', hr_duration: '30',
    hr_recruiter_name: user?.name ?? '', hr_recruiter_position: 'HR Recruiter'
  });
  const [approvers, setApprovers] = useState(() => (initial?._approvers) ?? [
    { name: '', email: '', role: 'หัวหน้าต้นสังกัด' },
    { name: '', email: '', role: 'HR Manager' },
    { name: '', email: '', role: 'CFO' },
    { name: '', email: '', role: 'CEO' }
  ]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleArr = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  const totalIncome = (parseMoney(form.salary_new) || 0) + (form.allowance_items || []).reduce((s, it) => s + (parseMoney(it.amount) || 0), 0);
  const submit = (e) => {
    e.preventDefault();
    if (!form.salary_new?.trim()) { alert('กรุณากรอกเงินเดือนใหม่'); return; }
    if (!approvers.every((a) => a.name && a.email)) { alert('กรุณากรอกชื่อ + อีเมลผู้อนุมัติให้ครบทุกคน'); return; }
    onSave({ ...form, total_income: totalIncome, _approvers: approvers }, approvers);
  };
  return (
    <Modal title="สร้าง Recruitment Approval Form" subtitle={`Step 5 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="ฝ่าย"><input className="input" value={form.division} onChange={(e) => set('division', e.target.value)} /></Field>
          <Field label="วันเริ่มงาน" required><input type="date" className="input" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="วันที่ครบทดลองงาน"><input type="date" className="input" value={form.end_probation_date} onChange={(e) => set('end_probation_date', e.target.value)} /></Field>
        </div>
        <Field label="เกรด/ระดับ" required>
          <select className="input" value={form.level} onChange={(e) => set('level', e.target.value)}>{LEVELS.map((l) => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}</select>
        </Field>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ค่าจ้างและค่าตอบแทน</div>
          <Field label="เงินเดือนใหม่ (ตามอัตราที่จะจ้าง)" required><input className="input" value={form.salary_new} onChange={(e) => set('salary_new', e.target.value)} placeholder="เช่น 30,000" /></Field>
          <Field label="เงินเดือนปัจจุบัน (ถ้ามี)"><input className="input" value={form.salary_current} onChange={(e) => set('salary_current', e.target.value)} placeholder="เช่น 28,000 · หรือเว้นว่าง" /></Field>
          <Field label="เงินเดือนหลังผ่านทดลองงาน (ถ้ามีการปรับ)"><input className="input" value={form.salary_post_probation} onChange={(e) => set('salary_post_probation', e.target.value)} placeholder="เช่น 32,000 · หรือเว้นว่าง" /></Field>
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-slate-700">ค่าตอบแทนอื่น ๆ (เพิ่มทีละรายการ)</div>
              <button type="button" onClick={() => set('allowance_items', [...(form.allowance_items || []), { label: '', amount: '' }])} className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white">+ เพิ่มรายการ</button>
            </div>
            {(form.allowance_items || []).length === 0 && <div className="text-xs text-slate-400 italic py-1">ยังไม่มีรายการ — กด "+ เพิ่มรายการ" (เช่น ค่าตำแหน่ง · ค่าเดินทาง)</div>}
            {(form.allowance_items || []).map((it, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <input className="input flex-1 text-xs" placeholder="ชื่อรายการ" value={it.label} onChange={(e) => set('allowance_items', form.allowance_items.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <input type="number" className="input w-32 text-xs text-right" placeholder="จำนวนเงิน" value={it.amount} onChange={(e) => set('allowance_items', form.allowance_items.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                <span className="text-xs text-slate-400">บาท</span>
                <button type="button" onClick={() => set('allowance_items', form.allowance_items.filter((_, j) => j !== i))} className="text-rose-500 hover:text-rose-700 text-sm px-1">✕</button>
              </div>
            ))}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
              <div className="text-xs font-semibold text-slate-700">รวมรายได้ทั้งหมด</div>
              <div className="text-sm font-bold text-emerald-700">{fmtMoney(totalIncome)} บาท / เดือน</div>
            </div>
          </div>
        </div>
        <Field label="หมายเหตุ"><textarea rows={2} className="input" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="text-xs font-semibold text-slate-700">เหตุผลการขอว่าจ้าง</div>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="rt2" checked={form.reason_type === 'new'} onChange={() => set('reason_type', 'new')} /> อัตราใหม่</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="rt2" checked={form.reason_type === 'replace'} onChange={() => set('reason_type', 'replace')} /> เพื่อทดแทนพนักงาน</label>
            {form.reason_type === 'replace' && (
              <div className="space-y-1 ml-6">
                <input className="input text-xs" placeholder="ชื่อพนักงาน" value={form.replace_name} onChange={(e) => set('replace_name', e.target.value)} />
                <select className="input text-xs" value={form.replace_reason} onChange={(e) => set('replace_reason', e.target.value)}><option>ลาออก</option><option>โยกย้าย</option><option>อื่น ๆ</option></select>
              </div>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="text-xs font-semibold text-slate-700">ลักษณะการจ้างงาน</div>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'monthly'} onChange={() => set('employment_type', 'monthly')} /> พนักงานรายเดือน</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'daily'} onChange={() => set('employment_type', 'daily')} /> พนักงานรายวัน</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'contract'} onChange={() => set('employment_type', 'contract')} /> พนักงานรายสัญญาจ้าง</label>
            {form.employment_type === 'contract' && (
              <div className="ml-6 grid grid-cols-2 gap-1">
                <input type="number" className="input text-xs" placeholder="เดือน" value={form.contract_months} onChange={(e) => set('contract_months', Number(e.target.value))} />
                <input type="date" className="input text-xs" value={form.contract_start} onChange={(e) => set('contract_start', e.target.value)} />
              </div>
            )}
          </div>
        </div>
        <Field label="ความจำเป็นการขอว่าจ้าง (เลือกได้มากกว่า 1)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
            {NECESSITY_OPTIONS.map((n) => (
              <label key={n} className={`p-2 rounded border cursor-pointer ${form.necessities.includes(n) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>
                <input type="checkbox" className="mr-1" checked={form.necessities.includes(n)} onChange={() => toggleArr('necessities', n)} />{n}
              </label>
            ))}
          </div>
        </Field>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-indigo-800">ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล (HR กรอก)</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="วันที่รับแบบขออนุมัติรับพนักงาน"><input type="date" className="input" value={form.hr_received_date} onChange={(e) => set('hr_received_date', e.target.value)} /></Field>
            <Field label="ระยะเวลาการสรรหา"><select className="input" value={form.hr_duration} onChange={(e) => set('hr_duration', e.target.value)}><option value="30">ภายใน 30 วัน</option><option value="45">ภายใน 45 วัน</option><option value="60">ภายใน 60 วัน</option></select></Field>
            <Field label="ชื่อผู้รับผิดชอบการสรรหา"><input className="input" value={form.hr_recruiter_name} onChange={(e) => set('hr_recruiter_name', e.target.value)} /></Field>
            <Field label="ตำแหน่ง"><input className="input" value={form.hr_recruiter_position} onChange={(e) => set('hr_recruiter_position', e.target.value)} /></Field>
          </div>
        </div>
        <ApproverList approvers={approvers} setApprovers={setApprovers} label="ผู้อนุมัติรับพนักงาน" />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึกเอกสาร + ส่งอนุมัติ</button>
        </div>
      </form>
    </Modal>
  );
}

function ApprovalDoc({ data, candidate, workflow }) {
  const levelObj = LEVELS.find((l) => l.code === data.level) ?? { code: data.level || '—', label: '' };
  const allowances = data.allowance_items || [];
  const allowanceSum = allowances.reduce((s, it) => s + parseMoney(it.amount), 0);
  const totalIncome = (data.total_income != null) ? data.total_income : (parseMoney(data.salary_new) + allowanceSum);
  const nec = data.necessities ?? [];
  return (
    <div className="print-document">
      <DocHeader step={6} candidate={candidate} />
      <div className="section-bar">ส่วนที่ 1 : ข้อมูลพนักงาน</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ชื่อพนักงาน</td><td className="val" style={{ width: '35%' }}><b>{candidate.name || '(ยังไม่ระบุ)'}</b></td>
            <td className="lbl" style={{ width: '15%' }}>ตำแหน่ง</td><td className="val" style={{ width: '35%' }}>{candidate.position}</td></tr>
        <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td><td className="lbl">ฝ่าย</td><td className="val">{data.division}</td></tr>
        <tr><td className="lbl">วันเริ่มงาน</td><td className="val">{fmtDate(data.start_date)}</td><td className="lbl">วันที่ครบทดลองงาน</td><td className="val">{fmtDate(data.end_probation_date)}</td></tr>
        <tr><td className="lbl">เกรด/ระดับ</td><td className="val" colSpan="3"><b>{levelObj.code}</b> {levelObj.label ? `(${levelObj.label})` : ''}</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>ค่าจ้างและค่าตอบแทน</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '40%' }}>เงินเดือนปัจจุบัน</td><td className="val" style={{ textAlign: 'right' }}>{data.salary_current ? `${fmtMoney(parseMoney(data.salary_current))} บาท` : '—'}</td></tr>
        <tr><td className="lbl">เงินเดือนใหม่</td><td className="val" style={{ textAlign: 'right' }}><b>{data.salary_new ? `${fmtMoney(parseMoney(data.salary_new))} บาท` : '—'}</b></td></tr>
        {allowances.filter((it) => it.label || it.amount).map((it, i) => (
          <tr key={i}><td className="lbl" style={{ fontWeight: 'normal' }}>+ {it.label || 'ค่าตอบแทน'}</td><td className="val" style={{ textAlign: 'right' }}>{fmtMoney(parseMoney(it.amount))} บาท</td></tr>
        ))}
        <tr style={{ background: '#f1f5f9' }}><td className="lbl"><b>รวมรายได้ทั้งหมด / เดือน</b></td><td className="val" style={{ textAlign: 'right' }}><b>{fmtMoney(totalIncome)} บาท</b></td></tr>
        <tr><td className="lbl">เงินเดือนหลังผ่านทดลองงาน</td><td className="val" style={{ textAlign: 'right' }}>{data.salary_post_probation ? `${fmtMoney(parseMoney(data.salary_post_probation))} บาท` : '—'}</td></tr>
        {data.remarks && <tr><td className="lbl">หมายเหตุ</td><td className="val" style={{ whiteSpace: 'pre-wrap' }}>{data.remarks}</td></tr>}
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>เหตุผลการขอว่าจ้าง · ลักษณะการจ้างงาน</div>
      <div className="check-grid">
        <Cb checked={data.reason_type === 'new'} label="อัตราใหม่" />
        <Cb checked={data.employment_type === 'monthly'} label="พนักงานรายเดือน" />
        <Cb checked={data.reason_type === 'replace'} label={`เพื่อทดแทนพนักงาน ${data.reason_type === 'replace' ? `(${data.replace_name} · ${data.replace_reason})` : ''}`} />
        <Cb checked={data.employment_type === 'daily'} label="พนักงานรายวัน" />
        <span></span>
        <Cb checked={data.employment_type === 'contract'} label={`พนักงานรายสัญญาจ้าง ${data.employment_type === 'contract' ? `(${data.contract_months} เดือน)` : ''}`} />
      </div>
      <div className="section-bar" style={{ marginTop: '12px' }}>ความจำเป็นการขอว่าจ้าง</div>
      <div className="check-grid">{NECESSITY_OPTIONS.map((n) => <Cb key={n} checked={nec.includes(n)} label={n} />)}</div>
      <div className="section-bar" style={{ marginTop: '18px' }}>ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '25%' }}>วันที่รับแบบขออนุมัติรับพนักงาน</td><td className="val">{data.hr_received_date ? fmtDate(data.hr_received_date) : '_____ / _____ / _________'}</td>
            <td className="lbl" style={{ width: '15%' }}>ระยะเวลาการสรรหา</td><td className="val"><Cb checked={data.hr_duration === '30'} label="30 วัน" /> &nbsp; <Cb checked={data.hr_duration === '45'} label="45 วัน" /> &nbsp; <Cb checked={data.hr_duration === '60'} label="60 วัน" /></td></tr>
        <tr><td className="lbl">ชื่อผู้รับผิดชอบการสรรหา</td><td className="val">{data.hr_recruiter_name || '...........................'}</td><td className="lbl">ตำแหน่ง</td><td className="val">{data.hr_recruiter_position || '...........................'}</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '14px' }}>ส่วนที่ 3 : สำหรับฝ่ายบริหารพิจารณาอนุมัติ</div>
      <SignatureBlocks
        labels={[{ th: 'ผู้ร้องขอ', en: 'Requested by' }, { th: 'ผู้ตรวจสอบ', en: 'Verified by' }, { th: 'ผู้พิจารณา', en: 'Reviewed by' }, { th: 'ผู้อนุมัติ', en: 'Approved by' }]}
        workflow={workflow}
      />
      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(todayISO())}</div>
    </div>
  );
}

// ===== Step 4: Interview Evaluation (Scorecard) =====
function ScorecardForm({ initial, candidate, user, onClose, onSave }) {
  const allKeys = EVAL_CRITERIA.flatMap((c) => c.items.map((i) => i.key));
  const defaultScores = Object.fromEntries(allKeys.map((k) => [k, 3]));
  const [form, setForm] = useState(initial ?? {
    candidate_name: candidate.name ?? '', interview_date: todayISO(), level: 'JG5', division: candidate.department,
    edu_match: 'match', exp_match: 'match', job_change: 'stable', residence: 'near',
    scores: defaultScores, summary: '', probation_goals: '',
    conclusion: 'hire', conclusion_other_position: '',
    interviewer_name: user?.name ?? '', interviewer_position: '', interviewer_division: ''
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setScore = (k, v) => setForm((f) => ({ ...f, scores: { ...f.scores, [k]: v } }));
  const submit = (e) => { e.preventDefault(); onSave(form); };
  return (
    <Modal title="สร้าง Interview Evaluation Form" subtitle={`Step 4 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ส่วนที่ 1: ข้อมูลผู้สมัคร</div>
          <Field label="ชื่อ-นามสกุล candidate" required><input className="input" value={form.candidate_name} onChange={(e) => set('candidate_name', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="วันที่สัมภาษณ์"><input type="date" className="input" value={form.interview_date} onChange={(e) => set('interview_date', e.target.value)} /></Field>
            <Field label="ระดับ"><select className="input" value={form.level} onChange={(e) => set('level', e.target.value)}>{LEVELS.map((l) => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}</select></Field>
          </div>
          <Field label="ฝ่าย"><input className="input" value={form.division} onChange={(e) => set('division', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs font-medium text-slate-600 mb-1">การศึกษา</div>
              <label className="flex items-center gap-1"><input type="radio" name="edu" checked={form.edu_match === 'match'} onChange={() => set('edu_match', 'match')} /> ตรงตามสายงาน</label>
              <label className="flex items-center gap-1"><input type="radio" name="edu" checked={form.edu_match === 'no_match'} onChange={() => set('edu_match', 'no_match')} /> ไม่ตรงตามสายงาน</label></div>
            <div><div className="text-xs font-medium text-slate-600 mb-1">ประสบการณ์</div>
              <label className="flex items-center gap-1"><input type="radio" name="exp" checked={form.exp_match === 'match'} onChange={() => set('exp_match', 'match')} /> ตรงตามสายงาน</label>
              <label className="flex items-center gap-1"><input type="radio" name="exp" checked={form.exp_match === 'no_match'} onChange={() => set('exp_match', 'no_match')} /> ไม่ตรงตามสายงาน</label></div>
            <div><div className="text-xs font-medium text-slate-600 mb-1">ประวัติการเปลี่ยนงาน</div>
              <label className="flex items-center gap-1"><input type="radio" name="jc" checked={form.job_change === 'stable'} onChange={() => set('job_change', 'stable')} /> ไม่ค่อยเปลี่ยน (≥ 3 ปี)</label>
              <label className="flex items-center gap-1"><input type="radio" name="jc" checked={form.job_change === 'frequent'} onChange={() => set('job_change', 'frequent')} /> เปลี่ยนบ่อย (1-2 ปี)</label></div>
            <div><div className="text-xs font-medium text-slate-600 mb-1">ที่พัก</div>
              <label className="flex items-center gap-1"><input type="radio" name="res" checked={form.residence === 'near'} onChange={() => set('residence', 'near')} /> ใกล้ที่ทำงาน (≤10 กม.)</label>
              <label className="flex items-center gap-1"><input type="radio" name="res" checked={form.residence === 'far'} onChange={() => set('residence', 'far')} /> ไกลที่ทำงาน (&gt;10 กม.)</label></div>
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
          <div className="text-xs font-semibold text-slate-700">ส่วนที่ 3: การประเมิน (5 = ยอดเยี่ยม, 1 = น้อยมาก)</div>
          {EVAL_CRITERIA.map((cat) => (
            <div key={cat.cat}>
              <div className="text-xs font-semibold text-slate-800 mb-1">{cat.cat}</div>
              {cat.items.map((it) => (
                <div key={it.key} className="flex items-center gap-2 mb-1">
                  <span className="text-xs flex-1 text-slate-700">{it.label}</span>
                  <div className="flex gap-1">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <label key={n} className={`text-xs cursor-pointer w-6 h-6 grid place-items-center rounded ${form.scores[it.key] === n ? 'bg-emerald-600 text-white font-bold' : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                        <input type="radio" hidden checked={form.scores[it.key] === n} onChange={() => setScore(it.key, n)} />{n}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Field label="ส่วนที่ 4: บทสรุปการประเมินศักยภาพ"><textarea rows={3} className="input" value={form.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
        <Field label="ส่วนที่ 5: เป้าหมายในช่วงทดลองงาน"><textarea rows={3} className="input" value={form.probation_goals} onChange={(e) => set('probation_goals', e.target.value)} /></Field>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ส่วนที่ 6: ข้อสรุป</div>
          {[['hire', '✓ สมควรจ้าง'], ['interview_again', '⟲ ให้สัมภาษณ์อีกครั้ง'], ['other_position', '↗ เหมาะกับตำแหน่งอื่น'], ['hold', '⏸ ยังไม่เหมาะ เก็บข้อมูลไว้'], ['no', '✕ ไม่เหมาะสม']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="cn" checked={form.conclusion === v} onChange={() => set('conclusion', v)} /> {l}</label>
          ))}
          {form.conclusion === 'other_position' && <input className="input ml-6" placeholder="ระบุตำแหน่งที่เหมาะสม" value={form.conclusion_other_position} onChange={(e) => set('conclusion_other_position', e.target.value)} />}
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ผู้สัมภาษณ์</div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="ชื่อ-นามสกุล" value={form.interviewer_name} onChange={(e) => set('interviewer_name', e.target.value)} />
            <input className="input" placeholder="ตำแหน่ง" value={form.interviewer_position} onChange={(e) => set('interviewer_position', e.target.value)} />
            <input className="input" placeholder="ฝ่าย" value={form.interviewer_division} onChange={(e) => set('interviewer_division', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึก & สร้างเอกสาร</button>
        </div>
      </form>
    </Modal>
  );
}

function ScorecardDoc({ data, candidate }) {
  const levelObj = LEVELS.find((l) => l.code === data.level) ?? { code: data.level, label: '' };
  const scores = data.scores ?? {};
  return (
    <div className="print-document">
      <DocHeader step={5} candidate={candidate} />
      <div style={{ background: '#0f172a', color: 'white', padding: '12px 16px', borderRadius: '4px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: '10px', opacity: 0.7 }}>ตำแหน่งที่สัมภาษณ์</div><div style={{ fontSize: '18px', fontWeight: 700 }}>{candidate.position}</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: '10px', opacity: 0.7 }}>แผนก · ฝ่าย</div><div style={{ fontSize: '14px', fontWeight: 600 }}>{candidate.department} · {data.division}</div>{levelObj.code && <div style={{ fontSize: '11px', opacity: 0.85 }}>ระดับ {levelObj.code} ({levelObj.label})</div>}</div>
      </div>
      <div className="section-bar">ส่วนที่ 1 : ข้อมูลผู้สมัคร</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ชื่อ-นามสกุล</td><td className="val" colSpan="5"><b style={{ fontSize: '14px' }}>{data.candidate_name || candidate.name || '(ยังไม่ระบุ)'}</b></td></tr>
        <tr><td className="lbl">วันที่สัมภาษณ์</td><td className="val" colSpan="5">{fmtDate(data.interview_date)}</td></tr>
        <tr><td className="lbl">การศึกษา</td><td className="val" colSpan="5"><Cb checked={data.edu_match === 'match'} label="ตรงตามสายงาน" /> &nbsp; <Cb checked={data.edu_match === 'no_match'} label="ไม่ตรงตามสายงาน" /></td></tr>
        <tr><td className="lbl">ประสบการณ์</td><td className="val" colSpan="5"><Cb checked={data.exp_match === 'match'} label="ตรงตามสายงาน" /> &nbsp; <Cb checked={data.exp_match === 'no_match'} label="ไม่ตรงตามสายงาน" /></td></tr>
        <tr><td className="lbl">ประวัติการเปลี่ยนงาน</td><td className="val" colSpan="5"><Cb checked={data.job_change === 'stable'} label="ไม่ค่อยเปลี่ยน (≥ 3 ปี)" /> &nbsp; <Cb checked={data.job_change === 'frequent'} label="เปลี่ยนบ่อย (1-2 ปี)" /></td></tr>
        <tr><td className="lbl">ที่พัก</td><td className="val" colSpan="5"><Cb checked={data.residence === 'near'} label="ใกล้ที่ทำงาน (≤ 10 กม.)" /> &nbsp; <Cb checked={data.residence === 'far'} label="ไกลที่ทำงาน (> 10 กม.)" /></td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>ส่วนที่ 2 : คำนิยามการระบุคะแนน</div>
      <table className="form-table"><tbody>{SCORE_DEFS.map((s) => (<tr key={s.n}><td className="lbl" style={{ width: '10%', textAlign: 'center' }}><b>{s.n}</b></td><td className="lbl" style={{ width: '15%' }}>{s.label}</td><td className="val" style={{ fontSize: '11px' }}>{s.desc}</td></tr>))}</tbody></table>
      <div className="section-bar" style={{ marginTop: '12px' }}>ส่วนที่ 3 : การประเมินผู้สัมภาษณ์</div>
      <table className="form-table">
        <thead><tr style={{ background: '#e2e8f0' }}><td className="lbl" style={{ width: '55%' }}>หัวข้อการประเมิน</td><td className="lbl" style={{ textAlign: 'center' }}>ยอดเยี่ยม</td><td className="lbl" style={{ textAlign: 'center' }}>ดีมาก</td><td className="lbl" style={{ textAlign: 'center' }}>มาตรฐาน</td><td className="lbl" style={{ textAlign: 'center' }}>พอใช้</td><td className="lbl" style={{ textAlign: 'center' }}>น้อยมาก</td></tr></thead>
        <tbody>
          {EVAL_CRITERIA.map((cat) => (
            <Fragment key={cat.cat}>
              <tr><td colSpan="6" style={{ background: '#f1f5f9', padding: '4px 8px', fontWeight: 600, fontSize: '11px' }}>{cat.cat}</td></tr>
              {cat.items.map((it) => (<tr key={it.key}><td className="val" style={{ fontSize: '11px', paddingLeft: '16px' }}>• {it.label}</td>{[5, 4, 3, 2, 1].map((n) => <td key={n} className="val" style={{ textAlign: 'center' }}>{scores[it.key] === n ? '✓' : ''}</td>)}</tr>))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="section-bar" style={{ marginTop: '12px' }}>ส่วนที่ 4 : บทสรุปการประเมินศักยภาพ</div>
      <div style={{ border: '1px solid #94a3b8', borderTop: 'none', minHeight: '70px', padding: '10px', whiteSpace: 'pre-wrap', fontSize: '11px' }}>{data.summary || ''}</div>
      <div className="section-bar" style={{ marginTop: '12px' }}>ส่วนที่ 5 : เป้าหมายในช่วงทดลองงาน</div>
      <div style={{ border: '1px solid #94a3b8', borderTop: 'none', minHeight: '70px', padding: '10px', whiteSpace: 'pre-wrap', fontSize: '11px' }}>{data.probation_goals || ''}</div>
      <div className="section-bar" style={{ marginTop: '12px' }}>ส่วนที่ 6 : ข้อสรุป</div>
      <div className="check-grid">
        <Cb checked={data.conclusion === 'hire'} label="สมควรจ้าง" />
        <Cb checked={data.conclusion === 'hold'} label="ยังไม่เหมาะ เก็บข้อมูลไว้พิจารณา" />
        <Cb checked={data.conclusion === 'interview_again'} label="ให้สัมภาษณ์อีกครั้ง" />
        <Cb checked={data.conclusion === 'no'} label="ไม่เหมาะสม" />
        <Cb checked={data.conclusion === 'other_position'} label={`เหมาะกับตำแหน่งอื่น ${data.conclusion === 'other_position' ? `(${data.conclusion_other_position})` : ''}`} />
      </div>
      <table className="form-table" style={{ marginTop: '14px' }}><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ผู้สัมภาษณ์</td><td className="val">{data.interviewer_name}</td><td className="lbl" style={{ width: '15%' }}>ตำแหน่ง</td><td className="val">{data.interviewer_position}</td><td className="lbl" style={{ width: '10%' }}>ฝ่าย</td><td className="val">{data.interviewer_division}</td></tr>
      </tbody></table>
      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(todayISO())}</div>
    </div>
  );
}

// ===== Step 6: Probation Evaluation =====
function ProbationEvalForm({ initial, candidate, user, onClose, onSave }) {
  const probStart = candidate.probation?.startDate ?? todayISO();
  const allKeys = PROB_CRITERIA.flatMap((s) => s.items.map((i) => i.key));
  const blankScores = Object.fromEntries(allKeys.map((k) => [k, 0]));
  const [form, setForm] = useState(initial ?? {
    probation_start: probStart, pass_day119_date: addDays(probStart, 119),
    evaluator_name: '', evaluator_position: '', evaluator_email: '',
    rounds: {
      day30: { date: addDays(probStart, 30), scores: { ...blankScores }, comment: '' },
      day60: { date: addDays(probStart, 60), scores: { ...blankScores }, comment: '' },
      day90: { date: addDays(probStart, 90), scores: { ...blankScores }, comment: '' }
    },
    final_status: '', final_comment: ''
  });
  const setBasic = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRoundField = (round, field, v) => setForm((f) => ({ ...f, rounds: { ...f.rounds, [round]: { ...f.rounds[round], [field]: v } } }));
  const setRoundScore = (round, key, v) => setForm((f) => ({ ...f, rounds: { ...f.rounds, [round]: { ...f.rounds[round], scores: { ...f.rounds[round].scores, [key]: v } } } }));
  const submit = (e) => { e.preventDefault(); if (!form.evaluator_name?.trim()) { alert('กรุณากรอกชื่อผู้ประเมิน'); return; } onSave(form); };
  const renderRound = (round, label, dayNum) => (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-700">{label} · Day {dayNum}</div>
        <input type="date" className="input text-xs" style={{ maxWidth: 160 }} value={form.rounds[round].date} onChange={(e) => setRoundField(round, 'date', e.target.value)} />
      </div>
      <div className="text-[10px] text-slate-500">5=ยอดเยี่ยม · 4=ดีมาก · 3=มาตรฐาน · 2=พอใช้ · 1=น้อยมาก · 0=ยังไม่ประเมิน</div>
      {PROB_CRITERIA.map((sec) => (
        <div key={sec.section}>
          <div className="text-[11px] font-semibold text-slate-700 mt-2">{sec.section}</div>
          {sec.items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 mb-1">
              <span className="text-xs flex-1 text-slate-700">{it.label}</span>
              <div className="flex gap-1">
                {[5, 4, 3, 2, 1].map((n) => (
                  <label key={n} className={`text-xs cursor-pointer w-6 h-6 grid place-items-center rounded ${form.rounds[round].scores[it.key] === n ? 'bg-violet-600 text-white font-bold' : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                    <input type="radio" hidden checked={form.rounds[round].scores[it.key] === n} onChange={() => setRoundScore(round, it.key, n)} />{n}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <Field label="ความคิดเห็นรอบนี้"><textarea rows={2} className="input" value={form.rounds[round].comment} onChange={(e) => setRoundField(round, 'comment', e.target.value)} /></Field>
    </div>
  );
  return (
    <Modal title="Probation Evaluation Form" subtitle={`Step 6 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="วันเริ่มทดลองงาน"><input type="date" className="input" value={form.probation_start} onChange={(e) => setBasic('probation_start', e.target.value)} /></Field>
          <Field label="วันผ่านทดลองงาน (Day 119)"><input type="date" className="input" value={form.pass_day119_date} onChange={(e) => setBasic('pass_day119_date', e.target.value)} /></Field>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-700">ผู้ประเมิน</div>
          <div className="grid grid-cols-3 gap-2">
            <input className="input" placeholder="ชื่อ-นามสกุล" value={form.evaluator_name} onChange={(e) => setBasic('evaluator_name', e.target.value)} />
            <input className="input" placeholder="ตำแหน่ง" value={form.evaluator_position} onChange={(e) => setBasic('evaluator_position', e.target.value)} />
            <input className="input" placeholder="email@..." value={form.evaluator_email} onChange={(e) => setBasic('evaluator_email', e.target.value)} />
          </div>
        </div>
        {renderRound('day30', 'รอบที่ 1 · ประเมิน', 30)}
        {renderRound('day60', 'รอบที่ 2 · ประเมิน', 60)}
        {renderRound('day90', 'รอบที่ 3 · ประเมิน', 90)}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-emerald-900">สรุปผลทดลองงาน · Day 119</div>
          {[['passed', '✓ ผ่านทดลองงาน · บรรจุพนักงานประจำ'], ['extended', '⟲ ทดลองงานต่อ'], ['failed', '✕ ไม่ผ่านทดลองงาน']].map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="ps" checked={form.final_status === v} onChange={() => setBasic('final_status', v)} /> {l}</label>
          ))}
          <Field label="ความเห็นรวม (สรุปทั้ง 3 รอบ)"><textarea rows={3} className="input" value={form.final_comment} onChange={(e) => setBasic('final_comment', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึก & สร้างเอกสาร</button>
        </div>
      </form>
    </Modal>
  );
}

function ProbationRoundBlock({ roundNo, dayLabel, roundData }) {
  const r = roundData ?? { scores: {}, comment: '', date: '' };
  const scores = r.scores ?? {};
  const totalKeys = PROB_CRITERIA.flatMap((s) => s.items.map((i) => i.key));
  const filledCount = totalKeys.filter((k) => scores[k] > 0).length;
  const totalScore = totalKeys.reduce((sum, k) => sum + (scores[k] || 0), 0);
  const maxScore = totalKeys.length * 5;
  return (
    <>
      <div className="section-bar" style={{ marginTop: '14px' }}>รอบที่ {roundNo} · ประเมิน <b>Day {dayLabel}</b> · {r.date ? `เมื่อ ${fmtDate(r.date)}` : '(ยังไม่กำหนดวัน)'} · กรอกแล้ว {filledCount}/{totalKeys.length}</div>
      <table className="form-table">
        <thead><tr style={{ background: '#e2e8f0' }}><td className="lbl" style={{ width: '55%' }}>หัวข้อการประเมิน</td><td className="lbl" style={{ textAlign: 'center' }}>5</td><td className="lbl" style={{ textAlign: 'center' }}>4</td><td className="lbl" style={{ textAlign: 'center' }}>3</td><td className="lbl" style={{ textAlign: 'center' }}>2</td><td className="lbl" style={{ textAlign: 'center' }}>1</td></tr></thead>
        <tbody>
          {PROB_CRITERIA.map((sec) => (
            <Fragment key={sec.section}>
              <tr><td colSpan="6" style={{ background: '#f1f5f9', padding: '4px 8px', fontWeight: 600, fontSize: '10px' }}>{sec.section}</td></tr>
              {sec.items.map((it) => (<tr key={it.key}><td className="val" style={{ fontSize: '10px', paddingLeft: '12px' }}>• {it.label}</td>{[5, 4, 3, 2, 1].map((n) => <td key={n} className="val" style={{ textAlign: 'center' }}>{scores[it.key] === n ? '✓' : ''}</td>)}</tr>))}
            </Fragment>
          ))}
          {filledCount > 0 && (<tr style={{ background: '#f1f5f9', fontWeight: 600 }}><td className="lbl" style={{ paddingLeft: '12px' }}>คะแนนรวมรอบนี้</td><td colSpan="5" className="val" style={{ textAlign: 'right', paddingRight: '10px' }}>{totalScore} / {maxScore} · เฉลี่ย {(totalScore / totalKeys.length).toFixed(1)} / 5</td></tr>)}
        </tbody>
      </table>
      {r.comment && <div style={{ border: '1px solid #94a3b8', borderTop: 'none', padding: '8px 12px', fontSize: '11px', whiteSpace: 'pre-wrap', background: '#fafafa' }}><b>ความคิดเห็นรอบที่ {roundNo}:</b><br />{r.comment}</div>}
    </>
  );
}

function ProbationEvalDoc({ data, candidate }) {
  const rounds = data.rounds ?? { day30: {}, day60: {}, day90: {} };
  const statusLabel = { passed: '✓ ผ่านทดลองงาน · บรรจุพนักงานประจำ', extended: '⟲ ทดลองงานต่อ', failed: '✕ ไม่ผ่านทดลองงาน' }[data.final_status];
  const statusColor = { passed: '#16a34a', extended: '#d97706', failed: '#dc2626' }[data.final_status];
  return (
    <div className="print-document">
      <DocHeader step={8} candidate={candidate} />
      <div className="section-bar">ส่วนที่ 1 : ข้อมูลพนักงาน</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '15%' }}>ชื่อ-นามสกุล</td><td className="val" style={{ width: '35%' }}><b>{candidate.name || '—'}</b></td><td className="lbl" style={{ width: '15%' }}>ตำแหน่ง</td><td className="val" style={{ width: '35%' }}>{candidate.position}</td></tr>
        <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td><td className="lbl">วันเริ่มทดลองงาน</td><td className="val">{fmtDate(data.probation_start)}</td></tr>
        <tr><td className="lbl">ผู้ประเมิน</td><td className="val" colSpan="3">{data.evaluator_name} · {data.evaluator_position}{data.evaluator_email ? ` · ${data.evaluator_email}` : ''}</td></tr>
        <tr><td className="lbl">วันผ่านทดลองงาน</td><td className="val" colSpan="3">{fmtDate(data.pass_day119_date)} (Day 119)</td></tr>
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '14px', background: '#475569' }}>ส่วนที่ 2 : ผลการประเมินรายช่วง</div>
      <ProbationRoundBlock roundNo={1} dayLabel="30" roundData={rounds.day30} />
      <ProbationRoundBlock roundNo={2} dayLabel="60" roundData={rounds.day60} />
      <ProbationRoundBlock roundNo={3} dayLabel="90" roundData={rounds.day90} />
      <div className="section-bar" style={{ marginTop: '14px' }}>ส่วนที่ 3 : สรุปผล · Day 119</div>
      <table className="form-table"><tbody>
        <tr><td className="lbl" style={{ width: '30%' }}>สถานะการประเมิน</td><td className="val">
          <Cb checked={data.final_status === 'passed'} label="ผ่านทดลองงาน · บรรจุประจำ" /> &nbsp; <Cb checked={data.final_status === 'extended'} label="ทดลองงานต่อ" /> &nbsp; <Cb checked={data.final_status === 'failed'} label="ไม่ผ่านทดลองงาน" />
          {statusLabel && <div style={{ marginTop: '6px' }}><span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 4, background: `${statusColor}20`, color: statusColor, fontWeight: 700, fontSize: '12px' }}>{statusLabel}</span></div>}
        </td></tr>
        {data.final_comment && <tr><td className="lbl">ความเห็นรวม</td><td className="val" style={{ whiteSpace: 'pre-wrap' }}>{data.final_comment}</td></tr>}
      </tbody></table>
      <div className="section-bar" style={{ marginTop: '14px' }}>ลงนามสรุป (Day 119)</div>
      <SignatureBlocks labels={[{ th: 'ผู้ประเมินหลัก', en: 'Primary Evaluator' }, { th: 'พนักงาน', en: 'Employee' }, { th: 'HR Manager', en: 'Approved by' }]} />
      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(todayISO())}</div>
    </div>
  );
}

// ============================================================================
// Email composer (sends via M365 Edge Function, from central HR mailbox)
// ============================================================================

function emailTemplate(step, c) {
  const pos = c.position;
  const name = c.name || '(ผู้สมัคร)';
  const sign = `\n\nBest regards,\nHR Team · JIAN CHA Co., Ltd.\n${HR_EMAIL}`;
  const apprEmails = (c.approval_workflows?.[step]?.approvers || []).map((a) => a.email).filter(Boolean).join(', ');
  const T = {
    1: { to: apprEmails, subject: `Approval Required: Open Position - ${pos} (${c.department})`, body: `Dear Approver,\n\nPlease review and approve the Manpower Requisition for the position "${pos}" (${c.department}).${sign}` },
    3: { to: '', subject: `Candidate Profile for review: ${pos}`, body: `Dear Hiring Manager,\n\nPlease find the shortlisted candidate(s) for ${pos} (${c.department}) for your review.${sign}` },
    4: { to: '', subject: `Interview Scorecard: ${name} · ${pos}`, body: `Dear Evaluator,\n\nPlease complete the interview evaluation (scorecard) for ${name} — ${pos} (${c.department}).${sign}` },
    5: { to: apprEmails, subject: `Approval Required: Hire ${name} - ${pos}`, body: `Dear Approver,\n\nPlease review and approve the Recruitment Approval for ${name} — ${pos} (${c.department}).${sign}` },
    6: { to: '', subject: `Probation Evaluation: ${name} (Day 30/60/90)`, body: `Dear Evaluator,\n\nPlease complete the probation evaluation for ${name} — ${pos} (${c.department}).${sign}` }
  };
  return T[step] || { to: '', subject: `${pos} - JIAN CHA HR`, body: `Dear Sir/Madam,${sign}` };
}

function EmailComposer({ candidate, step, actor, onClose, onSent }) {
  const tpl = emailTemplate(step, candidate);
  const [to, setTo] = useState(tpl.to);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [busy, setBusy] = useState(false);
  async function send() {
    const toList = to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!toList.length) { alert('กรุณากรอกอีเมลผู้รับ (To)'); return; }
    setBusy(true);
    try {
      await sendEmail({ to: toList, cc: cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), subject, body });
      onSent({ to, subject, sentAt: new Date().toISOString(), by: actor });
      alert('ส่งอีเมลเรียบร้อย ✓');
    } catch (e) {
      setBusy(false);
      alert('ส่งอีเมลไม่สำเร็จ:\n' + (e?.message || e) + '\n\nหมายเหตุ: ต้องตั้งค่า Microsoft 365 + deploy Edge Function "send-email" ก่อน (ดู EMAIL_SETUP_M365.md)');
    }
  }
  return (
    <Modal title="ส่งอีเมล" subtitle={`Step ${step} · ส่งจาก ${HR_EMAIL}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">📤 From: <b>{HR_EMAIL}</b></div>
        <Field label="ถึง (To) — คั่นหลายคนด้วย ,"><input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="สำเนา (Cc) — ถ้ามี"><input className="input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" /></Field>
        <Field label="หัวเรื่อง (Subject)"><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="เนื้อหา (Body)"><textarea rows={10} className="input" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
          <button onClick={send} disabled={busy} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} ส่งอีเมล
          </button>
        </div>
      </div>
    </Modal>
  );
}
