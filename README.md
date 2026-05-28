# Recruitment 120 Days · HR Tracker

> 📘 **ทีม IT:** อ่าน **[`DEPLOYMENT_GUIDE_FOR_IT.md`](./DEPLOYMENT_GUIDE_FOR_IT.md)** เป็นหลัก (สถาปัตยกรรม, M365 email, Phase 1 vs Phase 2, checklist).
> ระบบเป็น **8 steps** · `src/App.jsx` = แอป production แกนหลัก (รันได้) · `preview.html` = ต้นแบบครบทุกฟีเจอร์ (spec เฟส 2).

ระบบติดตามกระบวนการสรรหาและทดลองงาน 120 วัน สำหรับทีม HR ใช้งานร่วมกัน 3–5 คน
**Stack**: React 18 + Vite · Supabase (PostgreSQL + Realtime) · Vercel · Tailwind CSS

> MVP scope: **HR-only** — ทุกคนใน team แชร์ URL เดียวกัน เห็นข้อมูลเดียวกัน sync แบบ real-time

---

## โครงสร้างโปรเจกต์

```
recruitment-tracker/
├── supabase/schema.sql        ← รัน 1 ครั้งใน Supabase SQL Editor
├── src/
│   ├── App.jsx                ← UI ทั้งหมด (Dashboard, Modal, Step Tracker, Probation)
│   ├── main.jsx               ← entry point
│   ├── index.css              ← Tailwind directives + font
│   └── lib/supabase.js        ← Supabase client + CRUD + realtime
├── index.html
├── .env.example               ← copy เป็น .env.local แล้วใส่ค่าจริง
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## ขั้นตอนการติดตั้ง (เรียงตามลำดับ)

### 1) สร้าง Supabase Project (ฟรี)

1. ไปที่ https://supabase.com → Sign up / Sign in
2. กด **New project** → ตั้งชื่อ เช่น `recruitment-tracker` → เลือก region `Southeast Asia (Singapore)` → ตั้ง database password (เก็บไว้)
3. รอ ~2 นาที จน project พร้อม
4. ไปที่เมนู **SQL Editor** → New query → **paste เนื้อหาทั้งหมดจาก `supabase/schema.sql`** → กด Run
5. ไปที่เมนู **Project Settings → API** → copy:
   - `Project URL`  → จะใช้เป็น `VITE_SUPABASE_URL`
   - `anon public key` → จะใช้เป็น `VITE_SUPABASE_ANON_KEY`

### 2) ติดตั้ง dependencies + รันบนเครื่อง

ต้องมี **Node.js 18+** ติดตั้งก่อน (https://nodejs.org)

```bash
# ใน folder recruitment-tracker
npm install
copy .env.example .env.local     # Windows
# (macOS/Linux ใช้:  cp .env.example .env.local)
```

เปิด `.env.local` แล้วใส่ค่าจาก Supabase:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_DEFAULT_ACTOR=HR
```

รันบนเครื่อง:

```bash
npm run dev
```

เปิด http://localhost:5173 → ลองกด **เพิ่ม Candidate** ใหม่ ดูว่าบันทึกได้และเห็นใน Supabase Table Editor

### 3) Deploy ขึ้น Vercel (ฟรี)

1. Push code ขึ้น GitHub (สร้าง repo ใหม่ private)
2. ไปที่ https://vercel.com → **Add New → Project** → import repo
3. **Environment Variables**: ใส่ 2 ค่าเหมือนใน `.env.local`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. กด **Deploy** → รอประมาณ 1 นาที → ได้ URL เช่น `recruitment-tracker.vercel.app`
5. **แชร์ URL ให้ทีม HR ทุกคน** (3–5 คน) — เปิดพร้อมกันได้ ข้อมูล sync real-time

---

## วิธีใช้งานในแต่ละวัน (HR)

| สถานการณ์                                  | ทำอะไร                                                            |
|--------------------------------------------|-------------------------------------------------------------------|
| มีตำแหน่งใหม่ต้องสรรหา                       | กด **เพิ่ม Candidate** → กรอกชื่อ ตำแหน่ง แผนก ประเภท วันเริ่ม      |
| ทำงานเสร็จในแต่ละ Step                      | เปิดการ์ด candidate → กด **ผ่าน Step →**                          |
| รับเอกสารเริ่มงาน (Step 7)                  | ติ๊ก checkbox เอกสารที่รับแล้ว ระบบบันทึกวันที่ให้อัตโนมัติ          |
| เริ่มทดลองงาน (Step 10)                     | กดผ่าน Step 9 → ระบบสร้าง probation timeline ให้อัตโนมัติ         |
| ครบ Day 119–120                            | ปุ่ม **ผ่านโปร ✓** จะปรากฏในการ์ด candidate                       |
| Candidate ไม่ผ่าน / ถอน                     | เปิดการ์ด → กด **ยกเลิก** (เก็บไว้ใน history แต่ไม่นับใน active)   |
| เปลี่ยนชื่อผู้บันทึก                          | คลิกชื่อผู้ใช้ที่มุมขวาบน → พิมพ์ชื่อจริง (จำในเครื่องนี้)              |

### Color coding บนการ์ด

- 🟢 **เขียว** — ปกติ ตรงเวลา
- 🟡 **เหลือง** — เหลือเวลา ≤ 3 วันก่อนถึง deadline Step 2 (สรรหา 30 วัน)
- 🔴 **แดง** — เกิน deadline แล้ว
- 🔵 **ฟ้า** — พร้อมผ่านโปร (Day 119+)

---

## Audit log

ทุก insert / update / delete ของ candidates จะถูกบันทึกลง table **`candidate_audit`** อัตโนมัติ (ผ่าน trigger)
ดูได้ใน Supabase Table Editor → `candidate_audit` หรือ query:

```sql
select occurred_at, action, actor, diff->>'name' as name, diff->>'current_step' as step
from candidate_audit
order by occurred_at desc
limit 50;
```

ใช้ตรวจย้อนหลังว่าใครแก้อะไรเมื่อไหร่ — เตรียมพร้อมสำหรับ IPO audit ในอนาคต

---

## ค่าใช้จ่าย

| Service           | Free Tier                                    | เพียงพอสำหรับ |
|-------------------|----------------------------------------------|----------------|
| Supabase          | 500 MB DB · 50,000 monthly active users      | ✅ ทีม 3–5 คน  |
| Vercel            | 100 GB bandwidth / เดือน                     | ✅ ทีม 3–5 คน  |
| **รวม**           | **฿0 / เดือน**                                |                |

---

## Troubleshooting

**ปัญหา**: เปิดเว็บแล้วเห็น "โหลดข้อมูลไม่สำเร็จ"
**แก้**: ตรวจสอบ env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) ว่าใส่ถูกใน Vercel Project Settings → Environment Variables → กด **Redeploy**

**ปัญหา**: กดเพิ่ม candidate แล้ว error `new row violates row-level security`
**แก้**: เช็คว่าได้รัน `schema.sql` ครบทั้งไฟล์ — section ที่ 6 (RLS policies) ต้องรันสำเร็จ

**ปัญหา**: เห็นข้อมูลคนละชุดกับเพื่อนในทีม
**แก้**: ทุกคนต้องเปิด URL เดียวกัน (Vercel domain เดียว) ที่เชื่อม Supabase project เดียวกัน

---

## Roadmap (Phase 2+) — สำหรับอนาคต

- เชื่อม e-signature ภายใน (project แยก) สำหรับ Step 8 (ขออนุมัติ) + Step 9 (สัญญาจ้าง)
- เพิ่ม role: Hiring Manager (read-only ของแผนกตัวเอง + อนุมัติ Step 4)
- Multi-brand: filter ตาม JIAN CHA / POLLY / JAI CHAN
- Email notification เมื่อใกล้ deadline (Supabase Edge Function + SendGrid)
- Export Excel รายเดือนสำหรับ management report
