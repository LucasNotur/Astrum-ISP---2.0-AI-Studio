# 🔐 Segurança — Estado e Pendências (START HERE)

> **Ponto único de retomada.** Auditoria pré-produção iniciada em **2026-08-10**.
> Se você (ou uma nova sessão da IA) está voltando a este trabalho, comece por aqui.
>
> **Documentos irmãos:**
> - `docs/AUDITORIA_PREPROD_2026-08-10.md` — relatório completo (sumário executivo, registro de riscos P0–P3, o que falta, o que remover).
> - `docs/RUNBOOKS_SEGURANCA.md` — runbooks de incidente (vazamento de chave, LGPD/ANPD, rollback, etc.).
> - `docs/remediation/` — SQL de correção dos P0 de banco (design + rationale). Aplicado via `packages/db/src/migrations/092_p0_rls_hardening.sql`.
> - `.astrum-progress/PROMPT_AUDITORIA_PRODUCAO_WAR_ROOM.md` — o prompt/missão original.

**Nota de escala honesta:** o banco hoje é escala de *seed* (2 tenants, ~90 clientes). As falhas são estruturais e escalam para os ~10k usuários no go-live. **Nota de prontidão na auditoria: 27/100. Go-live BLOQUEADO até fechar os P0.**

---

## ✅ JÁ FEITO (aplicado e verificado)

### Banco de dados — aplicado em produção via MCP + verificado (migration `092_p0_rls_hardening.sql`)
- [x] **P0-A** — views `vw_agent_*` eram `SECURITY DEFINER` sem filtro de tenant → viravam vazamento cross-tenant. Agora `security_invoker=true` + SELECT revogado de `anon`. *Provado: usuário do tenant A vê 60 clientes próprios e 0 de outros, inclusive via a view.*
- [x] **P0-B** — `anon` tinha GRANT total em ~104 tabelas. `REVOKE ALL … FROM anon` (0 grants restantes) + `FORCE ROW LEVEL SECURITY` em 96 tabelas + default privileges travados.
- [x] **P0-C** — `get_tenant_id/is_super_admin/has_permission` com `search_path` fixo + refs qualificadas + REVOKE EXECUTE de `anon`.
- [x] **MT-01** — auto-elevação a `super_admin`/troca de `tenant_id` via `UPDATE` em `users`. Trigger `prevent_user_privilege_self_change` (**SECURITY INVOKER**) bloqueia. *Provado: escalada e troca de tenant dão `insufficient_privilege`; backend e update comum seguem OK.*
- [x] Extras: `schema_migrations` com RLS; 2 funções helper com search_path fixo. **Advisors: 0 ERROR restantes.**

### Código — implementado, testado, commitado (aguardando ações operacionais abaixo)
- [x] **AUTH-01** — token de assinante (`role:'subscriber'`) era aceito em rotas de operador (lia o atendimento de todos os clientes via `/api/v2/conversations/inbox`). O decorator `authenticate` agora rejeita `role==='subscriber'`/`aud==='subscriber-portal'`; token de assinante ganhou `aud` próprio. *(19/19 testes do portal passam.)*
- [x] **SEC-R1 / APPSEC-01** — cifra de CPF/ERP era fail-open, com chave `VITE_*` no bundle e fallback de zeros. Nova `src/lib/fieldCipher.ts` fail-closed (sem `VITE_`, sem chave-zero, nunca grava texto puro); cópia morta removida de `db.ts`; `dbAdmin.ts` delega ao módulo seguro. *(6/6 testes passam.)*

---

## ⛔ PENDENTE — AÇÕES OPERACIONAIS SUAS (não são código; bloqueiam o efeito das correções)

- [ ] **P1. Definir `CPF_ENCRYPTION_KEY`** no `.env` local, no Vercel e no host de produção (32 bytes hex, SEM prefixo `VITE_`).
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  ⚠️ A cifra agora é **fail-closed**: sem esta env, criar cliente / ler credencial de ERP passa a **lançar erro** (é o comportamento correto, mas exige a env definida).

- [ ] **P2. Re-semear ou re-cifrar o dado de seed existente.** Os ~90 clientes atuais foram "cifrados" com a chave-zero antiga; ao definir uma chave nova, o `decrypt` deles vai lançar (tag GCM não bate). Como é seed, o mais simples é re-semear após definir a env. *(Nenhuma migração de dado foi executada — decisão sua.)*

- [ ] **P3. Ligar Leaked Password Protection (HIBP)** — Supabase Dashboard → Authentication → Policies → habilitar "Leaked password protection". *(Parte do P0-D; é toggle de painel, não dá por SQL.)*

- [ ] **P4. Revisar o `git diff` do commit de segurança** antes de deploy (arquivos listados no commit `security:` de 2026-08-10).

---

## 🔜 PRÓXIMOS P0/P1 (ainda não iniciados)

- [ ] **P0-D (resto)** — migrar o JWT do frontend de `localStorage` (`sb-access-token`) para **cookie httpOnly+Secure+SameSite**. É refactor de front (afeta `MyDayView.tsx`, `fieldOps.ts`, todos os `getSession`/fetch autenticados) — precisa de plano dedicado. Amplificado pela falta de CSP (SEC-R2).
- [ ] **MT-02 (P1)** — backend legado roda tudo por `service_role` (bypassa RLS); isolamento depende de `.where(tenant)` manual. Raiz de classe — ver `firestore.ts`, `mapping.ts`.
- [ ] **MT-03 (P1)** — leaks cross-tenant no pipeline de IA (`messageWorker.ts:604`, `dbAdmin.ts:206,219`) — `customers`/`network_ctos`/billing por CPF sem filtro de tenant.
- [ ] **APPSEC-02 (P1)** — bucket Storage `uploads` `public=true` com escrita/leitura cross-tenant.
- [ ] **SEC-R5 (P1)** — `integration_keys` (OpenAI/WhatsApp) em texto puro no banco → migrar para a cifra.
- [ ] **INFRA-01/02 (P1)** — backend de produção rodando como `npm run dev` numa workstation (SPOF); rate limiter fail-open.
- [ ] **OBS-02 (P1, gate de go-live)** — teste de RLS real contra o Postgres (o atual é mock em memória; foi o que deixou os P0 passarem).
- [ ] **P2/P3** — ver registro completo em `docs/AUDITORIA_PREPROD_2026-08-10.md` (§3).

## 📋 Recomendações de processo (Squad Governança)
- [ ] Pentest externo black-box humano antes do go-live (esta auditoria é IA se auto-revisando).
- [ ] Tabletop de resposta a incidente (rodar um runbook ao vivo).
- [ ] MFA + break-glass para a conta Dev/superusuário (`lucaspferraz123@gmail.com`).
