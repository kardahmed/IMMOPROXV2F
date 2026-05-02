-- ============================================================================
-- 061_enable_x_assistant_qa.sql
--
-- Phase 1 of X Assistant (Q&A) is shipped — flip is_implemented=TRUE in
-- feature_catalog so it appears as a real toggle in the plan editor
-- (it was seeded as is_implemented=FALSE in 059 since the code wasn't
-- live yet, which made it grey out).
--
-- Doesn't enable it on any plan yet — that's a separate decision the
-- founder makes from /admin/plans (toggle the feature on the plans
-- where it should be included). Pro and Enterprise will likely get it.
-- ============================================================================

UPDATE feature_catalog
   SET is_implemented = TRUE,
       updated_at = NOW()
 WHERE slug = 'x_assistant_qa';

NOTIFY pgrst, 'reload schema';
