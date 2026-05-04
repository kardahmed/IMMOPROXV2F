-- ════════════════════════════════════════════════════════════════════
-- 070 — Hotfix: append_client_note failed because clients has no updated_at
-- ════════════════════════════════════════════════════════════════════
-- Migration 068 created append_client_note() with `SET notes = ...,
-- updated_at = NOW()`. The clients table only has created_at — no
-- updated_at — so every call returned "column clients.updated_at
-- does not exist" and the note was never written. The function is
-- called via .or() inside Postgres; the error bubbled up to the
-- pipeline page as a red toast on every interaction.
--
-- Drop the offending column reference. Replacing the function in
-- place is safe — the new body matches what 068 should have done.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION append_client_note(
  p_client_id UUID,
  p_note      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result TEXT;
BEGIN
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    SELECT notes INTO result FROM clients WHERE id = p_client_id;
    RETURN result;
  END IF;

  UPDATE clients
  SET notes = CASE
    WHEN notes IS NULL OR length(trim(notes)) = 0
      THEN p_note
    ELSE p_note || E'\n\n' || notes
  END
  WHERE id = p_client_id
  RETURNING notes INTO result;

  RETURN result;
END;
$$;
