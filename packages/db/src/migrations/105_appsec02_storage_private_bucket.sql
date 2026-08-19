-- ============================================================================
-- 105 — APPSEC-02/LGPD-01: bucket 'uploads' PRIVADO + leitura isolada por tenant.
--
-- Antes: a 093 já isolou a ESCRITA (insert/update/delete) por tenant via RLS, mas
-- deixou a LEITURA pública (getPublicUrl) — qualquer um com a URL via cross-tenant
-- (previsível pelo path `tenants/<tid>/...`) lia o arquivo de outro tenant.
--
-- Confirmado via MCP (2026-08-18) que o bucket 'uploads' AINDA NÃO EXISTE em produção
-- (0 rows em storage.buckets, 0 objects) — cria já PRIVADO desde o dia 1, sem nunca
-- passar por uma janela pública. O código (src/lib/storage.ts) passou a usar
-- createSignedUrl em vez de getPublicUrl; a policy SELECT abaixo é o que permite o
-- browser (role authenticated) pedir uma signed URL do PRÓPRIO tenant.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "uploads_select_own_tenant" ON storage.objects;
CREATE POLICY "uploads_select_own_tenant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'uploads'
    AND (storage.foldername(name))[1] = 'tenants'
    AND (storage.foldername(name))[2] = public.get_tenant_id()::text
  );
