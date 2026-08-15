-- =============================================================================
-- 095 — BILL-08: trilha de auditoria (audit_log) IMUTÁVEL de verdade.
--
-- ⚠️ NÃO APLICADA — staged localmente (revisão + apply manual pelo runner, como a 094).
-- Idempotente.
--
-- Problema: a migration 007 já DECLARA no comentário "Log imutável... apenas INSERT",
-- mas nada impedia UPDATE/DELETE:
--   • a policy `super_admin_all_audit` é FOR ALL → super_admin podia editar/apagar;
--   • o backend roda por `service_role`, que BYPASSA RLS → podia editar/apagar.
-- Uma trilha de auditoria que pode ser adulterada/apagada não é trilha (BILL-08).
-- No código, `audit_log` é 100% append-only (só `.insert()` — verificado por grep),
-- então travar UPDATE/DELETE não quebra nenhum fluxo real.
--
-- Solução: trigger BEFORE UPDATE OR DELETE que SEMPRE lança. Um trigger comum vale
-- para TODOS os papéis (inclusive service_role e o dono da tabela) — é o padrão de
-- "append-only ledger" no Postgres. INSERT segue livre.
--
-- Retenção (LGPD): expurgo de logs antigos passa a exigir janela de manutenção
-- (DROP TRIGGER → purga → CREATE TRIGGER) ou particionamento com DROP PARTITION.
-- Para uma trilha de segurança, imutabilidade > conveniência de purga ad-hoc.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'audit_log é imutável (append-only): operação % negada', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();
