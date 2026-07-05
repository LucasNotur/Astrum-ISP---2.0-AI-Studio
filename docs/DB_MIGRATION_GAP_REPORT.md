# Relatório de Gap de Dados — Firebase (Firestore) → Supabase (PostgreSQL)

> Deliverable "B" do plano de migração. Mapa campo-a-campo entre o modelo legado
> (Firestore, fonte: `firebase-blueprint.json` + `src/lib/db.ts`) e o schema-alvo
> Supabase já existente (`packages/db/src/migrations/`). Serve para você validar
> antes de eu escrever o DDL das tabelas faltantes (deliverable "A").
>
> Criado em 2026-07-01.

## Método e legenda

- **Fonte:** modelo Firestore (18 entidades, 16 coleções).
- **Alvo:** 18 tabelas já criadas nas migrations do `apps/api`.
- `✅ ok` — campo já tem destino equivalente
- `🟡 renomear/converter` — existe, mas com nome ou tipo diferente (precisa de mapeamento no ETL)
- `🔴 faltando` — não há coluna destino; será perdido se não criarmos
- `🆕 novo` — coluna que só existe no alvo (default no ETL)

---

## Categoria 1 — Entidades COM tabela-alvo (precisam de reconciliação de campos)

### 1.1 Customer → `customers`

| Firestore | Supabase | Status |
|---|---|---|
| id (string) | id (UUID) | 🟡 gerar UUID, guardar id antigo em `legacy_id` |
| name | name | ✅ |
| email | email | ✅ |
| phone | phone | ✅ |
| — | cpf | 🆕 (existe no legado via db.ts, não no blueprint) |
| address | — | 🔴 **faltando** |
| plan (nome) | plan_id | 🟡 semântica difery: legado guarda nome, alvo guarda FK |
| mrr (number) | — | 🔴 **faltando** |
| retention_discount_used_at | — | 🔴 **faltando** |
| status (active/inactive/pending) | status (active/suspended/cancelled) | 🟡 **enum divergente** — mapear inactive→suspended, pending→? |
| createdAt | created_at | ✅ |

### 1.2 Ticket → `tickets`

| Firestore | Supabase | Status |
|---|---|---|
| id | id (UUID) | 🟡 |
| customerId | customer_id (FK) | 🟡 resolver FK |
| subject | title | 🟡 **renomear** |
| — | description | 🆕 |
| status (open/in-progress/resolved/escalated) | status (open/in_progress/resolved/closed) | 🟡 **enum divergente** — `escalated` não existe no alvo; `closed` não existe na origem |
| priority (low/medium/high/urgent) | priority (low/medium/high/critical) | 🟡 `urgent`→`critical` |
| aiHandled | resolved_by_ai | 🟡 renomear |
| aiEnabled | — | 🔴 **faltando** |
| aiAttempts | — | 🔴 **faltando** |
| — | assigned_to (FK users) | 🆕 |
| createdAt | created_at | ✅ |

### 1.3 BillingInvoice → `invoices`  ⚠️ armadilha de unidade

| Firestore | Supabase | Status |
|---|---|---|
| id | id (UUID) | 🟡 |
| customerId | customer_id | 🟡 |
| amount (number, **reais**) | amount_cents (INTEGER, **centavos**) | 🔴 **conversão de unidade** — multiplicar por 100; risco de arredondamento |
| dueDate | due_date | ✅ |
| status (paid/pending/overdue/cancelled) | status (idem) | ✅ enum bate |
| paymentUrl | — | 🔴 **faltando** (link do boleto que a IA envia!) |
| pixCopyPaste | — | 🔴 **faltando** (Pix copia-e-cola que a IA envia!) |
| — | plan_id, paid_at, payment_method, external_id | 🆕 |
| createdAt | created_at | ✅ |

> `paymentUrl` e `pixCopyPaste` são **críticos** — é o conteúdo que o CobrAI/atendimento
> manda pro cliente. Sem eles a IA nova não consegue enviar 2ª via. **Devem ser adicionados.**

### 1.4 Message → `messages`  ⚠️ mudança de modelo relacional

| Firestore | Supabase | Status |
|---|---|---|
| (subcoleção de `/tickets/{id}/messages`) | tabela raiz com `conversation_id` | 🔴 **modelo diferente**: legado pendura msg no **ticket**; alvo pendura na **conversation** |
| ticketId | conversation_id | 🔴 exige ponte ticket→conversation |
| senderType (customer/ai/human) | role (user/assistant/system) + from_ai | 🟡 mapear customer→user, ai→assistant, human→? |
| text | content | 🟡 renomear |
| — | tenant_id, tokens_used | 🆕 |

> Decisão necessária: no alvo, **ticket e conversation são coisas separadas**. Na migração,
> cada ticket legado com mensagens vira 1 conversation + N messages.

### 1.5 KnowledgeBase → `knowledge_documents`  ⚠️ conceitos diferentes

| Firestore (artigo inline) | Supabase (arquivo + Qdrant) | Status |
|---|---|---|
| title | filename | 🟡 aproximado |
| content (texto do artigo) | — (conteúdo vai pro R2/Qdrant) | 🔴 **modelo diferente**: legado guarda o texto no banco; alvo guarda referência a arquivo + chunks no Qdrant |
| tags, category | — | 🔴 faltando |
| — | file_type, r2_key, qdrant_collection, chunks_count | 🆕 |

> Não é migração 1:1 — é **re-ingestão**: cada artigo legado precisa ser reprocessado pelo
> pipeline de RAG novo (chunk + embedding + Qdrant). Considerar tabela `knowledge_articles`
> separada para preservar o texto original.

### 1.6 AuditLog → ⚠️ **COLISÃO DE NOME** (não é a `audit_log`!)

| Firestore `audit_logs` (perf de IA/SLA) | Supabase `audit_log` (segurança) | Status |
|---|---|---|
| ticketId, category, sentiment, responseTime, slaCompliant, isCritical | action, resource, ip_address, user_agent (login/logout) | 🔴 **propósitos totalmente diferentes** |

> **Armadilha grave:** as duas se chamam quase igual mas não têm nada a ver. O `audit_logs`
> legado é métrica de performance da IA; o `audit_log` novo é trilha de segurança. O legado
> deve migrar para uma tabela **nova** (sugestão: `ai_performance_logs` / `sla_logs`), **nunca**
> para `audit_log`.

### 1.7 Plan → `billing_plans` (bom encaixe)

Firestore `Plan` (array de planos por tenant) → `billing_plans` (1 linha por plano).
Campos `name`, `price`(→`price_cents`), `speed_mbps`, `active` batem. 🟡 desnormalizar o array + converter preço para centavos.

### 1.8 AIProviderConfig → `ai_configurations` (sobreposição parcial)

`ai_configurations` cobre persona/limites (temperature, max_tokens), mas **não** tem
`provider`, `model`, `fallback_provider`, `fallback_model`. 🔴 adicionar essas 4 colunas
(ou tabela dedicada) se o roteamento por provider ainda for necessário.

---

## Categoria 2 — Entidades SEM tabela-alvo (precisam de DDL novo — deliverable "A")

| Firestore | Modelo | Ação |
|---|---|---|
| `service_orders` (ServiceOrder) | customerId, address, lat/lng, status(5), type, cto, port, materials[], assignedTo, aiSummary | 🔴 **criar** `service_orders` |
| `network_ctos` (NetworkCTO) | name, lat/lng, totalPorts, usedPorts, status | 🔴 **criar** `network_ctos` |
| `inventory` (InventoryItem) | name, category, stock, minStock, unit, price | 🔴 **criar** `inventory` |
| `notifications` (Notification) | type(3), message, ticketId, timestamp | 🔴 **criar** `notifications` |
| `team_members` (TeamMember) | name, email, role(6), status | 🟡 avaliar: estender `users` ou tabela própria (roles diferem) |
| `technicians` (Technician) | name, phone, status(3), currentTask | 🔴 **criar** `technicians` (ou unificar com team_members) |
| `ai_token_logs` (AITokenLog) | tenantId, aiFunction, provider, model, in/outTokens, cost, usedFallback | 🔴 **criar** (ou consolidar com Helicone/observabilidade) |

---

## Categoria 3 — Armadilhas prioritárias (resumo executivo)

1. **`audit_logs` (legado) ≠ `audit_log` (novo)** — colisão de nome, propósitos opostos. Migrar para tabela nova.
2. **`invoices.amount` reais → `amount_cents` centavos** — conversão de unidade; risco financeiro se errar.
3. **`invoices` perde `paymentUrl` e `pixCopyPaste`** — dados que a IA usa para cobrar. Adicionar.
4. **`messages`: ticket → conversation** — mudança de modelo relacional; precisa ponte.
5. **`knowledge_base` → `knowledge_documents`** — não é 1:1, é re-ingestão via RAG.
6. **Enums divergentes** em `customers.status` e `tickets.status/priority` (`escalated`, `urgent` somem).
7. **Split-brain ativo:** `customers` e `tickets` já existem nos dois bancos simultaneamente (ver `LEGACY_RETIREMENT_PLAN.md` §2). Definir fonte-da-verdade antes do cutover.

---

## Veredito de destino por entidade (18)

| # | Firestore | Destino Supabase | Situação |
|---|---|---|---|
| 1 | customers | `customers` | 🟡 reconciliar 3 campos |
| 2 | tickets | `tickets` | 🟡 reconciliar enums + 2 campos ai |
| 3 | messages | `messages` (via conversations) | 🟡 mudança de modelo |
| 4 | billing_invoices | `invoices` | 🔴 +2 colunas críticas + unidade |
| 5 | knowledge_base | `knowledge_documents` (+`knowledge_articles`?) | 🔴 re-ingestão |
| 6 | audit_logs | **nova** `ai_performance_logs` | 🔴 não usar `audit_log` |
| 7 | plans | `billing_plans` | 🟡 desnormalizar |
| 8 | ai_provider_configs | `ai_configurations` (+4 col) | 🟡 estender |
| 9 | service_orders | **criar** | 🔴 DDL novo |
| 10 | network_ctos | **criar** | 🔴 DDL novo |
| 11 | inventory | **criar** | 🔴 DDL novo |
| 12 | notifications | **criar** | 🔴 DDL novo |
| 13 | team_members | `users` ou **criar** | 🟡 decisão |
| 14 | technicians | **criar** | 🔴 DDL novo |
| 15 | ai_token_logs | **criar**/consolidar | 🔴 decisão |
| 16 | users | `users` | ✅ ok |
| 17 | (tenants) | `tenants` | ✅ ok |
| 18 | (cobrai) | `cobrai_rules`/`cobrai_jobs` | ✅ ok (ver split-brain) |

---

## Próximo passo (deliverable "A")

Após sua validação deste gap, eu escrevo as migrations novas (Categoria 2) + os
`ALTER TABLE` de reconciliação (Categoria 1), num diretório consolidado, com FKs e RLS,
alinhados ao padrão existente em `packages/db/src/migrations/`. Decisões que preciso de você:
- `team_members`/`technicians`: estender `users` ou tabelas próprias?
- `ai_token_logs`: tabela própria ou já resolvido por Helicone/observabilidade?
- `knowledge_base`: preservar texto original em tabela própria além de re-ingerir?
