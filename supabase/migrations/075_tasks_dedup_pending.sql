-- ════════════════════════════════════════════════════════════════════
-- 075 — Prevent duplicate pending auto-tasks for the same client+template
-- ════════════════════════════════════════════════════════════════════
-- useAutoTasks does check-then-insert: it counts pending tasks for the
-- (client, stage), and only inserts new ones if count == 0. With two
-- concurrent callers (e.g. PipelinePage drag + ClientDetailPage stage
-- change clicked at the same moment), both observers see count=0 and
-- both insert, producing duplicate tasks.
--
-- Add a unique partial index keyed on (client_id, template_id) for
-- pending tasks only. The second concurrent INSERT will fail with a
-- unique-violation, which the supabase-js client surfaces as an error
-- — much cleaner than letting the dupe survive and confusing the agent.
-- Done/ignored tasks are exempt so the same template can fire again
-- after the previous run was completed (legitimate re-entry).
-- ════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_client_template_pending
  ON tasks (client_id, template_id)
  WHERE status = 'pending' AND template_id IS NOT NULL;

COMMENT ON INDEX uq_tasks_client_template_pending IS
  'Prevents duplicate auto-generated tasks when useAutoTasks fires concurrently. Only one pending task per (client, template) at any time; once status flips to done/ignored, the slot frees and re-entry is allowed.';
