#!/usr/bin/env bash
# =====================================================================
# deploy.sh — pull + build + publish (รันบน Droplet)
# ใช้: sudo bash /opt/recruitment/deploy/deploy.sh
# =====================================================================
set -euo pipefail

APP_DIR="/opt/recruitment"
WEB_DIR="/var/www/recruitment"

echo "==> [1/3] git pull"
cd "$APP_DIR"
git pull

# dist/ is prebuilt and committed to git (built on a dev machine with enough RAM).
# We do NOT run `npm run build` here: vite build OOMs on the 1GB droplet, which
# left production stuck on an old version. Pull the committed dist instead.
echo "==> [2/3] publish prebuilt dist -> $WEB_DIR/dist"
mkdir -p "$WEB_DIR"
rm -rf "$WEB_DIR/dist"
cp -r dist "$WEB_DIR/dist"
# also publish the clickable prototype for the team to try (sandbox, no login)
cp preview.html "$WEB_DIR/dist/preview.html"

echo "==> [3/3] reload nginx"
nginx -t && systemctl reload nginx

echo "✅ Deployed: https://recruitment.jchr-global.com"
