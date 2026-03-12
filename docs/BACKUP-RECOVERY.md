# Database Backup & Recovery Guide
**Xarra Books Management System**

## Overview

This guide explains how to perform database backups and restores for the Xarra Books system.

---

## Automated Backups

### Setup (Linux/Unix Production Servers)

1. **Make backup scripts executable:**
   ```bash
   chmod +x scripts/backup-database.sh
   chmod +x scripts/restore-database.sh
   ```

2. **Configure environment variables:**
   ```bash
   export DB_PASSWORD="your-database-password"
   export DB_USER="xarra"
   export DB_HOST="localhost"
   export DB_PORT="5432"
   export DATABASE_NAME="xarra"
   export BACKUP_DIR="/backups/postgres"
   export S3_BUCKET="xarra-backups"  # Optional: for AWS S3 offsite storage
   export RETENTION_DAYS="30"
   ```

3. **Test the backup script:**
   ```bash
   ./scripts/backup-database.sh
   ```

4. **Schedule automatic daily backups using cron:**
   ```bash
   # Edit crontab
   crontab -e
   
   # Add this line to run backup daily at 3:00 AM
   0 3 * * * /path/to/xarra/scripts/backup-database.sh >> /var/log/xarra-backup.log 2>&1
   ```

5. **Monitor backup logs:**
   ```bash
   tail -f /var/log/xarra-backup.log
   ```

---

## Manual Backup

### Quick Backup (Custom Format)
```bash
pg_dump -U xarra -F c -b -v -f xarra_backup.backup xarra
```

### Compressed Backup
```bash
pg_dump -U xarra -F c -b -v xarra | gzip > xarra_backup.backup.gz
```

### Plain SQL Backup
```bash
pg_dump -U xarra --clean --if-exists xarra > xarra_backup.sql
```

---

## Restore from Backup

### Using the Restore Script
```bash
# From local file
./scripts/restore-database.sh /backups/postgres/xarra_20260311_030000.backup.gz

# From S3
./scripts/restore-database.sh s3://xarra-backups/postgres/xarra_20260311_030000.backup.gz
```

### Manual Restore
```bash
# Drop existing database
dropdb xarra

# Create fresh database
createdb xarra

# Restore from custom format
pg_restore -U xarra -d xarra -v xarra_backup.backup

# Or from compressed
gunzip -c xarra_backup.backup.gz | pg_restore -U xarra -d xarra -v

# Or from SQL file
psql -U xarra -d xarra -f xarra_backup.sql
```

---

## Backup Strategy (Production Recommendations)

### Frequency
- **Daily full backups** at 3:00 AM (off-peak hours)
- **Hourly WAL archiving** for point-in-time recovery (PITR)
- **Monthly manual verification** restore test on staging

### Retention Policy
- **Local backups:** 30 days rolling retention
- **S3 backups:** 90 days with lifecycle policy to Glacier
- **Monthly snapshots:** Keep 12 months

### Storage Locations
1. **Primary:** Local disk (`/backups/postgres/`)
2. **Secondary:** AWS S3 with encryption at rest
3. **Tertiary:** Glacier for long-term archival

---

## Point-in-Time Recovery (PITR)

### Setup WAL Archiving

1. **Edit PostgreSQL configuration (`postgresql.conf`):**
   ```ini
   wal_level = replica
   archive_mode = on
   archive_command = 'test ! -f /backups/postgres/wal/%f && cp %p /backups/postgres/wal/%f'
   archive_timeout = 300  # Force archive every 5 minutes
   ```

2. **Create WAL archive directory:**
   ```bash
   mkdir -p /backups/postgres/wal
   chown postgres:postgres /backups/postgres/wal
   chmod 750 /backups/postgres/wal
   ```

3. **Restart PostgreSQL:**
   ```bash
   sudo systemctl restart postgresql
   ```

### Restore to Specific Point in Time

```bash
# Stop PostgreSQL
sudo systemctl stop postgresql

# Move existing data directory
mv /var/lib/postgresql/14/main /var/lib/postgresql/14/main.old

# Restore base backup
pg_restore -C -d postgres xarra_base_backup.backup

# Create recovery configuration
cat > /var/lib/postgresql/14/main/recovery.conf << EOF
restore_command = 'cp /backups/postgres/wal/%f %p'
recovery_target_time = '2026-03-11 14:30:00'
EOF

# Start PostgreSQL (will replay WAL logs)
sudo systemctl start postgresql
```

---

## Backup Verification

### Automated Verification (Recommended)
```bash
# Add to cron (weekly on Sunday at 2 AM)
0 2 * * 0 /path/to/xarra/scripts/verify-backup.sh
```

### Manual Verification Steps

1. **Check backup file integrity:**
   ```bash
   pg_restore --list xarra_backup.backup
   ```

2. **Test restore on staging:**
   ```bash
   # Create test database
   createdb xarra_test
   
   # Restore
   pg_restore -U xarra -d xarra_test xarra_backup.backup
   
   # Verify table count
   psql -U xarra -d xarra_test -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
   
   # Cleanup
   dropdb xarra_test
   ```

---

## Disaster Recovery Checklist

### When Disaster Strikes

1. ☐ **Assess the situation**
   - What data was lost?
   - When did the incident occur?
   - Is the database server accessible?

2. ☐ **Notify stakeholders**
   - Technical team
   - Management
   - Affected users

3. ☐ **Stop the application**
   ```bash
   pm2 stop xarra-api
   ```

4. ☐ **Identify the restore point**
   - Latest backup before incident
   - Check S3 for available backups

5. ☐ **Perform the restore**
   ```bash
   ./scripts/restore-database.sh <backup-file>
   ```

6. ☐ **Verify data integrity**
   - Check critical tables
   - Verify recent transactions
   - Run data consistency checks

7. ☐ **Restart the application**
   ```bash
   pm2 start xarra-api
   ```

8. ☐ **Monitor system**
   - Check logs for errors
   - Verify user access
   - Test critical functions

9. ☐ **Document the incident**
   - Root cause analysis
   - Data loss assessment
   - Prevention measures

---

## Backup Monitoring

### Check Backup Status
```bash
# List recent backups
ls -lh /backups/postgres/ | tail -10

# Check backup disk usage
du -sh /backups/postgres/

# Verify S3 backups
aws s3 ls s3://xarra-backups/postgres/ --recursive | tail -10
```

### Automated Alerts

Set up monitoring alerts for:
- Backup failures (check exit code)
- Backup file size anomalies (too small = potential issue)
- Missing backups (no files for 25+ hours)
- Disk space warnings (< 20% free)

Example alerting script:
```bash
#!/bin/bash
BACKUP_COUNT=$(find /backups/postgres -name "xarra_*.backup.gz" -mtime -1 | wc -l)

if [ $BACKUP_COUNT -eq 0 ]; then
    echo "WARNING: No backup found in last 24 hours!" | \
        mail -s "Xarra Backup Alert" admin@xarrabooks.com
fi
```

---

## Security Best Practices

### Backup Encryption

1. **Encrypt backups before S3 upload:**
   ```bash
   openssl enc -aes-256-cbc -salt \
       -in xarra_backup.backup.gz \
       -out xarra_backup.backup.gz.enc \
       -k "your-encryption-passphrase"
   ```

2. **Enable S3 server-side encryption:**
   ```bash
   aws s3api put-object \
       --bucket xarra-backups \
       --key postgres/backup.backup.gz \
       --body backup.backup.gz \
       --server-side-encryption AES256
   ```

### Access Control

- Backup files: `chmod 600` (owner read/write only)
- Backup scripts: `chmod 700` (owner execute only)
- Store DB password in secure location (AWS Secrets Manager, HashiCorp Vault)
- Use IAM roles for S3 access (don't hardcode AWS keys)

---

## Troubleshooting

### Issue: pg_dump fails with "permission denied"
**Solution:** Ensure the backup directory exists and has correct permissions:
```bash
sudo mkdir -p /backups/postgres
sudo chown postgres:postgres /backups/postgres
sudo chmod 750 /backups/postgres
```

### Issue: Restore fails with "too many connections"
**Solution:** Terminate existing connections before restore:
```bash
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'xarra';"
```

### Issue: Backup file is 0 bytes
**Solution:** Check PostgreSQL logs and ensure:
- Database user has sufficient privileges
- Database is accessible
- Disk has sufficient space

### Issue: S3 upload fails
**Solution:** Verify AWS credentials and permissions:
```bash
aws s3 ls s3://xarra-backups/
```

---

## Resources

- [PostgreSQL Backup Documentation](https://www.postgresql.org/docs/current/backup.html)
- [AWS S3 Backup Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/backup-best-practices.html)
- [Point-in-Time Recovery Guide](https://www.postgresql.org/docs/current/continuous-archiving.html)

---

**Last Updated:** March 11, 2026  
**Maintained By:** Xarra Books Technical Team
