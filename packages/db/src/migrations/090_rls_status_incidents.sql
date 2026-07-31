-- Habilita RLS em status_incidents (alerta de segurança do Supabase).
-- Leitura pública (status page), escrita só para super_admin.
ALTER TABLE status_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_incidents_read_public" ON status_incidents
  FOR SELECT USING (true);

CREATE POLICY "status_incidents_write_admin" ON status_incidents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );
