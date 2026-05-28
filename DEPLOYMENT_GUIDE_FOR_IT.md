# Recruitment 120 Days — เอกสารส่งมอบสำหรับทีม IT (Deployment & Build Handover)

> เอกสารฉบับนี้สำหรับทีม IT เพื่อนำระบบ **Recruitment 120 Days** ขึ้นใช้งานจริงแบบเต็มระบบ (production)
> เป้าหมาย: HR 3–5 คนใช้ร่วมกันแบบ real-time, ส่งอีเมลจริงจากกล่องกลาง `Hr.jc@jianchatea.com`, เก็บข้อมูล/ไฟล์/ลายเซ็นถาวร พร้อม audit trail
>
> **เวอร์ชันเอกสาร:** 1.1 · **วันที่:** 2026-05-28 · **เจ้าของระบบ (Business owner):** Head of HR, JIAN CHA Group

---

## ⚠️ อ่านก่อน: เรื่องที่ต้องเข้าใจตรงกัน (Prototype ≠ ระบบจริง)

> **โปรดอ่านย่อหน้านี้ก่อนประเมินงาน** เพื่อให้ HR และ IT เข้าใจตรงกันตั้งแต่ต้น

ระบบมี 3 ส่วน. **ส่วนที่เป็น production จริง (`src/App.jsx`) ใช้งานหลักได้แล้ว แต่ฟีเจอร์ขั้นสูงบางส่วนยังต้องพัฒนาต่อ**:

1. **`src/App.jsx` = แอป production จริง (React + Vite + Supabase)** — ✅ **พร้อมใช้งานหลัก (operational core)**:
   - 8 steps, บันทึกฐานข้อมูลจริง + realtime หลายคนเห็นพร้อมกัน, dashboard 3 กลุ่ม, **หน้า Reports/KPI**, จัดการตำแหน่ง/ผู้สมัครครบ lifecycle, ทดลองงาน Day 30/60/90/119 (บันทึกคะแนนได้), checklist เอกสาร
   - มี data layer + storage upload + ฟังก์ชันส่งอีเมล M365 เตรียมไว้ใน `src/lib/supabase.js`
   - ⚠️ งานที่ IT ทำต่อตอน deploy: **portal เซ็นอนุมัติ e-signature เต็มรูปแบบ**, **สร้างเอกสาร PDF ตามแบบฟอร์ม JIANCHA**, **portal ผู้อนุมัติ/ผู้สมัคร (magic link)**, **UI เขียน/ยิงอีเมลรายสเตป**, **login/auth + RLS ตาม role** (ตอนนี้ใช้ตัวช่วย "บันทึกอนุมัติครบ" แทน e-sign ชั่วคราว)
2. **`preview.html` = ต้นแบบครบ 100% (clickable prototype)** — เป็น **แบบพิมพ์เขียว (functional spec) ที่แม่นยำที่สุด** ของฟีเจอร์ส่วนที่ IT ทำต่อทั้งหมด **แต่** ข้อมูลอยู่ในหน่วยความจำ (refresh หาย) + อีเมล/อัปโหลด "จำลอง" → ใช้ดู UI/flow ไม่ใช่ตัวระบบจริง
3. **`supabase/` = schema + Edge Function** — ฐานข้อมูล 8 steps + KPI view + ฟังก์ชันส่งอีเมล M365 (`functions/send-email`)

**👉 แปลว่า:** แกนหลักที่ HR ใช้ทุกวัน (เปิดตำแหน่ง → ติดตาม pipeline → ทดลองงาน → รายงาน) **deploy แล้วใช้ได้เลย** หลังตั้ง DB + hosting. ส่วนที่เหลือ (e-sign portal, สร้าง PDF, portal ภายนอก, login, ส่งอีเมลจริงทุกจุด) เป็น **งานที่ IT ทำต่อตอน deploy** ที่ต่อยอดจากแกนนี้ โดยมี `preview.html` เป็น spec แม่นยำ

**สิ่งที่เตรียมให้แล้วเพื่อลดเวลางาน:** ✅ แอป production แกนหลักรันได้จริง (`src/App.jsx`) · ✅ ต้นแบบครบทุกหน้าจอเป็น spec (`preview.html`) · ✅ schema 8 steps + KPI view (`supabase/schema.sql`) · ✅ Edge Function ส่งอีเมล M365 (`supabase/functions/send-email`) · ✅ data layer + storage + email helper (`src/lib/supabase.js`) · ✅ รายการ env/secret (`.env.example`) · ✅ checklist (หัวข้อ 12)

> รายละเอียดเชิงลึกของหัวข้อนี้อยู่ใน **หัวข้อ 3 (สถานะปัจจุบันของโค้ด)** · งานที่ต้องทำใน **หัวข้อ 12** · คำถามที่ต้องตัดสินใจร่วมกันใน **หัวข้อ 13**

---

## 0. สรุปสำหรับผู้บริหาร / TL;DR สำหรับ IT

- ระบบติดตามการสรรหา **8 ขั้นตอน** + ทดลองงาน 120 วัน (ประเมิน Day 30/60/90 · ผ่านโปร Day 119)
- มี **ต้นแบบที่กดได้จริง (clickable prototype)** ครบทุกฟังก์ชัน = `preview.html` → ใช้เป็น **functional spec** ที่แม่นยำที่สุด (เปิดดูในเบราว์เซอร์ได้เลย)
- **แกนหลัก (`src/App.jsx`) เป็นแอป production จริงที่รันได้แล้ว**: 8 steps + บันทึก DB + realtime + Reports/KPI + ทดลองงาน — deploy แล้วใช้ได้เลยหลังตั้ง DB/hosting
- งานที่ IT ทำต่อตอน deploy: e-sign portal, สร้าง PDF, portal ผู้อนุมัติ/ผู้สมัคร, login/auth, ส่งอีเมลจริงทุกจุด — ใช้ `preview.html` เป็น spec
- Stack: **React 18 + Vite + Tailwind** (frontend) · **PostgreSQL** (แนะนำ Supabase) · **Microsoft 365 Graph API** (อีเมล · มี Edge Function ให้แล้ว) · hosting แล้วแต่ IT เลือก
- `supabase/schema.sql` = 8 steps + view `candidate_kpi` · `supabase/functions/send-email` = ฟังก์ชันส่งอีเมล M365

> ⚠️ **สรุปสั้น:** แกนหลักที่ HR ใช้ทุกวัน **พร้อม deploy** · ฟีเจอร์ขั้นสูง (e-sign / PDF / portal ภายนอก / login / อีเมลจริงทุกจุด) = **งานที่ IT ทำต่อตอน deploy** มี spec ครบใน `preview.html` ดูหัวข้อ 3 และ 12

---

## 1. สิ่งที่ส่งมอบ (Artifacts)

| ไฟล์ / โฟลเดอร์ | คืออะไร | ใช้ทำอะไร |
|---|---|---|
| `src/App.jsx` | **แอป production แกนหลัก** — 8 steps, Supabase, realtime, Reports/KPI, ทดลองงาน | โค้ดหลักที่ deploy ใช้ได้เลย |
| `src/lib/supabase.js` | data layer: CRUD + realtime + **storage upload** + **`sendEmail()`** เรียก Edge Function | เชื่อมต่อ DB/Storage/Email |
| `supabase/schema.sql` | สคีมา PostgreSQL + RLS + audit trigger + realtime + KPI view | รันใน DB เพื่อสร้างโครงสร้างข้อมูล |
| `supabase/functions/send-email/index.ts` | **Edge Function** ส่งอีเมลผ่าน M365 Graph (จาก `Hr.jc@jianchatea.com`) | deploy + ตั้ง secret M365 |
| `preview.html` | ต้นแบบครบทุกฟีเจอร์ (single-file React, ~4,900 บรรทัด) | **Functional spec (ส่วนที่ IT ทำต่อ)** — เปิดในเบราว์เซอร์ดู UI/flow ทุกหน้าจอ ทุก role |
| `index.html`, `vite.config.js`, `package.json`, `tailwind.config.js`, `postcss.config.js` | config โปรเจกต์ Vite | build/dev/deploy |
| `.env.example` | รายการ environment variables ทั้งหมด (frontend + secrets) | ตั้งค่า config/secret |
| `jiancha-logo.jpg`, `public/` | โลโก้บริษัท | ใช้ในเอกสารที่ระบบสร้าง |
| `PROJECT_BRIEF_v1.2.md` | สเปกธุรกิจฉบับเต็ม | บริบท/ที่มา |
| เอกสารฉบับนี้ | คู่มือ deploy + build | โรดแมปสำหรับ IT |

---

## 2. ภาพรวมสถาปัตยกรรม (Architecture)

```
                    ┌───────────────────────────────────────────────┐
   HR (3–5 users)   │  FRONTEND — React 18 + Vite (static SPA)       │
   Approvers        │  • HR Dashboard + Pipeline + Reports/KPI       │
   Candidates  ───► │  • Approver view (magic link)                  │
                    │  • Candidate self-service upload (token link)  │
                    └───────────────┬───────────────────────────────┘
                                    │ HTTPS (REST + Realtime websocket)
                    ┌───────────────▼───────────────────────────────┐
                    │  DATA / BACKEND                                 │
                    │  • PostgreSQL  (candidates, candidate_audit)    │
                    │  • Realtime    (push updates ให้ทุกคนเห็นพร้อมกัน)│
                    │  • Storage     (resume, signed PDF, เอกสาร)      │
                    │  • Auth        (HR login + magic links)         │
                    └───────────────┬───────────────────────────────┘
                                    │ server-side only (มี secret)
                    ┌───────────────▼───────────────────────────────┐
                    │  EMAIL — Microsoft 365 Graph API                │
                    │  ส่งจาก Hr.jc@jianchatea.com (Mail.Send)         │
                    └────────────────────────────────────────────────┘
```

**หลักการ:** Frontend เป็น static SPA (โฮสต์ที่ไหนก็ได้). งานที่ต้องใช้ secret (ส่งอีเมล M365, service-role DB) **ต้องอยู่ฝั่ง server** (Supabase Edge Function / serverless API / Azure Function) — ห้ามฝัง secret ใน client เด็ดขาด

### ตัวเลือก hosting (IT ตัดสินใจ)
| ชั้น | ตัวเลือก A (cloud เร็วสุด) | ตัวเลือก B (Microsoft stack) |
|---|---|---|
| Frontend | Vercel / Netlify | Azure Static Web Apps |
| Database | Supabase (Postgres + Realtime + Storage + Auth) | Azure DB for PostgreSQL + Azure Blob + Entra ID |
| Email | M365 Graph API | M365 Graph API |
| Server functions | Supabase Edge Functions | Azure Functions |

> ความต้องการขั้นต่ำที่ต้องมีเหมือนกันทุกตัวเลือก: **PostgreSQL · static hosting (HTTPS) · object storage · ส่งอีเมล M365 · realtime หรือ polling**

---

## 3. สถานะปัจจุบันของโค้ด (ต้องอ่านก่อนเริ่ม)

| ไฟล์ | ฟีเจอร์ | ต่อฐานข้อมูล? | บทบาท |
|---|---|---|---|
| `src/App.jsx` | ✅ **แกนหลักครบ**: 8 steps, dashboard 3 กลุ่ม, Reports/KPI, lifecycle, ทดลองงาน Day 30/60/90/119 | ✅ Supabase จริง + realtime | **แอป production** — deploy ใช้ได้เลย |
| `preview.html` | ✅ ครบ 100% รวมส่วนที่ IT ทำต่อ (3 roles, ลายเซ็น, สร้างเอกสาร, อีเมลรายสเตป) | ❌ in-memory (refresh หาย) | **spec ส่วนที่เหลือ** — ลอกหน้าตา/logic จากที่นี่ |

**สิ่งที่ทำเสร็จแล้วใน `src/App.jsx` (โค้ดเสร็จ — ใช้งานได้):**
- เปิดตำแหน่ง (New Requisition) → ติดตาม 8 steps → ผ่าน step / ผู้สมัครถอน / ยกเลิกตำแหน่ง
- ใส่ชื่อผู้สมัครหลังผ่านสัมภาษณ์ (position-first model)
- Dashboard 3 กลุ่ม (Open / Onboarding / Probation) + ค้นหา/กรอง
- **หน้า Reports/KPI** (time-to-fill, SLA, funnel, แผนก, ทดลองงาน, ค่าตอบแทน, ภาระงาน)
- ทดลองงาน: บันทึกคะแนน Day 30/60/90 + ผ่านโปร Day 119
- Pre-boarding checklist เอกสาร 6 รายการ
- บันทึก/อ่าน Supabase + realtime + audit log (อัตโนมัติจาก DB trigger)

**งานที่ IT ทำต่อตอน deploy (spec อยู่ใน `preview.html`):**
- Portal เซ็นอนุมัติ e-signature เต็มรูปแบบ (ตอนนี้ใช้ปุ่ม "บันทึกอนุมัติครบ" แทนชั่วคราว)
- สร้างเอกสาร PDF ตามแบบฟอร์ม JIANCHA (Manpower / Scorecard / Approval / Probation)
- Portal ผู้อนุมัติ + ผู้สมัคร ผ่าน magic link / token
- UI เขียน + ยิงอีเมลรายสเตป (เชื่อม `sendEmail()` → Edge Function แล้ว เหลือทำ UI)
- Login / auth + ปรับ RLS ตาม role

---

## 4. Workflow ธุรกิจ 8 ขั้นตอน (Functional spec)

| Step | ชื่อ | เจ้าของงาน | สิ่งที่เกิดขึ้น |
|---|---|---|---|
| 1 | Requisition Approval (ขออนุมัติอัตรากำลังคน) | Dept Head + HR | สร้างเอกสาร *Manpower Requisition* → ส่งให้ผู้อนุมัติ **เซ็นตามลำดับ** จนครบ จึงเปิดสรรหาได้ |
| 2 | Sourcing (ดำเนินการสรรหา) | HR Recruiter | นับถอยหลัง **30 วัน** (SLA) |
| 3 | Screening & Shortlist | HR Recruiter | อัปโหลด resume ผู้สมัครได้หลายคน → อีเมลส่งให้ Hiring Manager + timeline |
| 4 | Interview Scheduling (นัดสัมภาษณ์) | HR Recruiter | อีเมลนัดสัมภาษณ์ (แนบไฟล์ + ส่งผู้สมัคร & ผู้สัมภาษณ์) |
| 5 | Interview Evaluation (ประเมินสัมภาษณ์) | Hiring Mgr → HR | สร้าง scorecard ให้คะแนน → ใส่ชื่อผู้สมัครที่ผ่าน |
| 6 | Offer Approval & Extension | HR + Approvers | สร้างเอกสาร *Recruitment Approval* (เกรด/เงินเดือน/ค่าตอบแทนรวม) → เซ็นอนุมัติตามลำดับ → ส่ง Offer |
| 7 | Pre-Boarding Documents | HR Recruiter | กำหนดรายการเอกสาร → ส่งลิงก์ให้ผู้สมัครอัปโหลดเอง |
| 8 | Probation Period (ทดลองงาน 120 วัน) | Hiring Mgr · HR | ประเมิน **Day 30 / 60 / 90** → **Day 119 = ผ่านโปร** |

**3 บทบาทผู้ใช้ (roles):**
1. **HR Dashboard** — จัดการทุกตำแหน่ง, pipeline, reports
2. **Approver** — เปิดจาก magic link, ดูเอกสาร, เซ็นอนุมัติ/ไม่อนุมัติ (Step 1 & 6)
3. **Candidate** — เปิดจาก token link, อัปโหลดเอกสาร pre-boarding (Step 7)

**Digital signature:** ผู้อนุมัติเซ็นด้วยการวาด (canvas) หรืออัปโหลดรูปลายเซ็น → ลายเซ็นไปปรากฏในเอกสาร PDF พร้อม timestamp + ลำดับการเซ็น (audit)

**อีเมลกลาง:** ทุกอีเมลในทุก step ส่งจาก `Hr.jc@jianchatea.com` (ดูหัวข้อ 7)

---

## 5. โครงสร้างข้อมูล (Data model)

ตารางหลักคือ `public.candidates` (1 แถว = 1 อัตรา/ตำแหน่ง). ดูรายละเอียดเต็มใน `supabase/schema.sql`

**คอลัมน์สำคัญ:**
- `position`, `department`, `type` (replacement / new_headcount), `process_start_date`, `current_step` (1–8), `status` (active/passed/cancelled/rejected)
- `name` — ชื่อผู้สมัคร, **NULL จนกว่าจะผ่านสัมภาษณ์** (model นี้เป็น "position-first")
- JSONB columns เก็บข้อมูลซับซ้อน:
  - `steps` `[{step,completedDate,completedBy}]` ← ใช้คำนวณ time-to-fill
  - `documents` `[{key,label,received,receivedDate}]` ← Step 7 checklist
  - `probation` `{startDate,returnDate,passed,milestones:{day30,day60,day90,day120}}`
  - `shortlist` `[{name,files,sentTo}]` ← Step 3
  - `generated_docs` `{1,5,6,8}` ← ข้อมูลฟอร์มแต่ละเอกสาร (เกรด/เงินเดือน/คะแนน)
  - `approval_workflows` `{1,6}` ← workflow ลายเซ็น (approvers + signedAt + signature)
  - `distributions` `{3,4,5,7,8}` ← log การส่งอีเมล
  - `files` `[{name,step,storagePath}]` ← metadata ไฟล์ (binary อยู่ใน Storage)
- `created_by` / `updated_by` — ชื่อผู้ทำรายการ (audit)

**Audit trail:** ตาราง `candidate_audit` + trigger บันทึกทุก insert/update/delete อัตโนมัติ (รองรับการตรวจสอบย้อนหลังระดับ IPO-grade)

**KPI view:** `public.candidate_kpi` แปลง JSONB เป็นคอลัมน์ที่ query รายงานได้ทันที (time-to-fill, sourcing SLA, approval cycle, เงินเดือน, probation)

---

## 6. การ build → deploy (อ้างอิง: Supabase + Vercel)

> ถ้าเลือก Microsoft stack ขั้นตอนคล้ายกัน — เปลี่ยน Supabase เป็น Azure DB/Blob/Functions และ Vercel เป็น Azure Static Web Apps

### 6.1 ตั้งฐานข้อมูล
1. สร้างโปรเจกต์ Supabase (เลือก region สิงคโปร์ ใกล้ไทยสุด)
2. เปิด SQL Editor → วางเนื้อหา `supabase/schema.sql` ทั้งไฟล์ → Run
3. Storage → สร้าง bucket ชื่อ `recruitment` (private) สำหรับ resume / เอกสารเซ็นแล้ว / ไฟล์อัปโหลด

### 6.2 ตั้งค่า config
1. คัดลอก `.env.example` → `.env.local`
2. ใส่ค่า `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (จาก Supabase → Project Settings → API)
3. ใส่ค่า M365 + service role ในฝั่ง server (ดูหัวข้อ 7) — **ไม่ใส่ใน VITE_**

### 6.3 รัน/บิลด์
```bash
npm install
npm run dev      # ทดสอบ local ที่ http://localhost:5173
npm run build    # ได้โฟลเดอร์ dist/ (static)
```

### 6.4 Deploy
1. push โค้ดขึ้น Git repo
2. เชื่อม Vercel → import repo → ตั้ง Environment Variables (เหมือน `.env.example`)
3. Deploy → ได้ URL → ตั้ง custom domain เช่น `recruitment.jianchatea.com`

---

## 7. การส่งอีเมลจริงผ่าน Microsoft 365 (Graph API)

ทุกอีเมลส่งจากกล่องกลาง **`Hr.jc@jianchatea.com`**

### 7.1 ตั้งค่าใน Entra ID (Azure AD)
1. Entra ID → App registrations → New registration (เช่น "Recruitment-Mailer")
2. API permissions → Microsoft Graph → **Application permissions** → `Mail.Send` → **Grant admin consent**
3. Certificates & secrets → สร้าง Client secret → เก็บค่า
4. ได้ค่า: `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`
5. กล่อง `Hr.jc@jianchatea.com` ต้องเป็น mailbox จริง (shared mailbox ก็ได้ ไม่ต้องมี license สำหรับ shared)

> 🔒 ความปลอดภัย: `Mail.Send` แบบ application = ส่งแทนได้ทุกกล่องใน tenant. แนะนำจำกัดด้วย **Application Access Policy** (PowerShell `New-ApplicationAccessPolicy`) ให้แอปส่งได้เฉพาะกล่อง `Hr.jc@jianchatea.com`

### 7.2 การเรียกใช้ (ฝั่ง server เท่านั้น)
สร้าง endpoint server (Supabase Edge Function / serverless) ที่:
1. ขอ token: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` (client_credentials, scope `https://graph.microsoft.com/.default`)
2. ส่งเมล: `POST https://graph.microsoft.com/v1.0/users/Hr.jc@jianchatea.com/sendMail`

### 7.3 อีเมลที่ระบบต้องส่ง (ดูเทมเพลตจริงใน prototype)
| Step | อีเมล | ถึง |
|---|---|---|
| 1, 6 | คำขออนุมัติ + magic link เซ็น | ผู้อนุมัติ (ตามลำดับ) |
| 3 | ส่ง resume shortlist | Hiring Manager |
| 4 | นัดสัมภาษณ์ (+แนบไฟล์) | ผู้สมัคร + ผู้สัมภาษณ์ |
| 5 | ส่ง scorecard | ผู้ประเมิน |
| 7 | ลิงก์อัปโหลดเอกสาร | ผู้สมัคร |
| 8 | ฟอร์มประเมินทดลองงาน | หัวหน้า/ผู้ประเมิน |

> เนื้อหาอีเมลทุกฉบับ (ภาษาอังกฤษ, ปิดท้าย "HR Team · JIAN CHA Co., Ltd. · Hr.jc@jianchatea.com") อยู่ใน `preview.html` แล้ว — ลอกไปใช้ได้เลย

---

## 8. ไฟล์ / Storage

- Bucket `recruitment` (private) จัดเป็นโฟลเดอร์: `{candidateId}/step{n}/{filename}`
- ประเภทไฟล์: resume (Step 3), เอกสารที่เซ็นแล้ว (Step 1/6 PDF), เอกสาร pre-boarding ที่ผู้สมัครอัปโหลด (Step 7)
- เก็บเฉพาะ metadata ใน `candidates.files`; ตัวไฟล์อยู่ใน storage
- เข้าถึงผ่าน **signed URL** อายุจำกัด (ห้ามเปิด public)
- กำหนด retention/นโยบายลบ ตาม PDPA (ดูหัวข้อ 11)

---

## 9. Authentication & การเข้าถึง (สำคัญด้านความปลอดภัย)

| ผู้ใช้ | วิธีเข้า | สิทธิ์ |
|---|---|---|
| HR (3–5 คน) | Login (Supabase Auth / Entra SSO) | จัดการทุกตำแหน่ง |
| Approver | Magic link (token, หมดอายุ) | ดู+เซ็นเฉพาะเอกสารของตน |
| Candidate | Token link (หมดอายุ) | อัปโหลดเฉพาะของตน |

> ⚠️ **ต้องแก้ก่อน production:** schema ปัจจุบันตั้ง RLS แบบเปิด (anon CRUD ได้หมด) เพื่อความง่ายตอน MVP — **ก่อนใช้จริงต้องเปลี่ยนเป็น policy ตาม role/auth** (เช่น เฉพาะ user ที่ login ถึงแก้ candidates ได้, magic link ใช้ token ตรวจสอบฝั่ง server) ดูคอมเมนต์ในไฟล์ schema

แนะนำ: ใช้ **Entra ID SSO** ให้ HR login ด้วยบัญชี Microsoft ของบริษัท (sync กับ M365 ที่มีอยู่)

---

## 10. รายงาน / KPI (Reports)

หน้า **Reports/KPI** มีใน prototype แล้ว (แท็บ "📊 Reports / KPI" บน HR Dashboard) ดึงข้อมูลเหล่านี้:

| รายงาน | ที่มาของข้อมูล |
|---|---|
| เปิด/ปิด/ยกเลิกตำแหน่ง รายเดือน | `process_start_date`, `approval_workflows[6].completedAt`, `status` |
| Time-to-fill เฉลี่ย (เปิดอัตรา → อนุมัติ Offer) | `process_start_date` → `steps[step=6]` |
| Sourcing SLA (ปิดใน 30 วันกี่ %) | `steps[step=2]` − `process_start_date` |
| เวลาอนุมัติเอกสารเฉลี่ย | `approval_workflows.createdAt → completedAt` |
| Pipeline funnel (ค้าง Step ไหน) | `current_step` (active) |
| แยกตามแผนก | `department` |
| สุขภาพการทดลองงาน + รอบประเมินที่ใกล้ถึง | `probation.milestones` + `startDate` |
| ค่าตอบแทนเฉลี่ย (เงินเดือน/รวมรายได้) แยกตามระดับ | `generated_docs[6]` (salary_new, total_income, level) |
| ภาระงานทีม HR | `steps[].completedBy` |
| Audit: ใครทำอะไรเมื่อไหร่ | `candidate_audit` |

> ฝั่ง production ใช้ view `candidate_kpi` query ตรงจาก SQL หรือต่อ BI tool (Power BI / Metabase) ได้

---

## 11. ความปลอดภัย & ข้อกำหนด (Checklist ก่อน go-live)

- [ ] เปลี่ยน RLS จาก anon-open → policy ตาม auth/role
- [ ] Secret ทั้งหมด (M365, service role) อยู่ฝั่ง server เท่านั้น
- [ ] จำกัด M365 Mail.Send ด้วย Application Access Policy ให้เฉพาะกล่องกลาง
- [ ] ไฟล์ใน storage เป็น private + ใช้ signed URL หมดอายุ
- [ ] Magic/upload link เป็น token ที่หมดอายุ + ตรวจสอบฝั่ง server
- [ ] HTTPS ทุก endpoint
- [ ] **PDPA**: ขอความยินยอมผู้สมัคร, กำหนด retention (ลบข้อมูลผู้สมัครที่ไม่ผ่านตามรอบ), จำกัดผู้เข้าถึง
- [ ] Audit trail เปิดใช้ (มีใน schema แล้ว) + backup DB อัตโนมัติ
- [ ] เก็บ log การส่งอีเมล (success/fail)

---

## 12. Checklist งานที่ IT ต้องทำ (Prototype → Production)

**✅ โค้ดที่ให้มาแล้ว — ทำเสร็จ (อยู่ใน `src/App.jsx`)**
- [x] แกนหลัก 8 steps + lifecycle + dashboard 3 กลุ่ม + ค้นหา/กรอง
- [x] บันทึก/อ่าน Supabase + realtime หลายคนพร้อมกัน
- [x] หน้า Reports/KPI
- [x] ทดลองงาน Day 30/60/90/119 + บันทึกคะแนน
- [x] data layer + storage upload + email helper ใน `src/lib/supabase.js`
- [x] Edge Function ส่งอีเมล M365 (`supabase/functions/send-email`)

**A. โครงสร้างพื้นฐาน (IT ทำเพื่อ deploy)**
- [ ] ตั้ง DB + รัน `schema.sql` + สร้าง storage bucket `recruitment`
- [ ] ตั้ง M365 app registration → deploy Edge Function + ตั้ง secret → ทดสอบส่งอีเมล
- [ ] ตั้ง hosting + custom domain + env vars → **deploy แกนหลักให้ HR เริ่มใช้ได้**

**B. งานที่ IT ทำต่อ (integration — spec อยู่ใน `preview.html`)**
- [ ] Portal เซ็นอนุมัติ e-signature (Step 1 & 6) — แทนปุ่ม "บันทึกอนุมัติครบ" ชั่วคราว
- [ ] สร้างเอกสาร PDF ตามแบบฟอร์ม JIANCHA (Manpower / Scorecard / Approval / Probation) + ฝังลายเซ็น
- [ ] Portal ผู้อนุมัติ (magic link) + ผู้สมัครอัปโหลดเอกสาร (token link) + ตรวจสอบฝั่ง server
- [ ] UI เขียน/ยิงอีเมลรายสเตป (เชื่อม `sendEmail()` ที่มีให้แล้ว)
- [ ] upload ไฟล์จริงในทุกจุด (helper `uploadFile()` มีให้แล้ว)

**C. ความปลอดภัย & ส่งมอบ**
- [ ] ทำ auth/login + ปรับ RLS จาก anon-open → ตาม role
- [ ] ทำ security checklist หัวข้อ 11
- [ ] UAT กับทีม HR → go-live

---

## 13. คำถาม/การตัดสินใจที่ค้าง (สำหรับคุยกัน IT ↔ HR)

1. Hosting: เลือก cloud (Supabase+Vercel) หรือ Microsoft stack (Azure)?
2. Login HR: ใช้ Entra SSO ของบริษัท หรือ email+password แยก?
3. PDPA retention: เก็บข้อมูลผู้สมัครที่ไม่ผ่านนานเท่าไร?
4. PDF: ต้องการ export PDF ฝั่ง server (เก็บไฟล์ถาวร) หรือพิมพ์จากเบราว์เซอร์พอ?
5. รองรับหลายแบรนด์ (JIAN CHA / POLLY / JAI CHAN) ในอนาคตหรือไม่ (มีผลต่อ data model)?

---

*ติดต่อเจ้าของระบบ (Business owner): Head of HR — สำหรับคำถามด้าน business logic / workflow ดูภาพประกอบจริงได้จาก `preview.html`*
