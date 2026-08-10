-- ============================================================================
-- 093 — APPSEC-02: isolar ESCRITA no bucket 'uploads' por tenant.
-- APLICADA em prod via MCP em 2026-08-10 + verificada. Idempotente.
--
-- Antes: INSERT WITH CHECK (bucket_id='uploads') → qualquer authenticated gravava/
-- sobrescrevia arquivo em QUALQUER path, inclusive de outro tenant (validateTenantPath
-- em storage.ts é só JS client-side, contornável via Storage API direto).
-- Agora: INSERT/UPDATE/DELETE exigem que o 2º segmento do path (tenants/<tid>/...) seja
-- o tenant do chamador. service_role (workers) tem BYPASS e não é afetado.
--
-- Leitura mantida PÚBLICA por ora (o app usa getPublicUrl e compartilha URLs de anexo).
-- Fechar leitura cross-tenant exige bucket privado + signed URLs no app → follow-up.
-- ============================================================================

DROP POLICY IF EXISTS "uploads_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "uploads_insert_own_tenant" ON storage.objects;
CREATE POLICY "uploads_insert_own_tenant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = 'tenants'
    AND (storage.foldername(name))[2] = public.get_tenant_id()::text
  );

DROP POLICY IF EXISTS "uploads_update_own_tenant" ON storage.objects;
CREATE POLICY "uploads_update_own_tenant" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[2] = public.get_tenant_id()::text)
  WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[2] = public.get_tenant_id()::text);

DROP POLICY IF EXISTS "uploads_delete_own_tenant" ON storage.objects;
CREATE POLICY "uploads_delete_own_tenant" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[2] = public.get_tenant_id()::text);
