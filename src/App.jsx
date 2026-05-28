import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Users, CheckCircle2, AlertTriangle, AlertCircle, ClipboardCheck,
  X, ChevronRight, Calendar, Trash2, Edit2, FileText, FileCheck, Briefcase,
  CalendarClock, ShieldCheck, UserCircle2, Loader2, BarChart3, TrendingUp,
  Building2, Wallet, Clock, PenLine, LogOut, Lock
} from 'lucide-react';
import {
  listCandidates, createCandidate, updateCandidate, deleteCandidate,
  subscribeCandidates, signIn, signOut, getSession, onAuthChange, actorFromSession
} from './lib/supabase.js';

// ============================================================================
// Constants — 8-step workflow (ตรงกับ preview.html)
// ============================================================================

const STEPS = [
  { id: 1, name: 'Requisition Approval',       thai: 'ขออนุมัติอัตรากำลังคน',   owner: 'Dept Head + HR',        note: 'สร้างเอกสาร + เซ็นอนุมัติตามลำดับ' },
  { id: 2, name: 'Sourcing',                   thai: 'ดำเนินการสรรหา',          owner: 'HR Recruiter',          note: 'นับถอยหลัง 30 วัน' },
  { id: 3, name: 'Screening & Shortlist',      thai: 'คัดกรอง + ส่ง shortlist', owner: 'HR Recruiter',          note: 'อัปโหลด resume + อีเมลต้นสังกัด' },
  { id: 4, name: 'Interview Scheduling',       thai: 'นัดสัมภาษณ์',             owner: 'HR Recruiter',          note: 'อีเมลนัด + แนบไฟล์' },
  { id: 5, name: 'Interview Evaluation',       thai: 'ประเมินสัมภาษณ์',         owner: 'Hiring Mgr → HR',       note: 'scorecard + ใส่ชื่อผู้ผ่าน' },
  { id: 6, name: 'Offer Approval & Extension', thai: 'ขออนุมัติรับ + ส่ง Offer', owner: 'HR + Approvers',        note: 'สร้างเอกสาร + เซ็นอนุมัติตามลำดับ' },
  { id: 7, name: 'Pre-Boarding Documents',     thai: 'ขอเอกสารเริ่มงาน',        owner: 'HR Recruiter',          note: 'ลิงก์ให้ผู้สมัครอัปโหลด' },
  { id: 8, name: 'Probation Period',           thai: 'ทดลองงาน 120 วัน',        owner: 'Hiring Mgr · HR',       note: 'ประเมิน Day 30/60/90 · ผ่านโปร Day 119' }
];
const TOTAL_STEPS = STEPS.length;
const APPROVAL_STEPS = [1, 6]; // steps ที่ต้องเซ็นอนุมัติก่อนผ่าน

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
  5: { name: 'Interview Evaluation Form',          thai: 'แบบฟอร์มประเมินการสัมภาษณ์งาน' },
  6: { name: 'Employee Recruitment Approval Form', thai: 'แบบฟอร์มขออนุมัติรับพนักงาน' },
  8: { name: 'Probation Evaluation Form',          thai: 'แบบฟอร์มประเมินผลการทดลองงาน' }
};

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

  // Step 6: offer approval state
  if (c.current_step === 6) {
    const wf = c.approval_workflows?.['6'];
    if (wf?.status === 'in_progress') {
      const done = (wf.approvers || []).filter((a) => a.status === 'approved').length;
      return { tone: 'blue', label: `รออนุมัติ Offer (${done}/${(wf.approvers || []).length})`, icon: Clock };
    }
  }

  // Step 8: probation
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
  if (c.current_step <= 5)   return 'open';
  if (c.current_step <= 7)   return 'onboarding';
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
    try { await deleteCandidate(id); setOpening(null); }
    catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
  }

  async function advanceStep(c) {
    if (c.current_step >= TOTAL_STEPS) return;
    if (APPROVAL_STEPS.includes(c.current_step) && c.approval_workflows?.[String(c.current_step)]?.status !== 'completed') {
      alert(`ต้องบันทึก "อนุมัติครบ" ของ Step ${c.current_step} ก่อนถึงจะไปต่อได้`);
      return;
    }
    if (c.current_step === 5 && !c.name?.trim()) {
      alert('ใส่ชื่อผู้สมัครที่ผ่านสัมภาษณ์ก่อนไป Step 6 (Offer Approval)');
      return;
    }
    const next = c.current_step + 1;
    const steps = [...(c.steps ?? []), { step: c.current_step, completedDate: todayISO(), completedBy: actor }];
    const patch = { current_step: next, steps };
    if (next === 7 && (!c.documents || c.documents.length === 0)) {
      patch.documents = DOCUMENT_TEMPLATE.map((d) => ({ ...d, received: false, receivedDate: null }));
    }
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
  // record the approval workflow for Step 1/6 as completed.
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
    if (!confirm(`ลบ "${c.name}" ออกจากตำแหน่งนี้?\n\nระบบจะเก็บประวัติใน audit log แล้วย้อนกลับไป Step 5 หา candidate อื่น`)) return;
    const droppedName = c.name;
    const dateStr = todayISO();
    const { ['6']: _drop, ...keepWf } = c.approval_workflows ?? {};
    await updateCandidate(c.id, {
      name: null,
      current_step: 5,
      steps: [...(c.steps ?? []), { step: c.current_step, completedDate: dateStr, completedBy: actor, note: `ผู้สมัคร "${droppedName}" ถอน` }],
      documents: [],
      approval_workflows: keepWf,
      probation: {},
      notes: (c.notes ? c.notes + '\n' : '') + `📌 ${dateStr}: "${droppedName}" ถอน · กลับมาที่ Step 5`
    });
  }

  async function cancelPosition(c) {
    if (!confirm(`ยกเลิกตำแหน่ง "${c.position}"?\n\nตำแหน่งจะหายจาก dashboard (audit log เก็บประวัติไว้)`)) return;
    try { await deleteCandidate(c.id); }
    catch (e) { alert('ยกเลิกไม่สำเร็จ: ' + e.message); }
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

  const sectionDefs = [
    { key: 'open',       title: '🔍 Open Position',        sub: 'Sourcing · ยังไม่มีผู้สมัคร · Step 1–5' },
    { key: 'onboarding', title: '✍️ Process รับเข้าทำงาน',  sub: 'ได้ผู้สมัครแล้ว · Step 6–7' },
    { key: 'probation',  title: '🛡 Process Probation',     sub: 'ทดลองงาน 120 วัน · Step 8 + ผ่านโปร' }
  ];

  if (session === undefined) {
    return <div className="min-h-screen grid place-items-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!session) {
    return <Login />;
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
    const offerDate = (c) => c.approval_workflows?.['6']?.completedAt ?? stepDate(c, 6);

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
    candidates.forEach((c) => [1, 6].forEach((st) => { const wf = c.approval_workflows?.[String(st)]; if (wf?.status === 'completed' && wf.createdAt && wf.completedAt) appr.push(daysBetween(wf.createdAt, wf.completedAt)); }));
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

    const offers = candidates.map((c) => c.generated_docs?.['6']).filter(Boolean);
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
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="ใส่หลังผ่าน Step 5" />
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

function CandidateDetail({ c, onClose, onEdit, onDelete, onAdvance, onApprove, onToggleDoc, onRecordMilestone, onProbationPassed, onEditName, onDropCandidate, onCancelPosition, onSaveDoc, actor }) {
  const status = deriveStatus(c);
  const documents = c.documents?.length ? c.documents : DOCUMENT_TEMPLATE.map((d) => ({ ...d, received: false, receivedDate: null }));
  const probation = c.probation ?? {};
  const probationStart = probation.startDate ?? c.process_start_date;
  const daysInProbation = c.current_step === TOTAL_STEPS ? daysBetween(probationStart, today()) : 0;
  const [docForm, setDocForm] = useState(null); // step number for create/edit form
  const [docView, setDocView] = useState(null); // step number for view/print
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

      {!hasName && c.current_step >= 6 && c.status === 'active' && (
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
            const ported = step === 1; // ฟอร์มที่พอร์ตเข้าระบบจริงแล้ว (เพิ่มทีละ step)
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

      {/* Pre-boarding documents (Step 7+) */}
      {c.current_step >= 7 && (
        <Section icon={FileText} title="เอกสารเริ่มงาน (Step 7)" subtitle={`รับแล้ว ${documents.filter((d) => d.received).length}/${documents.length}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {documents.map((d) => (
              <label key={d.key} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm cursor-pointer ${d.received ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                <input type="checkbox" checked={d.received} onChange={() => onToggleDoc(d.key)} className="accent-emerald-600 w-4 h-4" />
                <div className="flex-1">
                  <div className={`${d.received ? 'text-emerald-800 font-medium' : 'text-slate-700'}`}>{d.label}</div>
                  {d.received && d.receivedDate && <div className="text-[11px] text-emerald-700">รับวันที่ {fmtDate(d.receivedDate)}</div>}
                </div>
                {d.received && <FileCheck className="w-4 h-4 text-emerald-600" />}
              </label>
            ))}
          </div>
        </Section>
      )}

      {/* Probation tracker (Step 8 / passed) */}
      {(c.current_step === TOTAL_STEPS || c.status === 'passed') && (
        <Section icon={ShieldCheck} title="ทดลองงาน 120 วัน (Step 8)" subtitle={c.status === 'passed' ? 'ผ่านโปรแล้ว' : `วันที่ ${Math.min(daysInProbation, PROBATION_DAYS)} / ${PROBATION_DAYS}`}>
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
