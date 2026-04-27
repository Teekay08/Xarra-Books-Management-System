-- Migration 0038: Billetterie Org Settings
-- Stores Billetterie Software's own contact/address details for document headers.
-- Completely separate from company_settings (which belongs to Xarra Books).

CREATE TABLE IF NOT EXISTS billetterie_org_settings (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identity (maps to companies table slug='billetterie', but editable here for doc headers)
  display_name      VARCHAR(255) NOT NULL DEFAULT 'Billetterie Software',
  tagline           VARCHAR(255),
  registration_number VARCHAR(50),
  vat_number        VARCHAR(50),
  -- Contact
  address_line_1    VARCHAR(255),
  address_line_2    VARCHAR(255),
  city              VARCHAR(100),
  province          VARCHAR(100),
  postal_code       VARCHAR(20),
  country           VARCHAR(100) DEFAULT 'South Africa',
  phone             VARCHAR(50),
  email             VARCHAR(255),
  website           VARCHAR(255),
  -- Document appearance
  accent_color      VARCHAR(20)  NOT NULL DEFAULT '#1d4ed8',
  logo_url          VARCHAR(500),
  -- Document footers
  sow_footer_text   TEXT,
  report_footer_text TEXT,
  -- Singleton guard
  singleton         BOOLEAN NOT NULL DEFAULT TRUE UNIQUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default row (pulls logo from companies table at runtime)
INSERT INTO billetterie_org_settings (display_name, tagline, accent_color, logo_url, singleton)
VALUES (
  'Billetterie Software',
  'Professional Project Management',
  '#1d4ed8',
  '/Billetterie-logo.png',
  TRUE
)
ON CONFLICT (singleton) DO NOTHING;
