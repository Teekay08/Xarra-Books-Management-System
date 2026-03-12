# AWS Deployment Guide — Free Tier

**Xarra Books Management System**  
**Deployment Target:** AWS Free Tier  
**Architecture:** Docker containers on EC2, RDS PostgreSQL, ElastiCache Redis

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture Overview](#2-architecture-overview)
3. [AWS Account Setup](#3-aws-account-setup)
4. [Setting Up the Database (RDS)](#4-setting-up-the-database-rds)
5. [Setting Up Redis (ElastiCache)](#5-setting-up-redis-elasticache)
6. [Setting Up the EC2 Instance](#6-setting-up-the-ec2-instance)
7. [Deploying the Application](#7-deploying-the-application)
8. [Domain and SSL Setup](#8-domain-and-ssl-setup)
9. [Monitoring and Maintenance](#9-monitoring-and-maintenance)
10. [Cost Optimization Tips](#10-cost-optimization-tips)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

Before you begin, ensure you have:

- ✅ An AWS account (if you don't have one, create it at https://aws.amazon.com)
- ✅ A credit/debit card (required for AWS account verification)
- ✅ Basic understanding of Linux command line
- ✅ Git installed on your local machine
- ✅ Your application code ready (this repository)
- ✅ A domain name (optional but recommended for production use)

**Important:** AWS Free Tier is available for 12 months from account creation date. After that, standard charges apply.

---

## 2. Architecture Overview

Your system will be deployed with the following AWS services:

```
┌─────────────────────────────────────────────────────────┐
│                    Internet/Users                        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  EC2 Instance (t2.micro)                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Docker                                    │ │
│  │  ┌─────────────────┐  ┌────────────────────┐     │ │
│  │  │  Frontend       │  │  Backend API       │     │ │
│  │  │  (React/Vite)   │  │  (Fastify/Node.js) │     │ │
│  │  │  Port :80       │  │  Port :3002        │     │ │
│  │  └─────────────────┘  └────────────────────┘     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
        ┌────────────────────┐  ┌────────────────────┐
        │   RDS PostgreSQL   │  │ ElastiCache Redis  │
        │   (db.t3.micro)    │  │  (cache.t2.micro)  │
        │   Free Tier*       │  │  NOT Free Tier**   │
        └────────────────────┘  └────────────────────┘
```

**Free Tier Eligibility:**
- ✅ **EC2 t2.micro**: 750 hours/month for 12 months
- ✅ **RDS db.t3.micro**: 750 hours/month, 20GB storage for 12 months
- ⚠️ **ElastiCache**: NOT included in free tier (~$12/month for t2.micro)
- ✅ **Data Transfer**: 15GB/month outbound free

**Alternative for Redis:** You can run Redis in Docker on the same EC2 instance to stay 100% free tier.

---

## 3. AWS Account Setup

### Step 1: Create an AWS Account

1. Go to https://aws.amazon.com
2. Click **Create an AWS Account**
3. Enter your email and choose a password
4. Fill in your contact information (use **Personal** for individual use)
5. Enter payment information (you won't be charged if you stay within free tier limits)
6. Verify your phone number
7. Select the **Basic Support (Free)** plan
8. Complete the sign-up process

### Step 2: Secure Your Root Account

🔒 **Critical Security Steps:**

1. **Enable MFA (Multi-Factor Authentication):**
   - Go to **IAM Dashboard** → **My Security Credentials**
   - Click **Activate MFA** on your root account
   - Use Google Authenticator or similar app

2. **Create an IAM Admin User (don't use root for daily tasks):**
   - Go to **IAM** → **Users** → **Add User**
   - Username: `admin` (or your name)
   - Select: **Programmatic access** + **AWS Management Console access**
   - Attach policy: **AdministratorAccess**
   - Save the credentials securely
   - **Log out of root** and log in with your IAM user

### Step 3: Select Your Region

Choose a region close to your target users:

- **Africa:** `af-south-1` (Cape Town) — **Best for South Africa**
- **Europe:** `eu-west-1` (Ireland)
- **US:** `us-east-1` (Virginia)

All services must be created in the **same region**.

---

## 4. Setting Up the Database (RDS)

### Step 1: Create a Security Group for RDS

1. Go to **EC2** → **Security Groups** → **Create security group**
2. Name: `xarra-db-sg`
3. Description: `Security group for Xarra Books PostgreSQL database`
4. VPC: Select your default VPC
5. **Inbound rules:**
   - Type: `PostgreSQL`
   - Protocol: `TCP`
   - Port: `5432`
   - Source: `Custom` → (we'll update this after creating EC2)
6. Click **Create security group**

### Step 2: Create RDS PostgreSQL Instance

1. Go to **RDS** → **Databases** → **Create database**

2. **Engine options:**
   - Engine type: `PostgreSQL`
   - Version: `15.5` or latest stable
   - Template: **Free tier** ✅

3. **Settings:**
   - DB instance identifier: `xarra-books-db`
   - Master username: `postgres`
   - Master password: `[Create a strong password]`
   - Confirm password

4. **Instance configuration:**
   - DB instance class: `db.t3.micro` (Free tier eligible)
   - Storage: `20 GB` (max free tier)
   - Storage autoscaling: **Disable** (to avoid charges)

5. **Connectivity:**
   - Virtual private cloud (VPC): Default VPC
   - Subnet group: default
   - Public access: `No` (more secure)
   - VPC security group: Select `xarra-db-sg` (remove default)
   - Availability Zone: No preference

6. **Database authentication:**
   - Password authentication

7. **Additional configuration:**
   - Initial database name: `xarra_books`
   - Backup retention: `7 days` (free)
   - Enable encryption: Yes (free)
   - Performance Insights: **Disable** (costly)
   - Enhanced monitoring: **Disable** (costly)

8. Click **Create database** (takes 5-10 minutes)

9. **Save your connection details:**
   ```
   Endpoint: xarra-books-db.xxxxxxxxx.af-south-1.rds.amazonaws.com
   Port: 5432
   Database: xarra_books
   Username: postgres
   Password: [your password]
   ```

---

## 5. Setting Up Redis (ElastiCache)

### Option A: ElastiCache (⚠️ NOT Free Tier — $12/month)

If you need managed Redis and can accept the cost:

1. Go to **ElastiCache** → **Redis clusters** → **Create cluster**
2. Cluster mode: `Disabled`
3. Name: `xarra-redis`
4. Node type: `cache.t2.micro` (smallest available)
5. Number of replicas: `0`
6. Subnet group: Create new (use default VPC)
7. Security group: Create new `xarra-redis-sg`
   - Inbound: Port `6379`, Source: EC2 security group
8. Create cluster

### Option B: Redis on EC2 (✅ Free Tier — Recommended)

Run Redis in a Docker container on the same EC2 instance as your app:

**We'll add this to docker-compose.yml in Step 7.**

Benefits:
- ✅ Completely free
- ✅ Simpler setup
- ⚠️ No automatic backups
- ⚠️ Less scalable (but fine for small to medium workloads)

**For this guide, we'll use Option B (Redis on EC2).**

---

## 6. Setting Up the EC2 Instance

### Step 1: Launch EC2 Instance

1. Go to **EC2** → **Instances** → **Launch instances**

2. **Name:** `xarra-books-server`

3. **Application and OS Images (AMI):**
   - Quick Start: **Ubuntu**
   - Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   - Architecture: `64-bit (x86)`

4. **Instance type:**
   - `t2.micro` (Free tier eligible: 750 hours/month)

5. **Key pair (login):**
   - Click **Create new key pair**
   - Name: `xarra-books-key`
   - Type: `RSA`
   - Format: `.pem` (for Mac/Linux) or `.ppk` (for Windows PuTTY)
   - **Download and save safely** (you can't download it again)

6. **Network settings:**
   - VPC: Default
   - Subnet: No preference
   - Auto-assign public IP: **Enable**
   - Firewall (security groups): **Create security group**
     - Name: `xarra-web-sg`
     - Description: `Web server for Xarra Books`
     - **Inbound rules:**
       - SSH: Port `22`, Source: `My IP` (your current IP)
       - HTTP: Port `80`, Source: `Anywhere (0.0.0.0/0)`
       - HTTPS: Port `443`, Source: `Anywhere (0.0.0.0/0)`
       - Custom TCP: Port `3002`, Source: `Anywhere` (API)

7. **Configure storage:**
   - `30 GB` gp3 (free tier includes 30GB)
   - **Do not** select "Delete on termination" if you want data persistence

8. **Advanced details:**
   - Leave defaults

9. Click **Launch instance**

10. Wait for **Instance State** to show `Running`

11. **Copy your instance's Public IP address** (e.g., `13.244.123.45`)

### Step 2: Update RDS Security Group

Now that you have your EC2 instance, update the database security group:

1. Go to **EC2** → **Security Groups** → `xarra-db-sg`
2. **Edit inbound rules**
3. Change the PostgreSQL rule:
   - Source: `Custom` → Select `xarra-web-sg` (your EC2 security group)
4. Save rules

This allows your EC2 instance to connect to the database.

### Step 3: Connect to Your EC2 Instance

**From Mac/Linux:**
```bash
chmod 400 ~/Downloads/xarra-books-key.pem
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@13.244.123.45
```

**From Windows (using PowerShell):**
```powershell
ssh -i C:\Users\YourName\Downloads\xarra-books-key.pem ubuntu@13.244.123.45
```

Type `yes` when prompted about authenticity.

You should now see:
```
ubuntu@ip-172-31-xx-xx:~$
```

---

## 7. Deploying the Application

### Step 1: Install Prerequisites on EC2

Once connected to your EC2 instance:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker

# Add ubuntu user to docker group (to run docker without sudo)
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo apt install git -y

# Install Node.js & NPM (for building)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Log out and log back in for docker group to take effect
exit
```

Reconnect:
```bash
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@13.244.123.45
```

Verify:
```bash
docker --version
docker-compose --version
node --version
npm --version
```

### Step 2: Clone Your Repository

```bash
# Create app directory
cd ~
git clone https://github.com/yourusername/xarra-books.git app
cd app
```

**If your repo is private, you'll need to authenticate:**
```bash
git clone https://[your-personal-access-token]@github.com/yourusername/xarra-books.git app
```

### Step 3: Create Production Environment File

```bash
cd ~/app
nano .env.production
```

Paste the following (replace with your actual values):

```bash
# Environment
NODE_ENV=production

# Database (RDS endpoint)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@xarra-books-db.xxxxxxxxx.af-south-1.rds.amazonaws.com:5432/xarra_books

# Redis (local Docker)
REDIS_URL=redis://redis:6379

# API
API_PORT=3002
API_URL=http://13.244.123.45:3002  # Replace with your EC2 public IP
VITE_API_BASE_URL=http://13.244.123.45:3002  # For frontend build

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-here-min-32-chars-long

# CORS
CORS_ORIGIN=http://13.244.123.45,http://your-domain.com

# File uploads
UPLOAD_DIR=/app/api/data/uploads
MAX_FILE_SIZE=10485760

# Email (configure if you have an SMTP provider)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_FROM=noreply@xarrabooks.com
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

**Generate a strong JWT secret:**
```bash
openssl rand -base64 32
```

### Step 4: Create Production Docker Compose File

```bash
nano docker-compose.production.yml
```

Paste:

```yaml
version: '3.8'

services:
  # Redis (running locally on EC2 instead of ElastiCache)
  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --appendonly yes --requirepass your-redis-password
    volumes:
      - redis-data:/data
    networks:
      - xarra-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backend API
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: always
    ports:
      - "3002:3002"
    env_file:
      - .env.production
    environment:
      - REDIS_URL=redis://:your-redis-password@redis:6379
    volumes:
      - ./apps/api/data/uploads:/app/api/data/uploads
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - xarra-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Frontend
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        - VITE_API_BASE_URL=${VITE_API_BASE_URL}
    restart: always
    ports:
      - "80:80"
    depends_on:
      - api
    networks:
      - xarra-network

volumes:
  redis-data:

networks:
  xarra-network:
    driver: bridge
```

Save and exit.

### Step 5: Build and Deploy

```bash
# Install dependencies and build
cd ~/app
npm install

# Run database migrations
cd packages/db
npm run db:push
cd ~/..

# Build and start containers
docker-compose -f docker-compose.production.yml up -d --build
```

This will take 5-10 minutes on first build.

### Step 6: Verify Deployment

Check container status:
```bash
docker ps
```

You should see 3 containers running: `redis`, `api`, `web`

Check API health:
```bash
curl http://localhost:3002/health
```

Expected output:
```json
{"status":"ok","timestamp":"2026-03-12T...","environment":"production"}
```

Check logs if something is wrong:
```bash
# API logs
docker logs app-api-1

# Web logs
docker logs app-web-1

# Redis logs
docker logs app-redis-1
```

### Step 7: Access Your Application

Open your browser and navigate to:
```
http://13.244.123.45
```

(Replace with your actual EC2 public IP)

You should see the Xarra Books login page! 🎉

---

## 8. Domain and SSL Setup

### Step 1: Point Domain to EC2

If you have a domain (e.g., `xarrabooks.com`):

1. Go to your domain registrar (Namecheap, GoDaddy, etc.)
2. Add an **A Record**:
   - Host: `@` (for root domain) or `app` (for subdomain)
   - Value: Your EC2 public IP (e.g., `13.244.123.45`)
   - TTL: `300` (5 minutes)

Wait 5-30 minutes for DNS propagation.

### Step 2: Install SSL Certificate (Let's Encrypt)

Connect to EC2:
```bash
ssh -i ~/Downloads/xarra-books-key.pem ubuntu@13.244.123.45
```

Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx -y
```

**Install Nginx on host (to proxy to Docker):**
```bash
sudo apt install nginx -y

# Create Nginx config
sudo nano /etc/nginx/sites-available/xarrabooks
```

Paste:
```nginx
server {
    listen 80;
    server_name xarrabooks.com www.xarrabooks.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/xarrabooks /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Get SSL certificate:
```bash
sudo certbot --nginx -d xarrabooks.com -d www.xarrabooks.com
```

Follow prompts:
- Enter email
- Agree to ToS
- Choose redirect HTTP to HTTPS

Your site is now live with HTTPS! 🔒

---

## 9. Monitoring and Maintenance

### Basic Monitoring

**Check disk space:**
```bash
df -h
```

**Check memory:**
```bash
free -h
```

**Check container resources:**
```bash
docker stats
```

**View logs:**
```bash
# Last 100 lines
docker logs --tail 100 app-api-1

# Follow logs in real-time
docker logs -f app-api-1
```

### Database Backups

**Manual backup:**
```bash
# Install PostgreSQL client
sudo apt install postgresql-client -y

# Create backup
pg_dump -h xarra-books-db.xxxxxxxxx.af-south-1.rds.amazonaws.com \
  -U postgres -d xarra_books -F c -f backup-$(date +%Y%m%d).dump

# Upload to S3 (optional)
aws s3 cp backup-*.dump s3://your-backup-bucket/
```

**Automated daily backups** (add to crontab):
```bash
crontab -e
```

Add:
```
0 2 * * * /home/ubuntu/app/scripts/backup-database.sh
```

### System Updates

Update monthly:
```bash
sudo apt update && sudo apt upgrade -y
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d
```

---

## 10. Cost Optimization Tips

### Staying Within Free Tier

✅ **Always Free:**
- EC2 t2.micro: 750 hours/month (1 instance)
- RDS db.t3.micro: 750 hours/month
- 30GB EBS storage
- 15GB data transfer out

⚠️ **Avoid These Charges:**
- Running multiple instances simultaneously
- Data transfer over 15GB/month
- EBS snapshots beyond 1GB
- Elastic IPs when not attached to running instance
- RDS backups beyond 20GB

### Reduce Costs

1. **Stop your instance when not in use** (dev environment):
   ```bash
   # From AWS Console: Actions → Instance State → Stop
   ```
   You're only charged for storage, not compute.

2. **Use S3 for file uploads** (5GB free):
   - Store PDFs, images, etc., in S3 instead of EBS

3. **CloudWatch free tier:**
   - 10 custom metrics
   - 1 million API requests
   - 5GB log ingestion

4. **Set billing alerts:**
   - AWS Console → Billing → Billing Preferences
   - Enable "Receive Billing Alerts"
   - Go to CloudWatch → Create Billing Alarm
   - Alert when charges > $10

---

## 11. Troubleshooting

### Application Won't Start

**Check logs:**
```bash
docker logs app-api-1
docker logs app-web-1
```

**Common issues:**
- Database connection failed: Check RDS endpoint and security group
- Port already in use: `sudo netstat -tulpn | grep :80`
- Out of memory: Use `docker stats` to check usage

### Can't Connect to Database

1. **Verify security group allows EC2 → RDS:**
   - RDS security group inbound: Port 5432 from `xarra-web-sg`

2. **Test connection from EC2:**
   ```bash
   sudo apt install postgresql-client -y
   psql -h xarra-books-db.xxxx.rds.amazonaws.com -U postgres -d xarra_books
   ```

3. **Check RDS is running:**
   - AWS Console → RDS → Databases → Status should be "Available"

### Website Not Loading

1. **Check EC2 security group:**
   - Inbound rules include HTTP (80), HTTPS (443)

2. **Check Nginx/containers:**
   ```bash
   sudo systemctl status nginx
   docker ps
   ```

3. **Check EC2 instance is running:**
   - AWS Console → EC2 → Instances → Instance state: Running

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clear Docker cache
docker system prune -a

# Clear old logs
sudo journalctl --vacuum-time=7d
```

### High CPU Usage

```bash
# Check which container is using CPU
docker stats

# Restart containers
docker-compose -f docker-compose.production.yml restart
```

---

## Summary Checklist

- [ ] AWS account created and secured with MFA
- [ ] RDS PostgreSQL database created (`db.t3.micro`)
- [ ] EC2 instance launched (`t2.micro`) with SSH key saved
- [ ] Security groups configured (EC2 ↔ RDS)
- [ ] Docker, Docker Compose, Git, Node.js installed on EC2
- [ ] Repository cloned to EC2
- [ ] `.env.production` configured with correct database URL
- [ ] Docker containers built and running
- [ ] Application accessible via public IP
- [ ] (Optional) Domain pointed to EC2
- [ ] (Optional) SSL certificate installed
- [ ] Billing alert set up
- [ ] Backup strategy implemented

---

## Next Steps

1. **Set up email service** (AWS SES has free tier: 62,000 emails/month)
2. **Configure S3 for file uploads** (5GB free)
3. **Set up AWS CloudWatch** for monitoring
4. **Create AMI snapshot** of configured EC2 for disaster recovery
5. **Configure automated database backups**
6. **Set up CDN** (CloudFront has free tier)

---

## Getting Help

- **AWS Free Tier FAQs:** https://aws.amazon.com/free/
- **AWS Support:** https://console.aws.amazon.com/support/
- **AWS Documentation:** https://docs.aws.amazon.com/

**Need help?** Contact your system administrator or email **info@xarrabooks.com**

---

**Deployment Guide Version:** 1.0.0  
**Last Updated:** March 12, 2026  
**Estimated Setup Time:** 2-3 hours
