# Production Deployment Checklist
**Xarra Books Management System - Security Enhanced Version**

## Pre-Deployment

### Dependencies
- [ ] Run `npm install` in `apps/api` to install @fastify/rate-limit
- [ ] Verify all packages are up to date
- [ ] Check for security vulnerabilities: `npm audit`
- [ ] Run TypeScript compilation: `npm run build`
- [ ] Run tests: `npm test`

### Environment Configuration
- [ ] Set strong `JWT_SECRET` (min 32 characters, random)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `DATABASE_URL` with production credentials
- [ ] Set `REDIS_URL` for production Redis instance
- [ ] Configure `CORS_ORIGIN` with production domain(s)
- [ ] Set `RESEND_API_KEY` for email functionality
- [ ] Configure `S3_BUCKET` and `AWS_REGION` for backups
- [ ] Verify all required environment variables are set

### Database
- [ ] Run database migrations: `npm run db:migrate`
- [ ] Verify database connectivity
- [ ] Check database user permissions
- [ ] Enable PostgreSQL connection pooling
- [ ] Configure max connections appropriately

### Backup System
- [ ] Make backup scripts executable: `chmod +x scripts/*.sh`
- [ ] Create backup directory: `mkdir -p /backups/postgres`
- [ ] Set correct permissions: `chown postgres:postgres /backups/postgres`
- [ ] Test manual backup: `./scripts/backup-database.sh`
- [ ] Set up cron job for daily backups (3:00 AM)
- [ ] Configure AWS S3 bucket for offsite backups
- [ ] Test S3 upload functionality
- [ ] Test restore procedure on staging
- [ ] Set up backup monitoring alerts
- [ ] Document backup encryption keys (store securely)

## Security Configuration

### Rate Limiting (Already Implemented)
- [ ] Verify rate limits are appropriate: 100 req/15 min (general), 5 req/15 min (auth)
- [ ] Test rate limiting on staging environment
- [ ] Monitor rate limit metrics after deployment

### Error Handling (Already Implemented)
- [ ] Verify production mode hides sensitive errors
- [ ] Test error responses don't leak internal info
- [ ] Set up error monitoring (Sentry, DataDog, etc.)

### File Uploads (Already Enhanced)
- [ ] Verify uploads directory exists: `data/uploads/`
- [ ] Set appropriate permissions: `chmod 755 data/uploads/`
- [ ] Test logo upload functionality
- [ ] Verify file size limits are enforced (2MB for logos)

### Authentication
- [ ] Test login functionality
- [ ] Test password reset flow
- [ ] Verify session expiry (8 hours)
- [ ] Test role-based access control
- [ ] Verify CORS allows only production domains

## Post-Deployment

### Monitoring
- [ ] Set up application performance monitoring (APM)
- [ ] Configure error tracking and alerting
- [ ] Monitor API response times
- [ ] Track rate limit hits (adjust if needed)
- [ ] Set up database performance monitoring
- [ ] Configure backup success/failure alerts

### Security Testing
- [ ] Run security scan (OWASP ZAP, Burp Suite)
- [ ] Test authentication endpoints for vulnerabilities
- [ ] Verify SSL/TLS configuration
- [ ] Check security headers (via helmet)
- [ ] Test file upload restrictions
- [ ] Attempt SQL injection (should fail)
- [ ] Test XSS protection

### Functional Testing
- [ ] Test user login/logout
- [ ] Create test invoice
- [ ] Record test payment
- [ ] Upload test document
- [ ] Run data export
- [ ] Test email notifications
- [ ] Verify audit log entries
- [ ] Test partner portal access
- [ ] Test author portal access

### Performance Testing
- [ ] Load test API endpoints
- [ ] Test database query performance
- [ ] Verify Redis cache is working
- [ ] Check memory usage
- [ ] Monitor CPU usage
- [ ] Test under concurrent users

### Documentation
- [ ] Update deployment documentation
- [ ] Document environment variable changes
- [ ] Share backup recovery procedures with team
- [ ] Update incident response plan
- [ ] Document monitoring setup
- [ ] Create runbook for common issues

## Rollback Plan

### If Issues Occur
- [ ] Have previous version tagged in git
- [ ] Know how to quickly rollback
- [ ] Have database backup from before deployment
- [ ] Test rollback procedure
- [ ] Document rollback steps

### Rollback Steps
1. Stop application servers
2. Checkout previous git tag
3. Run `npm install` (restore old dependencies)
4. Restore database if needed
5. Restart application servers
6. Verify functionality
7. Notify stakeholders

## Sign-Off

**Deployment Date:** _________________  
**Deployed By:** _________________  
**Approved By:** _________________  

**Backup Tested:** ☐ Yes ☐ No  
**Security Scan:** ☐ Pass ☐ Fail  
**Load Test:** ☐ Pass ☐ Fail  
**All Tests Passing:** ☐ Yes ☐ No  

**Production URL:** _________________  
**Monitoring Dashboard:** _________________  
**Backup Location:** _________________  

---

## Emergency Contacts

**Technical Lead:** _________________  
**DevOps:** _________________  
**Database Admin:** _________________  
**Security Team:** _________________  

---

## Post-Deployment Review (24 hours after deployment)

- [ ] No critical errors in logs
- [ ] Response times acceptable
- [ ] Backup completed successfully
- [ ] No security incidents
- [ ] User feedback positive
- [ ] All integrations working

**Notes:**
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
