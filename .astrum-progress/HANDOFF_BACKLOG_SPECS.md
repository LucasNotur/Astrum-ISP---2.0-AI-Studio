# HANDOFF — Specs de execução do backlog 🟡 (para modelo de código)

> Escrito pelo Claude (Opus 4.8) em 2026-08-14. Divisão de trabalho combinada com o dono:
> **(1) Banco/Supabase → já feito pelo Claude aqui** (migrations aplicadas na nuvem via MCP);
> **(2) Código puro (rotas/services/frontend) → você executa** seguindo estes specs;
> **(3) Auditoria final → Claude revisa o que você fez.**
>
> Você NÃO tem acesso ao Supabase. Não tente aplicar migrations nem consultar o banco:
> todo schema de que você precisa está **transcrito literalmente** em cada spec. Se algo
> divergir do que está aqui, **PARE e reporte** em vez de adivinhar — não invente colunas.

---

## 0. Como raciocinar (linha do Claude — leia antes de tocar em código)

Estas regras são o que fez a qualidade das entregas anteriores. Siga-as à risca.

1. **Verifique antes de construir.** Não confie no nome do endpoint nem na hipótese do spec
   cegamente: abra o arquivo do front, confirme o shape que ele envia/consome, confirme que
   os símbolos que você importa existem. Se o código real contradisser o spec, o código real ganha — reporte.
2. **Service PURO + testável.** Toda lógica de negócio vai num `*.service.ts` de funções puras
   (sem I/O), com teste Vitest cobrindo o COMPORTAMENTO (não "compila"). A rota Fastify só faz
   auth + I/O (DB/rede) + chama o service. Isso é obrigatório (CLAUDE.md).
3. **Tenant vem do JWT, sempre.** Nunca aceite `tenantId` do body/query. Nas rotas Fastify:
   `const tenantId = (req as any).user?.tenantId ?? (req as any).user?.tenant_id;`
   No front, **dropar** `?tenantId=` e o header `x-tenant-id` ao repontar.
4. **Front usa o cliente central.** Toda chamada nova passa por `@/src/lib/apiClient`
   (`apiGet/apiPost/apiPut/apiPatch/apiDelete`) — nunca `fetch()` cru. Ele injeta o
   `Authorization: Bearer` e trata erro/JSON.
5. **Isolamento por tenant é responsabilidade do código no backend.** `supabaseAdmin` é
   service_role (ignora RLS). Sempre filtre por `tenant_id` explicitamente em toda query, e
   valide propriedade antes de update/delete por `:id`.
6. **Verifique no fim:** `npm run typecheck:legacy` (raiz) **e** `cd apps/api && npx tsc --noEmit`.
   Rode os testes novos: `npx vitest run <arquivo>` **a partir da raiz do repo** (a config de
   vitest está na raiz; rodar de dentro de `apps/api` quebra o match de projeto).
7. **Commit em fatia limpa.** Antes de `git add` de um arquivo de página compartilhada
   (SettingsPage, App.tsx, DashboardPage…), **revise o diff INTEIRO** — outras sessões deixam
   trabalho no working tree que entra de carona. Faça `git add <arquivos exatos>`, nunca `git add -A`.
   Mensagem de commit termina com: `Co-Authored-By: <seu-modelo>`.

### Padrão de rota Fastify (copie esta forma)
```ts
import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function tenantOf(req: any): string | undefined {
  return req.user?.tenantId ?? req.user?.tenant_id;
}

export async function minhaRoutes(app: FastifyInstance) {
  const auth = [async (req: any, reply: any) => { await (app as any).authenticate(req, reply); }];

  app.post('/api/v2/...', { onRequest: auth }, async (req, reply) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    // ... valida via service puro, faz I/O, retorna
  });
}
```
Registre a rota em `apps/api/src/server.ts` (procure o bloco de `await app.register(...)` e
adicione a sua logo após uma rota de domínio parecida).

---

## SPEC 1 — `upsell/convert` (🟢 pronto p/ executar; DB já feito)

**Estado do DB (feito pelo Claude, migration 100 aplicada + registrada):** existe a tabela
`public.upsell_events` com RLS `tenant_own`. Colunas EXATAS:
```
id            uuid    PK default gen_random_uuid()
tenant_id     uuid    NOT NULL
customer_id   uuid    (nullable)
current_plan  text
suggested_plan text
outcome       text    NOT NULL default 'offered'   -- 'offered' | 'converted' | 'rejected'
operator_id   uuid    (nullable)
created_at    timestamptz NOT NULL default now()
```

**Problema que você resolve:** `src/App.tsx` (~linha 3218) chama `POST /api/upsell/convert`
(404) ao operador aceitar um upsell num ticket. E `src/pages/DashboardPage.tsx` (~linha 116)
lê "Eventos de Upsell"/"Conversões" de `cobrai_jobs` (tabela da engine de COBRANÇA — semântica
errada). Unifique em `upsell_events`.

**Passo 1 — Backend (novo):**
- Crie `apps/api/src/domain/vendas/upsell.service.ts` (função pura):
  - `sanitizeUpsellInput(body, tenantId)` → valida/normaliza e devolve o registro a inserir:
    `{ tenant_id, customer_id|null, current_plan|null, suggested_plan|null, outcome, operator_id|null }`.
  - `outcome` deve ser um de `['offered','converted','rejected']`; se vier outro, default `'offered'`.
    Se `converted` explicitamente, mantém.
  - Lança um erro de validação (crie `class UpsellValidationError extends Error`) se faltar o mínimo
    (defina o mínimo como: nada obrigatório além do tenant — o front manda customerId/planos, mas
    tolere ausência; NÃO exija campos que o front pode não ter).
- Crie `apps/api/src/domain/vendas/upsell.routes.ts`:
  - `POST /api/v2/upsell/convert` — body `{ customerId?, currentPlan?, suggestedPlan?, outcome? }`.
  - tenant + operator do JWT (`operator_id = req.user.userId ?? req.user.uid ?? req.user.sub`).
  - `supabaseAdmin.from('upsell_events').insert({...}).select('id').single()`.
  - retorna `{ success: true, id }`. Erros de validação → 400; erro de DB → 500.
- Crie `apps/api/src/domain/vendas/upsell.service.test.ts` — teste o `sanitizeUpsellInput`:
  outcome inválido→'offered', converted preservado, tenant sempre o do JWT (ignora tenant do body),
  campos ausentes viram null. (Mínimo 5 casos.)
- Registre `upsellRoutes` em `apps/api/src/server.ts`.

**Passo 2 — Front App.tsx (repoint):**
- No handler do botão de upsell (~linha 3216-3239), troque o `fetch("/api/upsell/convert", ...)`
  por `apiPost('/api/v2/upsell/convert', { customerId, currentPlan, suggestedPlan, outcome: 'converted' })`
  (importe `apiPost` de `@/src/lib/apiClient` se ainda não estiver importado). Drope o `tenantId` do body.
- Mantenha o `toast.success(...)` existente.

**Passo 3 — Front DashboardPage.tsx (repoint da LEITURA):**
- Onde hoje lê upsells de `cobrai_jobs` (~linha 116-120), passe a ler de `upsell_events`:
  `supabase.from('upsell_events').select('*').eq('tenant_id', tenantId)`.
  (Mantém o mesmo `supabase` client já usado no arquivo — RLS resolve o tenant.)
- Os cards já filtram `outcome === 'converted'` p/ "Conversões" e usam `.length` p/ "Eventos" —
  o shape de `upsell_events` (`outcome`) é compatível, então não mude os cards.

**Verificação:** `npm run typecheck:legacy` + `cd apps/api && npx tsc --noEmit` limpos;
`npx vitest run apps/api/src/domain/vendas/upsell.service.test.ts` verde (rode da raiz).

**Commit:** `feat(migração): BUILD upsell/convert (upsell_events, migration 100)`.

---

## SPEC 2 — `billing` (⚠️ parcial honesto; NÃO há fonte real)

**Verificado pelo Claude (não re-investigue, mas confirme se quiser):** os endpoints
`/api/billing/subscription/:tenantId` e `/api/billing/invoices/:tenantId` (chamados por
`src/pages/BillingPage.tsx` ~linha 63-64) **não têm backend em lugar nenhum** (nem legado nem
`apps/api`). Eles representam a **assinatura DO PROVEDOR à Astrum** (SaaS), não faturas de clientes.
- A tabela `invoices` (Supabase) tem `customer_id` → é ISP→assinante, **não serve** p/ faturas do provedor.
- Não existe tabela de faturas-do-provedor. O único dado do plano do provedor é `tenants.plan`
  (text) + a tabela `billing_plans`.

**⚠️ CORREÇÃO CRÍTICA (Claude verificou o schema — NÃO use `billing_plans` p/ o preço):**
`billing_plans` e `plans` **têm `tenant_id`** → são o **catálogo de planos de internet que o ISP
vende aos SEUS clientes** (`billing_plans`: id, tenant_id, name, price_cents, speed_mbps, description,
active). **NÃO são** o preço da assinatura do ISP à Astrum. O único dado do plano-SaaS do provedor é
`tenants.plan` (text, ex.: `'pro'`) — **sem preço, sem próxima cobrança, sem faturas** em lugar nenhum.

Ou seja: a view de billing do provedor **não tem dado real de valor/fatura**. Cableá-la com
`billing_plans` mostraria número ERRADO (o preço que o ISP cobra dos clientes dele).

**Recomendação (decisão do dono — default seguro):** NÃO construir números falsos. Duas saídas:
- (A) **Mínimo honesto:** `GET /api/v2/billing/subscription` retorna só `{ subscription: { plan:
  tenants.plan, status: 'active', amount_cents: null, next_billing_date: null } }`; o front mostra
  "Plano: PRO" e esconde valor/próxima-cobrança quando `null`. `GET /api/v2/billing/invoices` →
  `{ invoices: [] }` (empty-state). Repontar `BillingPage.tsx` p/ os 2 `apiGet` (dropar `:tenantId`).
- (B) **Esconder a seção** de billing-do-provedor no `BillingPage` até existir integração real de
  pagamento SaaS (Stripe/Asaas) — provavelmente o mais honesto.

**NÃO decida sozinho entre A e B** — é decisão de produto do dono. Entregue como pergunta.
Se for (A), o backend é trivial (não precisa de schema além de `tenants.plan`, que você já tem).

---

## SPEC 3 — `voip/initiate-call` (🚫 BLOQUEADO por design; não construa ainda)

**Verificado pelo Claude:** a telefonia do `apps/api` é **só INBOUND**
(`/telephony/voice/incoming` + stream de voz). **Não há** SDK `twilio` no `package.json`, **não há**
`calls.create`, e as env `TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER` são opcionais (podem estar vazias).
Pior: o payload do front (`src/pages/ChatPage.tsx` ~linha 496, `handleInitiateCall`) manda
`{ tenantId, ticketId, toNumber, operatorId, operatorName }` — tem o número do CLIENTE (`toNumber`)
mas **NÃO o telefone do operador** → é impossível montar o bridge click-to-call (Twilio precisa ligar
p/ alguém e conectar ao outro).

**NÃO construa** até o dono decidir:
1. Qual o fluxo? (a) Twilio liga p/ o operador e conecta ao cliente — precisa do telefone do operador
   (adicionar ao payload/perfil); ou (b) WebRTC no browser do operador (outra arquitetura).
2. As credenciais Twilio de produção existem e há saldo/upgrade p/ outbound?
3. Adicionar a dependência `twilio` ou fazer POST HTTPS cru na API de Calls?

Entregue isto como **pergunta ao dono**, não como código.

---

## Ao terminar

Abra a lista de arquivos que você criou/alterou e os commits. O Claude vai **auditar**:
correção do contrato, isolamento por tenant, presença/qualidade dos testes, typecheck, e se algum
`fetch` cru/`tenantId` de body escapou. Deixe as ressalvas (ex.: billing bloqueado por schema)
explícitas no report.
