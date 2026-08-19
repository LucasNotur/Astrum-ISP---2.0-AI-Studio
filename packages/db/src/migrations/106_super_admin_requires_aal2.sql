-- ============================================================================
-- 106 — Break-glass: is_super_admin() passa a EXIGIR AAL2 (MFA) uma vez que a
-- conta tenha um fator verificado. (Recomendação de processo da auditoria
-- 2026-08-10: "MFA + break-glass para a conta Dev/superusuário".)
--
-- Contexto: hoje só existe 1 super_admin (lucaspferraz123@gmail.com) e ele NÃO
-- tem nenhum fator MFA cadastrado ainda (confirmado via MCP, auth.mfa_factors
-- vazio p/ esse user_id). Se a checagem exigisse aal2 incondicionalmente, a
-- primeira migration já travaria o próprio Dev fora do super_admin (self-lockout
-- — ninguém mais tem esse papel pra desfazer). Por isso a regra é CONDICIONAL:
--   - Sem fator MFA verificado cadastrado → comportamento de hoje (aal1 basta).
--   - Assim que existir 1+ fator MFA VERIFICADO → toda sessão super_admin
--     PRECISA ter completado o desafio (aal2); sessão aal1 perde o privilégio
--     até re-autenticar com o 2º fator.
-- Ou seja: o gate liga sozinho no momento em que o Dev cadastrar o TOTP — não
-- precisa de outra migration depois disso.
--
-- Escopo: isto endurece o `is_super_admin()` usado pelas policies RLS (caminho
-- PostgREST/supabase-js do frontend legado, onde o auth.jwt() real existe). NÃO
-- cobre o login próprio do apps/api (POST /api/v2/auth/login — senha contra
-- users.password_hash, sem relação nenhuma com Supabase Auth/MFA); isso seria
-- outro projeto (2º fator dentro do apps/api). Ver docs/SEGURANCA_PENDENTE.md.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
  AND (
    NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status = 'verified'
    )
    OR (auth.jwt() ->> 'aal') = 'aal2'
  );
$function$;
