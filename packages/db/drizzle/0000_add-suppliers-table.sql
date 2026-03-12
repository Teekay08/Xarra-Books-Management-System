CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'FINANCE', 'OPERATIONS', 'EDITORIAL', 'AUTHOR', 'REPORTS_ONLY');--> statement-breakpoint
CREATE TYPE "public"."author_type" AS ENUM('HYBRID', 'TRADITIONAL');--> statement-breakpoint
CREATE TYPE "public"."payment_frequency" AS ENUM('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');--> statement-breakpoint
CREATE TYPE "public"."royalty_trigger" AS ENUM('DATE', 'UNITS', 'REVENUE');--> statement-breakpoint
CREATE TYPE "public"."title_status" AS ENUM('PRODUCTION', 'ACTIVE', 'OUT_OF_PRINT');--> statement-breakpoint
CREATE TYPE "public"."partner_order_status" AS ENUM('DRAFT', 'SUBMITTED', 'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."partner_return_request_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AUTHORIZED', 'REJECTED', 'AWAITING_PICKUP', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'CREDIT_ISSUED');--> statement-breakpoint
CREATE TYPE "public"."partner_user_role" AS ENUM('ADMIN', 'BRANCH_MANAGER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('IN', 'CONSIGN', 'SELL', 'RETURN', 'ADJUST', 'WRITEOFF');--> statement-breakpoint
CREATE TYPE "public"."consignment_status" AS ENUM('DRAFT', 'DISPATCHED', 'DELIVERED', 'ACKNOWLEDGED', 'PARTIAL_RETURN', 'RECONCILED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."return_condition" AS ENUM('GOOD', 'DAMAGED', 'UNSALEABLE');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('DRAFT', 'AUTHORIZED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'VERIFIED', 'PROCESSED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'ISSUED', 'RECEIVED', 'PARTIAL', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."author_payment_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."sync_platform" AS ENUM('WOOCOMMERCE', 'TAKEALOT', 'AMAZON_KDP');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."expense_claim_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."requisition_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'VOID', 'APPROVE', 'REJECT', 'LOGIN', 'LOGOUT', 'EXPORT', 'PDF_GENERATE', 'STATUS_CHANGE');--> statement-breakpoint
CREATE TYPE "public"."deletion_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('PARTNER_ORDER_SUBMITTED', 'PARTNER_ORDER_CANCELLED', 'PARTNER_RETURN_SUBMITTED', 'INVOICE_OVERDUE', 'INVOICE_PAID', 'INVOICE_ISSUED', 'INVOICE_VOIDED', 'PAYMENT_RECEIVED', 'INVENTORY_LOW_STOCK', 'INVENTORY_RECEIVED', 'CONSIGNMENT_DISPATCHED', 'CONSIGNMENT_EXPIRING', 'CONSIGNMENT_RETURNS_PROCESSED', 'EXPENSE_CLAIM_SUBMITTED', 'EXPENSE_CLAIM_APPROVED', 'EXPENSE_CLAIM_REJECTED', 'EXPENSE_CLAIM_PAID', 'REQUISITION_SUBMITTED', 'REQUISITION_APPROVED', 'QUOTATION_EXPIRED', 'QUOTATION_CONVERTED', 'CASH_SALE_CREATED', 'CREDIT_NOTE_CREATED', 'DEBIT_NOTE_CREATED', 'PURCHASE_ORDER_ISSUED', 'PURCHASE_ORDER_RECEIVED', 'PURCHASE_ORDER_CANCELLED', 'REMITTANCE_MATCHED', 'RETURN_PROCESSED', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."partner_notification_type" AS ENUM('ORDER_STATUS_CHANGED', 'SHIPMENT_UPDATE', 'RETURN_STATUS_CHANGED', 'INVOICE_ISSUED', 'STATEMENT_AVAILABLE', 'CONSIGNMENT_DISPATCHED', 'PAYMENT_CONFIRMED', 'CREDIT_NOTE_ISSUED', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'OPERATIONS' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"avatar_url" varchar(500),
	"preferences" jsonb,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"impersonatedBy" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'operations',
	"banned" boolean DEFAULT false,
	"banReason" text,
	"banExpires" integer,
	"isActive" boolean DEFAULT true,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "author_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"royalty_rate_print" numeric(5, 4) NOT NULL,
	"royalty_rate_ebook" numeric(5, 4) NOT NULL,
	"trigger_type" "royalty_trigger" NOT NULL,
	"trigger_value" numeric(12, 2),
	"advance_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"advance_recovered" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_frequency" "payment_frequency" DEFAULT 'QUARTERLY' NOT NULL,
	"minimum_payment" numeric(12, 2) DEFAULT '100' NOT NULL,
	"is_signed" boolean DEFAULT false NOT NULL,
	"signed_doc_url" varchar(500),
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"pen_name" varchar(255),
	"type" "author_type" NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'South Africa',
	"bank_details" jsonb,
	"tax_number" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"portal_user_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_production_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"vendor" varchar(255),
	"paid_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"subtitle" varchar(500),
	"isbn_13" varchar(13),
	"asin" varchar(20),
	"takealot_sku" varchar(50),
	"takealot_offer_id" varchar(50),
	"primary_author_id" uuid,
	"rrp_zar" numeric(10, 2) NOT NULL,
	"cost_price_zar" numeric(10, 2),
	"formats" jsonb NOT NULL,
	"status" "title_status" DEFAULT 'PRODUCTION' NOT NULL,
	"description" text,
	"publish_date" timestamp with time zone,
	"page_count" integer,
	"weight_grams" integer,
	"dimensions" jsonb,
	"cover_image_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_isbn_13_unique" UNIQUE("isbn_13")
);
--> statement-breakpoint
CREATE TABLE "channel_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"sor_days" integer,
	"payment_terms_days" integer,
	"payment_day" integer,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"remittance_email" varchar(255),
	"agreement_doc_url" varchar(500),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'South Africa',
	"vat_number" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"courier_company" varchar(100) DEFAULT 'FASTWAY' NOT NULL,
	"waybill_number" varchar(100) NOT NULL,
	"tracking_url" varchar(500),
	"consignment_id" uuid,
	"partner_order_id" uuid,
	"return_request_id" uuid,
	"sender_name" varchar(255),
	"sender_address" text,
	"recipient_name" varchar(255),
	"recipient_address" text,
	"recipient_phone" varchar(50),
	"package_count" integer DEFAULT 1,
	"total_weight_kg" numeric(8, 2),
	"status" varchar(30) DEFAULT 'CREATED' NOT NULL,
	"estimated_delivery" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivery_signed_by" varchar(255),
	"delivery_proof_url" varchar(500),
	"failure_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50),
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"qty_confirmed" integer,
	"qty_dispatched" integer
);
--> statement-breakpoint
CREATE TABLE "partner_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"placed_by_id" uuid NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_delivery_date" timestamp with time zone,
	"delivery_address" text,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"vat_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "partner_order_status" DEFAULT 'DRAFT' NOT NULL,
	"consignment_id" uuid,
	"invoice_id" uuid,
	"quotation_id" uuid,
	"courier_company" varchar(100),
	"courier_waybill" varchar(100),
	"courier_tracking_url" varchar(500),
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivery_signed_by" varchar(255),
	"confirmed_by_id" text,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"notes" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "partner_return_request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_request_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"condition" varchar(20) DEFAULT 'GOOD' NOT NULL,
	"reason" text,
	"qty_accepted" integer
);
--> statement-breakpoint
CREATE TABLE "partner_return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"requested_by_id" uuid NOT NULL,
	"consignment_id" uuid,
	"reason" text NOT NULL,
	"status" "partner_return_request_status" DEFAULT 'DRAFT' NOT NULL,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"rejection_reason" text,
	"returns_authorization_id" uuid,
	"credit_note_id" uuid,
	"return_courier_company" varchar(100),
	"return_courier_waybill" varchar(100),
	"return_courier_tracking_url" varchar(500),
	"received_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"inspection_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_return_requests_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "partner_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "partner_user_role" DEFAULT 'STAFF' NOT NULL,
	"phone" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title_id" uuid NOT NULL,
	"movement_type" "movement_type" NOT NULL,
	"from_location" varchar(50),
	"to_location" varchar(50),
	"quantity" integer NOT NULL,
	"reference_id" uuid,
	"reference_type" varchar(50),
	"batch_number" varchar(100),
	"supplier_name" varchar(255),
	"supplier_id" uuid,
	"received_date" timestamp with time zone,
	"reason" varchar(255),
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consignment_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"qty_dispatched" integer NOT NULL,
	"qty_sold" integer DEFAULT 0 NOT NULL,
	"qty_returned" integer DEFAULT 0 NOT NULL,
	"qty_damaged" integer DEFAULT 0 NOT NULL,
	"unit_rrp" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"dispatch_date" timestamp with time zone,
	"delivery_date" timestamp with time zone,
	"sor_expiry_date" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"proforma_number" varchar(30),
	"partner_po_number" varchar(50),
	"courier_company" varchar(100),
	"courier_waybill" varchar(100),
	"status" "consignment_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_inspection_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"returns_auth_id" uuid NOT NULL,
	"returns_auth_line_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"qty_received" integer NOT NULL,
	"qty_good" integer DEFAULT 0 NOT NULL,
	"qty_damaged" integer DEFAULT 0 NOT NULL,
	"qty_unsaleable" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "returns_authorization_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"returns_auth_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"condition" "return_condition" DEFAULT 'GOOD' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "returns_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"consignment_id" uuid,
	"return_date" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" "return_status" DEFAULT 'DRAFT' NOT NULL,
	"processed_at" timestamp with time zone,
	"notes" text,
	"courier_company" varchar(100),
	"courier_waybill" varchar(100),
	"received_at" timestamp with time zone,
	"received_by" text,
	"delivery_signed_by" varchar(255),
	"inspected_at" timestamp with time zone,
	"inspected_by" text,
	"inspection_notes" text,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returns_authorizations_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "cash_sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_sale_id" uuid NOT NULL,
	"title_id" uuid,
	"line_number" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"sale_date" timestamp with time zone NOT NULL,
	"customer_name" varchar(255),
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"tax_inclusive" boolean DEFAULT true NOT NULL,
	"payment_method" varchar(30) DEFAULT 'CASH' NOT NULL,
	"payment_reference" varchar(100),
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_sales_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"invoice_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"pdf_url" varchar(500),
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "debit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"invoice_id" uuid,
	"partner_id" uuid NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"pdf_url" varchar(500),
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debit_notes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"title_id" uuid,
	"consignment_line_id" uuid,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_type" varchar(10) DEFAULT 'PERCENT' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"consignment_id" uuid,
	"invoice_date" timestamp with time zone NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_date" timestamp with time zone,
	"purchase_order_number" varchar(50),
	"customer_reference" varchar(100),
	"payment_terms_text" text,
	"sent_at" timestamp with time zone,
	"sent_to" varchar(255),
	"pdf_url" varchar(500),
	"notes" text,
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"idempotency_key" varchar(64),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number"),
	CONSTRAINT "invoices_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"payment_method" varchar(30) DEFAULT 'BANK_TRANSFER',
	"bank_reference" varchar(100) NOT NULL,
	"notes" text,
	"idempotency_key" varchar(64),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"title_id" uuid,
	"line_number" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"quantity_received" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"supplier_id" uuid,
	"supplier_name" varchar(255),
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"order_date" timestamp with time zone NOT NULL,
	"expected_delivery_date" timestamp with time zone,
	"delivery_address" text,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"pdf_url" varchar(500),
	"sent_at" timestamp with time zone,
	"sent_to" varchar(255),
	"received_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"title_id" uuid,
	"line_number" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"line_tax" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"quotation_date" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone,
	"subtotal" numeric(12, 2) NOT NULL,
	"vat_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"converted_invoice_id" uuid,
	"notes" text,
	"pdf_url" varchar(500),
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "remittance_credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remittance_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittance_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remittance_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"partner_ref" varchar(100),
	"period_from" timestamp with time zone,
	"period_to" timestamp with time zone,
	"total_amount" numeric(12, 2) NOT NULL,
	"parse_method" varchar(20),
	"parse_confidence" numeric(3, 2),
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"source_doc_url" varchar(500),
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"matched_by" text,
	"matched_at" timestamp with time zone,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_payment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"royalty_ledger_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"contract_id" uuid,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"units_sold" integer NOT NULL,
	"total_revenue" numeric(12, 2) NOT NULL,
	"gross_royalty" numeric(12, 2) NOT NULL,
	"advance_deducted" numeric(12, 2) NOT NULL,
	"net_payable" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "author_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(30) NOT NULL,
	"author_id" uuid NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"total_gross_royalty" numeric(12, 2) NOT NULL,
	"total_advance_deducted" numeric(12, 2) NOT NULL,
	"total_net_payable" numeric(12, 2) NOT NULL,
	"total_previously_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_due" numeric(12, 2) NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" "author_payment_status" DEFAULT 'PENDING' NOT NULL,
	"payment_method" varchar(30) DEFAULT 'EFT',
	"bank_reference" varchar(100),
	"paid_at" timestamp with time zone,
	"statement_pdf_url" varchar(500),
	"notes" text,
	"idempotency_key" varchar(64),
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"processed_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "author_payments_number_unique" UNIQUE("number"),
	CONSTRAINT "author_payments_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "royalty_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"contract_id" uuid,
	"trigger_type" "royalty_trigger" NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"units_sold" integer NOT NULL,
	"total_revenue" numeric(12, 2) NOT NULL,
	"gross_royalty" numeric(12, 2) NOT NULL,
	"advance_deducted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'CALCULATED' NOT NULL,
	"paid_at" timestamp with time zone,
	"payment_ref" varchar(100),
	"author_payment_id" uuid,
	"statement_pdf_url" varchar(500),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "sale_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(100),
	"title_id" uuid NOT NULL,
	"channel" varchar(30) NOT NULL,
	"partner_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"commission" numeric(10, 2),
	"net_revenue" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'ZAR' NOT NULL,
	"exchange_rate" numeric(10, 4),
	"order_ref" varchar(100),
	"customer_name" varchar(255),
	"sale_date" timestamp with time zone NOT NULL,
	"source" varchar(30) NOT NULL,
	"fulfilment_type" varchar(20),
	"status" varchar(20) DEFAULT 'CONFIRMED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(30) NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "sync_platform" NOT NULL,
	"operation_type" varchar(50) NOT NULL,
	"status" "sync_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"records_processed" integer DEFAULT 0,
	"records_created" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"error_details" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"trading_as" varchar(255),
	"registration_number" varchar(50),
	"vat_number" varchar(50),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'South Africa',
	"phone" varchar(50),
	"email" varchar(255),
	"website" varchar(255),
	"bank_details" jsonb,
	"logo_url" varchar(500),
	"logo_small_url" varchar(500),
	"invoice_footer_text" text,
	"statement_footer_text" text,
	"invoice_reminders" jsonb,
	"scheduling_settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"document_id" uuid NOT NULL,
	"sent_to" varchar(255) NOT NULL,
	"sent_by" text,
	"subject" varchar(500) NOT NULL,
	"message" text,
	"status" varchar(20) DEFAULT 'SENT' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"reminder_type" varchar(30) NOT NULL,
	"sent_to" varchar(255) NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"branch_id" uuid,
	"recipient_email" varchar(255),
	"send_to_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"closing_balance" varchar(20),
	"sent_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"period_label" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total_items" integer DEFAULT 0 NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_failed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_claim_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"category_id" uuid,
	"description" varchar(500) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"receipt_url" varchar(500),
	"expense_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"claimant_id" text NOT NULL,
	"claim_date" timestamp with time zone NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"status" "expense_claim_status" DEFAULT 'DRAFT' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"paid_reference" varchar(100),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_claims_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"description" varchar(500) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_inclusive" boolean DEFAULT false NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"payment_method" varchar(30),
	"reference" varchar(100),
	"receipt_url" varchar(500),
	"notes" text,
	"created_by" text,
	"idempotency_key" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_price" numeric(10, 2) NOT NULL,
	"estimated_total" numeric(12, 2) NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(20) NOT NULL,
	"requested_by" text NOT NULL,
	"department" varchar(100),
	"required_by_date" timestamp with time zone,
	"total_estimate" numeric(12, 2) NOT NULL,
	"status" "requisition_status" DEFAULT 'DRAFT' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"converted_purchase_order_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requisitions_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid,
	"changes" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" text NOT NULL,
	"approved_by" text,
	"rejected_by" text,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" "deletion_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"priority" "notification_priority" DEFAULT 'NORMAL' NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"user_id" text,
	"action_url" varchar(500),
	"reference_type" varchar(50),
	"reference_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "partner_notification_type" NOT NULL,
	"priority" "notification_priority" DEFAULT 'NORMAL' NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"partner_user_id" uuid,
	"action_url" varchar(500),
	"reference_type" varchar(50),
	"reference_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'South Africa',
	"vat_number" varchar(50),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_contracts" ADD CONSTRAINT "author_contracts_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_contracts" ADD CONSTRAINT "author_contracts_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_production_costs" ADD CONSTRAINT "title_production_costs_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titles" ADD CONSTRAINT "titles_primary_author_id_authors_id_fk" FOREIGN KEY ("primary_author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_branches" ADD CONSTRAINT "partner_branches_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_order_id_partner_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."partner_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_order_lines" ADD CONSTRAINT "partner_order_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_orders" ADD CONSTRAINT "partner_orders_placed_by_id_partner_users_id_fk" FOREIGN KEY ("placed_by_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_return_request_lines" ADD CONSTRAINT "partner_return_request_lines_return_request_id_partner_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."partner_return_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_return_request_lines" ADD CONSTRAINT "partner_return_request_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_return_requests" ADD CONSTRAINT "partner_return_requests_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_return_requests" ADD CONSTRAINT "partner_return_requests_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_return_requests" ADD CONSTRAINT "partner_return_requests_requested_by_id_partner_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_lines" ADD CONSTRAINT "consignment_lines_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_lines" ADD CONSTRAINT "consignment_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_returns_auth_id_returns_authorizations_id_fk" FOREIGN KEY ("returns_auth_id") REFERENCES "public"."returns_authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_returns_auth_line_id_returns_authorization_lines_id_fk" FOREIGN KEY ("returns_auth_line_id") REFERENCES "public"."returns_authorization_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspection_lines" ADD CONSTRAINT "return_inspection_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns_authorization_lines" ADD CONSTRAINT "returns_authorization_lines_returns_auth_id_returns_authorizations_id_fk" FOREIGN KEY ("returns_auth_id") REFERENCES "public"."returns_authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns_authorization_lines" ADD CONSTRAINT "returns_authorization_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns_authorizations" ADD CONSTRAINT "returns_authorizations_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns_authorizations" ADD CONSTRAINT "returns_authorizations_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns_authorizations" ADD CONSTRAINT "returns_authorizations_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sale_lines" ADD CONSTRAINT "cash_sale_lines_cash_sale_id_cash_sales_id_fk" FOREIGN KEY ("cash_sale_id") REFERENCES "public"."cash_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sale_lines" ADD CONSTRAINT "cash_sale_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_consignment_id_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."consignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_channel_partners_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_credit_notes" ADD CONSTRAINT "remittance_credit_notes_remittance_id_remittances_id_fk" FOREIGN KEY ("remittance_id") REFERENCES "public"."remittances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_credit_notes" ADD CONSTRAINT "remittance_credit_notes_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_credit_notes" ADD CONSTRAINT "remittance_credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_invoices" ADD CONSTRAINT "remittance_invoices_remittance_id_remittances_id_fk" FOREIGN KEY ("remittance_id") REFERENCES "public"."remittances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittance_invoices" ADD CONSTRAINT "remittance_invoices_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_payment_lines" ADD CONSTRAINT "author_payment_lines_payment_id_author_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."author_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_payment_lines" ADD CONSTRAINT "author_payment_lines_royalty_ledger_id_royalty_ledger_id_fk" FOREIGN KEY ("royalty_ledger_id") REFERENCES "public"."royalty_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_payment_lines" ADD CONSTRAINT "author_payment_lines_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_payment_lines" ADD CONSTRAINT "author_payment_lines_contract_id_author_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."author_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "author_payments" ADD CONSTRAINT "author_payments_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_contract_id_author_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."author_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_title_id_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_batch_items" ADD CONSTRAINT "statement_batch_items_batch_id_statement_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."statement_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_batch_items" ADD CONSTRAINT "statement_batch_items_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_batch_items" ADD CONSTRAINT "statement_batch_items_branch_id_partner_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."partner_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claim_lines" ADD CONSTRAINT "expense_claim_lines_claim_id_expense_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."expense_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_claim_lines" ADD CONSTRAINT "expense_claim_lines_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notifications" ADD CONSTRAINT "partner_notifications_partner_id_channel_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."channel_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_notifications" ADD CONSTRAINT "partner_notifications_partner_user_id_partner_users_id_fk" FOREIGN KEY ("partner_user_id") REFERENCES "public"."partner_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_is_active" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_author_title_contract" ON "author_contracts" USING btree ("author_id","title_id");--> statement-breakpoint
CREATE INDEX "idx_author_contracts_author_id" ON "author_contracts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_author_contracts_title_id" ON "author_contracts" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_authors_type" ON "authors" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_authors_is_active" ON "authors" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_authors_email" ON "authors" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_title_prod_costs_title_id" ON "title_production_costs" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_titles_status" ON "titles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_titles_primary_author" ON "titles" USING btree ("primary_author_id");--> statement-breakpoint
CREATE INDEX "idx_titles_asin" ON "titles" USING btree ("asin");--> statement-breakpoint
CREATE INDEX "idx_titles_takealot_sku" ON "titles" USING btree ("takealot_sku");--> statement-breakpoint
CREATE INDEX "idx_channel_partners_is_active" ON "channel_partners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_courier_shipments_waybill" ON "courier_shipments" USING btree ("waybill_number");--> statement-breakpoint
CREATE INDEX "idx_courier_shipments_consignment" ON "courier_shipments" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_courier_shipments_order" ON "courier_shipments" USING btree ("partner_order_id");--> statement-breakpoint
CREATE INDEX "idx_courier_shipments_return" ON "courier_shipments" USING btree ("return_request_id");--> statement-breakpoint
CREATE INDEX "idx_courier_shipments_status" ON "courier_shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_partner_branches_partner_id" ON "partner_branches" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_branches_is_active" ON "partner_branches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_partner_order_lines_order_id" ON "partner_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_partner_order_lines_title_id" ON "partner_order_lines" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_partner_orders_partner_id" ON "partner_orders" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_orders_branch_id" ON "partner_orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_partner_orders_status" ON "partner_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_partner_orders_placed_by" ON "partner_orders" USING btree ("placed_by_id");--> statement-breakpoint
CREATE INDEX "idx_partner_return_lines_request_id" ON "partner_return_request_lines" USING btree ("return_request_id");--> statement-breakpoint
CREATE INDEX "idx_partner_return_requests_partner_id" ON "partner_return_requests" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_return_requests_status" ON "partner_return_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_partner_users_partner_id" ON "partner_users" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_partner_users_branch_id" ON "partner_users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "idx_partner_users_email" ON "partner_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_inventory_title_id" ON "inventory_movements" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_movement_type" ON "inventory_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE INDEX "idx_inventory_created_at" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_inventory_title_date" ON "inventory_movements" USING btree ("title_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_consignment_lines_consignment" ON "consignment_lines" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_consignment_lines_title" ON "consignment_lines" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_consignments_partner_id" ON "consignments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_consignments_status" ON "consignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_consignments_dispatch_date" ON "consignments" USING btree ("dispatch_date");--> statement-breakpoint
CREATE INDEX "idx_return_inspection_lines_auth" ON "return_inspection_lines" USING btree ("returns_auth_id");--> statement-breakpoint
CREATE INDEX "idx_returns_auth_lines_auth_id" ON "returns_authorization_lines" USING btree ("returns_auth_id");--> statement-breakpoint
CREATE INDEX "idx_returns_auth_partner_id" ON "returns_authorizations" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_returns_auth_status" ON "returns_authorizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cash_sale_lines_cash_sale_id" ON "cash_sale_lines" USING btree ("cash_sale_id");--> statement-breakpoint
CREATE INDEX "idx_cash_sales_sale_date" ON "cash_sales" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_invoice_id" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_credit_notes_partner_id" ON "credit_notes" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_debit_notes_invoice_id" ON "debit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_debit_notes_partner_id" ON "debit_notes" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_lines_invoice_id" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_partner_id" ON "invoices" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_due_date" ON "invoices" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_invoices_invoice_date" ON "invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "idx_payment_alloc_invoice_id" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payments_partner_id" ON "payments" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_payments_payment_date" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "idx_po_lines_po_id" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quotation_lines_quotation_id" ON "quotation_lines" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "idx_quotations_partner_id" ON "quotations" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_quotations_status" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_remittance_cns_remittance_id" ON "remittance_credit_notes" USING btree ("remittance_id");--> statement-breakpoint
CREATE INDEX "idx_remittance_cns_credit_note_id" ON "remittance_credit_notes" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "idx_remittance_invoices_remittance_id" ON "remittance_invoices" USING btree ("remittance_id");--> statement-breakpoint
CREATE INDEX "idx_remittance_invoices_invoice_id" ON "remittance_invoices" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_remittances_partner_id" ON "remittances" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_remittances_status" ON "remittances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_apl_payment_id" ON "author_payment_lines" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_apl_royalty_ledger_id" ON "author_payment_lines" USING btree ("royalty_ledger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_apl_royalty_ledger" ON "author_payment_lines" USING btree ("royalty_ledger_id");--> statement-breakpoint
CREATE INDEX "idx_author_payments_author_id" ON "author_payments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_author_payments_status" ON "author_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_author_payments_period" ON "author_payments" USING btree ("author_id","period_from","period_to");--> statement-breakpoint
CREATE INDEX "idx_author_payments_paid_at" ON "author_payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "idx_royalty_author_id" ON "royalty_ledger" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_royalty_title_id" ON "royalty_ledger" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_royalty_period" ON "royalty_ledger" USING btree ("author_id","title_id","period_from","period_to");--> statement-breakpoint
CREATE INDEX "idx_royalty_status" ON "royalty_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_royalty_payment_id" ON "royalty_ledger" USING btree ("author_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_sale_external_channel" ON "sale_records" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "idx_sale_records_title_id" ON "sale_records" USING btree ("title_id");--> statement-breakpoint
CREATE INDEX "idx_sale_records_channel" ON "sale_records" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_sale_records_partner_id" ON "sale_records" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_sale_records_sale_date" ON "sale_records" USING btree ("sale_date");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user_id" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_sync_platform" ON "sync_operations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_sync_status" ON "sync_operations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_sync_started_at" ON "sync_operations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_document_emails_doc" ON "document_emails" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_reminders_invoice_id" ON "invoice_reminders" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_reminders_type" ON "invoice_reminders" USING btree ("invoice_id","reminder_type");--> statement-breakpoint
CREATE INDEX "idx_statement_batch_items_batch" ON "statement_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_statement_batch_items_partner" ON "statement_batch_items" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_statement_batches_period" ON "statement_batches" USING btree ("period_from","period_to");--> statement-breakpoint
CREATE INDEX "idx_statement_batches_status" ON "statement_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_expense_claim_lines_claim_id" ON "expense_claim_lines" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "idx_expense_claims_claimant_id" ON "expense_claims" USING btree ("claimant_id");--> statement-breakpoint
CREATE INDEX "idx_expense_claims_status" ON "expense_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_expenses_category_id" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_expense_date" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "idx_requisition_lines_requisition_id" ON "requisition_lines" USING btree ("requisition_id");--> statement-breakpoint
CREATE INDEX "idx_requisitions_requested_by" ON "requisitions" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_requisitions_status" ON "requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_deletion_requests_status" ON "deletion_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deletion_requests_requested_by" ON "deletion_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_deletion_requests_expires_at" ON "deletion_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_is_read" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_type" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notifications_reference" ON "notifications" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_partner_notifications_partner_read" ON "partner_notifications" USING btree ("partner_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_partner_notifications_user_read" ON "partner_notifications" USING btree ("partner_user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_partner_notifications_created" ON "partner_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_name" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_suppliers_active" ON "suppliers" USING btree ("is_active");