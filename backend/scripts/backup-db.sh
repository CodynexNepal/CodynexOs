#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
OUT_FILE="$BACKUP_DIR/codynex_os_$(date +%F_%H%M%S).dump"

pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f "$OUT_FILE"
echo "Backup created: $OUT_FILE"
