#!/bin/bash
#==============================================================================
# PostgreSQL Database Backup Script
# Xarra Books Management System
#==============================================================================
# This script performs automated PostgreSQL backups with rotation and
# offsite storage to AWS S3
#
# Usage:
#   ./backup-database.sh
#
# Schedule with cron:
#   0 3 * * * /path/to/backup-database.sh >> /var/log/xarra-backup.log 2>&1
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_SHORT=$(date +%Y%m%d)
BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
DATABASE="${DATABASE_NAME:-xarra}"
DB_USER="${DB_USER:-xarra}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
S3_BUCKET="${S3_BUCKET:-xarra-backups}"
RETENTION_DAYS=${RETENTION_DAYS:-30}

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting database backup for: $DATABASE"

# Generate backup filename
BACKUP_FILE="$BACKUP_DIR/${DATABASE}_${TIMESTAMP}.backup"
BACKUP_FILE_COMPRESSED="$BACKUP_DIR/${DATABASE}_${TIMESTAMP}.backup.gz"

# Perform PostgreSQL dump (custom format for flexibility)
log "Creating database dump..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -F c \
    -b \
    -v \
    -f "$BACKUP_FILE" \
    "$DATABASE"

if [ $? -eq 0 ]; then
    log "Database dump completed successfully"
else
    log "ERROR: Database dump failed"
    exit 1
fi

# Compress the backup
log "Compressing backup..."
gzip "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    log "Compression completed"
else
    log "ERROR: Compression failed"
    exit 1
fi

# Get backup file size
BACKUP_SIZE=$(du -h "$BACKUP_FILE_COMPRESSED" | cut -f1)
log "Backup size: $BACKUP_SIZE"

# Upload to S3 if configured
if command -v aws &> /dev/null && [ -n "${S3_BUCKET:-}" ]; then
    log "Uploading backup to S3: s3://$S3_BUCKET/postgres/"
    aws s3api put-object \
        --bucket "$S3_BUCKET" \
        --key "postgres/${DATABASE}_${TIMESTAMP}.backup.gz" \
        --body "$BACKUP_FILE_COMPRESSED" \
        --storage-class STANDARD_IA \
        --server-side-encryption AES256 \
        --tagging "Type=DatabaseBackup&Database=${DATABASE}&Date=${DATE_SHORT}"
    
    if [ $? -eq 0 ]; then
        log "S3 upload completed successfully"
    else
        log "WARNING: S3 upload failed (backup retained locally)"
    fi
else
    log "Skipping S3 upload (AWS CLI not configured or S3_BUCKET not set)"
fi

# Rotate old backups (cleanup)
log "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "${DATABASE}_*.backup.gz" -mtime +$RETENTION_DAYS -type f -delete

if [ $? -eq 0 ]; then
    log "Old backups cleaned up"
fi

# Count remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DATABASE}_*.backup.gz" -type f | wc -l)
log "Total backups retained: $BACKUP_COUNT"

log "Backup completed successfully: $BACKUP_FILE_COMPRESSED"

# Optional: Send notification (uncomment if needed)
# if command -v mail &> /dev/null; then
#     echo "Database backup completed: $BACKUP_FILE_COMPRESSED (Size: $BACKUP_SIZE)" | \
#         mail -s "Xarra Backup Success - $DATE_SHORT" admin@xarrabooks.com
# fi

exit 0
