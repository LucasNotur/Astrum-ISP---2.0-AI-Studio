-- =============================================================================
-- 125 — Resultados da sonda sintética 24/7 (Synthetic Monitoring).
--
-- Contexto: o worker packages/queue/src/workers/synthetic-monitor.worker.ts
-- roda a cada 15min desde S88 (2026-07-21) mas SEMPRE foi um no-op —
-- createSyntheticMonitorWorker() era chamado sem `ports` em server.ts, então
-- o processor caía direto no `if (!ports) return`. Nunca probou nada, nunca
-- alertou, nunca gravou nada. Esta tabela é o destino real de
-- recordProbeResult() agora que os ports foram implementados de verdade
-- (synthetic-monitor.ports.ts): envia mensagem sintética via pipeline real
-- de webchat (mesmo agente/RAG/LLM que atende cliente de verdade, sem custo
-- de WhatsApp) contra o tenant sandbox (`tenants.is_sandbox = true`).
--
-- Alimenta a seção "Sonda Sintética" do HealthDashboardPage.tsx (antes
-- hardcoded como array vazio).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.synthetic_probe_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  success     boolean NOT NULL,
  latency_ms  integer NOT NULL,
  response    text,
  error       text,
  probed_at   timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Dashboard lê "últimas N probes" — cobre exatamente essa query.
CREATE INDEX IF NOT EXISTS idx_synthetic_probe_results_probed_at
  ON public.synthetic_probe_results (probed_at DESC);

ALTER TABLE public.synthetic_probe_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synthetic_probe_results FORCE ROW LEVEL SECURITY;

-- Só super_admin (via RLS/PostgREST). O worker/rota do apps/api usa
-- supabaseAdmin (service role, bypassa RLS) pra gravar/ler — é telemetria
-- operacional da Astrum, não dado de tenant.
DROP POLICY IF EXISTS super_admin_all_synthetic_probe_results ON public.synthetic_probe_results;
CREATE POLICY super_admin_all_synthetic_probe_results ON public.synthetic_probe_results
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.synthetic_probe_results FROM anon;
GRANT SELECT ON public.synthetic_probe_results TO authenticated;
