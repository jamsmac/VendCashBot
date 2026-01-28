#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_FILE="${BACKUP_DIR}/vendcash_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "$(date): Starting backup..."

PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "${DB_HOST:-postgres}" \
  -U "${DB_USERNAME:-vendcash}" \
  -d "${DB_NAME:-vendcash}" \
  --no-owner \
  --no-acl \
  | gzip > "$BACKUP_FILE"

echo "$(date): Backup created: $BACKUP_FILE"

# Cleanup: keep last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete 2>/dev/null || true

echo "$(date): Cleanup completed"

# List current backups
echo "$(date): Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
