#!/usr/bin/env bash
# Generate production secrets + write .env for the self-hosted Supabase stack.
# Uses the LEGACY HS256 key model (JWT_SECRET + ANON_KEY + SERVICE_ROLE_KEY),
# which Kong accepts (kong.yml maps anon -> $SUPABASE_ANON_KEY).
# Run from the supabase docker dir:  bash setup-env.sh
set -euo pipefail
cd /opt/supabase-selfhost/docker

cp -n .env.example .env
APP_URL="https://recruitment.jchr-global.com"

rnd(){ openssl rand -hex "$1"; }
JWT_SECRET=$(openssl rand -hex 40)
PG_PASS=$(rnd 24)
SECRET_KEY_BASE=$(rnd 32)
VAULT_ENC_KEY=$(rnd 16)
PG_META_CRYPTO=$(rnd 16)
DASH_PASS=$(rnd 16)
PUBLISHABLE="sb_publishable_$(rnd 16)"
SECRETKEY="sb_secret_$(rnd 24)"
LOGFLARE_PUB=$(rnd 16)
LOGFLARE_PRIV=$(rnd 16)

# --- generate HS256 JWTs signed with JWT_SECRET (no external deps, uses node) ---
cat > /tmp/genjwt.js <<'JS'
const crypto=require('crypto');
const secret=process.argv[2], role=process.argv[3];
const b=(o)=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const iat=Math.floor(Date.now()/1000), exp=iat+10*365*24*3600;
const h=b({alg:'HS256',typ:'JWT'}), p=b({role,iss:'supabase',iat,exp});
const s=crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
console.log(h+'.'+p+'.'+s);
JS
ANON_KEY=$(node /tmp/genjwt.js "$JWT_SECRET" anon)
SERVICE_KEY=$(node /tmp/genjwt.js "$JWT_SECRET" service_role)
rm -f /tmp/genjwt.js

# replace a key in .env (| delimiter; our values contain no | & \)
setenv(){ local k="$1"; shift; local v="$*"; sed -i "s|^${k}=.*|${k}=${v}|" .env; }

setenv POSTGRES_PASSWORD "$PG_PASS"
setenv JWT_SECRET "$JWT_SECRET"
setenv ANON_KEY "$ANON_KEY"
setenv SERVICE_ROLE_KEY "$SERVICE_KEY"
setenv SUPABASE_PUBLISHABLE_KEY "$PUBLISHABLE"
setenv SUPABASE_SECRET_KEY "$SECRETKEY"
setenv JWT_KEYS ""
setenv JWT_JWKS ""
setenv SECRET_KEY_BASE "$SECRET_KEY_BASE"
setenv VAULT_ENC_KEY "$VAULT_ENC_KEY"
setenv PG_META_CRYPTO_KEY "$PG_META_CRYPTO"
setenv DASHBOARD_PASSWORD "$DASH_PASS"
setenv LOGFLARE_PUBLIC_ACCESS_TOKEN "$LOGFLARE_PUB"
setenv LOGFLARE_PRIVATE_ACCESS_TOKEN "$LOGFLARE_PRIV"
setenv SITE_URL "$APP_URL"
setenv API_EXTERNAL_URL "$APP_URL"
setenv SUPABASE_PUBLIC_URL "$APP_URL"
setenv ADDITIONAL_REDIRECT_URLS "$APP_URL"
# DISABLE_SIGNUP=true blocks public self-registration. ENABLE_EMAIL_SIGNUP
# must stay TRUE — setting it false disables the email provider entirely,
# which also breaks password LOGIN ("email_provider_disabled"). Admin-created
# users still cannot be joined by the public because DISABLE_SIGNUP=true.
setenv DISABLE_SIGNUP "true"
setenv ENABLE_EMAIL_SIGNUP "true"
setenv ENABLE_EMAIL_AUTOCONFIRM "true"
setenv ENABLE_ANONYMOUS_USERS "false"
setenv COMPOSE_FILE "docker-compose.yml:docker-compose.override.yml"

echo "=====SECRETS (save these somewhere safe)====="
echo "ANON_KEY=$ANON_KEY"
echo "JWT_SECRET=$JWT_SECRET"
echo "POSTGRES_PASSWORD=$PG_PASS"
echo "(SERVICE_ROLE_KEY + others written to .env)"
echo "=====VALIDATE COMPOSE====="
docker compose config --quiet && echo "COMPOSE_OK" || echo "COMPOSE_PARSE_FAILED"
