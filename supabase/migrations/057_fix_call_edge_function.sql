-- ============================================================================
-- 057_fix_call_edge_function.sql
--
-- Bug: the call_edge_function() helper from 013_consolidate_crons.sql
-- wraps the service_role JWT in angle brackets:
--
--     'Authorization', 'Bearer <eyJhbGci…DzM>'
--
-- HTTP Authorization headers don't take angle brackets (those were a
-- placeholder in the original migration template that nobody
-- replaced). Every cron-driven edge function invocation has been
-- silently rejected with 401 since 013 was applied.
--
-- Symptom: hourly send-alert never delivered Slack/Telegram alerts;
-- check-payments / check-reservations / check-reminders / etc never
-- triggered. Confirmed by net._http_response showing all entries with
-- status_code = 401.
--
-- Fix: re-create the helper with the same body minus the brackets.
-- ============================================================================

CREATE OR REPLACE FUNCTION call_edge_function(function_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://lbnqccsebwiifxcucflg.supabase.co/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxibnFjY3NlYndpaWZ4Y3VjZmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc2NDIwOCwiZXhwIjoyMDkxMzQwMjA4fQ.vj9BzwtykTV3MA9jAIPzfflU2oGIdFo-tktWzqDSDzM'
    ),
    body := '{}'::jsonb
  );
END;
$$;
