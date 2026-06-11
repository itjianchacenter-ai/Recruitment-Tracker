# Production Readiness Assessment — Recruitment 120 Days (v2)

> อัปเดตแทนที่ `PRODUCTION_READINESS_ASSESSMENT.md` (ฉบับ 2026-05-28 · ล้าสมัยแล้ว)
> **วันที่:** 2026-06-11 · **ผู้ประเมิน:** Claude (Claude Code) · **ฐานที่ตรวจ:** โค้ด `main` ที่ deploy จริง + ตรวจ **production สด** (DB policies, edge functions, backups, live REST API) ที่ `recruitment.jchr-global.com`

---

## 🚦 คำตัดสิน: แกนหลัก **GO ได้** — แต่ต้องปิด ops gap ก่อนใส่ข้อมูลพนักงานจริง

**คะแนนรวม: ~6.5/10** (ฉบับเดิม 4/10) · ความปลอดภัยข้อมูลหลัก (auth + RLS) **แก้แล้วจริง ยืนยันบน DB สด** · ช่องว่างที่เหลือคือ **backup off-site, edge functions, PDPA**

> ⚠️ สถานะข้อมูล ณ วันประเมิน: `candidates = 0 แถวจริง` (audit 21–47 แถวจากการทดสอบ) → **ยังเป็นช่วงก่อน go-live จริง** เป็นจังหวะที่ดีที่สุดในการปิดช่องโหว่ก่อนข้อมูล PII เข้า

### Scorecard

| ด้าน | เดิม (5-28) | ตอนนี้ (6-11) | หลักฐาน (ตรวจจากของจริง) |
|---|---|---|---|
| Auth / RLS | 🔴 2 | 🟢 8 | anon เรียก REST → `[]` (อ่านไม่ได้) · `pg_policies` ทุกตัวเป็น `{authenticated}` |
| Audit trail | 🟠 | 🟢 8 | `candidate_audit` ไม่มี FK cascade · trigger `security definer` · ไม่มี policy update/delete = append-only |
| **Edge Functions** | — | 🔴 2 | **ไม่มี edge-runtime container** → `/functions/*` = HTTP 503 |
| **Backup / Ops** | 🟠 5 | 🟠 5→7\* | \*เพิ่ง**ตั้ง nightly pg_dump แล้ว** · เหลือ off-site copy · droplet 1GB RAM (swap 39%) |
| PDPA / Privacy | 🔴 3 | 🟠 5 | ยังไม่มี consent/retention — แต่ยังไม่มีข้อมูลจริง |
| Frontend quality | 🔴 | 🟢 7 | ไม่มี console.log ค้าง · toast 81 · 0 npm vuln · ไม่มี secret หลุด git · +ErrorBoundary แล้ว |
| Testing / CI | 🔴 2 | 🔴 2 | ยังไม่มี test/CI |

---

## ✅ แก้ไปแล้วในรอบนี้ (2026-06-11)

1. **Backup รายคืน** — `pg_dump` ทั้ง DB (auth/storage/public) → `/var/backups/recruitment` เก็บ 14 วัน · cron 02:30 · ทดสอบ dump + integrity ผ่าน · script เก็บนอก git tree (รอด `deploy.sh`) → ดู `deploy/backup-db.sh`
2. **ErrorBoundary** — ครอบทั้งแอป (`src/main.jsx`) · render error = หน้า "ระบบขัดข้องชั่วคราว" + ปุ่มโหลดใหม่ แทนจอขาว
3. **`send-email` authz** — เพิ่ม verify JWT (ปิด open-relay) · anon key เรียกส่งเมลจากกล่อง HR ไม่ได้อีก
4. **`admin-users` default-deny + อ่าน `app_metadata` เท่านั้น** — ปิดช่อง self-promotion (เดิมอ่าน `user_metadata` ที่ผู้ใช้แก้เองได้ + ถือว่า "ไม่มี role = admin")
5. **`schema.sql` ล็อก authenticated-only** — รวม `auth-rls.sql` เข้ามา → re-run schema แล้วไม่เปิด anon อีก (ปิด footgun)
6. **ตั้ง role ของ hr01 ใน `app_metadata`** บน prod DB (เดิมอยู่แค่ `user_metadata`)

---

## 🔴 P0 — ต้องทำก่อนใส่ข้อมูลจริง (ที่ยังเหลือ)

### 1. Edge Functions ไม่ได้ deploy → email + จัดการ user ใช้ไม่ได้
- หลักฐาน: ไม่มี edge-runtime container · `/functions/{send-email,admin-users,client-ip}` → **503 "name resolution failed"**
- กระทบ: เมนู **"ผู้ใช้ & รหัสผ่าน"** (admin สร้าง user) error · **อีเมลทุก step** ส่งไม่ได้ · e-sign IP ตกเป็น '-' (degraded แต่ทำงาน)
- ทำ: เพิ่ม `edge-runtime` service ใน docker-compose ของ self-host + deploy 3 functions + ตั้ง M365 secrets
  - ⚠️ **ระวัง RAM**: droplet 1GB ตอนนี้ mem 63% / swap 39% · เพิ่ม container อาจทำให้ไม่เสถียร
  - 💡 ทางเลือกที่ดีกว่า: **ย้าย frontend ไป Cloudflare Pages (ฟรี)** เหลือแต่ Supabase บน droplet → คืน RAM + เลิกปัญหา build OOM/commit dist ไปในตัว

### 2. Backup off-site (ต่อจากที่ตั้งไว้)
- ตอนนี้ backup อยู่บน droplet ตัวเดียว → droplet หาย = backup หายด้วย
- ทำ: ส่ง dump ขึ้น DO Spaces / S3 ทุกคืน (ต้องมี cloud credentials) + ทดสอบ restore เป็นระยะ

### 3. M365 Application Access Policy (ถ้าจะเปิด email)
- จำกัดให้ app ส่งได้เฉพาะ `Hr.jc@jianchatea.com` (ป้องกันส่งจากกล่องอื่นในองค์กร)

---

## 🟠 P1 — High

- **PDPA**: เก็บบัตร ปชช./ทะเบียนบ้าน/ใบแพทย์ → ต้องมี consent (เก็บหลักฐานความยินยอม) + retention (ลบผู้ไม่ผ่านตามรอบ) + DPA กับ Microsoft/่ผู้ให้บริการ · **ทำก่อนข้อมูลจริงเข้า**
- **Storage bucket `recruitment`**: ยืนยันว่าตั้ง **Private** + ใช้ signed URL (helper มีแล้วใน `lib/supabase.js`)
- **Monitoring/alert**: uptime + disk + container health (ตอนนี้ไม่มี) — droplet ล่มเงียบจะไม่มีใครรู้

## 🟡 P2 — Medium

- **Test/CI**: อย่างน้อย smoke test (build + render + login) + GitHub Action build dist ทุก push (แก้ทั้งปัญหา OOM และ "ลืม commit dist")
- **confirm()/prompt() เนทีฟ 13 จุด** → เปลี่ยนเป็น modal
- **App.jsx 4,981 บรรทัดไฟล์เดียว** → แตกเป็นไฟล์ย่อยเมื่อมีเวลา (maintainability)
- **Bundle 561 KB ก้อนเดียว** → code-split ถ้าโหลดช้า (ผู้ใช้น้อยตอนนี้ยังไม่กระทบ)

---

## ✅ จุดแข็ง (รักษาไว้)

RLS ล็อก authenticated จริง (ยืนยันบน DB) · login + persistSession จริง · audit append-only ไม่ cascade · frontend สะอาด (0 log ค้าง, 0 npm vuln, ไม่มี secret หลุด git) · `admin-users` verify JWT ถูก pattern · same-origin (ไม่มี CORS) + security headers ใน Caddy · เอกสารครบ

---

## 🎯 เส้นทางสั้นสู่ "พร้อมใส่ข้อมูลจริง"

1. Backup off-site + ทดสอบ restore (P0 #2)
2. ตัดสินใจ frontend hosting: คงบน droplet หรือย้าย Cloudflare Pages → แล้วค่อย deploy edge functions (P0 #1)
3. วาง PDPA consent/retention เบื้องต้น (P1)
4. ตั้ง monitoring/alert (P1)
→ จากนั้นเริ่มใส่ candidate จริงได้อย่างปลอดภัย
