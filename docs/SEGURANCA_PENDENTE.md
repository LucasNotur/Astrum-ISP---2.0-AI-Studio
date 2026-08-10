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

- [ ] **P0-D — CORRIGIDO/REBAIXADO (2026-08-10):** a auditoria dizia "JWT em localStorage". **Verificação do código refuta isso para o app real:** App.tsx usa `supabase.auth.signInWithPassword` com `persistSession: false` → a sessão fica **em memória**, NÃO no localStorage. O `auth-v2.ts` (localStorage `astrum_auth`) NÃO é o caminho ativo; os 3 reads de `sb-access-token` no tech-app não têm gravador (feature morta). **Cookie httpOnly NÃO se aplica bem aqui**: o frontend fala direto com o Supabase PostgREST via supabase-js, que precisa do token acessível ao JS. Ações reais que sobram:
  - [~] **CSP (SEC-R2) — PARCIALMENTE FEITO (2026-08-10):** adicionado ao Express raiz (`server.ts`) um bloco de headers: `Content-Security-Policy-Report-Only` (não bloqueia, só reporta) + `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (esses 4 já enforcing, seguros). ⚠️ **NÃO commitado** — está no working tree junto com seu WIP do `server.ts`; **commite você**. Depois: observar os reports no console do browser, ajustar as diretivas e trocar `-Report-Only` por `Content-Security-Policy` (enforcing). Falta ainda um endpoint `report-uri`/`report-to` para coletar violações fora do console.
  - [ ] Manter `persistSession: false` (é o comportamento seguro).
  - [ ] Limpar/confirmar os reads mortos de `localStorage['sb-access-token']` em `MyDayView.tsx`, `fieldOps.ts`, `ProviderFallbackOrderCard.tsx` (ou ligar um gravador consciente — hoje leem chave nunca escrita).
  - [ ] HIBP continua válido (item P3 acima).
- [ ] **MT-02 (P1)** — backend legado roda tudo por `service_role` (bypassa RLS); isolamento depende de `.where(tenant)` manual. Raiz de classe — ver `firestore.ts`, `mapping.ts`.
- [x] **MT-03 (P1) — FEITO (2026-08-10):** filtro de tenant adicionado nos 3 pontos que rodavam como service_role sem ele: `messageWorker.ts` (customers — antes buscava todos e casava por telefone globalmente), `dbAdmin.ts checkCoverageReal` (network_ctos por CEP — tenantId agora obrigatório, caller no gemini.server passa) e `getBillingStatusReal` (invoices por CPF — tenantId obrigatório; era função latente sem caller). db-compat mapeia `tenantId`→`tenant_id` (firestore.ts:491). Verificado por inspeção + typecheck (erros restantes são pré-existentes, não das minhas linhas). Nota: sem teste unitário dedicado (funções com deps pesadas); a raiz de classe é MT-02.
- [~] **APPSEC-02 (P1) — ESCRITA FECHADA (2026-08-10, migration 093):** INSERT/UPDATE/DELETE no bucket `uploads` agora exigem `tenants/<meu_tenant>/...` (RLS em storage.objects; service_role faz bypass). Provado: próprio path permitido, path alheio negado. ⛔ **Leitura ainda pública** — fechar exige bucket privado + signed URLs no app (o app usa `getPublicUrl` e persiste URLs; migrar para "guardar path, assinar no render") — follow-up de front.
- [~] **SEC-R5 (P1) — PARCIAL (2026-08-10):** ✅ leitura já decifra (`apps/api/src/lib/tenant-keys.ts` tolerante a cifra) + tooling `encryptString/decryptString/looksEncrypted` em `credential-cipher.ts` (5/5 testes). ⛔ **Falta a gravação cifrada**, e isso exige refactor: hoje as chaves são gravadas **direto do browser** (`SettingsPage.tsx:1148`, `src/lib/db.ts:243 saveIntegrationKeys` → `supabase.from('tenants').update(...)`). Cifrar client-side exporia a chave (mesmo problema do CPF). **É preciso um endpoint backend** (browser → apps/api → `encryptString` → Supabase) para salvar `integration_keys`; só então trocar o write direto do SettingsPage por esse endpoint. Sem isso, os dados continuam em texto puro (a leitura só passa a decifrar quando houver dado cifrado).
- [ ] **INFRA-01/02 (P1)** — backend de produção rodando como `npm run dev` numa workstation (SPOF); rate limiter fail-open.
- [~] **OBS-02 (P1, gate de go-live) — FEITO/gated (2026-08-10):** teste real em `apps/api/src/infrastructure/config/rls-isolation.db.test.ts` (conecta no Postgres via `pg`; prova isolamento por tenant + view + bloqueio de escalada MT-01 + não-regressão do backend). Gated em `DATABASE_URL` — pula limpo no CI unitário; lógica reconfirmada via MCP (leak=0). **Para virar gate de verdade:** rodar num job de CI com `DATABASE_URL` de branch/staging. ⚠️ **Achado:** a `DATABASE_URL` do `.env` local está com **senha stale** ("password authentication failed for user postgres") → `npm run db:migrate` / `packages/db/migrate.ts` falhariam com ela; atualizar antes de usar o runner.
- [x] **AUTH-03 (P2) — FEITO:** oráculo de timing no login v2 fechado — `login.route.ts` agora roda um `argon2.verify` contra um hash dummy quando o e-mail não existe, equalizando a latência (impede enumeração de usuário). Login real é mounted/funcional.
- [x] **MT-04 (P2) — FEITO:** `src/middleware/permissionMiddleware.ts` — removido o fallback `x-user-id`/`body.userId` (permitia forjar identidade por header); exige Bearer verificado. Contexto ABAC agora só com `tenantId` + params de rota (sem body/query do cliente). Middleware não é mounted (footgun latente), mas fica seguro se for ligado.
- [ ] **OBS-05 — REVERTIDO + achado novo:** o fail-open do `requireFeature` não foi mexido porque **`src/lib/featureFlags.ts` está QUEBRADO desde o commit `8417192` (Escada R$2,50)**: importa `PLANS` de `plans.ts`, que não existe mais (virou `ASTRUM_LADDER`) → `checkFeatureAccess`/`checkLimit` lançam. Não é mounted (sem impacto em prod), mas o gating de plano/feature está inteiro não-funcional e o teste `featureFlags.test.ts` está vermelho. **Decisão:** consertar exige reescrever `featureFlags.ts` para o novo modelo da Escada (refactor, não patch) — fazer junto quando for ligar o gating. Só então aplicar o fail-closed.
- [x] **OBS-06 (P2) — FEITO:** `src/lib/logger.ts` agora redige PII (cpf/cnpj/telefone/email/endereço/token/conteúdo de mensagem/base64) antes de logar, preservando campos estruturais (tenant_id, phone_last4, latency_ms). Teste 3/3. (Ainda pendente: pino/Sentry do apps/api — OBS-09.)
- [ ] **SCA-01 (P3) — AÇÃO SUA:** `firebase-admin` está em devDependencies e **não é importado em lugar nenhum** (confirmado por grep) — viola R2. Remover com `npm uninstall firebase-admin` (não fiz para não churnar o package-lock num commit de segurança).
- [ ] **P2/P3 restantes** — ver registro completo em `docs/AUDITORIA_PREPROD_2026-08-10.md` (§3).

## 📋 Recomendações de processo (Squad Governança)
- [ ] Pentest externo black-box humano antes do go-live (esta auditoria é IA se auto-revisando).
- [ ] Tabletop de resposta a incidente (rodar um runbook ao vivo).
- [ ] MFA + break-glass para a conta Dev/superusuário (`lucaspferraz123@gmail.com`).
