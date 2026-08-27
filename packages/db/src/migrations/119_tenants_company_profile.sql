-- 119_tenants_company_profile.sql
-- Adiciona as colunas do perfil da empresa (aba "Geral" da SettingsPage) em `tenants`.
--
-- Achado colateral da F1-C (PLANO_ACAO_100_OPERACIONAL.md): `saveCompanySettings`
-- fazia `supabase.from('tenants').update(cleanSettings)` espalhando QUALQUER chave
-- do estado Zustand `companySettings` como nome de coluna, sem allowlist — e só
-- `name` existia de fato na tabela real, então o update inteiro falhava (Postgres
-- rejeita update com coluna inexistente) sempre que qualquer outro campo mudava.
--
-- Corrigido junto com esta migration: `saveCompanySettings` passa a chamar
-- PUT /api/v2/settings/company (allowlist explícita), que grava só nestas colunas.
--
-- Aditiva e não-destrutiva. `tenants` já tem RLS por tenant.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS logo_url      text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS working_hours text,
  ADD COLUMN IF NOT EXISTS timezone      text NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN public.tenants.logo_url IS
  'URL/data-URI do logo do tenant (whitelabel) — SettingsPage.tsx, aba Geral.';
COMMENT ON COLUMN public.tenants.working_hours IS
  'Texto livre de horário de atendimento exibido ao cliente (ex.: "08:00 - 20:00") — não é regra de negócio, só exibição.';
