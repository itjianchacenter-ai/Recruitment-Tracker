# ตั้งค่าส่งอีเมลอัตโนมัติ (Microsoft 365) — สำหรับ IT

> เป้าหมาย: ให้ระบบ Recruitment ส่งอีเมลจากกล่องกลาง **`Hr.jc@jianchatea.com`** อัตโนมัติ
> ทำ **ครั้งเดียวจบ** · ต้องใช้สิทธิ์ **Microsoft 365 / Entra ID (Azure AD) admin**
>
> สถาปัตยกรรม: แอป (frontend) → เรียก **Supabase Edge Function `send-email`** → **Microsoft Graph API** → ส่งเมล
> (โค้ด Edge Function อยู่ใน repo แล้วที่ `supabase/functions/send-email/index.ts` — ไม่ต้องเขียนเพิ่ม)

---

## ✅ ส่วนนี้แยกจากการ redeploy เว็บ (Droplet)
- **UI ส่งอีเมลในแอป** = อยู่ในโค้ดแล้ว ไปกับ redeploy Droplet ปกติ
- **ส่วนนี้ (M365 + Edge Function)** = ตั้งแยก ทำครั้งเดียว → หลังจากนั้นปุ่ม "ส่งอีเมล" ในแอปจะส่งได้จริง

---

## ขั้นตอน

### 1) ยืนยันกล่องเมล
- ตรวจว่ามี mailbox **`Hr.jc@jianchatea.com`** จริงใน Microsoft 365 (shared mailbox ก็ได้ ไม่ต้องมี license สำหรับ shared)

### 2) ลงทะเบียนแอปใน Entra ID (Azure AD)
1. https://entra.microsoft.com → **Identity → Applications → App registrations → New registration**
2. ตั้งชื่อ เช่น `Recruitment-Mailer` → Register
3. จดค่า **Application (client) ID** และ **Directory (tenant) ID**

### 3) ให้สิทธิ์ส่งเมล (Application permission)
1. ในแอปนั้น → **API permissions → Add a permission → Microsoft Graph → Application permissions**
2. ค้นหา + เลือก **`Mail.Send`** → Add permissions
3. กด **Grant admin consent for [องค์กร]** → สถานะต้องเป็น ✅ Granted

### 4) สร้าง Client secret
1. **Certificates & secrets → New client secret** → ตั้งอายุ (เช่น 24 เดือน) → Add
2. **คัดลอกค่า Value ทันที** (เห็นครั้งเดียว) = `M365_CLIENT_SECRET`

### 5) (แนะนำ — ความปลอดภัย) จำกัดให้ส่งได้เฉพาะกล่องกลาง
สิทธิ์ `Mail.Send` แบบ application = ส่งแทนได้ทุกกล่องใน tenant. จำกัดด้วย **Application Access Policy** (รันใน Exchange Online PowerShell):
```powershell
New-ApplicationAccessPolicy -AppId <CLIENT_ID> -PolicyScopeGroupId Hr.jc@jianchatea.com `
  -AccessRight RestrictAccess -Description "Recruitment mailer: only Hr.jc mailbox"
```

### 6) Deploy Edge Function + ใส่ secret (Supabase)
ติดตั้ง Supabase CLI แล้ว:
```bash
supabase login
supabase link --project-ref rodhsldbyqumefujqaqr
supabase functions deploy send-email
supabase secrets set \
  M365_TENANT_ID=<tenant-id> \
  M365_CLIENT_ID=<client-id> \
  M365_CLIENT_SECRET=<client-secret> \
  M365_SENDER_ADDRESS=Hr.jc@jianchatea.com
```

### 7) ทดสอบ
- ในเว็บ recruitment.jchr-global.com → เปิดตำแหน่ง → หัวข้อ **อีเมล** → ส่งอีเมล → ใส่อีเมลตัวเองทดสอบ → ควรได้รับเมลจาก `Hr.jc@jianchatea.com`
- ดู log ของ Edge Function ใน Supabase → Functions → send-email หากมี error

---

## ค่าที่ต้องส่งให้คนตั้ง Supabase (ข้อ 6)
| ตัวแปร | ได้จาก |
|---|---|
| `M365_TENANT_ID` | Entra ID (ข้อ 2) — Directory (tenant) ID |
| `M365_CLIENT_ID` | Entra ID (ข้อ 2) — Application (client) ID |
| `M365_CLIENT_SECRET` | Entra ID (ข้อ 4) — Value ของ secret |
| `M365_SENDER_ADDRESS` | `Hr.jc@jianchatea.com` |

> 🔒 `M365_CLIENT_SECRET` เป็นความลับ — ใส่เฉพาะใน Supabase secrets (ฝั่ง server) เท่านั้น ห้ามใส่ในโค้ด frontend หรือส่งในแชต

---

## ทางเลือก (ถ้า M365 admin ตั้งยาก)
ใช้บริการ transactional email เช่น **Resend** แทน — ง่ายกว่า (สมัคร → verify โดเมน `jianchatea.com` → ได้ API key) แล้วแก้ Edge Function ให้เรียก Resend API. บอกมาได้ถ้าจะใช้ทางนี้ เดี๋ยวปรับ Edge Function ให้
