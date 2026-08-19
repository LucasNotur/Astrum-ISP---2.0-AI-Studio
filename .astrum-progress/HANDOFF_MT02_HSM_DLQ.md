# HANDOFF — MT-02: RLS por-tenant em `hsm-templates` e `dlq`

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. Cumpra à risca. Isto é a continuação mecânica de um padrão de
segurança JÁ SHIPPED (MT-02, auditoria 2026-08-10/12) — 9 arquivos já foram migrados
assim, você está portando mais 2. **Não invente uma abordagem diferente.**

### 1. Objetivo (contexto, não decisão sua)

O backend (`apps/api`) roda a maior parte das queries por `service_role` (via
`supabaseAdmin`), que **bypassa RLS** — o isolamento entre tenants depende só do
`.eq('tenant_id', tenantId)` manual em cada query. Se algum dev esquecer esse filtro em
algum lugar, é um vazamento cross-tenant silencioso. A migration `096` (já aplicada em
produção) fez a RLS reconhecer um GUC de sessão (`app.current_tenant`) como fallback, e o
helper `apps/api/src/infrastructure/database/tenant-rls.ts` (`readTenantScoped`/
`writeTenantScoped`) roda a query numa transação `pg` com esse GUC setado — **a RLS vira
uma segunda barreira real**, não só o filtro manual.

**Rollout incremental, já em produção, comportamento ZERO-mudança por padrão:** o helper
só usa o caminho RLS quando `TENANT_RLS_ROUTES_ENABLED=true` **e** `DATABASE_URL` estão
setadas; senão cai no `fallback` (o `supabaseAdmin` de sempre). **Você não precisa de
acesso a banco pra fazer este spec** — o `fallback` é obrigatório e é o único caminho que
roda nos seus testes (sem `DATABASE_URL`, a flag nunca liga).

**9 arquivos já foram migrados** com este padrão exato — leia
`apps/api/src/domain/ia/ocr-review.routes.ts` **inteiro antes de começar**, é a referência
de estilo mais próxima (tem leitura E escrita, GET + PATCH, mesmo formato de erro). Não
copie de nenhum outro lugar.

### 2. Lista EXAUSTIVA de arquivos permitidos

**EDITAR (só estes 2 — os outros candidatos residuais como `webchat.routes.ts` e
`metrics.routes.ts` ficam para uma rodada futura, NÃO são seu escopo):**
1. `apps/api/src/domain/atendimento/hsm-templates.routes.ts`
2. `apps/api/src/domain/ops/dlq.routes.ts`

**NÃO TOCAR:** `apps/api/src/infrastructure/database/tenant-rls.ts` (o helper já existe,
pronto, não mexa nele), `hsm-templates.service.ts`, `dlq.service.ts` (lógica pura, sem
acesso a banco — fora de escopo), qualquer um dos 9 arquivos já migrados, `webchat.routes.ts`,
`metrics.routes.ts`, `personas.routes.ts`, `lgpd.routes.ts`, `unmask.routes.ts`.

**Ações proibidas:** instalar dependências novas; `git push` (só commit local); `git add
-A`/`.`; ligar `TENANT_RLS_ROUTES_ENABLED` em qualquer `.env`; mudar o comportamento do
`fallback` (tem que continuar idêntico ao que a rota faz hoje — mesmas queries, mesmos
filtros, mesmos códigos de erro); remover o `.eq('tenant_id', ...)` de dentro do path RLS
(o comentário no `tenant-rls.ts` já explica: mantém o filtro explícito TAMBÉM no caminho
RLS, defesa em profundidade, não é redundância descartável).

Se o código real divergir do que está descrito aqui, **PARE e reporte** — não adivinhe.

---

## 3. `hsm-templates.routes.ts` — 3 rotas a portar

Estado atual (leia o arquivo real antes — os números de linha abaixo são de quando este
spec foi escrito, podem ter mudado):

- `GET /api/v2/hsm-templates` — `supabaseAdmin.from('hsm_templates').select('*').eq('tenant_id', tenantId).order(...)`.
- `POST /api/v2/hsm-templates` — `supabaseAdmin.from('hsm_templates').insert(row).select().single()` (o `row` já vem com `tenant_id` embutido, montado por `buildHsmTemplateRow(tenantId, req.body)` — **não mude essa função nem o service**).
- `DELETE /api/v2/hsm-templates/:id` — 2 queries: um `select('status').eq('id',id).eq('tenant_id',tenantId).maybeSingle()` pra checar se pode apagar, depois o `delete().eq('id',id).eq('tenant_id',tenantId)`.

Importe `readTenantScoped, writeTenantScoped` de `'../../infrastructure/database/tenant-rls'`
(confirme o caminho relativo real a partir de `hsm-templates.routes.ts` — pode ser
`'../../infrastructure/database/tenant-rls'`, confira contra o import de
`supabaseAdmin` que já existe no arquivo, que vem de `'../../infrastructure/database/supabase.client'` — mesmo nível).

**GET** — envolva a query com `readTenantScoped`, mesmo formato do `ocr-review.routes.ts`:
```ts
const templates = await readTenantScoped(tenantId, {
  rls: async (db) => {
    const { rows } = await db.query(
      `SELECT * FROM hsm_templates WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows;
  },
  fallback: async () => {
    const { data, error } = await supabaseAdmin
      .from('hsm_templates')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
if (templates === undefined) return reply.code(500).send({ code: 'DB_ERROR' });
return reply.send(templates);
```
Preserve o formato de erro ORIGINAL da rota (hoje é `{ code: 'DB_ERROR', message: error.message }`)
— envolva a chamada acima num `try/catch` se necessário pra manter esse shape de erro em
vez de deixar a exceção do `readTenantScoped` vazar crua. Olhe como `ocr-review.routes.ts`
faz isso (`try { ... } catch (err) { ... }`) e replique o mesmo espírito, adaptado ao
formato de erro QUE JÁ EXISTE nesta rota (não adote o formato do ocr-review, adote o
formato que a rota hsm-templates já tinha antes da sua mudança).

**POST** — envolva o insert com `writeTenantScoped`. Cuidado: a rota original trata
especialmente o erro `23505` (duplicata) com 409 — preserve isso nos DOIS caminhos
(rls e fallback), não só no fallback:
```ts
const inserted = await writeTenantScoped(tenantId, {
  rls: async (db) => {
    const { rows } = await db.query(
      `INSERT INTO hsm_templates (tenant_id, name, language, category, status, components, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [row.tenant_id, row.name, row.language, row.category, row.status, row.components, row.created_at],
    );
    return rows[0];
  },
  fallback: async () => {
    const { data, error } = await supabaseAdmin.from('hsm_templates').insert(row).select().single();
    if (error) throw error; // preserva error.code=23505 pro catch de fora tratar
    return data;
  },
});
```
**Confira os nomes EXATOS das colunas de `hsm_templates`** olhando o `row` que
`buildHsmTemplateRow` monta (abra `hsm-templates.service.ts` só para LER a forma do
objeto — não edite esse arquivo) antes de escrever o INSERT SQL — não adivinhe os nomes
de coluna. Ajuste a lista de colunas/params pra bater exatamente com as chaves de `row`.
Mantenha o `catch` externo tratando `error.code === '23505'` → 409 (hoje o erro do
Supabase client tem `.code`; se o path `rls` (via `pg`) lançar, o erro do driver `pg`
também expõe `.code === '23505'` pra violação de unique constraint — mesmo tratamento
serve pros dois caminhos).

**DELETE** — envolva a leitura (`select('status')...maybeSingle()`) com `readTenantScoped`
e o delete final com `writeTenantScoped`, mesmo padrão acima.

---

## 4. `dlq.routes.ts` — 2 rotas a portar

- `GET /api/v2/dlq` — `select('*').eq('tenant_id',tenantId).eq('resolved',false).order('failed_at',{ascending:false})`.
- `POST /api/v2/dlq/:id/retry` — 2 operações: `select('*').eq('id',id).eq('tenant_id',tenantId).maybeSingle()`
  pra achar o job, depois (fora do banco — enfileira via BullMQ, **não mexa nessa parte**,
  ela já não é Supabase) um `update({resolved:true, resolved_at, resolved_by}).eq('id',id).eq('tenant_id',tenantId)`.

Mesmo padrão de import e envelopamento da seção 3. Para o `SELECT *` de
`dead_letter_queue`, **não tente listar as colunas manualmente** — use
`SELECT * FROM dead_letter_queue WHERE ...` mesmo (o service/caller já espera o shape
completo da tabela, replicar às cegas o `select('*')` original é o comportamento
correto aqui, ao contrário do INSERT da seção 3 onde as colunas precisam ser explícitas).

```ts
const jobs = await readTenantScoped(tenantId, {
  rls: async (db) => {
    const { rows } = await db.query(
      `SELECT * FROM dead_letter_queue WHERE tenant_id = $1 AND resolved = false ORDER BY failed_at DESC`,
      [tenantId],
    );
    return rows;
  },
  fallback: async () => {
    const { data, error } = await supabaseAdmin
      .from('dead_letter_queue')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('resolved', false)
      .order('failed_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
```

Para o retry: a busca do `row` (pra passar pro `resolveRetryTarget`) via `readTenantScoped`,
e o `update` final via `writeTenantScoped` — **entre os dois continua o mesmo código atual**
(`resolveRetryTarget(row)` + enfileirar no BullMQ), isso não é Supabase e não muda.

---

## 5. Verificação mecânica obrigatória

```bash
grep -c "readTenantScoped\|writeTenantScoped" apps/api/src/domain/atendimento/hsm-templates.routes.ts apps/api/src/domain/ops/dlq.routes.ts
```
Cada arquivo deve ter pelo menos 3 (hsm-templates: GET+POST+DELETE) e 2 (dlq: GET+retry)
ocorrências respectivamente.

```bash
grep -n "supabaseAdmin" apps/api/src/domain/atendimento/hsm-templates.routes.ts apps/api/src/domain/ops/dlq.routes.ts
```
`supabaseAdmin` ainda deve aparecer — só dentro dos blocos `fallback:`, nunca fora deles.

## 6. Definition of Done

1. Baseline de typecheck ANTES/DEPOIS (`cd apps/api && npx tsc --noEmit 2>&1 | grep -c
   "error TS"` — baseline conhecido 56, confirme o número de hoje) — não pode aumentar.
2. Sem `DATABASE_URL`/flag setadas, o comportamento tem que ser IDÊNTICO ao de antes —
   prove isso reescrevendo/estendendo `hsm-templates.service.test.ts` e
   `dlq.service.test.ts` SE eles cobrirem a rota (se só cobrirem o `.service.ts` puro,
   que você não tocou, não precisa adicionar nada ali — mas rode e confirme que continuam
   verdes). Se não existir teste de rota pra nenhum dos dois hoje, **não é obrigatório
   criar um novo** (o `ocr-review.routes.ts`, a referência de estilo, também não tem) —
   mas rode manualmente via `app.inject` num script descartável se quiser ganhar
   confiança extra (não precisa commitar isso).
3. Verificação mecânica da seção 5 limpa.
4. 1 commit local (só os 2 arquivos desta lista), sem `git push`.

## 7. Report final obrigatório

Lista exata de arquivos editados, hash do commit, saída colada do typecheck (antes/depois),
os nomes de coluna reais que você confirmou em `hsm-templates.service.ts` antes de
escrever o INSERT, qualquer desvio do spec e o motivo.

Se algo aqui conflitar com um impulso seu de "melhorar", o contrato ganha. Fim do contrato.

---

> Escrito pelo Claude em 2026-08-18. Investigação prévia (não refaça): rodei
> `grep -rl "supabaseAdmin.from(" apps/api/src/domain --include=*.routes.ts` pra achar
> todos os candidatos residuais do MT-02 (8 arquivos), li os 2 escolhidos aqui inteiros
> (são os mais limpos/isolados — sem tabelas fora do padrão tenant_id simples, sem RLS já
> resolvida por outro caminho como `lgpd.routes.ts`/`unmask.routes.ts`, sem tabela sem RLS
> como `personas.routes.ts`→`legacy_docs`) e confirmei que já existem exatamente 9 arquivos
> migrados com este padrão pra usar de referência de estilo.
