# JC Org Studio (ผังองค์กร) ในระบบเดียวกับ JC People Core

ผังองค์กร JC Org Studio (ชุด `JC-Org-Studio-Server-2026-10-19c`) อยู่ในเว็บเดียวกับ JC People Core
แต่แยกเป็นอีกระบบชัดเจน — ล็อกอินครั้งเดียว (flow เดิมของ People Core) แล้วเลือกระบบจากแถบเมนูซ้าย:

```
┌──────────────────────┬──────────────────────────────────┐
│ ระบบเดิม              │                                  │
│ 👥 JC People Core     │                                  │
│   Reports / KPI …     │        เนื้อหาของเมนูที่เลือก        │
│ ระบบใหม่              │                                  │
│ 🏛 JC Org Studio      │                                  │
│   Company Org…  (บอร์ดในผัง = เมนูย่อย)                    │
│ ผู้ใช้ · ออกจากระบบ    │                                  │
└──────────────────────┴──────────────────────────────────┘
```

ไม่ต้องตั้งเซิร์ฟเวอร์ Python / `server.py` แยกอีกต่อไป

## ทำงานอย่างไร

| เรื่อง | Org Studio เดิม (แยกเครื่อง) | ใน JC People Core |
|---|---|---|
| ตัวโปรแกรม | `index.html` ไฟล์เดียว | ไฟล์เดียวกัน อยู่ที่ `public/org-studio/index.html` เปิดในกรอบ (iframe) แบบ **sandbox** |
| การแยกระบบ | — | Org Studio มี origin ของตัวเอง อ่าน session / ฐานข้อมูล / ข้อมูล HR อื่นของ People Core **ไม่ได้** คุยกันได้แค่ “โหลดผัง / บันทึกผัง / ฝากเก็บค่าหน้าจอ” ผ่าน postMessage |
| ที่เก็บข้อมูล | ไฟล์ `org-data.json` บนดิสก์ | ตาราง `org_chart` ใน Supabase (ข้อความ JSON ชุดเดียวกันทุกตัวอักษร) |
| บันทึก | PUT ไปที่ `server.py` ทุก ~1.5 วินาที | เรียก function `org_chart_save` ทุก ~1.5 วินาที (ปุ่มขึ้น **Saved**) |
| กันหน้าต่างเก่าบันทึกทับ | `X-Jc-Tag` → 409 | `version` ต้องตรง → ขึ้น *The chart changed in JC People Core* ให้โหลดใหม่ |
| สำรองอัตโนมัติ | `backups/auto/` 40 ชุด | `org_chart_history` ไม่เกิน 1 ชุด/15 นาที เก็บ 20 ชุดล่าสุด |
| ใครแก้ได้ | ใครก็ได้ / passphrase / Microsoft sign-in | **admin Level 2** ของ People Core เท่านั้น (ตรวจทั้งหน้าเว็บและในฐานข้อมูล) |
| ใครดูได้ | ทุกคนที่เปิด URL ได้ | admin ที่ล็อกอินแล้ว (Level 1 ดูได้อย่างเดียว) · ผู้อนุมัติ (role `user`) ไม่เห็น |
| draft / ค่าหน้าจอ | localStorage ของ browser | ฝากเก็บใน localStorage ของ People Core (key `orgstudio:*`) · **ล้างทิ้งเมื่อกดออกจากระบบ** |

เปิด `/org-studio/index.html` ตรง ๆ (ไม่ผ่านเมนู) จะถูกส่งกลับหน้าแรกของ People Core เสมอ

## ติดตั้ง (ทำครั้งเดียว)

1. Supabase → **SQL Editor** → วางเนื้อหา `supabase/org_chart.sql` ทั้งไฟล์ → **Run**
   (รันซ้ำได้ ไม่ลบข้อมูล)
2. Deploy `dist/` ตามปกติ — ไฟล์ผังอยู่ที่ `dist/org-studio/index.html` แล้ว
3. ล็อกอินด้วย admin **Level 2** → แถบซ้าย **ระบบใหม่ → 🏛 JC Org Studio** → กด **Admin** มุมขวาบนของผัง
4. **Setting → Data → Import org-data.json** → เลือกไฟล์ `org-data.json` จากชุด
   `JC-Org-Studio-Server-2026-10-19c` → รอปุ่มขึ้น **Saved**
5. ตรวจว่าแถบบนขึ้น **125 ตำแหน่ง** และ *as of 19 October 2026* · ให้อีกคนเปิดดูยืนยัน

> ก่อนนำเข้า ผังจะแสดงโครงสร้างตัวอย่าง (มีแต่ชื่อตำแหน่ง ไม่มีชื่อคน)
> ถ้ากด Admin แล้วแก้ไขผังตัวอย่างก่อนนำเข้า ผังตัวอย่างจะถูกบันทึกเป็นฉบับแรก — นำเข้าไฟล์จริงทับได้ตามปกติ

## ⚠️ ข้อมูลส่วนบุคคล

- `org-data.json` มีชื่อ รหัส วันเริ่มงาน และรูปพนักงาน (PDPA) — **ห้าม commit ลง repo นี้**
  (repo เป็น public) · ข้อมูลจริงอยู่ใน Supabase เท่านั้น
- ตัวโปรแกรมใน `public/org-studio/index.html` ถูกลบชื่อคนออกจากผังตัวอย่างที่ฝังมาแล้ว
- ไฟล์ `org-data.json` ที่ HR จะส่งฉบับแก้มาภายหลัง (เรื่องพนักงานลาออก 1 คน) ให้นำเข้าแบบข้อ 4 ได้เลย

## ข้อจำกัดที่ควรรู้

- **ขนาดข้อมูล** ~3.2 MB ต่อการบันทึก 1 ครั้ง (รวมรูป) — ถ้า reverse proxy / Kong ตั้ง body limit
  ต่ำกว่านี้ การบันทึกจะล้มและขึ้นข้อความ *Could not save to JC People Core* (งานยังอยู่ใน browser)
- **ไฟล์ JD แบบ PDF ในโฟลเดอร์ `jd/`** ไม่ได้ย้ายมาด้วย (มีไฟล์ทดสอบไฟล์เดียว) — JD ที่พิมพ์ในผัง
  (Job Highlight / KPI) อยู่ใน `org-data.json` ครบ
- **Microsoft sign-in / passphrase** ใน Setting ของ Org Studio ไม่มีผลในนี้ — ใช้สิทธิ์ของ People Core แทน
- **อัปเดตตัวโปรแกรม Org Studio** เป็นเวอร์ชันใหม่: คัดลอก `index.html` ใหม่ทับ `public/org-studio/index.html`
  แล้วรัน `python3 scripts/patch-org-studio.py public/org-studio/index.html` → `npm run build`
  (สคริปต์หยุดทันทีถ้าโค้ดเวอร์ชันใหม่ไม่ตรงจุดที่ต้องแก้ · ส่วนที่แก้ทั้งหมดอยู่ใต้คำว่า `HOST`) — ไม่กระทบข้อมูลใน Supabase

## กู้คืนฉบับก่อนหน้า

ดูคำสั่งท้ายไฟล์ `supabase/org_chart.sql` (เลือกจาก `org_chart_history` แล้ว update กลับ)
