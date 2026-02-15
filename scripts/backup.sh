#!/bin/bash
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups}"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "$(date): Starting backup..."

if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
  # Encrypted backup: pg_dump | gzip | gpg symmetric encryption
  BACKUP_FILE="${BACKUP_DIR}/vendcash_${TIMESTAMP}.sql.gz.gpg"
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "${DB_HOST:-postgres}" \
    -U "${DB_USERNAME:-vendcash}" \
    -d "${DB_NAME:-vendcash}" \
    --no-owner \
    --no-acl \
    | gzip \
    | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_ENCRYPTION_KEY" -o "$BACKUP_FILE"
  echo "$(date): Encrypted backup created: $BACKUP_FILE"
else
  # Unencrypted backup (backward compatible)
  BACKUP_FILE="${BACKUP_DIR}/vendcash_${TIMESTAMP}.sql.gz"
  PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "${DB_HOST:-postgres}" \
    -U "${DB_USERNAME:-vendcash}" \
    -d "${DB_NAME:-vendcash}" \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"
  echo "$(date): WARNING: Backup created WITHOUT encryption. Set BACKUP_ENCRYPTION_KEY to enable."
  echo "$(date): Backup created: $BACKUP_FILE"
fi

# Cleanup: keep last 30 days (both encrypted and unencrypted)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.sql.gz.gpg" -mtime +30 -delete 2>/dev/null || true

echo "$(date): Cleanup completed"

# List current backups
echo "$(date): Current backups:"
ls -lh "$BACKUP_DIR"/vendcash_*.* 2>/dev/null || echo "No backups found"
