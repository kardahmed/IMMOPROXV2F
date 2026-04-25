-- ================================================
-- Phase B (Option B-1) — Consolidate client_tasks into tasks (additive)
--
-- Two task tables coexist by historical accident:
--
--   - tasks (migration 001 + automation columns from 019)
--     Used by: client detail tab (SimpleDataTabs.tsx) + crons via
--     dispatchAutomation. Has soft-delete, RLS, automation_metadata.
--
--   - client_tasks (Studio-created, no migration trail before this)
--     Used by: /tasks page (TasksPage.tsx) for outreach scheduling.
--     Has channel, priority, scheduled_at, template_id, bundle_id,
--     recurrence — but no soft-delete and no RLS policies.
--
-- This migration is the FIRST of three (B-1):
--
--   028 (this) — ADDITIVE: add the missing columns to `tasks` and
--                copy every row from client_tasks into tasks.
--                Both tables stay alive after this. App keeps working
--                exactly as before.
--   029 (PR #43) — Refactor every UI/Edge Function query that reads
--                from client_tasks to read from tasks instead.
--   030 (PR #44) — DROP TABLE client_tasks. Only after we've watched
--                the system run on `tasks` for ~24h in prod and seen
--                that nothing references the old table anymore.
--
-- Status mapping (lossy by design — see B-1 trade-off documented in
-- the PR):
--
--   client_tasks.status → tasks.status (enum)
--   ─────────────────────────────────────────
--   pending            → pending
--   scheduled          → pending  (UI derives from scheduled_at)
--   in_progress        → pending  (UI derives from executed_at)
--   completed          → done
--   skipped            → ignored
--   cancelled          → ignored  (loses distinction from skipped)
--
-- Type mapping:
--
--   client_tasks has no `type` column. All migrated rows get
--   `type='manual'` since they were agent-created outreach.
--   Automation tasks already use `type='manual'` + the
--   automation_type discriminator, so the UI can keep telling them
--   apart.
-- ================================================

-- ----------------------------------------
-- 1. Add the missing columns from client_tasks to tasks
--    All NULLABLE so existing rows keep working without a default.
-- ----------------------------------------

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority        TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS channel         TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS channel_used    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_at    TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS executed_at     TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id     UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS bundle_id       UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_days INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_at     TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS message_sent    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS response        TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS client_response TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_cancelled  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage           TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Soft FKs: only add if the target tables exist. We don't want this
-- migration to fail if task_templates / task_bundles aren't there yet
-- (they were Studio-created too).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_templates') THEN
    ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_template_id_fkey;
    ALTER TABLE tasks ADD CONSTRAINT tasks_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_bundles') THEN
    ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_bundle_id_fkey;
    ALTER TABLE tasks ADD CONSTRAINT tasks_bundle_id_fkey
      FOREIGN KEY (bundle_id) REFERENCES task_bundles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------
-- 2. Indexes for the new columns the UI will filter on
-- ----------------------------------------

CREATE INDEX IF NOT EXISTS idx_tasks_channel
  ON tasks(channel) WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at
  ON tasks(scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_priority
  ON tasks(priority) WHERE priority IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_template
  ON tasks(template_id) WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_bundle
  ON tasks(bundle_id) WHERE bundle_id IS NOT NULL;

-- ----------------------------------------
-- 3. Backfill — copy every client_tasks row into tasks.
--    Uses ON CONFLICT (id) DO NOTHING so re-running is safe.
--    Only runs if client_tasks still exists.
-- ----------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_tasks') THEN
    RAISE NOTICE 'client_tasks does not exist, skipping backfill';
    RETURN;
  END IF;

  INSERT INTO tasks (
    id, tenant_id, client_id, agent_id,
    title, type, status, due_at, created_at,
    description, priority, channel, channel_used,
    scheduled_at, completed_at, executed_at,
    template_id, bundle_id,
    is_recurring, recurrence_days, reminder_at,
    message_sent, response, client_response,
    auto_cancelled, stage, updated_at
  )
  SELECT
    ct.id, ct.tenant_id, ct.client_id, ct.agent_id,
    ct.title,
    'manual'::task_type AS type,
    -- Map client_tasks.status (TEXT) into tasks.status (3-value enum).
    -- Lossy: cancelled → ignored (same bucket as skipped). The UI
    -- distinguishes the two cases via auto_cancelled instead.
    CASE ct.status
      WHEN 'completed'   THEN 'done'::task_status
      WHEN 'skipped'     THEN 'ignored'::task_status
      WHEN 'cancelled'   THEN 'ignored'::task_status
      ELSE 'pending'::task_status   -- pending / scheduled / in_progress / NULL
    END AS status,
    -- Old `tasks.due_at` semantics map to scheduled_at; keep the
    -- latest of the two in sync.
    COALESCE(ct.scheduled_at, ct.reminder_at) AS due_at,
    COALESCE(ct.created_at, NOW()) AS created_at,
    ct.description, ct.priority, ct.channel, ct.channel_used,
    ct.scheduled_at, ct.completed_at, ct.executed_at,
    ct.template_id, ct.bundle_id,
    COALESCE(ct.is_recurring, FALSE),
    ct.recurrence_days, ct.reminder_at,
    ct.message_sent, ct.response, ct.client_response,
    COALESCE(ct.auto_cancelled, FALSE),
    ct.stage, NOW()
  FROM client_tasks ct
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Backfilled % client_tasks rows into tasks', (SELECT COUNT(*) FROM client_tasks);
END $$;

-- ----------------------------------------
-- 4. Documentation
-- ----------------------------------------

COMMENT ON COLUMN tasks.description     IS 'Long-form description of the task. Migrated from client_tasks in 028.';
COMMENT ON COLUMN tasks.priority        IS 'low | medium | high | urgent. UI alert when high/urgent.';
COMMENT ON COLUMN tasks.channel         IS 'whatsapp | sms | call | email | system. Outreach channel for the task.';
COMMENT ON COLUMN tasks.channel_used    IS 'Channel actually used to execute the task (may differ from channel).';
COMMENT ON COLUMN tasks.scheduled_at    IS 'When the task should fire. UI derives "scheduled" status from this + status=pending.';
COMMENT ON COLUMN tasks.completed_at    IS 'When status flipped to done.';
COMMENT ON COLUMN tasks.executed_at     IS 'When the task was attempted (may have failed). UI derives "in_progress" from executed_at IS NOT NULL + status=pending.';
COMMENT ON COLUMN tasks.template_id     IS 'Optional FK to task_templates — for tasks created from a reusable template.';
COMMENT ON COLUMN tasks.bundle_id       IS 'Optional FK to task_bundles — series of tasks created together (e.g. onboarding sequence).';
COMMENT ON COLUMN tasks.auto_cancelled  IS 'TRUE when the task was cancelled by an automated process (e.g. client moved to "lost"). UI distinguishes this from manual cancellation.';
COMMENT ON COLUMN tasks.stage           IS 'Pipeline stage when the task was created — for filtering in /tasks.';
