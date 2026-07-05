-- 034_fix_users_rls_recursion.sql
-- Corrige "42P17: infinite recursion detected in policy for relation users".
--
-- As políticas tenant_isolation e super_admin_all da tabela `users` faziam
-- subquery na PRÓPRIA tabela users dentro do USING. Ao avaliar a política, o
-- Postgres reaplica RLS na subquery → recursão infinita. Isso ficou latente
-- enquanto as queries passavam pelo backend (service_role bypassa RLS), mas
-- o Plano FZ moveu o frontend para consultar o Supabase DIRETO (anon + JWT do
-- usuário), então o RLS passou a ser exercido e o bug apareceu (login não
-- consegue ler o próprio usuário; toda tabela cujo policy referencia users falha).
--
-- Correção: usar funções SECURITY DEFINER (que bypassam RLS) em vez de subquery
-- direta. get_tenant_id() já existe; criamos is_super_admin() no mesmo padrão.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- tenant_isolation: usuário enxerga a própria linha e as do seu tenant,
-- sem subquery recursiva (get_tenant_id é SECURITY DEFINER).
DROP POLICY IF EXISTS tenant_isolation ON public.users;
CREATE POLICY tenant_isolation ON public.users
  FOR ALL
  USING (id = auth.uid() OR tenant_id = public.get_tenant_id());

-- super_admin_all: acesso total para super admins, via função SECURITY DEFINER.
DROP POLICY IF EXISTS super_admin_all ON public.users;
CREATE POLICY super_admin_all ON public.users
  FOR ALL
  USING (public.is_super_admin());
