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
-- Files are stored under <tenant_id>/<client_id>/<filename>. Tenant
-- agents can read/write/delete only inside their own tenant's
-- folder; cross-tenant access is blocked by the prefix check.
-- super_admin gets unrestricted via the existing super_admin
-- bypass at the table level (covered by 044/046 hotfixes).

-- Drop and recreate so a re-run produces the canonical state.
DROP POLICY IF EXISTS client_documents_tenant_select ON storage.objects;
CREATE POLICY client_documents_tenant_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS client_documents_tenant_insert ON storage.objects;
CREATE POLICY client_documents_tenant_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS client_documents_tenant_update ON storage.objects;
CREATE POLICY client_documents_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS client_documents_tenant_delete ON storage.objects;
CREATE POLICY client_documents_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM users WHERE id = auth.uid()
    )
  );

COMMENT ON POLICY client_documents_tenant_select ON storage.objects IS
  'Authenticated users can list/read files under <their-tenant-id>/* in client-documents. Cross-tenant prefixes return 0 rows.';
