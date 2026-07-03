# PLANO FIRESTORE-ZERO (FZ) — Supabase como único banco

> **STATUS: ✅ EXECUTADO em 2026-07-03.** Todos os sprints FZ-0..FZ-6 completos.
> Suíte: 804 testes passando, `npm ls firebase firebase-admin` vazio, zero imports
> de firebase em `src/`. Commits: fz-0..2, fz-3, fz-4, fz-5..6 na branch
> `chore/cleanup-repo-junk`. Passo operacional restante (quem tem dados reais no
> Firestore de produção): backfill do §2 ANTES do deploy desta branch.

> **Decisão do dono do produto (Lucas, 2026-07-03):** remover o Firestore TOTALMENTE do
> codebase, mantendo apenas Supabase (+ Redis para cache/filas), **sem quebrar o sistema**.
> Esta decisão substitui o cronograma S82 do PLANO_MESTRE_V2 — o cutover de banco é AGORA,
> a nível de código, com rollback via `git revert`.
>
> Este documento é auto-suficiente: qualquer IA/engenheiro deve conseguir executar ou
> retomar o trabalho lendo apenas este arquivo + o código.

---

## 0. Arquitetura da solução (leia antes de tudo)

### 0.1 A descoberta que viabiliza o plano

**Todo o backend legado (`/src`) acessa o Firestore por UM ÚNICO módulo:**
`src/lib/firebaseAdmin.ts`, que exporta:

- `adminDb` — Proxy para `Firestore` (usado por ~50 arquivos: workers, routes, libs)
- `adminAuth` / `adminStorage` — Proxies (SEM uso direto via `adminAuth.x` no código)
- `default admin` — namespace compat com `admin.firestore()` e `admin.auth()`
  (usados por `permissionMiddleware.ts` e `cobraiWorker.ts:268`)

**Consequência:** construindo uma fachada com a MESMA API do Firestore, mas persistindo
no Supabase (`src/lib/db-compat/`), trocamos o banco inteiro do backend **sem editar os
consumidores** (`messageWorker.ts` 1605L, `gemini.server.ts` 4300L, `cobraiWorker.ts`,
15 workers, 12 routes, 25 libs — todos intactos).

Este é o padrão *strangler-fig com shim de compatibilidade* — o mesmo usado em migrações
DynamoDB→Aurora e Datastore→Spanner em big techs.

### 0.2 Superfície da API Firestore realmente usada (auditada em 2026-07-03)

| API | Onde | Estratégia no compat |
|---|---|---|
| `.collection(name)` | todo lugar | `CollectionRef` |
| `.doc(id)` / `.doc()` auto-ID | todo lugar | `DocRef` (auto-ID = uuid v4) |
| `.get()` (doc) → `{exists, id, data()}` | todo lugar | select 1 row |
| `.get()` (query) → `{empty, size, docs[], forEach}` | todo lugar | select N rows |
| `.set(data)` / `.set(data, {merge:true})` | comum | upsert / update-or-insert |
| `.update(data)` | comum | update |
| `.delete()` | comum | delete |
| `.add(data)` | comum | insert com uuid |
| `.where(f, op, v)` — ops `==`,`!=`,`>`,`>=`,`<`,`<=`,`in`,`array-contains` | comum | `.eq/.neq/.gt/.gte/.lt/.lte/.in/.contains` |
| `.orderBy(f, dir)` | comum | `.order` |
| `.limit(n)` | comum | `.limit` |
| `FieldValue.serverTimestamp()` | ~60 usos (messageWorker 25×, cobraiWorker 10×) | sentinel → `new Date().toISOString()` |
| `FieldValue.increment(n)` | `dbAdmin.ts:419` | sentinel → read-modify-write |
| `FieldValue.arrayUnion/arrayRemove/delete` | raros | sentinels → read-modify-write |
| `Timestamp.fromDate/now` + `.toDate()/.toMillis()` em leituras | audit, cobraiWorker, gemini.server | classe compat `CompatTimestamp` |
| `.batch()` → set/update/delete/commit | `holidays.ts:55`, `personaManager.ts:88` | execução sequencial |
| `runTransaction` | `db.ts` (frontend), `gemini.ts` (frontend) | frontend é portado direto; backend não usa |
| `onSnapshot` | **APENAS frontend** (já removido em S99) | n/a no backend |
| `collectionGroup` | **não usado** | n/a |
| `verifyIdToken` | 5 arquivos de middleware/routes | substituído por JWT Supabase (FZ-3) |

### 0.3 Mapeamento coleção Firestore → destino Supabase

**Tabelas nativas (já existem, migrations 001–030 em `packages/db/src/migrations/`):**

| Coleção Firestore | Tabela Supabase | Observações |
|---|---|---|
| `customers` | `customers` | camelCase→snake_case |
| `tickets` | `tickets` | `aiEnabled`→`ai_enabled` etc. |
| `tickets/{id}/messages` | `messages` | subcoleção → flat com `ticket_id` |
| `tenants` | `tenants` | |
| `invoices` | `invoices` | |
| `billing_invoices` | `invoices` | mesma tabela (fonte legada duplicada) |
| `service_orders` | `service_orders` | |
| `technicians` | `technicians` | |
| `inventory` | `inventory` | |
| `team_members` | `team_members` | |
| `notifications` | `notifications` | |
| `network_ctos` | `network_ctos` | |
| `knowledge_base` | `knowledge_articles` | migration 017 |
| `role_permissions` | `role_permissions` | |
| `audit_logs` (legado = métricas IA!) | `ai_performance_logs` | ⚠️ ver migration 018 — NÃO é `audit_log` |
| `ai_token_logs` | `ai_performance_logs` | campos de token (migration 028) |
| `dead_letter_queue` | `dead_letter_queue` | migration 002 |
| `users` | `users` | migration 004 |
| `subscriptions` | `billing_subscriptions`* | *verificar nome na migration 008 |
| `whatsapp_instances` | `tenant_evolution_instances` | migration 022 |

**Fallback universal — `legacy_docs` (migration 031):** toda coleção SEM tabela nativa
(`ai_personas`, `saas_metrics`, `super_admins`, `prompts/*/versions`, `leads_temp`,
`counters`, `custom_domains`, `hsm_templates`, `cto_incidents`, `technician_schedules`,
`contracts`, `payments`, `preferences`, `upsell_events`, `portability_requests`,
`erp_plans`, `security_logs`, `logs`, `settings` subcoleções, `departments`, `operators`,
`integration_keys`, `tenant_settings`, `ai_config`, `ai_provider_configs`, `plans`) cai
num **document store JSONB** endereçável por path:

```sql
legacy_docs (path TEXT PK, collection TEXT, parent_path TEXT, data JSONB, updated_at)
```

Regras do roteador (`db-compat/mapping.ts`):
1. Path de subcoleção com tabela nativa mapeada (ex.: `tickets/*/messages`) → tabela nativa.
2. Coleção top-level com tabela nativa E doc-id em formato UUID → tabela nativa.
3. Doc-id NÃO-UUID em tabela nativa (ex.: `tenants/DEFAULT_TENANT`) → `legacy_docs` + log WARN.
4. Qualquer outro caso → `legacy_docs`.
5. Toda queda no fallback loga `[db-compat] fallback path=... reason=...` — o objetivo é
   zerar esse log com o tempo (migrar coleção a coleção para tabelas nativas).

### 0.4 Conversão de campos (tabelas nativas)

- **Escrita:** chaves camelCase → snake_case (`customerId`→`customer_id`); `Date`/`CompatTimestamp` → ISO string; sentinels resolvidos.
- **Leitura:** snake_case → camelCase; colunas `*_at`/`timestamp` → `CompatTimestamp` (para que `data().createdAt.toDate()` continue funcionando).
- **`legacy_docs`:** dados gravados como estão (sem conversão) — fidelidade total ao legado.

### 0.5 Autenticação (FZ-3)

Frontend já loga via Supabase (S77 + S99–S109 enviam `session.access_token`).
O backend precisa parar de chamar `getAuth().verifyIdToken` (Firebase) e passar a:

1. Verificar assinatura do JWT Supabase: HS256 com env `SUPABASE_JWT_SECRET`
   (Dashboard → Settings → API → JWT Secret). Lib: `jsonwebtoken` (já no projeto? senão instalar).
2. Claims `role`/`tenantId` NÃO vêm no token Supabase por padrão → buscar na tabela
   `users` (`select role, tenant_id from users where id = sub`) com cache em memória
   (reutilizar `tokenCache.ts`).
3. Manter TODAS as camadas existentes: blacklist por jti (Redis), revogação global,
   cache de token — só a verificação de assinatura muda.

Call sites a trocar (5): `middleware/auth.ts`, `middleware/tenantStatusMiddleware.ts`,
`middleware/permissionMiddleware.ts`, `lib/featureFlags.ts`, `routes/superAdmin.ts`,
e `workers/cobraiWorker.ts:268` (`admin.auth()` — trocar por consulta à tabela users).

### 0.6 Storage

`TechnicianAppPage.tsx` (fotos) e `src/lib/storage.ts` (uploadAttachment) usam Firebase
Storage → portar para `supabase.storage.from('uploads')`. Bucket criado na migration 032.

---

## 1. Sprints

### FZ-0 — Fundações (este doc + migrations) ✅ quando: doc commitado, migrations criadas
- [x] `.astrum-progress/PLANO_FIRESTORE_ZERO.md` (este arquivo)
- [ ] `packages/db/src/migrations/031_legacy_docs.sql`
- [ ] `packages/db/src/migrations/032_storage_uploads.sql`

### FZ-1 — Camada `db-compat` ✅ quando: vitest verde no módulo novo
Arquivos novos:
```
src/lib/supabaseAdmin.ts          — client @supabase/supabase-js server-side (SERVICE_ROLE), lazy proxy
src/lib/db-compat/index.ts        — CompatFirestore + FieldValue + Timestamp exports
src/lib/db-compat/mapping.ts      — COLLECTION_MAP, isNativeTable(), toSnake/toCamel, isUuid()
src/lib/db-compat/doc.ts          — DocRef (get/set/update/delete/collection)
src/lib/db-compat/collection.ts   — CollectionRef + Query (where/orderBy/limit/get/add/doc)
src/lib/db-compat/fieldValues.ts  — sentinels + resolveSentinels()
src/lib/db-compat/timestamp.ts    — CompatTimestamp (now/fromDate/toDate/toMillis/seconds)
src/lib/db-compat/batch.ts        — WriteBatch sequencial
src/lib/db-compat/db-compat.test.ts — testes (mock do supabaseAdmin)
```
Logging: namespace `[db-compat]`; fallbacks em WARN; erros de query em ERROR com path.

### FZ-2 — Swap do seam ✅ quando: tsc compila, testes de workers passam sem editar workers
- Reescrever `src/lib/firebaseAdmin.ts`: `adminDb` = instância CompatFirestore;
  default export com `firestore()` compat (com `.Timestamp`/`.FieldValue` estáticos)
  e `auth()` → stub que lança erro claro (nenhum uso restante após FZ-3).
- NENHUM outro arquivo backend é editado neste sprint.

### FZ-3 — Auth Supabase JWT ✅ quando: testes de auth atualizados verdes
- Novo `src/lib/authVerify.ts` + reescrita de `verifyAndDecodeToken`.
- Trocar os 5 call sites + cobraiWorker.
- Atualizar `src/__tests__/middleware/auth.test.ts` (mock de jsonwebtoken em vez de firebase-admin/auth).
- Env novas: `SUPABASE_JWT_SECRET` (obrigatória), documentar em `.env.example`.

### FZ-4 — Purge frontend ✅ quando: zero imports `firebase/*` em src/**/*.tsx e tsx compila
1. **supabaseDb.ts** ganha as funções que faltam (portar de `db.ts`):
   `incrementAiAttempts`, `notifyTeam`, `saveIntegrationKeys`, `getSystemPrompts`,
   `saveSystemPrompts`, `createKBArticle`, `updateKBArticle`, `deleteKBArticle`,
   `updateInventoryItem`, `createInventoryItem`, `deleteInventoryItem`,
   `seedKnowledgeBase`, `seedSystem`, `seedInventory`, `seedServiceOrdersAndTechnicians`,
   `maskCpfForLog` (pura — copiar).
2. **Swap de imports** (6 arquivos): App.tsx, ChatPage, CobrAIPage, CustomersPage,
   OperatorMobilePage, ServiceOrdersPage → `./lib/supabaseDb`.
3. **App.tsx auth:** `onAuthStateChanged`→`supabase.auth.onAuthStateChange`;
   `signInWithPopup(Google)`→`supabase.auth.signInWithOAuth({provider:'google'})`;
   `signOut`→`supabase.auth.signOut`; MFA resolver → `supabase.auth.mfa` (challenge/verify).
4. **App.tsx corpo:** substituir `updateDoc/addDoc/deleteDoc/setDoc/getDocs/onSnapshot`
   restantes por chamadas supabase diretas (inventariar com grep antes).
5. **Componentes** (grep `firebase` em src/components): Sidebar, TopHeader, KanbanBoard,
   MfaRequirement, MfaLoginResolver, SuperAdminRoute, CustomerHistorySidebar,
   EscalationRulesBuilder, TimeMetricsCard, SentimentMetricsCard.
6. **Storage:** `lib/storage.ts` + TechnicianAppPage → supabase.storage.
7. **WebchatPage** (1 ref) e libs frontend com firestore client: `gemini.ts`,
   `permissionsManager.ts`, `vectorStore.ts`, `dbSafe.ts` — portar ou apontar p/ compat.
8. Deletar `src/lib/firebase.ts` e `src/lib/db.ts`.

### FZ-5 — Limpeza de dependências ✅ quando: `npm ls firebase firebase-admin` vazio
- `package.json`: remover `firebase`, `firebase-admin`.
- Deletar `src/repositories/firebase/*`; `resolveDbProvider` retorna sempre 'supabase'
  (manter função para não quebrar testes; atualizar teste).
- `src/__tests__/setup.ts`: remover mocks firebase-admin; adicionar mock de
  `src/lib/supabaseAdmin.ts`.
- Deletar `src/test-db.ts`, `src/test-flow.ts`, `src/test1.ts` (scripts manuais firestore).
- `firebase-applet-config.json`: não deletar o arquivo (histórico), mas nada mais o lê.

### FZ-6 — Verificação final ✅ quando: tudo abaixo verde
```powershell
npx tsc --noEmit --skipLibCheck        # sem erros NOVOS (baseline: erros pré-existentes documentados)
npx vitest run                         # suíte completa
Select-String -Path src -Pattern "from ['\"]firebase" -Recurse   # ZERO resultados
npm ls firebase firebase-admin        # ZERO
```
- Commits por sprint (`feat(fz-N): ...`).
- Atualizar `CLAUDE.md` (R2 vira: "Supabase é o ÚNICO banco; Firestore foi removido em FZ").
- Atualizar memória do projeto.

---

## 2. Operação (para quem tem dados reais no Firestore)

Se houver dados de produção no Firestore que ainda não foram backfillados:
1. **Antes do deploy** desta branch: rodar o backfill ETL (scripts S79/S80 do plano V2)
   Firestore → Supabase e validar contagens por coleção.
2. Coleções sem tabela nativa: exportar via `firebase firestore:export` e importar no
   `legacy_docs` com script (`scripts/import-legacy-docs.ts` — criar sob demanda:
   itera o export, insere `path/collection/data`).
3. **Rollback:** `git revert` do(s) commit(s) FZ + redeploy. O Firestore não é apagado
   do console GCP até 30 dias de estabilidade — apenas o CÓDIGO deixa de usá-lo.

## 3. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Coleção esquecida no mapeamento | Fallback universal `legacy_docs` — nada quebra, gera WARN observável |
| Doc-id não-UUID em tabela nativa | Roteia para legacy_docs + WARN (regra 3 do §0.3) |
| Query Firestore sem tradução Supabase (array-contains em coluna não-array) | Compat loga ERROR com path+op; corrigir caso a caso |
| Token Firebase ainda em uso por algum client | Frontend 100% Supabase desde S77/S99; erro 401 com code TOKEN_INVALID é o sinal |
| `serverTimestamp` client-side clock skew | Aceitável (era Firestore server-side); alternativa futura: `now()` via RPC |
| Testes que mockavam firebase-admin | setup.ts passa a mockar supabaseAdmin; testes que mockam `../lib/firebaseAdmin` continuam passando (o módulo mantém o nome e os exports) |
