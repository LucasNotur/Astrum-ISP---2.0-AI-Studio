-- 120_customer_notes.sql
-- Notas por cliente (CustomerDetailSheet.tsx) — decisão do Lucas (2026-08-27): tabela
-- nova, não reaproveitar `ai_reflections` (é outro conceito — diário do Cérebro
-- Noturno, reflection_date/metrics/hypotheses/actions, não nota por entidade).
--
-- A tela já tinha um slot pronto no timeline (`type: 'reflection'`, ícone Brain) que
-- sempre ficava vazio (`setReflections([])` hardcoded) porque a tabela `reflections`
-- nunca existiu. Esta migration cria o destino real; a rota e o frontend passam a
-- usar `customer_notes`.

CREATE TABLE IF NOT EXISTS public.customer_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  body        text NOT NULL,
  created_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_tenant ON public.customer_notes (tenant_id);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_customer_notes ON public.customer_notes;
CREATE POLICY tenant_own_customer_notes ON public.customer_notes
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_customer_notes ON public.customer_notes;
CREATE POLICY super_admin_all_customer_notes ON public.customer_notes
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.customer_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
