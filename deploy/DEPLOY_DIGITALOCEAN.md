# Deploy Runbook — recruitment.jchr-global.com (DigitalOcean)

> คู่มือทีละขั้นสำหรับไอที นำระบบขึ้น production บน **DigitalOcean Droplet** ที่ subdomain **`recruitment.jchr-global.com`**
> รันคำสั่งทั้งหมดนี้ **บน Droplet (Ubuntu)** ผ่าน SSH · ใช้เวลา ~30–60 นาที
> **เวอร์ชัน:** 1.0 · **วันที่:** 2026-05-28

---

## ⚠️ อ่านก่อน (2 เรื่อง)

**Infra:** DNS = **Cloudflare** (jchr-global.com) · Hosting = **DigitalOcean Droplet**

1. **เรื่อง IP:** A record ที่ Cloudflare ต้องชี้ไปที่ IP ของ **Droplet ที่จะรันแอป** — ถ้า `168.144.97.11` ไม่ใช่ Droplet ให้ใช้ IP ของ Droplet แทน (เช็คที่ DigitalOcean Console → Droplets → ipv4)
2. **เรื่องความปลอดภัย (ต้องรู้):** โค้ดตอนนี้ยัง **ไม่มี login + ฐานข้อมูลเปิดสาธารณะ** (ดู `PRODUCTION_READINESS_ASSESSMENT.md`) ถ้าเปิด public ทันที = ข้อมูลพนักงาน/เงินเดือนเข้าถึงได้โดยไม่ login
   - **ทางลัดที่ดีสุด:** เปิด **Cloudflare Access** (Zero Trust) ครอบ subdomain → บังคับ login ด้วยอีเมลบริษัทที่ขอบ Cloudflare ทันที ไม่ต้องเขียนโค้ด (ดูขั้นที่ 7)
   - ระยะยาว: ทำ login + RLS ในแอปให้เสร็จ

---

## สถาปัตยกรรม — เลือก 1 แบบ

| | **Option A (แนะนำ — ง่าย/เสถียร)** | **Option B (ทุกอย่างบน DigitalOcean)** |
|---|---|---|
| Frontend | Droplet (nginx เสิร์ฟ static) | Droplet (nginx เสิร์ฟ static) |
| Database/Backend | **Supabase Cloud** (ฟรี/จัดการให้, backup อัตโนมัติ) | **Self-host Supabase (Docker)** บน Droplet |
| งาน ops | น้อย | สูง (backup/อัปเกรด/monitor เองหมด) |
| เหมาะกับ | ทีมเล็ก ไม่อยากดูแล server มาก | ต้องการข้อมูลอยู่บน infra ตัวเองล้วน ๆ |

> เอกสารนี้ลงรายละเอียดเต็มของ **Option A** (ทำให้ขึ้นได้จริงเร็ว) · ส่วน **Option B** อยู่ท้ายเอกสาร (ขั้นตอนหลัก + ลิงก์ official)

---

# OPTION A — Frontend บน Droplet + Supabase Cloud

## ขั้นที่ 1 — DNS (ที่ **Cloudflare**)
Cloudflare Dashboard → เลือกโดเมน `jchr-global.com` → **DNS → Add record**:
```
Type: A   Name: recruitment   IPv4 address: <IP ของ Droplet>   Proxy: Proxied (เมฆส้ม 🟠)   TTL: Auto
```
- **Proxied (เมฆส้ม)** = แนะนำ → ได้ WAF / DDoS protection / CDN / ซ่อน IP จริงของ Droplet
- เช็ค: `nslookup recruitment.jchr-global.com` (ถ้า Proxied จะได้ IP ของ Cloudflare ไม่ใช่ Droplet — เป็นเรื่องปกติ)
> ถ้าจะออก cert ด้วย Let's Encrypt ให้ตั้ง proxy เป็นเมฆเทาชั่วคราว **หรือ** ใช้ Cloudflare Origin Certificate (แนะนำ — ดูขั้นที่ 6)

## ขั้นที่ 2 — Backend (Supabase Cloud)
1. สร้างโปรเจกต์ที่ https://supabase.com (เลือก region **Singapore** ใกล้ไทยสุด)
2. SQL Editor → วางทั้งไฟล์ `supabase/schema.sql` → **Run**
3. Storage → New bucket ชื่อ **`recruitment`** (ตั้งเป็น **Private**)
4. Project Settings → API → คัดลอก **Project URL** และ **anon public key** (ใช้ขั้นที่ 4)
5. (อีเมล) ติดตั้ง Supabase CLI แล้ว deploy Edge Function:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase functions deploy send-email
   supabase secrets set M365_TENANT_ID=xxx M365_CLIENT_ID=xxx M365_CLIENT_SECRET=xxx M365_SENDER_ADDRESS=Hr.jc@jianchatea.com
   ```
   (ตั้ง M365 app registration ก่อน — ดู `DEPLOYMENT_GUIDE_FOR_IT.md` หัวข้อ 7)

## ขั้นที่ 3 — เตรียม Droplet (Ubuntu 22.04/24.04)
SSH เข้า Droplet แล้วรัน:
```bash
sudo apt update && sudo apt upgrade -y
# Node.js 20 (สำหรับ build)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git
node -v   # ควรขึ้น v20.x
# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

## ขั้นที่ 4 — ดึงโค้ด + build
```bash
sudo git clone https://github.com/itjianchacenter-ai/Recruitment-Tracker.git /opt/recruitment
cd /opt/recruitment

# สร้างไฟล์ env สำหรับ build (ใส่ค่าจากขั้นที่ 2)
sudo tee .env.production > /dev/null <<'EOF'
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
VITE_APP_BASE_URL=https://recruitment.jchr-global.com
VITE_DEFAULT_ACTOR=HR
EOF

npm install
npm run build        # ได้โฟลเดอร์ dist/

# ย้าย build ไปที่ nginx เสิร์ฟ
sudo mkdir -p /var/www/recruitment
sudo rm -rf /var/www/recruitment/dist
sudo cp -r dist /var/www/recruitment/dist
```

## ขั้นที่ 5 — Web server

### 🅰️ ถ้าเซิร์ฟเวอร์รัน **Caddy** อยู่แล้ว (แนะนำ — ตรวจพบว่าเครื่องนี้ใช้ Caddy)
Caddy ออก HTTPS ให้อัตโนมัติ — ไม่ต้องใช้ certbot (ข้ามขั้นที่ 6 ได้):
```bash
# เพิ่ม (ไม่ทับ) site block เข้า Caddyfile เดิม
sudo bash -c 'cat /opt/recruitment/deploy/Caddyfile-recruitment >> /etc/caddy/Caddyfile'
sudo caddy validate --config /etc/caddy/Caddyfile   # ตรวจ syntax
sudo systemctl reload caddy
```
> เปิด `https://recruitment.jchr-global.com` ได้เลย (Caddy จะขอ cert เองครั้งแรก รอ ~10–30 วิ) — **ข้ามขั้นที่ 6**

### 🅱️ ถ้าใช้ **nginx**
```bash
# คัดลอก config (อยู่ในโฟลเดอร์ deploy/ ของ repo)
sudo cp /opt/recruitment/deploy/nginx-recruitment.conf /etc/nginx/sites-available/recruitment.jchr-global.com
sudo ln -s /etc/nginx/sites-available/recruitment.jchr-global.com /etc/nginx/sites-enabled/
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
```

## ขั้นที่ 6 — TLS / HTTPS (ผ่าน **Cloudflare**)
**แนะนำ: Cloudflare Origin Certificate** (ไม่ต้องต่ออายุ อายุ 15 ปี · ง่ายสุดเมื่อใช้ Cloudflare)
1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** → คัดลอก *Origin Certificate* + *Private Key*
2. บน Droplet:
   ```bash
   sudo mkdir -p /etc/ssl/cloudflare
   sudo nano /etc/ssl/cloudflare/recruitment.pem   # วาง Origin Certificate
   sudo nano /etc/ssl/cloudflare/recruitment.key   # วาง Private Key
   ```
3. ในไฟล์ `nginx-recruitment.conf` ใส่ path cert (ในบล็อก 443):
   ```
   ssl_certificate     /etc/ssl/cloudflare/recruitment.pem;
   ssl_certificate_key /etc/ssl/cloudflare/recruitment.key;
   ```
   แล้ว `sudo nginx -t && sudo systemctl reload nginx`
4. Cloudflare → **SSL/TLS → Overview** → ตั้งโหมด **Full (strict)**
5. Cloudflare → **SSL/TLS → Edge Certificates** → เปิด **Always Use HTTPS** + **HSTS**

**ทางเลือก: Let's Encrypt** (ถ้าไม่ใช้ Origin Cert) → ตั้ง DNS proxy เป็นเมฆเทาก่อน แล้ว `sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d recruitment.jchr-global.com` เสร็จแล้วเปิด proxy กลับ + ตั้ง SSL mode **Full (strict)**

เปิด https://recruitment.jchr-global.com → ต้องเห็นระบบ + กุญแจล็อก 🔒

## ขั้นที่ 7 — Security (สำคัญก่อนใช้ข้อมูลจริง)
**🔑 แนะนำสุด — Cloudflare Access (ปิดช่อง "ไม่มี login" ได้ทันที ไม่ต้องเขียนโค้ด):**
Cloudflare → **Zero Trust → Access → Applications → Add application → Self-hosted**
- Application domain: `recruitment.jchr-global.com`
- Policy: **Allow** เฉพาะอีเมลโดเมนบริษัท (เช่น `@jchr-global.com`, `@jianchatea.com`) หรือรายชื่อ HR
→ ทุกคนต้อง login (Google/Microsoft/Email OTP) ที่หน้า Cloudflare ก่อนเข้าเว็บ = กันคนนอกได้ทันที เหมาะมากกับเครื่องมือ HR ภายใน (ฟรีถึง 50 ผู้ใช้)

**ทางเลือก/เสริม:**
- จำกัด IP ออฟฟิศ: ทำที่ **Cloudflare → Security → WAF → Tools → IP Access Rules** (ดีกว่าแก้ nginx เพราะ proxy บัง client IP จริง)
- (ระยะยาว) ทำ login + แก้ RLS ในแอป/Supabase ตาม `PRODUCTION_READINESS_ASSESSMENT.md`
- เปลี่ยน anon key เป็นของ production · เปิด backup ใน Supabase

> ⚠️ เมื่อเปิด Cloudflare proxy การ `allow/deny IP` ใน nginx จะเห็นเป็น IP ของ Cloudflare (ไม่ใช่ client จริง) → ใช้ Cloudflare Access / IP Access Rules แทน หรือ restore real IP ด้วย header `CF-Connecting-IP`

---

## 🔄 อัปเดตเวอร์ชันใหม่ (ทุกครั้งที่แก้โค้ด)
```bash
cd /opt/recruitment
sudo git pull
npm install
npm run build
sudo rm -rf /var/www/recruitment/dist && sudo cp -r dist /var/www/recruitment/dist
sudo systemctl reload nginx
```
> ทำเป็นสคริปต์ `deploy.sh` ได้เพื่อรันคำสั่งเดียวจบ

---

## ✅ Verify checklist
- [ ] `nslookup recruitment.jchr-global.com` → IP Droplet
- [ ] เปิดเว็บผ่าน https ได้ + มีกุญแจล็อก
- [ ] หน้า dashboard โหลด (ไม่ error แดงเรื่อง Supabase env)
- [ ] เพิ่ม/แก้ตำแหน่งแล้วข้อมูลอยู่หลัง refresh (ต่อ DB จริง)
- [ ] เปิด 2 เบราว์เซอร์ → แก้ที่เครื่องนึง อีกเครื่องอัปเดต (realtime)
- [ ] ทดสอบส่งอีเมล (ถ้าตั้ง M365 แล้ว)
- [ ] ทำ security ขั้นที่ 7 แล้ว

## 🛠 Troubleshooting
- **error แดง "โหลดข้อมูลไม่สำเร็จ"** → เช็ค `VITE_SUPABASE_URL`/`ANON_KEY` ใน `.env.production` แล้ว build ใหม่ (Vite ฝังค่าตอน build เท่านั้น)
- **502/หน้าเปล่า** → `sudo nginx -t`, ดู `/var/log/nginx/error.log`, เช็คว่า `dist/` อยู่ที่ `/var/www/recruitment/dist`
- **cert ออกไม่ได้** → DNS ยังไม่ propagate / port 80 ถูกบล็อก (เช็ค ufw)
- **realtime ไม่ทำงาน** → ตรวจว่า schema เปิด realtime publication (มีใน schema.sql แล้ว)

---

# OPTION B — Self-host Supabase ทั้งหมดบน Droplet (advanced)

> ใช้เมื่อต้องการให้ฐานข้อมูลอยู่บน DigitalOcean ของคุณล้วน ๆ · ต้องการ Droplet **≥ 2 vCPU / 4 GB RAM**
> ทีมต้องดูแล backup/upgrade/monitor เอง

ขั้นตอนหลัก:
1. ติดตั้ง Docker + Docker Compose บน Droplet
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   ```
2. ดึง Supabase self-hosting stack + ตั้งค่า `.env` (รหัสผ่าน/JWT secret/keys) ตาม official:
   **https://supabase.com/docs/guides/self-hosting/docker**
3. `docker compose up -d` → ได้ Postgres + Auth + Storage + Realtime + Studio + Kong (API gateway)
4. รัน `supabase/schema.sql` ผ่าน Studio (พอร์ตที่ตั้งไว้) หรือ `psql`
5. ตั้ง nginx reverse proxy แยก subdomain: เช่น `recruitment.jchr-global.com` (frontend) + `api.recruitment.jchr-global.com` → Kong (พอร์ต 8000)
6. `VITE_SUPABASE_URL` ในขั้น build (Option A ขั้นที่ 4) ชี้ไป `https://api.recruitment.jchr-global.com`, `VITE_SUPABASE_ANON_KEY` = anon key ที่ generate จาก JWT secret
7. Edge Function ส่งอีเมล: รันด้วย `supabase functions serve` ใน container หรือทำเป็น service แยก (Deno) — หรือย้าย logic ส่งอีเมลไป backend เล็ก ๆ
8. TLS + firewall + backup (pg_dump cron) + monitoring — จัดการเองทั้งหมด

> เนื่องจาก self-host Supabase มีหลายส่วนและต้องตั้ง secret เยอะ แนะนำให้ทีมที่ถนัด DevOps ทำ และยึดตาม official docs ข้างต้นเป็นหลัก
