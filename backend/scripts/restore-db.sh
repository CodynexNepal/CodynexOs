#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ] || [ -z "${TARGET_DATABASE_URL:-}" ]; then
  echo "Usage: TARGET_DATABASE_URL=postgresql://... $0 <backup.dump>" >&2
  exit 1
fi

BACKUP_FILE="$1"
pg_restore --clean --if-exists --no-owner --dbname="$TARGET_DATABASE_URL" "$BACKUP_FILE"
echo "Database restored from $BACKUP_FILE"
