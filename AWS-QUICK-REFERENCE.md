# AWS Deployment Quick Reference

## 🚀 Quick Start Commands

### Initial Setup (One-time)

```bash
# 1. Connect to EC2
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@YOUR_EC2_IP

# 2. Install Docker & Dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install docker.io docker-compose git -y
sudo usermod -aG docker ubuntu
exit

# 3. Clone Repository
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@YOUR_EC2_IP
git clone https://github.com/yourusername/xarra-books.git app
cd app

# 4. Configure Environment
nano .env.production
# Copy from AWS-DEPLOYMENT-GUIDE.md Section 7.3

# 5. Deploy
docker-compose -f docker-compose.production.yml up -d --build
```

---

## 📋 Daily Operations

### Check Status
```bash
docker ps
docker logs app-api-1 --tail 50
docker stats
```

### Restart Services
```bash
cd ~/app
docker-compose -f docker-compose.production.yml restart
```

### Update Application
```bash
cd ~/app
git pull
docker-compose -f docker-compose.production.yml up -d --build
```

### View Logs
```bash
# API logs
docker logs -f app-api-1

# Web logs
docker logs -f app-web-1

# All logs
docker-compose -f docker-compose.production.yml logs -f
```

### Database Operations
```bash
# Connect to database
psql -h YOUR_RDS_ENDPOINT -U postgres -d xarra_books

# Run migrations
cd ~/app/packages/db
npm run db:push

# Create backup
pg_dump -h YOUR_RDS_ENDPOINT -U postgres -d xarra_books -F c -f backup.dump
```

---

## 🔧 Troubleshooting

### Application Not Starting
```bash
# Check container status
docker ps -a

# View startup logs
docker logs app-api-1
docker logs app-web-1

# Restart everything
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d
```

### Database Connection Issues
```bash
# Test connection
telnet YOUR_RDS_ENDPOINT 5432

# Check security groups in AWS Console:
# - RDS security group allows inbound from EC2 security group on port 5432
```

### Out of Memory
```bash
# Check memory usage
free -h
docker stats

# Clear Docker cache
docker system prune -a -f
```

### Disk Space Full
```bash
# Check disk usage
df -h

# Clean Docker
docker system prune -a --volumes -f

# Clean logs
sudo journalctl --vacuum-time=7d
```

---

## 💰 Cost Monitoring

### Check AWS Costs
```bash
# AWS Console → Billing Dashboard
# Free Tier Usage: https://console.aws.amazon.com/billing/home#/freetier
```

### Set Billing Alert
1. AWS Console → CloudWatch
2. Alarms → Create Alarm
3. Billing → Total Estimated Charge
4. Threshold: $10 USD
5. Email notification

---

## 🔐 Security Checklist

- [ ] EC2 SSH key secured (chmod 400)
- [ ] Root AWS account has MFA enabled
- [ ] Using IAM user (not root) for daily tasks
- [ ] Database password is strong (20+ characters)
- [ ] JWT_SECRET is random (32+ characters)
- [ ] EC2 security group SSH limited to your IP only
- [ ] RDS security group allows only EC2 security group
- [ ] SSL certificate installed (if using domain)
- [ ] Database backups enabled
- [ ] Redis password set

---

## 📈 Monitoring

### Check Application Health
```bash
# API health check
curl http://localhost:3002/health

# Check from outside
curl http://YOUR_EC2_IP/api/health
```

### Monitor Resources
```bash
# CPU, Memory, Network
htop

# Docker stats
docker stats --no-stream

# Disk I/O
iostat -x 1
```

### Check Logs for Errors
```bash
# API errors
docker logs app-api-1 2>&1 | grep -i error

# System errors
sudo journalctl -u docker -n 100
```

---

## 🔄 Backup Strategy

### Manual Backup
```bash
# Backup database
pg_dump -h YOUR_RDS_ENDPOINT -U postgres \
  -d xarra_books -F c -f backup-$(date +%Y%m%d).dump

# Backup uploads directory
tar -czf uploads-$(date +%Y%m%d).tar.gz ~/app/apps/api/data/uploads/

# Upload to S3 (optional)
aws s3 cp backup-*.dump s3://your-bucket/backups/
```

### Automated Backups
```bash
# Edit crontab
crontab -e

# Add daily 2 AM backup
0 2 * * * /home/ubuntu/backup.sh >> /home/ubuntu/backup.log 2>&1
```

---

## 🌐 Domain & SSL

### Point Domain to EC2
1. Get EC2 Public IP from AWS Console
2. Go to your domain registrar
3. Add A Record:
   - Host: `@` or `www`
   - Value: EC2 Public IP
   - TTL: 300

### Install SSL (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
```

---

## 📊 Performance Optimization

### Enable Gzip Compression (Nginx)
Already configured in `apps/web/nginx.conf`

### Enable Redis Caching
Already configured in application

### Optimize Database
```sql
-- Connect to database
psql -h YOUR_RDS_ENDPOINT -U postgres -d xarra_books

-- Analyze and vacuum
VACUUM ANALYZE;

-- Check indexes
\di
```

---

## 🆘 Emergency Procedures

### Application Completely Down
```bash
# 1. Check EC2 instance is running (AWS Console)
# 2. Connect to EC2
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@YOUR_EC2_IP

# 3. Check Docker
docker ps -a

# 4. Restart everything
cd ~/app
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d

# 5. Check logs for errors
docker logs app-api-1 --tail 100
```

### Database Connection Lost
```bash
# 1. Check RDS status (AWS Console → RDS)
# 2. Verify security groups
# 3. Test connection
telnet YOUR_RDS_ENDPOINT 5432

# 4. Restart API
docker-compose -f docker-compose.production.yml restart api
```

### EC2 Instance Unresponsive
1. AWS Console → EC2 → Instances
2. Select instance → Actions → Instance State → Reboot
3. Wait 2-3 minutes
4. Try connecting again

---

## 📞 Support Contacts

- **AWS Support:** https://console.aws.amazon.com/support/
- **AWS Free Tier Limits:** https://aws.amazon.com/free/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Docker Docs:** https://docs.docker.com/

---

## 🎓 Useful AWS Commands (AWS CLI)

```bash
# Install AWS CLI
sudo apt install awscli -y

# Configure
aws configure

# List EC2 instances
aws ec2 describe-instances --query 'Reservations[*].Instances[*].[InstanceId,State.Name,PublicIpAddress]'

# Check RDS status
aws rds describe-db-instances --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceStatus]'

# List S3 buckets
aws s3 ls

# Upload to S3
aws s3 cp backup.dump s3://your-bucket/backups/
```

---

## 🔖 Important URLs

Replace `YOUR_EC2_IP` with your actual EC2 public IP:

- **Application:** `http://YOUR_EC2_IP`
- **API Health:** `http://YOUR_EC2_IP:3002/health`
- **AWS Console:** https://console.aws.amazon.com
- **AWS Billing:** https://console.aws.amazon.com/billing
- **AWS Free Tier Usage:** https://console.aws.amazon.com/billing/home#/freetier

---

**Last Updated:** March 12, 2026
