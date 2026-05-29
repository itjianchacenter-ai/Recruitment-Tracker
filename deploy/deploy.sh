#!/usr/bin/env bash
# =====================================================================
# deploy.sh — pull + build + publish (รันบน Droplet)
# ใช้: sudo bash /opt/recruitment/deploy/deploy.sh
# =====================================================================
set -euo pipefail

APP_DIR="/opt/recruitment"
WEB_DIR="/var/www/recruitment"

echo "==> [1/3] sync to origin/main (hard)"
cd "$APP_DIR"
# Force the working tree to match origin/main. We use fetch + reset --hard
# (not `git pull`) because the committed dist/ gets locally modified on the
# droplet between deploys, which makes `git pull` abort with "local changes
# would be overwritten". reset --hard discards those build-artifact changes;
# it does NOT touch untracked/gitignored files like .env.
git fetch origin
git reset --hard origin/main

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
# nginx lives in /usr/sbin which isn't on the PATH under `sudo bash`.
NGINX_BIN="$(command -v nginx || echo /usr/sbin/nginx)"
"$NGINX_BIN" -t && systemctl reload nginx

echo "✅ Deployed: https://recruitment.jchr-global.com"
