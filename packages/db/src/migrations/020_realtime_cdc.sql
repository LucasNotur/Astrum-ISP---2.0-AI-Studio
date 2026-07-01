-- Migration 020: Realtime (CDC) setup
-- Habilita Change Data Capture do Supabase Realtime nas tabelas principais.
-- Extraído de supabase-migrations.sql (raiz) para o diretório canônico.
-- Supabase-specific (depende da publicação supabase_realtime).

ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE cobrai_jobs;

-- NOTA: o trigger create_default_cobrai_rules que existia em supabase-migrations.sql
-- NÃO foi reextraído aqui — ele já é a migration canônica 010_cobrai_default_trigger.sql.
