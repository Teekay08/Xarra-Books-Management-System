-- Migration 0037: Billetterie Testing Phase Management
-- Adds: test_plans, test_cases, test_executions

DO $$ BEGIN
  CREATE TYPE bil_test_plan_status AS ENUM ('DRAFT','ACTIVE','COMPLETED','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_test_type AS ENUM ('FUNCTIONAL','REGRESSION','SMOKE','PERFORMANCE','SECURITY','UAT','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE bil_test_result AS ENUM ('PASS','FAIL','BLOCKED','SKIPPED','NOT_RUN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Test Plans ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_test_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  status          bil_test_plan_status NOT NULL DEFAULT 'DRAFT',
  test_type       bil_test_type NOT NULL DEFAULT 'FUNCTIONAL',
  linked_sprint_id UUID REFERENCES billetterie_sprints(id) ON DELETE SET NULL,
  linked_milestone_id UUID REFERENCES billetterie_milestones(id) ON DELETE SET NULL,
  target_phase    bil_phase_key,
  pass_threshold  SMALLINT NOT NULL DEFAULT 80,  -- % required to mark plan COMPLETED
  created_by      TEXT REFERENCES "user"(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_test_plans_project ON billetterie_test_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_test_plans_status  ON billetterie_test_plans(status);

-- ─── Test Cases ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_test_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES billetterie_test_plans(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES billetterie_projects(id) ON DELETE CASCADE,
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  -- Steps as an ordered JSON array: [{ step, expected }]
  steps           JSONB NOT NULL DEFAULT '[]',
  expected_result TEXT,
  priority        bil_task_priority NOT NULL DEFAULT 'MEDIUM',
  -- Latest result (denormalized for fast list queries)
  latest_result   bil_test_result NOT NULL DEFAULT 'NOT_RUN',
  linked_issue_id UUID REFERENCES billetterie_issues(id) ON DELETE SET NULL,
  created_by      TEXT REFERENCES "user"(id),
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_test_cases_plan    ON billetterie_test_cases(plan_id);
CREATE INDEX IF NOT EXISTS idx_bil_test_cases_project ON billetterie_test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_bil_test_cases_result  ON billetterie_test_cases(latest_result);

-- ─── Test Executions (audit trail of each test run) ───────────────────────────

CREATE TABLE IF NOT EXISTS billetterie_test_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id    UUID NOT NULL REFERENCES billetterie_test_cases(id) ON DELETE CASCADE,
  plan_id         UUID NOT NULL REFERENCES billetterie_test_plans(id) ON DELETE CASCADE,
  result          bil_test_result NOT NULL,
  notes           TEXT,
  -- If FAIL, can be linked to an issue
  linked_issue_id UUID REFERENCES billetterie_issues(id) ON DELETE SET NULL,
  executed_by     TEXT NOT NULL REFERENCES "user"(id),
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_executions_case ON billetterie_test_executions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_bil_executions_plan ON billetterie_test_executions(plan_id);
