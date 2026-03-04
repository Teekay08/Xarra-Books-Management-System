# Xarra Books Management System — Execution Plan

## Project Overview

**What:** A bespoke publishing management system for Xarra Books (South African publisher) covering the complete lifecycle from manuscript to revenue — authors, titles, inventory, consignments, SOR tracking, invoicing, royalties, and multi-channel sales integration.

**Current State:** Xarra runs on WordPress/WooCommerce (xarrabooks.com) + manual spreadsheets. No integrated system exists.

**Target State:** A production system at `app.xarrabooks.com` with real-time operations, automated document generation, channel partner integrations, and an author portal at `authors.xarrabooks.com`.

---

## Tech Stack (Confirmed from Architecture Doc)

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS, shadcn/ui, React Hook Form + Zod |
| State | Zustand (global) + React Query (server) |
| Backend | Node.js 22 LTS, Fastify, Drizzle ORM |
| Database | PostgreSQL 16 (AWS RDS Cape Town) |
| Cache/Queue | Redis (ElastiCache) + BullMQ |
| Auth | Better Auth (JWT + refresh tokens) |
| PDF | Puppeteer (server-side) |
| Email | Resend + React Email |
| Storage | AWS S3 + CloudFront |
| Real-time | Socket.io |
| Desktop (Post-MVP) | Electron 33 + SQLite |
| Monitoring | Sentry + CloudWatch |
| CI/CD | GitHub Actions → ECR → ECS Fargate |
| Monorepo | Turborepo |

---

## Architecture Principles

1. **Modular Monolith** — Clear module boundaries (Authors, Inventory, Finance, Documents), not microservices
2. **Offline-First** (Post-MVP) — Desktop app with SQLite local replica, bidirectional sync
3. **Cloud as Source of Truth** — PostgreSQL in AWS Cape Town (af-south-1)
4. **Audit-Locked Financials** — No deletes, only voids with reason. Append-only royalty ledger
5. **Adapter Pattern for Integrations** — WooCommerce, KDP, Takealot each have a dedicated adapter normalizing to internal `SaleRecord` format
6. **Role-Aware UI** — Admin, Finance, Operations, Editorial, Author Portal (each sees different surfaces)

---

## Database Schema (12+ Core Tables)

| Table | Purpose |
|-------|---------|
| `users` | System users with role assignments |
| `authors` | Author profiles (legal name, pen name, type: HYBRID/TRADITIONAL, encrypted bank details) |
| `author_contracts` | Per-title contracts (royalty rates print/ebook, trigger type, advance amount) |
| `titles` | Publications (ISBN-13, ASIN, RRP, formats, status) |
| `channel_partners` | Bargain Books, Exclusive Books, Takealot, etc. (discount %, SOR days, payment day) |
| `consignments` | Stock dispatches to partners (dispatch/delivery dates, SOR expiry, courier waybill) |
| `consignment_lines` | Per-title quantities per consignment (dispatched/sold/returned, RRP snapshot) |
| `invoices` | INV-YYYY-NNNN with VAT, linked to consignments |
| `sale_records` | Multi-channel sales (channel, source: WEBHOOK/CSV/MANUAL, currency) |
| `inventory_movements` | Full audit trail (type, from/to location, quantity, reference) |
| `royalty_ledger` | Append-only per-author per-title per-period (gross, advance deducted, net payable) |
| `remittances` | Parsed partner payment advices with match status |
| `sync_operations` | Desktop offline sync operation log |

---

## 13 System Modules

1. **Author & Contract Management** — Profiles, contracts (Hybrid vs Traditional), communication log
2. **Publication & Production** — Manuscript → Editorial → Typesetting → Cover → Print → GRN pipeline with per-stage cost tracking
3. **Inventory Management** — Stock levels per title per location (Warehouse, In Transit, Consigned-[Channel], Store, Damaged, Returns Pending)
4. **Channel Partner Management** — Profiles with discount %, SOR terms, payment schedules
5. **Consignment & SOR Tracking** — Full lifecycle: dispatch → delivery → sales reporting → expiry → return → credit note
6. **Sales & Revenue Recognition** — Multi-channel recording with automatic revenue recognition aligned to SOR terms
7. **Financial Ledger & Reconciliation** — Invoices, credit notes, debit notes, payment matching, per-title P&L
8. **Royalty Engine** — Trigger types (Date/Units/Revenue), advance recovery, biannual statements, anti-duplication safeguard
9. **Events Management** — Book launches, festivals, cost/revenue tracking per event
10. **eBook & Digital Sales** — Amazon KDP import, website digital sales, format-specific royalty rates
11. **Reporting & Analytics** — Management dashboard, operational reports, author reports, financial reports
12. **Document Generation** — 20+ document types (INV, CN, DN, PF, SOA, RCP, AINV, ADV, CON, SOR, RA, GRN, SAJ, PKL, royalty statements, contracts, etc.)
13. **System Administration** — Roles/permissions, audit log, configuration, backup

---

## Document Types Generated (20+)

### Financial (8)
- Tax Invoice (INV-) — Auto on consignment dispatch
- Credit Note (CN-) — Auto on confirmed returns
- Debit Note (DN-) — Manual for corrections
- Pro Forma Invoice (PF-) — Manual, converts to INV
- Statement of Account (SOA-) — Scheduled monthly
- Receipt/Remittance Advice (RCP-) — Auto on payment
- Hybrid Author Cost Invoice (AINV-) — Auto per production milestone
- Advance Payment Record (ADV-) — Manual

### Distribution (6)
- Consignment Note (CON-) — Auto on dispatch
- SOR Agreement (SOR-) — Auto per consignment
- Returns Authorisation (RA-) — Manual
- Goods Received Note (GRN-) — Manual on receipt
- Stock Adjustment Note (SAJ-) — Manual
- Packing List (PKL-) — Auto per consignment

### Author & Royalty (6)
- Royalty Statement, Author Contract, Publishing Agreement, Rights Assignment, Author Invoice Summary, Communication Record

---

## 4-WEEK MVP SPRINT PLAN

### Prerequisites (Day 0 — Before Any Code)

**Xarra Must Provide:**
- All existing author contracts (physical or scanned)
- Channel partner discount percentages and SOR terms for every partner
- A sample remittance advice from at least one partner
- Company logo, letterhead, branding assets
- VAT number and registration details
- List of all active titles (title, author, ISBN, RRP, format, stock on hand)
- An existing invoice/statement they currently send
- Nominated decision-maker available daily (30-60 min/day)

**Developer Must Have Ready:**
- AWS account created (af-south-1 Cape Town), billing alerts configured
- GitHub private repository with branch protection on main
- Domains registered: `app.xarrabooks.com` and `authors.xarrabooks.com`
- Claude Max subscription active
- Node.js 22 LTS installed locally
- Docker Desktop installed (local PostgreSQL + Redis)
- Resend account created
- Decision on invoice numbering (continue existing series or start fresh)

---

### WEEK 1: Foundation & Infrastructure (Days 1-5)

**Goal:** Developer can log in to a live system at app.xarrabooks.com

#### Day 1 (Monday) — Project Scaffold
- [ ] Monorepo scaffold with Turborepo: `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- [ ] Docker Compose: PostgreSQL 16 + Redis + API locally
- [ ] Fastify API skeleton with health check endpoint
- [ ] Drizzle ORM connected to local PostgreSQL

#### Day 2 (Tuesday) — Cloud Infrastructure
- [ ] AWS: RDS PostgreSQL + ElastiCache Redis provisioned in af-south-1
- [ ] AWS S3 bucket for documents + CloudFront distribution
- [ ] GitHub Actions CI/CD pipeline (lint → test → deploy to staging)
- [ ] Environment config (.env schema) — local, staging, production

#### Day 3 (Wednesday) — Database Schema [CRITICAL]
- [ ] **Full database schema written in Drizzle** — all 12+ tables, all relationships, all indexes
- [ ] First migration run against staging RDS
- [ ] Schema review with Xarra decision-maker — confirm fields match real business data

#### Day 4 (Thursday) — Auth & App Shell
- [ ] Authentication: Better Auth, JWT, refresh tokens, email/password login
- [ ] Role-based access control middleware (Admin, Finance, Operations, Editorial)
- [ ] React app scaffold: Vite, Tailwind, shadcn/ui, React Router v7
- [ ] App shell: sidebar navigation, header, layout components

#### Day 5 (Friday) — Deploy & Demo
- [ ] Login page, dashboard skeleton (empty state)
- [ ] Production ECS Fargate deployment live
- [ ] SSL certificate, custom domain app.xarrabooks.com
- [ ] **Week 1 demo to Xarra** — confirm domain, login, look-and-feel direction

**Deliverables:** Live URL, working login, database schema live, CI/CD pipeline, role-based auth

---

### WEEK 2: Core Data & Operations (Days 6-10)

**Goal:** Enter 5 real authors and 10 real titles. System holds real Xarra data.

#### Day 6 (Monday) — Authors
- [ ] Author management: full API (CRUD), service layer, Zod validation
- [ ] Author list page + create/edit form UI
- [ ] Author contract model: royalty rates, trigger type, advance amount

#### Day 7 (Tuesday) — Titles
- [ ] Title/publication management: API + service layer
- [ ] Title list, create/edit form, author linking UI
- [ ] Title production cost tracking (editorial, typesetting, cover, print)
- [ ] Begin entering real title data from Xarra spreadsheet

#### Day 8 (Wednesday) — Channel Partners
- [ ] Channel partner management: profiles, discount %, SOR terms, payment day
- [ ] Channel partner list + configuration form UI
- [ ] Enter all channel partners with real terms
- [ ] Xarra review: are all partner terms captured correctly?

#### Day 9 (Thursday) — Inventory
- [ ] Inventory module: stock levels per title per location, movement recording
- [ ] Inventory dashboard: stock on hand per title, location breakdown
- [ ] Manual stock adjustment with notes and reason codes
- [ ] Enter current stock on hand from Xarra spreadsheet

#### Day 10 (Friday) — Search, Dashboard & Demo
- [ ] Global search: find authors, titles, partners by name or ISBN
- [ ] Dashboard with real data: title count, author count, stock summary
- [ ] All authors entered with contract details
- [ ] **Week 2 demo** — Xarra sees their own real data in the system

**Deliverables:** All authors entered, all titles with ISBNs, all channel partners configured, current stock levels live, production costs tracked

---

### WEEK 3: Finance & Documents (Days 11-15)

**Goal:** Generate a real Xarra invoice PDF and send it by email from the system.

#### Day 11 (Monday) — Invoice Engine
- [ ] Invoice service: create, number (INV-YYYY-NNNN), line items, VAT calculation
- [ ] Credit note service: linked to invoices, quantity-controlled
- [ ] Idempotency key middleware for all financial write endpoints
- [ ] Xarra review: VAT treatment on invoices to channel partners

#### Day 12 (Tuesday) — PDF & Email [CRITICAL]
- [ ] Puppeteer PDF engine: invoice template with Xarra branding, logo, address, VAT number
- [ ] BullMQ job worker for async PDF generation + S3 upload
- [ ] Resend email integration: send PDF as attachment to partner email

#### Day 13 (Wednesday) — Royalty Engine [CRITICAL — DO NOT RUSH]
- [ ] Royalty calculation engine (unit tests FIRST, then implementation)
- [ ] All trigger types: Date-based, Unit threshold, Revenue milestone
- [ ] Advance recovery tracking: recoupment ledger per author per title
- [ ] Developer walks Xarra through calculated royalties for 2-3 real authors — **Xarra must confirm numbers match**

#### Day 14 (Thursday) — Payments & UI
- [ ] Payment recording API: match payment to invoice, partial payment support
- [ ] Invoice list + create invoice UI + invoice detail view
- [ ] Payment recording form: partner, amount, date, bank reference
- [ ] Statement of Account generation (PDF via Puppeteer)

#### Day 15 (Friday) — P&L & Demo
- [ ] Per-title P&L calculation: revenue minus all cost lines
- [ ] Finance dashboard: outstanding invoices, total revenue, aged debtors
- [ ] **Send a real test invoice to Xarra's email** — branding correct? Numbers correct? Layout matches existing invoices?

**Deliverables:** Invoice generation + PDF, email dispatch live, credit notes, payment recording, royalty engine verified, per-title P&L

---

### WEEK 4: Consignments, SOR & Go-Live (Days 16-20)

**Goal:** Xarra creates their first real consignment in the live system.

#### Day 16 (Monday) — Consignment Creation
- [ ] Consignment creation API: titles, quantities, channel partner, dispatch date
- [ ] Inventory deduction on dispatch: warehouse → in transit → consigned
- [ ] Auto-generate Consignment Note (CON-) PDF + SOR Agreement (SOR-) PDF on creation

#### Day 17 (Tuesday) — SOR Lifecycle
- [ ] SOR lifecycle: delivery confirmation, expiry date calculation, automated alert scheduler
- [ ] Sales reporting against consignment: update sold qty, trigger revenue recognition
- [ ] Consignment dashboard: active SORs with days remaining, expiry countdown

#### Day 18 (Wednesday) — Returns & Remittance
- [ ] Return workflow: Returns Authorisation (RA-), GRN on receipt, credit note generation
- [ ] Manual remittance capture form: partner, amount, invoice references, credits applied
- [ ] Basic remittance matching: flag matched vs unmatched invoice lines

#### Day 19 (Thursday) — Alerts & Data Migration
- [ ] SOR expiry email alerts: automated BullMQ job sends warning 14 days before expiry
- [ ] Per-partner view: all consignments, invoices, payments, open balance in one place
- [ ] Enter all currently active consignments (real data from Xarra spreadsheets)
- [ ] Xarra verifies: active consignment balances match current records

#### Day 20 (Friday) — GO-LIVE
- [ ] Final production deployment. All real data verified. Staff trained on core workflows
- [ ] Xarra creates first real consignment in the live system
- [ ] Xarra generates first real invoice to a real channel partner
- [ ] **Go-live sign-off** — then immediately plan Weeks 5-8

**Deliverables:** Consignment lifecycle, SOR tracking + alerts, return workflow, manual remittance capture, all core documents, staff trained, **LIVE IN PRODUCTION**

---

## POST-MVP (Weeks 5-8)

### Week 5: Channel Integrations
- **WordPress/WooCommerce Integration** — Webhook on `order.completed`, WooAdapter normalizes to SaleRecord, auto-deducts inventory
- **Takealot Integration** (3 days) — Bidirectional REST API at `seller-api.takealot.com`:
  - API client with Key auth, rate limiting, exponential backoff
  - Webhook receiver for `sales_status_changed` events
  - Dual ingestion: webhook (real-time) + polling (every 4 hours safety net)
  - Stock level push to Takealot on every inventory change (CRITICAL — overselling risk)
  - Settlement report import + reconciliation
  - Inventory locations: XARRA_WAREHOUSE, IN_TRANSIT_TAKEALOT, TAKEALOT_WAREHOUSE, SOLD_TAKEALOT, RETURNED_FROM_TAKEALOT
  - Supports both Lead Time (Takealot warehouses) and Drop Ship (Xarra ships) models
- **Amazon KDP Import** — Monthly CSV upload, ASIN matching, USD→ZAR conversion, duplicate period check
- **Biannual Royalty Statements** — Automated generation and email dispatch for all authors

### Week 6: Automation & Desktop
- **Remittance Parser** — PDF/CSV/Email parsing (pdf-parse + AWS Textract for OCR), confidence scoring, manual review for low-confidence extractions
- **Offline Desktop App** — Electron + SQLite, event-sourcing-lite sync with operation log, conflict resolution UI for financial data
- **Events Management** — Book launches, festivals, budget tracking, promotional stock allocation

### Week 7: Author Portal & Stock
- **Author Portal** at `authors.xarrabooks.com` — Read-only: sales dashboard, royalty statements, payment history, advance recovery status, contract view
- **Stock Take Module** — Physical count entry, variance report, adjustment workflow

### Week 8: Reporting & Polish
- **Advanced Reporting Suite** — Channel performance, per-title P&L ranking, royalty payment schedule, aged debtors, management dashboards with Recharts + Tremor
- **Full document template suite** completion for all 20+ document types

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Xarra stakeholder unavailable for decisions | HIGH | HIGH | Nominate one person, daily 30-min check-in at 9am, defaults applied if no same-day answer |
| Royalty calculations don't match existing records | MED | HIGH | Full Day 13 allocated to verification, test with real historical figures, no deploy without sign-off |
| AWS infrastructure setup takes longer than expected | MED | MED | Terraform scripts on Day 1, Railway.app as fast fallback |
| PDF templates don't match existing format | LOW | MED | Existing invoice PDF provided Day 0, exact match, review Friday Week 3 |
| Existing data in spreadsheets is incomplete | HIGH | MED | Data cleaning is Xarra's responsibility in Week 2, flag missing fields early |
| Scope creep — "can we also add X?" | HIGH | MED | Everything not in Weeks 1-4 goes to post-MVP backlog immediately, no exceptions |
| Domain/DNS/email verification delays | MED | LOW | Register domain and begin DNS propagation Day 0, start Resend verification immediately |

---

## Key Business Rules to Enforce in Code

1. **Financial records are immutable** — No deletes, only void + recreate with audit trail
2. **Royalty payments require dual confirmation** — Period-locked, append-only ledger, unique payment reference
3. **Credit notes only against confirmed returns** — Must have RA → GRN → CN chain
4. **Stock push to Takealot on every inventory change** — Overselling = account suspension
5. **Idempotency keys on all financial writes** — UUID header, 24h expiry, prevent double-submission
6. **Advance must be fully recouped before royalties become payable** (Traditional authors)
7. **Webhook deduplication** — Use external order ID as unique key, same order never recorded twice
8. **Revenue recognition** — Only when status = Dispatched/Delivered (not on placement)
9. **Audit log is append-only** — Even admins cannot delete entries

---

## Success Criteria

- **Week 1:** Developer can log in at app.xarrabooks.com
- **Week 2:** 5+ real authors and 10+ real titles in the system
- **Week 3:** A real, branded invoice PDF sent by email
- **Week 4:** First real consignment created in production by Xarra staff
- **Week 5+:** Automated sales capture from WooCommerce, Takealot, and KDP

---

*Prepared March 2026 — Based on Xarra Books System Design, Technical Architecture, 4-Week Sprint Plan, and Takealot Integration Specification documents.*
