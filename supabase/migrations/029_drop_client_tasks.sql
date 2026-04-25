-- ================================================
-- Phase B (Option B-1) — Drop client_tasks (consolidation finale)
--
-- Phase 1 (PR #42, migration 028) ajouté les colonnes de client_tasks
-- à tasks et copié les 60 rows.
--
-- Phase 2 (PR #43) refactorisé les 9 fichiers UI/Edge Functions pour
-- query `tasks` au lieu de `client_tasks`. Validé en prod ~24h.
--
-- Phase 3 (this) — DROP la table devenue dead code. Tout ce qui
-- y faisait référence a été refactorisé. Le seul résidu logique
-- (les types DB générés) sera mis à jour par une régen post-merge.
--
-- CASCADE: drops the dependent FKs from sent_messages_log.task_id
-- (the audit didn't find a hard FK constraint, but defensive).
-- ================================================

-- Sanity check — fail loudly if data still exists in tasks that came
-- from client_tasks but the user hasn't validated migration. The
-- backfill from 028 should have set channel or template_id on every
-- migrated row; if those are NULL across the board it means tasks
-- looks empty of migrated content (suspicious).

DO $$
DECLARE
  v_client_tasks_count INTEGER;
  v_migrated_count     INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_tasks') THEN
    RAISE NOTICE 'client_tasks already dropped, skipping.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_client_tasks_count FROM client_tasks;
  SELECT COUNT(*) INTO v_migrated_count
  FROM tasks
  WHERE channel IS NOT NULL OR template_id IS NOT NULL OR priority IS NOT NULL;

  RAISE NOTICE 'About to drop client_tasks with % rows. Migrated count in tasks: %', v_client_tasks_count, v_migrated_count;

  IF v_client_tasks_count > 0 AND v_migrated_count = 0 THEN
    RAISE EXCEPTION 'client_tasks has % rows but tasks has 0 migrated rows. Refusing to drop — re-run migration 028 first.', v_client_tasks_count;
  END IF;

  -- Safe to proceed.
  DROP TABLE client_tasks CASCADE;
  RAISE NOTICE 'client_tasks dropped successfully.';
END $$;
