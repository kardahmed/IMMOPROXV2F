-- ================================================
-- Automation engine — migration 019
--
-- Adds the columns on `tasks` that the dispatchAutomation helper
-- needs when it falls back to creating a manual task (because the
-- tenant has no WhatsApp connected). Having these fields on the
-- tasks table itself means:
--
--   1. The /tasks page can filter + badge auto-generated tasks
--      separately from tasks the agent created by hand ("🤖
--      Tâche automatique" pill).
--   2. The tasks UI can pre-render a "Send WhatsApp" deeplink
--      (wa.me/...?text=<pre-filled>) using template_params, so
--      the agent just clicks → WhatsApp opens on their phone with
--      the message ready → tap send.
--   3. Cron jobs can be idempotent: before inserting a new task,
--      they can SELECT ... WHERE automation_type = X AND
--      metadata->>related_id = Y to avoid duplicates.
--
-- Every statement is idempotent (IF NOT EXISTS, IF EXISTS) so
-- re-running the migration is a safe no-op.
-- ================================================

-- ----------------------------------------
-- Soft-delete aware — these columns exist as nullable TEXT/JSONB
-- so they don't affect existing rows (default values handle it).
-- ----------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS automation_type TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS automation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_name TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_params JSONB;

-- ----------------------------------------
-- Indexes — cron idempotency lookups + UI filters
-- ----------------------------------------

-- Fast filter in /tasks UI: "show me only auto-generated tasks"
CREATE INDEX IF NOT EXISTS idx_tasks_automation_type
  ON tasks(automation_type)
  WHERE automation_type IS NOT NULL;

-- Idempotency for crons: lookup by (automation_type + related_id
-- in metadata) to skip duplicate inserts. GIN on JSONB covers the
-- metadata->>'related_id' case efficiently.
CREATE INDEX IF NOT EXISTS idx_tasks_automation_metadata
  ON tasks USING GIN (automation_metadata jsonb_path_ops)
  WHERE automation_type IS NOT NULL;

-- ----------------------------------------
-- Documentation
-- ----------------------------------------
COMMENT ON COLUMN tasks.automation_type IS 'Identifies which automation created this task. Matches the template name in whatsapp_templates (e.g. visite_confirmation_j_moins_1). NULL for manually-created tasks.';
COMMENT ON COLUMN tasks.automation_metadata IS 'Context payload from the automation trigger. Shape: { trigger_source: "cron_check_reminders" | "manual" | ..., related_id: uuid, related_type: "visit" | "reservation" | ... }. Used by crons for idempotency (skip if a task with the same related_id already exists).';
COMMENT ON COLUMN tasks.template_name IS 'Approved WhatsApp template name. Used by the /tasks UI to deeplink to wa.me with a pre-filled message when the agent clicks "Envoyer WhatsApp".';
COMMENT ON COLUMN tasks.template_params IS 'Ordered list of the values to substitute into the template variables. Matches the sample-variable positions from WHATSAPP_TEMPLATES_CATALOG.md. Stored as JSONB array: ["Youcef Mansouri", "mardi 26 mai 2026", ...]';
