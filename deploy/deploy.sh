#!/usr/bin/env bash
# =====================================================================
# deploy.sh — pull + build + publish (รันบน Droplet)
# ใช้: sudo bash /opt/recruitment/deploy/deploy.sh
# =====================================================================
set -euo pipefail

APP_DIR="/opt/recruitment"
WEB_DIR="/var/www/recruitment"

echo "==> [1/4] git pull"
cd "$APP_DIR"
git pull

echo "==> [2/4] install + build"
npm install
npm run build

echo "==> [3/4] publish dist -> $WEB_DIR/dist"
mkdir -p "$WEB_DIR"
rm -rf "$WEB_DIR/dist"
cp -r dist "$WEB_DIR/dist"
# also publish the clickable prototype for the team to try (sandbox, no login)
cp preview.html "$WEB_DIR/dist/preview.html"

echo "==> [4/4] reload nginx"
nginx -t && systemctl reload nginx

echo "✅ Deployed: https://recruitment.jchr-global.com"
