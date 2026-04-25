-- ================================================
-- Migration 031 — mark_messages_read RPC
--
-- Purpose: lets the inbox UI flip whatsapp_messages.read_at when an
-- agent or admin opens a conversation, WITHOUT loosening the strict
-- RLS UPDATE policy from migration 017 (which restricts UPDATE to
-- super_admin to keep the message log immutable for audit).
--
-- The function runs as SECURITY DEFINER so it bypasses RLS, but
-- internally checks the caller's tenant scope and re-applies the
-- same agent-vs-admin filter as the SELECT policy. Only `read_at`
-- can change (the function never touches body_text / status / etc).
-- That preserves the audit-trail integrity that motivated the
-- super-admin-only policy in 017.
-- ================================================

CREATE OR REPLACE FUNCTION mark_messages_read(message_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID;
  caller_tenant UUID;
  caller_role TEXT;
  updated_count INTEGER;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT tenant_id, role
    INTO caller_tenant, caller_role
    FROM users
   WHERE id = caller_id;

  IF caller_tenant IS NULL AND caller_role <> 'super_admin' THEN
    RAISE EXCEPTION 'No tenant context for caller';
  END IF;

  -- Mirror the SELECT policy from migration 017:
  --   admin/super_admin → all messages in the tenant
  --   agent             → only messages tied to clients they own
  -- Anything else: refuse silently (0 rows updated).
  IF caller_role IN ('admin', 'super_admin') THEN
    UPDATE whatsapp_messages
       SET read_at = NOW()
     WHERE id = ANY(message_ids)
       AND tenant_id = caller_tenant
       AND direction = 'inbound'
       AND read_at IS NULL;
  ELSIF caller_role = 'agent' THEN
    UPDATE whatsapp_messages
       SET read_at = NOW()
     WHERE id = ANY(message_ids)
       AND tenant_id = caller_tenant
       AND direction = 'inbound'
       AND read_at IS NULL
       AND (
         client_id IS NULL  -- unknown sender, anyone in tenant can claim
         OR client_id IN (SELECT id FROM clients WHERE agent_id = caller_id)
       );
  ELSE
    RETURN 0;
  END IF;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_messages_read(UUID[]) TO authenticated;

COMMENT ON FUNCTION mark_messages_read IS
  'Mark inbound WhatsApp messages as read. Tenant-scoped: agents can only mark messages from their own clients (or unknown senders); admins can mark any tenant message. Used by the inbox UI when opening a conversation.';

-- ================================================
-- Verification (run manually)
-- ================================================
-- As a tenant admin:
--   SELECT mark_messages_read(ARRAY['<some-message-uuid>']::uuid[]);
--   → returns 1 if the message was unread + in tenant, 0 otherwise.
--
-- As an agent (auth context with role='agent'):
--   SELECT mark_messages_read(ARRAY['<msg-of-other-agents-client>']::uuid[]);
--   → returns 0 (refused at the WHERE clause level).
--
-- ================================================
-- Rollback
-- ================================================
-- DROP FUNCTION IF EXISTS mark_messages_read(UUID[]);
