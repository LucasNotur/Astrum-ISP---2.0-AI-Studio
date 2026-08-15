# HANDOFF — Specs de execução do backlog 🟡 (para modelo de código)

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Você foi instruído a "executar este plano passo a passo". O escopo é **ESTRITO**. Cumpra à risca:

1. **EXECUTE A `SPEC 1` (upsell) E A `SPEC 2` (billing).** São as duas liberadas nesta rodada.
2. **NÃO EXECUTE A `SPEC 3` (voip).** Está BLOQUEADA por dependência externa (conta Twilio) + design
   do dono. Está no documento só como contexto. Se achar que "deveria" construí-la, **PARE** e escreva
   a pergunta no report — **não escreva uma linha de código dela.**
3. **NÃO altere nenhum arquivo fora das listas das SPEC 1 e 2.** Lista EXAUSTIVA de arquivos permitidos:
   - (SPEC 1) CRIAR: `apps/api/src/domain/vendas/upsell.service.ts`
   - (SPEC 1) CRIAR: `apps/api/src/domain/vendas/upsell.routes.ts`
   - (SPEC 1) CRIAR: `apps/api/src/domain/vendas/upsell.service.test.ts`
   - (SPEC 1) EDITAR: `apps/api/src/server.ts` (só adicionar o registro da rota)
   - (SPEC 1) EDITAR: `src/App.tsx` (só o handler do botão de upsell)
   - (SPEC 1) EDITAR: `src/pages/DashboardPage.tsx` (só a leitura de upsells)
   - (SPEC 2) EDITAR: `src/pages/BillingPage.tsx` (só a view de billing do provedor)
   - EDITAR: `.astrum-progress/HANDOFF_BACKLOG_SPECS.md` (só marcar SPEC 1 e 2 como feitas no fim)
   Qualquer outro arquivo → **NÃO TOQUE.**
4. **AÇÕES PROIBIDAS:** refatorar/"consertar"/reformatar código fora do escopo das SPEC 1/2; renomear
   símbolos; mexer em migrations ou schema (o DB já está feito — `upsell_events` já existe); `git add -A`
   ou `git add .` (só `git add <os arquivos exatos das listas>`); tocar em `voip`, `unmask`, `incidents`,
   `tickets` ou outros domínios; instalar dependências novas. **NÃO faça `git push`** — deixe os commits
   locais. O Claude audita ANTES de subir pro main.
5. **Se o código real divergir deste spec** (um shape diferente, um símbolo que não existe, a tabela com
   colunas diferentes das transcritas): **PARE e reporte** — não adivinhe, não "conserte" por conta própria.
6. **DEFINITION OF DONE (leia com atenção — há um BASELINE pré-existente):**
   - **Frontend (SPEC 1 App/Dashboard + SPEC 2 BillingPage):** `npm run typecheck:legacy` na raiz tem de
     ficar **100% limpo (0 erros)** — esse é o teu alvo real p/ tudo que é `src/`.
   - **Backend (SPEC 1 apps/api):** ⚠️ `cd apps/api && npx tsc --noEmit` **JÁ tem ~56 erros PRÉ-EXISTENTES**
     em 22 arquivos SEM relação com upsell (workers, `url-guard.ts`, `geo-location.service.ts`,
     `ip-whitelist.service.ts`, vários `domain/*/*.service.ts`, etc.). Isso é dívida técnica de outras
     sessões. **NÃO é seu trabalho consertar — NÃO TOQUE nesses arquivos.** Seu critério: os SEUS arquivos
     novos (`domain/vendas/upsell.*`) precisam ter **0 erros** — confira com
     `cd apps/api && npx tsc --noEmit 2>&1 | grep vendas/upsell` (tem que sair **vazio**) e o total de
     `error TS` **não pode aumentar** além do baseline (~56).
   - Teste da SPEC 1 verde: `npx vitest run apps/api/src/domain/vendas/upsell.service.test.ts` (da raiz).
   - **2 commits** (um por SPEC), cada um só com os arquivos daquela SPEC.
7. **REPORT FINAL OBRIGATÓRIO** (para a auditoria do Claude) — ao terminar, imprima:
   - a lista EXATA de arquivos criados/editados;
   - o hash do commit;
   - a saída dos 2 typechecks e do teste (colada, não resumida);
   - quaisquer desvios do spec e o motivo;
   - as perguntas pendentes de billing/voip (que você NÃO construiu).

Se qualquer passo acima conflitar com um impulso seu de "melhorar" algo, o contrato ganha. Fim do contrato.

---

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

## SPEC 1 — `upsell/convert` — ✅ EXECUTE ESTA (a única desta rodada; DB já feito)

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

## SPEC 2 — `billing` do provedor — ✅ EXECUTE ESTA (só frontend; decisão do dono já tomada)

**Decisão do dono (tomada pelo Claude com o dono, 2026-08-14):** mostrar a assinatura **de verdade**
(ela É computável) + faturas num empty-state honesto. NÃO usar `billing_plans` (é o catálogo que o
ISP vende aos clientes dele, não a assinatura à Astrum).

**Por que é computável (verificado pelo Claude):** a precificação é a "Escada Astrum" — **preço único
= R$ 2,50 × assinantes** (`src/lib/plans.ts`: `PRICE_PER_SUBSCRIBER_CENTS = 250` + função
`monthlyPriceCents(tier, subscribers)`). E a tabela `tenants` tem os campos reais:
`plan` (text: `'astrum'` pago | `'radar_trial'`/trial grátis | `'autonomia'` legado), `active` (bool),
`trial_ends_at` (timestamptz|null), `subscriber_count` (int). Logo dá pra montar tudo **no front**,
sem backend novo, usando a fonte de verdade de preço que já existe (`plans.ts`).

**O que fazer — SÓ `src/pages/BillingPage.tsx`:**
1. **Remover** as 2 chamadas 404 (`fetch('/api/billing/subscription/...')` e `.../invoices/...`, ~linha 62-65)
   e o estado que dependia delas (mantenha `ispSubscription`/`ispInvoices` como derivados locais).
2. **Ler o tenant** (o arquivo já usa o client `supabase` e tem `tenantId`):
   `supabase.from('tenants').select('plan,active,trial_ends_at,subscriber_count').eq('id', tenantId).maybeSingle()`.
3. **Computar a assinatura** (client-side), importando de `@/src/lib/plans`:
   ```ts
   import { monthlyPriceCents, ASTRUM_LADDER } from '@/src/lib/plans';
   const tier = t.plan === 'radar_trial' ? 'radar_trial' : 'astrum'; // 'autonomia'/desconhecido → tratado como pago (regra única da casa: R$2,50 × assinantes)
   const amount_cents = monthlyPriceCents(tier, t.subscriber_count ?? 0);
   const inTrial = t.trial_ends_at && new Date(t.trial_ends_at) > new Date();
   setIspSubscription({
     plan: t.plan,
     status: t.active ? 'active' : 'inactive',
     amount_cents,                                   // subscriber_count × 250 — número REAL
     next_billing_date: inTrial ? t.trial_ends_at : null,
   });
   ```
   Se `monthlyPriceCents`/`ASTRUM_LADDER` tiverem assinatura diferente da que você espera, **abra
   `src/lib/plans.ts` e use o que existe de verdade** (não invente). O render de subscription
   (`ispSubscription.plan/.status/.amount_cents/.next_billing_date`) já existe — não mude os campos.
4. **Faturas:** `setIspInvoices([])` — não há geração de faturas SaaS do provedor (não existe em lugar
   nenhum). O render já trata lista vazia com empty-state; **não invente faturas**. (Opcional, se quiser
   deixar mais claro: trocar o texto do empty-state p/ algo como "As faturas da sua assinatura Astrum
   aparecerão aqui quando a cobrança automática estiver ativa." — só o texto, sem lógica nova.)
5. Em trial: como `next_billing_date = trial_ends_at`, o card já mostra "Próxima cobrança: {data}".
   O valor mostrado é o que ele pagará (subscriber_count × R$2,50) quando o trial acabar — verdade.

**Verificação:** `npm run typecheck:legacy` limpo. (Sem teste novo: é leitura+cálculo com fonte já
testada `plans.ts`.)

**Commit:** `feat(migração): BUILD billing do provedor (assinatura real via plans.ts; faturas empty)`.

---

## SPEC 3 — `voip/initiate-call` — 🚫 NÃO EXECUTAR (o Claude faz; aguardando trunk SIP)

**Arquitetura DECIDIDA (dono, 2026-08-14): WebRTC softphone via `SIP.js` + trunk SIP de operadora
brasileira** (número +55 local é crítico p/ taxa de atendimento no Brasil; custo BR celular menor que
vendors gringos). O operador fala pelo navegador (mic/headset); só o cliente entra pela PSTN.

**DB já pronto (Claude, migration 101):** tabela `public.voip_calls` (CDR) existe, RLS tenant_own.
Colunas: id, tenant_id, ticket_id, operator_id, direction, from_number, to_number, provider,
provider_call_id, status, duration_seconds, started_at, ended_at, extra.

**Por que NÃO é tarefa do outro modelo (e continua bloqueado):**
1. **Sem trunk SIP real** — precisa de credenciais de uma operadora BR (domínio/servidor SIP, wss URL,
   usuário, senha, DID +55). Sem isso não dá pra construir NEM testar (código no escuro).
2. **Sensível (segurança):** senha SIP **não pode** ir pro browser em texto. O padrão é o backend emitir
   credenciais efêmeras / registrar via um gateway — decisão que depende da operadora. → o **Claude** faz
   essa parte aqui quando o trunk existir.
3. Depende de escolha da operadora BR + contratação (fato de ops do dono).

**Plano p/ quando houver trunk (Claude executa aqui, não o outro modelo):**
- DB: `voip_calls` (feito). Talvez colunas de config SIP em `tenants` (Claude decide na hora).
- Backend (apps/api): endpoint que devolve credenciais SIP efêmeras/config ao browser (seguro), +
  webhook de status da chamada → grava/atualiza `voip_calls`.
- Frontend (ChatPage): dep `sip.js`; `handleInitiateCall` cria a sessão SIP (INVITE p/ o DID do cliente
  via o trunk), UI de chamada (mudo/desligar/timer), permissão de microfone.
- Caller ID = número +55 do trunk (o cliente vê o número da empresa).

→ **NÃO escreva código de voip.** Está aqui só como registro da decisão + prep de DB.

---

## Ao terminar

Abra a lista de arquivos que você criou/alterou e os commits. O Claude vai **auditar**:
correção do contrato, isolamento por tenant, presença/qualidade dos testes, typecheck, e se algum
`fetch` cru/`tenantId` de body escapou. Deixe as ressalvas (ex.: billing bloqueado por schema)
explícitas no report.
