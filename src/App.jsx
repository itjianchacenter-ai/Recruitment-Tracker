
    import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  listCandidates, createCandidate, updateCandidate, deleteCandidate,
  subscribeCandidates, signIn, signOut, getSession, onAuthChange,
  actorFromSession, roleFromSession, usernameToEmail,
  adminListUsers, adminCreateUser, adminResetPassword, adminDeleteUser,
  findUnregisteredEmails, getClientIp, uploadFile, getSignedUrl
} from './lib/supabase.js';

// ---------------------------------------------------------------------------
// Assignment guard — block assigning work to an email (username) that has no
// real Auth account yet. Policy: HR must create the user BEFORE assigning, so
// the work can actually land in that user's "งานของฉัน" and they can log in.
// Returns true if OK to proceed; shows a toast + returns false if blocked.
async function ensureAssigneesRegistered(emails, showToast) {
  try {
    const missing = await findUnregisteredEmails(emails);
    if (missing.length) {
      showToast(
        `⚠️ ยังไม่มีผู้ใช้: ${missing.join(', ')} · กรุณาสร้างผู้ใช้ก่อนมอบหมาย (เมนู "ผู้ใช้ & รหัสผ่าน")`,
        'warning'
      );
      return false;
    }
    return true;
  } catch (e) {
    showToast('ตรวจสอบผู้ใช้ไม่สำเร็จ: ' + (e?.message || '') + ' · ลองใหม่อีกครั้ง', 'warning');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Row <-> model mapping (DB uses snake_case; cowork components use camelCase
// for generatedDocs / approvalWorkflows). Everything else shares names.
// ---------------------------------------------------------------------------
function fromRow(r) {
  return {
    ...r,
    generatedDocs: r.generated_docs ?? {},
    approvalWorkflows: r.approval_workflows ?? {},
    // per-round probation evals live inside the existing probation jsonb (no DB migration)
    probationEvals: r.probation?.evals ?? {},
  };
}
function toRow(c) {
  return {
    name: c.name ?? null,
    position: c.position,
    department: c.department,
    type: c.type,
    process_start_date: c.process_start_date,
    current_step: c.current_step,
    status: c.status,
    steps: c.steps ?? [],
    documents: c.documents ?? [],
    probation: { ...(c.probation ?? {}), evals: c.probationEvals ?? c.probation?.evals ?? {} },
    shortlist: c.shortlist ?? [],
    generated_docs: c.generatedDocs ?? c.generated_docs ?? {},
    approval_workflows: c.approvalWorkflows ?? c.approval_workflows ?? {},
    distributions: c.distributions ?? {},
    files: c.files ?? [],
    notes: c.notes ?? null,
    created_by: c.created_by ?? null
  };
}

    // =========================================================================
    // Constants
    // =========================================================================
    const today = () => new Date().toISOString().slice(0, 10);
    const TODAY = today();
    // Central HR mailbox — every system email in every step is sent FROM this address
    const HR_EMAIL = 'Hr.jc@jianchatea.com';
    const HR_SENDER = `HR Team · JIAN CHA Co., Ltd. <${HR_EMAIL}>`;
    const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86_400_000);
    const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '—';
    const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
    const parseMoney = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };
    const fmtMoney = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

    const STEPS = [
      { id:1, name:'Requisition Approval',       thai:'ขออนุมัติอัตรากำลังคน',    owner:'Dept Head + HR',         note:'สร้างเอกสาร + อนุมัติตามลำดับ' },
      { id:2, name:'Sourcing',                   thai:'ดำเนินการสรรหา',           owner:'HR Recruiter',            note:'นับถอยหลัง 30 วัน' },
      { id:3, name:'Screening & Shortlist',      thai:'Screening + ส่ง shortlist', owner:'HR Recruiter',            note:'อัปโหลด + แจ้งผู้จัดการ + timeline' },
      { id:4, name:'Interview Evaluation',       thai:'ประเมินสัมภาษณ์',          owner:'Hiring Mgr → HR',         note:'สร้าง scorecard + มอบหมายผู้ประเมิน' },
      { id:5, name:'Offer Approval & Extension', thai:'ขออนุมัติรับ + ส่ง Offer',  owner:'HR + Approvers',          note:'สร้างเอกสาร + อนุมัติตามลำดับ' },
      { id:6, name:'Probation Period',           thai:'ทดลองงาน 120 วัน',         owner:'Hiring Mgr · HR follow', note:'ประเมิน Day 30 / 60 / 90 · ผ่านโปร Day 119' }
    ];
    const TOTAL_STEPS = STEPS.length;

    const DOCUMENT_TEMPLATE = [
      { key:'id_card',      label:'สำเนาบัตรประชาชน' },
      { key:'house_reg',    label:'สำเนาทะเบียนบ้าน' },
      { key:'education',    label:'วุฒิการศึกษา' },
      { key:'work_cert',    label:'ใบผ่านงาน' },
      { key:'photo',        label:'รูปถ่าย' },
      { key:'medical_cert', label:'ใบรับรองแพทย์' }
    ];

    const STEP_2_DEADLINE_DAYS = 30;
    const PROBATION_DAYS = 120;
    const PROBATION_ELIGIBLE = 119;

    const HR_USERS = [
      { id:'u1', name:'คุณกุ้ง · ทศนวรรณ', role:'HR Manager',  email:'hr.manager@jiancha.com' },
      { id:'u2', name:'คุณแอน · อภิญญา',   role:'HR Officer',  email:'hr.ann@jiancha.com' },
      { id:'u3', name:'คุณนัท · นันทพร',    role:'HR Officer',  email:'hr.nat@jiancha.com' }
    ];

    // =========================================================================
    // Sample candidates
    // =========================================================================
    const sampleCandidates = [
      // c0a — Step 1 with approval IN PROGRESS (demo "รออนุมัติ" state)
      {
        id:'c0a', name:null, position:'Cashier', department:'Operations',
        type:'new_headcount', process_start_date:'2026-05-19', current_step:1, status:'active',
        steps:[],
        documents:[], probation:{}, files:[
          { name:'manpower_request_cashier.pdf', step:1, size:'168 KB', uploadedAt:'2026-05-19', uploadedBy:'คุณแอน' }
        ],
        approvalWorkflows:{
          1:{
            id:'wf_c0a_1', status:'in_progress',
            documentName:'manpower-request-cashier.pdf',
            createdAt:'2026-05-19 10:00',
            approvers:[
              {id:'a1', name:'คุณวิทยา รักดี',      email:'wittaya@jiancha.com',  role:'หัวหน้าต้นสังกัด',    status:'approved', signedAt:'2026-05-19 15:22', ip:'203.144.1.x', sequence:1},
              {id:'a2', name:'คุณกุ้ง ทศนวรรณ',    email:'hr.manager@jiancha.com', role:'HR Manager',           status:'pending',  signedAt:null, ip:null,            sequence:2},
              {id:'a3', name:'คุณภัทรา รัศมี',      email:'ceo@jiancha.com',       role:'MD / CEO',             status:'waiting',  signedAt:null, ip:null,            sequence:3}
            ]
          }
        },
        notes:'รออนุมัติเปิดอัตรา · 1/3 คน',
        created_by:'คุณแอน'
      },
      // c0b — Step 1 with approval COMPLETED (ready to advance)
      {
        id:'c0b', name:null, position:'QC Officer', department:'Supply Chain',
        type:'new_headcount', process_start_date:'2026-05-15', current_step:1, status:'active',
        steps:[],
        documents:[], probation:{}, files:[],
        generatedDocs:{
          1:{
            docName:'manpower-requisition-qcofficer.pdf',
            createdAt:'2026-05-15T09:30:00Z',
            createdBy:'คุณกุ้ง',
            data:{
              proposed_date:'2026-05-15',
              division:'Supply Chain',
              level:'JG5',
              jd:'• ตรวจสอบคุณภาพวัตถุดิบและสินค้าสำเร็จรูปตามมาตรฐาน GMP/HACCP\n• จัดทำรายงานข้อบกพร่องและประสานงานกับฝ่ายผลิต\n• ดูแลการ calibrate เครื่องมือตรวจวัด\n• ฝึกอบรมพนักงานสายการผลิตเรื่อง QC',
              gender:'ไม่ระบุ',
              age_min:25, age_max:35,
              experience_required:'required',
              experience_years:3,
              education:['ปริญญาตรี'],
              additional:'มี certification GMP/HACCP/ISO 22000 · ใช้ภาษาอังกฤษพอใช้',
              reason_type:'new_plan',
              replace_name:'', replace_reason:'ลาออก',
              employment_type:'monthly',
              contract_months:12,
              necessities:['เพิ่มกำลังคนเพื่อรองรับงานที่เพิ่มขึ้น','ขยายสายงานหรือแผนกใหม่'],
              proposer_name:'คุณกุ้ง · ทศนวรรณ',
              proposer_position:'HR Manager',
              proposer_division:'Supply Chain',
              hr_received_date:'2026-05-16',
              hr_duration:'45',
              hr_recruiter_name:'คุณแอน · อภิญญา',
              hr_recruiter_position:'HR Recruiter'
            }
          }
        },
        approvalWorkflows:{
          1:{
            id:'wf_c0b_1', status:'completed',
            documentName:'manpower-request-qc.pdf',
            createdAt:'2026-05-15 09:30',
            completedAt:'2026-05-18 11:10',
            approvers:[
              {id:'a1', name:'คุณวิทยา รักดี',  email:'wittaya@jiancha.com', role:'หัวหน้าต้นสังกัด', status:'approved', signedAt:'2026-05-15 14:00', ip:'203.144.1.x', sequence:1},
              {id:'a2', name:'คุณกุ้ง ทศนวรรณ', email:'hr.manager@jiancha.com', role:'HR Manager',     status:'approved', signedAt:'2026-05-16 10:15', ip:'110.78.5.x', sequence:2},
              {id:'a3', name:'คุณภัทรา รัศมี',  email:'ceo@jiancha.com',      role:'MD / CEO',         status:'approved', signedAt:'2026-05-18 11:10', ip:'203.144.1.x', sequence:3}
            ]
          }
        },
        notes:'อนุมัติครบแล้ว · พร้อมเริ่มสรรหา (Step 2)',
        created_by:'คุณกุ้ง'
      },
      {
        id:'c1', name:null, position:'Store Manager', department:'Operations',
        type:'replacement', process_start_date:'2026-04-10', current_step:2, status:'active',
        steps:[{step:1, completedDate:'2026-04-11', completedBy:'คุณกุ้ง'}],
        documents:[], probation:{}, files:[],
        notes:'รออัพเดท candidate pool จาก agency',
        created_by:'คุณกุ้ง'
      },
      {
        id:'c2', name:null, position:'Barista Lead', department:'Operations',
        type:'new_headcount', process_start_date:'2026-04-25', current_step:2, status:'active',
        steps:[{step:1, completedDate:'2026-04-26', completedBy:'คุณแอน'}],
        documents:[], probation:{}, files:[],
        notes:'',
        created_by:'คุณแอน'
      },
      {
        id:'c3', name:null, position:'Marketing Executive', department:'Marketing',
        type:'new_headcount', process_start_date:'2026-05-01', current_step:3, status:'active',
        steps:[
          {step:1, completedDate:'2026-05-02', completedBy:'คุณกุ้ง'},
          {step:2, completedDate:'2026-05-10', completedBy:'คุณกุ้ง'}
        ],
        documents:[], probation:{}, files:[],
        shortlist:[
          {
            id:'sl_c3_1', name:'คุณวรรณกร พิภพไชย', addedAt:'2026-05-19', verdict:'pass', verdictAt:'2026-05-20 10:15', verdictBy:'คุณวิเชียร',
            files:[{ name:'resume_wannakarn.pdf', size:'245 KB', uploadedAt:'2026-05-19', uploadedBy:'คุณกุ้ง' }],
            sentTo:[{ id:'rcp1', name:'คุณวิเชียร', email:'marketing.head@jiancha.com', sentAt:'2026-05-19 14:30', filesAttached:['resume_wannakarn.pdf'] }]
          },
          {
            id:'sl_c3_2', name:'คุณภาณุพงศ์ จิตรเกษม', addedAt:'2026-05-19',
            files:[{ name:'resume_panupong.pdf', size:'198 KB', uploadedAt:'2026-05-19', uploadedBy:'คุณกุ้ง' }],
            sentTo:[]
          }
        ],
        notes:'ส่ง shortlist ให้ต้นสังกัดแล้ว · รอตอบ — เกิน SLA · ต้อง follow up',
        created_by:'คุณกุ้ง'
      },
      {
        id:'c4', name:'อรอนงค์ พงศ์ใหม่', position:'Accountant', department:'Finance',
        type:'replacement', process_start_date:'2026-04-10', current_step:5, status:'active',
        steps:[
          {step:1, completedDate:'2026-04-11', completedBy:'คุณแอน'},
          {step:2, completedDate:'2026-04-25', completedBy:'คุณแอน'},
          {step:3, completedDate:'2026-05-02', completedBy:'คุณกุ้ง'},
          {step:4, completedDate:'2026-05-14', completedBy:'คุณกุ้ง'}
        ],
        documents:[
          {key:'id_card', label:'สำเนาบัตรประชาชน', received:true, receivedDate:'2026-05-18'},
          {key:'house_reg', label:'สำเนาทะเบียนบ้าน', received:true, receivedDate:'2026-05-18'},
          {key:'education', label:'วุฒิการศึกษา', received:true, receivedDate:'2026-05-19'},
          {key:'work_cert', label:'ใบผ่านงาน', received:false, receivedDate:null},
          {key:'photo', label:'รูปถ่าย', received:true, receivedDate:'2026-05-19'},
          {key:'medical_cert', label:'ใบรับรองแพทย์', received:false, receivedDate:null}
        ],
        probation:{}, files:[
          { name:'resume_oranong.pdf', step:3, size:'312 KB', uploadedAt:'2026-04-28', uploadedBy:'คุณแอน' }
        ],
        generatedDocs:{
          4:{
            docName:'interview-evaluation-oranong.pdf',
            createdAt:'2026-05-14T15:00:00Z',
            createdBy:'คุณกุ้ง',
            data:{
              interview_date:'2026-05-12',
              level:'JG5',
              division:'Finance',
              edu_match:'match',
              exp_match:'match',
              job_change:'stable',
              residence:'near',
              scores:{ a1:4, a2:5, b1:4, b2:4, b3:4, b4:5, b5:4, b6:4, c1:3, c2:4, c3:4, d1:5, d2:4, d3:4 },
              summary:'มืออาชีพมาก · ประสบการณ์ตรงสาย · ใช้ Excel + SAP คล่อง · attitude ดี · เริ่มงานได้เร็ว · ราคาอยู่ในงบ',
              probation_goals:'• ปิดงบ monthly closing ได้ภายใน 3 วันทำการ\n• เรียนรู้ระบบ ERP ของบริษัทภายใน 30 วัน\n• ตรวจสอบ AR/AP accuracy 99%+',
              conclusion:'hire',
              conclusion_other_position:'',
              interviewer_name:'คุณกุ้ง · ทศนวรรณ + คุณวิเชียร พงศ์เจริญ',
              interviewer_position:'HR Manager + Finance Manager',
              interviewer_division:'HR · Finance'
            }
          },
          5:{
            docName:'recruitment-approval-oranong.pdf',
            createdAt:'2026-05-15T10:30:00Z',
            createdBy:'คุณแอน',
            data:{
              attachments:['resume-oranong.pdf','interview-scorecard-oranong.pdf','salary-history-oranong.pdf'],
              division:'Finance',
              start_date:'2026-06-01',
              end_probation_date:'2026-09-29',
              level:'JG5',
              salary_current:'',
              salary_new:'28,000',
              salary_post_probation:'30,000',
              allowance_items:[
                { label:'ค่าเดินทาง', amount:'2000' },
                { label:'ค่าตำแหน่ง', amount:'1500' }
              ],
              total_income: 31500,
              remarks:'มีประกันสังคม · ประกันสุขภาพกลุ่ม · กองทุนสำรองเลี้ยงชีพ · โบนัสประจำปี · หลังผ่านโปร 120 วันปรับเงินเดือนตามผลประเมิน',
              reason_type:'replace',
              replace_name:'คุณสุภาพ ก. (Senior Accountant ที่ลาออก)',
              replace_reason:'ลาออก',
              employment_type:'monthly',
              contract_months:12, contract_start:'2026-06-01',
              necessities:['ทดแทนพนักงาน','รองรับแผนกลยุทธ์ของบริษัทในอนาคต'],
              hr_received_date:'2026-05-16',
              hr_duration:'30',
              hr_recruiter_name:'คุณแอน · อภิญญา',
              hr_recruiter_position:'HR Recruiter'
            }
          }
        },
        approvalWorkflows:{
          5:{
            id:'wf1', status:'completed',
            documentName:'employment-approval-oranong.pdf',
            createdAt:'2026-05-15 10:30',
            completedAt:'2026-05-17 14:32',
            approvers:[
              {id:'a1', name:'คุณวิทยา รักดี', email:'wittaya@jiancha.com', role:'HRBP Manager', status:'approved', signedAt:'2026-05-15 14:32', ip:'203.144.1.x', sequence:1},
              {id:'a2', name:'คุณสมหญิง จิตดี', email:'somying@jiancha.com', role:'Operations Director', status:'approved', signedAt:'2026-05-16 09:15', ip:'110.78.5.x', sequence:2},
              {id:'a3', name:'คุณวิเชียร พงศ์เจริญ', email:'wichian@jiancha.com', role:'CHRO', status:'approved', signedAt:'2026-05-16 16:22', ip:'203.144.1.x', sequence:3},
              {id:'a4', name:'คุณภัทรา รัศมี', email:'pattaraa@jiancha.com', role:'CEO', status:'approved', signedAt:'2026-05-17 08:05', ip:'110.78.5.x', sequence:4}
            ]
          }
        },
        notes:'อนุมัติรับครบทุกลำดับแล้ว · พร้อมกด "ส่ง Offer & ต่อ" เข้าสู่ทดลองงาน (Step 6)',
        created_by:'คุณแอน'
      },
      {
        id:'c5', name:'ธนวัฒน์ เจริญผล', position:'Supply Chain Officer', department:'Supply Chain',
        type:'new_headcount', process_start_date:'2026-01-22', current_step:6, status:'active',
        steps:STEPS.slice(0,5).map((s,i) => ({ step:s.id, completedDate:addDays('2026-01-22', 5+i*4), completedBy:i%2?'คุณกุ้ง':'คุณแอน' })),
        documents:DOCUMENT_TEMPLATE.map(d => ({...d, received:true, receivedDate:'2026-03-15'})),
        probation:{
          startDate:'2026-03-23', evaluationSentDate:'2026-03-23', returnDate:null, passed:false,
          milestones:{ day30:{ done:true, date:'2026-04-22', score:8, note:'ผลงานดี ปรับตัวเร็ว' },
                        day60:{ done:true, date:'2026-05-22', score:9, note:'ทำงานเป็นทีมดี' },
                        day90:{ done:false, date:null, score:null, note:'' },
                        day120:{ done:false, date:null, score:null, note:'' } }
        },
        files:[], notes:'อยู่ระหว่างทดลองงาน · Day 60 — ประเมินผ่าน',
        created_by:'คุณกุ้ง'
      },
      {
        id:'c6', name:'พิมพ์ใจ วงศ์งาม', position:'HR Officer', department:'HR & People',
        type:'replacement', process_start_date:'2025-11-23', current_step:6, status:'active',
        steps:STEPS.slice(0,5).map((s,i) => ({ step:s.id, completedDate:addDays('2025-11-23', 3+i*5), completedBy:'คุณแอน' })),
        documents:DOCUMENT_TEMPLATE.map(d => ({...d, received:true, receivedDate:'2026-01-15'})),
        probation:{
          startDate:'2026-01-23', evaluationSentDate:'2026-01-23', returnDate:null, passed:false,
          milestones:{ day30:{ done:true, date:'2026-02-22', score:9, note:'เรียนรู้เร็ว' },
                        day60:{ done:true, date:'2026-03-24', score:9, note:'ใช้งานระบบ HRIS คล่อง' },
                        day90:{ done:true, date:'2026-04-23', score:10, note:'leadership ดีมาก' },
                        day120:{ done:false, date:null, score:null, note:'' } }
        },
        files:[], notes:'พร้อมประเมินผ่านโปร — Day 119+',
        created_by:'คุณแอน'
      },
      {
        id:'c7', name:'นภัสสร เลิศพิภพ', position:'Sales Executive', department:'Sales & BD',
        type:'new_headcount', process_start_date:'2025-09-01', current_step:6, status:'passed',
        steps:[
          ...STEPS.slice(0,5).map((s,i) => ({ step:s.id, completedDate:addDays('2025-09-01', 3+i*4), completedBy:'คุณกุ้ง' })),
          { step:6, completedDate:'2026-03-01', completedBy:'คุณแอน' }
        ],
        documents:DOCUMENT_TEMPLATE.map(d => ({...d, received:true, receivedDate:'2025-10-25'})),
        probation:{
          startDate:'2025-11-01', evaluationSentDate:'2025-11-01', returnDate:'2026-03-01', passed:true,
          milestones:{ day30:{done:true, date:'2025-12-01', score:9, note:'ทำยอดทะลุเป้า'},
                        day60:{done:true, date:'2025-12-31', score:9, note:'ปิดดีลใหญ่ได้'},
                        day90:{done:true, date:'2026-01-30', score:10, note:'top performer'},
                        day120:{done:true, date:'2026-03-01', score:10, note:'พร้อมเป็น Senior'} }
        },
        files:[], notes:'ผ่านโปรเรียบร้อย performance ดีมาก',
        created_by:'คุณกุ้ง'
      }
    ];

    // =========================================================================
    // Helpers
    // =========================================================================
    // Steps with combined doc + approval flow (Step 1, 5)
    const APPROVAL_STEPS = [1, 5];

    function deriveStatus(c) {
      if (c.status === 'passed')    return { tone:'green',  label:'ผ่านโปร',     icon:'✓' };
      if (c.status === 'cancelled') return { tone:'gray',   label:'ยกเลิกตำแหน่ง', icon:'×' };
      if (c.status === 'rejected' && Object.values(c.probationEvals || {}).some(r => r?.hr_signed && r.final_status === 'failed'))
                                    return { tone:'red',    label:'ไม่ผ่านโปร',   icon:'✕' };
      if (c.status === 'rejected')  return { tone:'gray',   label:'ยกเลิก',       icon:'×' };
      // Step 1: รออนุมัติ
      if (c.current_step === 1) {
        const wf = c.approvalWorkflows?.[1];
        if (!wf) return { tone:'gray', label:'ยังไม่ส่งอนุมัติ', icon:'○' };
        if (wf.status === 'in_progress') {
          const done = wf.approvers.filter(a => a.status === 'approved').length;
          return { tone:'blue', label:`รออนุมัติ (${done}/${wf.approvers.length})`, icon:'⏳' };
        }
        if (wf.status === 'completed') return { tone:'green', label:'อนุมัติครบ พร้อมสรรหา', icon:'✓' };
      }
      const daysSinceStart = daysBetween(c.process_start_date, today());
      if (c.current_step <= 2 && c.current_step !== 1) {
        const daysToDeadline = STEP_2_DEADLINE_DAYS - daysSinceStart;
        if (daysToDeadline < 0)  return { tone:'red',    label:`เกิน deadline ${Math.abs(daysToDeadline)} วัน`, icon:'⚠' };
        if (daysToDeadline <= 3) return { tone:'yellow', label:`ใกล้ deadline (${daysToDeadline} วัน)`,        icon:'!' };
      }
      // Step 5: Offer Approval state
      if (c.current_step === 5) {
        const wf = c.approvalWorkflows?.[5];
        if (wf?.status === 'in_progress') {
          const done = wf.approvers.filter(a => a.status === 'approved').length;
          return { tone:'blue', label:`รออนุมัติ Offer (${done}/${wf.approvers.length})`, icon:'⏳' };
        }
      }
      if (c.current_step === TOTAL_STEPS) {
        const probationStart = c.probation?.startDate ?? c.process_start_date;
        const daysInProbation = daysBetween(probationStart, today());
        if (daysInProbation >= PROBATION_DAYS + 5) return { tone:'red',    label:'เกินกำหนดประเมิน', icon:'⚠' };
        if (daysInProbation >= PROBATION_ELIGIBLE)  return { tone:'blue',   label:'พร้อมผ่านโปร',     icon:'✦' };
      }
      return { tone:'green', label:'ปกติ', icon:'●' };
    }

    function progressPercent(c) {
      if (c.status === 'passed') return 100;
      if (c.current_step < TOTAL_STEPS) return Math.round((c.current_step / TOTAL_STEPS) * 100);
      // At final step (probation): scale from 90% (just entered probation) → 100% (Day 120 done)
      const probationStart = c.probation?.startDate ?? c.process_start_date;
      const d = Math.min(daysBetween(probationStart, today()), PROBATION_DAYS);
      return 90 + Math.round((d / PROBATION_DAYS) * 10);
    }

    const toneClasses = {
      green:'bg-emerald-100 text-emerald-800 border-emerald-200',
      yellow:'bg-amber-100 text-amber-800 border-amber-200',
      red:'bg-rose-100 text-rose-800 border-rose-200',
      blue:'bg-sky-100 text-sky-800 border-sky-200',
      gray:'bg-slate-100 text-slate-700 border-slate-200'
    };
    const toneBar = { green:'bg-emerald-500', yellow:'bg-amber-500', red:'bg-rose-500', blue:'bg-sky-500', gray:'bg-slate-500' };

    // Bucket candidate into 1 of 3 pipeline sections
    function bucketOf(c) {
      if (c.current_step === TOTAL_STEPS || c.status === 'passed') return 'probation';
      if (c.name) return 'onboarding';
      return 'open';
    }

    // =========================================================================
    // Toast (simple, app-wide)
    // =========================================================================
    let toastSetter = null;
    function showToast(message, type='info') {
      if (toastSetter) toastSetter({ id: Date.now(), message, type });
    }
    function ToastContainer() {
      const [toast, setToast] = useState(null);
      useEffect(() => { toastSetter = setToast; return () => { toastSetter = null; }; }, []);
      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
      }, [toast]);
      if (!toast) return null;
      const bg = { info:'bg-slate-900', success:'bg-emerald-600', warning:'bg-amber-600', email:'bg-sky-600' }[toast.type] ?? 'bg-slate-900';
      const icon = { info:'ℹ️', success:'✅', warning:'⚠️', email:'📧' }[toast.type] ?? 'ℹ️';
      return (
        <div className="fixed top-4 right-4 z-50 toast-enter">
          <div className={`${bg} text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-md`}>
            <span>{icon}</span> {toast.message}
          </div>
        </div>
      );
    }

    // =========================================================================
    // Shared Modal
    // =========================================================================
    function Modal({ title, subtitle, onClose, wide, children }) {
      useEffect(() => {
        const k = e => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', k);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prevOverflow; };
      }, [onClose]);
      return (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-6" onClick={onClose}>
          <div className={`bg-white rounded-2xl shadow-xl border border-slate-200 w-full ${wide?'max-w-3xl':'max-w-md'} mx-auto my-2 sm:my-8`} onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 truncate">{title}</div>
                {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900">✕</button>
            </div>
            <div className="p-4 sm:p-5">{children}</div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // Signature Pad (canvas)
    // =========================================================================
    function SignaturePad({ onChange }) {
      const canvasRef = useRef(null);
      const fileInputRef = useRef(null);
      const drawing = useRef(false);
      const [hasInk, setHasInk] = useState(false);
      const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
      const [uploadedName, setUploadedName] = useState('');
      const [uploadedDataUrl, setUploadedDataUrl] = useState('');

      useEffect(() => {
        const c = canvasRef.current;
        c.width = c.offsetWidth * 2;
        c.height = c.offsetHeight * 2;
        const ctx = c.getContext('2d');
        ctx.scale(2, 2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f172a';
      }, []);

      const getPos = (e) => {
        const c = canvasRef.current;
        const rect = c.getBoundingClientRect();
        const t = e.touches?.[0] ?? e;
        return { x: t.clientX - rect.left, y: t.clientY - rect.top };
      };

      const start = (e) => {
        e.preventDefault();
        drawing.current = true;
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(x, y);
      };
      const draw = (e) => {
        if (!drawing.current) return;
        e.preventDefault();
        const { x, y } = getPos(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineTo(x, y);
        ctx.stroke();
        if (!hasInk) setHasInk(true);
      };
      const end = () => {
        if (!drawing.current) return;
        drawing.current = false;
        onChange?.(canvasRef.current.toDataURL('image/png'));
      };
      const clear = () => {
        if (mode === 'draw' && canvasRef.current) {
          const c = canvasRef.current;
          const ctx = c.getContext('2d');
          ctx.clearRect(0, 0, c.width, c.height);
        }
        setHasInk(false);
        setUploadedName('');
        setUploadedDataUrl('');
        onChange?.(null);
      };

      const handleFileUpload = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพ (PNG/JPG)', 'warning'); return; }
        if (f.size > 2 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกิน 2MB', 'warning'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          setUploadedName(f.name);
          setUploadedDataUrl(dataUrl);
          setHasInk(true);
          onChange?.(dataUrl);
          showToast(`อัพโหลดลายเซ็น ${f.name} เรียบร้อย`, 'success');
        };
        reader.readAsDataURL(f);
        e.target.value = '';
      };

      const switchMode = (m) => {
        setMode(m);
        clear();
      };

      return (
        <div>
          {/* Mode toggle */}
          <div className="flex gap-1 mb-2 bg-slate-100 p-1 rounded-lg w-fit">
            <button type="button" onClick={() => switchMode('draw')}
              className={`text-xs px-3 py-1.5 rounded ${mode === 'draw' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-900'}`}>
              ✏️ วาดเอง
            </button>
            <button type="button" onClick={() => switchMode('upload')}
              className={`text-xs px-3 py-1.5 rounded ${mode === 'upload' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-900'}`}>
              📤 อัพโหลดไฟล์ลายเซ็น
            </button>
          </div>

          {mode === 'draw' && (
            <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 relative">
              <canvas
                ref={canvasRef}
                style={{ width:'100%', height:'180px', display:'block', touchAction:'none', cursor:'crosshair' }}
                onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
              />
              {!hasInk && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
                  ✍️ วาดลายเซ็นของท่านในกรอบนี้ (เมาส์ / นิ้ว)
                </div>
              )}
            </div>
          )}

          {mode === 'upload' && (
            <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 p-4">
              {uploadedDataUrl ? (
                <div className="text-center">
                  <img src={uploadedDataUrl} alt="signature" style={{ maxHeight:'140px', maxWidth:'100%', margin:'0 auto', display:'block', background:'white', borderRadius:'6px', padding:'8px' }} />
                  <div className="text-xs text-slate-700 mt-2">📎 {uploadedName}</div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-sm px-4 py-2 rounded-lg ibtn">
                    📤 เลือกไฟล์ลายเซ็น (PNG / JPG)
                  </button>
                  <div className="text-xs text-slate-500 mt-2">รองรับไฟล์รูปภาพไม่เกิน 2MB · แนะนำพื้นหลังโปร่งใส</div>
                </div>
              )}
              <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileUpload} />
            </div>
          )}

          <div className="flex justify-between mt-2">
            <span className="text-xs text-slate-500">{hasInk ? `✓ ลายเซ็นพร้อม ${mode === 'upload' ? '(จากไฟล์)' : '(วาดเอง)'}` : 'ยังไม่ได้เซ็น'}</span>
            {hasInk && <button type="button" onClick={clear} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100">ล้าง</button>}
          </div>
        </div>
      );
    }

    // =========================================================================
    // ===================== HR DASHBOARD ROLE =================================
    // =========================================================================

    // Reusable Department selector — list options + "อื่นๆ" reveals custom text input
    function DepartmentSelect({ value, options, onChange }) {
      const isCustom = value && !options.includes(value);
      const [mode, setMode] = useState(isCustom ? 'custom' : (value ? 'select' : 'select'));
      const handleSelect = (e) => {
        const v = e.target.value;
        if (v === '__other__') {
          setMode('custom');
          onChange('');
        } else {
          setMode('select');
          onChange(v);
        }
      };
      return (
        <div className="space-y-2">
          <select className="input" value={mode === 'custom' ? '__other__' : (value || '')} onChange={handleSelect}>
            <option value="">— เลือกแผนก —</option>
            {options.map(d => <option key={d} value={d}>{d}</option>)}
            <option value="__other__">+ อื่นๆ (พิมพ์ชื่อแผนกเอง)</option>
          </select>
          {mode === 'custom' && (
            <div className="space-y-1">
              <input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder="พิมพ์ชื่อแผนก (ภาษาไทย หรือ อังกฤษ)" autoFocus />
              <div className="text-[10px] text-slate-500">💡 แผนกใหม่นี้จะถูกเพิ่มเข้า dropdown อัตโนมัติ</div>
            </div>
          )}
        </div>
      );
    }

    function Field({ label, required, children }) {
      return (
        <label className="block">
          <div className="text-xs font-medium text-slate-600 mb-1">
            {label} {required && <span className="text-rose-500">*</span>}
          </div>
          {children}
        </label>
      );
    }

    function CandidateAddForm({ onClose, onSave, departments }) {
      const [form, setForm] = useState({
        position:'', department:'', type:'replacement',
        process_start_date: today(), notes:''
      });
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const submit = (e) => {
        e.preventDefault();
        if (!form.position.trim() || !form.department.trim()) {
          showToast('กรุณากรอก ตำแหน่ง / แผนก ให้ครบ', 'warning');
          return;
        }
        onSave(form);
      };
      return (
        <Modal title="New Requisition" subtitle="เริ่ม Process สรรหา · Step 1 · (ชื่อผู้สมัครใส่ภายหลังเมื่อผ่านสัมภาษณ์)" onClose={onClose}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="ตำแหน่ง" required>
              <input className="input" value={form.position} onChange={e => set('position', e.target.value)} placeholder="เช่น Store Manager, Barista Lead" autoFocus />
            </Field>
            <Field label="แผนก" required>
              <DepartmentSelect value={form.department} options={departments} onChange={(v) => set('department', v)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ประเภท">
                <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
                  <option value="replacement">ทดแทนคนลาออก</option>
                  <option value="new_headcount">อัตราใหม่</option>
                </select>
              </Field>
              <Field label="วันเริ่ม Process">
                <input type="date" className="input" value={form.process_start_date} onChange={e => set('process_start_date', e.target.value)} />
              </Field>
            </div>
            <Field label="หมายเหตุ (ถ้ามี)">
              <textarea rows={3} className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="เช่น ต้องการคนที่มีประสบการณ์ 3+ ปี · งบประมาณ ฿35k" />
            </Field>
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
              💡 หลังเปิดอัตราจะอยู่ที่ <b>Step 1 · รออนุมัติเปิดอัตรา</b> — ต้องลงนามครบ 3 ระดับก่อนถึงจะเริ่มสรรหาได้ (Step 2)
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-lg">Create Requisition</button>
            </div>
          </form>
        </Modal>
      );
    }

    // Add an employee straight into probation (skip recruitment Step 1–5).
    // For staff who joined before the system existed, or who entered without
    // going through the hiring process but still need a probation evaluation.
    function DirectProbationForm({ onClose, onSave, departments }) {
      const [form, setForm] = useState({ name:'', position:'', department:'', start_date: today(), notes:'' });
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const submit = (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.position.trim() || !form.department.trim()) {
          showToast('กรุณากรอก ชื่อ / ตำแหน่ง / แผนก ให้ครบ', 'warning'); return;
        }
        onSave(form);
      };
      return (
        <Modal title="เพิ่มพนักงานเข้าประเมินทดลองงาน" subtitle="ข้ามขั้นตอนสรรหา 1–5 · เข้าสู่ Probation โดยตรง" onClose={onClose}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="ชื่อ-นามสกุล พนักงาน" required>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="เช่น สมศรี รักงาน" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ตำแหน่ง" required>
                <input className="input" value={form.position} onChange={e => set('position', e.target.value)} placeholder="เช่น Barista" />
              </Field>
              <Field label="แผนก" required>
                <DepartmentSelect value={form.department} options={departments} onChange={(v) => set('department', v)} />
              </Field>
            </div>
            <Field label="วันเริ่มงาน (= วันเริ่มทดลองงาน)" required>
              <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </Field>
            <Field label="หมายเหตุ (ถ้ามี)">
              <textarea rows={2} className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="เช่น พนักงานเดิมก่อนระบบใช้งาน / เข้าตรงไม่ผ่านสรรหา" />
            </Field>
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-800">
              🛡 พนักงานจะถูกสร้างที่ <b>Step 6 · Probation</b> ทันที — สร้างเอกสารประเมิน Day 30/60/90 ได้เลย (ไม่ต้องทำ Step 1–5)
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg ibtn">เพิ่มเข้า Probation</button>
            </div>
          </form>
        </Modal>
      );
    }

    function CandidateNameForm({ initial, position, onClose, onSave }) {
      const [name, setName] = useState(initial ?? '');
      const submit = (e) => {
        e.preventDefault();
        if (!name.trim()) { showToast('กรุณาใส่ชื่อ-นามสกุลผู้สมัคร', 'warning'); return; }
        onSave(name.trim());
      };
      return (
        <Modal title="ใส่ชื่อผู้สมัครที่ผ่านสัมภาษณ์" subtitle={position} onClose={onClose}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="ชื่อ-นามสกุล ผู้สมัคร" required>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น สมศรี รักงาน" autoFocus />
            </Field>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800">
              ✓ หลังใส่ชื่อแล้ว ระบบจะเปลี่ยนชื่อบนการ์ดจาก "{position}" เป็นชื่อผู้สมัครคนนี้
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-lg">บันทึก</button>
            </div>
          </form>
        </Modal>
      );
    }

    // =========================================================================
    // ===== Document Generator ================================================
    // =========================================================================
    const DOC_LABELS = {
      1: { name:'Manpower Requisition Form',          file:'manpower-requisition',  thai:'แบบฟอร์มขออนุมัติกำลังคน' },
      4: { name:'Interview Evaluation Form',          file:'interview-evaluation',  thai:'แบบฟอร์มประเมินการสัมภาษณ์งาน' },
      5: { name:'Employee Recruitment Approval Form', file:'recruitment-approval',  thai:'แบบฟอร์มขออนุมัติรับพนักงาน' },
      6: { name:'Probation Evaluation Form',          file:'probation-evaluation',  thai:'แบบฟอร์มประเมินผลการทดลองงาน' }
    };

    // JIANCHA Logo — official brand image (vertical layout: circle on top, JIANCHA wordmark below)
    function JianchaLogo({ size = 64 }) {
      // โลโก้ JIANCHA ตัวจริง (เวกเตอร์ SVG · ฝัง base64 · self-contained)
      return <img src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/Pgo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDIwMDEwOTA0Ly9FTiIKICJodHRwOi8vd3d3LnczLm9yZy9UUi8yMDAxL1JFQy1TVkctMjAwMTA5MDQvRFREL3N2ZzEwLmR0ZCI+CjxzdmcgdmVyc2lvbj0iMS4wIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiB3aWR0aD0iNDA4MC4wMDAwMDBwdCIgaGVpZ2h0PSI4MjAuMDAwMDAwcHQiIHZpZXdCb3g9IjAgMCA0MDgwLjAwMDAwMCA4MjAuMDAwMDAwIgogcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCI+Cgo8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLjAwMDAwMCw4MjAuMDAwMDAwKSBzY2FsZSgwLjEwMDAwMCwtMC4xMDAwMDApIgpmaWxsPSIjMDAwMDAwIiBzdHJva2U9Im5vbmUiPgo8cGF0aCBkPSJNMjc2NTUgODE5MCBjLTMgLTYgLTUxIC0xMCAtMTA5IC0xMCAtNTYgMCAtMTA2IC00IC0xMTEgLTkgLTYgLTUKLTMyIC0xMiAtNjAgLTE0IC01NSAtNiAtMTIxIC0xOCAtMjA1IC0zNyAtNTQgLTEyIC02NSAtMTYgLTEyMyAtMzkgLTE1IC02Ci0zOCAtMTEgLTUwIC0xMSAtMTMgMCAtMjcgLTQgLTMyIC04IC02IC00IC0yOCAtMTQgLTUwIC0yMSAtNDMgLTEzIC01MiAtMTcKLTEzMCAtNTEgLTExMCAtNDggLTIwMiAtOTUgLTI0MiAtMTIyIC0yMyAtMTUgLTQ0IC0yOCAtNDggLTI4IC00IDAgLTI2IC0xMwotNTAgLTMwIC0yNCAtMTYgLTQ3IC0zMCAtNTAgLTMwIC00IDAgLTIyIC0xMiAtNDAgLTI3IC0xOCAtMTYgLTU2IC00NiAtODUKLTY4IC03OCAtNjAgLTIyOSAtMjEyIC0yODIgLTI4NiAtNzQgLTEwMSAtMTY4IC0yNDcgLTE2OCAtMjYxIDAgLTYgLTYgLTE5Ci0xNCAtMjcgLTE2IC0xNyAtMTE2IC0yMzUgLTExNiAtMjUxIDAgLTYgLTQgLTE4IC05IC0yOCAtMTcgLTMwIC00MyAtMTQzIC01OAotMjUyIC04IC01OCAtMTkgLTEyMSAtMjQgLTE0MCAtMTIgLTQ5IC0yNyAtMzIyIC00MCAtNzY1IC0xMSAtMzcyIC04IC0zMDc3IDQKLTMyNDUgMiAtNDEgMTAgLTE1NCAxNiAtMjUwIDcgLTk2IDE2IC0xOTMgMjEgLTIxNSA1IC0yMiAxNCAtOTIgMjAgLTE1NSA2Ci02MyAxNSAtMTI0IDIwIC0xMzUgNSAtMTEgMTEgLTQyIDEzIC03MCAzIC0yNyAxMCAtNjggMTcgLTkwIDYgLTIyIDE1IC02MiAyMAotOTAgMTMgLTgxIDQzIC0xNzYgODYgLTI3MyAxMyAtMjkgMjQgLTU3IDI0IC02MiAwIC02IDUgLTEwIDEwIC0xMCA2IDAgMTAgLTkKMTAgLTIwIDAgLTExIDEwIC0zNiAyMiAtNTcgMTEgLTIxIDI2IC00NyAzMiAtNTggNDUgLTgxIDEzNyAtMTk3IDIzMCAtMjkwCjExMSAtMTExIDE3MSAtMTY1IDE4MiAtMTY1IDMgMCAzMiAtMjAgNjQgLTQ1IDMyIC0yNSA2MSAtNDUgNjUgLTQ1IDMgMCAyNQotMTMgNDggLTI5IDQ0IC0yOSAxODYgLTk5IDI3MiAtMTMzIDI4IC0xMSA2NCAtMjUgODAgLTMyIDU3IC0yNCAyNDEgLTgwIDMyMAotOTcgMTU1IC0zMiAxOTcgLTQwIDI3MSAtNDcgNDQgLTUgODUgLTEyIDkwIC0xNSA2IC0zIDEyMCAtMTEgMjU0IC0xNyAyNDgKLTEyIDYwNiAtMiA3MDMgMjAgMjMgNSA5MiAxOCAxNTIgMjggMTYwIDI5IDMyNCA3MyAzNzcgMTAyIDEwIDYgMjUgMTAgMzMgMTAKOSAwIDM1IDkgNTcgMjAgMjMgMTEgNDkgMjAgNTggMjAgOSAwIDIwIDQgMjUgOSA2IDUgNDggMjkgOTUgNTQgMTE0IDU5IDEyNAo2NSAyMDUgMTE4IDM5IDI1IDc3IDUwIDg2IDU1IDYyIDMzIDM3OSAzMTUgMzc5IDMzNyAwIDQgMjMgMzYgNTEgNzAgNzUgOTIgODEKMTAxIDEyMyAxODIgMTIgMjIgMjMgNDIgMjYgNDUgNCA0IDM1IDcwIDc2IDE2NSAxMiAyOCAzMiA5NSA1NSAxOTAgNiAyMiAxNQo1NCAyMCA3MSA1IDE3IDkgNTEgOSA3NSAwIDI1IDQgNDkgOCA1NSA1IDUgMTQgNjEgMjEgMTI0IDcgNjMgMTcgMTM1IDIyIDE2MAozNyAxNzkgNjggMTM0MCAzNyAxMzgzIC0xMiAxNiAtODIgMTcgLTEwMjMgMTUgbC0xMDEwIC0zIC02IC02OTAgYy02IC02NTUKLTE4IC05NDggLTQwIC05NjkgLTUgLTYgLTkgLTI2IC05IC00NSAwIC00MiAtMTcgLTk1IC00MyAtMTM0IC05IC0xNCAtMTcgLTMwCi0xNyAtMzQgMCAtNSAtOSAtMTUgLTIxIC0yMyAtMTEgLTggLTM1IC0yNSAtNTIgLTM3IC0xNyAtMTMgLTQxIC0yMyAtNTMgLTIzCi0xMyAwIC0yNiAtNCAtMjkgLTEwIC04IC0xMyAtMTkyIC0xMyAtMjAwIDAgLTMgNiAtMTYgMTAgLTI4IDEwIC0yMiAwIC04NiAzOQotMTI0IDc2IC0yMCAyMCAtNDYgODggLTczIDE4OSAtMzEgMTIyIC0zNCAyOTMgLTM4IDI0MzAgLTIgMTQzMiAwIDIxNjYgNwoyMjIwIDYgNDQgMTUgMTIzIDIxIDE3NSAxNiAxNTMgMjAgMTczIDQzIDIyMCAzMCA2NCA4MyAxMTcgMTQ2IDE0NSA0NSAyMSA2OQoyNSAxNTEgMjUgOTMgMCAxMzEgLTcgMTk1IC0zNSA3OSAtMzUgMTI3IC0xNDEgMTQxIC0zMDcgMyAtNDAgOCAtOTEgMTEgLTExMwo0IC0yMiA4IC00MzIgMTAgLTkxMiBsMyAtODcyIDMzIC02IGMxNyAtMyA0NzQgLTUgMTAxNSAtMyA4NjAgMyA5ODQgNSA5OTMgMTgKMTQgMjEgNiAxNDA0IC04IDE0MjIgLTYgNyAtMTMgNjggLTE3IDEzNiAtNCA2NyAtMTEgMTQ2IC0xNyAxNzUgLTUgMjggLTE3IDk3Ci0yNSAxNTIgLTIyIDE0NiAtMzEgMTk1IC00NCAyNDAgLTcgMjIgLTE0IDU2IC0xNyA3NSAtMiAxOSAtOCA0NCAtMTMgNTUgLTUKMTEgLTIxIDU0IC0zNCA5NSAtMjggODcgLTYwIDE2MCAtOTEgMjEwIC04NiAxMzcgLTExMyAxNzkgLTEzNSAyMDUgLTQ2IDU2Ci0yOTkgMzAzIC0zMjQgMzE3IC0xMyA3IC02OSA0MyAtMTIzIDc5IC01NCAzNyAtMTE3IDc1IC0xMzggODYgLTIyIDExIC02MiAzMgotOTAgNDYgLTc4IDQwIC0xODMgODcgLTE5NSA4NyAtNSAwIC0xOSA1IC0zMCAxMCAtMTEgNiAtMjkgMTUgLTQwIDIwIC0xMSA2Ci0yOSAxMCAtMzkgMTAgLTExIDAgLTIyIDQgLTI1IDkgLTMgNSAtMjAgMTEgLTM4IDE0IC0xOCAzIC01MSAxMCAtNzMgMTcgLTc3CjIyIC0xNjAgNDIgLTIxNSA1MCAtMzAgNSAtODAgMTQgLTExMCAyMSAtMzAgNiAtMTA0IDE0IC0xNjUgMTYgLTYwIDIgLTExNCA4Ci0xMTkgMTQgLTE0IDEzIC01ODMgMTIgLTU5MSAtMXoiLz4KPHBhdGggZD0iTTM3MTcgODEwNCBjLTMgLTQgLTI4IC04IC01NCAtMTAgLTEyMCAtOSAtMjc5IC0yNiAtMjg4IC0zMiAtNSAtNAotNDEgLTEwIC04MCAtMTQgLTM4IC00IC05MCAtMTIgLTExNSAtMTggLTI1IC02IC02MyAtMTUgLTg1IC0yMCAtMTAwIC0yMgotMTgxIC00MyAtMTk1IC01MCAtOSAtNCAtMzEgLTExIC01MCAtMTUgLTE5IC00IC0zOSAtMTAgLTQ1IC0xNCAtNSAtNCAtMzUKLTEzIC02NSAtMjAgLTMwIC04IC01OSAtMTcgLTY1IC0yMCAtNSAtNCAtMjggLTEzIC01MCAtMjAgLTIyIC03IC00OSAtMTYgLTYwCi0yMSAtMTEgLTQgLTM4IC0xNSAtNjAgLTI0IC0yMiAtOSAtNTMgLTIzIC02OCAtMzEgLTE2IC04IC0zMyAtMTUgLTM4IC0xNQotMTMgMCAtMjU4IC0xMjIgLTM2OSAtMTgzIC05NiAtNTMgLTE3OCAtMTA0IC0zMDYgLTE5MiAtNDggLTMzIC05NCAtNjQgLTEwMwotNzAgLTggLTUgLTgxIC02NCAtMTYxIC0xMzAgLTI0NCAtMjAxIC01NTEgLTUyMiAtNjgyIC03MTUgLTI0IC0zNSAtMTE1IC0xNjMKLTEyNSAtMTc2IC00IC01IC0xMyAtMTkgLTIwIC0zMCAtNTQgLTg3IC0xMDAgLTE2NCAtMTEzIC0xODcgLTI4IC01MCAtMjAzCi00MDIgLTIxMCAtNDIyIC00IC0xMSAtMTkgLTQ5IC0zNCAtODUgLTE0IC0zNiAtMjYgLTY4IC0yNiAtNzMgMCAtNyAtMzQgLTg4Ci01MSAtMTE5IC01IC0xMCAtOSAtMjggLTkgLTQyIDAgLTEzIC03IC00MSAtMTcgLTYyIC05IC0yMiAtMjAgLTU1IC0yNCAtNzQKLTQgLTE5IC0xNyAtNzMgLTI5IC0xMjAgLTQyIC0xNjcgLTUxIC0yMDcgLTcyIC0zMjUgLTExIC02NiAtMjIgLTE3MiAtMjUKLTIzNSAtMiAtNjMgLTggLTExOSAtMTQgLTEyNCAtMTIgLTEzIC0xMiAtNTk2IDAgLTU5NiA1IDAgMTEgLTUzIDE0IC0xMTcgMwotNjUgMTQgLTE3MCAyNSAtMjMzIDEyIC02MyAyNiAtMTQ0IDMyIC0xODAgNiAtMzYgMTUgLTcyIDE5IC04MSA1IC05IDE1IC00NQoyMiAtODAgNiAtMzUgMTYgLTY4IDIwIC03MyA1IC02IDkgLTI0IDkgLTQxIDAgLTE4IDMgLTM1IDcgLTM5IDEwIC0xMCAzMyAtNzgKMzMgLTk5IDAgLTkgNCAtMjUgMTAgLTM1IDUgLTkgMjYgLTYyIDQ2IC0xMTcgMjAgLTU1IDQ1IC0xMjAgNTYgLTE0NSAxMSAtMjUKMjQgLTU0IDI4IC02NSA1IC0xMSAzNiAtNzggNzAgLTE1MCA4OSAtMTg2IDE1MyAtMjkzIDM3MCAtNjE1IDE0IC0yMCA0NiAtNjEKNzEgLTkxIDI1IC0zMCA1MCAtNjIgNTUgLTcyIDI2IC00NiAzMzcgLTM2OCA0NTQgLTQ2OSAxMjMgLTEwNSAyMDcgLTE3MiAyMzcKLTE5MCAxOCAtMTEgMzMgLTI0IDMzIC0yOSAwIC01IDQgLTkgMTAgLTkgNSAwIDM2IC0xOSA2NyAtNDMgNjQgLTQ4IDIzMSAtMTU0CjI3OCAtMTc3IDE3IC04IDM3IC0yMCA0NSAtMjYgOCAtNyA1MSAtMzEgOTUgLTUzIDQ0IC0yMyA4NyAtNDUgOTUgLTUwIDI3IC0xNwoxNjMgLTc5IDIyMCAtMTAxIDc0IC0yOCAxMTkgLTQ4IDE1MyAtNjUgMTYgLTggMzYgLTE1IDQ0IC0xNSAxNSAwIDExMSAtMzEKMTU4IC01MCAxOSAtOSAxNjQgLTUxIDIzNSAtNjkgOTkgLTI2IDIyNCAtNTEgMjUzIC01MSAxOCAwIDM3IC00IDQyIC05IDYgLTUKNzEgLTE1IDE0NSAtMjEgNzQgLTcgMTQ2IC0xNyAxNTkgLTI0IDM0IC0xNiA3MTEgLTE1IDc2NiAxIDIyIDYgMTAxIDE5IDE3NQoyOCAxOTMgMjIgMzMyIDQ4IDQ0MCA4MCAyNSA3IDgzIDI0IDEzMCAzNiA0NyAxMiA4OSAyNiA5NSAzMSA1IDQgMTcgOCAyNyA4CjEwIDAgMjcgNCAzOCAxMCAxMSA1IDI5IDE1IDQwIDIwIDExIDYgMjggMTAgMzggMTAgMTAgMCAyMiA0IDI3IDggNiA1IDMwIDE1CjU1IDIyIDI1IDggNTAgMTcgNTUgMjEgNiA0IDQ0IDIxIDg1IDM3IDgxIDMyIDMwNCAxNDQgMzg1IDE5MiAyOCAxNyA1NyAzNCA2NQozNyA0OCAyMiAyNTYgMTYxIDM1NiAyMzggMzYgMjggODAgNjAgOTcgNzMgMTQ3IDEwNiA2NDcgNjA4IDY0NyA2NTAgMCA1IDggMTYKMTcgMjMgOSA4IDQzIDUwIDc0IDk0IDMyIDQ0IDYzIDg1IDY5IDkyIDUgNyAxMCAxNSAxMCAxOSAwIDMgMTMgMjMgMjkgNDMgMzEKMzggODAgMTE3IDEwNiAxNjYgOCAxNyAyNiA0OCAzOSA3MCA3OSAxMzMgMjk2IDYwOCAyOTYgNjQ5IDAgOSA0IDI0IDEwIDM0IDEyCjIyIDQ0IDEyMyA2MCAxODcgNiAyOCAxNiA1OSAyMCA3MCA1IDExIDExIDM0IDEzIDUwIDMgMTcgMTIgNjIgMjEgMTAwIDEwIDM5CjI0IDExNSAzMyAxNzAgOCA1NSAxOSAxMDkgMjQgMTIwIDExIDI2IDI5IDIzMSAyOSAzMjYgMCA0MSA1IDgwIDEwIDg1IDExIDExCjggMzI2IC0zIDQwOSAtMyAyMiAtMTEgMTEzIC0xOCAyMDMgLTcgOTAgLTE2IDE2NSAtMjEgMTY4IC00IDMgLTggMjAgLTggMzcgMAoxOCAtNiA2NCAtMTQgMTAyIC04IDM5IC0yMSAxMDQgLTMwIDE0NSAtMTUgNzQgLTM5IDE2MiAtNTcgMjA4IC01IDEzIC05IDMyCi05IDQzIDAgMTAgLTQgMjcgLTkgMzcgLTUgOSAtMjMgNjIgLTQwIDExNyAtMTggNTUgLTM3IDExMSAtNDMgMTI1IC01IDE0IC0xNgozOSAtMjMgNTUgLTcgMTcgLTI0IDU3IC0zNiA5MCAtMjcgNjkgLTE3MCAzNTQgLTIxNyA0MzMgLTE4IDI5IC0zMiA1NSAtMzIgNTcKMCAyIC0xMyAyNCAtMjggNDcgLTE2IDI0IC01NCA4MSAtODUgMTI4IC0xMDUgMTU4IC0xNzUgMjUwIC0yOTIgMzgyIC0zOCA0NAotODMgOTYgLTEwMCAxMTYgLTQyIDUyIC0xODMgMTkyIC0xOTMgMTkyIC01IDAgLTE3IDEwIC0yOCAyMSAtNDQgNTAgLTIxMiAxODkKLTM2NyAzMDQgLTYxIDQ1IC0yNjIgMTczIC00MTIgMjYxIC01MyAzMSAtMjIyIDExNSAtMzE1IDE1NyAtMzAgMTMgLTcxIDMxCi05MCA0MCAtNDEgMTggLTE0NyA1NyAtMTc1IDY0IC0xMSAzIC0yNyA3IC0zNSAxMCAtMTI1IDQ2IC0xNzkgNjMgLTE5NyA2MwotMTIgMCAtMjQgNCAtMjcgOCAtMyA1IC0zMSAxNCAtNjMgMjEgLTMyIDcgLTY2IDE3IC03NSAyMiAtMTAgNSAtMzYgOSAtNTcgOQotMjIgMCAtNDIgNCAtNDUgOSAtNiAxMCAtNTcgMTkgLTE1MSAyNyAtMzMgMyAtNjQgOSAtNzAgMTQgLTUgNCAtNzEgMTMgLTE0NQoxOSAtNzQgNyAtMTQ4IDE1IC0xNjUgMTggLTQzIDkgLTYwMCAxNSAtNjA4IDd6IG02MzUgLTE3NCBjODQgLTYgMTYyIC0xNSAxNzMKLTE5IDE4IC04IDE2OSAtMzMgMjgwIC00NyAyMiAtMyA0OSAtOSA2MCAtMTQgMTEgLTUgNDUgLTE0IDc1IC0yMCA2MiAtMTQgOTUKLTI0IDI2NSAtODAgMTcyIC01NyAxODYgLTYxIDIzMCAtODEgMjIgLTEwIDY1IC0yOCA5NSAtNDEgODggLTM2IDM1OCAtMTc1CjQzNSAtMjIzIDIyIC0xNCA0NyAtMjggNTUgLTMyIDI5IC0xMyAxOTYgLTEyNyAyNjIgLTE4MCAzNyAtMjkgNzAgLTUzIDc0IC01Mwo4IDAgMTg4IC0xNTcgMjMzIC0yMDQgMTkgLTIwIDM5IC0zNiA0NCAtMzYgMTMgMCAxNDcgLTEzMyAxNDcgLTE0NiAwIC02IDEyCi0yMSAyNiAtMzUgMjggLTI2IDE3MyAtMTg3IDIwNSAtMjI5IDExIC0xNCA0MCAtNTEgNjQgLTgyIDI1IC0zMiA0NSAtNjAgNDUKLTYzIDAgLTMgNSAtMTEgMTAgLTE4IDExIC0xMyA2OCAtOTggMTMyIC0xOTUgMjEgLTMxIDQ0IC03MCA1MyAtODcgOCAtMTYgMzUKLTY2IDYwIC0xMTAgMjUgLTQ0IDU0IC0xMDAgNjYgLTEyNSAxMSAtMjUgMzMgLTcyIDQ5IC0xMDUgMTYgLTMzIDM1IC03NiA0MwotOTUgNzcgLTE4MyA5NyAtMjM2IDk3IC0yNjIgMCAtMTAgNSAtMTggMTAgLTE4IDYgMCAxMCAtOCAxMCAtMTkgMCAtMTAgNyAtMzgKMTYgLTYyIDkgLTI0IDIwIC02MCAyNCAtNzkgNSAtMTkgMTggLTcxIDMwIC0xMTUgMzggLTEzNiA3OSAtMzYwIDgwIC00MjUgMAotMjAgNCAtNDAgOSAtNDUgMTIgLTEyIDIyIC0yMzAgMjIgLTQ3MCAwIC0yMzAgLTE0IC00NDcgLTM5IC01ODUgLTM3IC0yMDgKLTUyIC0yODIgLTYxIC0yOTkgLTUgLTkgLTEyIC0zNyAtMTYgLTY0IC00IC0yNiAtMTEgLTUwIC0xNiAtNTMgLTUgLTMgLTkgLTIwCi05IC0zOSAwIC0xOSAtNCAtMzYgLTkgLTM5IC01IC0zIC0xMiAtMTggLTE1IC0zMyAtNCAtMTYgLTExIC00NCAtMTUgLTYzIC01Ci0xOSAtMzYgLTEwMyAtNjggLTE4NyAtNTEgLTEzMCAtNjYgLTE1NyAtMTAyIC0xOTAgLTEyNCAtMTEzIC0xNDggLTEyMyAtMzI4Ci0xMjMgLTczIDAgLTE0MiA0IC0xNTUgOSAtMTMgNSAtNTkgMTcgLTEwMiAyNiAtNjkgMTUgLTExOSAzMiAtMTkxIDY2IC0xMSA1Ci00NSAxNSAtNzUgMjMgLTMwIDcgLTEwMiAzMCAtMTYwIDUxIC0xMTEgMzggLTIyOCA3MyAtMjk1IDg2IC04NiAxNiAtMTgwIDQyCi0xODkgNTAgLTYgNSAtMjIgOSAtMzcgOSAtMTUgMCAtMzEgNSAtMzQgMTAgLTMgNiAtMTMgMTAgLTIyIDEwIC0xNiAwIC0yODcKMTMzIC0zNTggMTc1IC0yMiAxNCAtNTEgMzAgLTY1IDM3IC0xNCA3IC0yNyAxNSAtMzAgMTggLTMgMyAtNDEgMzAgLTg1IDU5Ci0xMDIgNjkgLTE5MSAxNDIgLTI4NCAyMzQgLTg0IDgyIC0yMjMgMjM0IC0yNjUgMjg5IC0zOSA1MiAtMzU4IDM1MyAtNDA5IDM4NgotOTMgNjAgLTE3MyA4NSAtMjUxIDc5IC0yNzYgLTIzIC00MDMgLTgyIC02MTcgLTI4NCAtNTcgLTU0IC0xMjAgLTExMSAtMTQxCi0xMjYgLTIwIC0xNCAtNDIgLTMzIC01MCAtNDAgLTcgLTcgLTY5IC01NSAtMTM3IC0xMDcgLTY5IC01MSAtMTQxIC0xMDggLTE2MAotMTI1IC0zNCAtMzAgLTE1MyAtMTE4IC0xODkgLTE0MCAtNTIgLTMxIC0xMTQgLTczIC0xNzYgLTExOSAtMzkgLTI5IC05MyAtNjUKLTEyMCAtODIgLTI2IC0xNiAtODcgLTUzIC0xMzUgLTgxIC0xMTQgLTcwIC0zNTcgLTE4OSAtNDUxIC0yMjMgLTQ0IC0xNSAtNjQKLTIzIC0xMjAgLTQ4IC0yNSAtMTEgLTU2IC0yMyAtNzAgLTI3IC0xNCAtMyAtMzYgLTExIC01MCAtMTcgLTQ2IC0yMCAtNjUgLTI3Ci0xMDUgLTM5IC0yMiAtNiAtNDkgLTE1IC02MCAtMjAgLTExIC00IC0zOCAtMTMgLTYwIC0xOSAtMjIgLTYgLTQ5IC0xNSAtNjAKLTIwIC0xMSAtNSAtMzEgLTExIC00NSAtMTQgLTE0IC0yIC00MyAtMTAgLTY1IC0xNiAtMTUyIC00MyAtMzcwIC02MCAtNTM1Ci00MCAtNTggNiAtMTM0IDEyIC0xNzAgMTIgLTkyIDAgLTEwMSA2IC0xMzMgODQgLTE2IDM4IC0zMyA3NyAtMzggODYgLTE4IDM1Ci03OSAxOTYgLTc5IDIxMCAwIDggLTQgMTggLTggMjQgLTQgNSAtMTQgMjcgLTIxIDQ5IC03IDIyIC0xNiA0OSAtMjEgNjAgLTQKMTEgLTE0IDQ3IC0yMSA4MCAtNyAzMyAtMTUgNjUgLTE5IDcwIC00IDYgLTEwIDI2IC0xMyA0NSAtMyAxOSAtMTggODcgLTMyCjE1MCAtMjggMTIyIC0zOCAxODIgLTYwIDM4MCAtMjUgMjI3IC0xNSA4NDUgMTUgOTE1IDUgMTEgMTEgNDkgMTQgODUgNCA1OSAxOAoxMzMgNDQgMjQ1IDYgMjIgMTMgNTYgMTcgNzUgNCAxOSAxMCA0NCAxNSA1NSA0IDExIDEzIDQwIDE5IDY1IDcgMjUgMTYgNTQgMjAKNjUgNCAxMSAxOCA1NCAzMSA5NSAxMiA0MSAyOCA4OSAzNiAxMDUgNyAxNyAyMiA1NyAzNCA5MCAxMyAzMyAyNiA2NCAzMSA2OSA1CjYgOSAxOCA5IDI3IDAgMTUgMTYgNTMgNTIgMTIzIDYgMTEgMzggNzQgNzMgMTQwIDc0IDE0NSA5NiAxODUgMTQxIDI1MyAxOSAyOAozNCA1NiAzNCA2MSAwIDUgOSAxNyAyMCAyNyAxMSAxMCAyMCAyMiAyMCAyNiAwIDEyIDE3OCAyNTAgMjMwIDMwOSAxNCAxNiA0Mwo1MCA2NSA3NyA2MSA3MyAyOTUgMzEyIDMzNyAzNDMgMjAgMTUgNjYgNTIgMTAxIDgzIDM1IDMxIDgxIDY5IDEwMyA4NSAyMSAxNgo0NSAzNiA1MyA0NSA3IDkgMTcgMTcgMjIgMTcgNSAwIDQ4IDI5IDk2IDY0IDQ3IDM2IDk4IDcwIDExMiA3NyAxNCA3IDM4IDIxCjUzIDMxIDY3IDQ1IDMzNCAxODggMzUxIDE4OCA1IDAgMjEgOCAzNSAxOCAxNSAxMCA2OCAzNSAxMTcgNTYgNTAgMjAgOTkgNDEKMTEwIDQ1IDY5IDI5IDEzMCA1MSAxNDEgNTEgOCAwIDIyIDQgMzIgOSA5IDYgNTMgMjEgOTcgMzUgNDQgMTQgMTAzIDMzIDEzMAo0MSAyOCA5IDcyIDE5IDk4IDIyIDI2IDMgNTAgMTAgNTMgMTQgMyA1IDI1IDkgNDkgOSAyNCAwIDQ2IDQgNDkgOCAzIDUgNTQgMTUKMTEzIDIxIDU5IDcgMTE1IDE2IDEyMyAxOSA2NCAyNyA2MDEgNDAgODcyIDIyeiBtLTE1NyAtNDAxMCBjMyAtNSAxNyAtMTAgMzEKLTEwIDM2IDAgMTAyIC01MCAyMTggLTE2NCBsMTAxIC0xMDAgLTQ1IC04IGMtNDQgLTggLTE2NSAtNDMgLTIwNSAtNTggLTExIC01Ci00NyAtMTggLTgwIC0zMCAtMzMgLTEyIC04NyAtMzUgLTEyMCAtNTAgLTMzIC0xNiAtMTAzIC00OCAtMTU1IC03MyAtNTIgLTI0Ci0xMTMgLTUwIC0xMzUgLTU3IC0yMiAtNyAtNDkgLTE3IC02MCAtMjEgLTM1IC0xNSAtMTU4IC0zMiAtMjMwIC0zMiAtMTA5IDAKLTI1NSAzMiAtMjU1IDU1IDAgMTIgMTAwIDEwOCAxMTIgMTA4IDUgMCAzNiAyMyA3MCA1MSAzNSAyOCA3MCA1MyA3OCA1NyA4IDMKNjUgNTMgMTI1IDExMSAxMDIgOTkgMjMzIDE5MSAyNzAgMTkxIDggMCAxNyA1IDIwIDEwIDMgNiAyNSAxMCA0OCAxMCAyMyAwIDQ5CjUgNTcgMTAgMjAgMTMgMTQ3IDEzIDE1NSAweiBtNDk4IC00NDQgYzE5IC0yOSAxNCAtMzYgLTI4IC0zNiAtNDMgMCAtMTQ4IC0yMQotMTU5IC0zMSAtNiAtNSAtMTkgLTkgLTMwIC05IC0yMyAwIC05MiAtMjIgLTEwMiAtMzMgLTQgLTQgLTE2IC03IC0yNyAtNyAtMTAKMCAtNjAgLTE2IC0xMTEgLTM2IC05MiAtMzYgLTExOCAtNDggLTIzOCAtMTAzIC0zNyAtMTcgLTcxIC0zMSAtNzcgLTMxIC01IDAKLTIyIC02IC0zOCAtMTQgLTQxIC0yMSAtMTI1IC01OCAtMTQ4IC02NiAtMjcgLTEwIC03NiAtMzAgLTk3IC00MSAtMjUgLTEyCi0yNTUgLTExIC0yNjMgMSAtMyA2IC0xOCAxMCAtMzMgMTAgLTI4IDAgLTk2IDIxIC0xMDggMzMgLTQgNCAtMTcgNyAtMjggNwotMjkgMCAtMTY2IDcyIC0xNjYgODcgMCAxOCA0MSA0MyA3MiA0MyAxNiAwIDQ3IC04IDcxIC0xOSA2NSAtMjkgMTk0IC02MCAyNzcKLTY2IDEyNCAtOSAzMDEgMjIgNDM1IDc1IDExIDQgODEgMzcgMTU1IDczIDc0IDM1IDE3MyA3OSAyMjAgOTcgNDcgMTcgOTQgMzYKMTA1IDQwIDExIDUgNTIgMTQgOTAgMjEgMzkgNyA3NCAxNiA4MCAyMSA1IDQgMzcgOCA3MSA4IDU0IDAgNjQgLTMgNzcgLTI0egptMjExIC0yMjcgYzYxIC02NyA2MCAtNzkgLTYgLTgwIC05MyAtMSAtMzkzIC03MiAtNDIyIC0xMDAgLTYgLTUgLTIwIC05IC0zMwotOSAtMTMgMCAtMzMgLTUgLTQ2IC0xMiAtNDcgLTI0IC01NyAtMjggLTcyIC0yOCAtOCAwIC0yMyAtNCAtMzMgLTEwIC0zNSAtMTkKLTg4IC0zOSAtMTMyIC01MCAtMjUgLTYgLTU0IC0xNSAtNjUgLTIwIC0yMCAtOSAtNTYgLTE2IC0xMjggLTI3IC0yMCAtMyAtNDAKLTkgLTQzIC0xNCAtMyAtNSAtMzggLTkgLTc5IC05IC00MSAwIC03NiAtNCAtNzkgLTggLTMgLTUgLTYxIC0xMSAtMTI4IC0xNAotMTcyIC04IC0zODggMTMgLTQ2MiA0NSAtMjEgOSAtNDcgMTcgLTU4IDE3IC0xMSAwIC0zMiA5IC00OCAyMCAtNDEgMjkgLTE1Nwo4MSAtMTk2IDg3IC0zOSA2IC00MyAyMiAtMTQgNDggMTkgMTggMjIgMTcgNjggLTcgMTEyIC02MSAzMDkgLTEzMyAzOTMgLTE0NAoyNyAtNCA1MiAtMTEgNTUgLTE1IDggLTEzIDIzMSAtMTEgMjczIDIgODUgMjcgMTY5IDU5IDI0NiA5NSA4MCAzNyAxNDQgNjQKMTUyIDY0IDUgMCAyNiA5IDQ4IDE5IDY5IDMzIDEyNyA1OCAyMDUgODYgNDEgMTUgODQgMzEgOTUgMzYgMzMgMTMgMTU2IDQ3CjIxNSA1OCA4MyAxNiA5OSAxOCAxNzcgMjAgbDcxIDEgNDYgLTUxeiBtMjYwIC0yNDcgYzExIC0xMCAzNSAtMjYgNTEgLTM2IDE3Ci0xMCA1MyAtMzYgODEgLTU3IDI4IC0yMiA1NCAtMzkgNTkgLTM5IDQgMCAyNiAtMTUgNDkgLTMzIDY2IC01MyAyMTcgLTEzNwoyNDggLTEzNyA5IDAgMjkgLTYgNDUgLTE0IDQzIC0yMiAxMzQgLTU2IDE1MCAtNTYgMjIgMCAxMSAtMzAgLTE3IC00NCAtNzQKLTM4IC0xMTcgLTU2IC0xMzAgLTU2IC05IDAgLTIwIC00IC0yNSAtOCAtNiAtNSAtNDYgLTIxIC05MCAtMzYgLTQ0IC0xNSAtODkKLTMyIC0xMDAgLTM2IC0xMSAtNSAtMzggLTE0IC02MCAtMjEgLTc2IC0yMyAtMTYwIC01MSAtMTgwIC01OSAtMTEgLTUgLTMzCi0xMSAtNTAgLTEzIC0xNiAtMiAtNzMgLTE1IC0xMjUgLTI5IC01MiAtMTQgLTEyMiAtMjkgLTE1NSAtMzMgLTMzIC00IC02NAotMTEgLTcwIC0xNSAtNSAtNCAtNzcgLTEzIC0xNjAgLTIwIC0xNTEgLTEyIC0zNTggLTggLTUwMCAxMSAtODMgMTEgLTMxNiAzNwotMzk2IDQ1IC0xMTUgMTEgLTE0NiAxNCAtMjI5IDI1IC00NyA2IC0xNjEgMTMgLTI1NSAxNSAtOTMgMyAtMTc0IDkgLTE3OSAxNAotMTMgMTMgLTc3OSAxMyAtNzkyIDEgLTUgLTYgLTY1IC0xMiAtMTM0IC0xNCAtNjkgLTMgLTE1MiAtMTAgLTE4NSAtMTUgLTMzCi02IC05NCAtMTUgLTEzNSAtMjEgLTQxIC02IC0xMDQgLTE3IC0xNDAgLTI1IC0xNTAgLTMyIC0yMTYgLTQ5IC0yMzIgLTU3IC0xMAotNSAtMjYgLTkgLTM3IC05IC0xMCAwIC00MCAtOCAtNjcgLTE5IC0yNyAtMTAgLTgwIC0yOCAtMTE5IC00MSAtMTAxIC0zMQotMjQ5IC05MiAtMzUxIC0xNDUgLTg4IC00NSAtMTI0IC01NSAtMTI0IC0zNCAwIDYgLTEyIDI2IC0yNiA0NCAtMTQgMTkgLTM0CjUxIC00NSA3MiBsLTIwIDM4IDM0IDMwIGM1NyA1MCA5MSA3NSAxMDMgNzUgNyAwIDQzIDEzIDgwIDI5IDEyMCA1MSAyMTYgNzkKMzA0IDkxIDQ3IDYgMTAzIDE2IDEyNSAyMiA3MSAyMCAyMjkgNjkgMjgwIDg5IDI4IDEwIDg2IDMwIDEzMCA0NCA0NCAxNCA4OAozMCA5NyAzNSAxMCA2IDI1IDEwIDMzIDEwIDggMCAyMyA0IDMzIDkgMTYgOCA1MCAyMyA5NyA0MiAyMTQgODYgMzU3IDE1OCA1MDYKMjU1IDcwIDQ1IDEyMyA2MCAxNjMgNDYgMTggLTcgNDEgLTEyIDUzIC0xMiAzNCAwIDE0NCAtNDAgMjMzIC04NCA0NyAtMjMgMTA4Ci00OCAxMzUgLTU2IDI4IC03IDU1IC0xNiA2MCAtMjAgMjAgLTE1IDE1MyAtMjMgMzY1IC0yMiAyMjcgMCAzMzIgNiAzOTAgMjEKMTkgNSA2MCAxNSA5MCAyMSA2MyAxNCA4MSAxOSAyMDUgNTkgOTEgMzAgMjE0IDc0IDI1MCA5MSAyNCAxMSAxMDkgMzYgMTkwIDU3CjIxNyA1NCA0NDMgNjYgNDg5IDI1eiBtMTEwNiAtNDkyIGM5NSAtMjMgMTEyIC0zMSA5OSAtNDYgLTEwIC0xMiAtMTY1IC05MQotMjI0IC0xMTQgLTEwMyAtNDEgLTIyMiAtODEgLTQzMiAtMTQ0IC0yOCAtOSAtNjUgLTE2IC04MiAtMTYgLTE2IDAgLTMyIC00Ci0zNSAtOSAtMyAtNCAtMjUgLTExIC00OCAtMTUgLTI0IC00IC02NSAtMTIgLTkzIC0xNyAtMzAwIC01NiAtNTMzIC03OCAtODg5Ci04NSAtMTQ0IC0zIC0yMjMgLTEgLTIzMCA2IC01IDUgLTQ4IDEwIC05NSAxMSAtNDggMCAtMTU4IDcgLTI0NiAxNSAtODggOAotMjM2IDIwIC0zMzAgMjUgLTkzIDUgLTE4NCAxNCAtMjAyIDIwIC0zMiAxMCAtNzAwIDE0IC04MjMgNSAtMzYgLTMgLTEyOCAtMTAKLTIwNSAtMTYgLTc3IC02IC0xNDkgLTE1IC0xNjAgLTE5IC0xMSAtNSAtNzIgLTE2IC0xMzUgLTI1IC0yMTAgLTMxIC0yODkgLTQ2Ci0yOTYgLTU3IC0zIC01IC0yMCAtOSAtMzkgLTkgLTE5IDAgLTM2IC00IC0zOSAtOSAtMyAtNSAtMjAgLTExIC0zOCAtMTQgLTMwCi00IC0xMzMgLTM3IC0xODMgLTU3IC0xMSAtNSAtMzcgLTE0IC01NyAtMjAgLTIxIC02IC00MCAtMTYgLTQzIC0yMSAtNCAtNQotMTUgLTkgLTI2IC05IC0xMCAwIC0yOCAtNCAtMzkgLTEwIC0xMSAtNSAtMjkgLTE0IC00MCAtMjAgLTExIC01IC0yNSAtMTAKLTMxIC0xMCAtMTAgMCAtMTUwIC02NSAtMjQwIC0xMTEgLTIwIC0xMSAtNDEgLTE5IC00NyAtMTkgLTEzIDAgLTkyIDk4IC05MgoxMTQgMCAyMyAzOTkgMjA2IDQ0NyAyMDYgMTEgMCAyMyA0IDI4IDkgNiA0IDMzIDE0IDYwIDIwIDI4IDcgNTkgMTYgNzAgMjEgNTMKMjAgMzQ2IDgwIDM5NSA4MCAyMCAwIDQwIDQgNDUgOSAxMSAxMCAyMjIgMzEgMzA4IDMxIDMxIDAgNTkgNSA2MiAxMCA0IDYgMTQ3CjEwIDM5NSAxMCAyNDggMCAzOTEgLTQgMzk1IC0xMCAzIC01IDM0IC0xMCA2OCAtMTAgMTAyIDAgNDExIC0yMSA0MzIgLTMwIDExCi00IDkyIC0xMyAxODAgLTIwIDg4IC02IDE2OSAtMTUgMTgwIC0yMCAzOCAtMTYgMzQxIC0zNSA1MzAgLTMzIDE5NCAyIDMyNyAxNgo0OTAgNTIgMTM4IDMwIDI0OCA1NyAyNjUgNjQgOCAzIDQ5IDE1IDkwIDI3IDc5IDIzIDEyMiAzNyAxNTUgNTAgNTAgMTkgMTA1CjQwIDE2MCA2MCAzMyAxMiA3MCAyNiA4MyAzMSAxMiA1IDMyIDEzIDQ1IDE3IDEyIDUgNDIgMTggNjcgMjkgMTQyIDY1IDIwMyA5MAoyMzUgOTUgMjMgNCA5MCAtNSAxNTUgLTIyeiBtNDA1IC0xMzAgYzExIC0xMyAxNCAtMjAgNiAtMjAgLTcgMCAtMzMgLTE1IC01OQotMzIgLTI2IC0xOCAtNTcgLTM5IC02OSAtNDUgLTUxIC0yOSAtNzAgLTQwIC0xMDggLTY0IC01OCAtMzYgLTM2MCAtMTg0IC00MjUKLTIwNyAtMzAgLTExIC0xMDQgLTM5IC0xNjUgLTYxIC02MCAtMjIgLTEyMCAtNDEgLTEzMiAtNDEgLTEyIDAgLTI1IC00IC0yOAotMTAgLTMgLTUgLTIxIC0xMCAtMzkgLTEwIC0xNyAwIC0zNiAtNCAtNDEgLTggLTYgLTUgLTM3IC0xNCAtNzAgLTIxIC0zMyAtNwotNjkgLTE3IC04MCAtMjIgLTExIC00IC02OSAtMTUgLTEzMCAtMjQgLTYwIC05IC0xNDEgLTIxIC0xODAgLTI3IC05MyAtMTQKLTYzMCAtMTQgLTcyMCAxIC0zOCA2IC0xMjggMTggLTIwMCAyNyAtNzEgOSAtMTM5IDIwIC0xNTAgMjQgLTExIDUgLTU4IDEyCi0xMDUgMTUgLTQ3IDQgLTEyMSAxMiAtMTY1IDE3IC00NCA2IC0xNzIgMTIgLTI4NSAxNCAtMTEzIDMgLTIwOSA5IC0yMTQgMTQKLTEzIDEzIC00MDMgMTMgLTQxMSAwIC00IC02IC03NiAtMTAgLTE4NCAtMTAgLTk3IDAgLTE4MSAtNCAtMTg2IC05IC02IC01Ci0zOSAtMTIgLTc1IC0xNSAtMTczIC0xNCAtMzUyIC00NiAtNTI1IC05MiAtNTUgLTE0IC0xMTAgLTI5IC0xMjMgLTMxIC0xMiAtMwotMjUgLTkgLTI4IC0xNCAtMyAtNSAtMTggLTkgLTM1IC05IC0xNiAwIC0zNyAtNCAtNDcgLTkgLTkgLTYgLTY1IC0yOCAtMTI0Ci01MSAtMTA5IC00MSAtMjU1IC0xMTIgLTMwOCAtMTUwIC0xNSAtMTEgLTMyIC0yMCAtMzcgLTIwIC0xNyAwIC0xMDUgODkgLTk5Cjk5IDcgMTEgMTE1IDcxIDEyNyA3MSA1IDAgMzYgMTMgNzEgMjkgODggNDEgMjgwIDExNSAzNjMgMTQxIDM5IDEyIDc5IDI1IDkwCjMwIDExIDUgMzYgMTEgNTUgMTMgMTkgMyA2MSAxMiA5MyAyMSAzMiA5IDcwIDE2IDg1IDE2IDE2IDAgMzIgNCAzNyA5IDYgNCA1MwoxNCAxMDUgMjAgNTIgNyAxMTMgMTYgMTM1IDIxIDgzIDE5IDQ4OCA0MiA3MDUgNDAgMzkyIC0zIDU1MSAtMTIgMTAwMCAtNTQgODUKLTggMjAyIC0xNSAyNjEgLTE1IDU5IC0xIDExMCAtNiAxMTUgLTExIDE4IC0xOCA1NTUgMyA3NjkgMjkgMjUxIDMyIDU1NCA4Nwo1NzEgMTA0IDQgNCAxOCA3IDMwIDcgNDggMCAzOTIgMTE2IDUyOSAxNzkgMTA1IDQ4IDIyOSAxMTAgMjcwIDEzNSA1MCAzMSAxMDUKMzMgMTMwIDZ6IG0zMTMgLTk2IGMxMTEgLTU2IDIzNSAtMTcxIDIzNSAtMjE5IDAgLTIxIC03NyAtMTQ1IC05NSAtMTUzIC01IC0yCi04IC04IC04IC0xMyAwIC02IC0yNSAtNDEgLTU1IC03OSAtMzAgLTM4IC01NSAtNzIgLTU1IC03NiAwIC0zIC0zNSAtNDUgLTc3Ci05MyAtNDMgLTQ3IC03OCAtODggLTc5IC04OSAtMiAtMiAtMzEgLTYgLTY2IC05IC0zNSAtMyAtNjcgLTkgLTczIC0xMyAtNSAtNQotNTUgLTEzIC0xMTAgLTIwIC01NSAtNyAtMTA5IC0xNiAtMTIwIC0yMCAtMTEgLTUgLTkyIC0xNiAtMTgwIC0yNSAtODggLTkKLTE5NCAtMjEgLTIzNSAtMjUgLTE1NiAtMTggLTYxMSAtMzIgLTgzMCAtMjYgLTI2NCA4IC01MTMgMjQgLTU1NSAzNiAtMTYgNQotMTAyIDE0IC0xOTAgMjAgLTg4IDYgLTE2OCAxNiAtMTc3IDIxIC0xMCA1IC0xMzMgMTEgLTI3NSAxNSAtMjQ2IDUgLTM1MSAwCi01MzMgLTI2IC03MyAtMTAgLTI4NSAtNjYgLTMwNSAtODAgLTUgLTQgLTIzIC0xMCAtNDAgLTE0IC0xNiAtNCAtNDYgLTE0IC02NQotMjMgLTMzIC0xNCAtNTAgLTIxIC0xMDIgLTQyIC0xMyAtNSAtNTAgLTIwIC04MyAtMzQgLTc4IC0zMyAtMjU5IC0xMDAgLTMxMAotMTE2IC0yMiAtNyAtNDkgLTE2IC02MCAtMjEgLTExIC00IC00MCAtMTMgLTY1IC0yMCAtMjUgLTcgLTYzIC0xOCAtODUgLTI2Ci0zOCAtMTIgLTY2IC0yMCAtMjMwIC01OSAtMzggLTEwIC03OSAtMjEgLTkwIC0yNiAtMTEgLTQgLTM4IC0xMCAtNjAgLTEzIC0yMgotMiAtNzYgLTEyIC0xMjEgLTIyIGwtODEgLTE3IC0zNSAyNCBjLTE1NCAxMDYgLTQyOCAzNDMgLTQyOCAzNzAgMCAxMCAyNSAyNAoxODMgMTAyIDY0IDMxIDEyNiA1NyAxMzcgNTcgMTAgMCAyMSA0IDI0IDkgMyA0IDI3IDE0IDUzIDIxIDI3IDcgNzMgMjAgMTAzCjMwIDEyMSAzOCAxNjMgNTAgMTg0IDUwIDEyIDAgMjYgNCAzMSA5IDYgNCA1MCAxNCA5OCAyMSA0OCA3IDkwIDE3IDkzIDIyIDMgNAozOCA4IDc5IDggNDEgMCA3NiA0IDc5IDkgMyA0IDgzIDEzIDE3OCAyMCA5NSA2IDE5OCAxNCAyMjggMTcgNzAgOCA1MDQgOCA1OTAKMCAzNiAtMyAxNTMgLTExIDI2MCAtMTcgMTA3IC02IDIwMCAtMTUgMjA1IC0xOSA2IC01IDUxIC0xMSAxMDAgLTEzIDg2IC01CjM0OCAtNDAgMzkwIC01MiAzMiAtOSAzMDEgLTI3IDQxNSAtMjggMTI5IDAgNDEyIDE5IDQ2MCAzMiAxOSA1IDgwIDE3IDEzNSAyNgo1NSA4IDEyMyAyMCAxNTAgMjQgNjggMTIgMTg1IDQwIDIxMCA1MSAxMSA0IDcyIDI0IDEzNSA0NSA2MyAyMCAxNDkgNTAgMTkwCjY3IDQxIDE3IDkzIDM4IDExNSA0NyA3MCAyOCAyODcgMTM3IDM4NCAxOTIgMTA3IDYyIDEwNiA2MSAyMzggMTUxIDU0IDM3IDEwMwo2OCAxMDkgNjggNiAwIDQzIC0xNiA4MiAtMzZ6IG0tMjY4NCAtOTM0IGM1IC01IDMwIC0xMCA1NSAtMTAgNzQgMCAyOTQgLTIxCjMxNiAtMzEgMjEgLTkgMTg3IC0yMiA0NjAgLTM2IDIwMCAtMTAgMjkzIC0xMCA0NzAgMCA3NyA0IDIzNSAxMiAzNTAgMTggMTE2CjYgMjE5IDE0IDIzMCAxOSAxMSA0IDgzIDEzIDE2MCAyMCA3NyA3IDE0OCAxNiAxNTcgMjEgMjEgMTEgMTM4IDEyIDEzOCAxIDAKLTQgLTE3IC0xNCAtMzcgLTIxIC0yMSAtNyAtNDcgLTE2IC01OCAtMjEgLTExIC00IC02MyAtMjAgLTExNSAtMzQgLTUyIC0xNQotMTA4IC0zMSAtMTI1IC0zNiAtMTYgLTUgLTYxIC0xNCAtMTAwIC0yMSAtMzggLTYgLTc5IC0xNSAtOTAgLTE5IC0xMSAtNSAtNDkKLTExIC04NSAtMTUgLTM2IC0zIC05MCAtMTEgLTEyMCAtMTcgLTMwIC01IC0xMjkgLTE0IC0yMjAgLTE5IC05MSAtNCAtMjEyCi0xMSAtMjcwIC0xNSAtMTEzIC03IC01OTkgMTMgLTYxNSAyNiAtOSA3IC01NyAxMiAtMjUwIDI3IC00NCAzIC04NiAxMSAtOTQKMTcgLTE5IDE1IC03MjQgMTQgLTc0MyAtMSAtNyAtNiAtNTMgLTEzIC0xMDMgLTE3IC00OSAtMyAtMTE3IC0xMSAtMTUwIC0xNwotMzMgLTUgLTg3IC0xNCAtMTIwIC0xOCAtNzYgLTEyIC0xOTMgLTM2IC0yMjUgLTQ5IC0xNCAtNSAtNDYgLTEyIC03MiAtMTYKLTI2IC00IC01MCAtMTEgLTUzIC0xNyAtNCAtNSAtMTkgLTkgLTM0IC05IC0yNiAwIC03MCAtMTEgLTExNiAtMzAgLTExIC00Ci00MCAtMTMgLTY1IC0yMCAtNTIgLTE0IC05NiAtMjggLTEyNSAtNDAgLTExIC01IC01NiAtMjEgLTEwMCAtMzYgLTQ0IC0xNQotODQgLTMxIC05MCAtMzYgLTUgLTQgLTE1IC04IC0yMiAtOCAtOCAwIC0zMyAtOSAtNTUgLTIwIC0yMyAtMTEgLTQ1IC0yMCAtNTAKLTIwIC05IDAgLTc2IC0yOSAtMTQ2IC02MyBsLTQzIC0yMSAtNDMgMjMgYy02NSAzNiAtNzkgNDkgLTczIDY2IDQgOCAxOCAxNQozMiAxNSAxNCAwIDMzIDQgNDMgOSA5IDUgNDkgMTYgODcgMjUgMzkgOCAxMjkgMzIgMjAwIDUyIDcyIDE5IDE0NCAzOCAxNjAgNDEKMTcgMyAzNSA5IDQwIDEzIDYgNCAyOCAxMyA1MCAxOSAyMiA3IDQ5IDE2IDYwIDIxIDExIDUgNDMgMTYgNzEgMjMgNTYgMTYgMTMwCjQ2IDI3NCAxMTAgNjQgMjggMTQyIDU4IDIzNCA4OCAxMzcgNDQgMTQ2IDQ3IDIxMSA1OCAzMyA2IDc0IDEzIDkwIDE3IDEwNyAyMwo2OTcgMjYgNzE5IDR6IG0yMDA0IC0yODIgYy01IC0xNCAtMjk3IC0yMTggLTMxMyAtMjE4IC0yIDAgLTQxIC0yMyAtODcgLTUxCi00NiAtMjggLTEyNCAtNzEgLTE3NCAtOTYgbC05MSAtNDQgLTEwNCA0IGMtNTcgMyAtMTIwIDggLTEzOSAxMCAtMTkgMyAtMTQxCjExIC0yNzAgMTggLTEyOSA2IC0yMzkgMTUgLTI0NSAxOSAtNSA0IC02MiAxMCAtMTI1IDE0IC0xODAgMTAgLTQ4NyA1NyAtNjE1Cjk0IC0zOCAxMiAtODEgMjQgLTk1IDI4IC0xNCA0IC0yOSAxMCAtMzUgMTQgLTUgNCAtMzUgMTMgLTY1IDIwIC0zMCA3IC02MyAxNgotNzIgMjEgLTM2IDE4IC0yNzEgMjggLTQzMiAxOCAtODggLTUgLTE2NCAtMTMgLTE3MCAtMTcgLTYgLTMgLTMzIC0xMCAtNjEKLTEzIC0yNyAtNCAtNjggLTEzIC05MCAtMTkgLTIyIC03IC01NiAtMTQgLTc1IC0xNyAtMTkgLTIgLTQ0IC04IC01NSAtMTMgLTExCi01IC02MCAtMjIgLTExMCAtMzggLTQ5IC0xNyAtMTEyIC00MCAtMTQwIC01MiAtMjcgLTEyIC02NiAtMjggLTg1IC0zNyAtMTkKLTggLTczIC0zNCAtMTIwIC01NyBsLTg1IC00MiAtNTMgMjUgYy0yOCAxNCAtNTIgMjkgLTUyIDMzIDAgNSAxMiAxMyAyOCAyMAoxNSA2IDU0IDIzIDg3IDM5IDMzIDE1IDcxIDMwIDg1IDM0IDI2IDcgMTIwIDQxIDE1NSA1NiAxMSA0IDUyIDE4IDkwIDI5IDM5CjEyIDc5IDI1IDkwIDMwIDExIDUgNDAgMTQgNjUgMjAgMjUgNiA1NCAxNSA2NSAxOSAxMSA1IDYzIDE5IDExNSAzMSA1MiAxMgoxMTMgMjYgMTM1IDMyIDIyIDUgNjcgMTMgMTAwIDE4IDMzIDUgMTAzIDE2IDE1NSAyNCA1MiA4IDExOCAxNSAxNDYgMTYgMjcgMAo1NCA0IDYwIDkgMTQgMTUgNDUyIDIzIDU5NCAxMiAxNTggLTEzIDQ1OSAtNDcgNDg1IC01NSAxMSAtMyAxMzIgLTEwIDI3MCAtMTUKMjY3IC0xMCA3NTIgMiA3NjkgMTkgNiA2IDI4IDEwIDUwIDEwIDQ5IDAgMjE2IDE5IDIzNiAyOCAxOSA3IDEyOCAyOSAxNTggMzEKMTQgMCAyMiAtNCAyMCAtMTF6IG0tMjU4NyAtMjk3IGM4NSAtOSAxNjggLTMwIDIyNCAtNTYgNDMgLTIwIDE3OSAtNTUgMjE1Ci01NSAxNyAwIDM4IC00IDQ4IC0xMCAyMSAtMTIgMTc4IC0zNyAzMjIgLTUyIDU4IC01IDExNCAtMTQgMTI1IC0xOSAxNyAtNwoxNzAgLTIxIDUxMCAtNDcgNjggLTUgOTAgLTEwIDkwIC0yMSAwIC0xNCAtMTAgLTE4IC05MiAtNDIgLTE4IC01IC00OCAtMTMKLTY1IC0xOCAtMTY4IC00OCAtMzExIC04MyAtNDE4IC0xMDAgLTU4IC0xMCAtMTEyIC0yMCAtMTIwIC0yNCAtOCAtMyAtNTUgLTkKLTEwNSAtMTEgLTQ5IC0zIC0xMzcgLTEwIC0xOTUgLTE2IC0xNzIgLTE5IC01NzkgLTEyIC02MjUgMTAgLTExIDUgLTU4IDExCi0xMDUgMTQgLTk0IDQgLTI4NCAzMiAtMzE1IDQ2IC0xMSA1IC01NCAxNiAtOTUgMjQgLTc4IDE1IC0yMzggNTcgLTI1NSA2NyAtNQozIC0zMiAxMiAtNjAgMTkgLTI3IDcgLTU0IDE2IC02MCAyMCAtNSA0IC0yMiAxMCAtMzcgMTQgLTQ2IDExIC0zMiAzMSA0MCA2MQozNyAxNiA5NCA0MCAxMjcgNTUgODIgMzYgMTg5IDcwIDIxOSA3MCAxNCAwIDI3IDQgMzAgOCAzIDUgMzggMTQgNzggMjEgNDAgNwo4MiAxNyA5MyAyMiA0OSAyMSAyOTkgMzMgNDI2IDIweiIvPgo8cGF0aCBkPSJNMTAwMzcgODAzNSBsLTIyIC0xMSAtNSAtMzA1OSBjLTUgLTI5OTkgLTUgLTMwNjEgLTI0IC0zMTE1IC0yMiAtNjIKLTUxIC0xMDUgLTExNCAtMTY4IC00NCAtNDUgLTEyMyAtOTIgLTE1MyAtOTIgLTEwIDAgLTIwIC00IC0yMyAtOSAtMTUgLTIzCi0xOTkgLTMzIC0zMjkgLTE4IC03NCA5IC05MCA4IC05OCAtNCAtNSAtOCAtOCAtMzAwIC02IC02ODkgbDIgLTY3NSA3MjAgMQpjNTExIDAgNzUwIDQgODI1IDEzIDU4IDYgMTM5IDE2IDE4MCAyMSAxMDQgMTEgMzExIDYwIDM3MCA4NyAxNjAgNzEgMjE5IDEwNwozMTkgMTkyIDM1IDMxIDgxIDc4IDEwMyAxMDYgMjEgMjcgNDIgNTUgNDYgNjAgNTMgNjkgMTAxIDE2MSAxMzggMjYwIDE0IDM4CjI5IDc4IDM1IDg3IDUgMTAgOSAzMSA5IDQ3IDAgMTcgNCAzMiA5IDM1IDEzIDkgMjIgMTA0IDMzIDM0NiAxMyAzMDcgMjEgNjU3MQo4IDY1ODQgLTE0IDE0IC0xOTk0IDE2IC0yMDIzIDF6Ii8+CjxwYXRoIGQ9Ik0xMjYxMyA4MDMyIGMtMTEgLTExIC0xMyAtNjkxIC0xMSAtMzkyNSBsMyAtMzkxMiAxMDE4IC0zIDEwMTcgLTIgMAozOTIwIGMwIDM4NTIgMCAzOTE5IC0xOSAzOTMwIC0xMyA2IC0zNDcgOSAtMTAwNyA3IC04MDMgLTIgLTk5MCAtNCAtMTAwMSAtMTV6Ii8+CjxwYXRoIGQ9Ik0xNTgwNSA4MDQxIGMtMzMgLTcgLTM5IC0yMyAtNTAgLTE1NSAtNCAtNDQgLTExIC04NyAtMTYgLTk2IC00IC04Ci0xMyAtNjIgLTE5IC0xMjAgLTYgLTU4IC0xNSAtMTQxIC0yMCAtMTg1IC01IC00NCAtMTQgLTEwNyAtMjAgLTE0MCAtNSAtMzMKLTEzIC05OCAtMTYgLTE0NSAtMyAtNDcgLTkgLTk0IC0xNCAtMTA1IC01IC0xMSAtMTMgLTcyIC0xOSAtMTM1IC03IC02MyAtMTYKLTEzMSAtMjEgLTE1MCAtNCAtMTkgLTE2IC05OCAtMjUgLTE3NSAtOSAtNzcgLTIyIC0xODkgLTMwIC0yNTAgLTggLTYwIC0xOQotMTQ0IC0yNSAtMTg1IC01IC00MSAtMTkgLTE0NSAtMzAgLTIzMCAtMTEgLTg1IC0yNSAtMTg5IC0zMCAtMjMwIC02IC00MSAtMTUKLTEwOSAtMjEgLTE1MCAtNSAtNDEgLTE0IC0xMTEgLTE5IC0xNTUgLTEwIC0xMDMgLTI3IC0yMjQgLTM1IC0yNTUgLTMgLTE0Ci0xNSAtOTkgLTI2IC0xOTAgLTExIC05MSAtMjQgLTE5NiAtMzAgLTIzNSAtMTAgLTc1IC0yNCAtMTg0IC0zOSAtMzA1IC01IC00MQotMTQgLTEwOSAtMjAgLTE1MCAtNiAtNDEgLTE1IC0xMTMgLTIwIC0xNjAgLTEzIC0xMzAgLTI5IC0yNDEgLTM5IC0yODUgLTYKLTIyIC0xNSAtOTYgLTIyIC0xNjUgLTYgLTY5IC0xNSAtMTM0IC0xOSAtMTQ1IC01IC0xMSAtMTQgLTc4IC0yMCAtMTUwIC03Ci03MSAtMTYgLTEzOSAtMjAgLTE1MCAtNSAtMTEgLTExIC01MSAtMTUgLTkwIC0zIC0zOCAtMTAgLTEwMSAtMTYgLTE0MCAtNgotMzggLTE0IC0xMDggLTE5IC0xNTUgLTUgLTQ3IC0xMyAtMTEwIC0xOCAtMTQwIC02IC0zMCAtMjAgLTEzOCAtMzIgLTI0MCAtMTIKLTEwMiAtMjUgLTE5OCAtMzAgLTIxNSAtNSAtMTYgLTE0IC05MSAtMjEgLTE2NSAtNyAtNzQgLTE2IC0xMzkgLTIxIC0xNDUgLTQKLTUgLTggLTI0IC04IC00MyAwIC01MyAtMjEgLTIxNCAtMzEgLTIzNyAtNSAtMTEgLTEwIC01OCAtMTMgLTEwNSAtMiAtNDcgLTkKLTExNiAtMTYgLTE1NSAtNiAtMzggLTEzIC04NCAtMTQgLTEwMSAtMiAtMTcgLTUgLTM1IC04IC00MCAtMyAtNSAtMTEgLTcwCi0xOCAtMTQ0IC02IC03NCAtMTYgLTE0NCAtMjAgLTE1NSAtNSAtMTEgLTE0IC03NiAtMjAgLTE0NSAtNiAtNjkgLTE1IC0xMzQKLTIwIC0xNDUgLTQgLTExIC0xNCAtODEgLTIxIC0xNTUgLTYgLTc0IC0xNSAtMTM5IC0yMCAtMTQ1IC03IC05IC0xMyAtMTA2Ci0xMCAtMTY3IGwxIC0yOCAxMDQ5IDAgYzU4MiAwIDEwNTIgNCAxMDU1IDkgMyA0IDggNjYgMTIgMTM3IDMgNzEgOCAxMzYgMTIKMTQ0IDMgOCAxMyAxMjggMjMgMjY1IDEwIDEzOCAyMiAyOTUgMjcgMzUwIDYgNTUgMTYgMTg5IDIzIDI5OCAxMSAxODcgMTMgMTk4CjMzIDIwMiAxMiAzIDE3NiA0IDM2NiAzIGwzNDUgLTMgMTMgLTIxMCBjNyAtMTE1IDE3IC0yMjYgMjIgLTI0NSA1IC0xOSAxNgotMTQxIDI1IC0yNzAgMzAgLTQ0NCA0MCAtNTY5IDQ4IC01NzYgNCAtNCA3IC0yOSA3IC01NiBsMCAtNDggMTA0MSAwIDEwNDIgMAotNyA3NyBjLTggMTA1IC0xNSAxNTQgLTI2IDE3OCAtNSAxMSAtMTEgNTIgLTE0IDkwIC0yIDM5IC0xMSAxMTMgLTIwIDE2NSAtOQo1MiAtMTggMTA5IC0yMSAxMjUgLTIwIDEyNSAtMzggMjUwIC01NCAzNjUgLTEwIDc0IC0yMSAxNDIgLTI0IDE1MCAtNCA4IC05CjQwIC0xMiA3MCAtMyAzMCAtMTAgODQgLTE2IDEyMCAtNSAzNiAtMTQgOTkgLTE5IDE0MCAtMTEgOTYgLTM2IDI1OCAtNDQgMjkwCi00IDE0IC0xNCA3MiAtMjIgMTMwIC04IDU4IC0xOSAxMzIgLTI0IDE2NSAtNSAzMyAtMTEgODUgLTE1IDExNSAtMyAzMCAtMTAKNzEgLTE1IDkwIC01IDE5IC0xNCA4MiAtMjAgMTQwIC02IDU4IC0xNiAxMTMgLTIxIDEyMiAtNSAxMCAtOSA0MyAtOSA3NSAwIDMxCi00IDcwIC05IDg3IC01IDE3IC0xNCA2NyAtMjAgMTExIC0zNSAyNTkgLTQ0IDMyMiAtNDkgMzM1IC01IDE0IC0zMyAxOTkgLTUyCjM0NSAtNSAzOSAtMTQgOTkgLTIwIDEzNSAtNSAzNiAtMTQgOTQgLTE5IDEzMCAtMjcgMTg5IC00MyAyOTcgLTYyIDQxMCAtMjcKMTY2IC01OCAzNzcgLTY5IDQ3MCAtNSA0MSAtMTMgMTAwIC0xOSAxMzAgLTYgMzAgLTEzIDgyIC0xNiAxMTUgLTMgMzMgLTEwIDc2Ci0xNCA5NSAtNSAxOSAtMTUgNzYgLTIxIDEyNSAtNyA1MCAtMTQgOTkgLTE2IDExMCAtMiAxMSAtOSA2MSAtMTUgMTEwIC02IDUwCi0xNSA5OSAtMTkgMTEwIC0xMCAyMyAtMzkgMjM2IC00NiAzMzUgLTMgMzYgLTkgNzQgLTE0IDg1IC05IDIxIC0xNiA2NSAtMjYKMTgwIC0zIDM5IC04IDc3IC0xMSA4NSAtNCA4IC0xNCA3MSAtMjQgMTQwIC0xMCA2OSAtMjUgMTY4IC0zNCAyMjAgLTI3IDE2MQotNTYgMzYyIC02MSA0MzAgLTMgMzYgLTkgNzQgLTE0IDg1IC00IDExIC0xMyA2NyAtMjAgMTI1IC02IDU4IC0xNCAxMTQgLTE3CjEyNSAtMiAxMSAtMTMgNzkgLTIzIDE1MCAtMTEgNzIgLTI2IDE3NyAtMzUgMjM1IC05IDU4IC0yMCAxMzAgLTIzIDE2MCAtNiA0NAotMTIgNTcgLTMxIDY2IC0xOCA5IC0zNjggMTIgLTE0NTAgMTIgLTc4NCAwIC0xNDM5IC0zIC0xNDU2IC03eiBtMTU0OCAtMTk5MwpjMjAgLTE0MSAyNCAtMTc5IDM3IC0zNTMgNiAtNzcgMjAgLTI0MyAzMSAtMzcwIDEyIC0xMjYgMjUgLTI4OCAzMCAtMzYwIDQKLTcxIDEzIC0xNzAgMTggLTIyMCA2IC00OSAxNSAtMTM5IDIxIC0yMDAgNSAtNjAgMTQgLTE1NSAxOSAtMjEwIDYgLTU1IDEzCi0xNDkgMTYgLTIxMCA0IC02MCAxMSAtMTE5IDE2IC0xMzAgNCAtMTEgMTAgLTY1IDEyIC0xMjAgNSAtMTE1IDIxIC0yOTYgMzcKLTQwNSA2IC00MSAxNyAtMTQwIDI1IC0yMjAgNyAtODAgMTcgLTE1NyAyMCAtMTcyIDQgLTE1IDQgLTM5IDEgLTUzIGwtNiAtMjUKLTMzNiAwIC0zMzUgMCA1IDg4IGM1IDg3IDQxIDQ1NiA1MSA1MjIgMiAxOSA3IDcxIDkgMTE1IDIgNDQgOSAxMjcgMTYgMTg1IDYKNTggMTUgMTQzIDIwIDE5MCAxMiAxMTkgNDYgNDAyIDY2IDU0NSA5IDY2IDIwIDE2MSAyNSAyMTAgNCA1MCAxMiAxMjIgMTggMTYwCjYgMzkgMTYgMTIwIDIyIDE4MCAzMCAzMDEgODEgNjg4IDExMCA4NDAgNiAyOCAxMyA2NyAxNiA4OCAzIDIwIDggMzcgMTIgMzcgNAowIDE1IC01MSAyNCAtMTEyeiIvPgo8cGF0aCBkPSJNMjAwMDYgODAzNCBjLTE2IC0xNSAtMTcgLTMxNiAtMTQgLTM5MjggbDMgLTM5MTEgODUzIC0zIDg1MiAtMiAwCjI3IGMxIDE2IDAgNzcxIDAgMTY3OSAwIDkwOCAyIDE2NjkgNiAxNjkzIDkgNTMgMjMgNDggNDEgLTE1IDggLTI3IDE4IC01OCAyMwotNjkgNSAtMTEgMTYgLTQ1IDI0IC03NSA3IC0zMCAzMCAtMTA5IDUxIC0xNzUgMjAgLTY2IDQwIC0xMzYgNDQgLTE1NSA1IC0xOQoxNSAtNTUgMjMgLTgwIDggLTI1IDIwIC02MyAyNiAtODUgMzMgLTExOCA1NiAtMTk3IDc3IC0yNjAgMjMgLTcyIDU4IC0xOTAgNzYKLTI2MCA2IC0yMiAxNSAtNDggMjAgLTU3IDUgLTEwIDkgLTI3IDkgLTM3IDAgLTExIDQgLTMwIDkgLTQzIDYgLTEzIDIyIC02MwozNiAtMTEzIDE1IC00OSAzMCAtOTkgMzUgLTExMCA0IC0xMSAxNCAtNDIgMjEgLTcwIDYgLTI3IDE2IC01NCAyMCAtNjAgNSAtNQo5IC0xOCA5IC0yOCAwIC0xMSA5IC00OSAyMSAtODYgMTEgLTM2IDI0IC03OSAyOSAtOTYgMjggLTEwMSA2MiAtMjEyIDY5IC0yMjUKNSAtOSAxNCAtNDIgMjIgLTczIDcgLTMyIDE2IC02MCAyMSAtNjMgNCAtMyA4IC0yMCA4IC0zOCAwIC0xNyA0IC0zNiA4IC00MiA1Ci01IDEzIC0yNyAyMCAtNDkgNiAtMjIgMTggLTY3IDI3IC0xMDAgOSAtMzMgMjIgLTc4IDMwIC0xMDAgNyAtMjIgMjUgLTgwIDM5Ci0xMzAgMTUgLTQ5IDMxIC05OCAzNiAtMTA3IDYgLTEwIDEwIC0yNyAxMCAtMzggMCAtMTIgOSAtNTEgMjAgLTg4IDEyIC0zNyAzMAotOTggNDIgLTEzNyAxMSAtMzggMjkgLTk1IDM4IC0xMjUgMTAgLTMwIDI2IC04NCAzNSAtMTIwIDEwIC0zNiAyMyAtNzEgMjgKLTc3IDcgLTEwIDE5OSAtMTMgODk4IC0xMyBsODg5IDAgMCAzOTIwIDAgMzkyMCAtMjYgMTAgYy00MCAxNiAtMTY1NyAxMwotMTY3MiAtMiAtOSAtOSAtMTIgLTQwMSAtMTIgLTE3MDMgMCAtOTgzIC00IC0xNjk2IC05IC0xNzA0IC0xMSAtMTcgLTIzIDEwCi02MCAxMjkgLTEzIDQxIC0zMyAxMDIgLTQ2IDEzNSAtMTIgMzMgLTI3IDgwIC0zNSAxMDUgLTE4IDYxIC01MCAxNjEgLTYwIDE4NQotNSAxMSAtMjEgNjEgLTM1IDExMCAtMjcgOTEgLTgwIDI1MyAtOTUgMjkwIC01IDExIC0xOCA1MiAtMjkgOTAgLTQxIDEzOSAtNjQKMjEwIC03MSAyMzAgLTQgMTEgLTE5IDUyIC0zMyA5MCAtMTQgMzkgLTM5IDEwNiAtNTUgMTUxIC0xNyA0NCAtNTYgMTY5IC04NwoyNzcgLTMwIDEwOCAtNTkgMjA3IC02NCAyMTkgLTUgMTMgLTE1IDQzIC0yMiA2OCAtNyAyNSAtMTYgNDkgLTIxIDU1IC00IDUgLTgKMjEgLTggMzUgMCAxNCAtNCAzMCAtOCAzNSAtNSA2IC0xNSAzMCAtMjIgNTUgLTE4IDYxIC04MCAyNTAgLTg5IDI3NSAtMjAgNDkKLTUxIDE1NCAtNTEgMTcyIDAgMTAgLTQgMjMgLTggMjggLTUgNiAtMTkgNDQgLTMxIDg1IC0zMCA5NiAtNDEgMTMwIC01MSAxNTUKLTUgMTEgLTE1IDQzIC0yMyA3MCAtOSAyOCAtMjYgODQgLTM4IDEyNSAtMTMgNDEgLTI2IDgwIC0zMCA4NSAtMyA2IC0xMiAzMwotMTkgNjEgLTcgMjkgLTIxIDYyIC0zMSA3NSBsLTE4IDI0IC04MjkgMyBjLTc1OCAyIC04MzEgMSAtODQ2IC0xNHoiLz4KPHBhdGggZD0iTTMwODY2IDgwMzQgYy0xNSAtMTQgLTE2IC0zNzAgLTE2IC0zOTE0IDAgLTIxNDQgMyAtMzkwNSA2IC0zOTE0IDYKLTE0IDEwNSAtMTYgMTAyMCAtMTYgbDEwMTUgMCA4IDIyIGM0IDEyIDYgNzM2IDMgMTYwOCAtMyA4NzMgLTIgMTYwMyAyIDE2MjQKbDcgMzYgMjg3IC0yIDI4NyAtMyA1IC0xNjQwIDUgLTE2NDAgMTAxOCAtMyAxMDE3IC0yIDAgMzkyNCBjMCAzNTY5IC0xIDM5MjQKLTE2IDM5MzAgLTI5IDExIC0xOTg0IDcgLTIwMDUgLTQgLTE5IC0xMSAtMTkgLTM3IC0xOSAtMTQwMCBsMCAtMTM4OSAtMjIgLTEyCmMtMjkgLTE2IC01MzYgLTUgLTU1MiAxMSAtOCA4IC0xMiA0MDYgLTEzIDEzOTMgLTIgMTI2MyAtMyAxMzgzIC0xOCAxMzkzIC0xMwo5IC0yNjAgMTMgLTEwMTAgMTMgLTg5NCAxIC05OTUgMCAtMTAwOSAtMTV6Ii8+CjxwYXRoIGQ9Ik0zNjY3NCA4MDQzIGMtNiAtNCAtMTYgLTUxIC0yMiAtMTAzIC03IC01MiAtMjEgLTE2NSAtMzMgLTI1MCAtMTEKLTg1IC0yNCAtMTkxIC0yOSAtMjM1IC01IC00NCAtMTUgLTExMSAtMjEgLTE1MCAtNiAtMzggLTEzIC0xMDYgLTE1IC0xNTAgLTMKLTQ0IC05IC04OSAtMTQgLTEwMCAtOSAtMjEgLTE3IC04MiAtMjYgLTIwNSAtMyAtNDEgLTggLTgyIC0xMiAtOTAgLTMgLTggLTEzCi03OCAtMjMgLTE1NSAtMjkgLTI0MiAtNDAgLTMxOSAtNTAgLTM1MSAtNSAtMTcgLTkgLTYyIC05IC0xMDIgMCAtMzkgLTQgLTczCi05IC03NiAtOCAtNSAtMTQgLTU0IC0yNiAtMjA2IC0zIC0zNiAtMTAgLTgxIC0xNSAtMTAwIC01IC0xOSAtMTQgLTg3IC0yMAotMTUwIC02IC02MyAtMTUgLTEzMSAtMjAgLTE1MCAtNSAtMTkgLTEyIC02NiAtMTUgLTEwNSAtNSAtNjggLTI1IC0yMjMgLTQ3Ci0zNTUgLTUgLTM2IC0xNCAtMTAxIC0xOCAtMTQ1IC01IC00NCAtMTggLTE1MCAtMzAgLTIzNSAtMjQgLTE3OSAtMzUgLTI2OQotNDUgLTM2MCAtNCAtMzYgLTExIC03NCAtMTUgLTg1IC01IC0xMSAtMTEgLTU2IC0xMyAtMTAwIC00IC03NCAtMjMgLTIxNSAtNDcKLTM0NSAtNiAtMzAgLTEzIC04OSAtMTUgLTEzMCAtMyAtNDEgLTEwIC05MSAtMTUgLTExMCAtMTIgLTQ1IC0yMCAtMTA2IC0yNgotMTk1IC0zIC0zOCAtOSAtNzkgLTEzIC05MCAtNSAtMTEgLTE0IC03OCAtMjEgLTE1MCAtNiAtNzEgLTE1IC0xMzkgLTE5IC0xNTAKLTUgLTExIC0xOCAtMTA1IC0zMCAtMjEwIC0xMiAtMTA0IC0yNiAtMjE1IC0zMiAtMjQ1IC01IC0zMCAtMTIgLTkxIC0xNSAtMTM1Ci0zIC00NCAtOSAtODkgLTE0IC0xMDAgLTQgLTExIC0xNSAtODUgLTI0IC0xNjUgLTI1IC0yMjIgLTM1IC0yOTkgLTQ2IC0zNzUKLTYgLTM4IC0xNSAtMTA0IC0yMCAtMTQ1IC0xNyAtMTMzIC00MSAtMzA0IC01MCAtMzY1IC01IC0zMyAtMTIgLTk4IC0xNiAtMTQ1Ci00IC00NyAtMTAgLTg5IC0xNCAtOTUgLTQgLTUgLTEzIC03MSAtMTkgLTE0NSAtNyAtNzQgLTE3IC0xNDQgLTIxIC0xNTUgLTUKLTExIC0xMSAtNTEgLTE1IC05MCAtNiAtNzUgLTE4IC0xNjIgLTM1IC0yNjUgLTYgLTM1IC04IC03MCAtNSAtNzcgMyAtMTAgMjE2Ci0xMyAxMDU1IC0xMyBsMTA1MCAwIDEwIDI2IGM2IDE0IDEwIDYxIDEwIDEwNCAwIDQzIDQgODEgOSA4NCA0IDMgMTEgNzIgMTUKMTUzIDggMTc2IDMxIDQ5MCAzOSA1MTggMyAxMSAxMSAxMTcgMTcgMjM1IDYgMTE4IDE2IDIzMiAyMiAyNTMgbDExIDM3IDM1MyAwCmMyNTUgMCAzNTUgLTMgMzYwIC0xMSA0IC03IDEyIC05MiAxOCAtMTkwIDYgLTk3IDE0IC0xODEgMTkgLTE4NSA0IC00IDcgLTM5CjggLTc4IDAgLTM5IDcgLTE1MCAxNSAtMjQ2IDggLTk2IDIxIC0yNzIgMjkgLTM5MCA4IC0xMTggMTggLTIzNSAyMiAtMjYwIGw4Ci00NSAxMDQ4IC0zIGM3MDUgLTEgMTA0NyAxIDEwNDcgOCAwIDYgLTQgMTggLTkgMjggLTUgOSAtMTUgNjkgLTIxIDEzMiAtNiA2MwotMTUgMTI0IC0yMCAxMzUgLTUgMTEgLTE0IDY1IC0yMCAxMjAgLTYgNTUgLTE3IDEzMiAtMjUgMTcwIC03IDM5IC0xOSAxMjIKLTI1IDE4NSAtNiA2MyAtMTUgMTIyIC0xOSAxMzAgLTUgOCAtMTQgNjkgLTIxIDEzNSAtNyA2NiAtMTcgMTI0IC0yMSAxMjkgLTUKNiAtOSAyNSAtOSA0NCAwIDMzIC05IDEwMCAtMzAgMjE3IC01IDI4IC0xNiAxMDIgLTI1IDE2NSAtOSA2MyAtMjIgMTUzIC0zMAoyMDAgLTggNDcgLTE3IDExNyAtMjEgMTU1IC0zIDM5IC05IDc5IC0xNCA5MCAtNCAxMSAtMTMgNzAgLTE5IDEzMCAtNyA2MSAtMTYKMTE5IC0yMCAxMzAgLTUgMTEgLTE3IDgxIC0yNiAxNTUgLTMzIDI2NiAtMzUgMjc5IC03OSA1NTAgLTkgNTIgLTE2IDExMiAtMTYKMTMyIDAgMjAgLTQgNDAgLTEwIDQzIC01IDMgLTEwIDIwIC0xMCAzOCAwIDQ1IC0yMSAxOTkgLTMwIDIyMiAtNSAxMSAtMTEgNDkKLTE1IDg1IC0zIDM2IC0xMCA5MiAtMTYgMTI1IC01IDMzIC0xNCA5NiAtMTkgMTQwIC01IDQ0IC0xNiAxMjEgLTI1IDE3MCAtOAo1MCAtMjMgMTQ2IC0zMyAyMTUgLTEwIDY5IC0yMSAxMzIgLTI0IDE0MCAtNSAxMyAtMjMgMTQ0IC00NyAzNDUgLTUgMzkgLTE0Cjk5IC0yMCAxMzUgLTcgMzYgLTE2IDk3IC0yMiAxMzUgLTUgMzkgLTE2IDExMyAtMjQgMTY1IC04IDUyIC0yMiAxNTQgLTMyIDIyNwotMTAgNzIgLTIxIDEzNSAtMjUgMTM5IC01IDQgLTggMjMgLTggNDMgLTEgMjAgLTggNzcgLTE2IDEyNiAtOCA1MCAtMTkgMTI4Ci0yNCAxNzUgLTUgNDcgLTEzIDExMCAtMTkgMTQxIC02IDMxIC0xNSA4OSAtMjAgMTMwIC02IDQxIC0xNyAxMTUgLTI1IDE2NCAtOQo1MCAtMjMgMTQ0IC0zMSAyMTAgLTkgNjYgLTIwIDEyOCAtMjYgMTM3IC01IDEwIC05IDM3IC05IDYwIC0xIDI0IC04IDg0IC0xNgoxMzMgLTkgNTAgLTE4IDEyMiAtMjAgMTYwIC0zIDM5IC05IDc5IC0xNCA5MCAtNSAxMSAtMTYgNzQgLTI1IDE0MCAtOSA2NiAtMjIKMTYxIC0yOSAyMTAgLTcgNTAgLTIxIDE0NCAtMzAgMjEwIC0xMCA2NiAtMjEgMTM0IC0yNyAxNTEgLTUgMTcgLTkgNDUgLTkgNjIKMCAyMCAtNiAzNCAtMTcgNDAgLTIyIDExIC0yOTI0IDE2IC0yOTM5IDV6IG0xNTYyIC0xOTIwIGM0IC0xMCAxMSAtNDcgMTUgLTgzCjQgLTM2IDE0IC0xMTIgMjMgLTE2OCA5IC01NyAyMCAtMTg4IDI2IC0yOTAgNiAtMTAzIDE1IC0yMzAgMjEgLTI4MiA3IC01MiAxNQotMTYwIDE5IC0yNDAgNSAtODAgMTggLTI0NCAzMCAtMzY1IDExIC0xMjEgMjUgLTI2NyAzMCAtMzI1IDUgLTU4IDE0IC0xNTIgMjEKLTIxMCA2IC01OCAxMyAtMTU3IDE1IC0yMjAgMiAtNjMgOCAtMTI0IDEzIC0xMzUgNSAtMTEgMTYgLTEwMyAyNSAtMjA1IDkKLTEwMiAyNSAtMjcwIDM1IC0zNzUgMTEgLTEwNCAyMCAtMTk4IDIwIC0yMDggMSAtMTYgLTIwIC0xNyAtMzM2IC0xNSBsLTMzOCAzCjIgNDUgYzIgNTIgMTggMjI3IDMzIDM4MCA2IDU4IDE1IDE1NSAyMCAyMTUgNSA2MSAxNCAxNDYgMjAgMTkwIDYgNDQgMTUgMTI3CjIwIDE4NSA1IDU4IDE2IDE1NyAyMyAyMjAgOCA2MyAyMiAxNzYgMzEgMjUwIDkgNzQgMTggMTUxIDIxIDE3MCAzIDE5IDEwIDc2CjE1IDEyNSA1IDUwIDE0IDEyNiAyMSAxNzAgNiA0NCAxNSAxMTggMjAgMTY1IDQgNDcgMTIgMTE5IDE4IDE2MCA1IDQxIDEzIDExMgoxNyAxNTggNCA0NSAxMSA4NSAxNiA4OCA0IDMgOCAyMiA4IDQ0IDAgNDUgMjcgMjk2IDM2IDMyNSA4IDMxIDI1IDEzNCAzMSAxOTMKNSA1MyAxNSA2NSAyOSAzNXoiLz4KPC9nPgo8L3N2Zz4K" alt="JIANCHA" style={{ height: size, width: 'auto', display:'block' }} />;
    }

    // Reusable doc header with logo + optional candidate summary chip
    function DocHeader({ step, candidate }) {
      const info = DOC_LABELS[step];
      return (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', borderBottom:'2px solid #0f172a', paddingBottom:'10px', marginBottom:'8px' }}>
            <JianchaLogo size={42} />
            <div style={{ textAlign:'right', flex:1 }}>
              <h1 style={{ margin:0 }}>{info.thai}</h1>
              <div className="form-title-en">{info.name}</div>
            </div>
          </div>
          {candidate && (
            <div style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'4px', padding:'8px 12px', marginBottom:'12px', fontSize:'12px', display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
              <span style={{ color:'#475569', fontSize:'10px', fontWeight:600, textTransform:'uppercase' }}>เกี่ยวกับ:</span>
              {candidate.name ? (
                <>
                  <span style={{ fontWeight:700, color:'#0f172a' }}>{candidate.name}</span>
                  <span style={{ color:'#475569' }}>· ตำแหน่ง <b>{candidate.position}</b></span>
                  <span style={{ color:'#475569' }}>· แผนก <b>{candidate.department}</b></span>
                  <span style={{ color:'#64748b' }}>· {candidate.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'}</span>
                </>
              ) : (
                <>
                  <span style={{ fontWeight:700, color:'#0f172a' }}>{candidate.position}</span>
                  <span style={{ color:'#475569' }}>· แผนก <b>{candidate.department}</b></span>
                  <span style={{ color:'#64748b' }}>· {candidate.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'}</span>
                  <span style={{ color:'#94a3b8', fontStyle:'italic' }}>· (ยังไม่ระบุชื่อผู้สมัคร)</span>
                </>
              )}
            </div>
          )}
        </>
      );
    }

    function Cb({ checked, label }) {
      return (
        <span className="check-item">
          <span className={`checkbox ${checked ? 'checked' : ''}`}></span>
          <span>{label}</span>
        </span>
      );
    }

    // Stylized signature SVG variants (different curves per approver index)
    const SIG_PATHS = [
      'M 8 24 Q 22 6 36 18 Q 50 30 64 12 Q 78 2 92 16 Q 106 26 120 18 L 132 22',
      'M 6 22 Q 18 10 30 20 Q 44 30 58 14 Q 72 4 86 18 Q 100 28 114 16 Q 124 12 132 18',
      'M 10 24 Q 26 8 40 20 Q 54 30 68 16 Q 82 6 96 18 Q 110 28 124 20 L 134 24',
      'M 8 20 Q 20 8 32 18 Q 46 30 60 14 Q 74 4 88 16 Q 102 28 116 20 Q 126 14 134 20'
    ];

    function DigitalSignatureMark({ approver, index = 0 }) {
      const sigPath = SIG_PATHS[index % SIG_PATHS.length];
      return (
        <div style={{ marginTop:'auto', paddingTop:'4px', textAlign:'center' }}>
          {/* If approver supplied real signature_data (PNG base64), use it; else use stylized curve */}
          {approver.signature_data ? (
            <img src={approver.signature_data} alt="signature" style={{ height:'34px', maxWidth:'95%', margin:'0 auto', display:'block' }} />
          ) : (
            <svg viewBox="0 0 140 32" style={{ height:'34px', width:'auto', margin:'0 auto', display:'block' }}>
              <path d={sigPath} fill="none" stroke="#1e3a8a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          <div style={{ borderTop:'1px solid #475569', marginTop:'2px', paddingTop:'4px', fontSize:'10px', lineHeight:'1.4' }}>
            <b>({approver.name})</b><br />
            <span style={{ color:'#475569' }}>{approver.role}</span><br />
            <span style={{ color:'#1e3a8a', fontWeight:600 }}>✓ ลงนามดิจิทัล</span> · <span style={{ color:'#64748b' }}>{fmtDateTime(approver.signedAt)}</span><br />
            <span style={{ color:'#94a3b8', fontSize:'9px' }}>IP: {approver.ip}</span>
          </div>
        </div>
      );
    }

    function PendingSignatureMark({ approver }) {
      return (
        <div style={{ marginTop:'auto', paddingTop:'4px', textAlign:'center', fontSize:'10px', color:'#64748b' }}>
          <div style={{ padding:'18px 0', color:'#cbd5e1', fontStyle:'italic' }}>
            {approver.status === 'pending' ? '⏳ รอลงนาม' : '○ รอคิว'}
          </div>
          <div style={{ borderTop:'1px solid #cbd5e1', paddingTop:'3px' }}>
            <b style={{ color:'#475569' }}>({approver.name})</b><br />
            <span>{approver.role}</span>
          </div>
        </div>
      );
    }

    function BlankSignature() {
      return (
        <div className="sig-line">
          ลงชื่อ ...........................................<br />
          (..........................................)<br />
          ตำแหน่ง ......................................<br />
          วันที่ ___ / _____ / _____
        </div>
      );
    }

    // Section 4 (ข้อเสนอแนะ) — renders comments typed by approvers when they
    // signed in "งานของฉัน". Falls back to a blank box when none.
    function ApproverComments({ workflow }) {
      const comments = (workflow?.approvers || []).filter(a => a.comment && String(a.comment).trim());
      if (!comments.length) {
        return <div style={{ border:'1px solid #94a3b8', borderTop:'none', minHeight:'80px', padding:'10px' }}></div>;
      }
      return (
        <div style={{ border:'1px solid #94a3b8', borderTop:'none', padding:'10px' }}>
          {comments.map((a, i) => (
            <div key={i} style={{ marginBottom: i < comments.length - 1 ? '7px' : 0, paddingBottom: i < comments.length - 1 ? '7px' : 0, borderBottom: i < comments.length - 1 ? '1px dashed #cbd5e1' : 'none' }}>
              <div style={{ fontWeight:600 }}>{a.name} · <span style={{ fontWeight:400, color:'#64748b' }}>{a.role}</span></div>
              <div style={{ whiteSpace:'pre-wrap', marginTop:'2px' }}>{a.comment}</div>
            </div>
          ))}
        </div>
      );
    }

    function SignatureBlocks({ labels, workflow }) {
      // If workflow provided with approvers, use that. Otherwise use default labels with blank lines.
      const useWf = workflow?.approvers?.length > 0;
      const items = useWf
        ? workflow.approvers.map(a => ({ label: a.role, sublabel: 'Approver', approver: a }))
        : labels.map(l => ({ label: l.th, sublabel: l.en, approver: null }));
      // Balanced columns: ≤4 = one row; ≥5 = max 3 per row (3+2, 3+3, …)
      const cols = items.length <= 4 ? items.length : 3;
      // Pad the last row with blank cells so the grid stays a clean rectangle
      const padded = [...items];
      while (padded.length % cols !== 0) padded.push({ filler: true });
      return (
        <div className="sig-grid" style={{ gridTemplateColumns:`repeat(${cols}, 1fr)` }}>
          {padded.map((it, i) => (
            <div key={i} className="sig-box">
              {it.filler ? null : <>
                <div className="sig-label">{it.label}</div>
                <div className="sig-label-en">{it.sublabel}</div>
                {it.approver?.status === 'approved'
                  ? <DigitalSignatureMark approver={it.approver} index={i} />
                  : it.approver
                    ? <PendingSignatureMark approver={it.approver} />
                    : <BlankSignature />}
              </>}
            </div>
          ))}
        </div>
      );
    }
    // Backwards-compat alias
    const BlankSignatureBlocks = SignatureBlocks;

    // ============================================================
    // STEP 3: Unified per-candidate cards (upload + send + timeline)
    // Each candidate that passed prescreen = 1 card
    // ============================================================
    function ShortlistCandidateCards({ candidate, onUpdate }) {
      const list = candidate.shortlist ?? [];
      const passedCount = list.filter(s => s.verdict === 'pass').length;
      const reviewed = list.filter(s => s.verdict).length;
      const add = () => onUpdate([...list, { id:'sl'+Date.now(), name:'', files:[], sentTo:[], addedAt: today(), verdict:null, verdictAt:null, verdictBy:null }]);
      const removeCard = (id) => {
        const item = list.find(s => s.id === id);
        if (!item) return;
        if (!confirm(`ลบ candidate "${item.name || '(ไม่ระบุ)'}" ออกจาก shortlist?`)) return;
        onUpdate(list.filter(s => s.id !== id));
      };
      const updateCard = (id, updates) => onUpdate(list.map(s => s.id === id ? { ...s, ...updates } : s));

      return (
        <div className="mt-2 space-y-3">
          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
            <div className="text-xs text-emerald-900 font-medium">
              👥 ผู้สมัครที่ผ่าน Prescreen ({list.length} คน)
              <span className="text-slate-500 font-normal"> · แต่ละคนมี upload resume + ส่งให้ Hiring Manager แยกกัน</span>
            </div>
            <button onClick={add} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg ibtn whitespace-nowrap">+ เพิ่ม Candidate</button>
          </div>
          {list.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] flex-wrap">
              <span className="text-slate-500">สถานะจากต้นสังกัด:</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">รอตอบ {list.length - reviewed}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium">✓ ผ่าน {passedCount}</span>
              {passedCount > 0 && <span className="text-emerald-700">← HR ดำเนินการนัดสัมภาษณ์ Step 4 ต่อได้</span>}
            </div>
          )}
          {list.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-300 rounded-lg">
              ยังไม่มีผู้สมัครที่ผ่าน prescreen<br />
              กด <b className="text-emerald-700">"+ เพิ่ม Candidate"</b> ด้านบนเพื่อเพิ่มทีละคน
            </div>
          )}
          {list.map((item, i) => (
            <ShortlistCard
              key={item.id}
              candidate={candidate}
              item={item}
              index={i}
              onChange={(updates) => updateCard(item.id, updates)}
              onRemove={() => removeCard(item.id)}
            />
          ))}
        </div>
      );
    }

    function ShortlistCard({ candidate, item, index, onChange, onRemove }) {
      const fileInputRef = useRef(null);
      const [recipient, setRecipient] = useState({ name:'', email:'' });
      const [showPreview, setShowPreview] = useState(false);
      const [uploadingFile, setUploadingFile] = useState(false);

      const handleFileUpload = async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setUploadingFile(true);
        try {
          const meta = await uploadFile(candidate.id, 3, f);   // real upload -> {path,name,size}
          const size = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size/1024).toFixed(0)} KB` : `${(f.size/1048576).toFixed(1)} MB`;
          onChange({ files: [...item.files, { name: meta.name, path: meta.path, size, uploadedAt: today(), uploadedBy: '(คุณ)' }] });
          showToast(`📎 อัพโหลด ${f.name}`, 'success');
        } catch (err) {
          showToast('อัปโหลดไม่สำเร็จ: ' + (err?.message || ''), 'warning');
        } finally {
          setUploadingFile(false);
        }
      };
      const removeFile = (idx) => {
        onChange({ files: item.files.filter((_, i) => i !== idx) });
      };

      const subject = `Candidate Profile: ${item.name || '(Name)'} for ${candidate.position}`;
      const body = `Dear Khun ${recipient.name || '...........'},

The HR team is forwarding the resume of a pre-screened candidate for your review.

Position: ${candidate.position}
Department: ${candidate.department}
Candidate: ${item.name || '(Name)'}
Attachments: ${item.files.map(f => f.name).join(', ') || '(none yet)'}

Please review and let us know whether you would like to invite this candidate for an interview.

Sincerely,
HR Team · JIAN CHA Co., Ltd.
${HR_EMAIL}`;

      const send = () => {
        if (!recipient.email.trim()) { showToast('กรอกอีเมล Hiring Manager ก่อน', 'warning'); return; }
        if (!item.name.trim()) { showToast('กรอกชื่อ candidate ก่อน', 'warning'); return; }
        if (item.files.length === 0) { showToast('อัพโหลด resume ของ candidate ก่อน', 'warning'); return; }
        const entry = { id:'rcp'+Date.now(), ...recipient, sentAt: new Date().toISOString(), filesAttached: item.files.map(f => f.name) };
        onChange({ sentTo: [...item.sentTo, entry] });
        setRecipient({ name:'', email:'' });
        showToast(`👤 มอบหมาย "${item.name}" ให้ ${entry.name || entry.email} พิจารณา · งานอยู่ใน "งานของฉัน" ของเขา`, 'email');
      };
      const removeRecipient = (id) => {
        if (confirm('ลบรายการนี้?')) onChange({ sentTo: item.sentTo.filter(s => s.id !== id) });
      };

      const VERDICT_META = {
        pass:   { label:'ผ่าน',    badge:'bg-emerald-100 text-emerald-800 border-emerald-300', btn:'bg-emerald-600 hover:bg-emerald-700' },
        reject: { label:'ไม่ผ่าน', badge:'bg-rose-100 text-rose-700 border-rose-300',          btn:'bg-rose-500 hover:bg-rose-600' },
      };
      const setVerdict = (key) => {
        const by = item.sentTo?.[item.sentTo.length-1]?.name || item.sentTo?.[item.sentTo.length-1]?.email || 'ต้นสังกัด';
        onChange({ verdict: key, verdictAt: new Date().toISOString(), verdictBy: by });
        showToast(`📥 ต้นสังกัดตอบกลับ "${item.name || '(candidate)'}" : ${VERDICT_META[key].label} · แจ้ง HR แล้ว`, key === 'reject' ? 'warning' : 'success');
      };

      return (
        <div className="bg-white border-2 border-emerald-300 rounded-xl p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold grid place-items-center shrink-0">#{index+1}</span>
              <input className="input text-sm font-medium flex-1" placeholder="ชื่อ-นามสกุล candidate ที่ผ่าน prescreen" value={item.name} onChange={e => onChange({ name: e.target.value })} />
            </div>
            <button onClick={onRemove} className="text-rose-500 hover:text-rose-700 text-sm px-2 py-1 rounded hover:bg-rose-50 whitespace-nowrap">× ลบ candidate</button>
          </div>

          {/* Resume upload area */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-slate-700 font-medium">📎 Resume / เอกสาร candidate · {item.files.length} ไฟล์</span>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} className="text-xs bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-2.5 py-1 rounded ibtn">{uploadingFile ? 'กำลังอัปโหลด…' : '+ Upload'}</button>
              <input ref={fileInputRef} type="file" hidden onChange={handleFileUpload} />
            </div>
            {item.files.length > 0 && (
              <ul className="space-y-1">
                {item.files.map((f, fi) => (
                  <li key={fi} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 flex items-center justify-between">
                    <span className="truncate">📄 {f.name} <span className="text-slate-400">· {f.size}</span></span>
                    <button onClick={() => removeFile(fi)} className="text-rose-400 hover:text-rose-600 text-xs whitespace-nowrap">×</button>
                  </li>
                ))}
              </ul>
            )}
            {item.files.length === 0 && (
              <div className="text-[11px] text-slate-400 italic text-center py-1">ยังไม่ได้ upload resume</div>
            )}
          </div>

          {/* Send to Hiring Manager */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 space-y-2">
            <div className="text-[11px] text-amber-900 font-medium">👤 มอบหมาย "{item.name || '(ระบุชื่อก่อน)'}" ให้ Hiring Manager พิจารณา (อีเมล = username เข้าระบบดู)</div>
            <div className="text-[10px] text-amber-700">📌 ผู้รับเข้าระบบด้วยอีเมล (username) → เห็น shortlist ใน "งานของฉัน"</div>
            <div className="grid grid-cols-12 gap-2">
              <input className="input text-xs col-span-4" placeholder="ชื่อ Hiring Manager" value={recipient.name} onChange={e => setRecipient(r => ({ ...r, name: e.target.value }))} />
              <input className="input text-xs col-span-5" placeholder="manager@email.com (= username)" value={recipient.email} onChange={e => setRecipient(r => ({ ...r, email: e.target.value }))} />
              <button onClick={send} className="text-xs col-span-3 bg-amber-600 hover:bg-amber-700 text-white rounded ibtn whitespace-nowrap">มอบหมาย →</button>
            </div>
            {item.sentTo.length > 0 && (
              <div className="bg-white border border-amber-200 rounded p-1.5">
                <div className="text-[10px] font-semibold text-amber-900 mb-1">📋 ส่งไปแล้ว ({item.sentTo.length})</div>
                <ul className="space-y-0.5">
                  {item.sentTo.map(s => (
                    <li key={s.id} className="text-[10px] flex items-center justify-between gap-2">
                      <span className="flex-1 truncate">✓ <b>{s.name || s.email}</b>{s.name && s.email ? ` · ${s.email}` : ''}</span>
                      <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(s.sentAt)}</span>
                      <button onClick={() => removeRecipient(s.id)} className="text-rose-500 hover:text-rose-700">×</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── ผลพิจารณาจากต้นสังกัด · เด้งสถานะกลับมาให้ HR ───────────── */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-sky-900 font-semibold">📥 ผลพิจารณาจากต้นสังกัด</span>
              {item.verdictAt && <span className="text-[10px] text-slate-500 whitespace-nowrap">ตอบ {fmtDateTime(item.verdictAt)}</span>}
            </div>
            {item.verdict ? (
              <div className={`flex items-center gap-2 text-xs font-medium border rounded-lg px-2.5 py-1.5 ${VERDICT_META[item.verdict].badge}`}>
                <span>{item.verdict === 'reject' ? '✕' : '✓'}</span>
                <span>ต้นสังกัด{item.verdictBy ? ` (${item.verdictBy})` : ''} : <b>{VERDICT_META[item.verdict].label}</b></span>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400 italic">⏳ ยังไม่ได้รับผลจากต้นสังกัด · รอพิจารณา</div>
            )}
            {item.verdict === 'pass' && (
              <div className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">→ HR: ต้นสังกัดให้ผ่าน — ไปดำเนินการนัดสัมภาษณ์ Step 4 ต่อได้เลย</div>
            )}
            <div className="pt-0.5">
              <div className="text-[10px] text-slate-500 mb-1">บันทึกผลที่ต้นสังกัดตอบกลับ:</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(VERDICT_META).map(([key, m]) => (
                  <button key={key} onClick={() => setVerdict(key)}
                          className={`text-[11px] text-white px-2.5 py-1 rounded ibtn whitespace-nowrap ${m.btn} ${item.verdict === key ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-90'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      );
    }

    // Special panel for Step 4: Interview invite with full template
    function InterviewInviteSender({ candidate, onUpdate }) {
      const log = candidate.distributions?.[4] ?? [];
      const [showPreview, setShowPreview] = useState(false);
      const [draft, setDraft] = useState({
        candName: candidate.name ?? '',
        candEmail: '',
        interviewerEmails: '',
        date: '',
        timeStart: '',
        timeEnd: '',
        format: 'on-site',
        venue: 'Jian Cha Tea 见茶山 (Dragon Town, 2nd Floor, Wang Mai, Pathum Wan, Bangkok 10330)',
        mapUrl: 'https://maps.app.goo.gl/2yhbGu5UL5FcNs6m7?g_st=ic',
        interviewerRole: '',
        contactName: '',
        contactPhone: '',
        attachments: []
      });
      const set = (k, v) => setDraft(d => ({ ...d, [k]:v }));
      const onPickFiles = (e) => {
        const names = Array.from(e.target.files || []).map(f => f.name);
        if (names.length) set('attachments', [...draft.attachments, ...names]);
        e.target.value = '';
      };
      const removeAttachment = (i) => set('attachments', draft.attachments.filter((_, j) => j !== i));
      // recipients = candidate + any interviewer emails (comma/space separated)
      const interviewerList = draft.interviewerEmails.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
      const allRecipients = [draft.candEmail.trim(), ...interviewerList].filter(Boolean);

      const formatLabel = draft.format === 'on-site' ? 'On-site' : 'Online';
      const subject = `${formatLabel} Interview : ${candidate.position} (K'${(draft.candName || candidate.name || 'Candidate').split(' ')[0]})`;
      const fmtDay = draft.date ? new Date(draft.date).toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : '___________';
      const timeRange = draft.timeStart && draft.timeEnd ? `${draft.timeStart} – ${draft.timeEnd}` : '___ – ___';
      const body = `Dear Khun ${(draft.candName || candidate.name || '...........').split(' ')[0]},

Thank you for your interest in JIAN CHA Co., Ltd. We are pleased to inform you that your profile has been shortlisted. We would like to invite you to ${draft.format === 'on-site' ? 'an on-site' : 'an online'} interview with the details below.

Position: ${candidate.position}
Company: JIAN CHA Co., Ltd.
Date & Time: ${fmtDay}, ${timeRange}
Format: ${draft.format === 'on-site' ? 'On-site interview' : 'Online interview (link will be sent separately)'}
${draft.format === 'on-site' ? `Venue: ${draft.venue || '...........'}\nMap: ${draft.mapUrl || '...........'}` : ''}

Interviewer: ${draft.interviewerRole || '...........'}
Contact Person: ${draft.contactName || '...........'}${draft.contactPhone ? ` | ${draft.contactPhone}` : ''}
${draft.attachments.length ? `\nAttachments: ${draft.attachments.join(', ')}` : ''}
Kindly confirm your attendance by replying to this email. If you need to reschedule, please let us know your availability. We look forward to meeting you.

Best regards,
HR Team · JIAN CHA Co., Ltd.
${HR_EMAIL}`;

      const send = () => {
        if (!draft.candEmail.trim() || !draft.date) { showToast('กรอก email + วันสัมภาษณ์ก่อน', 'warning'); return; }
        const entry = { id:'iv'+Date.now(), ...draft, recipients:allRecipients, sentAt:new Date().toISOString(), subject, body };
        onUpdate([...log, entry]);
        setDraft(d => ({ ...d, candEmail:'', interviewerEmails:'', date:'', timeStart:'', timeEnd:'', attachments:[] }));
        const extra = interviewerList.length ? ` + ผู้สัมภาษณ์ ${interviewerList.length} คน` : '';
        showToast(`📅 ส่งคำเชิญสัมภาษณ์ให้ ${draft.candName || candidate.name} (${draft.candEmail})${extra} แล้ว`, 'email');
      };
      const remove = (id) => { if (confirm('ลบรายการนี้?')) onUpdate(log.filter(e => e.id !== id)); };

      return (
        <div className="mt-2 bg-sky-50/60 border border-dashed border-sky-300 rounded-lg p-3 space-y-2">
          <div className="text-[11px] text-sky-900 font-medium">📅 Interview Invitation · เทมเพลตอีเมลครบฟิลด์</div>
          <div className="text-[10px] text-sky-700">📤 ส่งจากอีเมลกลาง HR: <b>{HR_EMAIL}</b></div>

          <div className="grid grid-cols-12 gap-2">
            <input className="input text-xs col-span-4" placeholder="ชื่อ candidate" value={draft.candName} onChange={e => set('candName', e.target.value)} />
            <input className="input text-xs col-span-5" placeholder="candidate@email.com" value={draft.candEmail} onChange={e => set('candEmail', e.target.value)} />
            <select className="input text-xs col-span-3" value={draft.format} onChange={e => set('format', e.target.value)}>
              <option value="on-site">On-site</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div className="grid grid-cols-12 gap-2">
            <input className="input text-xs col-span-12" placeholder="อีเมลผู้สัมภาษณ์ (ส่ง CC ให้ด้วย — คั่นหลายคนด้วย , )" value={draft.interviewerEmails} onChange={e => set('interviewerEmails', e.target.value)} />
          </div>
          <div className="grid grid-cols-12 gap-2">
            <input type="date" className="input text-xs col-span-4" value={draft.date} onChange={e => set('date', e.target.value)} />
            <input type="time" className="input text-xs col-span-3" value={draft.timeStart} onChange={e => set('timeStart', e.target.value)} />
            <input type="time" className="input text-xs col-span-3" value={draft.timeEnd} onChange={e => set('timeEnd', e.target.value)} />
            <input className="input text-xs col-span-2" placeholder="ผู้สัมภาษณ์ (เช่น QSC Mgr)" value={draft.interviewerRole} onChange={e => set('interviewerRole', e.target.value)} />
          </div>
          {draft.format === 'on-site' && (
            <>
              <input className="input text-xs" placeholder="Venue (สถานที่ + ที่อยู่)" value={draft.venue} onChange={e => set('venue', e.target.value)} />
              <input className="input text-xs" placeholder="Map URL" value={draft.mapUrl} onChange={e => set('mapUrl', e.target.value)} />
            </>
          )}
          <div className="grid grid-cols-12 gap-2">
            <input className="input text-xs col-span-6" placeholder="Contact name (เช่น K.Milk HR)" value={draft.contactName} onChange={e => set('contactName', e.target.value)} />
            <input className="input text-xs col-span-4" placeholder="โทร (เช่น 092-131-5152)" value={draft.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
            <button onClick={() => setShowPreview(true)} className="text-xs col-span-2 bg-white border border-sky-300 text-sky-700 hover:bg-sky-100 rounded ibtn">👁 ดูตัวอย่าง</button>
          </div>
          <div>
            <label className="text-[11px] text-sky-900 font-medium cursor-pointer inline-flex items-center gap-1 bg-white border border-sky-300 rounded px-2 py-1 hover:bg-sky-100">
              📎 แนบไฟล์ (JD · แผนที่ · แบบฟอร์ม)
              <input type="file" multiple className="hidden" onChange={onPickFiles} />
            </label>
            {draft.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.attachments.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5">
                    📄 {name}
                    <button onClick={() => removeAttachment(i)} className="text-rose-500 hover:text-rose-700">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={send} className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded ibtn">📨 ส่งคำเชิญ</button>
          </div>

          {log.length > 0 && (
            <div className="bg-white border border-slate-200 rounded p-2">
              <div className="text-[10px] font-semibold text-slate-700 mb-1">📋 Timeline ({log.length} คน)</div>
              <ul className="space-y-1">
                {log.map(e => (
                  <li key={e.id} className="text-[10px] flex items-center justify-between gap-2">
                    <span className="flex-1 truncate">✓ <b>{e.candName}</b> · {e.candEmail}{e.interviewerEmails ? ` +ผู้สัมภาษณ์` : ''} · {e.format === 'on-site' ? 'On-site' : 'Online'} · {e.date} {e.timeStart}-{e.timeEnd}{e.attachments?.length ? ` · 📎${e.attachments.length}` : ''}</span>
                    <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(e.sentAt)}</span>
                    <button onClick={() => remove(e.id)} className="text-rose-500 hover:text-rose-700">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showPreview && (
            <Modal title="ตัวอย่างอีเมลเชิญสัมภาษณ์" subtitle={subject} onClose={() => setShowPreview(false)} wide>
              <div className="text-xs text-slate-500 mb-2">📤 <b>From:</b> {HR_SENDER}</div>
              <div className="text-xs text-slate-500 mb-2">📧 <b>Subject:</b> {subject}</div>
              <div className="text-xs text-slate-500 mb-1">📨 <b>To:</b> {draft.candEmail || '(ใส่อีเมล candidate)'}</div>
              {interviewerList.length > 0 && <div className="text-xs text-slate-500 mb-2">👥 <b>Cc (ผู้สัมภาษณ์):</b> {interviewerList.join(', ')}</div>}
              {draft.attachments.length > 0 && <div className="text-xs text-slate-500 mb-2">📎 <b>Attachments:</b> {draft.attachments.join(', ')}</div>}
              <pre style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px', fontSize:'12px', whiteSpace:'pre-wrap', fontFamily:'inherit', lineHeight:'1.6' }}>{body}</pre>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setShowPreview(false)} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ปิด</button>
                <button onClick={() => { send(); setShowPreview(false); }} className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg">📨 ส่งจริง</button>
              </div>
            </Modal>
          )}
        </div>
      );
    }

    // Special panel for Step 7: HR sends self-service upload link to candidate
    function CandidateLinkSender({ candidate, onUpdate }) {
      const log = candidate.distributions?.[7] ?? [];
      const [candEmail, setCandEmail] = useState('');
      const [candName, setCandName] = useState(candidate.name ?? '');
      const docs = candidate.documents ?? [];
      const docCount = docs.length;
      const send = () => {
        if (!candEmail.trim()) { showToast('กรุณากรอกอีเมล candidate', 'warning'); return; }
        const entry = { id:'cl'+Date.now(), name:candName||candidate.name||'(candidate)', email:candEmail.trim(),
          sentAt:new Date().toISOString(), docsCount:docCount,
          link:`https://recruitment.jiancha.app/upload/${candidate.id}/abc123` };
        onUpdate([...log, entry]);
        setCandEmail('');
        showToast(`📧 ส่ง upload link ให้ ${entry.name} (${entry.email}) แล้ว · ${docCount} เอกสาร`, 'email');
      };
      const remove = (id) => { if (confirm('ลบรายการนี้?')) onUpdate(log.filter(e => e.id !== id)); };
      return (
        <div className="mt-4 bg-amber-50 border border-dashed border-amber-300 rounded-lg p-3 space-y-2">
          <div className="text-xs text-amber-900 font-medium">📤 ส่ง self-service upload link ให้ candidate · กรอกอีเมลแล้วกดส่ง</div>
          <div className="text-[10px] text-amber-700">📤 ส่งจากอีเมลกลาง HR: <b>{HR_EMAIL}</b></div>
          <div className="grid grid-cols-12 gap-2">
            <input className="input text-xs col-span-4" placeholder="ชื่อ candidate" value={candName} onChange={e => setCandName(e.target.value)} />
            <input className="input text-xs col-span-6" placeholder="candidate-email@gmail.com" value={candEmail} onChange={e => setCandEmail(e.target.value)} />
            <button onClick={send} disabled={!candEmail.trim() || docCount === 0}
              className={`text-xs px-2 rounded col-span-2 ibtn ${candEmail.trim() && docCount > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              📨 ส่ง link
            </button>
          </div>
          {docCount === 0 && (
            <div className="text-[10px] text-rose-600">⚠ ต้องกำหนดรายการเอกสารก่อน (กด "+ เพิ่มเอกสาร" ด้านบน)</div>
          )}
          {log.length > 0 && (
            <div className="bg-white border border-amber-200 rounded p-2">
              <div className="text-[10px] font-semibold text-amber-900 mb-1">📋 Timeline ส่งไปแล้ว ({log.length} ครั้ง)</div>
              <ul className="space-y-1">
                {log.map(e => (
                  <li key={e.id} className="text-[10px] flex items-center justify-between gap-2">
                    <span className="flex-1 truncate">✓ <b>{e.name}</b> · {e.email} · ขอ {e.docsCount} เอกสาร</span>
                    <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(e.sentAt)}</span>
                    <button onClick={() => remove(e.id)} className="text-rose-500 hover:text-rose-700">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    // Reusable EmailDistribution — for Steps 3 (shortlist), 5 (scorecard), 8 (probation eval)
    function EmailDistribution({ candidate, step, title, helperText, accent='amber', extraFields=[], attachmentLabel='เอกสารแนบ', emailSubject, emailBody, onUpdate }) {
      const log = candidate.distributions?.[step] ?? [];
      const blank = { name:'', email:'', ...Object.fromEntries(extraFields.map(f => [f.key, f.default ?? ''])) };
      const [draft, setDraft] = useState(blank);
      const [showPreview, setShowPreview] = useState(false);
      const set = (k, v) => setDraft(d => ({ ...d, [k]:v }));
      const attached = candidate.files?.filter(f => f.step === step).map(f => f.name) ?? [];
      const subject = typeof emailSubject === 'function' ? emailSubject(draft, candidate) : emailSubject;
      const body = typeof emailBody === 'function' ? emailBody(draft, candidate, attached) : emailBody;
      const accentClasses = {
        amber:  { bg:'bg-amber-50/50',  border:'border-amber-300',  text:'text-amber-900',  btn:'bg-amber-600 hover:bg-amber-700' },
        sky:    { bg:'bg-sky-50/50',    border:'border-sky-300',    text:'text-sky-900',    btn:'bg-sky-600 hover:bg-sky-700' },
        violet: { bg:'bg-violet-50/50', border:'border-violet-300', text:'text-violet-900', btn:'bg-violet-600 hover:bg-violet-700' }
      };
      const a = accentClasses[accent];

      const send = () => {
        if (!draft.name?.trim() || !draft.email?.trim()) { showToast('กรุณากรอกชื่อ + อีเมล', 'warning'); return; }
        const entry = { id:'r'+Date.now(), ...draft, sentAt:new Date().toISOString(), filesAttached:attached };
        onUpdate([...log, entry]);
        setDraft(blank);
        showToast(`📧 ส่งให้ ${entry.name} (${entry.email}) เรียบร้อย`, 'email');
      };
      const remove = (id) => { if (confirm('ลบรายการนี้?')) onUpdate(log.filter(e => e.id !== id)); };

      return (
        <div className={`mt-2 ${a.bg} border border-dashed ${a.border} rounded-lg p-2.5 space-y-2`}>
          <div className={`text-[11px] ${a.text} font-medium`}>{title}{helperText && <span className="ml-1 text-slate-500 font-normal">· {helperText}</span>}</div>
          <div className="text-[10px] text-slate-500">📤 ส่งจากอีเมลกลาง HR: <b>{HR_EMAIL}</b></div>
          {attached.length > 0 && (
            <div className="text-[10px] text-slate-600">📎 <b>{attachmentLabel}:</b> {attached.join(', ')}</div>
          )}
          {/* Input row: name, email, optional extra fields */}
          <div className={`grid gap-2`} style={{ gridTemplateColumns:`repeat(${2 + extraFields.length + (body ? 2 : 1)}, minmax(0,1fr))` }}>
            <input className="input text-xs" placeholder="ชื่อ-นามสกุล" value={draft.name} onChange={e => set('name', e.target.value)} />
            <input className="input text-xs" placeholder="อีเมล (ใช้เป็น username เข้าระบบ)" value={draft.email} onChange={e => set('email', e.target.value)} />
            {extraFields.map(f => (
              <input key={f.key} type={f.type ?? 'text'} className="input text-xs" placeholder={f.placeholder} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} />
            ))}
            {body && (
              <button onClick={() => setShowPreview(true)} className="text-xs bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded ibtn whitespace-nowrap">👁 preview</button>
            )}
            <button onClick={send} className={`text-xs ${a.btn} text-white px-2 rounded ibtn whitespace-nowrap`}>📨 ส่ง</button>
          </div>

          {showPreview && body && (
            <Modal title="ตัวอย่างอีเมล" subtitle={subject} onClose={() => setShowPreview(false)} wide>
              <div className="text-xs text-slate-500 mb-2">📤 <b>From:</b> {HR_SENDER}</div>
              <div className="text-xs text-slate-500 mb-2">📧 <b>Subject:</b> {subject}</div>
              <div className="text-xs text-slate-500 mb-2">📨 <b>To:</b> {draft.email || '(ใส่อีเมล)'}</div>
              {attached.length > 0 && <div className="text-xs text-slate-500 mb-2">📎 <b>Attachments:</b> {attached.join(', ')}</div>}
              <pre style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px', fontSize:'12px', whiteSpace:'pre-wrap', fontFamily:'inherit', lineHeight:'1.6' }}>{body}</pre>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setShowPreview(false)} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ปิด</button>
                <button onClick={() => { send(); setShowPreview(false); }} className={`px-4 py-2 text-sm ${a.btn} text-white rounded-lg`}>📨 ส่งจริง</button>
              </div>
            </Modal>
          )}
          {/* Timeline of sent emails */}
          {log.length > 0 && (
            <div className="bg-white border border-slate-200 rounded p-2">
              <div className="text-[10px] font-semibold text-slate-700 mb-1">📋 Timeline ({log.length} คน)</div>
              <ul className="space-y-1">
                {log.map(e => (
                  <li key={e.id} className="text-[10px] flex items-center justify-between gap-2">
                    <span className="flex-1 truncate">
                      ✓ <b>{e.name}</b> · {e.email}
                      {extraFields.map(f => e[f.key] ? ` · ${f.shortLabel ?? f.placeholder}: ${e[f.key]}` : '').join('')}
                    </span>
                    <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(e.sentAt)}</span>
                    <button onClick={() => remove(e.id)} className="text-rose-500 hover:text-rose-700 text-[10px]">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    // Assign-by-email (no email): enter email = username → task lands in that user's "งานของฉัน"
    function AssignDistribution({ candidate, step, title, helperText, accent='violet', onUpdate }) {
      const log = candidate.distributions?.[step] ?? [];
      const [draft, setDraft] = useState({ name:'', email:'', role:'' });
      const set = (k, v) => setDraft(d => ({ ...d, [k]:v }));
      const accentClasses = {
        amber:  { bg:'bg-amber-50/50',  border:'border-amber-300',  text:'text-amber-900',  btn:'bg-amber-600 hover:bg-amber-700' },
        sky:    { bg:'bg-sky-50/50',    border:'border-sky-300',    text:'text-sky-900',    btn:'bg-sky-600 hover:bg-sky-700' },
        violet: { bg:'bg-violet-50/50', border:'border-violet-300', text:'text-violet-900', btn:'bg-violet-600 hover:bg-violet-700' }
      };
      const a = accentClasses[accent] ?? accentClasses.violet;
      const [assigning, setAssigning] = useState(false);
      const assign = async () => {
        if (!draft.name?.trim() || !draft.email?.trim()) { showToast('กรุณากรอกชื่อ + อีเมล (username)', 'warning'); return; }
        setAssigning(true);
        try {
          if (!(await ensureAssigneesRegistered([draft.email], showToast))) return;
          const entry = { id:'r'+Date.now(), ...draft, sentAt:new Date().toISOString() };
          onUpdate([...log, entry]);
          setDraft({ name:'', email:'', role:'' });
          showToast(`👤 มอบหมายให้ ${entry.name} (${entry.email}) แล้ว · งานอยู่ใน "งานของฉัน" ของเขา`, 'email');
        } finally {
          setAssigning(false);
        }
      };
      const remove = (id) => { if (confirm('ยกเลิกการมอบหมายรายการนี้?')) onUpdate(log.filter(e => e.id !== id)); };
      return (
        <div className={`mt-2 ${a.bg} border border-dashed ${a.border} rounded-lg p-2.5 space-y-2`}>
          <div className={`text-[11px] ${a.text} font-medium`}>{title}{helperText && <span className="ml-1 text-slate-500 font-normal">· {helperText}</span>}</div>
          <div className="grid gap-2" style={{ gridTemplateColumns:'repeat(4, minmax(0,1fr))' }}>
            <input className="input text-xs" placeholder="ชื่อ-นามสกุล" value={draft.name} onChange={e => set('name', e.target.value)} />
            <input className="input text-xs" placeholder="email = username" value={draft.email} onChange={e => set('email', e.target.value)} />
            <input className="input text-xs" placeholder="ตำแหน่ง (ไม่บังคับ)" value={draft.role} onChange={e => set('role', e.target.value)} />
            <button onClick={assign} disabled={assigning} className={`text-xs ${a.btn} text-white px-2 rounded ibtn whitespace-nowrap disabled:opacity-60`}>{assigning ? 'ตรวจสอบ…' : 'มอบหมาย →'}</button>
          </div>
          {log.length > 0 && (
            <div className="bg-white border border-slate-200 rounded p-2">
              <div className="text-[10px] font-semibold text-slate-700 mb-1">📋 มอบหมายแล้ว ({log.length} คน)</div>
              <ul className="space-y-1">
                {log.map(e => (
                  <li key={e.id} className="text-[10px] flex items-center justify-between gap-2">
                    <span className="flex-1 truncate">✓ <b>{e.name}</b> · {e.email}{e.role ? ` · ${e.role}` : ''}</span>
                    <span className="text-slate-500 whitespace-nowrap">{fmtDateTime(e.sentAt)}</span>
                    <button onClick={() => remove(e.id)} className="text-rose-500 hover:text-rose-700 text-[10px]">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    // Reusable ApproverList — embedded in Manpower/Approval/Contract forms
    function ApproverList({ approvers, setApprovers, label }) {
      const add = () => setApprovers(a => [...a, { name:'', email:'', role:'' }]);
      const remove = (i) => setApprovers(a => a.filter((_, idx) => idx !== i));
      const update = (i, k, v) => setApprovers(a => a.map((x, idx) => idx === i ? { ...x, [k]:v } : x));
      return (
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-sky-900">👥 {label} ({approvers.length} คน) — ระบบจะมอบหมายให้เซ็นทีละคนตามลำดับ (อีเมล = username)</div>
            <button type="button" onClick={add} className="text-xs text-sky-700 hover:text-sky-900">+ เพิ่ม</button>
          </div>
          {approvers.map((a, i) => (
            <div key={i} className="bg-white border border-sky-100 rounded p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">ลำดับที่ {i+1}</span>
                {approvers.length > 1 && <button type="button" onClick={() => remove(i)} className="text-xs text-rose-600 hover:text-rose-800">ลบ</button>}
              </div>
              <input className="input text-sm" placeholder="ชื่อ-นามสกุล" value={a.name} onChange={e => update(i, 'name', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-sm" placeholder="ตำแหน่ง (เช่น CEO)" value={a.role} onChange={e => update(i, 'role', e.target.value)} />
                <input className="input text-sm" placeholder="อีเมล (ใช้เป็น username เข้าระบบ)" value={a.email} onChange={e => update(i, 'email', e.target.value)} />
              </div>
            </div>
          ))}
          <div className="text-[10px] text-sky-700 italic">
            💡 หลังกดบันทึก ระบบจะ generate เอกสารพร้อมช่องลายเซ็น {approvers.length} ช่อง + ส่งงานเข้า "งานของฉัน" ของลำดับที่ 1 ทันที
          </div>
        </div>
      );
    }

    function DocumentBuilder({ candidate, step, onSave, user, onCancel }) {
      const doc = candidate.generatedDocs?.[step];
      const [editing, setEditing] = useState(false);
      const [previewing, setPreviewing] = useState(false);
      const label = DOC_LABELS[step];
      const isApprovalStep = APPROVAL_STEPS.includes(step);
      const buttonLabel = isApprovalStep ? '+ สร้างเอกสาร + ส่งอนุมัติ' : '+ สร้างเอกสาร';
      const placeholderText = isApprovalStep
        ? `📝 สร้าง ${label.name} → กรอกฟอร์ม → ระบุผู้อนุมัติ (อีเมล = username) → ระบบมอบหมายให้เซ็นทีละคนตามลำดับในระบบ`
        : `📝 ยังไม่ได้สร้าง ${label.name} · ระบบจะสร้างให้จาก form`;

      return (
        <div className="mt-2 bg-emerald-50/50 border border-dashed border-emerald-300 rounded-lg p-2.5">
          {doc ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs min-w-0 flex-1">
                <div className="font-medium text-emerald-900 truncate">📄 {label.name}</div>
                <div className="text-[10px] text-emerald-700">สร้างเมื่อ {fmtDate(doc.createdAt)} · {doc.createdBy}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setPreviewing(true)} className="text-xs bg-white border border-emerald-300 hover:border-emerald-400 text-emerald-800 px-2 py-1 rounded ibtn">ดูเอกสาร</button>
                <button onClick={() => setEditing(true)} className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-white">แก้ไข</button>
                {onCancel && <button onClick={onCancel} className="text-xs text-rose-600 hover:text-rose-800 px-2 py-1 rounded hover:bg-rose-50 whitespace-nowrap">🗑 ยกเลิก/เรียกคืน</button>}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-800 flex-1">{placeholderText}</span>
              <button onClick={() => setEditing(true)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg ibtn whitespace-nowrap">{buttonLabel}</button>
            </div>
          )}

          {editing && step === 1 && <ManpowerRequestForm initial={doc?.data} candidate={candidate} user={user} onClose={() => setEditing(false)} onSave={(data, approvers) => { onSave(step, data, approvers); setEditing(false); }} />}
          {editing && step === 4 && <ScorecardForm        initial={doc?.data} candidate={candidate} user={user} onClose={() => setEditing(false)} onSave={(data) => { onSave(step, data); setEditing(false); }} />}
          {editing && step === 5 && <ApprovalForm         initial={doc?.data} candidate={candidate} user={user} onClose={() => setEditing(false)} onSave={(data, approvers) => { onSave(step, data, approvers); setEditing(false); }} />}
          {/* step 6 (probation) ใช้ระบบราย-รอบใน Probation Section · ไม่มีฟอร์มรวมแล้ว */}
          {previewing && doc && <DocumentPreview step={step} doc={doc} candidate={candidate} onClose={() => setPreviewing(false)} />}
        </div>
      );
    }

    // ===== Step 5: เอกสารแนบประกอบการพิจารณาอนุมัติ (อยู่ที่หน้า step · ไม่ใช่ในฟอร์ม) =====
    function ApprovalAttachments({ candidate, step = 5, onUpdate }) {
      const files = candidate.approvalAttachments || [];
      const ref = useRef(null);
      const [busy, setBusy] = useState(false);
      const add = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        if (!picked.length) return;
        setBusy(true);
        try {
          const uploaded = [];
          for (const f of picked) {
            const meta = await uploadFile(candidate.id, step, f);  // real upload -> {path,name,size,...}
            uploaded.push({ name: meta.name, path: meta.path, size: meta.size });
          }
          onUpdate([...files, ...uploaded]);
          showToast(`แนบเอกสาร ${uploaded.length} ไฟล์เรียบร้อย`, 'success');
        } catch (err) {
          showToast('อัปโหลดไม่สำเร็จ: ' + (err?.message || ''), 'warning');
        } finally {
          setBusy(false);
        }
      };
      const remove = (i) => onUpdate(files.filter((_, j) => j !== i));
      return (
        <div className="mt-2 bg-amber-50/60 border border-dashed border-amber-300 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-amber-900">📎 เอกสารแนบประกอบการพิจารณาอนุมัติ ({files.length})</div>
            <button onClick={() => ref.current?.click()} disabled={busy} className="text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-2.5 py-1 rounded ibtn whitespace-nowrap">{busy ? 'กำลังอัปโหลด…' : '+ แนบเอกสาร'}</button>
            <input ref={ref} type="file" multiple hidden onChange={add} />
          </div>
          <div className="text-[10px] text-amber-700">เช่น resume · scorecard สัมภาษณ์ · ประวัติเงินเดือน · ผลตรวจอ้างอิง — ผู้อนุมัติเปิดดูไฟล์เหล่านี้ได้ใน "งานของฉัน"</div>
          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="text-xs bg-white border border-amber-200 rounded px-2 py-1 flex items-center justify-between">
                  <span className="truncate">📄 {f.name || f}</span>
                  <button onClick={() => remove(i)} className="text-rose-400 hover:text-rose-600 whitespace-nowrap">×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    // ===== Step 1: Manpower Requisition Form =================================
    const LEVELS = [
      // JG · Standard career grades (Entry → Senior Manager)
      { code:'JG1',  label:'Entry' },
      { code:'JG2',  label:'Jr. Entry' },
      { code:'JG3',  label:'Sr. Entry' },
      { code:'JG4',  label:'Jr. Officer' },
      { code:'JG5',  label:'Officer' },
      { code:'JG6',  label:'Sr. Officer' },
      { code:'JG7',  label:'Supervisor' },
      { code:'JG8',  label:'Asst. Manager' },
      { code:'JG9',  label:'Manager' },
      { code:'JG10', label:'Senior Manager' },
      { code:'JG11', label:'Head of Dept' },
      { code:'JG12', label:'Director' },
      { code:'JG13', label:'VP' },
      { code:'JG14', label:'SVP' },
      { code:'JG15', label:'EVP' },
      // UC · Upper executive (C-suite)
      { code:'UC1',  label:'FEVP' },
      { code:'UC2',  label:'SEVP' },
      { code:'UC3',  label:'C-Level / Pres.' },
      { code:'UC4',  label:'CEO' }
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

    function ManpowerRequestForm({ initial, candidate, user, onClose, onSave }) {
      const [form, setForm] = useState(initial ?? {
        proposed_date: today(),
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
      const [approvers, setApprovers] = useState([
        { name:'', email:'', role:'หัวหน้าต้นสังกัด' },
        { name:'', email:'', role:'HR Manager / Director' },
        { name:'', email:'', role:'MD / CEO' }
      ]);
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));
      const submit = (e) => {
        e.preventDefault();
        if (!form.jd.trim()) { showToast('กรุณากรอกหน้าที่และความรับผิดชอบ', 'warning'); return; }
        if (form.age_min !== '' && form.age_max !== '' && Number(form.age_min) > Number(form.age_max)) {
          showToast('อายุต่ำสุดต้องน้อยกว่าหรือเท่ากับอายุสูงสุด', 'warning');
          return;
        }
        if (!approvers.every(a => a.name && a.email)) { showToast('กรุณากรอกชื่อ + อีเมลผู้อนุมัติให้ครบทุกคน (หรือลบคนที่ไม่ใช้)', 'warning'); return; }
        onSave(form, approvers);
      };
      return (
        <Modal title="สร้าง Manpower Requisition Form" subtitle={`Step 1 · ${candidate.position} · ${candidate.department}`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="วันที่เสนอขอ"><input type="date" className="input" value={form.proposed_date} onChange={e => set('proposed_date', e.target.value)} /></Field>
              <Field label="ฝ่าย (Division)"><input className="input" value={form.division} onChange={e => set('division', e.target.value)} /></Field>
            </div>
            <Field label="เกรด/ระดับ" required>
              <select className="input" value={form.level} onChange={e => set('level', e.target.value)}>
                {LEVELS.map(l => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}
              </select>
            </Field>
            <Field label="หน้าที่และความรับผิดชอบ (JD เบื้องต้น)" required>
              <textarea rows={5} className="input" value={form.jd} onChange={e => set('jd', e.target.value)} placeholder="เขียน JD เป็นข้อ ๆ หรือเป็นย่อหน้า" />
            </Field>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">คุณสมบัติผู้สมัคร</div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="เพศ">
                  <select className="input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option>ไม่ระบุ</option><option>ชาย</option><option>หญิง</option>
                  </select>
                </Field>
                <Field label="อายุ (ปี)">
                  <div className="flex items-center gap-1">
                    <input type="number" min="15" max="80" className="input text-center" placeholder="ต่ำ" value={form.age_min}
                      onChange={e => set('age_min', e.target.value ? Number(e.target.value) : '')} />
                    <span className="text-slate-400">–</span>
                    <input type="number" min="15" max="80" className="input text-center" placeholder="สูง" value={form.age_max}
                      onChange={e => set('age_max', e.target.value ? Number(e.target.value) : '')} />
                  </div>
                  {form.age_min !== '' && form.age_max !== '' && Number(form.age_min) > Number(form.age_max) && (
                    <div className="text-[10px] text-rose-600 mt-1">⚠ อายุต่ำสุดต้องน้อยกว่าหรือเท่ากับอายุสูงสุด</div>
                  )}
                </Field>
                <Field label="ประสบการณ์">
                  <select className="input" value={form.experience_required} onChange={e => set('experience_required', e.target.value)}>
                    <option value="not_required">ไม่จำเป็น</option>
                    <option value="required">มีประสบการณ์</option>
                  </select>
                </Field>
              </div>
              {form.experience_required === 'required' && (
                <Field label="ประสบการณ์อย่างน้อย (ปี)">
                  <input type="number" min="0" className="input" value={form.experience_years} onChange={e => set('experience_years', Number(e.target.value))} />
                </Field>
              )}
              <Field label="วุฒิการศึกษา (เลือกได้หลายข้อ)">
                <div className="flex flex-wrap gap-2 text-xs">
                  {['ต่ำกว่า ม.6 / ปวช.','ปวส.','ปริญญาตรี','ปริญญาโท'].map(e => (
                    <label key={e} className={`px-2 py-1 rounded border cursor-pointer ${form.education.includes(e) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 text-slate-600'}`}>
                      <input type="checkbox" className="mr-1" checked={form.education.includes(e)} onChange={() => toggleArr('education', e)} />
                      {e}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="รายละเอียดเพิ่มเติม (คุณสมบัติพิเศษ)">
              <textarea rows={3} className="input" value={form.additional} onChange={e => set('additional', e.target.value)} placeholder="เช่น ใช้ภาษาอังกฤษได้ดี · มี certification เฉพาะ" />
            </Field>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">เหตุผลการขอว่าจ้าง</div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'new_plan'}    onChange={() => set('reason_type','new_plan')} /> อัตราใหม่ ตามแผนอัตรากำลังคนประจำปี</label>
                <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'new_unplanned'} onChange={() => set('reason_type','new_unplanned')} /> อัตราใหม่ นอกแผน</label>
                <label className="flex items-center gap-2"><input type="radio" name="rt" checked={form.reason_type === 'replace'}     onChange={() => set('reason_type','replace')} /> เพื่อทดแทน</label>
                {form.reason_type === 'replace' && (
                  <div className="grid grid-cols-2 gap-2 ml-6">
                    <input className="input" placeholder="ชื่อ-นามสกุล" value={form.replace_name} onChange={e => set('replace_name', e.target.value)} />
                    <select className="input" value={form.replace_reason} onChange={e => set('replace_reason', e.target.value)}>
                      <option>ลาออก</option><option>ไม่ผ่านทดลองงาน</option><option>โยกย้าย/เกษียณ</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ลักษณะการจ้างงาน</div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'monthly'} onChange={() => set('employment_type','monthly')} /> พนักงานรายเดือน</label>
                <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'daily'}   onChange={() => set('employment_type','daily')} /> พนักงานรายวัน</label>
                <label className="flex items-center gap-2"><input type="radio" name="et" checked={form.employment_type === 'contract'} onChange={() => set('employment_type','contract')} /> พนักงานรายสัญญาจ้าง</label>
                {form.employment_type === 'contract' && (
                  <div className="ml-6">
                    <input type="number" min="1" className="input" style={{maxWidth:120}} value={form.contract_months} onChange={e => set('contract_months', Number(e.target.value))} /> เดือน
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ผู้เสนอขอ (Proposer)</div>
              <div className="grid grid-cols-3 gap-2">
                <input className="input" placeholder="ชื่อ-นามสกุล" value={form.proposer_name} onChange={e => set('proposer_name', e.target.value)} />
                <input className="input" placeholder="ตำแหน่ง" value={form.proposer_position} onChange={e => set('proposer_position', e.target.value)} />
                <input className="input" placeholder="ฝ่าย" value={form.proposer_division} onChange={e => set('proposer_division', e.target.value)} />
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-indigo-800">ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล (HR กรอก)</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="วันที่รับแบบขออัตรากำลังคน">
                  <input type="date" className="input" value={form.hr_received_date} onChange={e => set('hr_received_date', e.target.value)} />
                </Field>
                <Field label="ระยะเวลาการสรรหา">
                  <select className="input" value={form.hr_duration} onChange={e => set('hr_duration', e.target.value)}>
                    <option value="30">ภายใน 30 วัน</option>
                    <option value="45">ภายใน 45 วัน</option>
                    <option value="60">ภายใน 60 วัน</option>
                  </select>
                </Field>
                <Field label="ชื่อผู้รับผิดชอบการสรรหา">
                  <input className="input" value={form.hr_recruiter_name} onChange={e => set('hr_recruiter_name', e.target.value)} placeholder="ชื่อ-นามสกุล" />
                </Field>
                <Field label="ตำแหน่ง">
                  <input className="input" value={form.hr_recruiter_position} onChange={e => set('hr_recruiter_position', e.target.value)} placeholder="เช่น HR Recruiter" />
                </Field>
              </div>
            </div>

            <ApproverList approvers={approvers} setApprovers={setApprovers} label="ผู้อนุมัติเปิดอัตรา" />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">📨 สร้างเอกสาร + ส่งอนุมัติ</button>
            </div>
          </form>
        </Modal>
      );
    }

    function ManpowerRequestDoc({ data, candidate }) {
      const levelObj = LEVELS.find(l => l.code === data.level) ?? { code: data.level, label: '' };
      return (
        <div className="print-document">
          <DocHeader step={1} candidate={candidate} />
          <div className="section-bar">ส่วนที่ 1 : สำหรับต้นสังกัดกรอกรายละเอียด</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>ตำแหน่ง</td><td className="val" style={{width:'35%'}}><b>{candidate.position}</b></td>
                  <td className="lbl" style={{width:'15%'}}>วันที่เสนอขอ</td><td className="val" style={{width:'35%'}}>{fmtDate(data.proposed_date)}</td></tr>
              <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td>
                  <td className="lbl">ฝ่าย</td><td className="val">{data.division}</td></tr>
              <tr><td className="lbl">เกรด/ระดับ</td><td className="val" colSpan="3"><b>{levelObj.code}</b> ({levelObj.label})</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>หน้าที่และความรับผิดชอบ (JD เบื้องต้น)</div>
          <div style={{ border:'1px solid #94a3b8', borderTop:'none', padding:'10px', whiteSpace:'pre-wrap', fontSize:'11px', minHeight:'120px' }}>{data.jd}</div>

          <div className="section-bar" style={{marginTop:'12px'}}>คุณสมบัติ</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl">เพศ</td><td className="val">{data.gender}</td>
                  <td className="lbl">อายุ</td><td className="val">{data.age_min && data.age_max ? `${data.age_min} – ${data.age_max} ปี` : (data.age || '—')}</td></tr>
              <tr><td className="lbl">ประสบการณ์ทำงาน</td><td className="val" colSpan="3">
                {data.experience_required === 'not_required' ? 'ไม่จำเป็น' : `${data.experience_years} ปีขึ้นไป`}
              </td></tr>
              <tr><td className="lbl">วุฒิการศึกษา</td><td className="val" colSpan="3">
                {['ต่ำกว่า ม.6 / ปวช.','ปวส.','ปริญญาตรี','ปริญญาโท'].map(e => (
                  <Cb key={e} checked={data.education.includes(e)} label={e} />
                )).reduce((acc, el, i) => [...acc, el, <span key={'s'+i} style={{marginRight:'10px'}} />], [])}
              </td></tr>
              <tr><td className="lbl">รายละเอียดเพิ่มเติม</td><td className="val" colSpan="3" style={{whiteSpace:'pre-wrap'}}>{data.additional || '—'}</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>เหตุผลการขอว่าจ้าง / ลักษณะการจ้างงาน</div>
          <div className="check-grid">
            <Cb checked={data.reason_type === 'new_plan'}      label="อัตราใหม่ ตามแผนอัตรากำลังคนประจำปี" />
            <Cb checked={data.employment_type === 'monthly'}   label="พนักงานรายเดือน" />
            <Cb checked={data.reason_type === 'new_unplanned'} label="อัตราใหม่ นอกแผน" />
            <Cb checked={data.employment_type === 'daily'}     label="พนักงานรายวัน" />
            <Cb checked={data.reason_type === 'replace'}       label={`เพื่อทดแทน ${data.reason_type === 'replace' ? `(${data.replace_name} · ${data.replace_reason})` : ''}`} />
            <Cb checked={data.employment_type === 'contract'}  label={`พนักงานรายสัญญาจ้าง ${data.employment_type === 'contract' ? `(${data.contract_months} เดือน)` : ''}`} />
          </div>

          <table className="form-table" style={{marginTop:'12px'}}>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'15%'}}>ผู้เสนอขอ</td><td className="val" style={{width:'35%'}}>{data.proposer_name}</td>
                <td className="lbl" style={{width:'15%'}}>ตำแหน่ง</td><td className="val" style={{width:'35%'}}>{data.proposer_position} · {data.proposer_division}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'18px'}}>ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล</div>
          <table className="form-table">
            <tbody>
              <tr>
                <td className="lbl" style={{width:'25%'}}>วันที่รับแบบขออัตรากำลังคน<br /><span style={{fontSize:'9px', color:'#64748b'}}>Date of Request Submission</span></td>
                <td className="val">{data.hr_received_date ? fmtDate(data.hr_received_date) : '_____ / _____ / _________'}</td>
                <td className="lbl" style={{width:'15%'}}>ระยะเวลาการสรรหา</td>
                <td className="val"><Cb checked={data.hr_duration === '30'} label="ภายใน 30 วัน" /> &nbsp;&nbsp; <Cb checked={data.hr_duration === '45'} label="ภายใน 45 วัน" /> &nbsp;&nbsp; <Cb checked={data.hr_duration === '60'} label="ภายใน 60 วัน" /></td>
              </tr>
              <tr>
                <td className="lbl">ชื่อผู้รับผิดชอบการสรรหา<br /><span style={{fontSize:'9px', color:'#64748b'}}>Recruitment Responsible Person</span></td>
                <td className="val">{data.hr_recruiter_name || '............................................................'}</td>
                <td className="lbl">ตำแหน่ง</td>
                <td className="val">{data.hr_recruiter_position || '............................................................'}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'14px'}}>ส่วนที่ 3 : สำหรับฝ่ายบริหารพิจารณาอนุมัติ</div>
          <table className="form-table">
            <tbody>
              <tr style={{ textAlign:'center' }}>
                <td className="lbl" style={{width:'33%'}}>☐ อนุมัติ</td>
                <td className="lbl" style={{width:'33%'}}>☐ ไม่อนุมัติ</td>
                <td className="lbl" style={{width:'34%'}}>☐ รอการพิจารณา</td>
              </tr>
              <tr>
                <td className="val" style={{height:'40px'}}></td>
                <td className="val"></td>
                <td className="val"></td>
              </tr>
            </tbody>
          </table>
          <SignatureBlocks
            labels={[
              { th:'ต้นสังกัด',                  en:'Requested by' },
              { th:'ผู้ตรวจสอบ (Human Resources)', en:'Approved by' },
              { th:'ผู้พิจารณา',                  en:'Approved by' },
              { th:'ผู้อนุมัติ',                  en:'Approved by' }
            ]}
            workflow={candidate.approvalWorkflows?.[1]}
          />

          <div className="section-bar" style={{marginTop:'14px'}}>ส่วนที่ 4 : ข้อเสนอแนะเพิ่มเติม</div>
          <ApproverComments workflow={candidate.approvalWorkflows?.[1]} />

          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // ===== Step 6: Interview Evaluation Form =================================
    const EVAL_CRITERIA = [
      { cat:'1. ด้านความพร้อมของผู้สมัคร', items:[
        { key:'a1', label:'ความเหมาะสมด้านบุคลิกภาพในตำแหน่งงาน' },
        { key:'a2', label:'ตรงต่อเวลาในการสัมภาษณ์งาน' }
      ]},
      { cat:'2. ทักษะการตอบคำถาม', items:[
        { key:'b1', label:'ความสามารถในการให้คำตอบตรงประเด็นกับคำถาม' },
        { key:'b2', label:'ความมั่นใจในการตอบคำถาม เช่น ชัดเจน, มั่นใจ เป็นต้น' },
        { key:'b3', label:'ความสามารถในการเข้าใจคำถาม' },
        { key:'b4', label:'ความสุภาพและทักษะในการสื่อสารอย่างมืออาชีพ' },
        { key:'b5', label:'ความรอบรู้และความเชี่ยวชาญในการตอบคำถาม' },
        { key:'b6', label:'การแสดงทัศนคติต่อลักษณะงานหรือตำแหน่งงาน' }
      ]},
      { cat:'3. ทักษะการเป็นผู้นำในระดับตำแหน่งงานของผู้สมัคร', items:[
        { key:'c1', label:'ความสามารถในการกำหนดวิสัยทัศน์และเป้าหมาย' },
        { key:'c2', label:'ความสามารถในการแก้ไขความขัดแย้งและสร้างความเข้าใจ' },
        { key:'c3', label:'ความสามารถด้านการสร้างวัฒนธรรมทีมและความร่วมเป็นอันหนึ่งเดียวกัน' }
      ]},
      { cat:'4. ความรู้และความเข้าใจในตำแหน่งงาน', items:[
        { key:'d1', label:'ความรู้และเทคนิคและความเชี่ยวชาญเฉพาะด้าน' },
        { key:'d2', label:'ความเข้าใจด้านองค์ประกอบของงานและกระบวนการทำงาน' },
        { key:'d3', label:'ความรู้ด้านการแก้ไขปัญหาในตำแหน่งงาน' }
      ]}
    ];
    const SCORE_DEFS = [
      { n:5, label:'ยอดเยี่ยม', desc:'บุคคลที่มีความรู้ ความสามารถ และพฤติกรรมที่เหนือกว่าความคาดหวังในด้านนั้น มีผลลัพธ์ที่โดดเด่น' },
      { n:4, label:'ดีมาก',     desc:'บุคคลที่มีความรู้และความสามารถที่เหนือกว่ามาตรฐานปกติ และสามารถรับมือกับความท้าทายได้ดี' },
      { n:3, label:'มาตรฐาน',   desc:'บุคคลที่มีความรู้และความสามารถในระดับมาตรฐานที่คาดหวัง สามารถทำงานได้ตามตามเกณฑ์' },
      { n:2, label:'พอใช้',     desc:'บุคคลที่มีพื้นฐานในด้านนั้น แต่ยังติดขัดหรือมีจุดที่ต้องพัฒนาเพิ่มเติม เพื่อให้ทำงานได้ตามมาตรฐาน' },
      { n:1, label:'น้อยมาก',   desc:'บุคคลนี้ขาดความรู้ ทักษะ ความสามารถและยังไม่สามารถตอบสนองความต้องการขั้นพื้นฐานได้' }
    ];

    function ScorecardForm({ initial, candidate, user, onClose, onSave }) {
      const allKeys = EVAL_CRITERIA.flatMap(c => c.items.map(i => i.key));
      const defaultScores = Object.fromEntries(allKeys.map(k => [k, 3]));
      const [form, setForm] = useState(initial ?? {
        candidate_name: candidate.name ?? '',
        interview_date: today(),
        level: 'JG5',
        division: candidate.department,
        edu_match: 'match',
        exp_match: 'match',
        job_change: 'stable',
        residence: 'near',
        scores: defaultScores,
        summary: '',
        probation_goals: '',
        conclusion: 'hire',
        conclusion_other_position: '',
        interviewer_name: user?.name ?? '',
        interviewer_position: '',
        interviewer_division: ''
      });
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const setScore = (k, v) => setForm(f => ({ ...f, scores: { ...f.scores, [k]:v } }));
      const submit = (e) => {
        e.preventDefault();
        onSave(form);
        showToast('สร้าง Interview Evaluation Form เรียบร้อย', 'success');
      };
      return (
        <Modal title="สร้าง Interview Evaluation Form" subtitle={`Step 4 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
              💡 <b>HR กรอกแค่ข้อมูลพื้นฐานผู้สมัคร</b> → กด "สร้างเอกสาร" → มอบหมายผู้ประเมิน (ใส่อีเมล = username) · <b>ผู้ประเมินเข้าระบบให้คะแนน + เขียนความเห็นใน "งานของฉัน" เอง</b> (ส่วนที่ 3–6)
            </div>

            {/* ส่วนที่ 1: ข้อมูลผู้สมัคร */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ส่วนที่ 1: ข้อมูลผู้สมัคร</div>
              <Field label="ชื่อ-นามสกุล candidate" required>
                <input className="input" value={form.candidate_name} onChange={e => set('candidate_name', e.target.value)} placeholder="เช่น คุณวรรณกร พิภพไชย" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="วันที่สัมภาษณ์"><input type="date" className="input" value={form.interview_date} onChange={e => set('interview_date', e.target.value)} /></Field>
                <Field label="ระดับ"><select className="input" value={form.level} onChange={e => set('level', e.target.value)}>{LEVELS.map(l => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}</select></Field>
              </div>
              <Field label="ฝ่าย"><input className="input" value={form.division} onChange={e => set('division', e.target.value)} /></Field>
            </div>

            {/* ส่วนที่ 3–6 (คะแนน · บทสรุป · ข้อสรุป · ผู้สัมภาษณ์) = ผู้ประเมินกรอกใน "งานของฉัน" */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
              <span className="text-base">⭐</span>
              <div>ส่วนที่ 3–6 (ให้คะแนน 14 หัวข้อ · บทสรุป · เป้าหมายทดลองงาน · ข้อสรุปจ้าง/ไม่จ้าง · ผู้สัมภาษณ์) — <b>ผู้ประเมินที่ถูกมอบหมายจะเข้ามากรอกเองใน "งานของฉัน"</b> ไม่ต้องกรอกตรงนี้</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึก & สร้างเอกสาร</button>
            </div>
          </form>
        </Modal>
      );
    }

    // ===== Evaluator side: full interview scorecard (filled in "งานของฉัน") =====
    // HR seeds section 1; the assigned evaluator scores the 14 criteria, writes
    // the summary/goals/conclusion, fills interviewer info AND signs.
    function ScorecardEvalForm({ initial, candidate, user, onClose, onSave }) {
      const allKeys = EVAL_CRITERIA.flatMap(c => c.items.map(i => i.key));
      const blankScores = Object.fromEntries(allKeys.map(k => [k, 0]));
      const seed = initial ?? {};
      const [form, setForm] = useState({
        candidate_name: seed.candidate_name ?? candidate.name ?? '',
        interview_date: seed.interview_date ?? today(),
        level: seed.level ?? 'JG5',
        division: seed.division ?? candidate.department,
        edu_match: seed.edu_match ?? 'match',
        exp_match: seed.exp_match ?? 'match',
        job_change: seed.job_change ?? 'stable',
        residence: seed.residence ?? 'near',
        scores: seed.scores ?? blankScores,
        summary: seed.summary ?? '',
        probation_goals: seed.probation_goals ?? '',
        conclusion: seed.conclusion ?? '',
        conclusion_other_position: seed.conclusion_other_position ?? '',
        interviewer_name: seed.interviewer_name ?? user?.name ?? '',
        interviewer_position: seed.interviewer_position ?? '',
        interviewer_division: seed.interviewer_division ?? '',
        signature_data: seed.signature_data ?? null,
      });
      const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
      const setScore = (k, v) => setForm(f => ({ ...f, scores: { ...f.scores, [k]: v } }));
      const allScored = allKeys.every(k => (form.scores[k] ?? 0) >= 1);
      const CONCLUSIONS = [
        { v:'hire', label:'สมควรจ้าง' },
        { v:'hold', label:'ไม่เหมาะสมในขณะนี้ · เก็บข้อมูลไว้พิจารณาต่อไป' },
        { v:'interview_again', label:'เห็นควรให้สัมภาษณ์อีกครั้ง' },
        { v:'no', label:'ไม่เหมาะสม' },
        { v:'other_position', label:'เหมาะสมสำหรับตำแหน่งอื่น' },
      ];
      const submit = (e) => {
        e.preventDefault();
        if (!allScored) { showToast('กรุณาให้คะแนนให้ครบทุกหัวข้อ (14 ข้อ)', 'warning'); return; }
        if (!form.conclusion) { showToast('กรุณาเลือกข้อสรุป (ส่วนที่ 6)', 'warning'); return; }
        if (!form.interviewer_name.trim()) { showToast('กรุณากรอกชื่อผู้ประเมิน', 'warning'); return; }
        if (!form.signature_data) { showToast('กรุณาลงลายเซ็นก่อนส่ง', 'warning'); return; }
        onSave(form);
      };
      const scoredCount = allKeys.filter(k => (form.scores[k] ?? 0) >= 1).length;
      return (
        <Modal title="แบบประเมินการสัมภาษณ์ · ผู้ประเมินกรอก" subtitle={`${candidate.name || candidate.position} · ให้คะแนน + สรุป + ลงนาม`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            {/* ส่วนที่ 1 — ล็อก: ข้อมูลจาก HR แก้ไขไม่ได้ */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">ส่วนที่ 1 : ข้อมูลผู้สมัคร <span className="text-[10px] font-normal text-slate-400">🔒 ข้อมูลจาก HR · แก้ไขไม่ได้</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div><div className="text-slate-500 mb-0.5">ชื่อ-นามสกุล</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{form.candidate_name || '—'}</div></div>
                <div><div className="text-slate-500 mb-0.5">วันที่สัมภาษณ์</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{fmtDate(form.interview_date)}</div></div>
                <div><div className="text-slate-500 mb-0.5">ฝ่าย</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{form.division || '—'}</div></div>
              </div>
            </div>

            {/* ส่วนที่ 3 : ให้คะแนน */}
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-700">ส่วนที่ 3 : การประเมิน <span className="font-normal text-slate-400">(5=ยอดเยี่ยม · 1=น้อยมาก)</span></div>
                <div className={`text-[11px] ${allScored ? 'text-emerald-600' : 'text-amber-600'}`}>{scoredCount}/{allKeys.length} ข้อ</div>
              </div>
              {EVAL_CRITERIA.map(cat => (
                <div key={cat.cat} className="mb-2">
                  <div className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">{cat.cat}</div>
                  {cat.items.map(it => (
                    <div key={it.key} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100">
                      <span className="text-xs flex-1 min-w-0">{it.label}</span>
                      <div className="flex gap-1 shrink-0">
                        {[5,4,3,2,1].map(n => (
                          <button type="button" key={n} onClick={() => setScore(it.key, n)}
                            className={`w-7 h-7 rounded text-xs font-semibold ibtn ${form.scores[it.key] === n ? 'bg-violet-600 text-white' : 'bg-white border border-slate-300 text-slate-500 hover:border-violet-400'}`}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* ส่วนที่ 4 */}
            <div>
              <label className="text-xs font-medium text-slate-600">ส่วนที่ 4 : บทสรุปการประเมินศักยภาพ</label>
              <textarea rows={3} maxLength={350} className="input mt-1" value={form.summary} onChange={e => set('summary', e.target.value.slice(0, 350))} placeholder="จุดแข็ง · จุดที่ต้องพัฒนา · ความเหมาะสมโดยรวม" />
              <div className={`text-[10px] text-right mt-0.5 ${form.summary.length >= 350 ? 'text-amber-600' : 'text-slate-400'}`}>{form.summary.length}/350</div>
            </div>
            {/* ส่วนที่ 5 */}
            <div>
              <label className="text-xs font-medium text-slate-600">ส่วนที่ 5 : เป้าหมายช่วงทดลองงาน</label>
              <textarea rows={3} maxLength={350} className="input mt-1" value={form.probation_goals} onChange={e => set('probation_goals', e.target.value.slice(0, 350))} placeholder="เป้าหมาย/ตัวชี้วัดที่คาดหวังในช่วงทดลองงาน" />
              <div className={`text-[10px] text-right mt-0.5 ${form.probation_goals.length >= 350 ? 'text-amber-600' : 'text-slate-400'}`}>{form.probation_goals.length}/350</div>
            </div>

            {/* ส่วนที่ 6 : ข้อสรุป */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">ส่วนที่ 6 : ข้อสรุป</div>
              <div className="space-y-1">
                {CONCLUSIONS.map(c => (
                  <label key={c.v} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" name="conclusion" checked={form.conclusion === c.v} onChange={() => set('conclusion', c.v)} />
                    {c.label}
                  </label>
                ))}
              </div>
              {form.conclusion === 'other_position' && (
                <input className="input mt-2" value={form.conclusion_other_position} onChange={e => set('conclusion_other_position', e.target.value)} placeholder="ระบุตำแหน่งที่เหมาะสม" />
              )}
            </div>

            {/* ผู้ประเมิน */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ผู้สัมภาษณ์ / ผู้ประเมิน</div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="ชื่อ" required><input className="input" value={form.interviewer_name} onChange={e => set('interviewer_name', e.target.value)} /></Field>
                <Field label="ตำแหน่ง"><input className="input" value={form.interviewer_position} onChange={e => set('interviewer_position', e.target.value)} /></Field>
                <Field label="ฝ่าย"><input className="input" value={form.interviewer_division} onChange={e => set('interviewer_division', e.target.value)} /></Field>
              </div>
            </div>

            {/* ลายเซ็น */}
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">✍️ ลายเซ็นผู้ประเมิน <span className="font-normal text-rose-500">*จำเป็น</span></div>
              <SignaturePad onChange={(d) => set('signature_data', d)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg ibtn">✓ ส่งผลประเมิน + ลงนาม</button>
            </div>
          </form>
        </Modal>
      );
    }

    function ScorecardDoc({ data, candidate }) {
      const levelObj = LEVELS.find(l => l.code === data.level) ?? { code:data.level, label:'' };
      return (
        <div className="print-document">
          <DocHeader step={4} candidate={candidate} />

          {/* Big prominent position/dept banner */}
          <div style={{ background:'#0f172a', color:'white', padding:'12px 16px', borderRadius:'4px', marginBottom:'10px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:'10px', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.5px' }}>ตำแหน่งที่สัมภาษณ์ · Position</div>
              <div style={{ fontSize:'18px', fontWeight:700 }}>{candidate.position}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'10px', opacity:0.7, textTransform:'uppercase', letterSpacing:'0.5px' }}>แผนก · ฝ่าย · Department · Division</div>
              <div style={{ fontSize:'14px', fontWeight:600 }}>{candidate.department} · {data.division}</div>
              {levelObj.code && <div style={{ fontSize:'11px', opacity:0.85 }}>ระดับ {levelObj.code} ({levelObj.label})</div>}
            </div>
          </div>

          <div className="section-bar">ส่วนที่ 1 : สำหรับข้อมูลผู้สมัคร</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>ชื่อ-นามสกุล</td><td className="val" colSpan="3"><b style={{fontSize:'14px'}}>{data.candidate_name || candidate.name || '(ยังไม่ระบุ)'}</b></td></tr>
              <tr><td className="lbl">วันที่สัมภาษณ์</td><td className="val" colSpan="4">{fmtDate(data.interview_date)}</td></tr>
              <tr><td className="lbl">การศึกษา</td><td className="val" colSpan="4">
                <Cb checked={data.edu_match === 'match'} label="ตรงตามสายงาน" /> &nbsp;&nbsp;
                <Cb checked={data.edu_match === 'no_match'} label="ไม่ตรงตามสายงาน" />
              </td></tr>
              <tr><td className="lbl">ประสบการณ์</td><td className="val" colSpan="4">
                <Cb checked={data.exp_match === 'match'} label="ตรงตามสายงาน" /> &nbsp;&nbsp;
                <Cb checked={data.exp_match === 'no_match'} label="ไม่ตรงตามสายงาน" />
              </td></tr>
              <tr><td className="lbl">ประวัติการเปลี่ยนงาน</td><td className="val" colSpan="4">
                <Cb checked={data.job_change === 'stable'} label="ไม่ค่อยเปลี่ยนงาน (เฉลี่ย ≥ 3 ปี)" /> &nbsp;&nbsp;
                <Cb checked={data.job_change === 'frequent'} label="เปลี่ยนงานบ่อย (1-2 ปี)" />
              </td></tr>
              <tr><td className="lbl">ที่พัก</td><td className="val" colSpan="4">
                <Cb checked={data.residence === 'near'} label="ใกล้ที่ทำงาน (≤ 10 กม.)" /> &nbsp;&nbsp;
                <Cb checked={data.residence === 'far'} label="ไกลที่ทำงาน (> 10 กม.)" />
              </td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 2 : คำนิยามการระบุคะแนน</div>
          <table className="form-table">
            <tbody>
              {SCORE_DEFS.map(s => (
                <tr key={s.n}><td className="lbl" style={{width:'10%', textAlign:'center'}}><b>{s.n}</b></td>
                  <td className="lbl" style={{width:'15%'}}>{s.label}</td>
                  <td className="val" style={{fontSize:'11px'}}>{s.desc}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 3 : การประเมินผู้สัมภาษณ์</div>
          <table className="form-table">
            <thead>
              <tr style={{background:'#e2e8f0'}}>
                <td className="lbl" style={{width:'55%'}}>หัวข้อการประเมิน</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>ยอดเยี่ยม</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>ดีมาก</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>มาตรฐาน</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>พอใช้</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>น้อยมาก</td>
              </tr>
            </thead>
            <tbody>
              {EVAL_CRITERIA.map(cat => (
                <React.Fragment key={cat.cat}>
                  <tr><td colSpan="6" style={{background:'#f1f5f9', padding:'4px 8px', fontWeight:600, fontSize:'11px'}}>{cat.cat}</td></tr>
                  {cat.items.map(it => (
                    <tr key={it.key}>
                      <td className="val" style={{fontSize:'11px', paddingLeft:'16px'}}>• {it.label}</td>
                      {[5,4,3,2,1].map(n => (
                        <td key={n} className="val" style={{textAlign:'center'}}>{data.scores[it.key] === n ? '✓' : ''}</td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {/* ===== PAGE 2 : typed sections + signature (forced page break in print) ===== */}
          <div className="sc-page2">
          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 4 : บทสรุปการประเมินศักยภาพ</div>
          <div style={{ border:'1px solid #94a3b8', borderTop:'none', minHeight:'80px', padding:'10px', whiteSpace:'pre-wrap', fontSize:'11px' }}>{data.summary || ''}</div>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 5 : เป้าหมายการวัดผลการปฏิบัติงานในช่วงทดลองงาน</div>
          <div style={{ border:'1px solid #94a3b8', borderTop:'none', minHeight:'80px', padding:'10px', whiteSpace:'pre-wrap', fontSize:'11px' }}>{data.probation_goals || ''}</div>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 6 : ข้อสรุป</div>
          <div className="check-grid">
            <Cb checked={data.conclusion === 'hire'}              label="สมควรจ้าง" />
            <Cb checked={data.conclusion === 'hold'}              label="ไม่เหมาะสมในขณะนี้ ควรเก็บข้อมูลไว้พิจารณาต่อไป" />
            <Cb checked={data.conclusion === 'interview_again'}   label="เห็นควรให้มีการสัมภาษณ์อีกครั้ง" />
            <Cb checked={data.conclusion === 'no'}                label="ไม่เหมาะสม" />
            <Cb checked={data.conclusion === 'other_position'}    label={`เหมาะสมสำหรับตำแหน่งอื่น ${data.conclusion === 'other_position' ? `(${data.conclusion_other_position})` : '(กรุณาระบุ ...........................)'}`} />
          </div>

          <table className="form-table" style={{marginTop:'14px'}}>
            <tbody>
              <tr>
                <td className="lbl" style={{width:'15%'}}>ผู้สัมภาษณ์<br /><span style={{fontSize:'9px', color:'#64748b'}}>Interviewers</span></td>
                <td className="val" style={{width:'35%'}}>{data.interviewer_name}</td>
                <td className="lbl" style={{width:'15%'}}>ตำแหน่ง<br /><span style={{fontSize:'9px', color:'#64748b'}}>Position Name</span></td>
                <td className="val" style={{width:'20%'}}>{data.interviewer_position}</td>
                <td className="lbl" style={{width:'5%'}}>ฝ่าย<br /><span style={{fontSize:'9px', color:'#64748b'}}>Division</span></td>
                <td className="val" style={{width:'10%'}}>{data.interviewer_division}</td>
              </tr>
            </tbody>
          </table>

          {/* Evaluator digital signature (captured when filling in "งานของฉัน") */}
          <div style={{ marginTop:'14px', border:'1px solid #94a3b8', padding:'10px', minHeight:'90px', display:'flex', flexDirection:'column', breakInside:'avoid', pageBreakInside:'avoid' }}>
            <div className="sig-label">ผู้ประเมิน / ผู้สัมภาษณ์</div>
            <div className="sig-label-en">Evaluator</div>
            {data.signature_data
              ? <DigitalSignatureMark approver={{ name: data.interviewer_name, role: data.interviewer_position, signedAt: data.signedAt || today(), ip: data.signature_ip || '-', signature_data: data.signature_data }} />
              : <div className="sig-line">ลงชื่อ ...........................................<br />({data.interviewer_name || '..............................'})</div>}
          </div>
          </div>{/* /sc-page2 */}

          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // ===== Step 6: Employee Recruitment Approval Form ========================
    function ApprovalForm({ initial, candidate, user, onClose, onSave }) {
      const [form, setForm] = useState(initial ?? {
        division: candidate.department,
        start_date: addDays(today(), 14),
        end_probation_date: addDays(today(), 14 + 120),
        level: 'JG5',
        salary_current: '',
        salary_new: '',
        salary_post_probation: '',
        allowance_items: [],
        remarks: '',
        reason_type: 'new', replace_name: '', replace_reason: 'ลาออก',
        employment_type: 'monthly', contract_months: 12, contract_start: today(),
        necessities: ['ขยายสายงานหรือแผนกใหม่'],
        hr_received_date: '',
        hr_duration: '30',
        hr_recruiter_name: user?.name ?? '',
        hr_recruiter_position: 'HR Recruiter',
        attachments: initial?.attachments ?? []
      });
      const [approvers, setApprovers] = useState([
        { name:'', email:'', role:'หัวหน้าต้นสังกัด' },
        { name:'', email:'', role:'HR Manager' },
        { name:'', email:'', role:'CFO' },
        { name:'', email:'', role:'CEO' }
      ]);
      const apprFileRef = useRef(null);
      const [uploadingAtt, setUploadingAtt] = useState(false);
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const addAttachments = async (e) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        if (!picked.length) return;
        setUploadingAtt(true);
        try {
          const uploaded = [];
          for (const f of picked) {
            const meta = await uploadFile(candidate.id, 5, f);  // real upload -> {path,name,size}
            uploaded.push({ name: meta.name, path: meta.path, size: meta.size });
          }
          set('attachments', [...(form.attachments || []), ...uploaded]);
          showToast(`แนบเอกสาร ${uploaded.length} ไฟล์เรียบร้อย`, 'success');
        } catch (err) {
          showToast('อัปโหลดไม่สำเร็จ: ' + (err?.message || ''), 'warning');
        } finally {
          setUploadingAtt(false);
        }
      };
      const removeAttachment = (i) => set('attachments', (form.attachments || []).filter((_, j) => j !== i));
      const toggleArr = (k, v) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

      const totalIncome = (parseMoney(form.salary_new) || 0)
        + (form.allowance_items || []).reduce((s, it) => s + (parseMoney(it.amount) || 0), 0);

      const submit = (e) => {
        e.preventDefault();
        if (!form.salary_new?.trim()) { showToast('กรุณากรอกเงินเดือนใหม่', 'warning'); return; }
        if (!approvers.every(a => a.name && a.email)) { showToast('กรุณากรอกชื่อ + อีเมลผู้อนุมัติให้ครบทุกคน', 'warning'); return; }
        onSave({ ...form, total_income: totalIncome }, approvers);
      };

      return (
        <Modal title="สร้าง Recruitment Approval Form" subtitle={`Step 5 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="ฝ่าย"><input className="input" value={form.division} onChange={e => set('division', e.target.value)} /></Field>
              <Field label="วันเริ่มงาน" required><input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
              <Field label="วันที่ครบทดลองงาน"><input type="date" className="input" value={form.end_probation_date} onChange={e => set('end_probation_date', e.target.value)} /></Field>
            </div>

            <Field label="เกรด/ระดับ" required>
              <select className="input" value={form.level} onChange={e => set('level', e.target.value)}>
                {LEVELS.map(l => <option key={l.code} value={l.code}>{l.code} ({l.label})</option>)}
              </select>
            </Field>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ค่าจ้างและค่าตอบแทน</div>
              <Field label="เงินเดือนใหม่ (ตามอัตราที่จะจ้าง)" required>
                <input className="input" value={form.salary_new} onChange={e => set('salary_new', e.target.value)} placeholder="เช่น 30,000" />
              </Field>
              <Field label="เงินเดือนปัจจุบัน (ถ้ามี — เช่น พนักงาน internal transfer)">
                <input className="input" value={form.salary_current} onChange={e => set('salary_current', e.target.value)} placeholder="เช่น 28,000 · หรือเว้นว่างถ้าเป็นอัตราใหม่" />
              </Field>
              <Field label="เงินเดือนหลังผ่านทดลองงาน (ถ้ามีการปรับ)">
                <input className="input" value={form.salary_post_probation} onChange={e => set('salary_post_probation', e.target.value)} placeholder="เช่น 32,000 · หรือเว้นว่างถ้าไม่ปรับ" />
              </Field>

              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-semibold text-slate-700">ค่าตอบแทนอื่น ๆ (เพิ่มทีละรายการ)</div>
                  <button type="button" onClick={() => set('allowance_items', [...(form.allowance_items||[]), { label:'', amount:'' }])}
                          className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white">+ เพิ่มรายการ</button>
                </div>
                {(form.allowance_items||[]).length > 10 && (
                  <div className="text-[10px] text-amber-600 mb-1">⚠️ มี {(form.allowance_items||[]).length} รายการ · เอกสารจะต่อไปหน้า 2 อัตโนมัติ (แถวไม่ขาด เส้นครบ)</div>
                )}
                {(form.allowance_items||[]).length === 0 && (
                  <div className="text-xs text-slate-400 italic py-1">ยังไม่มีรายการ — กด "+ เพิ่มรายการ" เพื่อเพิ่ม เช่น ค่าตำแหน่ง · ค่าเดินทาง · ค่าโทรศัพท์</div>
                )}
                {(form.allowance_items||[]).map((it, i) => (
                  <div key={i} className="grid items-center gap-2 mb-1" style={{ gridTemplateColumns: '1fr 110px auto auto' }}>
                    <input className="input text-xs" placeholder="ชื่อรายการ เช่น ค่าเดินทาง · ค่าอาหาร" value={it.label}
                           onChange={e => set('allowance_items', form.allowance_items.map((x,j) => j===i ? {...x, label:e.target.value} : x))} />
                    <input type="number" className="input text-xs text-right" placeholder="จำนวนเงิน" value={it.amount}
                           onChange={e => set('allowance_items', form.allowance_items.map((x,j) => j===i ? {...x, amount:e.target.value} : x))} />
                    <span className="text-xs text-slate-400">บาท</span>
                    <button type="button" onClick={() => set('allowance_items', form.allowance_items.filter((_,j) => j!==i))}
                            className="text-rose-500 hover:text-rose-700 text-sm px-1">✕</button>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-700">รวมรายได้ทั้งหมด (เงินเดือนใหม่ + ค่าตอบแทน)</div>
                  <div className="text-sm font-bold text-emerald-700">{fmtMoney(totalIncome)} บาท / เดือน</div>
                </div>
              </div>
            </div>

            <Field label="หมายเหตุ">
              <textarea rows={2} className="input" value={form.remarks} onChange={e => set('remarks', e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-slate-700">เหตุผลการขอว่าจ้าง</div>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="rt2" checked={form.reason_type === 'new'} onChange={() => set('reason_type','new')} /> อัตราใหม่</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="rt2" checked={form.reason_type === 'replace'} onChange={() => set('reason_type','replace')} /> เพื่อทดแทนพนักงาน</label>
                {form.reason_type === 'replace' && (
                  <div className="space-y-1 ml-6">
                    <input className="input text-xs" placeholder="ชื่อพนักงาน" value={form.replace_name} onChange={e => set('replace_name', e.target.value)} />
                    <select className="input text-xs" value={form.replace_reason} onChange={e => set('replace_reason', e.target.value)}>
                      <option>ลาออก</option><option>โยกย้าย</option><option>อื่น ๆ</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-slate-700">ลักษณะการจ้างงาน</div>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'monthly'} onChange={() => set('employment_type','monthly')} /> พนักงานรายเดือน</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'daily'} onChange={() => set('employment_type','daily')} /> พนักงานรายวัน</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="et2" checked={form.employment_type === 'contract'} onChange={() => set('employment_type','contract')} /> พนักงานรายสัญญาจ้าง</label>
                {form.employment_type === 'contract' && (
                  <div className="ml-6 grid grid-cols-2 gap-1">
                    <input type="number" className="input text-xs" placeholder="เดือน" value={form.contract_months} onChange={e => set('contract_months', Number(e.target.value))} />
                    <input type="date" className="input text-xs" value={form.contract_start} onChange={e => set('contract_start', e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-indigo-800">ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล (HR กรอก)</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="วันที่รับแบบขออนุมัติรับพนักงาน">
                  <input type="date" className="input" value={form.hr_received_date} onChange={e => set('hr_received_date', e.target.value)} />
                </Field>
                <Field label="ระยะเวลาการสรรหา">
                  <select className="input" value={form.hr_duration} onChange={e => set('hr_duration', e.target.value)}>
                    <option value="30">ภายใน 30 วัน</option>
                    <option value="45">ภายใน 45 วัน</option>
                    <option value="60">ภายใน 60 วัน</option>
                  </select>
                </Field>
                <Field label="ชื่อผู้รับผิดชอบการสรรหา">
                  <input className="input" value={form.hr_recruiter_name} onChange={e => set('hr_recruiter_name', e.target.value)} placeholder="ชื่อ-นามสกุล" />
                </Field>
                <Field label="ตำแหน่ง">
                  <input className="input" value={form.hr_recruiter_position} onChange={e => set('hr_recruiter_position', e.target.value)} placeholder="เช่น HR Recruiter" />
                </Field>
              </div>
            </div>

            {/* เอกสารแนบ — เป็นชุดเดียวกับเอกสารอนุมัติ · ส่งให้ผู้อนุมัติพร้อมกัน */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700">📎 เอกสารแนบประกอบการพิจารณา (ส่งพร้อมเอกสารอนุมัติ)</div>
                <button type="button" onClick={() => apprFileRef.current?.click()} disabled={uploadingAtt} className="text-xs bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-2.5 py-1 rounded ibtn whitespace-nowrap">{uploadingAtt ? 'กำลังอัปโหลด…' : '+ แนบเอกสาร'}</button>
                <input ref={apprFileRef} type="file" multiple hidden onChange={addAttachments} />
              </div>
              <div className="text-[10px] text-slate-500">เช่น resume · scorecard สัมภาษณ์ · ประวัติเงินเดือน · ผลตรวจอ้างอิง — ผู้อนุมัติเปิดดูได้ตอนพิจารณาเซ็น</div>
              {(form.attachments || []).length > 0 ? (
                <ul className="space-y-1">
                  {form.attachments.map((f, i) => (
                    <li key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 flex items-center justify-between">
                      <span className="truncate">📄 {f.name || f}</span>
                      <button type="button" onClick={() => removeAttachment(i)} className="text-rose-400 hover:text-rose-600 whitespace-nowrap">×</button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[11px] text-slate-400 italic text-center py-1">ยังไม่มีเอกสารแนบ · กด "+ แนบเอกสาร"</div>
              )}
            </div>

            <ApproverList approvers={approvers} setApprovers={setApprovers} label="ผู้อนุมัติรับพนักงาน" />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">📨 สร้างเอกสาร + ส่งอนุมัติ</button>
            </div>
          </form>
        </Modal>
      );
    }

    function ApprovalDoc({ data, candidate }) {
      const levelObj = LEVELS.find(l => l.code === data.level) ?? { code: data.level || '—', label: '' };
      const allowances = data.allowance_items || [];
      const allowanceSum = allowances.reduce((s, it) => s + parseMoney(it.amount), 0);
      const totalIncome = (data.total_income != null) ? data.total_income : (parseMoney(data.salary_new) + allowanceSum);
      return (
        <div className="print-document">
          <DocHeader step={5} candidate={candidate} />
          <div className="section-bar">ส่วนที่ 1 : ข้อมูลพนักงาน</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>ชื่อพนักงาน</td><td className="val" style={{width:'35%'}}><b>{candidate.name || '(ยังไม่ระบุ)'}</b></td>
                  <td className="lbl" style={{width:'15%'}}>ตำแหน่ง</td><td className="val" style={{width:'35%'}}>{candidate.position}</td></tr>
              <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td>
                  <td className="lbl">ฝ่าย</td><td className="val">{data.division}</td></tr>
              <tr><td className="lbl">วันเริ่มงาน</td><td className="val">{fmtDate(data.start_date)}</td>
                  <td className="lbl">วันที่ครบทดลองงาน</td><td className="val">{fmtDate(data.end_probation_date)}</td></tr>
            </tbody>
          </table>

          <table className="form-table" style={{marginTop:'8px'}}>
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>เกรด/ระดับ</td><td className="val" colSpan="3"><b>{levelObj.code}</b> {levelObj.label ? `(${levelObj.label})` : ''}</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>ค่าจ้างและค่าตอบแทน</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'40%'}}>เงินเดือนปัจจุบัน</td><td className="val" style={{textAlign:'right'}}>{data.salary_current ? `${fmtMoney(parseMoney(data.salary_current))} บาท` : '—'}</td></tr>
              <tr><td className="lbl">เงินเดือนใหม่</td><td className="val" style={{textAlign:'right'}}><b>{data.salary_new ? `${fmtMoney(parseMoney(data.salary_new))} บาท` : '—'}</b></td></tr>
              {allowances.filter(it => it.label || it.amount).map((it, i) => (
                <tr key={i}><td className="lbl" style={{fontWeight:'normal'}}>+ {it.label || 'ค่าตอบแทน'}</td><td className="val" style={{textAlign:'right'}}>{fmtMoney(parseMoney(it.amount))} บาท</td></tr>
              ))}
              <tr style={{background:'#f1f5f9'}}><td className="lbl"><b>รวมรายได้ทั้งหมด / เดือน</b></td><td className="val" style={{textAlign:'right'}}><b>{fmtMoney(totalIncome)} บาท</b></td></tr>
              <tr><td className="lbl">เงินเดือนหลังผ่านทดลองงาน</td><td className="val" style={{textAlign:'right'}}>{data.salary_post_probation ? `${fmtMoney(parseMoney(data.salary_post_probation))} บาท` : '—'}</td></tr>
              {data.remarks && <tr><td className="lbl">หมายเหตุ</td><td className="val" style={{whiteSpace:'pre-wrap', textAlign:'left'}}>{data.remarks}</td></tr>}
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>เหตุผลการขอว่าจ้าง · ลักษณะการจ้างงาน</div>
          <div className="check-grid">
            <Cb checked={data.reason_type === 'new'}     label="อัตราใหม่" />
            <Cb checked={data.employment_type === 'monthly'} label="พนักงานรายเดือน" />
            <Cb checked={data.reason_type === 'replace'} label={`เพื่อทดแทนพนักงาน ${data.reason_type === 'replace' ? `(${data.replace_name} · ${data.replace_reason})` : ''}`} />
            <Cb checked={data.employment_type === 'daily'} label="พนักงานรายวัน" />
            <span></span>
            <Cb checked={data.employment_type === 'contract'} label={`พนักงานรายสัญญาจ้าง ${data.employment_type === 'contract' ? `(${data.contract_months} เดือน · เริ่ม ${fmtDate(data.contract_start)})` : ''}`} />
          </div>

          <div className="section-bar" style={{marginTop:'18px'}}>ส่วนที่ 2 : สำหรับฝ่ายบริหารทรัพยากรบุคคล</div>
          <table className="form-table">
            <tbody>
              <tr>
                <td className="lbl" style={{width:'25%'}}>วันที่รับแบบขออนุมัติรับพนักงาน</td>
                <td className="val">{data.hr_received_date ? fmtDate(data.hr_received_date) : '_____ / _____ / _________'}</td>
                <td className="lbl" style={{width:'15%'}}>ระยะเวลาการสรรหา</td>
                <td className="val"><Cb checked={data.hr_duration === '30'} label="ภายใน 30 วัน" /> &nbsp; <Cb checked={data.hr_duration === '45'} label="ภายใน 45 วัน" /> &nbsp; <Cb checked={data.hr_duration === '60'} label="ภายใน 60 วัน" /></td>
              </tr>
              <tr>
                <td className="lbl">ชื่อผู้รับผิดชอบการสรรหา</td>
                <td className="val">{data.hr_recruiter_name || '..............................................................'}</td>
                <td className="lbl">ตำแหน่ง</td>
                <td className="val">{data.hr_recruiter_position || '..............................................................'}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'14px'}}>ส่วนที่ 3 : สำหรับฝ่ายบริหารพิจารณาอนุมัติ</div>
          <table className="form-table">
            <tbody>
              <tr style={{ textAlign:'center' }}>
                <td className="lbl" style={{width:'33%'}}>☐ อนุมัติ</td>
                <td className="lbl" style={{width:'33%'}}>☐ ไม่อนุมัติ</td>
                <td className="lbl" style={{width:'34%'}}>☐ รอการพิจารณา</td>
              </tr>
              <tr><td className="val" style={{height:'40px'}}></td><td className="val"></td><td className="val"></td></tr>
            </tbody>
          </table>
          {(data.attachments || []).length > 0 && (
            <>
              <div className="section-bar" style={{marginTop:'14px'}}>เอกสารแนบประกอบการพิจารณา</div>
              <div style={{ border:'1px solid #94a3b8', borderTop:'none', padding:'8px 12px', fontSize:'11px' }}>
                {data.attachments.map((n, i) => <div key={i}>📎 {n.name || n}</div>)}
              </div>
            </>
          )}
          <SignatureBlocks
            labels={[
              { th:'ผู้ร้องขอ',  en:'Requested by' },
              { th:'ผู้ตรวจสอบ', en:'Verified by' },
              { th:'ผู้พิจารณา', en:'Approved by' },
              { th:'ผู้อนุมัติ',  en:'Approved by' }
            ]}
            workflow={candidate.approvalWorkflows?.[5]}
          />

          <div className="section-bar" style={{marginTop:'14px'}}>ส่วนที่ 4 : ข้อเสนอแนะเพิ่มเติม (ฝ่ายบริหาร)</div>
          <ApproverComments workflow={candidate.approvalWorkflows?.[5]} />

          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // ===== Step 8: Probation Evaluation Form =================================
    const PROB_CRITERIA = [
      { section:'1. เรื่องเวลาการเข้างาน (Time & Attendance)', items:[
        { key:'t1', label:'ตรงต่อเวลาในการมาทำงาน · ไม่มาสาย' },
        { key:'t2', label:'จำนวนวันลา/ขาด อยู่ในระดับยอมรับได้' },
        { key:'t3', label:'ปฏิบัติตามเวลาพักและเลิกงาน' },
        { key:'t4', label:'แจ้งล่วงหน้าเมื่อต้องลา' }
      ]},
      { section:'2. เรื่องการทำงาน (Work Performance)', items:[
        { key:'w1', label:'ความรู้และทักษะตามตำแหน่ง' },
        { key:'w2', label:'คุณภาพงาน · ความถูกต้องและละเอียดรอบคอบ' },
        { key:'w3', label:'ปริมาณงานที่ทำได้ในแต่ละช่วงเวลา' },
        { key:'w4', label:'การทำงานร่วมกับทีม · มนุษยสัมพันธ์' },
        { key:'w5', label:'ความรับผิดชอบและความน่าเชื่อถือ' },
        { key:'w6', label:'ทัศนคติต่อการทำงานและองค์กร' },
        { key:'w7', label:'ความสามารถในการเรียนรู้และพัฒนาตัวเอง' }
      ]}
    ];

    // ===== HR side: simple request form (creates + sends to evaluator) =====
    function ProbationEvalRequestForm({ initial, candidate, user, onClose, onSave }) {
      const probStart = candidate.probation?.startDate ?? today();
      const [form, setForm] = useState(initial ?? {
        probation_start: probStart,
        eval_due_day30: addDays(probStart, 30),
        eval_due_day60: addDays(probStart, 60),
        eval_due_day90: addDays(probStart, 90),
        pass_day119_date: addDays(probStart, 119),
        evaluator_name: '',
        evaluator_position: '',
        evaluator_email: '',
        // empty rounds for evaluator to fill later
        rounds: {
          day30: { date: addDays(probStart, 30), scores: {}, comment: '' },
          day60: { date: addDays(probStart, 60), scores: {}, comment: '' },
          day90: { date: addDays(probStart, 90), scores: {}, comment: '' }
        },
        final_status: '',
        final_comment: ''
      });
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      // When probation_start changes · auto-update all 4 dates
      const setStartDate = (v) => {
        setForm(f => ({
          ...f,
          probation_start: v,
          eval_due_day30: addDays(v, 30),
          eval_due_day60: addDays(v, 60),
          eval_due_day90: addDays(v, 90),
          pass_day119_date: addDays(v, 119),
          rounds: {
            day30: { ...f.rounds.day30, date: addDays(v, 30) },
            day60: { ...f.rounds.day60, date: addDays(v, 60) },
            day90: { ...f.rounds.day90, date: addDays(v, 90) }
          }
        }));
      };
      const setRoundDate = (round, v) => setForm(f => ({
        ...f,
        [`eval_due_${round}`]: v,
        rounds: { ...f.rounds, [round]: { ...f.rounds[round], date: v } }
      }));
      const [submitting, setSubmitting] = useState(false);
      const submit = async (e) => {
        e.preventDefault();
        if (!form.evaluator_name?.trim() || !form.evaluator_email?.trim()) {
          showToast('กรุณากรอกชื่อ + อีเมลผู้ประเมิน', 'warning');
          return;
        }
        setSubmitting(true);
        try {
          if (!(await ensureAssigneesRegistered([form.evaluator_email], showToast))) return;
          onSave(form);
          showToast(`👤 มอบหมายฟอร์มประเมินให้ ${form.evaluator_name} (${form.evaluator_email}) · งานอยู่ใน "งานของฉัน" ของเขา`, 'email');
        } finally {
          setSubmitting(false);
        }
      };
      return (
        <Modal title="สร้างคำขอประเมินทดลองงาน" subtitle={`Step 6 · ${candidate.name || candidate.position} · HR สร้าง + มอบหมายผู้ประเมิน`} onClose={onClose}>
          <form onSubmit={submit} className="space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              💡 <b>HR สร้างคำขอประเมิน + ส่ง link ให้ผู้ประเมิน</b><br />
              ผู้ประเมินจะเปิด link แล้ว <b>กรอกคะแนนทั้ง 3 รอบใน browser</b> · HR ได้รับเอกสารพร้อมคะแนนกลับมาหลังประเมินครบ
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="วันเริ่มทดลองงาน">
                <input type="date" className="input" value={form.probation_start} onChange={e => setStartDate(e.target.value)} />
              </Field>
              <Field label="วันผ่านทดลองงาน (Day 119)">
                <input type="date" className="input" value={form.pass_day119_date} onChange={e => set('pass_day119_date', e.target.value)} />
              </Field>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-violet-900">📅 วันประเมินแต่ละรอบ <span className="text-slate-500 font-normal">(auto-calc จากวันเริ่ม · ปรับได้ตามต้องการ)</span></div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="รอบที่ 1 · Day 30">
                  <input type="date" className="input" value={form.eval_due_day30} onChange={e => setRoundDate('day30', e.target.value)} />
                </Field>
                <Field label="รอบที่ 2 · Day 60">
                  <input type="date" className="input" value={form.eval_due_day60} onChange={e => setRoundDate('day60', e.target.value)} />
                </Field>
                <Field label="รอบที่ 3 · Day 90">
                  <input type="date" className="input" value={form.eval_due_day90} onChange={e => setRoundDate('day90', e.target.value)} />
                </Field>
              </div>
              <div className="text-[10px] text-violet-700">ผู้ประเมินจะเห็นวันที่ในแต่ละรอบในฟอร์มที่กรอก · ทำให้รู้ deadline ว่าควรประเมินเมื่อไหร่</div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ผู้ประเมิน (หัวหน้าต้นสังกัด)</div>
              <Field label="ชื่อ-นามสกุล" required>
                <input className="input" value={form.evaluator_name} onChange={e => set('evaluator_name', e.target.value)} placeholder="เช่น คุณสมหญิง จิตดี" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="ตำแหน่ง">
                  <input className="input" value={form.evaluator_position} onChange={e => set('evaluator_position', e.target.value)} placeholder="เช่น Finance Manager" />
                </Field>
                <Field label="Username (อีเมล)" required>
                  <input className="input" value={form.evaluator_email} onChange={e => set('evaluator_email', e.target.value)} placeholder="อีเมล (ใช้เป็น username เข้าระบบ)" />
                </Field>
              </div>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
              📝 <b>Pattern เดียวกับ Step 5 Scorecard</b> · HR สร้าง + ส่ง link · evaluator กรอกใน browser
              <div className="mt-1 text-[10px] text-violet-700">รอบที่กรอก: Day 30 / Day 60 / Day 90 (Time + Work · 11 criteria × 1-5 ต่อรอบ) · สรุปสถานะ Day 119</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg">{submitting ? 'ตรวจสอบผู้ใช้…' : '📨 บันทึก + มอบหมายผู้ประเมิน'}</button>
            </div>
          </form>
        </Modal>
      );
    }

    // ===== Evaluator side: full scoring form (filled via link from email) =====
    function ProbationEvalForm({ initial, candidate, user, onClose, onSave }) {
      const probStart = candidate.probation?.startDate ?? today();
      const allKeys = PROB_CRITERIA.flatMap(s => s.items.map(i => i.key));
      const blankScores = Object.fromEntries(allKeys.map(k => [k, 0]));
      const [form, setForm] = useState(initial ?? {
        probation_start: probStart,
        pass_day119_date: addDays(probStart, 119),
        evaluator_name: '',
        evaluator_position: '',
        evaluator_email: '',
        rounds: {
          day30: { date: addDays(probStart, 30), scores: { ...blankScores }, comment: '' },
          day60: { date: addDays(probStart, 60), scores: { ...blankScores }, comment: '' },
          day90: { date: addDays(probStart, 90), scores: { ...blankScores }, comment: '' }
        },
        final_status: '',
        final_comment: ''
      });
      const setBasic = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const setRoundField = (round, field, v) => setForm(f => ({
        ...f, rounds: { ...f.rounds, [round]: { ...f.rounds[round], [field]: v } }
      }));
      const setRoundScore = (round, key, v) => setForm(f => ({
        ...f, rounds: { ...f.rounds, [round]: { ...f.rounds[round], scores: { ...f.rounds[round].scores, [key]: v } } }
      }));
      const submit = (e) => {
        e.preventDefault();
        if (!form.evaluator_name?.trim()) { showToast('กรุณากรอกชื่อผู้ประเมิน', 'warning'); return; }
        onSave(form);
      };

      // NOTE: a plain render function (called as {renderRound(...)}), NOT a
      // component (<RoundSection/>). Defining a component inside the parent
      // remounts it every keystroke -> textareas lose focus (typed 1 char at a
      // time). Inlining the JSX avoids that.
      const renderRound = (round, label, dayNum) => (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-700">{label} · Day {dayNum}</div>
            <input type="date" className="input text-xs" style={{maxWidth:160}} value={form.rounds[round].date} onChange={e => setRoundField(round, 'date', e.target.value)} />
          </div>
          <div className="text-[10px] text-slate-500">5 = ยอดเยี่ยม · 4 = ดีมาก · 3 = มาตรฐาน · 2 = พอใช้ · 1 = น้อยมาก · 0 = ยังไม่ประเมิน</div>
          {PROB_CRITERIA.map(sec => (
            <div key={sec.section}>
              <div className="text-[11px] font-semibold text-slate-700 mt-2">{sec.section}</div>
              {sec.items.map(it => (
                <div key={it.key} className="flex items-center gap-2 mb-1">
                  <span className="text-xs flex-1 text-slate-700">{it.label}</span>
                  <div className="flex gap-1">
                    {[5,4,3,2,1].map(n => (
                      <label key={n} className={`text-xs cursor-pointer w-6 h-6 grid place-items-center rounded ${form.rounds[round].scores[it.key] === n ? 'bg-violet-600 text-white font-bold' : 'bg-white border border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                        <input type="radio" hidden checked={form.rounds[round].scores[it.key] === n} onChange={() => setRoundScore(round, it.key, n)} />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <Field label="ความคิดเห็นรอบนี้">
            <textarea rows={2} className="input" value={form.rounds[round].comment} onChange={e => setRoundField(round, 'comment', e.target.value)} placeholder="จุดแข็ง · จุดที่ต้องพัฒนา · ข้อเสนอแนะ" />
          </Field>
        </div>
      );

      return (
        <Modal title="Probation Evaluation Form" subtitle={`Step 6 · ${candidate.name || candidate.position} · interactive form สำหรับผู้ประเมิน`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
              💡 <b>Pattern เดียวกับ Interview Scorecard (Step 5)</b> · ฟอร์มนี้ผู้ประเมินกรอกคะแนนทุกรอบใน browser ได้ทันที (ไม่ต้องพิมพ์) · HR ได้รับเอกสาร PDF กลับมาหลังประเมินครบ
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="วันเริ่มทดลองงาน"><input type="date" className="input" value={form.probation_start} onChange={e => setBasic('probation_start', e.target.value)} /></Field>
              <Field label="วันผ่านทดลองงาน (Day 119)"><input type="date" className="input" value={form.pass_day119_date} onChange={e => setBasic('pass_day119_date', e.target.value)} /></Field>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">ผู้ประเมิน</div>
              <div className="grid grid-cols-3 gap-2">
                <input className="input" placeholder="ชื่อ-นามสกุล" value={form.evaluator_name} onChange={e => setBasic('evaluator_name', e.target.value)} />
                <input className="input" placeholder="ตำแหน่ง (เช่น Finance Manager)" value={form.evaluator_position} onChange={e => setBasic('evaluator_position', e.target.value)} />
                <input className="input" placeholder="อีเมล (ใช้เป็น username เข้าระบบ)" value={form.evaluator_email} onChange={e => setBasic('evaluator_email', e.target.value)} />
              </div>
            </div>

            {renderRound('day30', 'รอบที่ 1 · ประเมิน', 30)}
            {renderRound('day60', 'รอบที่ 2 · ประเมิน', 60)}
            {renderRound('day90', 'รอบที่ 3 · ประเมิน', 90)}

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-emerald-900">สรุปผลทดลองงาน · Day 119 (ผ่านทดลองงาน)</div>
              {[
                ['passed',   '✓ ผ่านทดลองงาน · บรรจุพนักงานประจำ'],
                ['extended', '⟲ ทดลองงานต่อ (ต่ออายุประเมินอีก)'],
                ['failed',   '✕ ไม่ผ่านทดลองงาน']
              ].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="ps" checked={form.final_status === v} onChange={() => setBasic('final_status', v)} /> {l}
                </label>
              ))}
              <Field label="ความเห็นรวม (สรุปทั้ง 3 รอบ)">
                <textarea rows={3} className="input" value={form.final_comment} onChange={e => setBasic('final_comment', e.target.value)} placeholder="สรุปจุดแข็ง · พัฒนาการ · ข้อเสนอแนะรวม" />
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">บันทึก & สร้างเอกสาร</button>
            </div>
          </form>
        </Modal>
      );
    }

    // Renders one filled evaluation round (with scores)
    function ProbationRoundBlock({ roundNo, dayLabel, roundData }) {
      const r = roundData ?? { scores:{}, comment:'', date:'' };
      const totalKeys = PROB_CRITERIA.flatMap(s => s.items.map(i => i.key));
      const filledCount = totalKeys.filter(k => r.scores[k] > 0).length;
      const totalScore = totalKeys.reduce((sum, k) => sum + (r.scores[k] || 0), 0);
      const maxScore = totalKeys.length * 5;
      return (
        <>
          <div className="section-bar" style={{marginTop:'14px'}}>
            รอบที่ {roundNo} · ประเมิน <b>Day {dayLabel}</b> · {r.date ? `เมื่อ ${fmtDate(r.date)}` : '(ยังไม่ได้กำหนดวัน)'} · กรอกแล้ว {filledCount}/{totalKeys.length}
          </div>
          <table className="form-table">
            <thead>
              <tr style={{background:'#e2e8f0'}}>
                <td className="lbl" style={{width:'55%'}}>หัวข้อการประเมิน</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>5</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>4</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>3</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>2</td>
                <td className="lbl" style={{width:'9%', textAlign:'center'}}>1</td>
              </tr>
            </thead>
            <tbody>
              {PROB_CRITERIA.map(sec => (
                <React.Fragment key={sec.section}>
                  <tr><td colSpan="6" style={{background:'#f1f5f9', padding:'4px 8px', fontWeight:600, fontSize:'10px'}}>{sec.section}</td></tr>
                  {sec.items.map(it => (
                    <tr key={it.key}>
                      <td className="val" style={{fontSize:'10px', paddingLeft:'12px'}}>• {it.label}</td>
                      {[5,4,3,2,1].map(n => (
                        <td key={n} className="val" style={{textAlign:'center'}}>{r.scores[it.key] === n ? '✓' : ''}</td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {filledCount > 0 && (
                <tr style={{ background:'#f1f5f9', fontWeight:600 }}>
                  <td className="lbl" style={{paddingLeft:'12px'}}>คะแนนรวมรอบนี้</td>
                  <td colSpan="5" className="val" style={{textAlign:'right', paddingRight:'10px'}}>{totalScore} / {maxScore} · เฉลี่ย {(totalScore/totalKeys.length).toFixed(1)} / 5</td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ border:'1px solid #94a3b8', borderTop:'none', padding:'8px 12px', fontSize:'11px', whiteSpace:'pre-wrap', background:'#fafafa', minHeight:'42px' }}>
            <b>ความคิดเห็นรอบที่ {roundNo}:</b><br />{r.comment || '________________________________________________________________'}
          </div>
        </>
      );
    }

    function ProbationEvalDoc({ data, candidate }) {
      const rounds = data.rounds ?? { day30:{}, day60:{}, day90:{} };
      const statusLabel = { passed:'✓ ผ่านทดลองงาน · บรรจุพนักงานประจำ', extended:'⟲ ทดลองงานต่อ', failed:'✕ ไม่ผ่านทดลองงาน' }[data.final_status];
      const statusColor = { passed:'#16a34a', extended:'#d97706', failed:'#dc2626' }[data.final_status];
      return (
        <div className="print-document">
          <DocHeader step={6} candidate={candidate} />
          <div className="section-bar">ส่วนที่ 1 : ข้อมูลพนักงาน</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>ชื่อ-นามสกุล</td><td className="val" style={{width:'35%'}}><b>{candidate.name || '—'}</b></td>
                  <td className="lbl" style={{width:'15%'}}>ตำแหน่ง</td><td className="val" style={{width:'35%'}}>{candidate.position}</td></tr>
              <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td>
                  <td className="lbl">วันเริ่มทดลองงาน</td><td className="val">{fmtDate(data.probation_start)}</td></tr>
              <tr><td className="lbl">ผู้ประเมิน</td><td className="val" colSpan="3">{data.evaluator_name} · {data.evaluator_position}{data.evaluator_email ? ` · ${data.evaluator_email}` : ''}</td></tr>
              <tr><td className="lbl">วันผ่านทดลองงาน</td><td className="val" colSpan="3">{fmtDate(data.pass_day119_date)} (Day 119)</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 2 : คำนิยามคะแนน (5 = ยอดเยี่ยม → 1 = น้อยมาก)</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'8%', textAlign:'center'}}><b>5</b></td><td className="lbl" style={{width:'15%'}}>ยอดเยี่ยม</td><td className="val" style={{fontSize:'10px'}}>เหนือกว่าความคาดหวัง · ผลลัพธ์โดดเด่น</td></tr>
              <tr><td className="lbl" style={{textAlign:'center'}}><b>4</b></td><td className="lbl">ดีมาก</td><td className="val" style={{fontSize:'10px'}}>เหนือกว่ามาตรฐาน · รับมือความท้าทายได้ดี</td></tr>
              <tr><td className="lbl" style={{textAlign:'center'}}><b>3</b></td><td className="lbl">มาตรฐาน</td><td className="val" style={{fontSize:'10px'}}>ระดับคาดหวัง · ทำงานได้ตามเกณฑ์</td></tr>
              <tr><td className="lbl" style={{textAlign:'center'}}><b>2</b></td><td className="lbl">พอใช้</td><td className="val" style={{fontSize:'10px'}}>มีพื้นฐาน · ต้องพัฒนาเพิ่ม</td></tr>
              <tr><td className="lbl" style={{textAlign:'center'}}><b>1</b></td><td className="lbl">น้อยมาก</td><td className="val" style={{fontSize:'10px'}}>ขาดความรู้/ทักษะ · ตอบสนองพื้นฐานไม่ได้</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'14px', background:'#475569'}}>ส่วนที่ 3 : ผลการประเมินรายช่วง</div>

          <ProbationRoundBlock roundNo={1} dayLabel="30" roundData={rounds.day30} />
          <ProbationRoundBlock roundNo={2} dayLabel="60" roundData={rounds.day60} />
          <ProbationRoundBlock roundNo={3} dayLabel="90" roundData={rounds.day90} />

          <div className="section-bar" style={{marginTop:'14px'}}>ส่วนที่ 4 : สรุปผลทดลองงาน · Day 119 (วันผ่านทดลองงาน)</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'30%'}}>สถานะการประเมิน</td><td className="val">
                <Cb checked={data.final_status === 'passed'}   label="ผ่านทดลองงาน · บรรจุพนักงานประจำ" /> &nbsp;&nbsp;
                <Cb checked={data.final_status === 'extended'} label="ทดลองงานต่อ (ต่ออายุประเมิน)" /> &nbsp;&nbsp;
                <Cb checked={data.final_status === 'failed'}   label="ไม่ผ่านทดลองงาน" />
                {statusLabel && (
                  <div style={{ marginTop:'6px' }}>
                    <span style={{ display:'inline-block', padding:'4px 12px', borderRadius:4, background:`${statusColor}20`, color:statusColor, fontWeight:700, fontSize:'12px' }}>{statusLabel}</span>
                  </div>
                )}
              </td></tr>
              {data.final_comment && (
                <tr><td className="lbl">ความเห็นรวม</td><td className="val" style={{whiteSpace:'pre-wrap'}}>{data.final_comment}</td></tr>
              )}
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'14px'}}>ลงนามสรุป (Day 119)</div>
          <SignatureBlocks labels={[
            { th:'ผู้ประเมินหลัก', en:'Primary Evaluator' },
            { th:'พนักงาน',         en:'Employee' },
            { th:'HR Manager',     en:'Approved by' }
          ]} />

          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // =====================================================================
    // PER-ROUND probation (Phase 1) — one document per round (Day 30/60/90).
    // Admin creates a round + assigns an evaluator; the evaluator fills it in
    // "งานของฉัน": page 1 = score grid, page 2 = comment + signature.
    // =====================================================================
    const PROB_FINAL_OPTIONS = [
      { v:'passed',   label:'ผ่านทดลองงาน · บรรจุพนักงานประจำ' },
      { v:'extended', label:'ทดลองงานต่อ (ต่ออายุประเมิน)' },
      { v:'failed',   label:'ไม่ผ่านทดลองงาน' },
    ];

    // Evaluator's single-round form (filled in "งานของฉัน")
    function ProbationRoundForm({ roundKey, dayLabel, candidate, initial, user, onClose, onSave }) {
      const allKeys = PROB_CRITERIA.flatMap(s => s.items.map(i => i.key));
      const blank = Object.fromEntries(allKeys.map(k => [k, 0]));
      const seed = initial ?? {};
      const [scores, setScores] = useState(seed.scores ?? blank);
      const [comment, setComment] = useState(seed.comment ?? '');
      const [finalStatus, setFinalStatus] = useState(seed.final_status ?? '');
      const [signature, setSignature] = useState(seed.evaluator_signature ?? null);
      const isFinal = roundKey === 'day90';
      const setScore = (k, v) => setScores(s => ({ ...s, [k]: v }));
      const scoredCount = allKeys.filter(k => (scores[k] ?? 0) >= 1).length;
      const allScored = scoredCount === allKeys.length;
      const submit = (e) => {
        e.preventDefault();
        if (!allScored) { showToast(`กรุณาให้คะแนนให้ครบทุกข้อ (${allKeys.length} ข้อ)`, 'warning'); return; }
        if (!finalStatus) { showToast('กรุณาเลือกผลสรุปทดลองงานรอบนี้', 'warning'); return; }
        if (!signature) { showToast('กรุณาลงลายเซ็นก่อนส่ง', 'warning'); return; }
        onSave({ scores, comment, evaluator_signature: signature, final_status: finalStatus });
      };
      return (
        <Modal title={`ประเมินทดลองงาน · Day ${dayLabel}`} subtitle={`${candidate.name || candidate.position} · ติ๊กคะแนน + คอมเมนต์ + ลงนาม`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            {/* ล็อกข้อมูลพนักงาน (จาก HR · แก้ไม่ได้) */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">ข้อมูลพนักงานที่ถูกประเมิน <span className="text-[10px] font-normal text-slate-400">🔒 ข้อมูลจาก HR · แก้ไขไม่ได้</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-1">
                <div><div className="text-slate-500 mb-0.5">ชื่อ-นามสกุล</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{candidate.name || '—'}</div></div>
                <div><div className="text-slate-500 mb-0.5">ตำแหน่ง</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{candidate.position || '—'}</div></div>
                <div><div className="text-slate-500 mb-0.5">แผนก</div><div className="font-medium text-slate-800 bg-white border border-slate-200 rounded px-2 py-1.5">{candidate.department || '—'}</div></div>
              </div>
            </div>

            {/* คะแนน */}
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-700">ให้คะแนน <span className="font-normal text-slate-400">(5=ยอดเยี่ยม · 1=น้อยมาก)</span></div>
                <div className={`text-[11px] ${allScored ? 'text-emerald-600' : 'text-amber-600'}`}>{scoredCount}/{allKeys.length} ข้อ</div>
              </div>
              {PROB_CRITERIA.map(sec => (
                <div key={sec.section} className="mb-2">
                  <div className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">{sec.section}</div>
                  {sec.items.map(it => (
                    <div key={it.key} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-100">
                      <span className="text-xs flex-1 min-w-0">{it.label}</span>
                      <div className="flex gap-1 shrink-0">
                        {[5,4,3,2,1].map(n => (
                          <button type="button" key={n} onClick={() => setScore(it.key, n)}
                            className={`w-7 h-7 rounded text-xs font-semibold ibtn ${scores[it.key] === n ? 'bg-violet-600 text-white' : 'bg-white border border-slate-300 text-slate-500 hover:border-violet-400'}`}>{n}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* คอมเมนต์ */}
            <div>
              <label className="text-xs font-medium text-slate-600">ความคิดเห็น / ข้อเสนอแนะรอบนี้</label>
              <textarea rows={3} maxLength={350} className="input mt-1" value={comment} onChange={e => setComment(e.target.value.slice(0, 350))} placeholder="จุดแข็ง · จุดที่ต้องพัฒนา · ข้อเสนอแนะ" />
              <div className={`text-[10px] text-right mt-0.5 ${comment.length >= 350 ? 'text-amber-600' : 'text-slate-400'}`}>{comment.length}/350</div>
            </div>

            {/* สรุปผลทดลองงานรอบนี้ (อยู่ในฟอร์มผู้ประเมิน · ไม่ขึ้นในเอกสาร) */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-amber-900 mb-2">สรุปผลทดลองงานรอบนี้{isFinal ? ' (รอบสุดท้าย)' : ''} <span className="text-rose-500">*</span></div>
              <div className="text-[10px] text-amber-700 mb-2">เลือกผลของรอบนี้ · "ไม่ผ่าน" = ปิดโปร · "ผ่าน" = บรรจุ · "ต่อ" = ไปประเมินรอบถัดไป</div>
              <div className="space-y-1">
                {PROB_FINAL_OPTIONS.map(o => (
                  <label key={o.v} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="radio" name="final_status" checked={finalStatus === o.v} onChange={() => setFinalStatus(o.v)} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            {/* ลายเซ็น */}
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-700 mb-2">✍️ ลายเซ็นผู้ประเมิน <span className="font-normal text-rose-500">*จำเป็น</span></div>
              <SignaturePad onChange={setSignature} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg ibtn">✓ ส่งผลประเมิน + ลงนาม</button>
            </div>
          </form>
        </Modal>
      );
    }

    // Single-round probation document — page 1 = scores, page 2 = comment + signatures
    function ProbationRoundDoc({ data, candidate, round }) {
      const dayLabel = data.dayLabel || (round === 'day60' ? '60' : round === 'day90' ? '90' : '30');
      const scores = data.scores || {};
      const allKeys = PROB_CRITERIA.flatMap(s => s.items.map(i => i.key));
      const filled = allKeys.filter(k => (scores[k] ?? 0) >= 1);
      const total = filled.reduce((s, k) => s + (scores[k] || 0), 0);
      const statusLabel = { passed:'✓ ผ่านทดลองงาน · บรรจุพนักงานประจำ', extended:'⟲ ทดลองงานต่อ', failed:'✕ ไม่ผ่านทดลองงาน' }[data.final_status];
      const statusColor = { passed:'#16a34a', extended:'#d97706', failed:'#dc2626' }[data.final_status];
      return (
        <div className="print-document">
          <DocHeader step={6} candidate={candidate} />
          <div style={{ background:'#475569', color:'#fff', padding:'8px 14px', borderRadius:'4px', marginBottom:'8px', fontWeight:700, fontSize:'13px' }}>
            แบบประเมินผลทดลองงาน · รอบ Day {dayLabel}{round === 'day90' ? ' (รอบสุดท้าย)' : ''}
          </div>

          <div className="section-bar">ส่วนที่ 1 : ข้อมูลพนักงาน</div>
          <table className="form-table">
            <tbody>
              <tr><td className="lbl" style={{width:'15%'}}>ชื่อ-นามสกุล</td><td className="val" style={{width:'35%'}}><b>{candidate.name || '—'}</b></td>
                  <td className="lbl" style={{width:'15%'}}>ตำแหน่ง</td><td className="val" style={{width:'35%'}}>{candidate.position}</td></tr>
              <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td>
                  <td className="lbl">ผู้ประเมิน</td><td className="val">{data.evaluator_name || data.evaluator_email || '—'}</td></tr>
            </tbody>
          </table>

          <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 2 : ผลการประเมิน (5 = ยอดเยี่ยม → 1 = น้อยมาก)</div>
          <table className="form-table">
            <thead>
              <tr style={{ background:'#e2e8f0' }}>
                <td className="lbl" style={{width:'60%'}}>หัวข้อ</td>
                {[5,4,3,2,1].map(n => <td key={n} className="lbl" style={{width:'8%', textAlign:'center'}}>{n}</td>)}
              </tr>
            </thead>
            <tbody>
              {PROB_CRITERIA.map(sec => (
                <React.Fragment key={sec.section}>
                  <tr><td colSpan="6" style={{ background:'#f1f5f9', padding:'4px 8px', fontWeight:600, fontSize:'11px' }}>{sec.section}</td></tr>
                  {sec.items.map(it => (
                    <tr key={it.key}>
                      <td className="val" style={{ fontSize:'11px', paddingLeft:'14px' }}>• {it.label}</td>
                      {[5,4,3,2,1].map(n => <td key={n} className="val" style={{ textAlign:'center' }}>{scores[it.key] === n ? '✓' : ''}</td>)}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {filled.length > 0 && (
                <tr style={{ background:'#f1f5f9', fontWeight:600 }}>
                  <td className="lbl" style={{ paddingLeft:'14px' }}>คะแนนรวม</td>
                  <td colSpan="5" className="val" style={{ textAlign:'right', paddingRight:'10px' }}>{total} / {filled.length * 5} · เฉลี่ย {(total / filled.length).toFixed(1)} / 5</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* PAGE 2 */}
          <div className="sc-page2">
            <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 3 : ความคิดเห็น / ข้อเสนอแนะ</div>
            <div style={{ border:'1px solid #94a3b8', borderTop:'none', minHeight:'70px', padding:'10px', whiteSpace:'pre-wrap', fontSize:'11px' }}>{data.comment || ''}</div>

            <div className="section-bar" style={{marginTop:'12px'}}>ส่วนที่ 4 : สรุปผลทดลองงานรอบนี้{round === 'day90' ? ' (รอบสุดท้าย)' : ''}</div>
            <table className="form-table"><tbody>
              <tr><td className="val">
                <Cb checked={data.final_status === 'passed'} label="ผ่านทดลองงาน · บรรจุพนักงานประจำ" /> &nbsp;&nbsp;
                <Cb checked={data.final_status === 'extended'} label="ทดลองงานต่อ" /> &nbsp;&nbsp;
                <Cb checked={data.final_status === 'failed'} label="ไม่ผ่านทดลองงาน" />
                {statusLabel && <div style={{ marginTop:'6px' }}><span style={{ display:'inline-block', padding:'4px 12px', borderRadius:4, background:`${statusColor}20`, color:statusColor, fontWeight:700, fontSize:'12px' }}>{statusLabel}</span></div>}
              </td></tr>
            </tbody></table>

            <div className="sig-grid" style={{ gridTemplateColumns:'1fr 1fr 1fr', marginTop:'14px' }}>
              <div className="sig-box" style={{ minHeight:'90px' }}>
                <div className="sig-label">ผู้ประเมิน</div>
                <div className="sig-label-en">Evaluator</div>
                {data.evaluator_signature
                  ? <DigitalSignatureMark approver={{ name: data.evaluator_name, role: 'ผู้ประเมิน', signedAt: data.evaluator_signedAt || today(), ip: data.evaluator_ip || '-', signature_data: data.evaluator_signature }} />
                  : <div className="sig-line">ลงชื่อ .........................</div>}
              </div>
              <div className="sig-box" style={{ minHeight:'90px' }}>
                <div className="sig-label">พนักงาน (รับทราบผล)</div>
                <div className="sig-label-en">Employee — acknowledged</div>
                {data.ack_signature
                  ? <DigitalSignatureMark approver={{ name: candidate.name, role: 'พนักงาน', signedAt: data.ack_signedAt || today(), ip: data.ack_ip || '-', signature_data: data.ack_signature }} />
                  : <div className="sig-line">รอพนักงานลงนามรับทราบ</div>}
              </div>
              <div className="sig-box" style={{ minHeight:'90px' }}>
                <div className="sig-label">ฝ่ายทรัพยากรบุคคล</div>
                <div className="sig-label-en">HR — รับรอง/ปิดรอบ</div>
                {data.hr_signature
                  ? <DigitalSignatureMark approver={{ name: data.hr_name || 'HR', role: 'ฝ่าย HR', signedAt: data.hr_signedAt || today(), ip: data.hr_ip || '-', signature_data: data.hr_signature }} />
                  : <div className="sig-line">รอ HR ลงนามรับรอง</div>}
              </div>
            </div>
          </div>

          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // Admin: one row per round (create + assign evaluator + status)
    function ProbRoundRow({ candidate, roundKey, day, label, ev, daysInProbation, onCreate, onViewDoc, onSendToEmployee, onHrSign }) {
      const [name, setName] = useState('');
      const [email, setEmail] = useState('');
      const [busy, setBusy] = useState(false);
      const [empName, setEmpName] = useState(candidate.name || '');
      const [empEmail, setEmpEmail] = useState('');
      const [sending, setSending] = useState(false);
      const [hrSigOpen, setHrSigOpen] = useState(false);
      const [hrSig, setHrSig] = useState(null);
      const [hrBusy, setHrBusy] = useState(false);
      const finalLabel = (PROB_FINAL_OPTIONS.find(o => o.v === ev?.final_status) || {}).label;
      const doHrSign = async () => {
        setHrBusy(true);
        await onHrSign(roundKey, hrSig);
        setHrBusy(false); setHrSigOpen(false); setHrSig(null);
      };
      const reached = daysInProbation >= day;
      const create = async () => {
        if (!name.trim() || !email.trim()) { showToast('กรอกชื่อ + อีเมลผู้ประเมิน', 'warning'); return; }
        setBusy(true);
        const ok = await ensureAssigneesRegistered([email], showToast);
        if (!ok) { setBusy(false); return; }
        onCreate(roundKey, { dayLabel: String(day), createdAt: new Date().toISOString(), evaluator_name: name.trim(), evaluator_email: email.trim(), scores: {}, comment: '', evaluated: false });
        setBusy(false);
        showToast(`สร้างเอกสารประเมิน Day ${day} + มอบหมาย ${name} แล้ว · งานอยู่ใน "งานของฉัน" ของผู้ประเมิน`, 'email');
      };
      const sendToEmp = async () => {
        if (!empEmail.trim()) { showToast('กรอกอีเมลพนักงาน (= username เข้าระบบ)', 'warning'); return; }
        setSending(true);
        await onSendToEmployee(roundKey, { employee_email: empEmail.trim(), employee_name: empName.trim() });
        setSending(false);
      };
      return (
        <div className="border border-slate-200 rounded-lg p-3 bg-white">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xs font-semibold text-slate-800">📋 {label} · Day {day}</div>
            {!reached && !ev && <span className="text-[10px] text-slate-400">ยังไม่ถึงรอบ (อีก {day - daysInProbation} วัน) · สร้างล่วงหน้าได้</span>}
          </div>
          {!ev ? (
            <div className="grid items-center gap-2" style={{ gridTemplateColumns:'1fr 1fr auto' }}>
              <input className="input text-xs" placeholder="ชื่อผู้ประเมิน" value={name} onChange={e => setName(e.target.value)} />
              <input className="input text-xs" placeholder="อีเมล (= username)" value={email} onChange={e => setEmail(e.target.value)} />
              <button type="button" onClick={create} disabled={busy} className="text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-3 py-2 rounded ibtn whitespace-nowrap">{busy ? '...' : 'สร้าง + มอบหมาย'}</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-slate-600">ผู้ประเมิน: <b>{ev.evaluator_name}</b> · {ev.evaluator_email}</div>
                <div className="flex items-center gap-2">
                  {ev.evaluated
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">✓ ประเมินแล้ว</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">⏳ รอผู้ประเมิน</span>}
                  {ev.evaluated && <button type="button" onClick={() => onViewDoc(roundKey)} className="text-xs bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded">📄 ดูเอกสาร</button>}
                </div>
              </div>

              {/* ขั้นที่ 2: ส่งผลให้พนักงานลงนามรับทราบ (เปิดหลังผู้ประเมินส่งกลับ) */}
              {ev.evaluated && !ev.sent_to_employee && (
                <div className="border-t border-slate-100 pt-2">
                  <div className="text-[11px] text-slate-500 mb-1">📨 ส่งผลให้พนักงานลงนามรับทราบ (อีเมล = username เข้าระบบ)</div>
                  <div className="grid items-center gap-2" style={{ gridTemplateColumns:'1fr 1fr auto' }}>
                    <input className="input text-xs" placeholder="ชื่อพนักงาน" value={empName} onChange={e => setEmpName(e.target.value)} />
                    <input className="input text-xs" placeholder="อีเมลพนักงาน" value={empEmail} onChange={e => setEmpEmail(e.target.value)} />
                    <button type="button" onClick={sendToEmp} disabled={sending} className="text-xs bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-3 py-2 rounded ibtn whitespace-nowrap">{sending ? '...' : 'ส่งให้พนักงาน'}</button>
                  </div>
                </div>
              )}
              {ev.sent_to_employee && !ev.acknowledged && (
                <div className="border-t border-slate-100 pt-2 text-[11px] text-amber-700">⏳ รอพนักงานรับทราบ · ส่งไปที่ <b>{ev.employee_email}</b> (อยู่ใน "งานของฉัน" ของพนักงาน)</div>
              )}

              {/* ขั้นที่ 3: HR ลงนามรับรอง + ปิดรอบ (หลังพนักงานรับทราบ) */}
              {ev.acknowledged && !ev.hr_signed && (
                <div className="border-t border-slate-100 pt-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] text-emerald-700">✓ พนักงาน ({ev.employee_name || ev.employee_email}) รับทราบแล้ว · ผลรอบนี้: <b>{finalLabel || '—'}</b></div>
                  <button type="button" onClick={() => setHrSigOpen(true)} className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded ibtn whitespace-nowrap">✍️ ลงนาม HR + ปิดรอบ</button>
                </div>
              )}
              {ev.hr_signed && (
                <div className="border-t border-slate-100 pt-2 text-[11px] text-violet-700">✓ ปิดรอบสมบูรณ์ · ลงนามครบ 3 ฝ่าย · ผล: <b>{finalLabel || '—'}</b>{ev.final_status === 'extended' ? ' → ไปรอบถัดไป' : ev.final_status === 'passed' ? ' → บรรจุพนักงานประจำ' : ' → ปิดกระบวนการ'}</div>
              )}

              {hrSigOpen && (
                <Modal title={`ลงนามรับรอง (HR) · Day ${day}`} subtitle={`${candidate.name || candidate.position} · ปิดรอบประเมิน`} onClose={() => setHrSigOpen(false)}>
                  <div className="space-y-3">
                    <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-800">
                      ผลรอบนี้: <b>{finalLabel || '—'}</b> — ลงนามเพื่อรับรองและปิดรอบ
                      {ev.final_status === 'passed' ? ' (ผ่านโปร · บรรจุพนักงานประจำ)' : ev.final_status === 'failed' ? ' (ไม่ผ่านโปร · ปิดกระบวนการ)' : ' (ไปประเมินรอบถัดไป)'}
                    </div>
                    <SignaturePad onChange={setHrSig} />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setHrSigOpen(false)} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
                      <button type="button" disabled={!hrSig || hrBusy} onClick={doHrSign} className={`px-4 py-2 text-sm rounded-lg text-white ibtn ${hrSig && !hrBusy ? 'bg-violet-600 hover:bg-violet-700' : 'bg-violet-300 cursor-not-allowed'}`}>{hrBusy ? '...' : '✓ ลงนาม + ปิดรอบ'}</button>
                    </div>
                  </div>
                </Modal>
              )}
            </div>
          )}
        </div>
      );
    }

    function ProbationRoundsPanel({ candidate, daysInProbation, onCreate, onViewDoc, onSendToEmployee, onHrSign }) {
      const evals = candidate.probationEvals || {};
      const rounds = [
        { key:'day30', day:30, label:'รอบที่ 1' },
        { key:'day60', day:60, label:'รอบที่ 2' },
        { key:'day90', day:90, label:'รอบที่ 3 (สุดท้าย)' },
      ];
      return (
        <div className="space-y-2">
          {rounds.map(r => (
            <ProbRoundRow key={r.key} candidate={candidate} roundKey={r.key} day={r.day} label={r.label}
              ev={evals[r.key]} daysInProbation={daysInProbation} onCreate={onCreate} onViewDoc={onViewDoc} onSendToEmployee={onSendToEmployee} onHrSign={onHrSign} />
          ))}
        </div>
      );
    }

    // ===== (Legacy) Step Contract — no longer used, kept for reference =======
    function ContractForm({ initial, candidate, user, onClose, onSave }) {
      const [form, setForm] = useState(initial ?? {
        start_date: addDays(today(), 14),
        salary: '',
        benefits: 'ประกันสังคม · ประกันสุขภาพกลุ่ม · กองทุนสำรองเลี้ยงชีพ · โบนัสประจำปี',
        work_schedule: 'จันทร์–ศุกร์ · 09:00–18:00',
        probation_days: 120,
        notice_period_days: 30,
        confidentiality: true,
        non_compete: false
      });
      const [approvers, setApprovers] = useState([
        { name: candidate.name || '', email:'', role:'ลูกจ้าง / Employee' },
        { name:'', email:'', role:'ฝ่ายนายจ้าง / Employer (CEO)' },
        { name:'', email:'', role:'พยานคนที่ 1 / Witness 1' },
        { name:'', email:'', role:'พยานคนที่ 2 / Witness 2' }
      ]);
      const set = (k, v) => setForm(f => ({ ...f, [k]:v }));
      const submit = (e) => {
        e.preventDefault();
        if (!form.salary) { showToast('กรุณากรอกเงินเดือน', 'warning'); return; }
        if (!approvers.every(a => a.name && a.email)) { showToast('กรุณากรอกชื่อ + อีเมลผู้ลงนามให้ครบทุกคน', 'warning'); return; }
        onSave(form, approvers);
      };
      return (
        <Modal title="สร้าง Employment Contract" subtitle={`Step 9 · ${candidate.name || candidate.position}`} onClose={onClose} wide>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="วันเริ่มงาน" required>
                <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </Field>
              <Field label="เงินเดือน (บาท)" required>
                <input type="number" className="input" value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="เช่น 32000" />
              </Field>
            </div>
            <Field label="สวัสดิการ">
              <textarea rows={2} className="input" value={form.benefits} onChange={e => set('benefits', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="เวลาทำงาน">
                <input className="input" value={form.work_schedule} onChange={e => set('work_schedule', e.target.value)} />
              </Field>
              <Field label="ระยะทดลองงาน (วัน)">
                <input type="number" className="input" value={form.probation_days} onChange={e => set('probation_days', Number(e.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ระยะเวลาแจ้งล่วงหน้า (วัน)">
                <input type="number" className="input" value={form.notice_period_days} onChange={e => set('notice_period_days', Number(e.target.value))} />
              </Field>
              <Field label="ข้อตกลง">
                <div className="flex flex-col gap-1 mt-1">
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={form.confidentiality} onChange={e => set('confidentiality', e.target.checked)} /> รักษาความลับ (NDA)</label>
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={form.non_compete} onChange={e => set('non_compete', e.target.checked)} /> ห้ามแข่งขัน (Non-compete)</label>
                </div>
              </Field>
            </div>
            <ApproverList approvers={approvers} setApprovers={setApprovers} label="ผู้ลงนามสัญญา" />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">📨 สร้างเอกสาร + ส่งเซ็น</button>
            </div>
          </form>
        </Modal>
      );
    }

    function ContractDoc({ data, candidate }) {
      return (
        <div className="print-document">
          <DocHeader step={6} candidate={candidate} />
          <p className="text-sm">สัญญาจ้างงานฉบับนี้ทำขึ้นเมื่อวันที่ <b>{fmtDate(today())}</b> ระหว่าง <b>บริษัท JIAN CHA Group จำกัด</b> (เรียกว่า "นายจ้าง") กับ <b>{candidate.name || '(ระบุชื่อ)'}</b> (เรียกว่า "ลูกจ้าง")</p>
          <h2>1. ตำแหน่งและขอบเขตงาน</h2>
          <table>
            <tbody>
              <tr><td className="lbl">ตำแหน่ง</td><td className="val">{candidate.position}</td></tr>
              <tr><td className="lbl">แผนก</td><td className="val">{candidate.department}</td></tr>
              <tr><td className="lbl">วันเริ่มงาน</td><td className="val">{fmtDate(data.start_date)}</td></tr>
            </tbody>
          </table>
          <h2>2. ค่าตอบแทน</h2>
          <table>
            <tbody>
              <tr><td className="lbl">เงินเดือน</td><td className="val">{Number(data.salary).toLocaleString()} บาท/เดือน</td></tr>
              <tr><td className="lbl">สวัสดิการ</td><td className="val text-sm">{data.benefits}</td></tr>
            </tbody>
          </table>
          <h2>3. เวลาและเงื่อนไขทำงาน</h2>
          <table>
            <tbody>
              <tr><td className="lbl">เวลาทำงาน</td><td className="val">{data.work_schedule}</td></tr>
              <tr><td className="lbl">ระยะทดลองงาน</td><td className="val">{data.probation_days} วัน</td></tr>
              <tr><td className="lbl">ระยะเวลาแจ้งล่วงหน้าก่อนเลิกจ้าง</td><td className="val">{data.notice_period_days} วัน</td></tr>
            </tbody>
          </table>
          <h2>4. ข้อตกลงเพิ่มเติม</h2>
          <ul className="text-sm list-disc list-inside ml-2">
            {data.confidentiality && <li>ลูกจ้างตกลงรักษาความลับของบริษัท (NDA) ระหว่างจ้างงานและหลังสิ้นสุดสัญญา</li>}
            {data.non_compete && <li>ลูกจ้างตกลงไม่ประกอบกิจการแข่งขันกับนายจ้างเป็นเวลา 1 ปีหลังสิ้นสุดสัญญา</li>}
            <li>การปฏิบัติตามกฎระเบียบของบริษัทและกฎหมายแรงงาน</li>
          </ul>
          <div className="section-bar" style={{marginTop:'14px'}}>ลงนาม</div>
          <SignatureBlocks
            labels={[
              { th:'ลูกจ้าง',     en:'Employee' },
              { th:'ฝ่ายนายจ้าง',  en:'Employer' },
              { th:'พยานคนที่ 1', en:'Witness 1' },
              { th:'พยานคนที่ 2', en:'Witness 2' }
            ]}
            workflow={candidate.approvalWorkflows?.[6]}
          />
          <div style={{ fontSize:'9px', color:'#94a3b8', marginTop:'12px', textAlign:'center' }}>
            สร้างโดยระบบ Recruitment 120 Days · JIANCHA GROUP · {fmtDate(today())}
          </div>
        </div>
      );
    }

    // ===== Document Preview Modal ============================================
    function DocumentPreview({ step, doc, candidate, onClose }) {
      const Renderer = { 1: ManpowerRequestDoc, 4: ScorecardDoc, 5: ApprovalDoc, 6: ProbationEvalDoc }[step];
      const print = () => window.print();
      return (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-6" onClick={onClose}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl mx-auto my-2 sm:my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10 no-print">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 truncate">📄 {DOC_LABELS[step].name}</div>
                <div className="text-xs text-slate-500 truncate">สร้างเมื่อ {fmtDateTime(doc.createdAt)} · {doc.createdBy}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={print} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg ibtn">🖨 พิมพ์ / Save as PDF</button>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900">✕</button>
              </div>
            </div>
            <div className="px-4 pt-2 pb-1 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 no-print">
              💡 <b>PDF Preview Mode</b> · นี่คือมุมมองสำหรับพิมพ์/save PDF · ผู้ประเมินกรอกจริงผ่าน <b>interactive form</b> ในระบบ
            </div>
            <div className="p-6 sm:p-10 print-only">
              <Renderer data={doc.data} candidate={candidate} />
            </div>
          </div>
        </div>
      );
    }

    function SectionGroup({ title, subtitle, accent, candidates, onOpen }) {
      const accentMap = {
        sky:     { bg:'bg-sky-50',     border:'border-sky-200',     dot:'bg-sky-500',     text:'text-sky-900',     count:'bg-sky-100 text-sky-800' },
        amber:   { bg:'bg-amber-50',   border:'border-amber-200',   dot:'bg-amber-500',   text:'text-amber-900',   count:'bg-amber-100 text-amber-800' },
        emerald: { bg:'bg-emerald-50', border:'border-emerald-200', dot:'bg-emerald-500', text:'text-emerald-900', count:'bg-emerald-100 text-emerald-800' }
      };
      const a = accentMap[accent] ?? accentMap.sky;
      return (
        <section>
          <header className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${a.bg} border ${a.border} mb-3`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2 h-2 rounded-full ${a.dot} shrink-0`}></span>
              <div className="min-w-0">
                <h2 className={`text-sm font-semibold ${a.text} truncate`}>{title}</h2>
                <p className="text-[11px] text-slate-600 truncate">{subtitle}</p>
              </div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.count} whitespace-nowrap`}>
              {candidates.length} รายการ
            </span>
          </header>
          {candidates.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400">
              ไม่มีรายการในกลุ่มนี้
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {candidates.map(c => <CandidateCard key={c.id} c={c} onOpen={() => onOpen(c.id)} />)}
            </div>
          )}
        </section>
      );
    }

    function CandidateCard({ c, onOpen }) {
      const status = deriveStatus(c);
      const pct = progressPercent(c);
      const step = STEPS.find(s => s.id === c.current_step);
      const hasApproval = c.approvalWorkflows && Object.keys(c.approvalWorkflows).length > 0;
      const hasName = !!c.name;
      const title = hasName ? c.name : c.position;
      const subtitle = hasName ? `${c.position} · ${c.department}` : `${c.department} · ${c.type === 'replacement' ? 'ทดแทน' : 'อัตราใหม่'}`;
      return (
        <button onClick={onOpen} className="text-left bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition p-4 flex flex-col gap-3 ibtn">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {!hasName && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">อัตรา</span>}
                <div className="font-semibold text-slate-900 truncate">{title}</div>
              </div>
              <div className="text-xs text-slate-500 truncate">{subtitle}</div>
            </div>
            <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${toneClasses[status.tone]} whitespace-nowrap`}>
              <span>{status.icon}</span> {status.label}
            </span>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span className="truncate pr-2">Step {c.current_step}/{TOTAL_STEPS} · {step?.name}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full ${toneBar[status.tone]}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>📅 {fmtDate(c.process_start_date)}</span>
            <span className="flex items-center gap-2">
              {c.files?.length > 0 && <span title="files attached">📎 {c.files.length}</span>}
              {hasApproval && <span title="approval workflow">✍️</span>}
              <span>›</span>
            </span>
          </div>
        </button>
      );
    }

    function Stat({ label, value, tone, icon }) {
      const bg = { slate:'bg-slate-100 text-slate-700', sky:'bg-sky-100 text-sky-700', emerald:'bg-emerald-100 text-emerald-700', rose:'bg-rose-100 text-rose-700' }[tone];
      return (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl grid place-items-center text-lg ${bg}`}>{icon}</div>
          <div>
            <div className="text-2xl font-semibold text-slate-900 leading-tight">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        </div>
      );
    }

    function Section({ title, subtitle, icon, children, action }) {
      return (
        <section className="mb-5">
          <div className="flex items-baseline justify-between mb-2 gap-2">
            <h3 className="text-sm font-semibold text-slate-800 inline-flex items-center gap-1.5">
              <span>{icon}</span> {title}
            </h3>
            <div className="flex items-center gap-2">
              {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
              {action}
            </div>
          </div>
          {children}
        </section>
      );
    }

    function Info({ label, value, icon }) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 inline-flex items-center gap-1">
            <span>{icon}</span> {label}
          </div>
          <div className="text-sm text-slate-800 font-medium mt-0.5">{value}</div>
        </div>
      );
    }

    // ===== File upload section ==============================================
    function FileUploader({ candidate, step, onUpload }) {
      const inputRef = useRef(null);
      const stepFiles = candidate.files?.filter(f => f.step === step) ?? [];
      const handleFile = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const size = f.size < 1024 ? `${f.size} B` : f.size < 1048576 ? `${(f.size/1024).toFixed(0)} KB` : `${(f.size/1048576).toFixed(1)} MB`;
        onUpload({ name:f.name, step, size, uploadedAt: today(), uploadedBy:'(คุณ)' });
        e.target.value = '';
      };
      return (
        <div className="mt-2 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">📎 ไฟล์ใน Step นี้: {stepFiles.length}</span>
            <button onClick={() => inputRef.current?.click()} className="text-xs bg-white border border-slate-200 hover:border-slate-300 text-slate-700 px-2.5 py-1 rounded-lg">
              + Upload
            </button>
            <input ref={inputRef} type="file" hidden onChange={handleFile} />
          </div>
          {stepFiles.length > 0 && (
            <ul className="mt-2 space-y-1">
              {stepFiles.map((f, i) => (
                <li key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 flex items-center justify-between">
                  <span className="truncate">📄 {f.name} <span className="text-slate-400">· {f.size}</span></span>
                  <span className="text-slate-400 text-[10px] whitespace-nowrap">{fmtDate(f.uploadedAt)} · {f.uploadedBy}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    // ===== Approval Workflow Setup Modal ===================================
    function ApprovalSetupModal({ candidate, step, onClose, onStart }) {
      const docNamePrefix = step === 1 ? 'manpower-request' : 'employment-approval';
      const docSuffix = candidate.name ? candidate.name.split(' ')[0] : candidate.position.split(' ')[0].toLowerCase();
      const stepLabel = step === 1 ? 'ขออนุมัติเปิดอัตรา (Step 1)' : 'ขออนุมัติรับพนักงาน (Step 5)';
      const stepSubject = step === 1 ? candidate.position : (candidate.name || candidate.position);
      const defaultApprovers = step === 1
        ? [
            { name:'', email:'', role:'หัวหน้าต้นสังกัด' },
            { name:'', email:'', role:'HR Manager / Director' },
            { name:'', email:'', role:'MD / CEO' }
          ]
        : [{ name:'', email:'', role:'' }];

      const [docName, setDocName] = useState(`${docNamePrefix}-${docSuffix}.pdf`);
      const [approvers, setApprovers] = useState(defaultApprovers);
      const addApprover = () => setApprovers(a => [...a, { name:'', email:'', role:'' }]);
      const removeApprover = (i) => setApprovers(a => a.filter((_, idx) => idx !== i));
      const updateApprover = (i, field, value) => setApprovers(a => a.map((x, idx) => idx === i ? { ...x, [field]:value } : x));
      const canStart = approvers.length > 0 && approvers.every(a => a.name && a.email && a.role);

      const [starting, setStarting] = useState(false);
      const start = async () => {
        setStarting(true);
        try {
          if (!(await ensureAssigneesRegistered(approvers.map(a => a.email), showToast))) return;
          const wf = {
            id:'wf_' + Date.now(),
            status:'in_progress',
            documentName: docName,
            createdAt: new Date().toISOString(),
            approvers: approvers.map((a, i) => ({
              ...a, id:'a' + (i+1), sequence:i+1,
              status: i === 0 ? 'pending' : 'waiting',
              signedAt: null, ip:null
            }))
          };
          onStart(wf, step);
          showToast(`มอบหมายงานอนุมัติให้ ${approvers[0].name} (${approvers[0].email}) แล้ว · งานจะไปอยู่ใน "งานของฉัน" ของเขา`, 'email');
        } finally {
          setStarting(false);
        }
      };

      return (
        <Modal title={stepLabel} subtitle={stepSubject} onClose={onClose} wide>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">ชื่อไฟล์เอกสารอนุมัติ</label>
              <input className="input mt-1" value={docName} onChange={e => setDocName(e.target.value)} />
              <div className="text-[11px] text-slate-500 mt-1">📎 ระบบจะรวม Resume + Scorecard + Offer terms อัตโนมัติ</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-600">ลำดับผู้อนุมัติ (ระบบส่งทีละคนตามลำดับ)</label>
                <button onClick={addApprover} className="text-xs text-sky-600 hover:text-sky-800">+ เพิ่มคน</button>
              </div>
              <div className="space-y-2">
                {approvers.map((a, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">ลำดับที่ {i+1}</span>
                      {approvers.length > 1 && <button onClick={() => removeApprover(i)} className="text-xs text-rose-600 hover:text-rose-800">ลบ</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input" placeholder="ชื่อ-นามสกุล" value={a.name} onChange={e => updateApprover(i, 'name', e.target.value)} />
                      <input className="input" placeholder="ตำแหน่ง (เช่น HRBP Manager)" value={a.role} onChange={e => updateApprover(i, 'role', e.target.value)} />
                    </div>
                    <input className="input" placeholder="อีเมล (ใช้เป็น username เข้าระบบ)" value={a.email} onChange={e => updateApprover(i, 'email', e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-800">
              ℹ️ <b>วิธีทำงาน</b>: ระบบจะส่งงานเข้า "งานของฉัน" ของลำดับที่ 1 ก่อน (ใช้อีเมลเป็น username เข้าระบบ) · เมื่อลงนามเสร็จ ระบบจะส่งต่อลำดับถัดไปอัตโนมัติ · จนครบทุกคน
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button onClick={start} disabled={!canStart || starting}
                className={`px-4 py-2 text-sm rounded-lg ${canStart && !starting ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
                {starting ? 'ตรวจสอบผู้ใช้…' : 'มอบหมายคนที่ 1'}
              </button>
            </div>
          </div>
        </Modal>
      );
    }

    function ApprovalWorkflowPanel({ wf }) {
      const completed = wf.approvers.filter(a => a.status === 'approved').length;
      return (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-slate-700">📎 {wf.documentName}</div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${wf.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
              {wf.status === 'completed' ? '✓ อนุมัติครบแล้ว' : `${completed}/${wf.approvers.length} approved`}
            </span>
          </div>
          <ol className="space-y-1.5">
            {wf.approvers.map((a) => {
              const tone = a.status === 'approved' ? 'green' : a.status === 'pending' ? 'blue' : a.status === 'rejected' ? 'red' : 'gray';
              const icon = a.status === 'approved' ? '✓' : a.status === 'pending' ? '⏳' : a.status === 'rejected' ? '✕' : '○';
              return (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] ${tone === 'green' ? 'bg-emerald-500 text-white' : tone === 'blue' ? 'bg-sky-500 text-white pulse-ring' : 'bg-slate-200 text-slate-500'}`}>
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800">{a.name}</div>
                    <div className="text-slate-500 truncate">{a.role} · {a.email}</div>
                    {a.signedAt && <div className="text-[10px] text-emerald-700">ลงนามเมื่อ {fmtDateTime(a.signedAt)} · IP {a.ip}</div>}
                    {a.status === 'pending' && <div className="text-[10px] text-sky-700">รอลงนาม · อยู่ใน "งานของฉัน" แล้ว</div>}
                    {a.status === 'waiting' && <div className="text-[10px] text-slate-400">รอลำดับก่อนหน้า</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      );
    }

    function Detail({ c, onClose, onAdvance, onToggleDoc, onUploadFile, onStartApproval, onSendSelfServiceLink, onMilestoneEval, onSetName, onDropCandidate, onCancelPosition, onSaveDoc, onUpdateDistribution, onUpdateShortlist, onAddDoc, onRemoveDoc, onUpdateAttachments, onCancelStepDoc, onCreateProbationRound, onSendProbationToEmployee, onHrSignProbationRound }) {
      const status = deriveStatus(c);
      const documents = c.documents?.length ? c.documents : DOCUMENT_TEMPLATE.map(d => ({ ...d, received:false, receivedDate:null }));
      const probation = c.probation ?? {};
      const probationStart = probation.startDate ?? c.process_start_date;
      const daysInProbation = c.current_step === TOTAL_STEPS ? daysBetween(probationStart, today()) : 0;
      const milestones = probation.milestones ?? { day30:{done:false}, day60:{done:false}, day90:{done:false}, day120:{done:false} };
      const [showApprovalSetup, setShowApprovalSetup] = useState(false);
      const [showMilestoneEval, setShowMilestoneEval] = useState(null);
      const [showNameForm, setShowNameForm] = useState(false);
      const [probDocView, setProbDocView] = useState(null);
      const hasName = !!c.name;
      const title = hasName ? c.name : c.position;
      const subtitle = hasName ? `${c.position} · ${c.department}` : `${c.department} · ${c.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'}`;

      return (
        <Modal title={title} subtitle={subtitle} onClose={onClose} wide>
          <div className="flex items-center justify-between gap-2 -mt-2 mb-4 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${toneClasses[status.tone]}`}>
              <span>{status.icon}</span> {status.label}
            </span>
            <div className="flex items-center gap-1 flex-wrap">
              {!hasName && c.status === 'active' && (
                <button onClick={() => setShowNameForm(true)} className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-1 rounded-lg ibtn">+ ใส่ชื่อผู้สมัคร</button>
              )}
              {hasName && c.status === 'active' && (
                <button onClick={() => setShowNameForm(true)} className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100">✎ แก้ชื่อ</button>
              )}
              {hasName && c.status === 'active' && (
                <button onClick={() => { if (confirm(`ลบ "${c.name}" ออกจากตำแหน่งนี้?\n\nระบบจะเก็บประวัติไว้ แล้วย้อนกลับไปหา candidate อื่นที่ Step 5`)) onDropCandidate(); }}
                  className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-50">
                  👤✕ ผู้สมัครถอน
                </button>
              )}
              {c.status === 'active' && (
                <button onClick={() => { if (confirm(`ยกเลิกตำแหน่ง "${c.position}"?\n\nตำแหน่งนี้จะหายไปจาก dashboard · ถ้าต้องการสรรหาใหม่ให้กด "+ New Requisition"\n\n(audit log จะเก็บประวัติไว้ใน database)`)) onCancelPosition(); }}
                  className="text-xs text-rose-700 hover:text-rose-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50">
                  🚫 ยกเลิกตำแหน่ง
                </button>
              )}
            </div>
          </div>

          {!hasName && c.current_step >= 4 && c.status === 'active' && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900 flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <div className="flex-1">
                <b>ต้องใส่ชื่อผู้สมัครก่อน</b> · ผ่านสัมภาษณ์แล้ว ใส่ชื่อก่อนถึงจะไป Step 5 (Offer Approval) ได้
              </div>
              <button onClick={() => setShowNameForm(true)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg whitespace-nowrap ibtn">+ ใส่ชื่อ</button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-5">
            <Info icon="📅" label="วันเริ่ม Process" value={fmtDate(c.process_start_date)} />
            <Info icon="⏰" label="Deadline Step 2" value={fmtDate(addDays(c.process_start_date, STEP_2_DEADLINE_DAYS))} />
            <Info icon="💼" label="ประเภท" value={c.probation?.direct ? 'เข้าประเมินโดยตรง (ไม่ผ่านสรรหา)' : c.type === 'replacement' ? 'ทดแทนคนลาออก' : 'อัตราใหม่'} />
            <Info icon="👤" label="ผู้สร้าง" value={c.created_by || '—'} />
          </div>

          {/* Step tracker */}
          <Section icon="📋" title={`ขั้นตอนทั้งหมด (${TOTAL_STEPS} Steps)`}>
            <ol className="space-y-1.5">
              {STEPS.map((s) => {
                const done = s.id < c.current_step || c.status === 'passed';
                const current = s.id === c.current_step && c.status === 'active';
                const log = c.steps?.find(x => x.step === s.id);
                return (
                  <li key={s.id} className={`p-2.5 rounded-lg border ${current ? 'bg-sky-50 border-sky-200' : done ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-slate-100'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold ${done ? 'bg-emerald-500 text-white' : current ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {done ? '✓' : s.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{s.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.owner}{s.note ? ` · ${s.note}` : ''}
                          {log ? ` · เสร็จเมื่อ ${fmtDate(log.completedDate)} (${log.completedBy})` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {current && c.current_step < TOTAL_STEPS && !APPROVAL_STEPS.includes(c.current_step) && (
                          <button onClick={onAdvance} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg whitespace-nowrap ibtn">ผ่าน Step →</button>
                        )}
                        {current && APPROVAL_STEPS.includes(c.current_step) && !c.approvalWorkflows?.[c.current_step] && (
                          <span className="text-[10px] text-slate-500">↓ กด "+ สร้างเอกสาร + ส่งอนุมัติ"</span>
                        )}
                        {current && APPROVAL_STEPS.includes(c.current_step) && c.approvalWorkflows?.[c.current_step]?.status === 'completed' && (
                          <button onClick={onAdvance} className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg whitespace-nowrap ibtn">
                            {c.current_step === 5 ? 'ส่ง Offer & ต่อ →' : 'ผ่าน Step →'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Step 3 (Screening): unified per-candidate cards (upload + send + timeline) */}
                    {s.id === 3 && (current || done) && (
                      <ShortlistCandidateCards candidate={c} onUpdate={(list) => onUpdateShortlist(list)} />
                    )}
                    {/* Steps 1/4/5 = generate document from form inline · Step 6 (Probation) doc lives in Probation Section below */}
                    {(s.id === 1 || s.id === 4 || s.id === 5) && (current || done) && (
                      <DocumentBuilder candidate={c} step={s.id} user={{ name: c.updated_by || c.created_by || 'HR' }} onSave={(step, data, approvers) => onSaveDoc(step, data, approvers)} onCancel={() => onCancelStepDoc(s.id)} />
                    )}
                    {/* Step 4 (Interview Eval): assign an evaluator → goes to their "งานของฉัน" */}
                    {s.id === 4 && (current || done) && c.generatedDocs?.[4] && (
                      <AssignDistribution
                        candidate={c} step={4}
                        title="👤 มอบหมายผู้ประเมินสัมภาษณ์ (อีเมล = username)"
                        helperText="ใส่อีเมลผู้ประเมิน → ระบบส่ง Interactive Scorecard เข้า &quot;งานของฉัน&quot; ของเขา · เข้ามาให้คะแนนในระบบได้เลย"
                        accent="violet"
                        onUpdate={(log) => onUpdateDistribution(4, log)}
                      />
                    )}
                    {/* Step 6 (Probation) doc + assignment live in Probation Section below — no duplicate here */}
                    {/* Approval workflow inline panel for Step 1, 5 */}
                    {APPROVAL_STEPS.includes(s.id) && c.approvalWorkflows?.[s.id] && (current || done) && (
                      <div className="mt-2">
                        <ApprovalWorkflowPanel wf={c.approvalWorkflows[s.id]} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Section>

          {/* Probation 30/60/90/120 */}
          {(c.current_step === TOTAL_STEPS || c.status === 'passed') && (
            <Section icon="🛡" title="ทดลองงาน 120 วัน (Step 6)" subtitle={c.status === 'passed' ? 'ผ่านโปรแล้ว' : `วันที่ ${Math.min(daysInProbation, PROBATION_DAYS)} / ${PROBATION_DAYS}`}>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="grid grid-cols-4 gap-2 mb-3 text-center text-[11px]">
                  {[
                    { day:30,  label:'รอบที่ 1 ประเมิน' },
                    { day:60,  label:'รอบที่ 2 ประเมิน' },
                    { day:90,  label:'รอบที่ 3 ประเมิน' },
                    { day:119, label:'ผ่านทดลองงาน', isPass:true }
                  ].map(m => {
                    const reached = daysInProbation >= m.day;
                    const tone = reached
                      ? (m.isPass ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-emerald-100 text-emerald-800 border-emerald-200')
                      : 'bg-slate-100 text-slate-500 border-slate-200';
                    return (
                      <div key={m.day} className={`rounded-lg py-2 px-1 border ${tone}`}>
                        <div className="font-semibold">Day {m.day}</div>
                        <div className="text-[10px]">{m.label}</div>
                        <div className="text-[10px] mt-0.5">{reached ? (m.isPass ? '✦ พร้อมบรรจุ' : '✓ ถึงแล้ว') : `อีก ${m.day - daysInProbation} วัน`}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (daysInProbation / PROBATION_DAYS) * 100)}%` }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-xs">
                  <Info icon="📅" label="วันเริ่มงาน" value={fmtDate(probation.startDate)} />
                  <Info icon="📤" label="ส่งฟอร์มประเมิน" value={fmtDate(probation.evaluationSentDate)} />
                  <Info icon="📥" label="รับเอกสารคืน" value={probation.returnDate ? fmtDate(probation.returnDate) : 'ยังไม่ได้รับ'} />
                </div>
                <div className="mt-3 text-[11px] text-slate-500">💡 milestone อัพเดทอัตโนมัติตามวันที่ · ผลผ่าน/ไม่ผ่านมาจากการประเมินราย-รอบด้านล่าง (HR ลงนามปิดรอบ) — ไม่มีปุ่มผ่านโปรลัดแล้ว</div>
              </div>

              {/* Per-round probation evaluation (Day 30/60/90) — admin creates 1 doc per round */}
              <div className="mt-4 bg-violet-50 border border-violet-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-violet-900 mb-1">📝 ประเมินผลทดลองงาน (รายรอบ)</div>
                <div className="text-xs text-violet-700 mb-3">
                  แต่ละรอบ HR สร้างเอกสาร + มอบหมายผู้ประเมิน → ผู้ประเมินกรอกใน "งานของฉัน" (ติ๊กคะแนน + คอมเมนต์ + ลงนาม)
                </div>
                <ProbationRoundsPanel candidate={c} daysInProbation={daysInProbation}
                  onCreate={(roundKey, payload) => onCreateProbationRound(roundKey, payload)}
                  onViewDoc={(roundKey) => setProbDocView(roundKey)}
                  onSendToEmployee={(roundKey, payload) => onSendProbationToEmployee(roundKey, payload)}
                  onHrSign={(roundKey, sig) => onHrSignProbationRound(roundKey, sig)} />
              </div>
            </Section>
          )}

          {probDocView && c.probationEvals?.[probDocView] && (
            <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-6" onClick={() => setProbDocView(null)}>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl mx-auto my-2 sm:my-8" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10 no-print">
                  <div className="text-base font-semibold text-slate-900">📄 เอกสารประเมิน Day {c.probationEvals[probDocView].dayLabel}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => window.print()} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg ibtn">🖨 พิมพ์</button>
                    <button onClick={() => setProbDocView(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
                  </div>
                </div>
                <div className="p-6 sm:p-10">
                  <ProbationRoundDoc data={c.probationEvals[probDocView]} candidate={c} round={probDocView} />
                </div>
              </div>
            </div>
          )}

          {c.notes && (
            <Section icon="📝" title="หมายเหตุ">
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded-xl p-3">{c.notes}</div>
            </Section>
          )}

          {showApprovalSetup && (
            <ApprovalSetupModal candidate={c} step={showApprovalSetup} onClose={() => setShowApprovalSetup(false)} onStart={(wf, step) => { onStartApproval(wf, step); setShowApprovalSetup(false); }} />
          )}

          {/* MilestoneEvalModal removed — milestones are automatic, scoring lives in printed eval doc */}

          {showNameForm && (
            <CandidateNameForm initial={c.name} position={c.position} onClose={() => setShowNameForm(false)} onSave={(name) => { onSetName(name); setShowNameForm(false); }} />
          )}
        </Modal>
      );
    }

    function MilestoneEvalModal({ day, onClose, onSave }) {
      const [score, setScore] = useState(8);
      const [note, setNote] = useState('');
      return (
        <Modal title={`บันทึกผลประเมิน Day ${day}`} subtitle="หัวหน้าต้นสังกัด" onClose={onClose}>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">คะแนน (1–10)</label>
              <input type="number" min="1" max="10" className="input mt-1" value={score} onChange={e => setScore(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">หมายเหตุ</label>
              <textarea rows={3} className="input mt-1" value={note} onChange={e => setNote(e.target.value)} placeholder="ผลงาน / จุดแข็ง / สิ่งที่ต้องพัฒนา" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
              <button onClick={() => onSave({ score, note, date: today(), done: true })} className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-lg">บันทึก</button>
            </div>
          </div>
        </Modal>
      );
    }

    // =========================================================================
    // HR Dashboard (main)
    // =========================================================================
    // =========================================================================
    // Reports / KPI view — everything we can extract from the candidate records
    // =========================================================================
    function ReportsView({ candidates }) {
      const R = useMemo(() => {
        const now = new Date(today());
        const yr = now.getFullYear(), mo = now.getMonth();
        const inThisMonth = (iso) => { if (!iso) return false; const d = new Date(iso); return d.getFullYear() === yr && d.getMonth() === mo; };
        const monthLabel = now.toLocaleDateString('th-TH', { month:'long', year:'numeric' });

        const stepDate = (c, step) => c.steps?.find(s => s.step === step)?.completedDate ?? null;
        const offerApprovedDate = (c) => c.approvalWorkflows?.[5]?.completedAt ?? stepDate(c, 5);

        // ---- This month ----
        const openedThisMonth   = candidates.filter(c => inThisMonth(c.process_start_date));
        const filledThisMonth   = candidates.filter(c => { const d = offerApprovedDate(c); return d && inThisMonth(d); });
        const passedThisMonth   = candidates.filter(c => c.probation?.returnDate && inThisMonth(c.probation.returnDate));
        const cancelledTotal    = candidates.filter(c => c.status === 'cancelled' || c.status === 'rejected');

        // ---- Pipeline funnel (active only) ----
        const active = candidates.filter(c => c.status === 'active');
        const funnel = STEPS.map(s => ({ id:s.id, name:s.name, thai:s.thai, count: active.filter(c => c.current_step === s.id).length }));
        const funnelMax = Math.max(1, ...funnel.map(f => f.count));

        // ---- Time-to-fill: process_start → offer approved (Step 5 complete) ----
        const ttfList = candidates.map(c => { const d = offerApprovedDate(c); return d ? daysBetween(c.process_start_date, d) : null; }).filter(x => x != null && x >= 0);
        const avgTTF = ttfList.length ? Math.round(ttfList.reduce((a,b)=>a+b,0)/ttfList.length) : null;

        // ---- Sourcing SLA (Step 2 completed within 30 days) ----
        const step2List = candidates.map(c => { const d = stepDate(c,2); return d ? daysBetween(c.process_start_date, d) : null; }).filter(x => x != null && x >= 0);
        const slaMet = step2List.filter(x => x <= STEP_2_DEADLINE_DAYS).length;
        const slaPct = step2List.length ? Math.round(slaMet/step2List.length*100) : null;

        // ---- Overdue right now ----
        const overdue = active.filter(c => deriveStatus(c).tone === 'red');

        // ---- Approval cycle time (Step 1 & 5): createdAt → completedAt ----
        const apprTimes = [];
        candidates.forEach(c => [1,5].forEach(st => { const wf = c.approvalWorkflows?.[st]; if (wf?.status === 'completed' && wf.createdAt && wf.completedAt) apprTimes.push(daysBetween(wf.createdAt, wf.completedAt)); }));
        const avgApprove = apprTimes.length ? (apprTimes.reduce((a,b)=>a+b,0)/apprTimes.length).toFixed(1) : null;

        // ---- By department ----
        const depts = Array.from(new Set(candidates.map(c => c.department)));
        const byDept = depts.map(d => {
          const list = candidates.filter(c => c.department === d);
          return { dept:d, total:list.length, active:list.filter(c=>c.status==='active').length, passed:list.filter(c=>c.status==='passed').length, overdue:list.filter(c=>deriveStatus(c).tone==='red').length };
        }).sort((a,b)=>b.total-a.total);
        const deptMax = Math.max(1, ...byDept.map(d => d.total));

        // ---- Probation health ----
        const inProb = candidates.filter(c => c.current_step === TOTAL_STEPS && c.status === 'active');
        const probScores = [];
        candidates.forEach(c => { const ms = c.probation?.milestones; if (ms) ['day30','day60','day90','day120'].forEach(k => { if (ms[k]?.score != null) probScores.push(ms[k].score); }); });
        const avgProbScore = probScores.length ? (probScores.reduce((a,b)=>a+b,0)/probScores.length).toFixed(1) : null;
        // upcoming probation evaluations due (next milestone not done, within 14 days)
        const upcomingEvals = [];
        inProb.forEach(c => {
          const start = c.probation?.startDate; if (!start) return;
          [['day30',30],['day60',60],['day90',90],['day120',119]].forEach(([k,d]) => {
            if (!c.probation?.milestones?.[k]?.done) {
              const dueIn = daysBetween(today(), addDays(start, d));
              if (dueIn >= -7 && dueIn <= 21) upcomingEvals.push({ name:c.name, position:c.position, round:k, dueDate:addDays(start,d), dueIn });
            }
          });
        });
        upcomingEvals.sort((a,b)=>a.dueIn-b.dueIn);

        // ---- Compensation snapshot (approved offers, generatedDocs[5]) ----
        const offers = candidates.map(c => c.generatedDocs?.[5]?.data).filter(Boolean);
        const salaries = offers.map(o => parseMoney(o.salary_new)).filter(x => x > 0);
        const incomes  = offers.map(o => o.total_income != null ? o.total_income : parseMoney(o.salary_new)).filter(x => x > 0);
        const avgSalary = salaries.length ? Math.round(salaries.reduce((a,b)=>a+b,0)/salaries.length) : null;
        const avgIncome = incomes.length ? Math.round(incomes.reduce((a,b)=>a+b,0)/incomes.length) : null;

        // ---- Recruiter workload (steps completed by) ----
        const workload = {};
        candidates.forEach(c => (c.steps||[]).forEach(s => { if (s.completedBy) workload[s.completedBy] = (workload[s.completedBy]||0)+1; }));
        const workloadList = Object.entries(workload).map(([name,count]) => ({ name, count })).sort((a,b)=>b.count-a.count);
        const workloadMax = Math.max(1, ...workloadList.map(w => w.count));

        // ---- Type / source mix ----
        const replacement = candidates.filter(c => c.type === 'replacement').length;
        const newHC = candidates.filter(c => c.type === 'new_headcount').length;

        return { monthLabel, openedThisMonth, filledThisMonth, passedThisMonth, cancelledTotal,
          funnel, funnelMax, active, avgTTF, ttfList, slaPct, slaMet, step2List, overdue,
          avgApprove, apprTimes, byDept, deptMax, inProb, avgProbScore, probScores, upcomingEvals,
          avgSalary, avgIncome, offers, workloadList, workloadMax, replacement, newHC };
      }, [candidates]);

      const Bar = ({ value, max, color }) => (
        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width:`${Math.round(value/max*100)}%` }} />
        </div>
      );
      const Big = ({ label, value, sub, tone }) => {
        const map = { slate:'text-slate-900', sky:'text-sky-600', emerald:'text-emerald-600', rose:'text-rose-600', amber:'text-amber-600', indigo:'text-indigo-600' };
        return (
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className={`text-2xl font-bold ${map[tone]||map.slate}`}>{value}</div>
            {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
          </div>
        );
      };
      const Panel = ({ title, hint, children }) => (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
          </div>
          {children}
        </div>
      );

      return (
        <div className="space-y-6">
          {/* This month */}
          <div>
            <div className="text-sm font-semibold text-slate-700 mb-2">📅 สรุปเดือนนี้ · {R.monthLabel}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Big tone="sky"     label="เปิดตำแหน่งใหม่"        value={R.openedThisMonth.length} sub="New requisitions" />
              <Big tone="amber"   label="ได้ผู้สมัคร (อนุมัติ Offer)" value={R.filledThisMonth.length} sub="Positions filled" />
              <Big tone="emerald" label="ผ่านโปรเดือนนี้"        value={R.passedThisMonth.length} sub="Passed probation" />
              <Big tone="rose"    label="เกิน Deadline ตอนนี้"   value={R.overdue.length} sub="ต้อง follow up ด่วน" />
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Big tone="indigo"  label="Time-to-fill เฉลี่ย"   value={R.avgTTF != null ? `${R.avgTTF} วัน` : '—'} sub="เปิดอัตรา → อนุมัติ Offer" />
            <Big tone="sky"     label="Sourcing SLA (≤30 วัน)" value={R.slaPct != null ? `${R.slaPct}%` : '—'} sub={`ทำได้ ${R.slaMet}/${R.step2List.length} ตำแหน่ง`} />
            <Big tone="emerald" label="เวลาอนุมัติเฉลี่ย"       value={R.avgApprove != null ? `${R.avgApprove} วัน` : '—'} sub="Step 1 & 6 (สร้าง → เซ็นครบ)" />
            <Big tone="slate"   label="กำลังดำเนินการ"         value={R.active.length} sub={`ทดแทน ${R.replacement} · ใหม่ ${R.newHC}`} />
          </div>

          {/* Funnel + Department */}
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="🔻 Pipeline Funnel" hint="ตำแหน่งที่ active แยกตาม Step">
              <div className="space-y-2">
                {R.funnel.map(f => (
                  <div key={f.id} className="flex items-center gap-2 text-xs">
                    <div className="w-7 text-slate-400 text-right">{f.id}</div>
                    <div className="w-40 truncate text-slate-600">{f.thai}</div>
                    <Bar value={f.count} max={R.funnelMax} color="bg-sky-500" />
                    <div className="w-6 text-right font-semibold text-slate-700">{f.count}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="🏢 แยกตามแผนก" hint="total · active · ผ่านโปร">
              <div className="space-y-2">
                {R.byDept.map(d => (
                  <div key={d.dept} className="flex items-center gap-2 text-xs">
                    <div className="w-32 truncate text-slate-600">{d.dept}</div>
                    <Bar value={d.total} max={R.deptMax} color="bg-indigo-500" />
                    <div className="w-24 text-right text-slate-500">
                      <b className="text-slate-700">{d.total}</b> · {d.active}🔵 · {d.passed}✓{d.overdue ? ` · ${d.overdue}⚠` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* Probation + Compensation */}
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="🛡 สุขภาพการทดลองงาน" hint={`กำลังทดลองงาน ${R.inProb.length} คน`}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">คะแนนประเมินเฉลี่ย</div><div className="text-xl font-bold text-emerald-600">{R.avgProbScore ?? '—'} <span className="text-xs text-slate-400">/ 10</span></div></div>
                <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">รอบประเมินที่บันทึกแล้ว</div><div className="text-xl font-bold text-slate-700">{R.probScores.length}</div></div>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 mb-1">⏰ รอบประเมินที่ใกล้ถึง</div>
              {R.upcomingEvals.length === 0 ? (
                <div className="text-[11px] text-slate-400 italic">ไม่มีรอบประเมินใน 21 วันข้างหน้า</div>
              ) : (
                <ul className="space-y-1">
                  {R.upcomingEvals.map((e,i) => (
                    <li key={i} className="text-[11px] flex items-center justify-between gap-2">
                      <span className="truncate">{e.round.replace('day','Day ')} · <b>{e.name}</b> ({e.position})</span>
                      <span className={`whitespace-nowrap ${e.dueIn < 0 ? 'text-rose-600' : e.dueIn <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>{e.dueIn < 0 ? `เลย ${Math.abs(e.dueIn)} วัน` : `อีก ${e.dueIn} วัน`} · {fmtDate(e.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="💰 ค่าตอบแทน (จาก Offer ที่อนุมัติ)" hint={`${R.offers.length} ตำแหน่ง`}>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">เงินเดือนเริ่มต้นเฉลี่ย</div><div className="text-xl font-bold text-slate-800">{R.avgSalary != null ? fmtMoney(R.avgSalary) : '—'} <span className="text-xs text-slate-400">บาท</span></div></div>
                <div className="bg-slate-50 rounded-xl p-3"><div className="text-[11px] text-slate-500">รวมรายได้เฉลี่ย / เดือน</div><div className="text-xl font-bold text-emerald-600">{R.avgIncome != null ? fmtMoney(R.avgIncome) : '—'} <span className="text-xs text-slate-400">บาท</span></div></div>
              </div>
              <div className="text-[11px] text-slate-400 mt-3">* ดึงจากเอกสาร Recruitment Approval (เงินเดือนใหม่ + ค่าตอบแทนรวม)</div>
            </Panel>
          </div>

          {/* Recruiter workload */}
          <Panel title="👤 ภาระงานทีม HR (Step ที่ทำเสร็จ)" hint="นับจาก completedBy ในทุกตำแหน่ง">
            <div className="space-y-2">
              {R.workloadList.map(w => (
                <div key={w.name} className="flex items-center gap-2 text-xs">
                  <div className="w-40 truncate text-slate-600">{w.name}</div>
                  <Bar value={w.count} max={R.workloadMax} color="bg-amber-500" />
                  <div className="w-8 text-right font-semibold text-slate-700">{w.count}</div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Data dictionary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600">
            <div className="font-semibold text-slate-800 mb-2">📊 ข้อมูลที่ระบบดึงออกมาทำรายงานได้ (Data available for reporting)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              <div>• จำนวนตำแหน่งเปิด/ปิด/ยกเลิก แยกตามเดือน-แผนก-ประเภท</div>
              <div>• Time-to-fill (เปิดอัตรา → อนุมัติ Offer) ต่อตำแหน่ง</div>
              <div>• เวลาที่ใช้ในแต่ละ Step (จาก completedDate)</div>
              <div>• Sourcing SLA: ปิดได้ใน 30 วันกี่ %</div>
              <div>• เวลาที่ใช้อนุมัติเอกสาร (สร้าง → เซ็นครบ)</div>
              <div>• Funnel: ตำแหน่งค้างอยู่ Step ไหนบ้าง</div>
              <div>• คะแนน + กำหนดรอบประเมินทดลองงาน (Day 30/60/90/119)</div>
              <div>• ค่าตอบแทน: เงินเดือน/รวมรายได้เฉลี่ย แยกตามระดับ (JG/UC)</div>
              <div>• ภาระงานรายบุคคลของทีม HR</div>
              <div>• Audit trail: ใครทำอะไรเมื่อไหร่ (created_by / updated_by / completedBy)</div>
            </div>
          </div>
        </div>
      );
    }

    // ===== User accounts — REAL Supabase Auth users via 'admin-users' Edge Function =====
    // admin สร้าง/รีเซ็ต/ลบ user จริงใน Supabase Auth → login ได้จริง
    // (service_role อยู่ฝั่ง server เท่านั้น · ไม่เก็บรหัสไว้ใน localStorage อีกต่อไป)
    // รหัส 6 หลักที่ generate จะถูกตั้งเป็น password ของ user แล้วโชว์ครั้งเดียวให้ admin จดไปแจ้ง
    const gen6 = () => String(Math.floor(100000 + Math.random() * 900000));

    // Archive of employees who finished probation (Day 90 acknowledged) — kept
    // separate from on-process candidates so the two don't mix. Sits inside the
    // "ผู้ใช้ & รหัสผ่าน" modal, above the user list.
    function PassedProbationPanel({ candidates }) {
      const [open, setOpen] = useState(false);
      const [docKey, setDocKey] = useState(null); // `${id}|${rk}`
      const ROUNDS = [['day30', '30'], ['day60', '60'], ['day90', '90']];
      // probation is "finished" when any round is HR-signed with a closing result
      // (passed/failed) — can happen at Day 30/60/90, not just the last round.
      const closingRound = (c) => {
        for (const [rk] of ROUNDS) {
          const r = c.probationEvals?.[rk];
          if (r?.hr_signed && (r.final_status === 'passed' || r.final_status === 'failed')) return r;
        }
        return null;
      };
      const finished = (candidates || []).filter(c => closingRound(c));
      const passCount = finished.filter(c => closingRound(c)?.final_status === 'passed').length;
      const failCount = finished.length - passCount;
      return (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3">
          <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="text-xs font-semibold text-violet-900">🗂 ประวัติทดลองงาน (จบแล้ว {finished.length}) <span className="font-normal text-violet-600">· ✓ ผ่าน {passCount} · ✕ ไม่ผ่าน {failCount} · เปิดเอกสารย้อนหลังได้</span></span>
            <span className="text-violet-500 text-xs whitespace-nowrap">{open ? '▲ ซ่อน' : '▼ ดู'}</span>
          </button>
          {open && (
            <div className="mt-2 space-y-1.5">
              {finished.length === 0 && <div className="text-[11px] text-slate-400 text-center py-3">ยังไม่มีพนักงานที่ปิดผลทดลองงาน</div>}
              {finished.map(c => {
                const cr = closingRound(c);
                const passed = cr?.final_status === 'passed';
                return (
                  <div key={c.id} className="bg-white border border-violet-100 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs min-w-0">
                        <div className="font-medium text-slate-800 truncate">{c.name || c.position} <span className="text-slate-400">· {c.position}{c.department ? ' · ' + c.department : ''}</span></div>
                        <div className="text-[10px] text-slate-500">ปิดผล Day {cr?.dayLabel || '—'}: {fmtDate(cr?.hr_signedAt)}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${passed ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>{passed ? '✓ ผ่านโปร' : '✕ ไม่ผ่านโปร'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {ROUNDS.map(([rk, d]) => c.probationEvals?.[rk]?.evaluated && (
                        <button key={rk} type="button" onClick={() => setDocKey(k => k === `${c.id}|${rk}` ? null : `${c.id}|${rk}`)}
                          className="text-[11px] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded ibtn">📄 เอกสาร Day {d}</button>
                      ))}
                    </div>
                    {ROUNDS.map(([rk]) => docKey === `${c.id}|${rk}` && c.probationEvals?.[rk] && (
                      <div key={rk} className="mt-2 border border-slate-200 rounded-lg p-3 bg-slate-50 overflow-x-auto">
                        <ProbationRoundDoc data={c.probationEvals[rk]} candidate={c} round={rk} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    function UserManager({ accounts, setAccounts, loading, error, onReload, onClose, candidates = [] }) {
      const [q, setQ] = useState('');
      const [revealed, setRevealed] = useState({});
      const [creating, setCreating] = useState(false);
      const [busy, setBusy] = useState(false);
      const [nf, setNf] = useState({ email:'', name:'', dept:'', role:'user' });
      const withCode = accounts.filter(a => a.hasPassword).length;
      const filtered = accounts.filter(a => (a.email + ' ' + a.name + ' ' + (a.dept||'')).toLowerCase().includes(q.trim().toLowerCase()));
      const issue = async (email) => {
        const a = accounts.find(x => x.email === email);
        if (a?.hasPassword && !confirm('รีเซ็ตรหัสใหม่ให้ ' + email + '? · รหัสเดิมจะใช้ไม่ได้ทันที')) return;
        const code = gen6();
        setBusy(true);
        try {
          await adminResetPassword({ id: a?.id, email, password: code });
          setAccounts(list => list.map(x => x.email === email ? { ...x, hasPassword: true } : x));
          setRevealed(r => ({ ...r, [email]: code }));
          showToast('✓ ออกรหัสใหม่ + อัปเดตใน Supabase แล้ว · login ได้ทันที', 'success');
        } catch (e) {
          showToast('รีเซ็ตรหัสไม่สำเร็จ: ' + (e?.message || e), 'warning');
        } finally { setBusy(false); }
      };
      const createUser = async () => {
        const em = nf.email.trim();
        if (!em.toLowerCase().endsWith('@jianchatea.com')) { showToast('อีเมลต้องเป็น @jianchatea.com', 'warning'); return; }
        if (accounts.some(a => a.email.toLowerCase() === em.toLowerCase())) { showToast('มีอีเมลนี้ในระบบแล้ว', 'warning'); return; }
        if (!nf.name.trim()) { showToast('กรุณากรอกชื่อผู้ใช้', 'warning'); return; }
        const code = gen6();
        setBusy(true);
        try {
          const res = await adminCreateUser({ email: em, password: code, name: nf.name.trim(), dept: nf.dept.trim(), role: nf.role });
          setAccounts(list => [...list, { id: res?.id, email: em, name: nf.name.trim(), role: nf.role, dept: nf.dept.trim(), hasPassword: true }]);
          setRevealed(r => ({ ...r, [em]: code }));
          setNf({ email:'', name:'', dept:'', role:'user' });
          setCreating(false);
          setQ(em);
          showToast('✓ สร้าง user ใน Supabase แล้ว · login ได้จริง', 'success');
        } catch (e) {
          showToast('สร้างไม่สำเร็จ: ' + (e?.message || e), 'warning');
        } finally { setBusy(false); }
      };
      const removeUser = async (email) => {
        const a = accounts.find(x => x.email === email);
        if (!a) return;
        if (a.role === 'admin' && accounts.filter(x => x.role === 'admin').length <= 1) {
          showToast('ลบไม่ได้ · ต้องมี admin อย่างน้อย 1 คนในระบบ', 'warning'); return;
        }
        if (!confirm(`ลบผู้ใช้ "${a.name || email}"\n${email}\n\nผู้ใช้จะถูกลบออกจาก Supabase Auth · เข้าระบบไม่ได้อีก · ยืนยันการลบ?`)) return;
        setBusy(true);
        try {
          await adminDeleteUser({ id: a.id, email });
          setAccounts(list => list.filter(x => x.email !== email));
          setRevealed(r => { const n = { ...r }; delete n[email]; return n; });
          showToast(`🗑️ ลบผู้ใช้ ${a.name || email} แล้ว`, 'success');
        } catch (e) {
          showToast('ลบไม่สำเร็จ: ' + (e?.message || e), 'warning');
        } finally { setBusy(false); }
      };
      return (
        <Modal title="👥 ผู้ใช้ & รหัสผ่าน" subtitle={`${loading ? 'กำลังโหลด…' : `มีรหัสแล้ว ${withCode}/${accounts.length} คน`} · admin สร้าง/ออก/รีเซ็ตรหัส 6 หลัก (Supabase Auth จริง)`} onClose={onClose} wide>
          <PassedProbationPanel candidates={candidates} />
          <div className="flex items-center gap-2 mb-2">
            <input className="input flex-1" placeholder="🔍 ค้นหาชื่อ / อีเมล / แผนก" value={q} onChange={e => setQ(e.target.value)} />
            <button onClick={() => setCreating(v => !v)} disabled={busy} className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg ibtn whitespace-nowrap">+ สร้าง User</button>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-2 text-xs text-rose-800 flex items-center justify-between gap-2">
              <span className="min-w-0">⚠️ โหลด/เชื่อมต่อรายชื่อผู้ใช้ไม่ได้: {error} <span className="text-rose-500">· ตรวจว่า deploy edge function <b>admin-users</b> แล้ว และคุณเป็น admin</span></span>
              {onReload && <button onClick={onReload} className="shrink-0 text-xs bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 px-2.5 py-1 rounded-lg">↻ ลองใหม่</button>}
            </div>
          )}

          {creating && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2 space-y-2">
              <div className="text-xs font-semibold text-emerald-900">สร้างผู้ใช้ใหม่ · กรอกอีเมล @jianchatea.com → ระบบออกรหัส 6 หลักให้</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input text-sm" placeholder="อีเมล @jianchatea.com" value={nf.email} onChange={e => setNf(f => ({ ...f, email:e.target.value }))} />
                <input className="input text-sm" placeholder="ชื่อ-นามสกุล" value={nf.name} onChange={e => setNf(f => ({ ...f, name:e.target.value }))} />
                <input className="input text-sm" placeholder="แผนก (ไม่บังคับ)" value={nf.dept} onChange={e => setNf(f => ({ ...f, dept:e.target.value }))} />
                <select className="input text-sm" value={nf.role} onChange={e => setNf(f => ({ ...f, role:e.target.value }))}>
                  <option value="user">User (ผู้ใช้งาน)</option>
                  <option value="admin">Admin (ผู้ดูแล)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setCreating(false); setNf({ email:'', name:'', dept:'', role:'user' }); }} disabled={busy} className="px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50">ยกเลิก</button>
                <button onClick={createUser} disabled={busy} className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg">{busy ? 'กำลังสร้าง…' : 'สร้าง + ออกรหัส'}</button>
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight:'48vh' }}>
            {loading && <div className="text-center text-slate-400 text-xs py-6">กำลังโหลดรายชื่อผู้ใช้จาก Supabase…</div>}
            {!loading && filtered.length === 0 && <div className="text-center text-slate-400 text-xs py-6">{accounts.length === 0 ? 'ยังไม่มีผู้ใช้ · กด “+ สร้าง User”' : 'ไม่พบผู้ใช้ตามที่ค้นหา'}</div>}
            {filtered.map(a => (
              <div key={a.email} className="flex items-center gap-2 px-2.5 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-800 truncate">{a.name} <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded ${a.role==='admin'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-500'}`}>{a.role==='admin'?'admin':'user'}</span> <span className="text-slate-400">· {a.dept || '—'}</span></div>
                  <div className="text-[10px] text-slate-500 truncate">{a.email}</div>
                  <div className="text-[10px]">
                    {revealed[a.email]
                      ? <span className="text-emerald-700 font-bold tracking-widest">รหัสใหม่ {revealed[a.email]} — แจ้ง user + จดเก็บ (โชว์ครั้งเดียว)</span>
                      : a.hasPassword
                        ? <span className="text-slate-400">✓ มีรหัสแล้ว (เก็บใน Supabase · ดูย้อนหลังไม่ได้)</span>
                        : <span className="text-amber-600">ยังไม่มีรหัส</span>}
                  </div>
                </div>
                <button onClick={() => issue(a.email)} disabled={busy} className={`text-xs px-2.5 py-1 rounded whitespace-nowrap shrink-0 disabled:opacity-50 ${a.hasPassword ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>{a.hasPassword ? 'รีเซ็ต' : 'สร้างรหัส'}</button>
                <button onClick={() => removeUser(a.email)} disabled={busy} title="ลบผู้ใช้ออกจากระบบ" className="text-xs px-2.5 py-1 rounded whitespace-nowrap shrink-0 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50">🗑️ ลบ</button>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-400 mt-2">รหัสถูกตั้งเป็น password ใน Supabase Auth จริง (hash เก็บฝั่ง server) · โชว์บนจอครั้งเดียวตอนออกรหัส · login ได้ทันทีด้วยอีเมล + รหัส 6 หลัก</div>
        </Modal>
      );
    }

    function HRDashboard({ user, candidates, setCandidates }) {
      const [opening, setOpening] = useState(null);
      const [showAddForm, setShowAddForm] = useState(false);
      const [showDirectProbation, setShowDirectProbation] = useState(false);
      const [filter, setFilter] = useState({ dept:'', step:'', type:'', q:'' });
      const [tab, setTab] = useState('pipeline');
      const [showUsers, setShowUsers] = useState(false);
      const [accounts, setAccounts] = useState([]);
      const [accountsLoading, setAccountsLoading] = useState(false);
      const [accountsError, setAccountsError] = useState(null);
      const loadAccountsFromServer = useCallback(() => {
        setAccountsLoading(true); setAccountsError(null);
        adminListUsers()
          .then(list => setAccounts(list))
          .catch(e => setAccountsError(e?.message || String(e)))
          .finally(() => setAccountsLoading(false));
      }, []);
      // โหลดรายชื่อผู้ใช้จาก Supabase เมื่อเปิดหน้าจัดการผู้ใช้ครั้งแรก
      useEffect(() => { if (showUsers && accounts.length === 0 && !accountsError) loadAccountsFromServer(); }, [showUsers, accounts.length, accountsError, loadAccountsFromServer]);

      const departments = useMemo(() => Array.from(new Set(candidates.map(c => c.department))).sort(), [candidates]);

      const filtered = useMemo(() => candidates.filter(c => {
        if (filter.dept && c.department !== filter.dept) return false;
        if (filter.step && c.current_step !== Number(filter.step)) return false;
        if (filter.type && c.type !== filter.type) return false;
        if (filter.q) {
          const q = filter.q.toLowerCase();
          if (![c.name, c.position, c.department].some(s => (s ?? '').toLowerCase().includes(q))) return false;
        }
        return true;
      }), [candidates, filter]);

      const stats = useMemo(() => ({
        total: candidates.length,
        active: candidates.filter(c => c.status === 'active').length,
        passed: candidates.filter(c => c.status === 'passed').length,
        overdue: candidates.filter(c => deriveStatus(c).tone === 'red').length
      }), [candidates]);

      const opened = opening ? candidates.find(c => c.id === opening) : null;

      function patchCandidate(id, fn) {
        const cur = candidates.find(c => c.id === id);
        if (!cur) return;
        const next = fn(cur);
        setCandidates(prev => prev.map(c => c.id === id ? next : c));
        updateCandidate(id, toRow(next)).catch(err => showToast('บันทึกไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
      }
      function advanceStep(c) {
        if (c.current_step >= TOTAL_STEPS) return;
        if (c.current_step === 1 && c.approvalWorkflows?.[1]?.status !== 'completed') {
          showToast('ต้องอนุมัติเปิดอัตราครบทุกคนก่อนถึงจะเริ่มสรรหาได้', 'warning');
          return;
        }
        if (c.current_step === 4 && !c.name) {
          showToast('ใส่ชื่อผู้สมัครก่อนไป Step 5 (Offer Approval)', 'warning');
          return;
        }
        if (c.current_step === 5 && c.approvalWorkflows?.[5]?.status !== 'completed') {
          showToast('ต้องอนุมัติรับพนักงานครบทุกคนก่อน', 'warning');
          return;
        }
        const next = c.current_step + 1;
        patchCandidate(c.id, x => {
          const steps = [...(x.steps ?? []), { step:x.current_step, completedDate:today(), completedBy:user.name }];
          const o = { ...x, current_step:next, steps };
          if (next === TOTAL_STEPS) {
            o.probation = { startDate:today(), evaluationSentDate:today(), returnDate:null, passed:false,
              milestones:{ day30:{done:false}, day60:{done:false}, day90:{done:false}, day120:{done:false} } };
            showToast(`👤 มอบหมายให้ประเมินทดลองงานของ ${c.name} แล้ว · งานอยู่ใน "งานของฉัน" ของผู้ประเมิน`, 'email');
          }
          return o;
        });
        showToast(`ผ่าน Step ${c.current_step} → Step ${next} เรียบร้อย`, 'success');
      }
      function setCandidateName(c, name) {
        const wasEmpty = !c.name;
        patchCandidate(c.id, x => ({ ...x, name }));
        if (wasEmpty) showToast(`บันทึกชื่อ "${name}" สำหรับตำแหน่ง ${c.position}`, 'success');
        else showToast(`แก้ชื่อเป็น "${name}"`, 'success');
      }
      function dropCandidate(c) {
        const droppedName = c.name;
        patchCandidate(c.id, x => {
          // Clear Step 5 approval (candidate-specific) but keep Step 1 approval (position-level)
          const { 5:_, ...keepWorkflows } = x.approvalWorkflows ?? {};
          return {
            ...x,
            name: null,
            current_step: 4,
            steps: [...(x.steps ?? []), { step: x.current_step, completedDate: today(), completedBy: user.name, note: `ผู้สมัคร "${droppedName}" ถอน` }],
            documents: [],
            approvalWorkflows: keepWorkflows,
            probation: {},
            notes: (x.notes ? x.notes + '\n' : '') + `📌 ${today()}: "${droppedName}" ถอน · กลับมาที่ Step 4 ประเมินผู้สมัครรายอื่น`
          };
        });
        showToast(`ลบ "${droppedName}" · กลับไป Step 4 ประเมิน candidate อื่น`, 'warning');
      }
      function cancelPosition(c) {
        deleteCandidate(c.id)
          .then(() => {
            setCandidates(prev => prev.filter(x => x.id !== c.id));
            showToast(`ลบตำแหน่ง "${c.position}" ออกจากระบบเรียบร้อย`, 'warning');
          })
          .catch(err => showToast('ลบไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
      }
      function toggleDoc(c, key) {
        patchCandidate(c.id, x => {
          const docs = (x.documents?.length ? x.documents : DOCUMENT_TEMPLATE.map(d => ({...d, received:false, receivedDate:null})))
            .map(d => d.key === key ? { ...d, received: !d.received, receivedDate: !d.received ? today() : null } : d);
          return { ...x, documents:docs };
        });
      }
      // (removed) markProbationPassed — probation pass/fail now comes ONLY from the
      // per-round evaluation + HR sign-off (hrSignProbationRound). No manual shortcut.
      function uploadFile(c, file) {
        patchCandidate(c.id, x => ({ ...x, files:[...(x.files ?? []), file] }));
        showToast(`📎 อัพโหลด ${file.name} เรียบร้อย`, 'success');
      }
      function startApproval(c, wf, step) {
        patchCandidate(c.id, x => ({
          ...x,
          approvalWorkflows: { ...(x.approvalWorkflows ?? {}), [step]: wf }
        }));
      }
      function sendSelfServiceLink(c) {
        showToast(`📧 ส่ง self-service upload link ไปที่ ${c.name} แล้ว`, 'email');
      }
      function addDocItem(c) {
        const label = prompt('ใส่ชื่อเอกสารที่ต้องการเพิ่ม:');
        if (!label?.trim()) return;
        const key = 'doc_' + Date.now();
        patchCandidate(c.id, x => ({
          ...x,
          documents: [...(x.documents ?? []), { key, label: label.trim(), received: false, receivedDate: null }]
        }));
        showToast(`เพิ่ม "${label}" ใน checklist`, 'success');
      }
      function removeDocItem(c, key) {
        const docs = c.documents ?? [];
        const item = docs.find(d => d.key === key);
        if (!item) return;
        if (!confirm(`ลบ "${item.label}" ออกจาก checklist?`)) return;
        patchCandidate(c.id, x => ({
          ...x,
          documents: (x.documents ?? []).filter(d => d.key !== key)
        }));
        showToast(`ลบ "${item.label}"`, 'warning');
      }
      function updateAttachments(c, files) {
        patchCandidate(c.id, x => ({ ...x, approvalAttachments: files }));
      }
      function cancelStepDoc(c, step) {
        const wf = c.approvalWorkflows?.[step];
        const signed = wf?.approvers?.some(a => a.status === 'approved');
        const msg = signed
          ? 'เอกสารนี้มีผู้ลงนามแล้วบางส่วน · ยืนยันยกเลิก/เรียกคืน? · ลายเซ็นที่มี + การส่งอนุมัติจะถูกลบ เพื่อสร้างใหม่'
          : 'ยกเลิก/เรียกคืนเอกสารของขั้นตอนนี้? · เอกสาร + การส่งอนุมัติ/มอบหมาย จะถูกลบ เพื่อสร้างใหม่ได้';
        if (!confirm(msg)) return;
        patchCandidate(c.id, x => {
          const gd = { ...(x.generatedDocs || {}) }; delete gd[step];
          const w  = { ...(x.approvalWorkflows || {}) }; delete w[step];
          const ds = { ...(x.distributions || {}) }; delete ds[step];
          return { ...x, generatedDocs: gd, approvalWorkflows: w, distributions: ds };
        });
        showToast('ยกเลิก/เรียกคืนเอกสารแล้ว · สร้างใหม่ได้', 'warning');
      }
      function updateDistribution(c, step, log) {
        patchCandidate(c.id, x => ({
          ...x,
          distributions: { ...(x.distributions ?? {}), [step]: log }
        }));
      }
      function updateShortlist(c, list) {
        patchCandidate(c.id, x => ({ ...x, shortlist: list }));
      }
      function createProbationRound(c, roundKey, payload) {
        patchCandidate(c.id, x => ({
          ...x,
          probationEvals: { ...(x.probationEvals ?? {}), [roundKey]: { ...payload } }
        }));
      }
      // HR sends a completed round's result to the employee for acknowledgment.
      // Lands in the employee's own "งานของฉัน" (email = login username).
      async function sendProbationToEmployee(c, roundKey, { employee_email, employee_name }) {
        const email = (employee_email || '').trim();
        if (!email) { showToast('กรอกอีเมลพนักงาน (= username เข้าระบบ)', 'warning'); return; }
        if (!(await ensureAssigneesRegistered([email], showToast))) return;
        const dayLabel = c.probationEvals?.[roundKey]?.dayLabel || '';
        patchCandidate(c.id, x => {
          const pe = { ...(x.probationEvals ?? {}) };
          if (!pe[roundKey]?.evaluated) return x;   // guard: only after evaluator submitted
          pe[roundKey] = {
            ...pe[roundKey],
            sent_to_employee: true,
            employee_email: email,
            employee_name: (employee_name || '').trim() || x.name || '',
            sentToEmployeeAt: new Date().toISOString(),
          };
          return { ...x, probationEvals: pe };
        });
        showToast(`📨 ส่งผลประเมิน Day ${dayLabel} ให้พนักงานลงนามรับทราบแล้ว · งานอยู่ใน "งานของฉัน" ของพนักงาน`, 'email');
      }
      // HR signs LAST (after the employee acknowledges) to certify + close the round.
      // The round's result is applied here: failed -> close (rejected), passed -> close
      // (passed/permanent), extended -> continue to the next round. Works at ANY round.
      async function hrSignProbationRound(c, roundKey, signature) {
        if (!signature) { showToast('กรุณาลงลายเซ็น HR ก่อน', 'warning'); return; }
        const ip = await getClientIp();
        patchCandidate(c.id, x => {
          const pe = { ...(x.probationEvals ?? {}) };
          const r = pe[roundKey];
          if (!r?.acknowledged) return x;   // guard: only after employee acknowledged
          pe[roundKey] = { ...r, hr_signature: signature, hr_signedAt: new Date().toISOString(), hr_ip: ip, hr_name: user.name, hr_signed: true };
          let status = x.status;
          if (r.final_status === 'passed') status = 'passed';
          else if (r.final_status === 'failed') status = 'rejected';
          // 'extended' -> keep going to the next round (no status change)
          return { ...x, probationEvals: pe, status };
        });
        const fin = c.probationEvals?.[roundKey]?.final_status;
        showToast(
          fin === 'passed' ? '✓ HR รับรอง · ผ่านโปร บรรจุพนักงานประจำ · ปิดกระบวนการ'
          : fin === 'failed' ? '✓ HR รับรอง · ไม่ผ่านโปร · ปิดกระบวนการ'
          : '✓ HR รับรอง · ปิดรอบนี้ · ไปประเมินรอบถัดไป', 'success');
      }
      async function saveGeneratedDoc(c, step, data, approvers) {
        const docInfo = DOC_LABELS[step];
        const willAssign = approvers?.length && APPROVAL_STEPS.includes(step) && approvers.every(a => a.name && a.email);
        // Block if any approver email has no real account yet (must create user first)
        if (willAssign && !(await ensureAssigneesRegistered(approvers.map(a => a.email), showToast))) return;
        const slug = (c.name || c.position).split(' ')[0].toLowerCase().replace(/[^a-z0-9ก-๙]/gi, '');
        const docName = `${docInfo.file}-${slug}.pdf`;
        const nowIso = new Date().toISOString();
        patchCandidate(c.id, x => {
          const newDocs = { ...(x.generatedDocs ?? {}), [step]: { docName, data, createdAt: nowIso, createdBy: user.name } };
          let newWorkflows = x.approvalWorkflows ?? {};
          // Auto-create workflow if approvers provided AND this is an approval step
          if (approvers && approvers.length > 0 && APPROVAL_STEPS.includes(step) && approvers.every(a => a.name && a.email)) {
            newWorkflows = {
              ...newWorkflows,
              [step]: {
                id: 'wf_' + Date.now(),
                status: 'in_progress',
                documentName: docName,
                createdAt: nowIso,
                approvers: approvers.map((a, i) => ({
                  ...a, id:'a'+(i+1), sequence:i+1,
                  status: i === 0 ? 'pending' : 'waiting',
                  signedAt: null, ip:null
                }))
              }
            };
          }
          return { ...x, generatedDocs:newDocs, approvalWorkflows:newWorkflows };
        });
        if (approvers?.length && APPROVAL_STEPS.includes(step) && approvers.every(a => a.name && a.email)) {
          showToast(`📨 สร้างเอกสาร + มอบหมายให้ ${approvers[0].name} (${approvers[0].email}) เซ็น · งานอยู่ใน "งานของฉัน" ของเขา`, 'email');
        } else {
          showToast(`สร้างเอกสาร ${docInfo.name} เรียบร้อย`, 'success');
        }
      }
      function saveMilestoneEval(c, day, data) {
        patchCandidate(c.id, x => ({
          ...x,
          probation: {
            ...(x.probation ?? {}),
            milestones: { ...(x.probation?.milestones ?? {}), [`day${day}`]: data }
          }
        }));
        showToast(`✅ บันทึก Day ${day} ของ ${c.name} เรียบร้อย`, 'success');
      }
      function addCandidate(form) {
        const newC = {
          ...form,
          current_step: 1,
          status: 'active',
          steps: [],
          documents: [],
          probation: {},
          files: [],
          created_by: user.name
        };
        createCandidate(toRow(newC))
          .then(row => {
            setCandidates(prev => [fromRow(row), ...prev]);
            setShowAddForm(false);
            showToast(`เพิ่ม ${form.name || form.position} เรียบร้อย · เริ่ม Step 1`, 'success');
          })
          .catch(err => showToast('เพิ่มไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
      }
      // Create an employee directly in probation (Step 6) — no recruitment steps.
      function addDirectProbationEmployee(form) {
        const newC = {
          name: form.name.trim(),
          position: form.position.trim(),
          department: form.department.trim(),
          type: 'new_headcount',   // DB check allows replacement/new_headcount only; "direct" marker lives in probation.direct
          process_start_date: form.start_date,
          current_step: TOTAL_STEPS,
          status: 'active',
          steps: [],
          documents: [],
          probation: { startDate: form.start_date, direct: true },
          files: [],
          notes: form.notes?.trim() || null,
          created_by: user.name,
        };
        createCandidate(toRow(newC))
          .then(row => {
            setCandidates(prev => [fromRow(row), ...prev]);
            setShowDirectProbation(false);
            showToast(`เพิ่ม ${form.name} เข้าสู่ Probation แล้ว · สร้างเอกสารประเมินได้เลย`, 'success');
          })
          .catch(err => showToast('เพิ่มไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
      }

      return (
        <div className="min-h-screen">
          <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 grid place-items-center text-white text-lg">💼</div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-slate-900">Recruitment 120 Days</h1>
                  <p className="text-xs text-slate-500">ระบบติดตามกระบวนการสรรหา · HR Internal</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="hidden md:inline">{fmtDate(today())}</span>
                <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {user.name}
                </span>
                <button onClick={() => setShowDirectProbation(true)} className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-2 rounded-lg ibtn" title="เพิ่มพนักงานเข้าประเมินทดลองงานโดยตรง (ไม่ผ่านสรรหา)">
                  🛡 <span className="hidden sm:inline">เข้าประเมินทดลองงาน</span>
                </button>
                <button onClick={() => setShowAddForm(true)} className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-3 py-2 rounded-lg ibtn">
                  <span className="text-base leading-none">+</span> New Requisition
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex bg-slate-100 rounded-xl p-1 text-sm">
                <button onClick={() => setTab('pipeline')} className={`px-4 py-1.5 rounded-lg font-medium transition ${tab==='pipeline' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>📋 Pipeline</button>
                <button onClick={() => setTab('reports')} className={`px-4 py-1.5 rounded-lg font-medium transition ${tab==='reports' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>📊 Reports / KPI</button>
              </div>
              <button onClick={() => setShowUsers(true)} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium px-4 py-1.5 rounded-xl ibtn">👥 ผู้ใช้ & รหัสผ่าน</button>
            </div>

            {tab === 'reports' && <ReportsView candidates={candidates} />}

            {tab === 'pipeline' && (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="ทั้งหมด" value={stats.total} tone="slate" icon="👥" />
              <Stat label="กำลังดำเนินการ" value={stats.active} tone="sky" icon="📋" />
              <Stat label="ผ่านโปร" value={stats.passed} tone="emerald" icon="✓" />
              <Stat label="เกิน Deadline" value={stats.overdue} tone="rose" icon="⚠" />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input value={filter.q} onChange={e => setFilter(f => ({ ...f, q:e.target.value }))} placeholder="ค้นหาชื่อ / ตำแหน่ง / แผนก…" className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <select value={filter.dept} onChange={e => setFilter(f => ({ ...f, dept:e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <option value="">ทุกแผนก</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={filter.step} onChange={e => setFilter(f => ({ ...f, step:e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <option value="">ทุก Step</option>
                {STEPS.map(s => <option key={s.id} value={s.id}>Step {s.id} · {s.name}</option>)}
              </select>
              <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type:e.target.value }))} className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
                <option value="">ทุกประเภท</option>
                <option value="replacement">ทดแทนคนลาออก</option>
                <option value="new_headcount">อัตราใหม่</option>
              </select>
              {Object.values(filter).some(Boolean) && (
                <button onClick={() => setFilter({dept:'', step:'', type:'', q:''})} className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1">ล้าง</button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
                ไม่พบรายการตามตัวกรอง
              </div>
            ) : (
              <div className="space-y-8">
                <SectionGroup
                  title="🔍 Open Position"
                  subtitle="ยังไม่มีผู้สมัคร · Step 1–4 (Requisition → Sourcing → Screening → Interview Evaluation)"
                  accent="sky"
                  candidates={filtered.filter(c => bucketOf(c) === 'open')}
                  onOpen={(id) => setOpening(id)}
                />
                <SectionGroup
                  title="✍️ Process รับเข้าทำงาน"
                  subtitle="ได้ผู้สมัครแล้ว · Step 4–5 (Interview Evaluation → Offer Approval)"
                  accent="amber"
                  candidates={filtered.filter(c => bucketOf(c) === 'onboarding')}
                  onOpen={(id) => setOpening(id)}
                />
                <SectionGroup
                  title="🛡 Process Probation"
                  subtitle="ทดลองงาน 120 วัน · Step 6 + ผ่านโปรแล้ว"
                  accent="emerald"
                  candidates={filtered.filter(c => bucketOf(c) === 'probation')}
                  onOpen={(id) => setOpening(id)}
                />
              </div>
            )}
            </>)}
          </main>

          {opened && (
            <Detail
              c={opened}
              onClose={() => setOpening(null)}
              onAdvance={() => advanceStep(opened)}
              onToggleDoc={(key) => toggleDoc(opened, key)}
              onUploadFile={(f) => uploadFile(opened, f)}
              onStartApproval={(wf) => startApproval(opened, wf)}
              onSendSelfServiceLink={() => sendSelfServiceLink(opened)}
              onMilestoneEval={(day, data) => saveMilestoneEval(opened, day, data)}
              onSetName={(name) => setCandidateName(opened, name)}
              onDropCandidate={() => { dropCandidate(opened); setOpening(null); }}
              onCancelPosition={() => { cancelPosition(opened); setOpening(null); }}
              onSaveDoc={(step, data, approvers) => saveGeneratedDoc(opened, step, data, approvers)}
              onUpdateDistribution={(step, log) => updateDistribution(opened, step, log)}
              onUpdateAttachments={(files) => updateAttachments(opened, files)}
              onCancelStepDoc={(step) => cancelStepDoc(opened, step)}
              onUpdateShortlist={(list) => updateShortlist(opened, list)}
              onAddDoc={() => addDocItem(opened)}
              onRemoveDoc={(key) => removeDocItem(opened, key)}
              onCreateProbationRound={(roundKey, payload) => createProbationRound(opened, roundKey, payload)}
              onSendProbationToEmployee={(roundKey, payload) => sendProbationToEmployee(opened, roundKey, payload)}
              onHrSignProbationRound={(roundKey, sig) => hrSignProbationRound(opened, roundKey, sig)}
            />
          )}

          {showAddForm && (
            <CandidateAddForm
              onClose={() => setShowAddForm(false)}
              onSave={addCandidate}
              departments={departments.length ? departments : ['Operations','Marketing','Sales & BD','Supply Chain','Finance','HR & People','IT','R&D / Product']}
            />
          )}

          {showDirectProbation && (
            <DirectProbationForm
              onClose={() => setShowDirectProbation(false)}
              onSave={addDirectProbationEmployee}
              departments={departments.length ? departments : ['Operations','Marketing','Sales & BD','Supply Chain','Finance','HR & People','IT','R&D / Product']}
            />
          )}

          {showUsers && (
            <UserManager accounts={accounts} setAccounts={setAccounts}
              loading={accountsLoading} error={accountsError} onReload={loadAccountsFromServer}
              candidates={candidates}
              onClose={() => setShowUsers(false)} />
          )}
        </div>
      );
    }


    // =========================================================================
    // ===================== "งานของฉัน" (ApproverView) =======================
    // Real data: shows ONLY work assigned to the logged-in user (by email =
    // username). Three channels:
    //   • sign      → approval_workflows[1|5].approvers[].email
    //   • assigned  → distributions[step][].email  (step 3 = shortlist view,
    //                 step 4 = interview scorecard fill)
    //   • probation → generated_docs[6].data.evaluator_email
    // All actions write back to the candidate row via patchCandidate (DB).
    // =========================================================================
    const SIGN_DOC_RENDERER = { 1: 'manpower', 5: 'approval' };

    function normalizeEmail(e) {
      return usernameToEmail(String(e || '')).toLowerCase();
    }

    function buildMyTasks(candidates, myEmail) {
      const me = normalizeEmail(myEmail);
      const out = [];
      if (!me) return out;
      for (const c of (candidates || [])) {
        const label = c.name || c.position || 'ผู้สมัคร';
        // 1) SIGN — approval workflows
        const wfs = c.approvalWorkflows || {};
        for (const k of Object.keys(wfs)) {
          const wf = wfs[k];
          if (!wf || !Array.isArray(wf.approvers)) continue;
          const mine = wf.approvers.find(a => normalizeEmail(a.email) === me);
          if (!mine) continue;
          const state = mine.status === 'approved' ? 'done'
            : mine.status === 'rejected' ? 'rejected'
            : mine.status === 'pending' ? 'todo' : 'waiting';
          out.push({
            kind: 'sign', id: `${c.id}|sign|${k}`, candidateId: c.id, candidate: c,
            step: Number(k), wf, mine, state,
            title: `เซ็นอนุมัติ · ${DOC_LABELS[k]?.thai || 'เอกสาร'}`, subject: label,
          });
        }
        // 2) SHORTLIST review (Step 3) — assignment is stored in shortlist[].sentTo[]
        //    (ShortlistCandidateCards writes here, NOT distributions[3])
        const sl = c.shortlist || [];
        const myShortlist = sl.filter(it => (it.sentTo || []).some(s => normalizeEmail(s.email) === me));
        if (myShortlist.length) {
          const allDone = myShortlist.every(it => it.verdict);
          out.push({
            kind: 'view-shortlist', id: `${c.id}|shortlist`, candidateId: c.id, candidate: c,
            step: 3, mineItems: myShortlist, state: allDone ? 'done' : 'todo',
            title: 'พิจารณา Shortlist ผู้สมัคร', subject: label,
          });
        }
        // 3) ASSIGNED via distributions — Step 4 scorecard · generic ack
        const dists = c.distributions || {};
        for (const k of Object.keys(dists)) {
          const step = Number(k);
          for (const e of (dists[k] || [])) {
            if (normalizeEmail(e.email) !== me) continue;
            const kind = step === 4 ? 'eval-scorecard' : 'ack';
            out.push({
              kind, id: `${c.id}|dist|${k}|${e.id}`, candidateId: c.id, candidate: c,
              step, entry: e, docData: c.generatedDocs?.[step]?.data,
              state: e.done ? 'done' : 'todo',
              title: kind === 'eval-scorecard' ? 'ประเมินสัมภาษณ์ (Scorecard)' : 'งานที่ได้รับมอบหมาย',
              subject: label,
            });
          }
        }
        // 4) PER-ROUND probation — evaluator fills one document per round (Day 30/60/90)
        const pevals = c.probationEvals || {};
        const who = c.name || c.position || '';
        for (const rk of Object.keys(pevals)) {
          const ev = pevals[rk];
          if (!ev) continue;
          // Evaluator: fill in one round's evaluation
          if (normalizeEmail(ev.evaluator_email) === me) {
            out.push({
              kind: 'prob-eval', id: `${c.id}|probeval|${rk}`, candidateId: c.id, candidate: c,
              step: 6, roundKey: rk, dayLabel: ev.dayLabel, ev,
              state: ev.evaluated ? 'done' : 'todo',
              title: `ประเมินทดลองงาน Day ${ev.dayLabel} · ${who}`, subject: label,
            });
          }
          // Employee (evaluatee): sign to acknowledge the result after HR sends it
          if (ev.sent_to_employee && normalizeEmail(ev.employee_email) === me) {
            out.push({
              kind: 'prob-ack', id: `${c.id}|proback|${rk}`, candidateId: c.id, candidate: c,
              step: 6, roundKey: rk, dayLabel: ev.dayLabel, ev,
              state: ev.acknowledged ? 'done' : 'todo',
              title: `รับทราบผลประเมิน Day ${ev.dayLabel} · ${who}`, subject: label,
            });
          }
        }
      }
      const rank = { todo: 0, waiting: 1, rejected: 2, done: 3 };
      return out.sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9));
    }

    const TASK_STATE_BADGE = {
      todo:     { txt: 'ต้องทำ',    cls: 'bg-amber-100 text-amber-800 border-amber-200' },
      waiting:  { txt: 'รอคิว',     cls: 'bg-slate-100 text-slate-500 border-slate-200' },
      done:     { txt: 'เสร็จแล้ว', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      rejected: { txt: 'ปฏิเสธ',    cls: 'bg-rose-100 text-rose-700 border-rose-200' },
    };

    function ApproverView({ candidates, myEmail, myName, patchCandidate }) {
      const tasks = useMemo(() => buildMyTasks(candidates, myEmail), [candidates, myEmail]);
      const [activeId, setActiveId] = useState(null);
      const [signature, setSignature] = useState(null);
      const [signComment, setSignComment] = useState('');
      const [rejectMode, setRejectMode] = useState(false);
      const [rejectReason, setRejectReason] = useState('');
      const [showForm, setShowForm] = useState(false);
      const [showDoc, setShowDoc] = useState(false);
      const [verdicts, setVerdicts] = useState({});

      const active = tasks.find(t => t.id === activeId) || null;

      const backToList = () => {
        setActiveId(null); setSignature(null); setSignComment(''); setRejectMode(false);
        setRejectReason(''); setShowForm(false); setShowDoc(false); setVerdicts({});
      };

      // open an attached file via a short-lived signed URL
      async function openAttachment(path) {
        try {
          const url = await getSignedUrl(path);
          window.open(url, '_blank', 'noopener');
        } catch (e) {
          showToast('เปิดเอกสารไม่สำเร็จ: ' + (e?.message || ''), 'warning');
        }
      }

      // ---- write-back handlers ----
      const [signing, setSigning] = useState(false);
      async function doSign(task) {
        if (!signature) { showToast('กรุณาวาดลายเซ็นก่อน', 'warning'); return; }
        setSigning(true);
        const ip = await getClientIp();   // real IP for audit trail (or '-' if unavailable)
        patchCandidate(task.candidateId, x => {
          const wfs = { ...(x.approvalWorkflows || {}) };
          const wf = { ...wfs[task.step] };
          const approvers = (wf.approvers || []).map(a => ({ ...a }));
          const i = approvers.findIndex(a => normalizeEmail(a.email) === normalizeEmail(task.mine.email));
          if (i < 0) return x;
          approvers[i] = { ...approvers[i], status: 'approved', signedAt: new Date().toISOString(), ip, signature_data: signature, comment: signComment.trim() };
          const nextIdx = approvers.findIndex(a => a.status === 'waiting');
          if (nextIdx >= 0) { approvers[nextIdx] = { ...approvers[nextIdx], status: 'pending' }; wf.status = 'in_progress'; }
          else { wf.status = 'completed'; wf.completedAt = new Date().toISOString(); }
          wf.approvers = approvers;
          wfs[task.step] = wf;
          return { ...x, approvalWorkflows: wfs };
        });
        showToast('✓ ลงนามเรียบร้อย · บันทึกลงระบบแล้ว', 'success');
        setSigning(false);
        backToList();
      }

      function doReject(task) {
        if (!rejectReason.trim()) return;
        patchCandidate(task.candidateId, x => {
          const wfs = { ...(x.approvalWorkflows || {}) };
          const wf = { ...wfs[task.step] };
          wf.approvers = (wf.approvers || []).map(a =>
            normalizeEmail(a.email) === normalizeEmail(task.mine.email)
              ? { ...a, status: 'rejected', rejectedAt: new Date().toISOString(), rejectReason: rejectReason.trim() }
              : { ...a });
          wf.status = 'rejected';
          wfs[task.step] = wf;
          return { ...x, approvalWorkflows: wfs };
        });
        showToast('ส่งคำปฏิเสธให้ HR แล้ว', 'warning');
        backToList();
      }

      async function saveScorecard(task, data) {
        const ip = await getClientIp();   // stamp the evaluator's signature for audit
        const stamped = { ...data, signedAt: new Date().toISOString(), signature_ip: ip };
        patchCandidate(task.candidateId, x => {
          const gd = { ...(x.generatedDocs || {}) };
          gd[4] = { docName: gd[4]?.docName || 'interview-evaluation.pdf', data: stamped, createdAt: new Date().toISOString(), createdBy: myName };
          const dists = { ...(x.distributions || {}) };
          dists[4] = (dists[4] || []).map(e => e.id === task.entry.id ? { ...e, done: true, completedAt: new Date().toISOString() } : e);
          return { ...x, generatedDocs: gd, distributions: dists };
        });
        showToast('✓ ส่งผลประเมิน + ลงนามกลับ HR แล้ว', 'success');
        backToList();
      }

      // Evaluator submits ONE round (Day 30/60/90)
      async function saveProbationRound(task, data) {
        const ip = await getClientIp();
        const rk = task.roundKey;
        patchCandidate(task.candidateId, x => {
          const pe = { ...(x.probationEvals || {}) };
          pe[rk] = {
            ...(pe[rk] || {}),
            scores: data.scores, comment: data.comment,
            evaluator_signature: data.evaluator_signature, evaluator_signedAt: new Date().toISOString(), evaluator_ip: ip,
            evaluated: true,
            ...(data.final_status ? { final_status: data.final_status } : {}),
          };
          return { ...x, probationEvals: pe };
        });
        showToast('✓ ส่งผลประเมิน + ลงนามกลับ HR แล้ว', 'success');
        backToList();
      }

      // Employee acknowledges ONE round's result (signs)
      async function ackProbationRound(task, signature) {
        if (!signature) { showToast('กรุณาลงลายเซ็นรับทราบก่อน', 'warning'); return; }
        const ip = await getClientIp();
        const rk = task.roundKey;
        patchCandidate(task.candidateId, x => {
          const pe = { ...(x.probationEvals || {}) };
          pe[rk] = { ...(pe[rk] || {}), ack_signature: signature, ack_signedAt: new Date().toISOString(), ack_ip: ip, acknowledged: true };
          return { ...x, probationEvals: pe };
        });
        showToast('✓ ลงนามรับทราบแล้ว · รอ HR ลงนามรับรองปิดรอบ', 'success');
        backToList();
      }

      // send ONE candidate's verdict back to HR (1 button per shortlisted candidate)
      function saveShortlistVerdict(task, itemKey, verdict) {
        if (!verdict) return;
        patchCandidate(task.candidateId, x => {
          const sl = (x.shortlist || []).map(it => {
            const key = it.id || it.name;
            return key === itemKey
              ? { ...it, verdict, verdictAt: new Date().toISOString(), verdictBy: myName }
              : it;
          });
          return { ...x, shortlist: sl };
        });
        showToast(verdict === 'pass' ? '✓ ส่งผล "ผ่าน" กลับ HR แล้ว' : '✕ ส่งผล "ไม่ผ่าน" กลับ HR แล้ว', 'success');
      }

      function markAckDone(task) {
        patchCandidate(task.candidateId, x => {
          const dists = { ...(x.distributions || {}) };
          dists[task.step] = (dists[task.step] || []).map(e => e.id === task.entry.id ? { ...e, done: true, completedAt: new Date().toISOString() } : e);
          return { ...x, distributions: dists };
        });
        showToast('✓ รับทราบงานแล้ว', 'success');
        backToList();
      }

      // ---- LIST VIEW ----
      if (!active) {
        const todo = tasks.filter(t => t.state === 'todo');
        const others = tasks.filter(t => t.state !== 'todo');
        return (
          <div className="min-h-screen py-6 px-4">
            <div className="max-w-3xl mx-auto">
              <div className="mb-4">
                <h1 className="text-xl font-semibold text-slate-900">📥 งานของฉัน</h1>
                <p className="text-xs text-slate-500 mt-1">{myName} · {myEmail} · งานที่ถูกมอบหมายให้คุณโดยตรง</p>
              </div>

              {tasks.length === 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
                  <div className="text-5xl mb-3">✅</div>
                  <div className="text-sm font-medium text-slate-700">ยังไม่มีงานที่มอบหมายให้คุณ</div>
                  <div className="text-xs text-slate-400 mt-1">เมื่อ HR มอบหมายงานอนุมัติ/ประเมินมาที่อีเมลนี้ จะแสดงที่นี่</div>
                </div>
              )}

              {todo.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-semibold text-amber-700 mb-2">⏳ รอดำเนินการ ({todo.length})</div>
                  <div className="space-y-2">
                    {todo.map(t => <TaskCard key={t.id} t={t} onOpen={() => setActiveId(t.id)} />)}
                  </div>
                </div>
              )}

              {others.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-2">📋 งานอื่นๆ ({others.length})</div>
                  <div className="space-y-2">
                    {others.map(t => <TaskCard key={t.id} t={t} onOpen={() => setActiveId(t.id)} />)}
                  </div>
                </div>
              )}

              <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs text-sky-800 mt-4">
                🔐 เข้าระบบด้วยบัญชีพนักงาน · ทุกการลงนาม/ประเมินบันทึกเวลาลงระบบเพื่อ audit
              </div>
            </div>
          </div>
        );
      }

      // ---- DETAIL VIEW ----
      const c = active.candidate;
      const badge = TASK_STATE_BADGE[active.state];

      return (
        <div className="min-h-screen py-6 px-4">
          <div className="max-w-3xl mx-auto">
            <button onClick={backToList} className="text-xs text-slate-500 hover:text-slate-800 mb-3">← กลับไปงานของฉัน</button>

            <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-2xl p-5 mb-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-slate-900">{active.title}</h1>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.txt}</span>
              </div>
              <div className="text-sm text-slate-600 mt-1">{c.name && c.name !== '(ยังไม่ระบุชื่อผู้สมัคร)' ? `${c.name} · ` : ''}{c.position}{c.department ? ` · ${c.department}` : ''}</div>
            </div>

            {/* ===== SIGN ===== */}
            {active.kind === 'sign' && (() => {
              const docData = c.generatedDocs?.[active.step]?.data || {};
              const DocComp = SIGN_DOC_RENDERER[active.step] === 'manpower' ? ManpowerRequestDoc : ApprovalDoc;
              const approvers = active.wf.approvers || [];
              return (
                <>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                    <div className="text-xs font-semibold text-slate-600 mb-2">📎 เอกสาร · {c.generatedDocs?.[active.step]?.docName || ''}</div>
                    <div className="border border-slate-200 rounded-xl p-4">
                      <DocComp data={docData} candidate={c} />
                    </div>
                  </div>

                  {(() => {
                    const atts = [...(c.approvalAttachments || []), ...((docData.attachments) || [])];
                    if (!atts.length) return null;
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-4">
                        <div className="text-xs font-semibold text-amber-900 mb-2">📎 เอกสารแนบประกอบการพิจารณา ({atts.length}) · กดเพื่อเปิดดู</div>
                        <ul className="space-y-1.5">
                          {atts.map((a, i) => (
                            <li key={i} className="text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                              <span className="truncate">📄 {a.name || a}</span>
                              {a.path
                                ? <button onClick={() => openAttachment(a.path)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg ibtn whitespace-nowrap">เปิดดู ↗</button>
                                : <span className="text-[10px] text-slate-400 whitespace-nowrap">ไฟล์เก่า · เปิดไม่ได้</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}

                  <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                    <div className="text-xs font-semibold text-slate-600 mb-2">📋 ลำดับการอนุมัติ</div>
                    <ol className="space-y-2">
                      {approvers.map((p, i) => {
                        const isMe = normalizeEmail(p.email) === normalizeEmail(active.mine.email);
                        const tone = p.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : p.status === 'rejected' ? 'bg-rose-100 text-rose-700 border-rose-200'
                          : p.status === 'pending' ? 'bg-sky-100 text-sky-800 border-sky-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200';
                        return (
                          <li key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${tone} ${isMe ? 'ring-2 ring-sky-400' : ''}`}>
                            <span className="w-6 h-6 rounded-full bg-white grid place-items-center text-xs font-bold">{i + 1}</span>
                            <div className="flex-1 text-sm">
                              <div className="font-medium">{p.name} {isMe && <span className="text-xs text-sky-700">(คุณ)</span>}</div>
                              <div className="text-xs">{p.role}</div>
                            </div>
                            <div className="text-xs">
                              {p.status === 'approved' && `✓ เซ็นแล้ว ${fmtDateTime(p.signedAt)}`}
                              {p.status === 'pending' && 'รอลงนาม'}
                              {p.status === 'waiting' && 'รอคิว'}
                              {p.status === 'rejected' && '✕ ปฏิเสธ'}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {active.state === 'todo' && !rejectMode && (
                    <>
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                        <div className="text-xs font-semibold text-slate-600 mb-2">💬 ข้อเสนอแนะเพิ่มเติม <span className="font-normal text-slate-400">(ไม่บังคับ · จะแสดงในส่วนที่ 4 ของเอกสาร)</span></div>
                        <textarea rows={2} maxLength={200} value={signComment} onChange={e => setSignComment(e.target.value.slice(0, 200))} className="input" placeholder="พิมพ์ความเห็น/ข้อเสนอแนะ (ถ้ามี)..." />
                        <div className={`text-[10px] text-right mt-1 ${signComment.length >= 200 ? 'text-amber-600' : 'text-slate-400'}`}>{signComment.length}/200 ตัวอักษร · กระชับเพื่อให้เอกสารพอดี 1 หน้า</div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                        <div className="text-xs font-semibold text-slate-600 mb-2">✍️ ลายเซ็น</div>
                        <SignaturePad onChange={setSignature} />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 mb-4">
                        <button onClick={() => doSign(active)} disabled={!signature || signing}
                          className={`flex-1 py-3 rounded-xl text-white font-medium text-sm ibtn ${signature && !signing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-300 cursor-not-allowed'}`}>
                          {signing ? 'กำลังลงนาม…' : '✓ ลงนามและอนุมัติ'}
                        </button>
                        <button onClick={() => setRejectMode(true)} className="flex-1 py-3 rounded-xl border-2 border-rose-300 text-rose-700 hover:bg-rose-50 font-medium text-sm ibtn">
                          ✕ ปฏิเสธพร้อมเหตุผล
                        </button>
                      </div>
                    </>
                  )}

                  {active.state === 'todo' && rejectMode && (
                    <div className="bg-white border border-rose-200 rounded-2xl p-5 mb-4">
                      <div className="text-sm font-semibold text-slate-900 mb-2">ปฏิเสธคำขอ</div>
                      <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="input" placeholder="ระบุเหตุผล..." />
                      <div className="flex justify-end gap-2 mt-3">
                        <button onClick={() => { setRejectMode(false); setRejectReason(''); }} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900">ยกเลิก</button>
                        <button onClick={() => doReject(active)} disabled={!rejectReason.trim()}
                          className={`px-4 py-2 text-sm rounded-lg ${rejectReason.trim() ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-slate-200 text-slate-400'}`}>ส่งคำปฏิเสธ</button>
                      </div>
                    </div>
                  )}

                  {active.state === 'waiting' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-sm text-amber-900 mb-4">⏳ รอผู้อนุมัติลำดับก่อนหน้าเซ็นก่อน · ระบบจะแจ้งเมื่อถึงตาคุณ</div>
                  )}
                  {active.state === 'done' && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-900 mb-4">✓ คุณลงนามเอกสารนี้แล้ว</div>
                  )}
                  {active.state === 'rejected' && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center text-sm text-rose-800 mb-4">✕ เอกสารนี้ถูกปฏิเสธ</div>
                  )}
                </>
              );
            })()}

            {/* ===== EVAL: SCORECARD ===== */}
            {active.kind === 'eval-scorecard' && (
              <>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 text-center">
                  <div className="text-5xl mb-3">📝</div>
                  <div className="text-sm font-semibold text-slate-900 mb-1">แบบประเมินการสัมภาษณ์</div>
                  <div className="text-xs text-slate-500 mb-4">ติ๊กคะแนน + พิมพ์ความเห็นในระบบ · ไม่ต้องดาวน์โหลด PDF</div>
                  {active.state === 'done'
                    ? <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">✓ ส่งผลประเมินกลับ HR แล้ว</div>
                    : <button onClick={() => setShowForm(true)} className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-medium text-sm ibtn">📝 เปิดฟอร์มประเมิน</button>}
                </div>
                {showForm && (
                  <ScorecardEvalForm initial={c.generatedDocs?.[4]?.data} candidate={c} user={{ name: myName }}
                    onClose={() => setShowForm(false)} onSave={(data) => saveScorecard(active, data)} />
                )}
              </>
            )}

            {/* ===== EVAL: PROBATION (per round) ===== */}
            {active.kind === 'prob-eval' && (
              <>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 text-center">
                  <div className="text-5xl mb-3">📋</div>
                  <div className="text-sm font-semibold text-slate-900 mb-1">ประเมินทดลองงาน · Day {active.dayLabel}</div>
                  <div className="text-xs text-slate-500 mb-4">ติ๊กคะแนน + คอมเมนต์ + ลงนาม{active.roundKey === 'day90' ? ' + สรุปผ่าน/ไม่ผ่าน' : ''}</div>
                  {active.state === 'done'
                    ? <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">✓ ส่งผลประเมิน Day {active.dayLabel} กลับ HR แล้ว</div>
                    : <button onClick={() => setShowForm(true)} className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-medium text-sm ibtn">📋 เปิดฟอร์มประเมิน Day {active.dayLabel}</button>}
                </div>
                {showForm && (
                  <ProbationRoundForm roundKey={active.roundKey} dayLabel={active.dayLabel} candidate={c} initial={active.ev} user={{ name: myName }}
                    onClose={() => setShowForm(false)} onSave={(data) => saveProbationRound(active, data)} />
                )}
              </>
            )}

            {/* ===== ACK: PROBATION (employee acknowledges result) ===== */}
            {active.kind === 'prob-ack' && (
              <>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                  <div className="text-xs font-semibold text-slate-600 mb-2">📄 ผลการประเมินทดลองงาน · Day {active.dayLabel}</div>
                  <div className="border border-slate-200 rounded-xl p-4">
                    <ProbationRoundDoc data={active.ev} candidate={c} round={active.roundKey} />
                  </div>
                </div>
                {active.state === 'done' ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-sm text-emerald-900 mb-4">✓ คุณลงนามรับทราบผลประเมินนี้แล้ว</div>
                ) : (
                  <>
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                      <div className="text-xs font-semibold text-slate-600 mb-2">✍️ ลงนามรับทราบผลประเมิน</div>
                      <SignaturePad onChange={setSignature} />
                    </div>
                    <button onClick={() => ackProbationRound(active, signature)} disabled={!signature || signing}
                      className={`w-full py-3 rounded-xl text-white font-medium text-sm ibtn mb-4 ${signature && !signing ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-300 cursor-not-allowed'}`}>
                      ✓ ลงนามรับทราบผลประเมิน
                    </button>
                  </>
                )}
              </>
            )}

            {/* ===== VIEW: SHORTLIST ===== */}
            {active.kind === 'view-shortlist' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                <div className="text-xs font-semibold text-slate-600 mb-3">👥 ผู้สมัครใน Shortlist · กดผล "ผ่าน/ไม่ผ่าน" รายคน</div>
                {(active.mineItems || []).length === 0 && <div className="text-sm text-slate-400">ยังไม่มีรายชื่อใน shortlist</div>}
                {(active.mineItems || []).map((s, i) => {
                  const key = s.id || s.name || String(i);
                  const v = verdicts[key];
                  const locked = active.state === 'done' || !!s.verdict;
                  const files = s.files || [];
                  return (
                    <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium flex-1 min-w-0 truncate">📄 {s.name || `ผู้สมัคร ${i + 1}`}</span>
                        {locked
                          ? <span className="text-xs text-slate-500">{s.verdict === 'pass' ? '✓ ผ่าน' : s.verdict === 'reject' ? '✕ ไม่ผ่าน' : '—'}</span>
                          : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setVerdicts(p => ({ ...p, [key]: 'pass' }))} className={`text-xs px-3 py-1 rounded-lg ibtn ${v === 'pass' ? 'bg-emerald-600 text-white' : 'border border-emerald-300 text-emerald-700'}`}>✓ ผ่าน</button>
                              <button onClick={() => setVerdicts(p => ({ ...p, [key]: 'reject' }))} className={`text-xs px-3 py-1 rounded-lg ibtn ${v === 'reject' ? 'bg-rose-600 text-white' : 'border border-rose-300 text-rose-700'}`}>✕ ไม่ผ่าน</button>
                            </div>
                          )}
                      </div>
                      <div className="mt-2 space-y-1">
                        {files.length === 0 && <div className="text-[11px] text-slate-400 italic">ยังไม่มีไฟล์แนบ</div>}
                        {files.map((f, fi) => (
                          <div key={fi} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 flex items-center justify-between gap-2">
                            <span className="truncate">📎 {f.name || f}{f.size ? ` · ${f.size}` : ''}</span>
                            {f.path
                              ? <button onClick={() => openAttachment(f.path)} className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-0.5 rounded-lg ibtn whitespace-nowrap">เปิดดู ↗</button>
                              : <span className="text-[10px] text-slate-400 whitespace-nowrap">ไฟล์เก่า · เปิดไม่ได้</span>}
                          </div>
                        ))}
                      </div>
                      {locked
                        ? <div className="mt-2 text-[11px] text-emerald-700 text-center">✓ ส่งผลกลับ HR แล้ว</div>
                        : (
                          <button onClick={() => saveShortlistVerdict(active, key, v)} disabled={!v}
                            className={`w-full mt-2 py-2 rounded-lg text-white text-xs font-medium ibtn ${v ? 'bg-sky-600 hover:bg-sky-700' : 'bg-slate-300 cursor-not-allowed'}`}>
                            ส่งผล{v === 'pass' ? ' "ผ่าน"' : v === 'reject' ? ' "ไม่ผ่าน"' : ''} ของ "{s.name || `ผู้สมัคร ${i + 1}`}" กลับ HR
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ===== GENERIC ACK ===== */}
            {active.kind === 'ack' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 text-center">
                <div className="text-sm text-slate-700 mb-3">คุณได้รับมอบหมายงานนี้ (Step {active.step})</div>
                {active.state === 'done'
                  ? <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900">✓ รับทราบแล้ว</div>
                  : <button onClick={() => markAckDone(active)} className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm ibtn">รับทราบ</button>}
              </div>
            )}
          </div>
        </div>
      );
    }

    function TaskCard({ t, onOpen }) {
      const badge = TASK_STATE_BADGE[t.state];
      const icon = t.kind === 'sign' ? '✍️' : t.kind === 'view-shortlist' ? '👥' : t.kind.startsWith('eval') ? '📝' : '📌';
      return (
        <button onClick={onOpen} className="w-full text-left bg-white border border-slate-200 hover:border-sky-300 rounded-xl p-4 ibtn flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{t.title}</div>
            <div className="text-xs text-slate-500 truncate">{t.subject}</div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${badge.cls}`}>{badge.txt}</span>
        </button>
      );
    }

    // =========================================================================
    // ===================== CANDIDATE ROLE ====================================
    // =========================================================================
    // ===== Internal Forms Gallery — preview interactive forms per step =======
    const FORMS_GALLERY = [
      {
        id:'manpower', step:1, name:'Manpower Requisition Form',
        thai:'แบบฟอร์มขออนุมัติกำลังคน',
        owner:'HR Manager กรอก · ส่งให้ Dept Head/HR/CEO อนุมัติ',
        component:'ManpowerRequestForm',
        sampleCandidate:{ id:'demo_c1', name:null, position:'QC Officer', department:'Supply Chain', type:'new_headcount', process_start_date:today() }
      },
      {
        id:'scorecard', step:5, name:'Interview Evaluation Form',
        thai:'แบบฟอร์มประเมินการสัมภาษณ์งาน',
        owner:'Hiring Manager กรอก · ส่งกลับ HR',
        component:'ScorecardForm',
        sampleCandidate:{ id:'demo_c2', name:'อรอนงค์ พงศ์ใหม่', position:'Accountant', department:'Finance', type:'replacement', process_start_date:'2026-04-10' }
      },
      {
        id:'approval', step:6, name:'Recruitment Approval Form',
        thai:'แบบฟอร์มขออนุมัติรับพนักงาน',
        owner:'HR Officer กรอก · ส่งให้ผู้บริหารอนุมัติ',
        component:'ApprovalForm',
        sampleCandidate:{ id:'demo_c3', name:'อรอนงค์ พงศ์ใหม่', position:'Accountant', department:'Finance', type:'replacement', process_start_date:'2026-04-10' }
      },
      {
        id:'probation', step:8, name:'Probation Evaluation Form',
        thai:'แบบฟอร์มประเมินทดลองงาน',
        owner:'HR สร้าง · ส่งให้ผู้ประเมินกรอก',
        component:'ProbationEvalForm',
        sampleCandidate:{ id:'demo_c4', name:'ธนวัฒน์ เจริญผล', position:'Supply Chain Officer', department:'Supply Chain', type:'new_headcount', process_start_date:'2026-01-22', probation:{ startDate:'2026-03-23' } }
      }
    ];

    function InternalFormsView({ onRoleSwitch }) {
      const [activeForm, setActiveForm] = useState(null);
      const [preview, setPreview] = useState(null); // { form, data, approvers }
      const FormComponents = { ManpowerRequestForm, ScorecardForm, ApprovalForm, ProbationEvalForm };
      const DocComponents  = { manpower:ManpowerRequestDoc, scorecard:ScorecardDoc, approval:ApprovalDoc, probation:ProbationEvalDoc };
      const docKeyByForm   = { manpower:'manpower', scorecard:'scorecard', approval:'approval', probation:'probation' };
      const F = activeForm ? FormComponents[activeForm.component] : null;

      // After form save · capture data + show doc preview with synthesized signatures
      const handleSave = (data, approvers) => {
        const form = activeForm;
        setActiveForm(null);
        setPreview({ form, data, approvers });
        showToast('🎉 ดูเอกสารที่ generate จาก form ของคุณ', 'success');
      };

      // Build candidate with synthesized signed workflow (for Step 1/6 doc preview)
      const buildPreviewCandidate = () => {
        if (!preview) return null;
        const c = preview.form.sampleCandidate;
        if (!preview.approvers) return c;
        // All approvers marked 'approved' with sample signature data for demo
        const workflowStep = preview.form.step;
        const signedAtBase = Date.now();
        return {
          ...c,
          approvalWorkflows: {
            [workflowStep]: {
              status:'completed',
              approvers: preview.approvers.map((a, i) => ({
                ...a, id:'a'+(i+1), sequence:i+1,
                status:'approved',
                signedAt: new Date(signedAtBase - (preview.approvers.length - i) * 24 * 3600 * 1000).toISOString(),
                ip: ['203.144.1.x','110.78.5.x','45.67.8.x'][i % 3],
                signature_data: null  // will use SVG fallback in DigitalSignatureMark
              }))
            }
          }
        };
      };

      const DocComp = preview ? DocComponents[preview.form.component === 'ManpowerRequestForm' ? 'manpower' : preview.form.component === 'ScorecardForm' ? 'scorecard' : preview.form.component === 'ApprovalForm' ? 'approval' : 'probation'] : null;

      return (
        <div className="min-h-screen py-6 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">📝 Internal Forms Gallery</h1>
                <p className="text-xs text-slate-500">Interactive form ที่ใช้กรอกในระบบ · ลองกรอกได้เลย · ระบบจะ generate เอกสารจริงให้ดูทันที</p>
              </div>
              <button onClick={onRoleSwitch} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg">🎭 เปลี่ยน role</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FORMS_GALLERY.map(f => (
                <button key={f.id} onClick={() => setActiveForm(f)}
                  className="text-left bg-white border-2 border-slate-200 hover:border-emerald-400 hover:shadow-md transition rounded-2xl p-4 ibtn">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Step {f.step}</span>
                    <span className="text-[10px] text-slate-400">📄 interactive</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mb-0.5">{f.name}</div>
                  <div className="text-xs text-slate-600 mb-2">{f.thai}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2 mt-2">
                    <b>ใช้โดย:</b> {f.owner}
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-2 font-medium">เปิดดูฟอร์ม →</div>
                </button>
              ))}
            </div>

            <div className="mt-6 bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-violet-900">
              💡 <b>End-to-end Preview</b> · กดเปิดฟอร์ม → กรอกข้อมูลทุกฟิลด์ → กด "บันทึก" → ดู <b>เอกสารจริงที่ generate ออกมา</b>
              {' '} (สำหรับ Step 1 และ 6 · ใส่ผู้อนุมัติแล้วระบบจะแสดงลายเซ็น demo ในเอกสาร)
            </div>
          </div>

          {/* Step 1: Form modal */}
          {activeForm && F && (
            <F
              candidate={activeForm.sampleCandidate}
              user={{ name:'Preview User' }}
              onClose={() => setActiveForm(null)}
              onSave={handleSave}
            />
          )}

          {/* Step 2: Generated document preview */}
          {preview && DocComp && (
            <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm overflow-y-auto p-2 sm:p-6" onClick={() => setPreview(null)}>
              <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl mx-auto my-2 sm:my-8" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between p-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10 no-print">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900">📄 {preview.form.name} · เอกสารที่ generate</div>
                    <div className="text-xs text-slate-500">จากข้อมูลที่คุณกรอกในฟอร์ม{preview.approvers ? ' · ลายเซ็นผู้อนุมัติเป็นตัวอย่าง demo' : ''}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => window.print()} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg ibtn">🖨 พิมพ์/Save PDF</button>
                    <button onClick={() => { setPreview(null); setActiveForm(preview.form); }} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg ibtn">↩ แก้ฟอร์ม</button>
                    <button onClick={() => setPreview(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-1 bg-emerald-50 border-b border-emerald-200 text-[11px] text-emerald-900 no-print">
                  ✓ Preview จากข้อมูลที่คุณกรอก · ทดลอง flow ครบ form → doc → print
                </div>
                <div className="p-6 sm:p-10">
                  <DocComp data={preview.data} candidate={buildPreviewCandidate()} />
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    function CandidateView({ onRoleSwitch }) {
      const [docs, setDocs] = useState(DOCUMENT_TEMPLATE.map(d => ({ ...d, file:null, uploadedAt:null })));
      const [submitted, setSubmitted] = useState(false);

      const onPickFile = (i, e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setDocs(prev => prev.map((d, idx) => idx === i ? { ...d, file:f, uploadedAt:today() } : d));
        showToast(`${docs[i].label} อัพโหลดเรียบร้อย`, 'success');
      };

      const submit = () => {
        showToast('ส่งเอกสารทั้งหมดให้ HR เรียบร้อย · ขอแสดงความนับถือ', 'success');
        setSubmitted(true);
      };

      const completed = docs.filter(d => d.file).length;
      const candidateName = 'อรอนงค์ พงศ์ใหม่';
      const company = 'JIAN CHA Group';

      if (submitted) {
        return (
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-xl max-w-md w-full p-8 text-center">
              <div className="text-5xl mb-3">🌸</div>
              <h1 className="text-xl font-semibold text-slate-900 mb-2">ขอแสดงความนับถือ</h1>
              <p className="text-sm text-slate-600 mb-4">
                เราได้รับเอกสารทั้ง {completed} รายการของคุณแล้ว ทีม HR จะติดต่อกลับเร็วๆ นี้สำหรับการเตรียมเริ่มงาน
              </p>
              <button onClick={onRoleSwitch} className="text-xs bg-slate-900 text-white px-3 py-2 rounded-lg hover:bg-slate-800 ibtn">เปลี่ยน role</button>
            </div>
          </div>
        );
      }

      const [showFullEmail, setShowFullEmail] = useState(false);
      const emailBody = `Dear Khun Oranong Pongmai,

Congratulations on your successful selection for the position of Accountant in the Finance department at JIAN CHA Co., Ltd.

Before your start date (1 June 2026), please prepare the following documents and upload them via the link in this email:

1. Copy of National ID
2. Copy of House Registration
3. Education Certificate
4. Previous Work Certificate (if any)
5. Photograph
6. Medical Certificate

Upload link (valid until 31 May 2026):
https://recruitment.jiancha.app/upload/c4/abc123

For any further questions, please contact
HR Team · 02-XXX-XXXX · ${HR_EMAIL}

Welcome to the JIAN CHA family.

HR Team · JIAN CHA Co., Ltd.
${HR_EMAIL}`;

      return (
        <div className="min-h-screen py-6 px-4">
          <div className="max-w-2xl mx-auto">

            {/* Role switcher */}
            <div className="flex justify-end mb-3">
              <button onClick={onRoleSwitch} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg">🎭 เปลี่ยน role</button>
            </div>

            {/* Email received preview */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">📧 อีเมลเชิญอัพโหลดเอกสารที่คุณได้รับ</div>
                  <div className="text-sm font-semibold text-slate-900 truncate">Welcome to JIAN CHA · Pre-Boarding Documents (Accountant · Finance)</div>
                  <div className="text-[11px] text-slate-500">จาก: <b>HR Team · JIAN CHA</b> ({HR_EMAIL}) · ถึง: คุณ (oranong@email.com)</div>
                </div>
                <button onClick={() => setShowFullEmail(!showFullEmail)} className="text-xs text-sky-600 hover:text-sky-800 whitespace-nowrap">
                  {showFullEmail ? '▲ ย่อ' : '▼ ดูเต็ม'}
                </button>
              </div>
              {showFullEmail && (
                <pre style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px', fontSize:'11px', whiteSpace:'pre-wrap', fontFamily:'inherit', lineHeight:'1.6', marginTop:'8px' }}>{emailBody}</pre>
              )}
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                💡 ในระบบจริง · คุณคลิก link "🔗 https://recruitment.jiancha.app/upload/c4/abc123" จากอีเมลด้านบน → เปิดหน้านี้ขึ้นมา (ไม่ต้อง login)
              </div>
            </div>

            {/* Greeting + position */}
            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-2xl p-5 mb-4 shadow-sm">
              <div className="text-xs text-emerald-700 mb-1">{company} · HR Team</div>
              <h1 className="text-xl font-semibold text-slate-900">สวัสดีคุณ {candidateName} 🌸</h1>
              <p className="text-sm text-slate-600 mt-1">
                ยินดีต้อนรับเข้าสู่ครอบครัว {company} · กรุณาอัพโหลดเอกสารทั้ง 6 รายการเพื่อเตรียมเริ่มงาน
              </p>
              <div className="bg-white border border-emerald-200 rounded-xl p-3 text-xs text-slate-600 mt-3">
                📅 วันเริ่มงาน: <b>1 มิ.ย. 2569</b> · ตำแหน่ง: <b>Accountant</b> · แผนก: <b>Finance</b><br />
                📞 ติดต่อ HR: <b>คุณแอน</b> · 02-XXX-XXXX
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-800">📄 เอกสารที่ต้องอัพโหลด</div>
                <span className="text-xs text-slate-500">{completed}/{docs.length} เรียบร้อย</span>
              </div>
              <div className="space-y-2">
                {docs.map((d, i) => (
                  <div key={d.key} className={`border rounded-xl p-3 ${d.file ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${d.file ? 'text-emerald-800' : 'text-slate-700'}`}>{i+1}. {d.label}</div>
                        {d.file && <div className="text-[11px] text-emerald-700 truncate">✓ {d.file.name} · อัพโหลด {fmtDate(d.uploadedAt)}</div>}
                      </div>
                      <label className={`text-xs cursor-pointer px-3 py-1.5 rounded-lg whitespace-nowrap ibtn ${d.file ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}>
                        {d.file ? 'เปลี่ยน' : '+ Upload'}
                        <input type="file" hidden onChange={e => onPickFile(i, e)} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={submit} disabled={completed === 0}
              className={`w-full py-3 rounded-xl font-medium text-sm ibtn ${completed > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              ส่งเอกสารทั้งหมดให้ HR {completed > 0 && `(${completed} รายการ)`}
            </button>

            <div className="text-center text-xs text-slate-400 mt-4">
              🔐 ข้อมูลของคุณส่งตรงถึง HR ผ่านการเข้ารหัสปลอดภัย
            </div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // ===================== LOGIN ROLE ========================================
    // =========================================================================
    function LoginScreen() {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [busy, setBusy] = useState(false);
      async function doLogin() {
        if (!email.trim() || !password) { showToast('กรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน', 'warning'); return; }
        setBusy(true);
        try {
          await signIn(email.trim(), password);
          showToast('ยินดีต้อนรับเข้าสู่ระบบ', 'success');
        } catch (e) {
          showToast('เข้าสู่ระบบไม่สำเร็จ: ' + (e?.message || 'ตรวจสอบอีเมล/รหัสผ่าน'), 'warning');
        } finally {
          setBusy(false);
        }
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 mx-auto mb-3 grid place-items-center text-white text-2xl">💼</div>
              <h1 className="text-xl font-semibold text-slate-900">Recruitment 120 Days</h1>
              <p className="text-xs text-slate-500 mt-1">เข้าสู่ระบบสำหรับทีม HR</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">อีเมล / ชื่อผู้ใช้</label>
                <input type="text" className="input mt-1" placeholder={HR_EMAIL} value={email}
                  onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">รหัสผ่าน</label>
                <input type="password" className="input mt-1" placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} />
              </div>
              <button onClick={doLogin} disabled={busy}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white py-2.5 rounded-lg font-medium text-sm ibtn">
                {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
              </button>
            </div>
            <div className="text-center text-[11px] text-slate-400 mt-4">🔐 Supabase Auth · บัญชีออกให้โดยแอดมิน HR</div>
          </div>
        </div>
      );
    }

    // =========================================================================
    // ===================== ROOT APP ==========================================
    // =========================================================================
    function App() {
      const [session, setSession] = useState(undefined);   // undefined = loading, null = logged out
      const [candidates, setCandidates] = useState([]);
      // View is decided purely by the Supabase session role — no manual role
      // switcher in production. admin (HR) -> HR Dashboard · user (ผู้อนุมัติ/
      // ผู้ประเมิน) -> "งานของฉัน" (ApproverView).
      const isAdmin = !!session && roleFromSession(session) === 'admin';
      const viewRole = isAdmin ? 'hr' : 'approver';

      // --- Auth gate ---
      useEffect(() => {
        getSession().then(s => setSession(s ?? null)).catch(() => setSession(null));
        const unsub = onAuthChange((s) => setSession(s ?? null));
        return unsub;
      }, []);

      // --- Load + realtime sync once logged in ---
      useEffect(() => {
        if (!session) return;
        let active = true;
        const refresh = () => listCandidates()
          .then(rows => { if (active) setCandidates(rows.map(fromRow)); })
          .catch(err => showToast('โหลดข้อมูลไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
        refresh();
        const unsub = subscribeCandidates(() => refresh());
        return () => { active = false; unsub(); };
      }, [session]);

      const user = session
        ? { name: actorFromSession(session), role: roleFromSession(session) === 'admin' ? 'HR' : 'User', email: session.user?.email || '' }
        : HR_USERS[1];

      async function handleSignOut() {
        try { await signOut(); } catch (e) { /* ignore */ }
        setSession(null);
        setCandidates([]);
      }

      // Shared optimistic patch → persists to DB (used by "งานของฉัน" write-back)
      function patchCandidate(id, fn) {
        const cur = candidates.find(c => c.id === id);
        if (!cur) return;
        const next = fn(cur);
        setCandidates(prev => prev.map(c => c.id === id ? next : c));
        updateCandidate(id, toRow(next)).catch(err => showToast('บันทึกไม่สำเร็จ: ' + (err?.message || ''), 'warning'));
      }

      if (session === undefined) {
        return <div className="min-h-screen grid place-items-center text-slate-400 text-sm">กำลังโหลด…</div>;
      }
      if (!session) {
        return (<><ToastContainer /><LoginScreen /></>);
      }

      return (
        <>
          <ToastContainer />
          {viewRole === 'hr'       && <HRDashboard user={user} candidates={candidates} setCandidates={setCandidates} />}
          {viewRole === 'approver' && <ApproverView candidates={candidates} myEmail={user.email} myName={user.name} patchCandidate={patchCandidate} />}
          <button onClick={handleSignOut} title="ออกจากระบบ"
            style={{ position:'fixed', left:12, bottom:12, zIndex:80 }}
            className="bg-white border border-slate-200 hover:border-slate-300 text-slate-600 text-xs font-medium px-3 py-2 rounded-lg shadow ibtn">
            🚪 ออกจากระบบ · {user.name}
          </button>
        </>
      );
    }

export default App;
