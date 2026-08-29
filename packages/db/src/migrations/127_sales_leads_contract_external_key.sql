-- 127_sales_leads_contract_external_key.sql
-- P3-03 Fase A (contrato digital) — persistir o id externo do documento no provedor
-- de assinatura (document key da Clicksign / uuid da D4Sign).
--
-- Motivo: `ContractResult.externalKey` já era retornado por sendContract() mas não
-- tinha onde ser guardado no sales_leads. Sem ele não dá pra reconciliar o webhook de
-- assinatura (Fase C: mover contract_status pending_signature -> signed casando pelo
-- id do documento). Coluna aditiva e nullable — não afeta leads existentes.
-- Ver .astrum-progress/PLANO_P3_03_CONTRATO_DIGITAL.md.

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS contract_external_key text;

COMMENT ON COLUMN public.sales_leads.contract_external_key IS
  'Id do documento no provedor de assinatura (Clicksign document key / D4Sign uuid). Usado pra reconciliar o webhook de assinatura. P3-03.';
