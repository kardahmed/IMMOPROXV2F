-- ================================================
-- Drop legacy permissive policies — migration 018
--
-- Problem: migration 017 added strict per-command policies
-- (clients_select / _insert / _update / _delete etc.) on every
-- sensitive table, but older policies from the Studio-era
-- (tenant_isolation, admin_manage_*, super_admin_all_*,
-- "Tenant access own whatsapp_*") were still attached. PostgreSQL
-- combines permissive policies with an OR, so a single permissive
-- legacy policy allowing "ALL" for any authenticated tenant user
-- bypassed the tighter rules we introduced in 017 (an agent could
-- still DELETE another agent's client because tenant_isolation
-- permitted it).
--
-- This migration drops the legacy ones so only the strict 017
-- policies remain. All statements are IF EXISTS so running on a
-- tenant that never had those policies is a safe no-op.
--
-- After this migration the policy list per table should read:
--   *_select, *_insert, *_update, *_delete  (one row each from 017)
-- and nothing else.
-- ================================================

-- --- clients ---
DROP POLICY IF EXISTS "tenant_isolation"         ON clients;
DROP POLICY IF EXISTS "admin_manage_clients"     ON clients;
DROP POLICY IF EXISTS "super_admin_all_clients"  ON clients;

-- --- visits ---
DROP POLICY IF EXISTS "tenant_isolation"         ON visits;
DROP POLICY IF EXISTS "admin_manage_visits"      ON visits;
DROP POLICY IF EXISTS "super_admin_all_visits"   ON visits;

-- --- reservations ---
DROP POLICY IF EXISTS "tenant_isolation"             ON reservations;
DROP POLICY IF EXISTS "admin_manage_reservations"    ON reservations;
DROP POLICY IF EXISTS "super_admin_all_reservations" ON reservations;

-- --- history ---
DROP POLICY IF EXISTS "tenant_isolation"        ON history;
DROP POLICY IF EXISTS "super_admin_all_history" ON history;

-- --- tasks ---
DROP POLICY IF EXISTS "tenant_isolation"      ON tasks;
DROP POLICY IF EXISTS "admin_manage_tasks"    ON tasks;
DROP POLICY IF EXISTS "super_admin_all_tasks" ON tasks;

-- --- documents ---
DROP POLICY IF EXISTS "tenant_isolation"          ON documents;
DROP POLICY IF EXISTS "admin_manage_documents"    ON documents;
DROP POLICY IF EXISTS "super_admin_all_documents" ON documents;

-- --- whatsapp_messages ---
DROP POLICY IF EXISTS "tenant_isolation"                 ON whatsapp_messages;
DROP POLICY IF EXISTS "Tenant access own whatsapp_messages" ON whatsapp_messages;

-- --- whatsapp_accounts ---
DROP POLICY IF EXISTS "tenant_isolation"                 ON whatsapp_accounts;
DROP POLICY IF EXISTS "Tenant access own whatsapp_accounts" ON whatsapp_accounts;
