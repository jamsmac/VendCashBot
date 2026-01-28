#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/backups}"

# If no argument provided, use latest backup
if [ -z "$1" ]; then
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
  if [ -z "$BACKUP_FILE" ]; then
    echo "Error: No backup files found in $BACKUP_DIR"
    exit 1
  fi
  echo "No backup file specified, using latest: $BACKUP_FILE"
else
  BACKUP_FILE="$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "$(date): Starting restore from: $BACKUP_FILE"
echo "WARNING: This will overwrite the current database!"
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5

# Restore the database
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASSWORD" psql \
  -h "${DB_HOST:-postgres}" \
  -U "${DB_USERNAME:-vendcash}" \
  -d "${DB_NAME:-vendcash}" \
  --quiet

echo "$(date): Restore completed successfully"
