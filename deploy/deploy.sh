#!/usr/bin/env bash
# =====================================================================
# deploy.sh — sync + publish prebuilt dist (รันบน Droplet · ใช้ Caddy)
# ใช้: sudo bash /opt/recruitment/deploy/deploy.sh
# =====================================================================
set -euo pipefail

APP_DIR="/opt/recruitment"
WEB_DIR="/var/www/recruitment"

echo "==> [1/3] sync to origin/main (hard)"
cd "$APP_DIR"
# Force working tree = origin/main. ใช้ fetch + reset --hard (ไม่ใช่ git pull)
# เพราะ dist/ ที่ commit ไว้อาจถูกแก้ในเครื่องระหว่าง deploy ทำให้ pull abort.
# reset --hard ทิ้ง build-artifact ที่เปลี่ยน · ไม่แตะ untracked/gitignored เช่น .env
git fetch origin
git reset --hard origin/main

# dist/ เป็น prebuilt ที่ build จากเครื่อง dev (RAM พอ) แล้ว commit เข้า git
# ไม่รัน `npm run build` ที่นี่ เพราะ vite build OOM บน droplet 1GB
echo "==> [2/3] publish prebuilt dist -> $WEB_DIR/dist"
mkdir -p "$WEB_DIR"
rm -rf "$WEB_DIR/dist"
cp -r dist "$WEB_DIR/dist"
# publish ต้นแบบกดได้ให้ทีมลอง (sandbox · ไม่ต้อง login)
cp preview.html "$WEB_DIR/dist/preview.html"

echo "==> [3/3] reload Caddy"
# เครื่องนี้ใช้ Caddy (ไม่ใช่ nginx). Caddyfile: /etc/caddy/Caddyfile
# caddy อาจไม่อยู่ใน PATH ใต้ `sudo bash` → resolve ก่อน
CADDY_BIN="$(command -v caddy || echo /usr/bin/caddy)"
"$CADDY_BIN" validate --config /etc/caddy/Caddyfile
systemctl reload caddy

echo "✅ Deployed: https://recruitment.jchr-global.com"
