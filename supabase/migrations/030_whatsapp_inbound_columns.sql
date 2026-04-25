-- ================================================
-- Migration 030 — whatsapp_messages: extend for inbound traffic
--
-- Purpose: the existing whatsapp_messages schema (migration 016) was
-- designed when we only sent OUTBOUND messages. The webhook entrant
-- (Edge Function `whatsapp-webhook`, MVP closure plan step A) will now
-- receive INBOUND messages from Meta Cloud API — replies, status
-- updates, and broadcasts.
--
-- This migration is purely additive:
--   - Adds direction / from_phone / body_text / message_type / read_at
--     / raw_payload columns
--   - Relaxes template_name + to_phone to nullable (inbound rows have
--     neither — they arrive untemplated, addressed to the tenant's own
--     number which is in metadata.display_phone_number from Meta)
--   - Extends the status enum to allow 'received' for inbound rows
--   - Adds indexes for the inbox queries (`tenant_id + direction +
--     read_at IS NULL` for unread counter, `wa_message_id` for
--     status lookups)
--   - Adds an explicit index on whatsapp_accounts.phone_number_id —
--     the webhook will resolve `tenant_id` by matching the incoming
--     metadata.phone_number_id, so this lookup must be fast.
--
-- Rollback: see bottom of file.
-- ================================================

-- 1. Extend the message rows themselves.

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('inbound', 'outbound'));

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS from_phone TEXT;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS body_text TEXT;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

-- 2. template_name was NOT NULL — relax for inbound rows.

ALTER TABLE whatsapp_messages
  ALTER COLUMN template_name DROP NOT NULL;

-- 3. to_phone was NOT NULL — relax. For inbound rows we still record
--    metadata.display_phone_number when Meta sends it, but we don't
--    require it (the from_phone is the meaningful identifier).

ALTER TABLE whatsapp_messages
  ALTER COLUMN to_phone DROP NOT NULL;

-- 4. Sanity: every row must have at least from_phone OR to_phone.
--    Outbound rows have to_phone, inbound rows have from_phone.

ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_phone_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_phone_check
    CHECK (from_phone IS NOT NULL OR to_phone IS NOT NULL);

-- 5. Extend status check to allow 'received' (inbound rows).
--    Existing values stay valid: sent/delivered/read/failed.

ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check
    CHECK (status IN ('sent', 'delivered', 'read', 'failed', 'received'));

-- 6. Indexes for the new query patterns.

-- Inbox unread counter: per-tenant, inbound only, unread rows.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_unread
  ON whatsapp_messages(tenant_id, created_at DESC)
  WHERE direction = 'inbound' AND read_at IS NULL;

-- Status lookup by Meta's wa_message_id (used to update delivery state).
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id
  ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- Conversation view: per-client messages chronological.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_thread
  ON whatsapp_messages(client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

-- 7. whatsapp_accounts: index on phone_number_id for webhook lookup.
--    Every inbound webhook call resolves tenant_id by querying
--    whatsapp_accounts WHERE phone_number_id = ?, so this needs to be
--    fast. UNIQUE constraint on tenant_id doesn't help here.

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_number_id
  ON whatsapp_accounts(phone_number_id)
  WHERE phone_number_id IS NOT NULL;

-- ================================================
-- Verification queries (run manually after applying)
-- ================================================
--
-- Confirm new columns exist:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'whatsapp_messages'
--      AND column_name IN ('direction','from_phone','body_text',
--                          'message_type','read_at','raw_payload');
--
-- Existing rows should all be direction='outbound' (default applies):
--   SELECT direction, COUNT(*) FROM whatsapp_messages GROUP BY direction;
--
-- ================================================
-- Rollback
-- ================================================
--
-- ALTER TABLE whatsapp_messages
--   DROP CONSTRAINT IF EXISTS whatsapp_messages_phone_check,
--   DROP COLUMN IF EXISTS direction,
--   DROP COLUMN IF EXISTS from_phone,
--   DROP COLUMN IF EXISTS body_text,
--   DROP COLUMN IF EXISTS message_type,
--   DROP COLUMN IF EXISTS read_at,
--   DROP COLUMN IF EXISTS raw_payload,
--   ALTER COLUMN template_name SET NOT NULL,
--   ALTER COLUMN to_phone SET NOT NULL,
--   DROP CONSTRAINT whatsapp_messages_status_check,
--   ADD CONSTRAINT whatsapp_messages_status_check
--     CHECK (status IN ('sent','delivered','read','failed'));
--
-- DROP INDEX IF EXISTS idx_whatsapp_messages_unread;
-- DROP INDEX IF EXISTS idx_whatsapp_messages_wa_id;
-- DROP INDEX IF EXISTS idx_whatsapp_messages_client_thread;
-- DROP INDEX IF EXISTS idx_whatsapp_accounts_phone_number_id;
