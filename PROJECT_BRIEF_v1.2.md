# RECRUITMENT 120 DAYS SYSTEM — Project Brief v1.2

**จัดทำโดย**: ฝ่าย HR
**เวอร์ชัน**: 1.2 (อัพเดทหลัง 10-step interview)
**วันที่**: 22 พ.ค. 2026
**สำหรับ**: IT/Dev ทีม + Claude Code

> เอกสารนี้คือ spec **ที่ build แล้วและ deploy ได้ทันที** — โครงสร้างไฟล์ทั้งหมดอยู่ที่
> `C:\Users\HR-JIANCHA\Downloads\recruitment-tracker\`

---

## 1. ภาพรวมโปรเจกต์

ระบบติดตาม Recruitment Process **120 วัน** ตั้งแต่ขออัตรากำลังถึงผ่านโปร · ทีม HR ใช้ร่วมกัน 3–5 คน · ผู้อนุมัติเอกสารเข้าผ่านอีเมล (ไม่ต้องมี account)

| มิติ | รายละเอียด |
|---|---|
| เป้าหมาย | รวม workflow สรรหาเป็น 1 ระบบ · เลิกใช้ email/Line/paper กระจาย |
| ผู้ใช้หลัก | ทีม HR 3–5 คน (concurrent, realtime) |
| MVP scope | **HR-only** — share URL เดียวทั้งทีม |
| Tech Stack | React 18 + Vite · Tailwind · Supabase (DB + Auth + Storage + Realtime) · Vercel |
| ค่าใช้จ่ายเป้า | ฿0/เดือน (Free tier) · ~฿700/เดือนตอน scale |
| Audit trail | candidate_audit (trigger-based, immutable) · พร้อม IPO |

### Success Criteria

1. ทีม HR 3–5 คน เข้าใช้พร้อมกันได้ realtime · ไม่ขัดแย้ง
2. ลด time-to-track จาก ~15 นาที/candidate/สัปดาห์ ใน Excel → ≤ 2 นาที
3. ไม่มี candidate "หลุด" deadline Step 2 (30 วัน) โดยไม่ถูก highlight
4. Day 119+ ระบบเตือน "พร้อมผ่านโปร" ทุก candidate
5. ทุก action audit log ครบ — พร้อมส่งให้ external auditor

---

## 2. Stakeholders & บทบาท

| บทบาท | ทำอะไรในระบบ | ต้อง login |
|---|---|---|
| **HR สรรหา** (3–5 คน) | สร้าง candidate · ผ่าน step · upload เอกสาร · ตั้ง approval flow | ✅ Phase 1A |
| **หัวหน้าต้นสังกัด** | ดูข้อมูลแผนกตัวเอง · approve Step 4 · ประเมินทดลองงาน | ⏳ Phase 2 (ตอนนี้ผ่าน HR) |
| **ผู้อนุมัติเอกสาร** (Step 7 · 9) | คลิกอีเมล → ดู PDF → เซ็น | ❌ ไม่ต้อง (magic link) |
| **Candidate** | upload เอกสาร 6 รายการผ่าน self-service link (Step 8) | ❌ ไม่ต้อง (magic link) |

---

## 3. กระบวนการสรรหา 10 ขั้นตอน · v1.2 (corrected)

### Step 1 · ขออนุมัติอัตรากำลังคน
- **Trigger**: ทั้งคู่ — case-by-case (ต้นสังกัดขอเอง · หรือ HR เริ่มจาก manpower plan)
- **Approver chain**: หัวหน้าต้นสังกัด → HR Manager/Director → MD/CEO (3 ระดับ)
- **SLA**: 1 สัปดาห์
- **เอกสาร**: Manpower Request Form (Word/PDF)
- **Output**: อัตราอนุมัติ → เริ่มสรรหา

### Step 2 · ดำเนินการสรรหา
- **Owner**: HR สรรหา
- **ช่องทาง**: JobThai/JobsDB/LinkedIn · Agency · Internal referral · Social/Walk-in (ครบ 4 ทาง)
- **SLA**: **30 วัน (deadline สำคัญ)**
- **เกิน deadline**: หาต่อ + escalate HR Manager ขยาย deadline
- **Output**: Shortlist + Resume ทุกคน

### Step 3 · Prescreen & ส่งให้ต้นสังกัด
- **Owner**: HR สรรหา
- **Activities**: โทรสัมภาษณ์ + ตรวจเอกสาร + ลงคะแนน HR (score)
- **SLA**: 2–3 วัน
- **ช่องทางเดิม**: Email + Line + paper (กระจาย — pain point)
- **ในระบบ**: รวมเป็น in-app feed ที่ต้นสังกัดเห็นใน dashboard

### Step 4 · ต้นสังกัดพิจารณาคุณสมบัติ
- **Owner**: หัวหน้าต้นสังกัด
- **SLA**: **1 วัน** (aggressive)
- **Pain point**: ตอบบางคน ไม่ตอบบางคน
- **ระบบทำ**: ไม่ส่งเตือนอัตโนมัติ · **highlight สีแดง** candidate ที่ค้าง > 1 วัน ใน HR dashboard
- **Reject path**: ย้อนกลับ Step 2 — หา candidate ใหม่

### Step 5 · ประสานงานนัดสัมภาษณ์
- **Owner**: HR สรรหา
- **รอบ**: **1 รอบเดียว** (HR + ต้นสังกัด สัมภาษณ์รวมกัน)
- **ช่องทางเดิม**: โทร + Email/Line + Outlook (กระจาย)
- **ในระบบ**: ฟอร์มนัดในระบบ + ส่ง calendar invite อัตโนมัติ (Phase 2)
- **No-show**: บันทึก + ไปคนถัดไป

### Step 6 · ส่งเอกสารประเมินสัมภาษณ์
- **Owner**: ต้นสังกัด → HR
- **Scorecard**: ฟอร์มมาตรฐาน Word/PDF
- **เกณฑ์**: Technical · Attitude · Communication/Team fit · Salary expectation
- **ช่องทางเดิม**: Email + Line + paper (กระจาย)
- **ในระบบ**: upload scorecard เข้า candidate record โดยตรง (Phase 1A)

### Step 7 · ขออนุมัติรับพนักงาน + ส่ง Offer ⭐ (เคยเป็น Step 8)
- **Owner**: HR สรรหา + Approver chain (ยืดหยุ่น 2–6+ คน)
- **เอกสารที่ขออนุมัติ**: ชุดรวม = ข้อมูล candidate + Resume + Scorecard + Offer terms (เงินเดือน/สวัสดิการ/วันเริ่ม)
- **ช่องทางเดิม**: print + เซ็นมือ + เดินขอลายเซ็น + email + Line (pain point หนักสุด)
- **ในระบบ (Phase 1B)**: **Sequential e-sign chain** — HR set approver list ครั้งเดียว → ระบบยิงอีเมล + magic link ทีละคนตามลำดับ
- **Reject**: Workflow หยุด · HR ตัดสินใจ (แก้/ยกเลิก)
- **อนุมัติครบ → ส่ง Offer**: ส่ง offer letter ให้ candidate · รอ candidate ตอบรับ
- **Output**: candidate ตอบรับ → ไป Step 8

### Step 8 · ขอเอกสารเริ่มงาน (6 รายการ) ⭐ (เคยเป็น Step 7)
- **Owner**: HR สรรหา
- **Timing**: **หลัง Step 7 อนุมัติครบ + candidate ตอบรับ offer**
- **เอกสาร 6 รายการ**: บัตรประชาชน · ทะเบียนบ้าน · วุฒิ · ใบผ่านงาน · รูปถ่าย · ใบรับรองแพทย์
- **ช่องทาง**: Email checklist + Line + โทร + **Self-service link ⭐ NEW** (Phase 1A)
- **เอกสารไม่ครบ**: ไป Step 9 ได้ แต่ **flag ว่าขาด** ใน dashboard

### Step 9 · สัญญาจ้าง & ลงนาม
- **Owner**: HR สรรหา
- **Template**: Word มาตรฐาน + HR แก้ตาม case
- **Signers**: **4 ลายเซ็น** = Candidate + ผู้บริหาร 1 + พยาน 2
- **ช่องทาง**: **ใช้ Sequential e-sign flow เดียวกับ Step 7** (reuse)
- **Output**: สัญญาลงนามครบ → เริ่มทดลองงาน

### Step 10 · ทดลองงาน 120 วัน
- **Owner**: หัวหน้าต้นสังกัด (ประเมิน) · HR (follow-up)
- **Milestones**: **Day 30 / 60 / 90 / 120** (4 รอบ)
- **ฟอร์ม**: มาตรฐาน · ใช้ทุกตำแหน่ง
- **กระบวนการ**: HR ส่งฟอร์มครั้งเดียววันแรก → หัวหน้าเก็บไว้ประเมินทีละ milestone → HR follow-up
- **Fail Day 90**: หัวหน้าแจ้ง HR → ตัดสินใจ (PIP / ย้ายฝ่าย / เลิกจ้างตาม กม.แรงงาน)
- **Pass Day 120**: status = passed → **ส่งเข้า Database HRIS** (Phase 2 integration)

---

## 4. 5 จุดเปลี่ยนจาก v1.1

| # | เปลี่ยน | เหตุผล |
|---|---|---|
| 1 | **สลับ Step 7 ↔ Step 8** | ของจริง: อนุมัติ → ส่ง offer → ตอบรับ → ค่อยขอเอกสาร |
| 2 | **Probation milestones** = 30/60/90/120 (4 รอบ) | ปรับจาก 30-30-30+120 ตามที่ HR สัมภาษณ์ |
| 3 | **Step 7 approver = ยืดหยุ่น 2–6+ คน** | ขึ้นกับตำแหน่ง/case · ไม่ใช่ตายตัว 4 |
| 4 | **Step 9 reuse Step 7 e-sign flow** | ลด complexity · UX สม่ำเสมอ |
| 5 | **Step 8 self-service link** สำหรับ candidate upload | ลดภาระ HR ที่ต้องไล่เก็บเอกสาร |

---

## 5. Cross-cutting Pain Points ที่ระบบแก้

| Step | เดิมใช้ | ระบบใหม่ |
|---|---|---|
| 3 (ส่ง shortlist) | Email + Line + Print | 1 หน้าใน app · ต้นสังกัดเห็นใน dashboard |
| 4 (รอตอบ) | HR ไล่ตามด้วยตัวเอง | Highlight สีแดง candidate ค้าง > 1 วัน |
| 5 (นัดสัมภาษณ์) | โทร + Email/Line + Outlook | ฟอร์มนัดในระบบ + calendar invite |
| 6 (ส่ง scorecard) | Email + Line + paper | Upload เข้าระบบ |
| 7 (อนุมัติ) | print + เซ็นมือ + email + Line | Sequential e-sign chain (Phase 1B) |
| 9 (ลงนาม) | กระดาษ | Sequential e-sign chain (reuse Step 7) |
| 10 (ประเมินทดลอง) | ฟอร์มกระจาย | ส่งครั้งเดียว + auto-reminder 30/60/90/120 |

---

## 6. Phasing

| Phase | Scope | สถานะ | Effort |
|---|---|---|---|
| **MVP (v1.2)** | 10-step tracker · doc checklist · probation · Step 4 highlight · realtime · audit log | ✅ **Built · พร้อม deploy** | done |
| **Phase 1A** | Login (Supabase Auth) + File Upload (Storage) + Self-service candidate link | 🔜 รอ build | ~2–3 วัน |
| **Phase 1B** | Sequential E-Sign Approval Flow (Step 7 + 9 · reuse) | 🔜 รอ build | ~5–7 วัน |
| **Phase 2** | หัวหน้าต้นสังกัด login · HRIS handoff · LINE notify · Multi-brand filter | 📋 Roadmap | ~1–2 เดือน |

---

## 7. ค่าใช้จ่าย

| Service | Free Tier | จ่ายเงินเมื่อ |
|---|---|---|
| Supabase | 500MB DB · 1GB Storage · 50k MAU · 500k Edge Function | เกิน → $25/เดือน |
| Vercel | 100GB bandwidth | เกิน → $20/เดือน |
| Resend (email, Phase 1B) | 3,000 อีเมล/เดือน | เกิน → $20/เดือน |
| **รวมตอนเริ่ม** | **฿0/เดือน** | คาดเกินตอน scale 10+ candidate ใหม่/เดือน |

---

## 8. ไฟล์ในโปรเจกต์ (Build แล้ว · v1.2)

```
recruitment-tracker/
├── supabase/schema.sql              ← Run 1 ครั้งใน Supabase SQL Editor
├── src/
│   ├── App.jsx                      ← UI (v1.2 corrected step order)
│   ├── lib/supabase.js              ← Client + CRUD + realtime
│   ├── main.jsx · index.css
├── reference/App.original.jsx       ← UI ต้นแบบ (dark theme, truncated)
├── preview.html                     ← Standalone preview พร้อม sample data 7 คน
├── index.html · package.json · vite.config.js · tailwind/postcss config
├── .env.example · .gitignore
├── README.md                        ← คู่มือ deploy เต็ม (Thai)
├── QUICKSTART.md                    ← Deploy ใน 30 นาที (Thai)
└── PROJECT_BRIEF_v1.2.md            ← เอกสารนี้
```

---

## 9. ขั้นต่อไปทันที (HR action)

ดู `QUICKSTART.md` — Deploy เสร็จใน ~30 นาที พร้อมใช้งานวันรุ่งขึ้น
