-- =============================================================================
-- 101 — Tabela `voip_calls` (CDR de click-to-call; Fase 1 migração, backlog VoIP).
--
-- Registro de chamadas (Call Detail Record) do click-to-call do operador
-- (ChatPage). Provider-AGNÓSTICA: serve tanto p/ SIP.js + trunk BR (recomendado)
-- quanto p/ um vendor (Twilio/Telnyx) — o `provider` e `provider_call_id`
-- absorvem a diferença; o resto de específico vai em `extra`.
--
-- ⚠️ A tabela é criada AGORA (prep), mas o código de VoIP só será construído
-- quando houver um trunk SIP real (credenciais). Aditiva, idempotente, RLS por tenant.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.voip_calls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  ticket_id         uuid,
  operator_id       uuid,
  direction         text NOT NULL DEFAULT 'outbound',   -- 'outbound' | 'inbound'
  from_number       text,
  to_number         text,
  provider          text,                                -- 'sip' | 'twilio' | 'telnyx' | ...
  provider_call_id  text,                                -- SIP Call-ID ou sid do vendor
  status            text NOT NULL DEFAULT 'initiated',   -- initiated|ringing|answered|completed|failed|busy|no_answer
  duration_seconds  integer,
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  extra             jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_voip_calls_tenant ON public.voip_calls(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_voip_calls_ticket ON public.voip_calls(ticket_id);

ALTER TABLE public.voip_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_calls FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_voip_calls ON public.voip_calls;
CREATE POLICY tenant_own_voip_calls ON public.voip_calls
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_voip_calls ON public.voip_calls;
CREATE POLICY super_admin_all_voip_calls ON public.voip_calls
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.voip_calls FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voip_calls TO authenticated;
