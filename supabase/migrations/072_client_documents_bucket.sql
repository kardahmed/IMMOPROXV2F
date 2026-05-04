-- ════════════════════════════════════════════════════════════════════
-- 072 — Create client-documents storage bucket
-- ════════════════════════════════════════════════════════════════════
-- The reservation modal uploads CIN files to a storage bucket called
-- `client-documents`. The bucket was never created via migration —
-- a fresh Supabase project errors out with "Bucket not found" the
-- first time an agent tries to upload. ClientDocuments.tsx surfaces
-- this with a clear toast, but the file never lands and the
-- reservation can't be saved.
--
-- Idempotent: ON CONFLICT skip if a previous attempt (Studio click,
-- earlier migration) created the bucket already.
-- ════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  FALSE, -- private — files served via signed URLs only, never indexed
  10 * 1024 * 1024, -- 10 MB cap to match the per-file UI validation
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS policies on storage.objects ────────────────────────────────
-- INTENTIONALLY NOT CREATED HERE.
--
-- Supabase Storage owns the storage.objects table under the
-- supabase_storage_admin role; the postgres role (which the SQL
-- editor uses) cannot create policies against it directly. Trying
-- to do so produces ERROR 42501: must be owner of relation
-- objects.
--
-- Create them via Supabase Dashboard → Storage → Policies →
-- "New policy" → "For full customization":
--
--   Policy 1 — SELECT (read)
--     name:   client_documents_tenant_select
--     allowed operation: SELECT
--     target roles: authenticated
--     USING expression:
--       bucket_id = 'client-documents'
--       AND (storage.foldername(name))[1] = (
--         SELECT tenant_id::text FROM users WHERE id = auth.uid()
--       )
--
--   Policy 2 — INSERT (upload)
--     name:   client_documents_tenant_insert
--     operation: INSERT
--     target roles: authenticated
--     WITH CHECK: same expression as above
--
--   Policy 3 — UPDATE (replace)
--     name:   client_documents_tenant_update
--     operation: UPDATE
--     target roles: authenticated
--     USING: same expression as above
--
--   Policy 4 — DELETE
--     name:   client_documents_tenant_delete
--     operation: DELETE
--     target roles: authenticated
--     USING: same expression as above
--
-- Effect: tenant agents only see/upload/replace/delete files in
-- their own <tenant_id>/* folder. Cross-tenant prefixes return 0
-- rows. super_admin keeps unrestricted access via the existing
-- super_admin bypass at the storage.objects table level.
