# Auditoria de Segurança Pré-Produção — Astrum ISP
**Data:** 2026-08-10 · **Conduzido por:** Principal Engineer + war room (7 squads em paralelo + verificação adversarial) · **Método:** análise estática (repo) + validação read-only no Supabase de produção (projeto `dnisztuafnpzlkutgbiw`).

> Auditoria de **leitura e proposta**. Nada foi alterado no código ou no banco. Toda afirmação relevante cita `arquivo:linha` ou consulta ao banco. Achados marcados "hipótese — validar" não foram confirmados por evidência direta.

---

## 1. SUMÁRIO EXECUTIVO

### Nota de prontidão para go-live: **27 / 100** — **NÃO PRONTO (go-live condicionado)**

Fundação de engenharia acima da média no motor novo (`apps/api`: pino com redact, OTel, helmet, HMAC timing-safe, idempotência), mas a **borda que efetivamente serve produção hoje** (Express `/src` + `server.ts` + Supabase acessado por `service_role`) tem falhas estruturais que quebram os três pilares de um SaaS multi-tenant LGPD: **isolamento de tenant, confidencialidade de PII e segregação de privilégio**. São **7 P0 reais**, a maioria explorável por **qualquer usuário logado** (não exige insider nem RCE), usando o `anon key` já público no bundle + um JWT de conta comum.

**Blast radius atual:** banco em escala de *seed* (2 tenants, 90 clientes, 221 faturas, 6 usuários). As falhas são **estruturais** e escalam para os ~10k usuários no go-live.

### Top 5 riscos que bloqueiam o go-live

| # | Risco | Por que bloqueia |
|---|---|---|
| 1 | **Cripto de CPF e credenciais ERP efetivamente nula** (SEC-R1 / APPSEC-01) | Chave AES com prefixo `VITE_` (no bundle público), fallback all-zeros e **fail-open para texto puro**. Cifra at-rest de PII de brasileiros decodificável por qualquer um. |
| 2 | **`anon` com GRANT total + 3 views SECURITY DEFINER sem filtro de tenant** (P0-A + P0-B) | Qualquer usuário autenticado lê dados de **todos os tenants** via PostgREST. RLS é a única barreira e tem furos. |
| 3 | **Auto-elevação a `super_admin` / troca de `tenant_id` via UPDATE em `users`** (MT-01) | Policy `FOR ALL` sem `WITH CHECK` de coluna + GRANT UPDATE a `authenticated`. Um `PATCH /rest/v1/users` vira admin de plataforma ou entra no tenant da vítima. **Confirmado em nível de banco.** |
| 4 | **Token de assinante aceito em rotas de operador** (AUTH-01) | Mesmo `JWT_SECRET`, `authenticate` não checa `aud`/`role`; `/api/v2/conversations/inbox` devolve o atendimento de **todos os clientes** do provedor a um assinante logado. |
| 5 | **Segredos de integração em texto puro + bucket Storage público cross-tenant** (SEC-R5 + APPSEC-02) | `tenants.integration_keys` (OpenAI/WhatsApp) sem cifra; bucket `uploads` `public=true` com escrita/leitura cross-tenant → exfiltração de PII e sequestro do canal WhatsApp. |

### Estamos prontos? **NÃO.** Bloquear go-live até fechar os 7 P0. Com os P0 remediados + teste de isolamento real no gate (OBS-02), a nota sobe para ~65 e o go-live passa a ser discutível com os P1 endereçados em 30 dias.

---

## 2. MAPA DE VERDADE (Fase 0)

### Divergências do contexto declarado
| Declarado | Real | Evidência |
|---|---|---|
| ~22 páginas | **38 páginas** `.tsx` | `src/pages/` |
| — | Banco em **us-east-2 (Ohio/EUA)** — transferência internacional LGPD | projeto `dnisztuafnpzlkutgbiw` |
| Firestore 100% removido | Removido do runtime; `firebase-admin@14.1.0` ainda em devDeps, `firestore.rules`/`firestore.ts` versionados (vetor de violação R2) | `package.json:149` |
| Backend = Express | Híbrido: Express:3000 + Fastify:3001 via proxy `/api/v2` | `server.ts:11-35` |

### Topologia e trust boundaries
```
[Browser: 38 páginas React/Vite]  JWT em localStorage 'sb-access-token' · anon key no bundle
   ├─(A)─> Supabase PostgREST  ← só o RLS protege (com furos: P0-A/B/C, MT-01)
   └─(B)─> Vercel /api/* → api.astrumlabs.online (Cloudflare Tunnel, SPOF)
              └─ Express(3000) + Fastify(3001) → Supabase(service_role, bypassa RLS), Redis, Qdrant, OpenAI/Anthropic/Gemini, Evolution(WhatsApp), Zep, BullMQ
```
Existem **dois caminhos até os dados**: (A) direto browser→Postgres (onde vivem os P0 de RLS) e (B) via backend, que roda como `service_role` e **ignora o RLS** — o isolamento no backend depende de filtro `.where(tenant)` manual em cada query (MT-02).

### Estado real do banco (validação read-only)
- ~104 tabelas; role `anon` com **GRANT total** (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) em todas; **nenhuma** tabela com `FORCE ROW LEVEL SECURITY`.
- Advisors Supabase: **3 ERROR** (views SECURITY DEFINER), ~8 WARN (search_path mutável, funções exec por anon, HIBP off), 5 INFO (RLS sem policy).
- Tabelas-base (`customers/invoices/tickets/users`) com policy `tenant_id = get_tenant_id()` — corretas contra `anon` (auth.uid() NULL). O furo está nas **views** e no **UPDATE de `users`**.

---

## 3. REGISTRO DE RISCOS CONSOLIDADO (pós-veredicto adversarial)

### P0 — Bloqueiam go-live
| ID | Componente | Descrição | Evidência | Remediação | Esf |
|---|---|---|---|---|---|
| P0-A | Views SECURITY DEFINER | `vw_agent_customers/invoices/tickets` sem filtro tenant, owner=postgres, SELECT p/ anon → qualquer logado vê todos os tenants | Advisor=ERROR (confirmado) | Recriar com `security_invoker`/filtro `get_tenant_id()`; revogar SELECT de anon | M |
| P0-B | GRANT `anon` | anon com escrita/leitura em ~104 tabelas; nenhuma FORCE RLS | Confirmado via `role_table_grants` | REVOKE amplo; mínimo privilégio; `FORCE ROW LEVEL SECURITY` nas tabelas tenant-scoped | M |
| P0-C | RLS sem policy + funções | `legacy_docs/node_latency_daily/outbox/role_permissions` RLS ON sem policy; `get_tenant_id/is_super_admin/has_permission` search_path mutável, exec por anon | Advisors + `pg_policies` | Criar policies; `SET search_path=''`; `REVOKE EXECUTE` de anon | M |
| P0-D | JWT em localStorage | `sb-access-token` exfiltrável por XSS; HIBP OFF no Supabase Auth | `MyDayView.tsx:39`, advisor auth | Cookie httpOnly+Secure+SameSite; ligar HIBP; CSP | M |
| MT-01 | RLS `users` (escalada) | Policy `FOR ALL` USING `(id=auth.uid() OR tenant_id=get_tenant_id())` **sem WITH CHECK** → usuário reescreve própria linha: `role='super_admin'` (vertical) ou `tenant_id=<vítima>` (cross-tenant). **Confirmado em nível de banco** | `pg_policies` (users); `034_fix_users_rls_recursion.sql:29-31`; `005_rls_policies.sql`; depende de P0-B | `WITH CHECK` que barre alteração de role/tenant_id, ou `REVOKE UPDATE(role,tenant_id)`, ou trigger BEFORE UPDATE + teste Vitest | M |
| AUTH-01 | Token assinante × rota operador | Portal assina JWT `role='subscriber'` com o MESMO `JWT_SECRET`; `authenticate` só faz `jwtVerify()` sem `aud`/`role`; `/conversations/inbox` devolve todas as conversas do tenant | `subscriber-portal.routes.ts:83-86`; `apps/api/src/server.ts:61-68`; `inbox.routes.ts:34-40` | `aud` distinto + enforcement em `authenticate`; auditar rotas só-`authenticate` | M |
| SEC-R1 / APPSEC-01 | Cripto de campo (CPF + ERP) | Chave `VITE_CPF_ENCRYPTION_KEY` no bundle; fallback 64 zeros; **fail-open p/ texto puro** quando `key.length!=32` ou erro; mesmo cipher p/ CPF e tokens ERP | `db.ts:66-92`; `dbAdmin.ts:254-296`; importado por `CustomersPage/InventoryPage/OperatorMobilePage` | Cifra server-side; env sem `VITE_`; **fail-closed**; migrar p/ `credential-cipher.ts`; rotacionar+recifrar; remover duplicata | M |

### P1 — 30 dias
| ID | Componente | Descrição | Evidência | Esf |
|---|---|---|---|---|
| MT-02 | db-compat/service_role | Fachada roda por `supabaseAdmin` (bypassa RLS); isolamento depende de `.where(tenant)` manual | `firestore.ts:9`; `mapping.ts:150` | L |
| MT-03 | Leak cross-tenant no pipeline IA | `messageWorker` `customers.get()` sem tenant (match por telefone global); `getBillingStatusReal(cpf)` e `network_ctos.where(cep)` sem tenant — disparável por mensagem WhatsApp | `messageWorker.ts:604,623`; `dbAdmin.ts:206,219-224` | S |
| AUTH-09 | POST `/auth/register` | Insere `tenant_id` do body sem vincular ao solicitante → admin do tenant A cria conta no B. (super_admin **refutado**: Zod só aceita admin/operator/viewer) | `register.route.ts:20-24`; `schemas/index.ts:27-33` | S |
| AUTH-02 | Portal do assinante | Auth por CPF+contrato (não-secretos), sem lockout; rate limit por IP fail-open → credential-stuffing | `subscriber-portal.routes.ts:68-90`; `token-bucket.service.ts:66-75` | M |
| BILL-01 | Negociador D-03 | `/negotiation/agreements` persiste valores do body **sem `validateProposal`**; alçada só na rota consultiva → acordo 99% desconto | `negotiation.routes.ts:56-76` vs `negotiation-policy.service.ts:63-87,148-170` | M |
| SEC-R5 | Chaves de integração | `integration_keys` (openai/evolution) sem cifra; com P0-A/B → fraude LLM + sequestro WhatsApp | `tenant-keys.ts:14-28` | M |
| APPSEC-02 | Bucket `uploads` | `public=true`; INSERT em qualquer path/tenant; SELECT público; `upsert:true` (sobrescrita cross-tenant) | `032_storage_uploads.sql:4-16`; `storage.ts:22-37` | M |
| LGPD-01 | Exportação de dados | ZIP com PII em bucket público, objeto **nunca removido** (retenção). Enumeração cega rebaixada (path tem UUID) | `dataExport.ts:24-30,65-88` | M |
| INFRA-01 | Topologia de produção | Backend de todos os ISPs = `npm run dev` numa workstation Windows atrás de tunnel único. SPOF total (disponibilidade) | `vercel.json:8`; `server.ts:22-23` | L |
| INFRA-02 | Rate limiter | **Fail-open**: erro no Redis → limites some, inclusive `ai`/`billing` → DoS financeiro | `token-bucket.service.ts:66-75` | M |
| OBS-02 | Teste de RLS é teatro | `rls-isolation.test.ts` testa função JS em memória, não Postgres → deixou P0-A/B passarem. **Gate obrigatório do go-live** | `rls-isolation.test.ts:63-108` | M |

### P2 — 90 dias (resumo)
MT-04 (fallback `x-user-id` no `permissionMiddleware`), MT-05 (policies `USING(true)`), MT-06 (RBAC morto), AUTH-03 (timing de login v2), AUTH-04 (blacklist fail-open), AUTH-05 (JWT sem aud/iss), AUTH-06 (X-API-Key texto puro/não timing-safe), BILL-02 (webhook Asaas — handler não montado), BILL-03 (lockout de inadimplente nunca dispara), BILL-04 (idempotência inerte), BILL-05 (dinheiro em float), BILL-06 (segregação de funções), SEC-R2 (Express sem helmet/CSP), SEC-R3 (Vite dev em prod — hipótese), SEC-R4 (endpoints debug/health anônimos), SEC-R6 (segredos em .env plano), APPSEC-03/04 (erro cru vaza schema), COST-01 (sem teto LLM por tenant), LLM-01/02/03 (prompt injection RAG, guardrail regex, `dangerouslyAllowBrowser`), RAG-01/02 (coleção única, SSRF via config por tenant), INFRA-03 (Qdrant sem auth/TLS), OBS-01 (CI não cobre `/src`), OBS-03/05 (idempotência/feature-flag fail-open), OBS-06/07/09 (PII em logs/DLQ/Sentry), OBS-04 (gates de segurança não-bloqueantes), OBS-08 (deploy desalinhado), OBS-10 (flags fragmentadas).

### P3 — Evolução (resumo)
AUTH-07 (claims de topo sem revalidar), AUTH-08 (tenantRateLimiter morto), BILL-07 (split-brain COBRAI_ENGINE), BILL-08 (trilha financeira mutável), SEC-R7 (rotação sem key-id), SEC-R8 (subdomain takeover — hipótese), APPSEC-05 (HMAC sobre body re-serializado), APPSEC-06 (guardrail insuficiente), SCA-01 (`firebase-admin` viola R2), INFRA-04 (env.validator degrade-open), OBS-11 (replay `connection.update`).

---

## 4. O QUE FALTA (tecnologias a adicionar)
1. **Cofre de segredos / KMS** (Doppler/Vault/Secrets Manager) — SERVICE_ROLE e JWT_SECRET vivem em `.env` plano no host da SPA (SEC-R6).
2. **Cripto de campo server-side com key-id/versão** consolidada em `credential-cipher.ts` p/ CPF + `integration_keys` + ERP (SEC-R1/R5/R7). Considerar `pgcrypto`.
3. **Teste de integração de RLS contra Postgres real** (JWT por tenant) no gate de CI/cutover (OBS-02).
4. **Enforcement de orçamento LLM por tenant** (hard/soft cap + kill-switch) antes de cada chamada (COST-01).
5. **Anti-replay/idempotência em webhooks** (nonce+timestamp+UNIQUE) p/ Asaas e Evolution (BILL-02/04, APPSEC-05).
6. **helmet/CSP/HSTS na borda Express** — portar config do Fastify (SEC-R2).
7. **Client Supabase por-request com JWT do usuário** p/ dados tenant-scoped, devolvendo RLS como defesa em profundidade (MT-02).
8. **Alta disponibilidade no ingress** — 2+ réplicas + LB + health-check + build de produção; nunca `npm run dev` (INFRA-01).
9. **Branch protection + gates de segurança bloqueantes** + CODEOWNERS real cobrindo `/src` (OBS-04).
10. **Redação de PII centralizada** em logger/Sentry/DLQ (OBS-06/07/09).

## 5. O QUE TALVEZ REMOVER (respeitando R5 — portar, não apagar)
**Remoções seguras (código morto/inseguro):** fallback all-zeros + duplicação da cripto CPF (`db.ts`/`dbAdmin.ts`); `/api/test` e `fastify_boot_error` público (`server.ts:65,84`); fallback `x-user-id`/`body.userId` (`permissionMiddleware.ts:11-20`); `tenantRateLimiter.ts` (não montado, inseguro); `firebase-admin` de devDeps (viola R2); placeholder `@seu-usuario` no CODEOWNERS; passo Railway/apps/web do `deploy.yml`.

**Remover só APÓS portar:** `handleAsaasWebhook` legado (portar c/ HMAC+anti-replay antes de expor); `src/lib/vectorStore.ts` (consolidar no per-tenant de apps/api); `permissionsManager.ts`/`checkPermissionAdmin` (unificar taxonomia); fallback in-memory do Redis (mascara indisponibilidade).
> **AUTH-06 RESOLVIDO (2026-08-11):** `src/routes/api-v1.ts` **removido** (não era "portar-antes-de-apagar": rota morta, `collectionGroup` inexistente → 500 sempre, tráfego zero, sem consumidor; design inseguro — API key em texto puro). Se uma API pública for necessária, nasce no `apps/api` com key hasheada + timing-safe. Ver `SEGURANCA_PENDENTE.md`.

---

## 6. Nota de honestidade (severidade × exploitabilidade)
Os 7 P0 são exploráveis com o `anon key` público + JWT de conta comum (P0-A/B, MT-01) ou login legítimo de assinante (AUTH-01) — sem RCE. Itens rebaixados pelo passe adversarial (BILL-02, INFRA-01, LLM-01, LGPD-01, SEC-R2) seguem reais e obrigatórios, mas ou não têm superfície montada hoje, ou são risco de disponibilidade/por-tenant, ou têm mitigação parcial. **O maior risco sistêmico não é um bug isolado: é a arquitetura de isolamento por filtro manual (MT-02) + RLS como única barreira e ainda contornável (P0-B + ausência de FORCE RLS).** Endereçar a classe, não só as instâncias, é o que muda a nota de forma durável.

> **Governança (Squad S):** os 35+ especialistas desta auditoria são a mesma IA se auto-revisando — **não substituem um pentest externo humano black-box antes do go-live**, nem um tabletop de resposta a incidente (ex.: "a `service_role` vazou no GitHub — o que cada um faz nos primeiros 15 min?"). Ambos recomendados como pré-requisito de produção.
