-- Migration 0029: Billetterie client portal tokens
-- Idempotent: IF NOT EXISTS / DO $$ EXCEPTION guards

CREATE TABLE IF NOT EXISTS billetterie_client_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  token            VARCHAR(64) NOT NULL UNIQUE,
  client_email     VARCHAR(255) NOT NULL,
  client_name      VARCHAR(255) NOT NULL,
  permissions      JSONB        NOT NULL DEFAULT '{}',
  expires_at       TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by       TEXT        REFERENCES "user"(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_client_tokens_token   ON billetterie_client_tokens(token);
CREATE INDEX IF NOT EXISTS idx_bil_client_tokens_project ON billetterie_client_tokens(project_id);
