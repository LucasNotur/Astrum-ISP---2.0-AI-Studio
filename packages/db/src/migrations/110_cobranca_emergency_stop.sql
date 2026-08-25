-- =============================================================================
-- 110 — Parada de emergência da cobrança CobrAI (kill switch de verdade).
--
-- Contexto (C1 — Option A na cobrança, 2026-08-25): `COBRAI_ENGINE=legacy` não
-- revertia mais nada — o worker legado (`src/workers/cobraiWorker.ts`) só era
-- bootado pelo Express, apagado por completo na Fase 4 (2026-08-17/18). Setar a
-- flag pra 'legacy' apenas impedia o worker v2 de subir e nada subia no lugar:
-- desligava a cobrança inteira sem ninguém perceber. Mesmo defeito que o
-- atendimento tinha, resolvido em 2026-08-23 pela migration 108
-- (`atendimento_emergency_stops`). Esta tabela replica o mesmo padrão para a
-- cobrança: fonte única de verdade no Supabase (sobrevive a restart/flush de
-- Redis), checada por packages/queue/src/workers/cobrai.worker.ts ANTES de
-- enviar qualquer mensagem via WhatsApp (send_message/suspend_signal). Ativar =
-- CobrAI para de ENVIAR mensagens, mas continua PROCESSANDO o resto (lockout de
-- tenant inadimplente com a Astrum, eventos invoice.paid, reactivate,
-- notify_human) — não é um kill switch total como o do atendimento.
--
-- Global (não por tenant), mesmo raciocínio da 108: só existe 1 super_admin hoje
-- e o cenário de emergência real (mensagem de cobrança errada em massa, bug no
-- gate) tende a justificar parar tudo. Fail-open documentado no código
-- (`emergency-stop.service.ts`, reaproveitado — ver
-- domain/cobranca/cobrai-emergency-stop.routes.ts): se a checagem falhar
-- (Supabase fora do ar), assume NÃO parado.
--
-- Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cobranca_emergency_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason          text NOT NULL,
  activated_at    timestamptz NOT NULL DEFAULT now(),
  activated_by    uuid NOT NULL REFERENCES public.users(id),
  deactivated_at  timestamptz,
  deactivated_by  uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- "Está parado agora?" = existe alguma linha ainda sem deactivated_at.
CREATE INDEX IF NOT EXISTS idx_cobranca_emergency_stops_active
  ON public.cobranca_emergency_stops (activated_at DESC)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.cobranca_emergency_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobranca_emergency_stops FORCE ROW LEVEL SECURITY;

-- Só super_admin (via RLS/PostgREST). O worker/rota do apps/api usa
-- supabaseAdmin (service role, bypassa RLS) — é backend checando um kill
-- switch global, não um usuário lendo dado do próprio tenant.
DROP POLICY IF EXISTS super_admin_all_cobranca_emergency_stops ON public.cobranca_emergency_stops;
CREATE POLICY super_admin_all_cobranca_emergency_stops ON public.cobranca_emergency_stops
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.cobranca_emergency_stops FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.cobranca_emergency_stops TO authenticated;
