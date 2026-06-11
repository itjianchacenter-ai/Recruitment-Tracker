# Production Readiness Assessment — Recruitment 120 Days (v2)

> อัปเดตแทนที่ `PRODUCTION_READINESS_ASSESSMENT.md` (ฉบับ 2026-05-28 · ล้าสมัยแล้ว)
> **วันที่:** 2026-06-11 · **ผู้ประเมิน:** Claude (Claude Code) · **ฐานที่ตรวจ:** โค้ด `main` ที่ deploy จริง + ตรวจ **production สด** (DB policies, edge functions, backups, live REST API) ที่ `recruitment.jchr-global.com`

---

## 🚦 คำตัดสิน: **พร้อมใช้งานจริง (internal HR)** — เหลือ email (M365) + งานก่อน go-live

### ความพร้อม ≈ **85%** (internal use) · ~78% (full compliance/IPO-grade)

| มิติ | น้ำหนัก | % | สรุป |
|---|---|---|---|
| ฟังก์ชันหลัก (ใช้งานได้) | 30% | 96% | ทุกฟีเจอร์ทำงาน (รวม user mgmt + e-sign) · เหลือ email-send |
| Security / Auth | 22% | 90% | RLS authenticated · authz hardened · audit immutable · ErrorBoundary |
| Data / Audit integrity | 10% | 92% | append-only (RLS+REVOKE) · backup **restore พิสูจน์แล้ว** |
| Reliability / Ops | 18% | 75% | backup nightly+reboot-safe · เหลือ off-site + monitoring |
| Email (M365) | 6% | 60% | deploy+authz แล้ว · รอ secrets |
| Testing / CI | 6% | 15% | ยังไม่มี |
| PDPA / Compliance | 8% | 50% | ไม่มี consent/retention · แต่ 0 ข้อมูลจริง |

**รวมถ่วงน้ำหนัก ≈ 85%** · แกนหลักปลอดภัย ยืนยันบน production สด · ช่องว่างที่เหลือ = email secrets, off-site backup, PDPA, tests

> ⚠️ สถานะข้อมูล ณ วันประเมิน: `candidates = 0 แถวจริง` (audit 21–47 แถวจากการทดสอบ) → **ยังเป็นช่วงก่อน go-live จริง** เป็นจังหวะที่ดีที่สุดในการปิดช่องโหว่ก่อนข้อมูล PII เข้า

### Scorecard

| ด้าน | เดิม (5-28) | ตอนนี้ (6-11) | หลักฐาน (ตรวจจากของจริง) |
|---|---|---|---|
| Auth / RLS | 🔴 2 | 🟢 8 | anon เรียก REST → `[]` (อ่านไม่ได้) · `pg_policies` ทุกตัวเป็น `{authenticated}` |
| Audit trail | 🟠 | 🟢 8 | `candidate_audit` ไม่มี FK cascade · trigger `security definer` · ไม่มี policy update/delete = append-only |
| **Edge Functions** | — | 🟢 7\* | \*deploy แล้ว (admin-users/client-ip ทำงานเต็ม · send-email รอ M365 secrets) |
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
7. **Deploy Edge Functions บน self-host** — เพิ่ม `supabase-edge-functions` (cap 200m · หยุด `meta` ที่ไม่ได้ใช้เพื่อคืน RAM) · `admin-users` + `client-ip` ทำงานเต็ม (ทดสอบ end-to-end: hr01 list users → 200) · `send-email` deploy + authz แล้ว เหลือใส่ M365 secrets · `deploy.sh` sync functions อัตโนมัติแล้ว
8. **Audit immutable ระดับ privilege** — `revoke update, delete on candidate_audit` (เพิ่มใน schema.sql + auth-rls.sql) → ลบ/แก้ประวัติไม่ได้แม้ RLS ถูกปิด
9. **พิสูจน์ backup restore ได้จริง** — restore dump ล่าสุดเข้า scratch DB · candidates/audit/auth.users กลับมาครบ (login รอด restore)
10. **ยืนยัน reboot-safe** — ทุก container เป็น `restart=unless-stopped` · prod กลับมาเองหลัง reboot · `meta` คงหยุด (RAM ไม่ตึงกลับ)

---

## 🔴 P0 — ต้องทำก่อนใส่ข้อมูลจริง (ที่ยังเหลือ)

### 1. ✅ Edge Functions — deploy แล้ว · เหลือ M365 secrets สำหรับอีเมล
- **ทำแล้ว:** `supabase-edge-functions` รันบน self-host เดิม (ยึดโครงสร้าง) · `admin-users` (จัดการ user) + `client-ip` (e-sign IP) **ทำงานเต็ม ทดสอบแล้ว** · RAM นิ่ง (edge-runtime ใช้ ~81/200 MB)
- **เหลือ:** `send-email` deploy + ปิด open-relay แล้ว แต่ต้องใส่ **M365 secrets** ในไฟล์ env ของ functions ถึงจะส่งอีเมลจริงได้:
  - เพิ่มใน `/opt/supabase-selfhost/docker/docker-compose.override.yml` (service `functions` → `environment:` `M365_TENANT_ID/CLIENT_ID/CLIENT_SECRET/SENDER_ADDRESS`) แล้ว `docker compose up -d functions`
  - ตั้ง M365 app registration (Mail.Send application permission + admin consent + Application Access Policy จำกัด `Hr.jc@jianchatea.com`) — ดู `EMAIL_SETUP_M365.md`

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
