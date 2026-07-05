-- 032_storage_uploads.sql — Plano FIRESTORE-ZERO (FZ-0).
-- Bucket de uploads (substitui Firebase Storage: anexos de chat, fotos de técnicos).

INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Autenticados podem subir; leitura pública (URLs de anexo são compartilhadas no chat)
DROP POLICY IF EXISTS "uploads_insert_authenticated" ON storage.objects;
CREATE POLICY "uploads_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads');

DROP POLICY IF EXISTS "uploads_read_public" ON storage.objects;
CREATE POLICY "uploads_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');
