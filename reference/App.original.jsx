/* =============================================================================
 * REFERENCE ONLY — NOT USED BY THE BUILD
 * =============================================================================
 * นี่คือ App.jsx เวอร์ชันต้นแบบ (dark theme + local state + dummy data) ที่
 * HR ส่งให้ไว้เป็น UI reference ตามที่ v1.0 brief พูดถึง
 *
 * เวอร์ชันที่ใช้งานจริง = ../src/App.jsx (Tailwind + Supabase + realtime + audit)
 *
 * NOTE: ไฟล์ที่ paste มาถูกตัดกลางคันที่ส่วน Dashboard stats grid
 * (จบที่ "marg" — น่าจะเป็น "marginBottom: 24")
 * ส่วนที่ขาด:
 *   - Stats cards (4 ใบ: total / active / passed / overdue)
 *   - Candidate list grid
 *   - candidates view
 *   - probation view
 *   - Detail panel (10-step tracker, doc checklist, probation panel)
 *   - Add candidate modal
 *   - ปิด return + ปิด component
 *
 * หากต้องการให้ครบ paste ส่วนที่เหลือเพิ่มได้ค่ะ
 * ============================================================================= */

import { useState, useEffect } from "react";

const STEPS = [
  { id: 1, label: "ขออนุมัติอัตรากำลังคน", owner: "ต้นสังกัด", days: null },
  { id: 2, label: "ดำเนินการสรรหา", owner: "สรรหา", days: 30 },
  { id: 3, label: "Prescreen & ส่งให้ต้นสังกัด", owner: "สรรหา", days: null },
  { id: 4, label: "ต้นสังกัดพิจารณาคุณสมบัติ", owner: "ต้นสังกัด", days: null },
  { id: 5, label: "นัดสัมภาษณ์", owner: "สรรหา", days: null },
  { id: 6, label: "ส่งเอกสารประเมินสัมภาษณ์", owner: "ต้นสังกัด", days: null },
  { id: 7, label: "ขอเอกสารเริ่มงาน", owner: "สรรหา", days: null },
  { id: 8, label: "ขออนุมัติรับพนักงาน", owner: "สรรหา", days: null },
  { id: 9, label: "สัญญาจ้าง & ลงนาม", owner: "สรรหา", days: null },
  { id: 10, label: "ทดลองงาน 120 วัน", owner: "ต้นสังกัด", days: 120 },
];

const DOCS = [
  "สำเนาบัตรประชาชน",
  "สำเนาทะเบียนบ้าน",
  "วุฒิการศึกษา",
  "ใบผ่านงาน",
  "รูปถ่าย",
  "ใบรับรองแพทย์",
];

const initialCandidates = [
  {
    id: 1,
    name: "สมชาย ใจดี",
    position: "Software Engineer",
    department: "IT",
    type: "replacement",
    processStartDate: "2024-03-01",
    currentStep: 3,
    status: "active",
    steps: STEPS.map((s) => ({ stepNo: s.id, completedDate: null, note: "" })),
    documents: DOCS.map((d) => ({ name: d, received: false, receivedDate: null })),
    probation: { startDate: null, evaluationSentDate: null, returnDate: null, passed: false },
  },
  {
    id: 2,
    name: "มาลี รักงาน",
    position: "HR Officer",
    department: "HR",
    type: "new_headcount",
    processStartDate: "2024-02-15",
    currentStep: 7,
    status: "active",
    steps: STEPS.map((s) => ({ stepNo: s.id, completedDate: null, note: "" })),
    documents: DOCS.map((d) => ({ name: d, received: d !== "ใบรับรองแพทย์", receivedDate: null })),
    probation: { startDate: null, evaluationSentDate: null, returnDate: null, passed: false },
  },
  {
    id: 3,
    name: "ประวิทย์ สุขสันต์",
    position: "Accountant",
    department: "Finance",
    type: "replacement",
    processStartDate: "2024-01-10",
    currentStep: 10,
    status: "active",
    steps: STEPS.map((s) => ({ stepNo: s.id, completedDate: null, note: "" })),
    documents: DOCS.map((d) => ({ name: d, received: true, receivedDate: null })),
    probation: { startDate: "2024-02-01", evaluationSentDate: "2024-02-01", returnDate: null, passed: false },
  },
];

function daysBetween(a, b) {
  return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function probationDay(startDate) {
  if (!startDate) return 0;
  return daysBetween(startDate, today());
}

export default function App() {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterDept, setFilterDept] = useState("all");
  const [filterStep, setFilterStep] = useState("all");
  const [newForm, setNewForm] = useState({
    name: "", position: "", department: "", type: "replacement", processStartDate: today(),
  });

  const selected = candidates.find((c) => c.id === selectedId);
  const departments = [...new Set(candidates.map((c) => c.department))];

  function getStepStatus(c) {
    const step = STEPS[c.currentStep - 1];
    if (!step) return "done";
    if (step.days && c.processStartDate) {
      const deadline = addDays(c.processStartDate, step.days);
      const diff = daysBetween(today(), deadline);
      if (diff < 0) return "overdue";
      if (diff <= 3) return "warning";
    }
    return "ok";
  }

  function statusColor(s) {
    if (s === "overdue") return "#ef4444";
    if (s === "warning") return "#f59e0b";
    return "#22c55e";
  }

  function advanceStep(id) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = Math.min(c.currentStep + 1, 10);
        const newSteps = c.steps.map((s) =>
          s.stepNo === c.currentStep ? { ...s, completedDate: today() } : s
        );
        const probation = next === 10 ? { ...c.probation, startDate: today(), evaluationSentDate: today() } : c.probation;
        return { ...c, currentStep: next, steps: newSteps, probation };
      })
    );
  }

  function toggleDoc(cId, dName) {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== cId) return c;
        return {
          ...c,
          documents: c.documents.map((d) =>
            d.name === dName ? { ...d, received: !d.received, receivedDate: !d.received ? today() : null } : d
          ),
        };
      })
    );
  }

  function addCandidate() {
    const id = Date.now();
    setCandidates((prev) => [
      ...prev,
      {
        id,
        ...newForm,
        currentStep: 1,
        status: "active",
        steps: STEPS.map((s) => ({ stepNo: s.id, completedDate: null, note: "" })),
        documents: DOCS.map((d) => ({ name: d, received: false, receivedDate: null })),
        probation: { startDate: null, evaluationSentDate: null, returnDate: null, passed: false },
      },
    ]);
    setShowAddModal(false);
    setNewForm({ name: "", position: "", department: "", type: "replacement", processStartDate: today() });
  }

  function markProbationReturn(id) {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, probation: { ...c.probation, returnDate: today(), passed: true }, status: "passed" } : c
      )
    );
  }

  const filtered = candidates.filter((c) => {
    if (filterDept !== "all" && c.department !== filterDept) return false;
    if (filterStep !== "all" && String(c.currentStep) !== filterStep) return false;
    return true;
  });

  const stats = {
    total: candidates.length,
    active: candidates.filter((c) => c.status === "active").length,
    passed: candidates.filter((c) => c.status === "passed").length,
    overdue: candidates.filter((c) => getStepStatus(c) === "overdue").length,
  };

  return (
    <div style={{ fontFamily: "'Sarabun', 'Segoe UI', sans-serif", background: "#0f172a", minHeight: "100vh", color: "#e2e8f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1e293b; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; }
        .btn { cursor: pointer; border: none; border-radius: 8px; font-family: inherit; font-weight: 600; transition: all .15s; }
        .btn:hover { opacity: .85; transform: translateY(-1px); }
        .btn-primary { background: #3b82f6; color: #fff; padding: 8px 18px; font-size: 14px; }
        .btn-sm { background: #334155; color: #94a3b8; padding: 5px 12px; font-size: 12px; }
        .btn-green { background: #166534; color: #86efac; padding: 6px 14px; font-size: 13px; }
        .tag { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
        .step-pill { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 10px; margin-bottom: 6px; transition: background .15s; }
        .step-pill:hover { background: #263352; }
        input, select { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; color: #e2e8f0; font-family: inherit; font-size: 14px; width: 100%; outline: none; }
        input:focus, select:focus { border-color: #3b82f6; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .progress-bar { height: 8px; background: #1e293b; border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 4px; transition: width .5s; }
        .nav-btn { padding: 8px 18px; border-radius: 8px; cursor: pointer; border: none; font-family: inherit; font-size: 14px; font-weight: 600; transition: all .2s; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎯</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>Recruitment Tracker</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>120-Day Process Management</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["dashboard", "candidates", "probation"].map((v) => (
            <button key={v} className="nav-btn" onClick={() => setView(v)}
              style={{ background: view === v ? "#3b82f6" : "transparent", color: view === v ? "#fff" : "#94a3b8", border: view === v ? "none" : "1px solid #334155" }}>
              {v === "dashboard" ? "📊 Dashboard" : v === "candidates" ? "👥 Candidates" : "📋 Probation"}
            </button>
          ))}
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ เพิ่ม Candidate</button>
        </div>
      </div>

      <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div>
            {/* Stats — TRUNCATED in original paste, ending mid-line:
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marg...
                paste ส่วนที่เหลือเพิ่มได้ */}
            <div>[ส่วนที่ขาด — Stats cards, Candidate list, Detail panel, Add modal]</div>
          </div>
        )}
      </div>
    </div>
  );
}
