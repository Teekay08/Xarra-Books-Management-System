# AWS Free Tier Deployment Checklist

**Project:** Xarra Books Management System  
**Target:** AWS Free Tier  
**Estimated Time:** 2-3 hours  
**Date Started:** _______________

---

## Phase 1: AWS Account Setup (30 minutes)

### Account Creation
- [ ] Created AWS account at https://aws.amazon.com
- [ ] Verified email address
- [ ] Added payment method (credit/debit card)
- [ ] Completed phone verification
- [ ] Selected **Basic Support (Free)** plan
- [ ] Received account confirmation email

### Security Configuration
- [ ] Logged into AWS Console
- [ ] Enabled MFA on root account
  - Method used: ☐ Google Authenticator ☐ Authy ☐ Other: _______________
- [ ] Created IAM admin user
  - Username: _______________
- [ ] Saved IAM credentials securely
- [ ] Logged out of root account
- [ ] Logged in with IAM user
- [ ] Selected deployment region: _______________
  - Recommended: `af-south-1` (Cape Town) for South Africa

### Cost Protection
- [ ] Set up billing alert ($10 threshold)
- [ ] Enabled free tier usage alerts
- [ ] Reviewed free tier limits: https://aws.amazon.com/free/

---

## Phase 2: Database Setup (30 minutes)

### RDS Security Group
- [ ] Navigated to EC2 → Security Groups
- [ ] Created security group: `xarra-db-sg`
- [ ] Added inbound rule:
  - Type: PostgreSQL
  - Port: 5432
  - Source: (will update after EC2 creation)

### RDS PostgreSQL Instance
- [ ] Navigated to RDS → Databases
- [ ] Clicked **Create database**
- [ ] Selected **PostgreSQL**
- [ ] Selected **Free tier** template
- [ ] Configuration:
  - DB identifier: `xarra-books-db`
  - Master username: `postgres`
  - Master password: _______________ (save securely!)
  - Instance class: `db.t3.micro`
  - Storage: 20 GB (max free tier)
  - Storage autoscaling: DISABLED
- [ ] Connectivity:
  - Public access: NO
  - VPC security group: `xarra-db-sg`
- [ ] Additional configuration:
  - Initial database: `xarra_books`
  - Backup retention: 7 days
  - Encryption: ENABLED
  - Performance Insights: DISABLED
  - Enhanced monitoring: DISABLED
- [ ] Clicked **Create database**
- [ ] Waited for status: **Available** (5-10 minutes)

### Database Connection Details
```
Endpoint: ______________________________________________________
Port: 5432
Database: xarra_books
Username: postgres
Password: ______________________________________________________
```
- [ ] Saved connection details securely

---

## Phase 3: EC2 Instance Setup (45 minutes)

### EC2 Key Pair
- [ ] Navigated to EC2 → Key Pairs
- [ ] Created new key pair: `xarra-books-key`
  - Type: RSA
  - Format: ☐ .pem (Mac/Linux) ☐ .ppk (Windows)
- [ ] Downloaded key pair
- [ ] Saved to secure location: _______________
- [ ] Set permissions (Mac/Linux only):
  ```bash
  chmod 400 ~/Downloads/xarra-books-key.pem
  ```

### EC2 Security Group
- [ ] Created security group: `xarra-web-sg`
- [ ] Added inbound rules:
  - SSH: Port 22, Source: My IP
  - HTTP: Port 80, Source: Anywhere (0.0.0.0/0)
  - HTTPS: Port 443, Source: Anywhere (0.0.0.0/0)
  - Custom TCP: Port 3002, Source: Anywhere

### Launch EC2 Instance
- [ ] Navigated to EC2 → Instances → Launch instances
- [ ] Configuration:
  - Name: `xarra-books-server`
  - AMI: Ubuntu Server 22.04 LTS
  - Instance type: `t2.micro`
  - Key pair: `xarra-books-key`
  - Network: Default VPC
  - Public IP: Auto-assign ENABLED
  - Security group: `xarra-web-sg`
  - Storage: 30 GB gp3
- [ ] Clicked **Launch instance**
- [ ] Waited for status: **Running**

### EC2 Instance Details
```
Instance ID: ______________________________________________________
Public IP: ______________________________________________________
Private IP: ______________________________________________________
```

### Update RDS Security Group
- [ ] Navigated back to EC2 → Security Groups → `xarra-db-sg`
- [ ] Edited inbound rules
- [ ] Changed PostgreSQL rule source to: `xarra-web-sg`
- [ ] Saved rules

### Test SSH Connection
- [ ] Opened terminal/PowerShell
- [ ] Connected to EC2:
  ```bash
  ssh -i ~/Downloads/xarra-books-key.pem ubuntu@YOUR_EC2_IP
  ```
- [ ] Successfully connected (saw `ubuntu@ip-...` prompt)

---

## Phase 4: Server Configuration (30 minutes)

### Install Prerequisites
Connected to EC2, ran:

- [ ] System update:
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```

- [ ] Docker:
  ```bash
  sudo apt install docker.io -y
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker ubuntu
  ```

- [ ] Docker Compose:
  ```bash
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  ```

- [ ] Git:
  ```bash
  sudo apt install git -y
  ```

- [ ] Node.js & NPM:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

- [ ] Logged out and back in for docker group to take effect
  ```bash
  exit
  ssh -i ~/Downloads/xarra-books-key.pem ubuntu@YOUR_EC2_IP
  ```

### Verify Installations
- [ ] `docker --version` shows version
- [ ] `docker-compose --version` shows version
- [ ] `node --version` shows v20.x
- [ ] `npm --version` shows version
- [ ] `git --version` shows version

---

## Phase 5: Application Deployment (45 minutes)

### Clone Repository
- [ ] Cloned repository:
  ```bash
  git clone https://github.com/YOUR_USERNAME/xarra-books.git app
  cd app
  ```
- [ ] Confirmed files are present: `ls -la`

### Create Environment File
- [ ] Created `.env.production`:
  ```bash
  nano .env.production
  ```
- [ ] Added all required environment variables (see AWS-DEPLOYMENT-GUIDE.md Section 7.3)
- [ ] Generated JWT secret:
  ```bash
  openssl rand -base64 32
  ```
- [ ] Saved and closed file (Ctrl+O, Enter, Ctrl+X)

### Environment Variables Configured
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` with correct RDS endpoint
- [ ] `REDIS_URL=redis://redis:6379`
- [ ] `API_PORT=3002`
- [ ] `API_URL` with EC2 public IP
- [ ] `VITE_API_BASE_URL` with EC2 public IP
- [ ] `JWT_SECRET` (32+ characters)
- [ ] `CORS_ORIGIN` with EC2 public IP

### Create Production Docker Compose
- [ ] Created `docker-compose.production.yml` (see AWS-DEPLOYMENT-GUIDE.md Section 7.4)
- [ ] Configured Redis container
- [ ] Configured API container
- [ ] Configured Web container
- [ ] Set restart policies: `always`
- [ ] Configured volumes for Redis data

### Install Dependencies
- [ ] Ran `npm install` in app directory
- [ ] No errors during installation

### Run Database Migrations
- [ ] Navigated to packages/db:
  ```bash
  cd packages/db
  ```
- [ ] Ran migrations:
  ```bash
  npm run db:push
  ```
- [ ] Migrations completed successfully
- [ ] Returned to app root:
  ```bash
  cd ~/app
  ```

### Build and Start Application
- [ ] Built and started containers:
  ```bash
  docker-compose -f docker-compose.production.yml up -d --build
  ```
- [ ] Build completed (5-10 minutes)
- [ ] Checked container status:
  ```bash
  docker ps
  ```
- [ ] Confirmed 3 containers running: redis, api, web

### Verify Deployment
- [ ] Checked API health:
  ```bash
  curl http://localhost:3002/health
  ```
- [ ] Response: `{"status":"ok",...}`

- [ ] Checked API logs (no errors):
  ```bash
  docker logs app-api-1 --tail 50
  ```

- [ ] Checked web logs (no errors):
  ```bash
  docker logs app-web-1 --tail 50
  ```

### Test from Browser
- [ ] Opened browser to: `http://YOUR_EC2_IP`
- [ ] Application loads successfully
- [ ] Login page displayed
- [ ] Able to log in
- [ ] Dashboard loads

---

## Phase 6: Domain & SSL (Optional - 30 minutes)

### Domain Configuration
- [ ] Have a domain name: _______________
- [ ] Accessed domain registrar control panel
- [ ] Added A Record:
  - Host: `@` or subdomain
  - Value: EC2 Public IP
  - TTL: 300
- [ ] Waited for DNS propagation (5-30 minutes)
- [ ] Confirmed domain resolves: `nslookup YOUR_DOMAIN`

### Install Nginx
- [ ] Installed Nginx:
  ```bash
  sudo apt install nginx -y
  ```
- [ ] Created Nginx config (see AWS-DEPLOYMENT-GUIDE.md Section 8.2)
- [ ] Enabled site:
  ```bash
  sudo ln -s /etc/nginx/sites-available/xarrabooks /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx
  ```

### Install SSL Certificate
- [ ] Installed Certbot:
  ```bash
  sudo apt install certbot python3-certbot-nginx -y
  ```
- [ ] Obtained certificate:
  ```bash
  sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
  ```
- [ ] Entered email address
- [ ] Agreed to Terms of Service
- [ ] Selected redirect HTTP to HTTPS
- [ ] Certificate installed successfully

### Verify SSL
- [ ] Opened browser to: `https://YOUR_DOMAIN`
- [ ] Padlock icon shows in address bar
- [ ] Certificate is valid
- [ ] Application works over HTTPS

---

## Phase 7: Post-Deployment (15 minutes)

### Database Backup Setup
- [ ] Created backup script:
  ```bash
  nano ~/backup.sh
  ```
- [ ] Made executable:
  ```bash
  chmod +x ~/backup.sh
  ```
- [ ] Tested manual backup:
  ```bash
  ~/backup.sh
  ```
- [ ] Set up cron job for daily backups:
  ```bash
  crontab -e
  ```
  Added: `0 2 * * * /home/ubuntu/backup.sh >> /home/ubuntu/backup.log 2>&1`

### Monitoring Setup
- [ ] Set up CloudWatch billing alarm
- [ ] Enabled free tier usage alerts
- [ ] Added health check monitoring

### Documentation
- [ ] Documented deployment details:
  - EC2 IP: _______________
  - Domain: _______________
  - RDS endpoint: _______________
  - SSH key location: _______________
- [ ] Saved login credentials securely
- [ ] Shared access details with team (if applicable)

### Security Review
- [ ] EC2 SSH limited to specific IP
- [ ] RDS only accessible from EC2
- [ ] Strong database password
- [ ] Strong JWT secret
- [ ] SSL enabled (if using domain)
- [ ] Billing alerts configured

---

## Phase 8: Final Testing (15 minutes)

### Functional Testing
- [ ] Tested login/logout
- [ ] Created test author
- [ ] Created test title
- [ ] Created test partner
- [ ] Created test consignment
- [ ] Created test invoice
- [ ] Verified all major features work

### Performance Testing
- [ ] Checked page load times (< 3 seconds)
- [ ] Checked API response times (< 500ms)
- [ ] Monitored resource usage:
  ```bash
  docker stats
  free -h
  df -h
  ```

### Error Handling
- [ ] Checked error logs (none critical):
  ```bash
  docker logs app-api-1 2>&1 | grep -i error
  ```
- [ ] Verified proper error messages on frontend

---

## Deployment Complete! 🎉

### Post-Deployment Checklist
- [ ] Application accessible via IP/domain
- [ ] All core features working
- [ ] Database connected and responsive
- [ ] SSL configured (if using domain)
- [ ] Backups scheduled
- [ ] Monitoring active
- [ ] Documentation complete
- [ ] Team notified (if applicable)

### Important Information to Save

**AWS Resources:**
- Region: _______________
- EC2 Instance ID: _______________
- EC2 Public IP: _______________
- RDS Endpoint: _______________
- Security Groups: `xarra-web-sg`, `xarra-db-sg`

**Access Details:**
- Application URL: _______________
- SSH Command: `ssh -i PATH_TO_KEY ubuntu@IP_ADDRESS`
- Database Connection: `psql -h RDS_ENDPOINT -U postgres -d xarra_books`

**Credentials (Store Securely!):**
- AWS Root Email: _______________
- AWS IAM User: _______________
- Database Password: _______________
- JWT Secret: _______________

**Costs to Monitor:**
- EC2 t2.micro: 750 hours/month free (12 months)
- RDS db.t3.micro: 750 hours/month free (12 months)
- Data transfer: 15 GB/month free
- ElastiCache Redis: ~$12/month (if using) or FREE (if on EC2)

**Next Steps:**
1. Monitor AWS billing for first week
2. Test backups work correctly
3. Consider setting up CI/CD pipeline
4. Plan for post-free-tier costs
5. Document any custom configurations

---

## Need Help?

- **AWS Support:** https://console.aws.amazon.com/support/
- **Deployment Guide:** See `AWS-DEPLOYMENT-GUIDE.md`
- **Quick Reference:** See `AWS-QUICK-REFERENCE.md`
- **Application Issues:** Check logs with `docker logs app-api-1`

**Deployment completed by:** _______________  
**Date:** _______________  
**Signature:** _______________

---

**Congratulations on your successful deployment!** 🚀
