# Xarra Books Management System — User Manual

**Version 0.2.0**  
*"We mainstream the African book"*

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Admin Portal](#2-admin-portal)
3. [Partner Portal](#3-partner-portal)
4. [Author Portal](#4-author-portal)
5. [Desktop App and Offline Use](#5-desktop-app-and-offline-use)
6. [Appendix](#6-appendix)

---

## 1. Getting Started

### 1.1 Overview

The Xarra Books Management System is a comprehensive publishing management platform for Xarra Books. It covers the full lifecycle of book publishing operations — from catalog and author management, through inventory and sales, to financial documents, royalties, and channel partner integration.

The system is divided into three portals:

| Portal | URL | Who Uses It |
|--------|-----|-------------|
| **Admin Portal** | `/` | Xarra Books staff (Admin, Finance, Operations, Editorial, Reports Only) |
| **Partner Portal** | `/partner` | Channel partners such as bookstores and distributors |
| **Author Portal** | `/portal` | Published authors |

All monetary values are in **South African Rand (ZAR)** and displayed as `R X,XXX.XX`. The standard VAT rate is **15%**.

---

### 1.2 Logging In

#### Admin & Staff Login

1. Navigate to the login page.
2. Select your **Role** from the dropdown (Admin, Finance, Operations, Editorial, Author, Reports Only).
3. Enter your **Email** and **Password**.
4. Click **Sign In**.

> Your selected role must match the role assigned to your account. If you select the wrong role, login will fail.

> Authors are automatically redirected to the Author Portal after login.

#### Partner Portal Login

1. Navigate to `/partner/login`.
2. Enter your **Email** and **Password**.
3. Click **Sign In**.

> Partner portal credentials are separate from admin credentials. Contact your Xarra Books administrator if you need access.

#### Forgot Password

1. Click **Forgot password?** on the login page.
2. Enter your email address and click **Send Reset Link**.
3. Check your inbox for a password reset email.
4. Click the link and enter your new password (minimum 8 characters).
5. You will be redirected to the login page after a successful reset.

---

### 1.3 User Roles & Permissions

The system has six roles, each with different levels of access:

| Role | Description |
|------|-------------|
| **Admin** | Full access to all features. Can create, read, update, delete, void, approve, and export across all modules. |
| **Finance** | Full access to financial modules (invoices, payments, credit/debit notes, remittances, expenses, statements, quotations, purchase orders, expense claims). Read-only access to catalog and operations. Can approve consignments, returns, and expense claims. |
| **Operations** | Full access to partners, inventory, consignments, returns, partner portal management, courier shipments, and cash sales. Read-only access to finance modules. |
| **Editorial** | Full access to authors and titles. Read-only on all other modules. |
| **Author** | Read-only access to own profile, titles, statements, and reports. |
| **Reports Only** | Read-only access to everything. Can export reports. |

---

### 1.4 Navigation

The Admin Portal uses a left sidebar for navigation, organised into the following groups:

- **Dashboard** — System overview
- **Catalog** — Authors, Titles
- **Operations** — Channel Partners, Inventory, Consignments, SOR Pro-formas, Returns, Sync
- **Partner Portal** — Portal Users, Partner Book Orders, Return Requests, Courier Shipments
- **Finance** — Quotations, Invoices, Supplier Orders, Credit Notes, Debit Notes, Payments, Remittances, Expenses, Statements
- **Sales** — Cash Sales
- **Procurement** — Expense Claims, Requisitions
- **Analytics** — Reports
- **Admin** — Settings, User Management, Scheduling, Data Export, Audit Trail, Deletion Requests

On mobile devices, tap the **☰ hamburger menu** in the top-left corner to open the sidebar. The sidebar closes automatically when you navigate to a new page.

---

## 2. Admin Portal

### 2.1 Dashboard

The dashboard provides a real-time overview of business performance.

**Financial Summary (top row):**

| Card | What It Shows |
|------|---------------|
| Revenue YTD | Total revenue for the current year, with month-to-date below |
| Expenses YTD | Total expenses for the current year, with month-to-date below |
| Net Profit YTD | Revenue minus expenses (green if positive, red if negative) |
| Outstanding | Total value of unpaid invoices |

**Operational Stats (clickable cards):**

Eight cards showing: Total Titles, Active Authors, Channel Partners, Total Stock, Open POs, Cash Sales MTD, Pending Claims, and Partner Orders. Clicking any card navigates to the relevant module.

**Charts:**

- **Revenue Over Time** — Monthly bar chart showing revenue trends.
- **Expenses by Category** — Donut chart breaking down expenses by category for the current year.

**Bottom Section:**

- **Overdue Invoices** — Table showing partner name, amount owed, and days overdue.
- **Recent Activity** — Feed of the latest actions in the system.

---

### 2.2 Authors

**Catalog → Authors**

#### Viewing Authors

The authors list displays all registered authors in a searchable table:

| Column | Description |
|--------|-------------|
| Legal Name | The author's full legal name |
| Pen Name | Publishing name (if different) |
| Type | HYBRID or TRADITIONAL (shown as a badge) |
| Email | Contact email |
| Status | Active or Inactive |

- Use the **search bar** to filter by name or email.
- Click **Export CSV** to download the full list.
- Click any row to view author details.

#### Adding an Author

1. Click **+ Add Author**.
2. Fill in the required fields:
   - **Legal Name** (required)
   - **Pen Name** (optional)
   - **Type** — Select Hybrid or Traditional (required)
   - **Email**, **Phone**, **Tax Number** (optional)
   - **Address** — Street, City, Province, Postal Code, Country
   - **Notes** — Free-text notes
   - **Active** — Toggle on/off
3. Click **Save**.

> The system warns you if you try to navigate away with unsaved changes.

#### Author Details

The detail view shows:

- **Details Card** — Type, email, phone, status.
- **Address Card** — Full postal address.
- **Contracts Section** — All publishing contracts for this author (see below).
- **Edit** and **Deactivate** buttons.

#### Managing Contracts

From an author's detail page:

1. Click **+ Add Contract**.
2. Fill in:
   - **Title** — Select from the dropdown (required)
   - **Print Royalty %** — Royalty rate for print sales (required)
   - **Ebook Royalty %** — Royalty rate for ebook sales
   - **Trigger Type** — When royalties start: Date, Units sold, or Revenue threshold
   - **Trigger Value** — The numeric trigger threshold
   - **Advance Amount** — Upfront advance paid to the author (ZAR)
   - **Start Date** (required), **End Date**
   - **Signed** — Whether the contract has been signed
3. Click **Save**.

Each contract card shows the title, royalty rates, advance amount, and signed/unsigned status.

---

### 2.3 Titles

**Catalog → Titles**

#### Viewing Titles

| Column | Description |
|--------|-------------|
| Title | Book title and subtitle |
| Author | Pen name or legal name |
| ISBN-13 | International Standard Book Number |
| RRP | Recommended Retail Price in ZAR |
| Formats | PRINT, EBOOK, PDF (shown as badges) |
| Status | PRODUCTION, ACTIVE, or OUT OF PRINT |

- Use the **search bar** to filter by title or ISBN.
- Click **Export CSV** to download.

#### Adding a Title

1. Click **+ Add Title**.
2. Fill in:
   - **Title** (required)
   - **Subtitle**
   - **Author** — Searchable dropdown (required)
   - **ISBN-13**, **ASIN**
   - **RRP** (required), **Cost Price** (both in ZAR)
   - **Status** — Production, Active, or Out of Print
   - **Formats** — Check one or more: Print, Ebook, PDF
   - **Publish Date**, **Page Count**, **Weight (g)**
   - **Cover Image URL**
   - **Description** — Blurb or synopsis
3. Click **Save**.

#### Title Details

The detail page shows:

- **Book Details** — ISBN, ASIN, RRP, cost price, formats, status, publish date, pages, weight, primary author.
- **Description** — The book blurb.
- **Production Costs** — Table of costs (category, description, vendor, amount) with total. Use the **+ Add Cost** button to add a new production cost with category (Editorial, Typesetting, Cover, Print, ISBN, Other), description, amount, vendor, and paid date. Each cost entry has a **Delete** button to remove it.
- **Print Runs** — Track print runs for this title. Each print run is automatically numbered sequentially per title (Run #1, #2, #3, etc.). Use the **+ New Print Run** button to record a new print run (see below).

#### Recording a Print Run

1. On the title detail page, find the **Print Runs** card.
2. Click **+ New Print Run**.
3. Enter:
   - **Printer Name** — The printing company (required).
   - **Quantity Ordered** — Number of copies ordered (required).
   - **Total Cost** — Total print cost in ZAR (required).
   - **Expected Delivery Date** — When you expect the books.
   - **Notes** — Any additional details.
4. Click **Create Print Run**. A Goods Received Note number (GRN-YYYY-NNNN) is automatically assigned, and a sequential print run number for this title is allocated (e.g., if this is the third print run for the title, it will be Run #3).

#### Receiving a Print Run

1. When books arrive, click **Mark Received** on the print run row.
2. Enter the **Quantity Received** (may differ from ordered — e.g. if copies were damaged in transit).
3. Optionally add **Notes** about the receipt.
4. Click **Confirm Receipt**.
5. The received quantity is automatically added to your **Xarra Warehouse** inventory. If the quantity received is less than ordered, the status changes to **PARTIAL**; otherwise it becomes **RECEIVED**.

**Print Run Statuses:**

| Status | Meaning |
|--------|---------|
| ORDERED | Print run placed with the printer |
| IN_PRODUCTION | Currently being printed |
| SHIPPED | Books shipped from the printer |
| RECEIVED | All copies received at warehouse |
| PARTIAL | Fewer copies received than ordered |
| CANCELLED | Print run cancelled |

---

### 2.4 Channel Partners

**Operations → Channel Partners**

Channel partners are bookstores, distributors, or other entities that sell Xarra Books titles.

#### Partner List

| Column | Description |
|--------|-------------|
| Partner Name | Business name |
| Discount % | The discount this partner receives off RRP |
| Contact | Contact person name |
| Email | Contact email |
| Payment Terms | Number of days for payment |
| Status | Active or Inactive |

#### Adding a Partner

1. Click **+ Add Partner**.
2. Fill in:
   - **Partner Name** (required)
   - **Discount %** (required)
   - **SOR Days** — Sale or Return period in days
   - **Payment Terms** — Days until invoice payment is due
   - **Payment Day** — Specific day of month payments are processed (1–31)
   - **Contact Name**, **Contact Email**, **Contact Phone**
   - **Remittance Email** — Email for remittance advices
   - **Address** — Full postal address
   - **VAT Number**
   - **Notes**
   - **Active** — Toggle
3. Click **Save**.

#### Partner Details & Branches

The detail view shows partner information, contact details, address, notes, and a **Branches** section.

**To add a branch:**

1. Click **Add Branch**.
2. Fill in: Branch Name, Code, Contact Name, Contact Email, Address, City, Province, Postal Code.
3. Click **Save**.

Branches appear in a table with name, code, city, contact, and status.

---

### 2.5 Inventory

**Operations → Inventory**

#### Stock Overview

The inventory dashboard shows current stock levels for all titles:

| Column | Description |
|--------|-------------|
| Title | Book title |
| ISBN-13 | ISBN number |
| Total In | Total units received (green) |
| Total Out | Total units dispatched/sold (red) |
| Stock on Hand | Current stock level. Red if ≤0, amber if <10 |

- Use **search** to filter by title or ISBN.
- Click **Export Inventory CSV** for a stock snapshot.
- Click **Export Movements CSV** to download stock movement history (with date range selection).
- Click any row to view the full movement history for that title.

#### Receiving Stock

1. Click **+ Receive Stock**.
2. Select the title.
3. Enter the quantity received.
4. Select the location (e.g., Xarra Warehouse).
5. Add any notes.
6. Click **Save**.

#### Adjusting Stock

1. Click **Adjust Stock**.
2. Select the title and location.
3. Enter the adjustment quantity (positive or negative).
4. Select a reason (e.g., Damaged, Write-off).
5. Click **Save**.

**Inventory Locations:**

| Location | Description |
|----------|-------------|
| Xarra Warehouse | Main storage facility |
| Xarra Store | Retail shop stock |
| In Transit | Stock dispatched but not yet delivered |
| In Transit (Takealot) | Stock being sent to Takealot |
| Takealot Warehouse | Stock held at Takealot |
| Damaged | Damaged units |
| Returns Pending | Stock awaiting return processing |

---

### 2.6 Consignments

**Operations → Consignments**

Consignments track books sent to partners on a sale-or-return (SOR) basis.

#### Consignment List

| Column | Description |
|--------|-------------|
| Partner | Channel partner name |
| Dispatch Date | Date stock was dispatched |
| SOR Expiry | Sale-or-return expiry date. Red if ≤14 days, amber if ≤30 days |
| Items | Books sold vs. total dispatched |
| Status | DRAFT, DISPATCHED, DELIVERED, PARTIAL, CLOSED |

**Actions** (via ⋮ menu): View Details, Download PDF, Print.

#### Creating a Consignment

1. Click **+ New Consignment**.
2. Select the **Partner** (searchable dropdown, or create a new partner inline).
3. Set **Dispatch Date**, **Partner PO Number**, **Courier**, **Waybill #**.
4. **Add Line Items:**
   - Search and select a title.
   - Enter the quantity.
   - Repeat for additional titles.
5. Click **Save** (creates as DRAFT) or **Dispatch** (sets to DISPATCHED and deducts inventory).

> Consignments can also be auto-created from a partner order in the Partner Portal management section.

---

### 2.7 SOR Pro-formas

**Operations → SOR Pro-formas**

Pro-forma documents are automatically generated alongside consignments. They serve as the sale-or-return agreement documentation.

| Column | Description |
|--------|-------------|
| Pro-forma # | Document number (PF-XXXX format) |
| Partner | Channel partner |
| Partner PO | Partner's purchase order reference |
| Dispatch Date | When stock was sent |
| SOR Expiry | Return deadline. Shows "Expired" if past |
| Titles / Copies | Count of unique titles and total copies |
| Status | Matches the consignment status |

**Actions**: View Details, Download PDF, Print, Send Email.

---

### 2.8 Returns

**Operations → Returns**

Returns track stock being returned from partners.

#### Returns List

| Column | Description |
|--------|-------------|
| Number | Returns Authorisation number (RA-XXXX) |
| Partner | Returning partner |
| Reason | Reason for return |
| Items | Number of line items |
| Status | Current workflow status |
| Date | Return date |

**Return Statuses:**

| Status | Meaning |
|--------|---------|
| DRAFT | Return being prepared |
| AUTHORIZED | Approved for return |
| IN TRANSIT | Stock in transit back to Xarra |
| RECEIVED | Stock received at warehouse |
| INSPECTED | Stock inspected for condition |
| VERIFIED | Quantities and condition confirmed |
| PROCESSED | Return fully processed, credit/stock adjustments done |

#### Creating a Return

1. Click **Create Return**.
2. Select the **Partner**.
3. Select the **Reason** for the return.
4. Add line items (title and quantity).
5. Click **Save**.

---

### 2.9 Sync (Channel Integrations)

**Operations → Sync**

The sync module connects to external sales channels to import sales data.

#### Supported Platforms

| Platform | Sync Method |
|----------|-------------|
| **Takealot** | Automatic via API, or manual CSV import |
| **WooCommerce** | Automatic via API key |
| **Amazon KDP** | Manual CSV import (with exchange rate for currency conversion) |

#### Running a Sync

**API sync (Takealot/WooCommerce):**

1. Click the **Sync** button on the platform card.
2. The system fetches the latest sales data.
3. Progress is shown in the sync history table.

**CSV import (Takealot/KDP):**

1. Click **Import CSV** on the platform card.
2. Upload your CSV file.
3. For KDP, enter the current exchange rate (USD → ZAR).
4. Click **Import**.

#### Sync History

| Column | Description |
|--------|-------------|
| Platform | Which channel was synced |
| Status | RUNNING, COMPLETED, PARTIAL, FAILED |
| Processed | Total records processed |
| Created | New sales imported |
| Skipped | Duplicates skipped |
| Errors | Records that failed |
| Started | Timestamp |

Click any row to expand error details.

---

### 2.10 Quotations

**Finance → Quotations**

Quotations are formal price quotes sent to partners before an order is placed.

| Column | Description |
|--------|-------------|
| Number | Quotation number |
| Partner | Recipient partner |
| Total | Quoted total amount |
| Status | DRAFT, SENT, ACCEPTED, EXPIRED, CONVERTED |
| Date | Creation date |
| Valid Until | Expiry date |

**Actions** (via ⋮ menu):
- **Edit** — Modify a DRAFT quotation.
- **Convert to Invoice** — Available when status is ACCEPTED. Creates an invoice from the quotation.
- **Print** — Print the quotation.
- **Delete** — Remove a DRAFT quotation.

---

### 2.11 Invoices

**Finance → Invoices**

#### Invoice List

| Column | Description |
|--------|-------------|
| Invoice # | Sequential number (INV-XXXX format, monospace) |
| Partner | Billed partner |
| Date | Invoice date |
| Due Date | Payment deadline (shown in red if overdue) |
| Total | Invoice total |
| Status | DRAFT, ISSUED, PAID, PARTIAL, VOIDED |

- Filter by **Status** using the dropdown.
- **Search** by invoice number or partner name.
- **Export CSV** with optional date range.

**Actions** (via ⋮ menu): View Details, Download PDF, Print, Void (DRAFT only).

#### Creating an Invoice

1. Click **+ Create Invoice**.
2. Select the **Partner** (searchable dropdown, or create new).
3. Set the **Invoice Date**.
4. Choose **Payment Terms** (7, 14, 30, or 60 days, or Custom).
5. Toggle **Tax Inclusive** if prices include VAT.
6. **Add Line Items:**
   - Select a title (auto-fills price and description).
   - Edit the Description, Quantity, Unit Price, and Discount % as needed.
   - Click **+ Add Line** for additional items.
7. Review the auto-calculated **Subtotal**, **VAT (15%)**, and **Total**.
8. Click **Save** (DRAFT) or **Issue** (ISSUED).

> The system prevents duplicate invoice submissions using idempotency protection.

#### Emailing an Invoice

1. From the invoice detail, click **Send Email**.
2. A compose window opens with:
   - **To**, **CC**, **BCC** fields (pre-filled with partner email).
   - **Subject** and **Message** (pre-filled with template text).
   - **Preview** tab showing the PDF.
3. Click **Send**.

---

### 2.12 Supplier Orders (Purchase Orders)

**Finance → Supplier Orders**

Purchase orders are used to order stock from print suppliers.

| Column | Description |
|--------|-------------|
| PO # | Purchase order number (PO-XXXX) |
| Supplier | Print supplier or vendor |
| Order Date | Date the order was placed |
| Expected Delivery | Anticipated delivery date |
| Total | Order total |
| Status | DRAFT, ISSUED, RECEIVED, PARTIAL, CLOSED, CANCELLED |

**Actions**: View Details, Edit (DRAFT only), Print, Delete (DRAFT only).

#### Creating a Purchase Order

1. Click **+ Create PO**.
2. Select or enter the **Supplier**.
3. Set the **Order Date** and **Expected Delivery** date.
4. Add line items (title, quantity, unit price).
5. Click **Save**.

---

### 2.13 Credit Notes

**Finance → Credit Notes**

Credit notes are issued to partners to reduce amounts owed — typically for returns, overcharges, or corrections.

| Column | Description |
|--------|-------------|
| Number | Credit note number (CN-XXXX) |
| Invoice | The original invoice this relates to |
| Partner | The partner receiving the credit |
| Reason | Reason for the credit |
| Total | Credit amount |
| Status | ACTIVE or VOIDED |
| Date | Date issued |

**Actions**: View Details, Download PDF, Void.

#### Creating a Credit Note

1. Click **New Credit Note**.
2. Select the **Partner** and optionally link to an **Invoice**.
3. Enter the **Reason**.
4. Add line items (description, quantity, amount).
5. Click **Save**.

---

### 2.14 Debit Notes

**Finance → Debit Notes**

Debit notes increase the amount a partner owes — typically for additional charges, penalties, or corrections.

| Column | Description |
|--------|-------------|
| Number | Debit note number (DN-XXXX) |
| Partner | The partner being debited |
| Reason | Reason for the debit |
| Total | Debit amount |
| Status | ACTIVE or VOIDED |
| Date | Date issued |

**Actions**: View Details, Download PDF, Void.

---

### 2.15 Payments

**Finance → Payments**

Track payments received from partners against invoices.

| Column | Description |
|--------|-------------|
| Date | Payment date |
| Partner | Paying partner |
| Amount | Payment amount (green) |
| Bank Reference | EFT or bank reference number |
| Method | Payment method used |
| Allocated | Number of invoices the payment is allocated to, or "Unallocated" |

**Actions**: View Details, Edit Payment, Delete (only if no allocations).

#### Recording a Payment

1. Click **+ Record Payment**.
2. Select the **Partner**.
3. Enter the **Amount**, **Date**, **Bank Reference**, and **Method**.
4. Allocate the payment to one or more outstanding invoices.
5. Click **Save**.

---

### 2.16 Remittances

**Finance → Remittances**

Remittances are payment advices submitted by partners through the Partner Portal, indicating they have made a payment.

| Column | Description |
|--------|-------------|
| Partner | Submitting partner |
| Reference | Remittance reference number |
| Amount | Stated payment amount |
| Status | PENDING, UNDER REVIEW, APPROVED, MATCHED, DISPUTED |
| Date | Submission date |

> "Remittances are submitted by partners via the partner portal."

**Actions**: View Details, Approve, Dispute.

---

### 2.17 Expenses

**Finance → Expenses**

Track business expenses with categorisation.

| Column | Description |
|--------|-------------|
| Date | Expense date |
| Category | Expense category (badge) |
| Description | What the expense was for |
| Amount | Cost |
| Method | Payment method (CASH, CARD, EFT, etc.) |
| Reference | Payment or receipt reference |

**Actions**: View Details, Edit, Delete.

- Click **Categories** to manage expense categories (add, rename, remove).
- Click **Record Expense** to add a new expense.
- **Export CSV** with date range.

---

### 2.18 Statements

**Finance → Statements**

Statements are compiled monthly and sent to partners showing all transactions in a period.

#### Compiling Statements

1. On the **Compile Statements** tab, select the **Month** and **Year**.
2. Click **Compile**. The system generates a statement batch covering all partners with transactions in that period.

#### Statement Batch Workflow

Batches progress through these stages:

| Stage | What Happens |
|-------|-------------|
| **DRAFT** | Statements compiled. Review individual items. |
| **REVIEWED** | All items checked. Ready for approval. |
| **APPROVED** | Authorised for sending. |
| **SENDING** | Emails being sent. |
| **SENT** | All statements delivered. |

#### Managing a Batch

Each batch contains items (one per partner/branch). For each item you can:

- **Exclude/Include** — Remove a partner from this batch or add them back.
- **Edit Recipient** — Change the email address.
- **Preview** — View the statement PDF.

**Send Types:**

| Type | Description |
|------|-------------|
| Direct | Sent directly to the partner |
| Branch | Sent to a specific branch |
| HQ Consolidated | Consolidated statement sent to head office |

---

### 2.19 Cash Sales

**Sales → Cash Sales**

Record direct sales from the Xarra Books store.

| Column | Description |
|--------|-------------|
| Sale # | Sale number (CS-XXXX) |
| Customer | Customer name, or "Walk-in" for anonymous sales |
| Date | Sale date |
| Payment Method | CASH, CARD, EFT, or MOBILE |
| Total | Sale total |

- Filter by **Payment Method** using the dropdown.
- **Search** by sale number or customer.
- **Export CSV** with date range.

---

### 2.20 Expense Claims

**Procurement → Expense Claims**

Staff members submit expenses for reimbursement.

| Column | Description |
|--------|-------------|
| Claim # | Claim number (EC-XXXX) |
| Claimant | Person who submitted the claim |
| Date | Submission date |
| Total | Claimed amount |
| Status | DRAFT, SUBMITTED, APPROVED, REJECTED, PAID |

**Actions**: View Details, Edit (DRAFT only), Delete (DRAFT only).

#### Expense Claim Workflow

1. **DRAFT** — Claimant is preparing the claim.
2. **SUBMITTED** — Sent for approval.
3. **APPROVED** / **REJECTED** — Manager decision.
4. **PAID** — Reimbursement processed.

---

### 2.21 Requisitions

**Procurement → Requisitions**

Formal requests for purchases or procurement.

| Column | Description |
|--------|-------------|
| Req # | Requisition number (REQ-XXXX) |
| Requested By | Person submitting the request |
| Department | Requesting department |
| Required By | Date the items are needed |
| Estimate | Estimated cost |
| Status | DRAFT, SUBMITTED, APPROVED, REJECTED, ORDERED |

---

### 2.22 Reports

**Analytics → Reports**

The reports dashboard offers 12 report types across four categories:

#### Financial Reports

| Report | Description |
|--------|-------------|
| **Profit & Loss** | Revenue vs. expenses breakdown for a selected period |
| **Cash Flow Analysis** | Cash inflows and outflows over time |
| **Tax & VAT Report** | VAT collected, VAT paid, and net VAT position |
| **Expense Trends** | Expense patterns and trends over time |
| **Overdue Aging** | Aging analysis of unpaid invoices by period (30/60/90/120+ days) |

#### Sales & Marketing Reports

| Report | Description |
|--------|-------------|
| **Bestsellers & Performance** | Top-selling titles ranked by units and revenue |
| **Sales Report** | Detailed sales data with filtering |
| **Channel Revenue** | Revenue breakdown by sales channel (partners, Takealot, KDP, etc.) |
| **Title Performance** | Individual title sales performance metrics |
| **Partner Performance** | Revenue and activity per channel partner |

#### Operations Reports

| Report | Description |
|--------|-------------|
| **Inventory Report** | Current stock levels, movement history, and location breakdown |
| **Print Runs Report** | Print run history across all titles — run numbers, copies ordered/received, printer, costs, cost per unit, and status. Filterable by date range with CSV export. Summary cards show total runs, copies ordered, copies received, and total cost. |

#### Author Reports

| Report | Description |
|--------|-------------|
| **Author Royalties** | Royalty calculations per author. Includes PDF export for royalty statements. |

---

### 2.23 Partner Portal Management

These admin pages manage the partner-facing portal:

#### Portal Users

**Partner Portal → Portal Users**

Manage user accounts for the partner portal.

- View all partner portal users with their name, email, role, partner, and status.
- **Create** new partner users (assign to a partner, set role and credentials).
- **Edit** existing users.
- **Deactivate** users.

**Partner Portal Roles:**

| Role | Access |
|------|--------|
| ADMIN (HQ) | Full portal access including invoices, statements, remittances, branch activity |
| BRANCH_MANAGER | Access limited to their branch's data |
| STAFF | Basic access to orders and catalog |

#### Partner Book Orders

**Partner Portal → Partner Book Orders**

View and manage all orders placed by partners through the Partner Portal.

- See order number, partner, PO number, date, branch, status, items, and total.
- Process orders (confirm, dispatch, etc.).
- Create consignments from orders.

#### Return Requests

**Partner Portal → Return Requests**

View and process return requests submitted by partners.

- Review request details and line items.
- **Authorise** or **Reject** returns.
- When a return request is **Authorized**, a corresponding **Return Authorization (RA)** is automatically created under **Operations → Returns** with all the line items copied across. This bridges the partner portal and internal returns workflow — so authorized partner returns automatically appear in the admin returns list.

#### Courier Shipments

**Partner Portal → Courier Shipments**

Track deliveries to partners.

- View waybill numbers, courier, status, estimated and actual delivery dates.
- Update shipment statuses.

---

### 2.24 Settings

**Admin → Settings**

Settings control how the system behaves, who can access it, and how documents are branded. This module is accessible to **Admins only**.

---

#### Company Details

Four tabs to configure business information:

1. **Company Details** — Company Name, Trading As, Registration Number, VAT Number, full address, email, and phone.
2. **Branding & Logo** — Upload or delete your company logo (appears on all documents).
3. **Banking Details** — Bank Name, Account Number, Branch Code, Account Type.
4. **Document Settings** — Customise the footer text on invoices and statements.

---

#### User Management

**Admin → User Management**

View and manage all system users.

| Column | Description |
|--------|-------------|
| Name | User's full name |
| Email | Login email |
| Role | Assigned role (badge) |
| Status | Active or Inactive |

**Adding a New User:**

1. Click **+ Add User**.
2. Enter **Name**, **Email**, **Password**, and select their **Role**.
3. Click **Save**.

**Available Roles:**

| Role | Access Level |
|------|-------------|
| **Admin** | Full access to all modules including Settings and user management |
| **Finance** | Finance, invoices, payments, royalties, all financial reports. Cannot manage users. |
| **Operations** | Consignments, inventory, channel partners, SOR. No financial detail. |
| **Editorial** | Authors, titles, production pipeline. No financial data. |
| **Reports Only** | View all reports and export data. Cannot create or edit any records. |

**Deactivating a User:**

When a staff member leaves, **do not delete their account** — deactivate it. Go to **Settings → User Management**, find the user, and click **Deactivate**. Their history is preserved for audit purposes.

> Click any user row to edit their details inline.

---

#### Invoice Reminders

**Admin → Settings → Invoice Reminders**

Configure automatic payment reminder emails to channel partners.

- **Enable/Disable** — Turn on auto-send reminders
- **Intervals** — Choose which intervals to send (7 days before, 1 day before, on due date, 3 days after, 7 days after)

Reminders are sent daily at 08:00 SAST for invoices matching the selected intervals.

---

#### Automation & Scheduling

**Admin → Scheduling**

Configure three automated background jobs:

| Job | What It Does | Settings |
|-----|-------------|----------|
| **Statement Generation** | Automatically compiles partner statements | Enable/disable, day of month, time |
| **SOR Auto-Invoice** | Generates invoices for expired SOR consignments | Enable/disable, grace days, time |
| **Invoice Sending** | Sends compiled documents | Enable/disable, day of month, time |

---

#### Data Export

**Admin → Data Export**

Export your data in CSV or JSON format.

**22 CSV exports available:**

Titles, Authors, Partners, Invoices, Invoice Lines, Quotations, Purchase Orders, Credit Notes, Debit Notes, Payments, Remittances, Consignments, Consignment Lines, Inventory, Inventory Movements, Returns, Cash Sales, Expenses, Expense Claims, Requisitions, Sale Records, Royalty Ledger.

Many exports offer **date range filtering** — select a start and end date to narrow results.

**Full System Export** — Downloads all system data in JSON format for backup or migration purposes.

---

### 2.25 Audit Trail

**Admin → Audit Trail**

Every action in the system is logged. The audit trail records every significant action in the system.

| Column | Description |
|--------|-------------|
| Timestamp | When the action occurred |
| User | Who performed it |
| Action | What was done (CREATE, UPDATE, DELETE, VOID, APPROVE, etc.) |
| Module | Which part of the system |
| Entity ID | The specific record affected |

**Filters:**

- **Entity Type** — Filter by one of 17 entity types (invoices, payments, authors, etc.).
- **Action** — Filter by action type (CREATE, UPDATE, DELETE, VOID, APPROVE, REJECT, LOGIN, LOGOUT, EXPORT, PDF_GENERATE, STATUS_CHANGE).
- **Date Range** — Filter by when the action occurred.
- **User** — Filter by who performed the action.

Click any row to expand and see:
- **Before/After changes** — Exactly what was modified.
- **IP Address** — Where the action originated.
- **Metadata** — Additional context.

> **Important:** The audit log cannot be edited or deleted — not even by an Administrator. This ensures complete accountability and traceability.

---

### 2.26 Deletion Requests

**Admin → Deletion Requests**

For safety, all deletions in the system require **two-admin approval**. You cannot approve your own deletion request.

| Column | Description |
|--------|-------------|
| Date | When the request was made |
| Requested By | Who initiated the deletion |
| Entity | Type and ID of the record to be deleted |
| Reason | Why deletion was requested |
| Status | PENDING, APPROVED, REJECTED, EXPIRED |
| Expires | When the request will automatically expire |

**Actions:**

- **Approve** — Confirm the deletion (must be a different admin from the requester).
- **Reject** — Decline with a reason.

Click any row to expand and view a **snapshot of the data** that will be deleted, so you can verify what you are approving.

---

### 2.27 Notifications

Click the **🔔 bell icon** in the top-right header to view notifications.

- **Filter** between All and Unread.
- Click **Mark all as read** to clear all unread notifications.
- Each notification shows its type, title, message, priority, and timestamp.
- Click a notification to navigate to the relevant item.
- Use **Mark as read** or **Delete** on individual notifications.

**Priority Levels:**

| Priority | Colour | Typical Use |
|----------|--------|-------------|
| Urgent | Red | Critical issues requiring immediate attention |
| High | Orange | Important items that should be addressed soon |
| Normal | Blue | Standard notifications |
| Low | Grey | Informational only |

**Notification Types** (30 total) cover: partner orders, returns, invoices, payments, stock alerts, consignments, expense claims, requisitions, quotations, cash sales, credit/debit notes, purchase orders, remittances, and system notifications.

---

### 2.28 Emailing Documents

Many documents in the system (invoices, credit notes, statements, pro-formas, etc.) can be emailed directly as PDF attachments.

1. Open the document detail view.
2. Click **Send Email** (or the email icon).
3. The email compose window opens with:
   - **To** — Pre-filled with the partner/recipient email.
   - **CC** and **BCC** — Add additional recipients.
   - **Subject** — Pre-filled with a template (editable).
   - **Message** — Pre-filled body text (editable).
4. Switch to the **Preview** tab to see the PDF that will be attached.
5. Click **Send**.

All email send attempts are logged (success or failure) for auditing purposes.

---

## 3. Partner Portal

The Partner Portal is a self-service interface for Xarra Books channel partners (bookstores, distributors, etc.).

### 3.1 Logging In

1. Navigate to `/partner/login`.
2. Enter your **Email** and **Password**.
3. Click **Sign In**.

> If you don't have credentials, contact your Xarra Books account manager.

---

### 3.2 Partner Portal Navigation

The sidebar menu varies depending on whether you are an **HQ user** or a **Branch user**:

| Menu Item | HQ | Branch |
|-----------|:---:|:------:|
| Dashboard | ✓ | ✓ |
| Browse Catalog | ✓ | ✓ |
| My Orders | ✓ | ✓ |
| Invoices | ✓ | — |
| Credit Notes | ✓ | ✓ |
| Consignments | ✓ | ✓ |
| Statements | ✓ | — |
| Remittances | ✓ | — |
| Returns | ✓ | ✓ |
| Shipment Tracking | ✓ | ✓ |
| Branch Activity | ✓ | — |
| Account | ✓ | ✓ |

The header displays your **partner name**, **branch name**, the **notification bell**, and **Sign Out**.

---

### 3.3 Partner Dashboard

Your landing page after login. Shows:

- **Welcome message** with your partner and branch name.
- **Stat Cards**: Recent Orders, Pending Deliveries, Outstanding Invoices (HQ only), Active Returns.
- **Recent Orders Table**: Order number, date, status, and total.

---

### 3.4 Browse Catalog & Ordering

Browse the full Xarra Books catalog and place orders.

#### Browsing

- Books are displayed in a **card grid** showing: title, subtitle, ISBN, cover image, RRP, your partner price (with discount percentage shown), and available formats.
- Use the **search bar** to find titles.
- Navigate pages using pagination.

#### Adding to Cart

1. Click the **+ (add)** button on a title card.
2. Set the **quantity**.
3. The item is added to your **cart** (shown as a sidebar).

#### Placing an Order

1. Review your cart — shows all items, subtotal, VAT, and total.
2. Optionally add **Notes** and a **Customer PO Number**.
3. If you are an HQ user, select the **Branch** the order is for.
4. Click **Place Order**.

> The system warns you if you try to navigate away with items in your cart.

---

### 3.5 My Orders

View all your orders and their current status.

| Column | Description |
|--------|-------------|
| Order # | Partner order number (POR-XXXX) |
| PO # | Your purchase order reference |
| Date | Order date |
| Branch | Which branch the order is for |
| Status | Current status |
| Items | Number of items |
| Total | Order total |

**Order Statuses:**

| Status | Meaning |
|--------|---------|
| DRAFT | Order being prepared |
| SUBMITTED | Sent to Xarra Books |
| CONFIRMED | Xarra has confirmed the order |
| PROCESSING | Order is being picked/packed |
| DISPATCHED | Stock has been shipped |
| DELIVERED | Order received |
| CANCELLED | Order was cancelled |

- Filter by **Status** and **Branch**.
- **Export CSV** or **Print** your orders.

---

### 3.6 Invoices (HQ Only)

View all invoices from Xarra Books.

| Column | Description |
|--------|-------------|
| Invoice # | Invoice number |
| Date | Invoice date |
| Due Date | Payment deadline |
| Status | DRAFT, ISSUED, PAID, PARTIAL, OVERDUE, VOIDED |
| Subtotal | Before VAT |
| VAT | 15% VAT amount |
| Total | Full amount due |

- Filter by **Branch**.
- Click a row to see line items, linked credit notes, amount paid, and amount still due.
- **Download PDF** for your records.

---

### 3.7 Credit Notes

View credit notes issued to your account.

| Column | Description |
|--------|-------------|
| Credit Note # | Document number |
| Against Invoice | Which invoice it relates to |
| Reason | Why the credit was issued |
| Subtotal, VAT, Total | Credit amounts |
| Status | AVAILABLE, PARTIALLY ALLOCATED, FULLY ALLOCATED, VOIDED |

A **banner at the top** shows your total available credit.

- Click a row for full details.
- **Download PDF** for your records.

---

### 3.8 Consignments

View consigned stock from Xarra Books.

| Column | Description |
|--------|-------------|
| Dispatch Date | When stock was sent |
| Courier | Delivery carrier |
| Waybill | Tracking number |
| Status | DRAFT, DISPATCHED, DELIVERED, ACKNOWLEDGED, CLOSED |

- Click a row to expand and see line items (title, qty dispatched, qty sold, qty returned).
- **Download PDF** and **Acknowledge** receipt.
- Filter by **Branch**.

---

### 3.9 Statements (HQ Only)

An informational page noting that statements are emailed to your registered head-office email address.

If you need to update your email or request a statement, contact Xarra Books at **info@xarrabooks.com**.

---

### 3.10 Remittances (HQ Only)

Submit remittance advice when you make a payment to Xarra Books.

#### Remittance List

| Column | Description |
|--------|-------------|
| Reference | Your reference number |
| Period | Payment period |
| Amount | Amount paid |
| Status | PENDING, UNDER REVIEW, VERIFIED, APPROVED, MATCHED, DISPUTED |
| Date | Submission date |

**Actions** (via ⋮ menu): View Details, Edit (PENDING only), Download PDF, Copy Reference, Withdraw (PENDING only), Delete (PENDING only).

#### Creating a Remittance

1. Click **Create Remittance**.
2. Enter the **Reference**, **Period**, **Amount**, and payment details.
3. Click **Submit**.

---

### 3.11 Returns

Submit return requests for unsold or damaged stock.

| Column | Description |
|--------|-------------|
| Request # | Return request number (PRR-XXXX) |
| Date | Submission date |
| Status | See workflow below |
| Reason | Reason for the return |
| Items | Number of items |

**Return Workflow:**

DRAFT → SUBMITTED → UNDER REVIEW → AUTHORIZED → AWAITING PICKUP → IN TRANSIT → RECEIVED → INSPECTED → CREDIT ISSUED

#### Submitting a Return Request

1. Click **New Return Request**.
2. Select the **Reason** for the return.
3. Add items (select titles from your consignments, enter quantities).
4. Click **Submit**.

---

### 3.12 Shipment Tracking

Track all deliveries to your locations.

| Column | Description |
|--------|-------------|
| Waybill # | Tracking number |
| Order # | Related order |
| Courier | Delivery carrier |
| Status | CREATED, PICKED UP, IN TRANSIT, OUT FOR DELIVERY, DELIVERED, FAILED |
| Est. Delivery | Expected delivery date |
| Actual Delivery | When it actually arrived |
| Signed By | Who signed for delivery |

**Actions** (via ⋮ menu):
- **Track Shipment** — Opens the courier's tracking page.
- **Copy Waybill Number** — Copies to clipboard.
- **Report Issue** — Flag a problem with the shipment.

---

### 3.13 Branch Activity (HQ Only)

Overview of all your branch locations' activity.

Each branch card shows:
- **Branch Name** and **Code**
- **Orders (30 days)** — Number of recent orders
- **Pending Returns** — Returns awaiting processing
- **Last Order** — Date of most recent order
- Links to **View Orders** and **View Returns** for that branch.

---

### 3.14 Account Settings

View your profile and partner information.

**User Information:**
- Name, Email, Role, Partner, Branch

**Partner Information:**
- Partner Name, Contact Email, Phone, Address, Discount Rate, Payment Terms, SOR Days

**Branches:**
- List of all branches with Name, Code, City, and Contact.

**Change Password:**
1. Enter your **Current Password**.
2. Enter a **New Password** (minimum 8 characters).
3. **Confirm** the new password.
4. Click **Update Password**.

---

## 4. Author Portal

The Author Portal gives published authors visibility into their royalties, contracts, and payments.

### 4.1 Logging In

Authors log in through the main login page:

1. Select **Author** as your role.
2. Enter your **Email** and **Password**.
3. Click **Sign In**. You will be redirected to the Author Portal.

---

### 4.2 Author Portal Navigation

The sidebar contains four pages:

- **Dashboard** — Overview of earnings and contract status
- **Royalties** — Detailed royalty statements
- **Contracts** — Publishing contract details
- **Payments** — Payment history

---

### 4.3 Author Dashboard

Your landing page after login. Shows:

**Summary Cards:**

| Card | What It Shows |
|------|---------------|
| Total Earned | Lifetime gross royalties earned |
| Total Paid | Total amount paid to you |
| Outstanding | Amount earned but not yet paid |
| Units Sold | Total copies sold across all titles |

**Alerts:**

- **Next Payment Due** (blue) — Shows your upcoming payment: payment number, period, amount, and due date.
- **Overdue Payments** (red) — If any payments are overdue, shows the count and total amount.

**Recent Payments:**
- Table of your last few payments with payment number, period, amount, and status.

**Contracts Section:**
For each active contract:
- Title name, royalty rate, payment frequency, next payment date.
- **Overdue flag** (red) if payments are behind.
- Minimum payment amount indicator.
- **Advance Recovery Progress Bar** — Shows how much of your advance has been recovered from royalties, with the remaining amount displayed.

---

### 4.4 Royalties

Detailed view of your royalty calculations.

| Column | Description |
|--------|-------------|
| Title | Book title |
| Period | Royalty calculation period (start – end date) |
| Units | Units sold in this period |
| Gross | Gross royalty amount |
| Net | Net royalty after deductions |
| Status | CALCULATED, APPROVED, PAID, VOIDED |

- Navigate between periods using **pagination**.
- Click any row to view the full royalty breakdown.

---

### 4.5 Contracts

View your publishing contracts with Xarra Books.

Each contract is displayed as a card showing:

- **Title** — The book this contract covers.
- **Status** — Active, Expired, etc.
- **Print Royalty %** — Your royalty rate for print sales.
- **E-book Royalty %** — Your royalty rate for ebook sales.
- **Signed Date** — When the contract was signed.
- **Advance Amount** — The upfront advance you received.
- **Advance Recovery Progress Bar** — Visual indicator showing how much of the advance has been earned back through royalties, with the remaining amount.

Click a contract for the full detail view.

---

### 4.6 Payment History

Track all payments made to you.

| Column | Description |
|--------|-------------|
| Payment # | Payment reference number |
| Period | The royalty period covered (from – to) |
| Gross Royalty | Total royalty before deductions |
| Advance Deducted | Amount deducted for advance recovery |
| Net Payable | Amount after deductions |
| Amount Paid | What was actually paid |
| Status | PENDING, PROCESSING, COMPLETED, PAID, FAILED, REVERSED |
| Bank Ref | Bank transfer reference |
| Paid Date | Date the payment was processed |

- Click **View Details** to see the remittance advice PDF.

---

## 5. Desktop App and Offline Use

The Xarra Books Desktop Application is a version of the system that runs on your Windows or macOS computer. It works without internet — ideal for use at events, at the store, or anywhere with unreliable connectivity.

---

### 5.1 Installing the Desktop App

1. Download the installer from your system administrator or from **Settings → Desktop App → Download**.
2. Run the installer and follow the on-screen prompts.
3. Launch the **Xarra Books** app from your Applications folder (macOS) or Start Menu (Windows).
4. Log in with your normal username and password.
5. The app will perform an initial sync — downloading all data to your local machine. This may take a few minutes on first run.

---

### 5.2 Working Offline

Once synced, the desktop app works completely without internet. You can:

- **Record sales** — at events, at the store, anywhere
- **Create and print invoices and consignment notes** from locally-cached templates
- **View all your existing authors, titles, consignments, and reports** from the last sync
- **Enter payments received**
- **Adjust stock levels**

All actions you take offline are saved locally and will sync to the cloud the moment internet connectivity is restored. You do not need to do anything — syncing is automatic.

---

### 5.3 Understanding the Sync Status

The bottom status bar of the desktop app always shows your sync status:

| Status Indicator | Meaning |
|------------------|----------|
| Green dot — Synced | All your data is up to date with the cloud |
| Amber dot — Pending | You have actions that have not yet been sent to the cloud (offline or syncing) |
| Red dot — Error | A sync error occurred — click for details |
| Blue spinner — Syncing | Currently syncing with the cloud |

You can also click **Sync Now** in the top right to force an immediate sync at any time.

---

### 5.4 Conflict Resolution

If the same record is edited both offline (on your desktop) and online (by someone in the web app) at the same time, a conflict may occur when you sync.

- For most data (contact info, notes), the system **automatically resolves conflicts** using the most recent change.
- For financial records (invoices, payments, royalties), the system will show a **Conflict Resolution screen** asking you to choose which version is correct. Review both versions carefully before deciding.

> ⚠ **Warning:** Never dismiss a financial conflict without reviewing it. Incorrect resolution could result in duplicate invoices or missed payments.

---

## 6. Appendix

### 6.1 Document Number Prefixes

| Prefix | Document Type |
|--------|--------------|
| INV | Invoice |
| CN | Credit Note |
| DN | Debit Note |
| PF | Pro-forma |
| PO | Purchase Order |
| CS | Cash Sale |
| EC | Expense Claim |
| REQ | Requisition |
| SOA | Statement of Account |
| RCP | Receipt |
| AINV | Author Invoice |
| ADV | Advance |
| CON | Consignment Note |
| SOR | SOR Agreement |
| RA | Returns Authorisation |
| GRN | Goods Received Note |
| SAJ | Stock Adjustment |
| PKL | Packing List |
| POR | Partner Order |
| PRR | Partner Return Request |

### 6.2 Status Reference

#### Invoice Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Invoice created but not yet issued |
| ISSUED | Sent to the partner |
| PAID | Fully paid |
| PARTIAL | Partially paid |
| VOIDED | Cancelled / withdrawn |

#### Consignment Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Consignment being prepared |
| DISPATCHED | Stock sent to the partner |
| DELIVERED | Stock received by partner |
| PARTIAL | Some items sold, some remaining |
| CLOSED | Consignment period ended, all items accounted for |

#### Return Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Return being prepared |
| AUTHORIZED | Approved for return |
| IN TRANSIT | Stock being shipped back |
| RECEIVED | Stock received at warehouse |
| INSPECTED | Stock condition checked |
| VERIFIED | All verified and confirmed |
| PROCESSED | Complete — credit/adjustments applied |

#### Partner Order Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Order being prepared |
| SUBMITTED | Sent to Xarra Books |
| CONFIRMED | Order accepted |
| PROCESSING | Being picked and packed |
| DISPATCHED | Shipped |
| DELIVERED | Received by partner |
| CANCELLED | Order cancelled |

#### Print Run Statuses

| Status | Meaning |
|--------|---------|
| ORDERED | Print run placed with the printer |
| IN_PRODUCTION | Currently being printed |
| SHIPPED | Books shipped from the printer |
| RECEIVED | All copies received at warehouse |
| PARTIAL | Fewer copies received than ordered |
| CANCELLED | Print run cancelled |

#### Payment Statuses (Author)

| Status | Meaning |
|--------|---------|
| PENDING | Payment scheduled but not yet processed |
| PROCESSING | Payment being processed |
| COMPLETED | Successfully processed |
| PAID | Payment confirmed in bank |
| FAILED | Payment failed |
| REVERSED | Payment was reversed |

### 6.3 Automated System Jobs

The following processes run automatically in the background:

| Job | Schedule | Description |
|-----|----------|-------------|
| **Invoice Reminders** | Daily at 08:00 SAST | Sends email reminders for upcoming and overdue invoices. Configurable for 7 days before, 1 day before, on due date, 3 days after, and 7 days after payment is due. |
| **SOR Expiry Alerts** | Daily at 07:00 SAST | Sends alerts for consignments expiring within 30 days that have outstanding stock. |
| **SOR Auto-Invoice** | Daily at 08:00 SAST | Automatically generates invoices for expired SOR consignments (if enabled in Scheduling settings). |
| **Monthly Statements** | Daily at 06:00 SAST | Compiles partner statements on the configured day of month. |

### 6.4 Keyboard & UI Tips

- **Search** — Most list pages have a search bar. Type to filter results in real time.
- **Export** — Look for the Export CSV button on list pages. Many exports support date range filtering.
- **Action Menu** — Click the **⋮** (three dots) icon on any row to see available actions.
- **Mobile** — On smaller screens, use the **☰ hamburger menu** to open the navigation sidebar. The sidebar closes automatically when you select a page.
- **Unsaved Changes** — The system warns you before navigating away from a form with unsaved changes.
- **Notifications** — Keep an eye on the 🔔 bell icon for important alerts about orders, invoices, stock, and more.

### 6.5 Getting Help

For technical support or account issues, contact your Xarra Books administrator or email **info@xarrabooks.com**.
