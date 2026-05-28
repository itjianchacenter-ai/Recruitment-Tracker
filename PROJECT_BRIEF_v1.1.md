# RECRUITMENT 120 DAYS SYSTEM — Project Brief v1.1

**จัดทำโดย**: ฝ่าย HR
**เวอร์ชัน**: 1.1 (ขัดเกลาเพิ่มเติมจาก v1.0)
**วันที่**: 22 พ.ค. 2026
**สำหรับ**: IT/Dev ทีม + Claude Code

> เอกสารนี้เป็น *spec ที่ build แล้ว* — โครงสร้างไฟล์ทั้งหมดอยู่ที่
> `C:\Users\HR-JIANCHA\Downloads\recruitment-tracker\` พร้อม deploy

---

## 1. ภาพรวมโปรเจกต์

ระบบติดตาม Recruitment Process 120 วัน สำหรับทีม HR ใช้งานร่วมกัน 3–5 คน
ครอบคลุมตั้งแต่การขออนุมัติอัตรากำลังคน → ผ่านทดลองงาน Day 120

| หัวข้อ            | รายละเอียด                                          |
|-------------------|-----------------------------------------------------|
| เป้าหมาย          | ระบบอัตโนมัติครบ workflow สรรหาในที่เดียว           |
| ผู้ใช้งาน         | ทีม HR 3–5 คน (concurrent, real-time sync)          |
| MVP scope         | **HR-only** — ทุกคนแชร์ access ระดับเดียวกัน        |
| เครื่องมือปัจจุบัน | Email, Outlook, Microsoft Office (กระจายตัว)        |
| Tech Stack        | React 18 + Vite, Tailwind CSS, lucide-react         |
| Database          | Supabase (PostgreSQL) + Realtime publication        |
| Deploy            | Vercel (1 URL แชร์ทั้งทีม)                          |
| ต้นทุน            | ฿0/เดือน (Supabase Free + Vercel Free Tier)         |
| Audit trail       | candidate_audit table (trigger-based, immutable)    |

### Success Criteria (เพิ่มใน v1.1)

ระบบจะถือว่า "สำเร็จ" เมื่อ:
1. ทีม HR ทั้ง 3–5 คน เข้าใช้งานพร้อมกันได้ โดยไม่เห็นข้อมูลขัดแย้งกัน
2. ลด time-to-track จาก ~15 นาที/candidate/สัปดาห์ ใน Excel → ≤ 2 นาที
3. ไม่มี candidate "หลุด" deadline Step 2 (30 วัน) โดยไม่ถูกเตือน
4. ทุก action มีร่องรอย audit log สำหรับ tracing
5. Day 119–120 ระบบเตือน "พร้อมผ่านโปร" ทุก candidate ที่เข้าทดลองงาน

---

## 2. Recruitment Process (10 ขั้นตอน)

Timeline ทั้งหมด **120 วัน** นับจากวันเริ่ม Process แบ่งเป็น 2 ช่วง:
- **Pre-employment**: Step 1–9 (deadline Step 2 = 30 วัน)
- **Probation**: Step 10 = 30-30-30-30 รวม 120 วัน

| Step | ชื่อขั้นตอน                                | ผู้รับผิดชอบ              | กำหนดเวลา | หมายเหตุ                 |
|------|------------------------------------------|---------------------------|-----------|--------------------------|
| 1    | ขออนุมัติอัตรากำลังคน                    | แผนกต้นสังกัด              | —          | ทดแทน / อัตราใหม่         |
| 2    | ดำเนินการสรรหา                          | แผนกสรรหา                  | **30 วัน** | deadline สำคัญ            |
| 3    | Prescreen & ส่งให้ต้นสังกัด               | แผนกสรรหา                  | —          | แนบ resume + ความเห็น     |
| 4    | ต้นสังกัดพิจารณาคุณสมบัติ                 | แผนกต้นสังกัด              | —          | accept / reject / hold    |
| 5    | ประสานงานนัดสัมภาษณ์                    | แผนกสรรหา                  | —          | ระบุรอบ / วัน / กรรมการ    |
| 6    | ส่งเอกสารประเมินสัมภาษณ์                 | ต้นสังกัด → สรรหา           | —          | scorecard กลับมาที่ HR    |
| 7    | ขอเอกสารเริ่มงานจากผู้สมัคร              | แผนกสรรหา                  | —          | checklist 6 รายการ        |
| 8    | ขออนุมัติรับพนักงาน                     | สรรหา → Approve            | —          | (Phase 2: e-sign)        |
| 9    | สัญญาจ้าง & ลงนาม                       | แผนกสรรหา                  | —          | (Phase 2: e-sign)        |
| 10   | ทดลองงาน 30-30-30 + Day 120              | หัวหน้าต้นสังกัด           | **120 วัน** | ส่งเอกสารวันแรก รับคืน D120 |

### Edge cases ที่ระบบรองรับ (เพิ่มใน v1.1)

| สถานการณ์                                  | พฤติกรรมระบบ                                          |
|--------------------------------------------|--------------------------------------------------------|
| Candidate ถอนตัวก่อน Step 10               | กด "ยกเลิก" → status = rejected (อยู่ใน history)        |
| ผ่าน Step 2 หลัง deadline                   | บันทึก completedDate จริง · stat "Overdue" ลดลงทันที   |
| ใส่ process_start_date ย้อนหลัง            | ระบบคำนวณ deadline + day-in-probation ตาม date จริง   |
| 2 คนใน HR แก้ candidate เดียวกันพร้อมกัน    | Realtime push → last-write-wins · audit log มีทั้งคู่   |
| ผ่านโปรช้า (เลย Day 120)                    | Badge แดง "เกินกำหนดประเมิน" หลัง Day 125              |

---

## 3. Features (Build แล้ว ใน v1.0 ของระบบ)

### 3.1 Dashboard หลัก
- Stats: ทั้งหมด · กำลังดำเนิน · ผ่านโปร · เกิน Deadline
- Filter: แผนก · Step · ประเภท · ค้นหา (free text)
- Candidate Cards: Progress bar · Status badge · วันเริ่ม · ประเภท
- Color coding: เขียว (ปกติ) · เหลือง (≤3 วัน) · แดง (เกิน) · ฟ้า (พร้อมผ่านโปร)

### 3.2 Candidate Management
- เพิ่ม / แก้ไข / ลบ / ยกเลิก
- Field: name, position, department, type, process_start_date, notes
- Department: dropdown + free text (auto-collect ที่เคยใช้)
- Type: replacement | new_headcount

### 3.3 Step Tracker (10 ขั้น)
- กด "ผ่าน Step →" → บันทึก completedDate + completedBy + advance อัตโนมัติ
- เข้า Step 7 → ระบบสร้าง document checklist ให้
- เข้า Step 10 → ระบบสร้าง probation timeline ให้ + กำหนด startDate/evaluationSentDate

### 3.4 Document Checklist (Step 7)
6 รายการ: สำเนาบัตรประชาชน · สำเนาทะเบียนบ้าน · วุฒิการศึกษา · ใบผ่านงาน · รูปถ่าย · ใบรับรองแพทย์
- ติ๊ก checkbox → บันทึก receivedDate อัตโนมัติ
- แสดง count "รับแล้ว X/6"

### 3.5 Probation Tracker (Step 10)
- Milestone grid: Day 30 / 60 / 90 / 120 — เปลี่ยนสีตาม progress
- Progress bar 0–120
- Info card: startDate · evaluationSentDate · returnDate
- ปุ่ม "ผ่านโปร ✓" ปรากฏที่ Day 119+ → set status='passed' + returnDate

### 3.6 Multi-User Realtime
- Supabase channel subscription → push update ทุก insert/update/delete
- ไม่ต้อง refresh page

### 3.7 Audit Log (ใหม่ใน v1.1)
- Trigger-based: ทุก action บันทึกลง `candidate_audit` (immutable)
- Field: actor (HR ชื่อจริง) · action · timestamp · full row snapshot
- Query ผ่าน Supabase Table Editor หรือ SQL

---

## 4. Data Model

### 4.1 Table: `candidates`

| Field                | Type         | คำอธิบาย                                                |
|----------------------|--------------|----------------------------------------------------------|
| id                   | uuid (PK)    | gen_random_uuid()                                        |
| name                 | text NN      | ชื่อ-นามสกุล                                              |
| position             | text NN      | ตำแหน่ง                                                  |
| department           | text NN      | แผนกต้นสังกัด                                            |
| type                 | text NN      | check ∈ {replacement, new_headcount}                     |
| process_start_date   | date NN      | วันเริ่ม Process                                          |
| current_step         | smallint NN  | 1–10 default 1                                           |
| status               | text NN      | check ∈ {active, passed, rejected} default 'active'      |
| steps                | jsonb NN     | `[{step, completedDate, completedBy}, ...]`              |
| documents            | jsonb NN     | `[{key, label, received, receivedDate}, ...]`            |
| probation            | jsonb NN     | `{startDate, evaluationSentDate, returnDate, passed}`    |
| notes                | text         | optional                                                 |
| created_by           | text         | HR ชื่อจริง (free text จาก localStorage)                |
| updated_by           | text         | last editor                                              |
| created_at           | timestamptz  | default now()                                            |
| updated_at           | timestamptz  | trigger ปรับอัตโนมัติ                                    |

### 4.2 Table: `candidate_audit` (ใหม่ใน v1.1)

| Field         | Type        | คำอธิบาย                                  |
|---------------|-------------|--------------------------------------------|
| id            | bigserial   | PK                                          |
| candidate_id  | uuid FK     | references candidates(id) on delete cascade |
| action        | text        | insert / update / delete                    |
| actor         | text        | HR ชื่อจริง                                  |
| diff          | jsonb       | snapshot ของ row หลัง action                |
| occurred_at   | timestamptz | default now()                              |

### 4.3 Indexes
- `idx_candidates_status` · `idx_candidates_current_step` · `idx_candidates_department` · `idx_candidates_start_date`
- `idx_audit_candidate` · `idx_audit_time`

### 4.4 RLS Policies (MVP — เปิดกว้างสำหรับ HR-only)
- `candidates`: anon SELECT/INSERT/UPDATE/DELETE = true (4 policies)
- `candidate_audit`: anon SELECT = true (insert ผ่าน trigger เท่านั้น)

> Phase 2 (เมื่อเพิ่ม auth): เปลี่ยนเป็น `auth.uid() is not null` หรือ role-based

---

## 5. การติดตั้งและ Deploy

📖 ดูคู่มือเต็มที่ `README.md` ในโฟลเดอร์โปรเจกต์ — สรุปสั้น:

1. สมัคร Supabase → New Project → รัน `supabase/schema.sql`
2. `npm install` → copy `.env.example` → `.env.local` → ใส่ URL + Anon Key
3. `npm run dev` (local) หรือ push → Vercel (production)
4. แชร์ URL Vercel ให้ทีม HR

---

## 6. Automation Logic

| Trigger                       | Action อัตโนมัติ                                              |
|-------------------------------|---------------------------------------------------------------|
| กด 'ผ่าน Step'                 | บันทึก completedDate + เลื่อน currentStep + log actor          |
| เข้า Step 7                    | สร้าง documents array (6 รายการ default)                       |
| เข้า Step 10                   | สร้าง probation object + set startDate/evaluationSentDate     |
| เหลือ ≤ 3 วันก่อน deadline      | Badge สีเหลือง                                                 |
| เกิน deadline Step 2           | Badge สีแดง + นับใน stat "เกิน Deadline"                       |
| Day 119+ และ status=active     | ปุ่ม 'ผ่านโปร ✓' ปรากฏ                                         |
| เกิน Day 125 ยังไม่ผ่านโปร      | Badge แดง "เกินกำหนดประเมิน"                                   |
| Insert/Update/Delete           | Trigger บันทึก audit log อัตโนมัติ                            |

---

## 7. Roadmap — Phase 2 ขึ้นไป

| Phase | Scope                                                | ตรวจสอบ                    |
|-------|-------------------------------------------------------|-----------------------------|
| 2     | เชื่อม e-signature สำหรับ Step 8 + 9                   | ดู project esign แยก         |
| 2     | Role-based access: HR / Hiring Manager / Read-only    | Supabase Auth + RLS rewrite |
| 3     | Multi-brand filter: JIAN CHA / POLLY / JAI CHAN       | เพิ่ม `brand` column         |
| 3     | Email/LINE notification ใกล้ deadline                 | Supabase Edge Function       |
| 3     | Export Excel / PDF report รายเดือน                    | UI report module             |
| 4     | Integration กับ HRIS หลัก (Phase IPO-readiness)       | API contract กับ HRIS team   |

---

## 8. Risks & Mitigations (ใหม่ใน v1.1)

| Risk                                                    | Likelihood | Impact | Mitigation                                                    |
|---------------------------------------------------------|------------|--------|----------------------------------------------------------------|
| Anon key รั่ว → ใครก็เข้าเว็บได้                          | Medium     | Medium | Phase 2 เปิด Auth · ระหว่างนี้แชร์ URL เฉพาะใน HR group        |
| HR ลบ candidate โดยไม่ตั้งใจ                              | Medium     | High   | confirm dialog · audit log เก็บ snapshot · restore ได้ผ่าน SQL |
| Supabase Free Tier เต็ม (500MB)                          | Low        | Low    | คำนวณ: 1,000 candidates × 5KB = 5MB · เพียงพอยาว              |
| คนละ timezone กรอกวันที่                                  | Low        | Medium | ใช้ date (ไม่มี time) · render ด้วย locale 'th-TH'              |
| ไม่มี backup                                              | Low        | High   | Supabase auto-backup 7 วัน (Free) · เพิ่ม manual export รายสัปดาห์ |
| ไฟดับ/internet ตัด → กลับมาแล้ว state ไม่ตรง              | Low        | Low    | Realtime resubscribe อัตโนมัติ · refresh page ก็ sync ใหม่     |

---

## 9. ไฟล์ในโปรเจกต์ (Build แล้ว)

| ไฟล์                            | คำอธิบาย                                          |
|---------------------------------|----------------------------------------------------|
| `supabase/schema.sql`           | Schema + RLS + triggers + audit + realtime         |
| `src/App.jsx`                   | UI ทั้งหมด (Dashboard, Modal, Tracker, Probation)   |
| `src/lib/supabase.js`           | Supabase client + CRUD + realtime subscription     |
| `src/main.jsx`                  | Entry point                                        |
| `src/index.css`                 | Tailwind + font Thai (IBM Plex Sans Thai)          |
| `index.html`                    | HTML shell                                         |
| `package.json`                  | dependencies (React, Vite, Supabase, Tailwind, lucide) |
| `vite.config.js`                | Vite config                                        |
| `tailwind.config.js`            | Tailwind config (รวม font)                         |
| `postcss.config.js`             | PostCSS for Tailwind                               |
| `.env.example`                  | Template env vars                                  |
| `.gitignore`                    | Standard Vite/Node ignore                         |
| `README.md`                     | คู่มือติดตั้ง deploy ใช้งาน (ภาษาไทย)              |
| `PROJECT_BRIEF_v1.1.md`         | เอกสารนี้                                          |

---

## หมายเหตุปิดท้าย

- Free Tier เพียงพอสำหรับทีม 3–5 คน (Supabase 500MB + Vercel 100GB/เดือน)
- หากต้องการขยายไป brand อื่น (POLLY, JAI CHAN) ทำได้โดยเพิ่ม column `brand` ไม่ต้อง rewrite
- เปิด Claude Code ใน folder นี้ได้เลย — ระบบพร้อม build จาก spec แล้ว
