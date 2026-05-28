# Production Readiness Assessment — Recruitment 120 Days

> การประเมินความพร้อมก่อนขึ้นใช้งานจริง · สำหรับ HR + IT พิจารณาร่วมกัน
> **วันที่:** 2026-05-28 · **ผู้ประเมิน:** ทีมพัฒนา (Claude) · **เวอร์ชันที่ประเมิน:** โค้ดปัจจุบันใน `recruitment-tracker/`

---

## 🚦 สรุปคำตัดสิน (Verdict)

### 🔴 **ยังไม่พร้อมขึ้น production — NO-GO (ในสภาพปัจจุบัน)**

เหตุผลหลัก: **ความปลอดภัยของข้อมูล** ยังเปิดสาธารณะ (ใครก็เข้าถึง/แก้/ลบข้อมูลพนักงาน + เงินเดือนได้) และ **ยังไม่มีระบบ login** — ถ้าเอาขึ้นใช้ตอนนี้ = เสี่ยงข้อมูลส่วนบุคคล (PII) รั่ว ผิด PDPA

**แต่** โครงสร้างและสถาปัตยกรรมดีและถูกทาง — แก้ตามรายการ 🔴 ด้านล่างแล้วขึ้นได้ ประเมินงานแก้ blocker ≈ **1–2 สัปดาห์** (dev 1 คน) สำหรับเวอร์ชันใช้งานแกนหลักอย่างปลอดภัย

**คะแนนความพร้อมรวม: 4/10** (แกน + เอกสาร + data model ดี · แต่ security/auth/test ยังไม่พร้อม)

---

## 📊 Scorecard รายด้าน

| ด้าน | คะแนน | สรุป |
|---|---|---|
| สถาปัตยกรรม & โครงโค้ด | 🟢 8/10 | สะอาด แยกชั้นดี (UI / data layer / DB / email) เหมาะกับ scale |
| Data model & schema | 🟢 8/10 | ครบ มี audit trigger + KPI view · ติดเรื่อง audit cascade (ดูล่าง) |
| ฟังก์ชันแกนหลัก (HR ใช้ทุกวัน) | 🟢 7/10 | pipeline 8 steps + reports + ทดลองงาน โค้ดเสร็จ |
| **ความปลอดภัย / Auth** | 🔴 **2/10** | **RLS เปิดหมด + ไม่มี login** = blocker |
| **ความเป็นส่วนตัว / PDPA** | 🔴 **3/10** | เก็บ PII (บัตร ปชช./ทะเบียนบ้าน/ใบแพทย์) ยังไม่มี consent/retention/จำกัดสิทธิ์ |
| ฟังก์ชันครบตาม spec | 🟠 5/10 | e-sign / PDF / portal ภายนอก / UI ส่งอีเมล ยังไม่ได้เขียน (มี spec ใน preview.html) |
| Reliability / Ops | 🟠 5/10 | ยังไม่ได้ตั้ง backup / monitoring / error boundary |
| Testing / QA | 🔴 2/10 | ไม่มี test, ไม่มี CI, **ยังไม่เคย build ตรวจว่า compile ผ่าน** |
| เอกสาร | 🟢 9/10 | ครบมาก (deploy guide + workflow + spec กดได้) |
| Performance / Scale | 🟢 9/10 | ผู้ใช้ 3–5 คน + หลักร้อย record = สบาย |

---

## 🔴 BLOCKERS — ต้องแก้ก่อนเอาข้อมูลจริงเข้า (Go-live เด็ดขาด)

### 1. ฐานข้อมูลเปิดสาธารณะ (RLS anon-open) — ร้ายแรงสุด
`supabase/schema.sql` (บรรทัด 111–114) อนุญาตให้ anon `select/insert/update/delete` ได้ **ทุกแถว**
- anon key ถูกฝังในไฟล์ JS ที่ส่งให้เบราว์เซอร์ → ใครเปิด DevTools ก็เห็น → **เข้าถึงข้อมูลพนักงาน + เงินเดือน + เอกสารทั้งหมดได้**
- ✅ ต้องทำ: เพิ่ม **authentication** แล้วเปลี่ยน policy เป็น "เฉพาะ user ที่ login (role HR)" · magic link/upload link ตรวจ token ฝั่ง server

### 2. ไม่มีระบบ Login / Authentication
`src/lib/supabase.js` ตั้ง `persistSession: false` และ `App.jsx` ไม่มีหน้า login — ใครมี URL ก็ใช้ได้
- ✅ ต้องทำ: ทำ login (แนะนำ **Entra ID SSO** ของบริษัท) ก่อนเปิดใช้

### 3. Edge Function ส่งอีเมล — ต้องล็อก
`supabase/functions/send-email` ถ้าไม่ตั้ง verify JWT = ใครก็เรียกให้ส่งอีเมลจากกล่องบริษัทได้ (open relay)
- ✅ ต้องทำ: บังคับ verify JWT + จำกัด M365 ด้วย **Application Access Policy** ให้ส่งได้เฉพาะ `Hr.jc@jianchatea.com` · เก็บ secret ฝั่ง server เท่านั้น

### 4. ยังไม่เคย build ตรวจว่า compile ผ่าน
ไม่มี `node_modules` / lockfile — โค้ด `src/App.jsx` ยังไม่ผ่านการ build จริง
- ✅ ต้องทำ: `npm install && npm run build` แก้ error (ถ้ามี) ให้ผ่านก่อน

### 5. PDPA — เก็บข้อมูลส่วนบุคคลอ่อนไหว
เก็บสำเนาบัตร ปชช. / ทะเบียนบ้าน / ใบรับรองแพทย์ ของผู้สมัคร
- ✅ ต้องทำ: ขอ **ความยินยอม (consent)**, กำหนด **retention** (ลบผู้สมัครที่ไม่ผ่านตามรอบ), จำกัดสิทธิ์เข้าถึง, ทำ DPA กับผู้ให้บริการ cloud (Supabase/Microsoft)

---

## 🟠 GAP สำคัญ — เพื่อให้ "เต็มระบบ" ตามที่ต้องการ

6. **ฟีเจอร์ที่ยังเป็น spec (อยู่ใน `preview.html` ยังไม่เขียนใน `src/`):** portal เซ็น e-signature เต็มรูปแบบ · สร้างเอกสาร PDF (Manpower/Scorecard/Approval/Probation) · portal ผู้อนุมัติ/ผู้สมัคร (magic link) · UI เขียน/ยิงอีเมลรายสเตป (มี helper `sendEmail()` แล้ว เหลือทำ UI)
7. **Storage:** bucket `recruitment` ต้องเป็น private + ใช้ signed URL (helper ทำไว้แล้ว) — เหลือเชื่อม UI อัปโหลดจริง
8. **Audit ไม่ immutable:** `candidate_audit` ตั้ง `on delete cascade` (schema บรรทัด 71) → **ลบ candidate แล้วประวัติ audit หายตามไปด้วย** ไม่เหมาะกับ audit ระดับ IPO
   - ✅ แก้: เอา cascade ออก (เก็บ audit ไว้แม้ลบ candidate) + ห้ามลบ/แก้ตาราง audit

---

## 🟡 ควรทำ (Hardening / คุณภาพ)

9. ตั้ง **backup อัตโนมัติ** (Supabase Point-in-Time Recovery บน plan ที่รองรับ) + monitoring/alert
10. เพิ่ม **error boundary** + จัดการ error ฝั่ง UI ให้ครบ (ตอนนี้ใช้ `alert()`)
11. เพิ่ม **automated test** อย่างน้อย smoke test + ตั้ง CI (build ทุก push)
12. ตรวจ accessibility + validation input (เช่น อีเมล/วันที่/ตัวเลข)
13. แทน `prompt()`/`confirm()` ด้วย modal จริงในเวอร์ชัน production

---

## ✅ จุดที่ทำได้ดีแล้ว (Strengths)

- สถาปัตยกรรมแยกชั้นชัดเจน (UI / `lib/supabase.js` / DB / Edge Function) ต่อยอดง่าย
- Data model ครบ + **audit trigger อัตโนมัติ** + **view `candidate_kpi`** สำหรับรายงาน
- แกนหลัก HR ใช้งานได้จริง: 8 steps, dashboard, **Reports/KPI**, ทดลองงาน Day 30/60/90/119
- realtime หลายคนเห็นพร้อมกัน
- **เอกสารครบและแม่นยำ**: deploy guide + workflow + ต้นแบบกดได้ (`preview.html`) + schema + email function
- ขนาด/สเกลเหมาะกับงาน (ผู้ใช้น้อย, data หลักร้อย)

---

## 🎯 เส้นทางสั้นที่สุดสู่ Go-live (เรียงลำดับ)

**ระยะ 1 — ปลอดภัยพอขึ้นใช้แกนหลัก (≈1–2 สัปดาห์):**
1. ทำ login (Entra SSO) + เปลี่ยน RLS เป็นตาม role → ปิดช่องข้อมูลรั่ว (Blocker 1,2)
2. เอา `on delete cascade` ออกจาก audit + ล็อกตาราง audit (Gap 8)
3. `npm install && npm run build` ผ่าน + ทดสอบ flow หลัก (Blocker 4)
4. ตั้ง backup + วาง PDPA consent/retention เบื้องต้น (Blocker 5)
5. ตั้ง M365 + ล็อก Edge Function (Blocker 3) — ถ้าจะใช้ส่งอีเมลจริง
→ **ขึ้นใช้แกนหลัก (pipeline + reports + ทดลองงาน) ได้อย่างปลอดภัย**

**ระยะ 2 — เต็มระบบตาม spec:**
6. e-sign portal · PDF generation · portal ผู้อนุมัติ/ผู้สมัคร · UI ส่งอีเมลรายสเตป (ตาม `preview.html`)
7. test/CI + monitoring + error handling ครบ

---

## สรุปให้ผู้บริหาร (1 บรรทัด)

> โครงสร้างดีและถูกทาง แต่**ยังขึ้น production ไม่ได้ทันที** เพราะข้อมูลยังเปิดสาธารณะ + ไม่มี login — แก้ความปลอดภัย/PDPA (≈1–2 สัปดาห์) แล้วเปิดใช้แกนหลักได้ ส่วนฟีเจอร์เต็มรูปแบบทำต่อเป็นลำดับถัดไป
