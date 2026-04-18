-- Migration 0021: Create companies table and seed Xarra Books + Billetterie Software
-- Idempotent: uses IF NOT EXISTS / ON CONFLICT DO NOTHING guards

CREATE TABLE IF NOT EXISTS companies (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  short_name  VARCHAR(100) NOT NULL,
  logo_url    VARCHAR(500),
  accent_color VARCHAR(20) DEFAULT '#b91c1c',
  industry    VARCHAR(100),
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO companies (slug, name, short_name, logo_url, accent_color, industry) VALUES
  ('xarra',       'Xarra Books',         'Xarra',       '/XarraBooks-logo.png',   '#b91c1c', 'Publishing'),
  ('billetterie', 'Billetterie Software', 'Billetterie', '/Billetterie-logo.png',  '#1d4ed8', 'Software')
ON CONFLICT (slug) DO NOTHING;

-- Junction table: which companies a user can access
CREATE TABLE IF NOT EXISTS user_companies (
  user_id    TEXT         NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  company_id UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       VARCHAR(50),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);
