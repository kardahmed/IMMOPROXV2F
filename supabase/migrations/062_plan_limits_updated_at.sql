-- ============================================================================
-- 062_plan_limits_updated_at.sql
--
-- save_plan_features_atomic() (from 051) writes `updated_at = NOW()` on
-- plan_limits, but the column was never added to the table. The save
-- mutation in PlansConfigPage therefore raises:
--
--   ERROR: column "updated_at" of relation "plan_limits" does not exist
--
-- Add the column with NOW() default + an auto-bump trigger so it
-- stays current even when other code paths touch the table.
-- ============================================================================

ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION plan_limits_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS plan_limits_updated_at ON plan_limits;
CREATE TRIGGER plan_limits_updated_at
  BEFORE UPDATE ON plan_limits
  FOR EACH ROW EXECUTE FUNCTION plan_limits_set_updated_at();

NOTIFY pgrst, 'reload schema';
