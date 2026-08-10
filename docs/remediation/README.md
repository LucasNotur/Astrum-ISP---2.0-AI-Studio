# Remediação dos P0 de banco

> ✅ **STATUS: APLICADO EM PRODUÇÃO em 2026-08-10 e VERIFICADO.** A versão canônica e
> idempotente do que foi aplicado está em `packages/db/src/migrations/092_p0_rls_hardening.sql`.
> Os arquivos `.sql` avulsos abaixo são o design/rationale por achado (histórico da auditoria).
>
> Verificação executada: teste de isolamento real (usuário do tenant A vê 60 clientes do próprio
> tenant e **0** de outros, inclusive via `vw_agent_customers`) + teste de escalada (UPDATE para
> `super_admin` e troca de `tenant_id` bloqueados com `insufficient_privilege`) + teste de não-regressão
> (update comum de perfil e mudança de role pelo backend/service_role continuam funcionando).
> Advisors de segurança: **0 ERROR** restantes (os 4 ERROR — 3 views + schema_migrations — foram fechados).
>
> ⚠️ Correção importante aplicada vs. a proposta original: o trigger MT-01 precisou ser
> **SECURITY INVOKER** (não DEFINER) — com DEFINER, `current_user` vira `postgres` dentro da
> função e a guarda nunca bloqueava. O teste pós-aplicação pegou isso.

> Geradas pela auditoria de 2026-08-10 (`docs/AUDITORIA_PREPROD_2026-08-10.md`).

## Como promover para produção (fluxo seguro)

1. **Revisar** cada `.sql` abaixo e ajustar as decisões marcadas `-- REVISAR:`.
2. **Testar em branch Supabase** (nunca direto em prod):
   ```bash
   # cria branch efêmera, aplica, roda o teste de isolamento real, destrói
   ```
   Use uma Supabase branch (ou banco de staging) e rode o **teste de RLS real** (OBS-02)
   provando que o tenant A enxerga 0 linhas do tenant B via as views e via PATCH em `users`.
3. Só então **copiar** o arquivo revisado para `packages/db/src/migrations/092_*.sql` (próximo número livre)
   e aplicar com `npm run db:migrate`.
4. Após aplicar: `get_advisors(security)` deve zerar os 3 ERROR de `security_definer_view`.

## Arquivos

| Arquivo | Achado | O que faz | Risco de regressão |
|---|---|---|---|
| `P0-A_views_security_invoker.sql` | P0-A | Recria `vw_agent_*` com `security_invoker=true` + revoga SELECT de `anon` | Baixo — backend usa service_role (bypassa RLS); frontend passa a respeitar RLS |
| `P0-B_revoke_anon_grants.sql` | P0-B | REVOKE de todos os privilégios de `anon`; reseta default privileges; FORCE RLS nas tabelas tenant-scoped | Médio — **validar** que nenhuma tela usa `anon` para ler tabela pública (ex.: status page) |
| `MT-01_users_prevent_self_escalation.sql` | MT-01 | Trigger que bloqueia usuário de alterar a própria `role`/`tenant_id` (só super_admin pode) | Baixo |
| `P0-C_functions_search_path.sql` | P0-C | `SET search_path=''` nas funções SECURITY DEFINER + REVOKE EXECUTE de `anon` | Baixo |

## Fora de escopo destas migrations (são correções de CÓDIGO/CONFIG)
- **P0-D** — JWT em cookie httpOnly + ligar HIBP no painel Supabase Auth (config, não SQL).
- **AUTH-01** — `aud` separado para token de assinante + enforcement em `authenticate` (código `apps/api`).
- **SEC-R1/APPSEC-01** — mover cifra de CPF/ERP para o backend, sem `VITE_`, fail-closed (código `src/lib/db.ts`, `dbAdmin.ts`).
