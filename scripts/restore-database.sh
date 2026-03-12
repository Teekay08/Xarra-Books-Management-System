#!/bin/bash
#==============================================================================
# PostgreSQL Database Restore Script
# Xarra Books Management System
#==============================================================================
# This script restores a PostgreSQL backup from local file or S3
#
# Usage:
#   ./restore-database.sh /path/to/backup.backup.gz
#   ./restore-database.sh s3://xarra-backups/postgres/xarra_20260311_030000.backup.gz
#
# CAUTION: This will DROP and recreate the database!
#==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
DATABASE="${DATABASE_NAME:-xarra}"
DB_USER="${DB_USER:-xarra}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
TEMP_DIR="/tmp/xarra-restore"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if backup file provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup-file-path-or-s3-url>"
    echo ""
    echo "Examples:"
    echo "  $0 /backups/postgres/xarra_20260311_030000.backup.gz"
    echo "  $0 s3://xarra-backups/postgres/xarra_20260311_030000.backup.gz"
    exit 1
fi

BACKUP_SOURCE="$1"

# Create temp directory
mkdir -p "$TEMP_DIR"

# Download from S3 if needed
if [[ "$BACKUP_SOURCE" == s3://* ]]; then
    log "Downloading backup from S3..."
    BACKUP_FILE="$TEMP_DIR/$(basename $BACKUP_SOURCE)"
    aws s3 cp "$BACKUP_SOURCE" "$BACKUP_FILE"
    
    if [ $? -ne 0 ]; then
        log "ERROR: Failed to download backup from S3"
        exit 1
    fi
else
    BACKUP_FILE="$BACKUP_SOURCE"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log "ERROR: Backup file not found: $BACKUP_FILE"
        exit 1
    fi
fi

log "Using backup file: $BACKUP_FILE"

# Decompress if needed
if [[ "$BACKUP_FILE" == *.gz ]]; then
    log "Decompressing backup..."
    DECOMPRESSED_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$DECOMPRESSED_FILE"
    RESTORE_FILE="$DECOMPRESSED_FILE"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Prompt for confirmation
read -p "⚠️  WARNING: This will DROP the database '$DATABASE' and restore from backup. Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

log "Starting database restore..."

# Terminate all connections to the database
log "Terminating existing connections..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DATABASE' AND pid <> pg_backend_pid();"

# Drop and recreate database
log "Dropping database $DATABASE..."
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$DATABASE"

log "Creating fresh database..."
PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DATABASE"

# Restore from backup
log "Restoring data from backup..."
PGPASSWORD="$DB_PASSWORD" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DATABASE" \
    -v \
    "$RESTORE_FILE"

if [ $? -eq 0 ]; then
    log "✅ Database restore completed successfully"
else
    log "❌ ERROR: Database restore failed"
    exit 1
fi

# Cleanup temp files
if [[ "$BACKUP_SOURCE" == s3://* ]]; then
    log "Cleaning up temporary files..."
    rm -f "$BACKUP_FILE" "$RESTORE_FILE"
fi

log "Restore process completed"

# Verify restoration
log "Verifying database..."
TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DATABASE" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

log "Restored $TABLE_COUNT tables"

exit 0
