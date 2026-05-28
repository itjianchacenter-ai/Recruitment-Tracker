# 🚀 QUICKSTART — Deploy ใน 30 นาที

> เป้า: HR (non-dev) ทำตามนี้แล้วได้ URL สำหรับทีมใช้งานวันถัดไป

## ✅ Checklist (ก่อนเริ่ม)

- [ ] บัญชี **GitHub** (สมัครฟรีที่ github.com — มีบัญชีอยู่แล้วก็ใช้ได้)
- [ ] บัญชี **Supabase** (สมัครฟรีที่ supabase.com — ใช้ Google/GitHub login ได้)
- [ ] บัญชี **Vercel** (สมัครฟรีที่ vercel.com — แนะนำให้ login ด้วย GitHub เพื่อความง่าย)
- [ ] ติดตั้ง **GitHub Desktop** (เครื่องมือ push code แบบกราฟิก ไม่ต้อง command line) — desktop.github.com

> 💡 ถ้าไม่อยากใช้ GitHub Desktop ใช้คำสั่ง `git` ใน Terminal ก็ได้

---

## ⏱ 30 นาที · 4 ขั้นตอน

### ขั้นที่ 1 · Supabase Project (~10 นาที)

1. ไปที่ https://supabase.com → **Sign in** → **New project**
2. ตั้งค่า:
   - **Name**: `recruitment-tracker`
   - **Database Password**: ตั้งรหัสซับซ้อน (บันทึกไว้ที่ปลอดภัย — ไม่ต้องใช้บ่อย)
   - **Region**: `Southeast Asia (Singapore)`
   - **Plan**: Free
3. กด **Create new project** → รอ ~2 นาที จนเขียว
4. เมนูซ้าย → **SQL Editor** → **New query**
5. เปิดไฟล์ `supabase/schema.sql` ในเครื่อง (เปิดด้วย Notepad ก็ได้) → **copy ทั้งไฟล์** → paste ลงใน Supabase SQL Editor → กด **Run** (มุมขวาล่าง)
6. ถ้าขึ้น `Success. No rows returned` = สำเร็จ
7. ไปที่ **Project Settings → API** → จด 2 ค่านี้:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (ยาวมาก — copy ทั้งหมด)

### ขั้นที่ 2 · Push Code ขึ้น GitHub (~5 นาที)

1. เปิด GitHub Desktop → **File → Add Local Repository**
2. เลือก folder `C:\Users\HR-JIANCHA\Downloads\recruitment-tracker`
3. ถ้าขึ้นข้อความว่า "not a Git repository" → กด **Create a repository** → **Create repository**
4. ที่ commit area: ใส่ **Summary**: `Initial commit · v1.2` → กด **Commit to main**
5. กด **Publish repository** (มุมขวาบน) → ตั้ง:
   - **Name**: `recruitment-tracker`
   - **Keep this code private** ✅ (สำคัญ — เพราะเป็นข้อมูล HR)
6. กด **Publish Repository** → รอ ~30 วินาที

### ขั้นที่ 3 · Vercel Deploy (~10 นาที)

1. ไปที่ https://vercel.com → **Add New → Project**
2. ถ้ายังไม่เคยเชื่อม GitHub → กด **Continue with GitHub** → อนุญาตให้ Vercel เข้า GitHub
3. หา repository `recruitment-tracker` → กด **Import**
4. ที่หน้า "Configure Project":
   - **Framework Preset**: Vite (จะ detect อัตโนมัติ)
   - กดขยาย **Environment Variables** → ใส่ 2 ตัว:
     - Name: `VITE_SUPABASE_URL` → Value: (paste Project URL จาก Supabase)
     - Name: `VITE_SUPABASE_ANON_KEY` → Value: (paste anon key จาก Supabase)
5. กด **Deploy** → รอ ~1–2 นาที
6. ได้ URL เช่น `https://recruitment-tracker-xyz.vercel.app` → กดเปิดดู

### ขั้นที่ 4 · ทดสอบ + แชร์ทีม (~5 นาที)

1. เปิด URL ที่ได้จาก Vercel
2. มุมขวาบน → คลิกชื่อ "HR" → เปลี่ยนเป็นชื่อจริงของตัวเอง
3. กด **+ เพิ่ม Candidate** → กรอก:
   - ชื่อ: (ทดสอบ) สมศรี ใจดี
   - ตำแหน่ง: Test Position
   - แผนก: Operations
   - ประเภท: ทดแทนคนลาออก
   - วันเริ่ม Process: วันนี้
4. กด **บันทึก** → ดูว่าการ์ดขึ้น
5. กลับมาที่ Supabase → **Table Editor → candidates** → ดูว่ามี row ที่เพิ่งใส่
6. ✅ ระบบใช้งานได้

**แชร์ URL ให้ทีม HR ทุกคน** — เปิดพร้อมกันได้ ข้อมูล sync real-time

---

## 🎨 หลังจาก deploy แล้ว

- ทุกคนใน HR เข้าผ่าน URL เดียวกัน (ไม่ต้อง login ใน MVP เวอร์ชันนี้)
- แต่ละคนตั้งชื่อตัวเองที่มุมขวาบน → ระบบบันทึก audit log แยกตามคน
- ดู audit log ใน Supabase → **Table Editor → candidate_audit**

## ⚠️ ก่อนใช้งานจริง — สิ่งที่ควรรู้

| เรื่อง | คำอธิบาย |
|---|---|
| **URL = key เดียว** | ใครได้ URL ก็เข้าได้ — แชร์เฉพาะใน HR group เท่านั้น |
| **ไม่มี Login** (MVP) | Phase 1A จะเพิ่ม login — ระหว่างนี้ URL = ความปลอดภัย |
| **ไม่ลบ row จาก Supabase** | ลบใน app ได้ · แต่อย่าลบ row โดยตรงใน Supabase Table Editor (เสีย audit log) |
| **Backup** | Supabase Free มี auto-backup 7 วัน |

---

## 🐛 ถ้าเจอปัญหา

### Error: "โหลดข้อมูลไม่สำเร็จ"
- ตรวจ Vercel → Project Settings → Environment Variables ว่ามี 2 ตัว และค่าถูก
- กด **Redeploy** อีกครั้ง

### Error: "new row violates row-level security"
- กลับ Supabase → SQL Editor → รัน `schema.sql` ใหม่ทั้งไฟล์
- เช็คว่า section ที่ 6 (RLS policies) ผ่าน

### เห็นข้อมูลคนละชุดกับเพื่อนในทีม
- ทุกคนต้องเปิด URL **เดียวกัน** (Vercel domain เดิม) ที่เชื่อม Supabase project เดียวกัน

### หาไฟล์ schema.sql ไม่เจอ
- อยู่ที่ `C:\Users\HR-JIANCHA\Downloads\recruitment-tracker\supabase\schema.sql`

---

## 📞 ต่อจากนี้

- **ใช้งานกับ candidate จริง** ได้ทันที — Step 1 ถึง 10 ทั้งหมดใช้ได้แล้ว
- **Phase 1A** (Login + Upload + Self-service link): บอก Claude Code "build Phase 1A"
- **Phase 1B** (Sequential E-Sign): บอก Claude Code "build Phase 1B"

ทุกคำสั่งให้ Claude Code อยู่ใน `PROJECT_BRIEF_v1.2.md`
