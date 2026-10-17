#!/usr/bin/env bash
# Nightly backup of the database and voice notes. Run from cron, e.g.:
#   0 2 * * * /opt/field-visit-tracker/deploy/backup.sh
# Restore a database backup with:  gunzip -c FILE.sql.gz | psql "$DATABASE_URL"
set -euo pipefail
APP=/opt/field-visit-tracker
OUT=/var/backups/fvt
mkdir -p "$OUT"
source <(grep '^DATABASE_URL=' "$APP/api/.env")
STAMP=$(date +%F)
pg_dump "${DATABASE_URL%%\?*}" | gzip > "$OUT/db-$STAMP.sql.gz"
tar -czf "$OUT/uploads-$STAMP.tar.gz" -C "$APP/api" uploads 2>/dev/null || true
# keep 30 days
find "$OUT" -type f -mtime +30 -delete
