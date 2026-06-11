#!/usr/bin/env bash
# =====================================================================
# backup-db.sh — nightly logical backup of the self-hosted Supabase
# Postgres (all schemas: auth / storage / public). Keeps 14 days.
#
# INSTALL ON THE DROPLET (canonical runtime copy lives OUTSIDE the git tree
# so `deploy.sh` / `git reset --hard` can't delete it):
#   sudo install -m 750 deploy/backup-db.sh /usr/local/sbin/recruitment-backup.sh
#   sudo tee /etc/cron.d/recruitment-backup >/dev/null <<'CRON'
#   30 2 * * * root /usr/local/sbin/recruitment-backup.sh >> /var/log/recruitment-backup.log 2>&1
#   CRON
#
# TODO (off-site): copy each dump to DO Spaces / S3 so a droplet loss doesn't
# take the only backup with it (needs cloud credentials). Local-only protects
# against DB corruption / accidental delete, NOT against losing the droplet.
# =====================================================================
set -euo pipefail
DEST=/var/backups/recruitment
mkdir -p "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/recruitment-db-$STAMP.sql.gz"
docker exec supabase-db pg_dump -U postgres -d postgres --clean --if-exists | gzip -9 > "$FILE"
gzip -t "$FILE"                                   # integrity check
find "$DEST" -name 'recruitment-db-*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup OK $FILE $(du -h "$FILE" | cut -f1)"
