-- =============================================================================
-- 108 — Parada de emergência do atendimento IA (kill switch de verdade).
--
-- Contexto: a Fase 4 (retirada do Express, 17-18/08) apagou o webhook/worker
-- legado por completo — o "rollback" que o cutover S74 prometia (trocar
-- ATENDIMENTO_ENGINE de volta pra legacy) não existe mais fisicamente, virou
-- só um interruptor shadow-vs-real do próprio motor v2 (ver
-- apps/api/src/domain/atendimento/shadow-mode.ts). Isto substitui a promessa
-- quebrada por um freio de emergência de verdade: fonte única de verdade no
-- Supabase (sobrevive a restart/flush de Redis), checado por
-- packages/queue/src/workers/message.worker.ts em TODA mensagem antes de
-- chamar o LLM/tools/enviar resposta. Ativar = a IA para de responder
-- automaticamente (mensagem do cliente ainda é salva, pra um humano ver).
--
-- Global (não por tenant) de propósito — só existe 1 super_admin hoje e o
-- cenário de emergência real (custo disparado, resposta perigosa, incidente
-- de segurança em tool-calling) tende a justificar parar tudo, não 1 tenant
-- por vez. Fail-open documentado no código: se a checagem falhar (Supabase
-- fora do ar), assume NÃO parado — um apagão do freio não pode silenciosamente
-- desligar todo o atendimento sem ninguém perceber.
--
-- Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.atendimento_emergency_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason          text NOT NULL,
  activated_at    timestamptz NOT NULL DEFAULT now(),
  activated_by    uuid NOT NULL REFERENCES public.users(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- "Está parado agora?" = existe alguma linha ainda sem deactivated_at.
-- Índice parcial cobre exatamente essa query (rápida mesmo com histórico grande).
CREATE INDEX IF NOT EXISTS idx_atendimento_emergency_stops_active
  ON public.atendimento_emergency_stops (activated_at DESC)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.atendimento_emergency_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atendimento_emergency_stops FORCE ROW LEVEL SECURITY;

-- Só super_admin (via RLS/PostgREST). O worker/rota do apps/api usa
-- supabaseAdmin (service role, bypassa RLS) — é backend checando um kill
-- switch global, não um usuário lendo dado do próprio tenant.
DROP POLICY IF EXISTS super_admin_all_atendimento_emergency_stops ON public.atendimento_emergency_stops;
CREATE POLICY super_admin_all_atendimento_emergency_stops ON public.atendimento_emergency_stops
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.atendimento_emergency_stops FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.atendimento_emergency_stops TO authenticated;
