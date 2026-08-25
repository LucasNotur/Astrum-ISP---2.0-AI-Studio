-- =============================================================================
-- 113 — S2 (PLANO-100): superfície RPC das funções SECURITY DEFINER
--       + deny-all REAL nas 5 tabelas com RLS ligada e zero policies.
--
-- Idempotente (REVOKE / DROP+CREATE POLICY / COMMENT). Pode ser reaplicada.
--
-- CONTEXTO — advisor `authenticated_security_definer_function_executable` (3 WARN):
-- `get_tenant_id()`, `has_permission()` e `is_super_admin()` são SECURITY DEFINER e
-- executáveis por `authenticated` via PostgREST (`/rest/v1/rpc/<fn>`). A 092 já havia
-- revogado EXECUTE de PUBLIC/anon; sobrou `authenticated` + `service_role` + `postgres`.
--
-- DECISÃO (evidência levantada em 2026-08-25 via MCP, detalhada no plano, tarefa S2):
--
--   • get_tenant_id()  → MANTÉM EXECUTE para `authenticated`. É chamada por ~120
--     policies `{public}` (customers, tickets, invoices, messages, ...) E por 4 policies
--     `{authenticated}` em `storage.objects` (bucket privado `uploads`). Sobretudo, é o
--     alicerce do caminho VIVO MT-02(c) — `withTenantRLS()` faz `SET LOCAL ROLE
--     authenticated` + `set_config('app.current_tenant', ...)` e depende dessa função
--     para isolar por tenant (rotas LGPD, DLQ, voice, OCR, anomaly, metrics-ingest, HSM).
--     Revogar aqui NÃO "endurece" nada: quebra a própria defesa em profundidade e o
--     Storage, silenciosamente (a query inteira falharia por permissão na policy).
--     Exposição via RPC é inócua: devolve o tenant DO PRÓPRIO chamador (via auth.uid());
--     o fallback por GUC não é setável pelo cliente PostgREST (ver migration 096).
--
--   • is_super_admin() → MANTÉM EXECUTE para `authenticated`. Mesma razão: é chamada por
--     12+ policies `{public}` que ficam OR'd com a policy de tenant em tabelas alcançadas
--     pelo caminho `authenticated` (hsm_templates, hsm_send_logs, departments,
--     daily_metrics, upsell_events, voip_calls, users, ...). Via RPC devolve um booleano
--     sobre o PRÓPRIO chamador — e ainda exige AAL2 quando há MFA (migration 106).
--
--   • has_permission(text,text) → **REVOGADA de `authenticated`** (esta migration).
--     É a única das três sem NENHUM uso: zero policies RLS a referenciam (varredura em
--     pg_policies), zero views/funções/triggers/defaults/checks dependem dela e zero
--     chamadas no código da aplicação (só migrations e docs a citam). Hoje ela existe
--     apenas como endpoint RPC — e é um oráculo sobre `role_permissions`, tabela deny-all
--     que o usuário não consegue ler direto. `service_role`/`postgres` mantêm EXECUTE,
--     então qualquer uso futuro pelo backend continua funcionando.
--
-- Os 2 WARN restantes ficam ACEITOS E DOCUMENTADOS (decisão registrada no plano):
-- são pré-requisito do isolamento por tenant, não uma folga de configuração.
--
-- CONTEXTO — advisor `rls_enabled_no_policy` (5 INFO): legacy_docs, node_latency_daily,
-- outbox, role_permissions, schema_migrations têm RLS ON e zero policies. Auditoria de
-- código confirmou que TODAS são acessadas só por `service_role`/owner:
--   legacy_docs        → personas.routes.ts + src/lib/db-compat/firestore.ts (supabaseAdmin)
--   node_latency_daily → ia/latency.routes.ts (supabaseAdmin)
--   outbox             → infrastructure/queue/outbox.service.ts (client de servidor)
--   role_permissions   → has_permission() (SECURITY DEFINER, roda como owner)
--   schema_migrations  → packages/db/src/migrate.ts (conexão pg direta, owner)
-- Ou seja: deny-all é INTENCIONAL. Mas a RLS sozinha não estava entregando deny-all de
-- verdade — as 5 tabelas ainda tinham GRANT de SELECT/INSERT/UPDATE/DELETE **e TRUNCATE**
-- para `authenticated`, herdados de `ALTER DEFAULT PRIVILEGES` do projeto. TRUNCATE não é
-- row-scoped: RLS não o cobre. Confirmado no banco antes desta migration:
-- `has_table_privilege('authenticated','public.outbox','TRUNCATE')` = true.
-- Esta migration fecha isso no nível de GRANT (a barreira que vale para TRUNCATE) e
-- registra o deny-all como policy explícita, encerrando o INFO do advisor.
-- =============================================================================

-- ── Parte 1 — has_permission(): tira a superfície RPC (sem uso comprovado) ───────────
REVOKE EXECUTE ON FUNCTION public.has_permission(text, text) FROM authenticated;

COMMENT ON FUNCTION public.has_permission(text, text) IS
  'RBAC helper (SECURITY DEFINER). S2/2026-08-25: EXECUTE apenas para service_role e postgres. '
  'Nenhuma policy RLS, view, função ou código de aplicação a usa — manter EXECUTE para '
  '`authenticated` só expunha /rest/v1/rpc/has_permission como oráculo sobre role_permissions '
  '(tabela deny-all). Se algum dia uma policy passar a chamá-la, REGRANT para authenticated é '
  'obrigatório, senão a query inteira falha por permissão.';

-- ── Parte 2 — as outras duas: EXECUTE mantido DE PROPÓSITO (documentar no schema) ────
COMMENT ON FUNCTION public.get_tenant_id() IS
  'Resolve o tenant do chamador: auth.uid() (PostgREST) com fallback no GUC app.current_tenant '
  '(migration 096, caminho MT-02c withTenantRLS). S2/2026-08-25: EXECUTE para `authenticated` é '
  'OBRIGATÓRIO — ~120 policies `{public}`, 4 policies de storage.objects (bucket uploads) e o '
  'helper withTenantRLS (SET LOCAL ROLE authenticated) dependem dela. NÃO revogar: o advisor '
  'authenticated_security_definer_function_executable é aceito e documentado (retorna apenas o '
  'tenant do próprio chamador).';

COMMENT ON FUNCTION public.is_super_admin() IS
  'Booleano de super_admin do PRÓPRIO chamador, exigindo AAL2 quando há MFA (migration 106). '
  'S2/2026-08-25: EXECUTE para `authenticated` é OBRIGATÓRIO — 12+ policies `{public}` a chamam '
  'em tabelas alcançadas pelo caminho authenticated (hsm_templates, hsm_send_logs, departments, '
  'daily_metrics, users, ...). NÃO revogar: advisor aceito e documentado.';

-- ── Parte 3 — deny-all REAL nas 5 tabelas de acesso exclusivo por service_role ───────
-- (a) barreira de GRANT — é a única que vale para TRUNCATE
REVOKE ALL ON TABLE
    public.legacy_docs,
    public.node_latency_daily,
    public.outbox,
    public.role_permissions,
    public.schema_migrations
  FROM anon, authenticated;

-- (b) policy explícita: mesmo efeito de "RLS ON + zero policies", mas com a intenção
--     legível no schema e sem o INFO do advisor. `service_role`/`postgres` têm BYPASSRLS.
DROP POLICY IF EXISTS deny_all_non_service ON public.legacy_docs;
CREATE POLICY deny_all_non_service ON public.legacy_docs
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_non_service ON public.node_latency_daily;
CREATE POLICY deny_all_non_service ON public.node_latency_daily
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_non_service ON public.outbox;
CREATE POLICY deny_all_non_service ON public.outbox
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_non_service ON public.role_permissions;
CREATE POLICY deny_all_non_service ON public.role_permissions
  FOR ALL TO public USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS deny_all_non_service ON public.schema_migrations;
CREATE POLICY deny_all_non_service ON public.schema_migrations
  FOR ALL TO public USING (false) WITH CHECK (false);
