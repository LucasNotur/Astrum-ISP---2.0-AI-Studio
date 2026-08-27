# HANDOFF — WhatsApp multi-instância: fix do envio + CRUD de conexões

---

## ⛔ CONTRATO DE EXECUÇÃO — LEIA E OBEDEÇA ANTES DE TUDO

Escopo **ESTRITO**. A migration e a decisão de schema JÁ FORAM FEITAS e aplicadas em
produção (Claude Code, 2026-08-27) — você não decide banco, só implementa código sobre o
schema que já existe. **Não invente coluna, não invente tabela.**

### 1. Contexto (não é decisão sua, é o motivo do trabalho)

O Astrum é multi-tenant (cada ISP é um tenant) e cada tenant pode ter **múltiplos números
de WhatsApp** (ex.: um pra Suporte, outro pra Financeiro) — roadmap confirmado pelo dono do
produto em 2026-08-27. Duas coisas precisam ser corrigidas pra isso funcionar:

**(A) Bug crítico, já confirmado em produção (não é teórico):** a resposta automática da IA
por WhatsApp **ignora completamente qual instância/número recebeu a mensagem** e usa só
env global (`EVOLUTION_API_URL`/`EVOLUTION_API_KEY`), nunca as credenciais BYOK do tenant, e
a URL que ela monta nem inclui o nome da instância (`Evolution API` exige
`/message/sendText/{instance}`, o código hoje bate em `/message/sendText` sem instância).
Confirmado por query direta em produção: **zero tenants reais têm WhatsApp conectado hoje**
(tabela `tenant_evolution_instances` vazia), então isso ainda não incendiou ninguém — mas
vai quebrar 100% na primeira conexão real. Já existe a peça que resolve isso pronta e
testada em outro lugar do código — `resolveTenantKeys(tenantId)` em
`apps/api/src/lib/tenant-keys.ts` — você só precisa **ligá-la** no caminho que falta.

**(B) CRUD de conexões no backend não existe.** A tela (`src/pages/WhatsAppPage.tsx`) grava
direto no Supabase com o client anônimo (bloqueado desde a migration `092_p0_rls_hardening`)
E tenta gravar colunas que não existiam (`label`, `phone_number`, `ai_enabled` —
bug pré-existente, documentado no topo de `whatsapp-page.routes.ts`). A migration
`123_whatsapp_multi_instancia.sql` (já aplicada) criou essas colunas. Falta portar a tela
pra bater no backend (`apps/api`), como já foi feito pro DELETE (mesma rota, é o único
método que já existe).

### 2. Lista EXAUSTIVA de arquivos permitidos

**EDITAR:**
1. `apps/api/src/adapters/whatsapp/whatsapp.adapter.ts`
2. `apps/api/src/adapters/whatsapp/message-sender.service.ts`
3. `apps/api/src/adapters/channel/channel-sender.service.ts`
4. `apps/api/src/domain/ports/conversation.port.ts`
5. `apps/api/src/infrastructure/adapters/conversation-db.adapter.ts`
6. `packages/queue/src/workers/message.worker.ts`
7. `apps/api/src/domain/atendimento/whatsapp-page.routes.ts`
8. `src/pages/WhatsAppPage.tsx`

**CRIAR (teste novo, só se não existir ainda o arquivo — `whatsapp-page.routes.test.ts` já
existe, então é EDITAR nele, não criar):**
- Nenhum arquivo novo de produção. Só os 8 acima.

**NÃO TOCAR:** a migration `123_whatsapp_multi_instancia.sql` (já aplicada, não mexe),
`apps/api/src/lib/tenant-keys.ts` (já pronto, só importe), `apps/api/src/adapters/whatsapp/evolution-provision.service.ts`
(fora de escopo — é o fluxo de onboarding do PRIMEIRO número, roda separado),
`apps/api/src/domain/atendimento/multi-connection.service.ts` (Dossiê #58, serviço pronto
mas não ligado a nada — fora de escopo desta rodada, não precisa mexer nele nem ligá-lo),
`apps/api/src/domain/atendimento/evolution-webhook.routes.ts` (o parsing de `instanceName`
na entrada já está correto, não mexe), `apps/api/src/domain/atendimento/evolution-proxy.routes.ts`
(já correto, só é REUSADO pelo frontend).

**Ações proibidas:** instalar dependência nova; `git push` (só commit local); `git add -A`
ou `git add .`; qualquer migration/DDL nova (schema já está pronto); inventar campos/colunas
que não estão listados aqui; redesenhar a UI da tela (isto é bugfix de camada de dados sobre
UI existente, R1 do CLAUDE.md — não é permitido criar componente visual novo, só trocar
`fetch`/chamada de dados por trás do que já existe); mexer em `conversations` (a decisão de
produto foi EXPLICITAMENTE não fragmentar conversa por instância — granularidade fica em
`messages.instance_name`, não toque em `conversations`).

Se o código real divergir do que está descrito aqui (linha diferente, função renomeada),
**PARE e reporte** — não adivinhe, não invente por conta própria.

---

## 3. Schema já aplicado (referência — NÃO É PRA VOCÊ RODAR MIGRATION)

```sql
-- tenant_evolution_instances ganhou:
--   label TEXT
--   phone_number TEXT
--   ai_enabled BOOLEAN NOT NULL DEFAULT true
--   is_primary BOOLEAN NOT NULL DEFAULT false  -- só 1 true por tenant_id (índice único parcial)
-- (colunas que já existiam: id, tenant_id, instance_name, status, created_at)
-- UNIQUE(instance_name) já existia (migration 022) — é o campo certo pra onConflict.

-- messages ganhou:
--   instance_name TEXT  -- nullable, tag de qual instância tratou aquela mensagem
```

---

## 4. Parte A — Fix do envio (arquivos 1–6)

### 4.1 `apps/api/src/adapters/whatsapp/whatsapp.adapter.ts`

Estado atual — `WhatsAppMessage` não tem `instanceName`, e a URL não inclui instância:
```ts
export interface WhatsAppMessage {
  to: string;
  content: string;
  tenantId: string;
  evolutionUrl?: string;
  evolutionApiKey?: string;
}

async function sendWhatsAppAPI(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  const url = message.evolutionUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = message.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'dummy_key';

  const response = await fetch(`${url}/message/sendText`, {
```

Mude para: adicionar `instanceName?: string` na interface, e usar no path da URL — a
Evolution API espera `POST {url}/message/sendText/{instance}`. Se `instanceName` vier vazio
(não deve acontecer no fluxo real, mas defenda), caia pro path sem instância (comportamento
atual, não quebra nada que já funcionava):

```ts
export interface WhatsAppMessage {
  to: string;
  content: string;
  tenantId: string;
  evolutionUrl?: string;
  evolutionApiKey?: string;
  instanceName?: string;
}

async function sendWhatsAppAPI(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  const url = message.evolutionUrl || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = message.evolutionApiKey || process.env.EVOLUTION_API_KEY || 'dummy_key';
  const path = message.instanceName
    ? `/message/sendText/${message.instanceName}`
    : '/message/sendText';

  const response = await fetch(`${url}${path}`, {
```
(resto do corpo do `fetch` continua idêntico — só a variável `url` do template literal muda
pra `${url}${path}`).

### 4.2 `apps/api/src/adapters/whatsapp/message-sender.service.ts`

Estado atual:
```ts
export interface SendWhatsAppOptions {
  to: string;
  content: string;
  tenantId: string;
  conversationId?: string;
}

export async function sendWhatsAppResponse(opts: SendWhatsAppOptions): Promise<void> {
  const { to, content, tenantId, conversationId } = opts;

  const parts = splitMessage(content);

  for (let i = 0; i < parts.length; i++) {
    const result = await sendMessage({
      to,
      content: parts[i] ?? '',
      tenantId,
    });
```

Mude para: adicionar `instanceName?: string` nas options, importar `resolveTenantKeys` de
`'../../lib/tenant-keys'`, resolver as chaves UMA VEZ antes do loop (não a cada parte —
seria uma query por parte da mensagem à toa), e passar `evolutionUrl`/`evolutionApiKey`/
`instanceName` pro `sendMessage`:

```ts
import { sendMessage } from './whatsapp.adapter';
import { resolveTenantKeys } from '../../lib/tenant-keys';
import { atendimentoLogger } from '../../infrastructure/logging/logger';

// ...

export interface SendWhatsAppOptions {
  to: string;
  content: string;
  tenantId: string;
  conversationId?: string;
  instanceName?: string;
}

export async function sendWhatsAppResponse(opts: SendWhatsAppOptions): Promise<void> {
  const { to, content, tenantId, conversationId, instanceName } = opts;

  const parts = splitMessage(content);
  const { evolutionUrl, evolutionApiKey } = await resolveTenantKeys(tenantId);

  for (let i = 0; i < parts.length; i++) {
    const result = await sendMessage({
      to,
      content: parts[i] ?? '',
      tenantId,
      instanceName,
      evolutionUrl,
      evolutionApiKey,
    });
```
(resto do loop — logging, pausa entre partes — continua idêntico, não mude.)

### 4.3 `apps/api/src/adapters/channel/channel-sender.service.ts`

Estado atual, dentro de `sendChannelResponse`:
```ts
    case 'whatsapp':
      await sendWhatsAppResponse({ to: recipientId, content, tenantId, conversationId });
      break;
```
Mude para passar o `instanceName` que já chega em `opts` (o parâmetro já existe na função,
só não é repassado pro whatsapp — Meta e e-mail já usam):
```ts
    case 'whatsapp':
      await sendWhatsAppResponse({ to: recipientId, content, tenantId, conversationId, instanceName });
      break;
```

### 4.4 Tag `instance_name` nas mensagens salvas

**`apps/api/src/domain/ports/conversation.port.ts`** — adicione `instanceName?: string` em
`ISaveMessageInput`:
```ts
export interface ISaveMessageInput {
  tenantId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fromAI?: boolean;
  tokensUsed?: number;
  instanceName?: string;
}
```

**`apps/api/src/infrastructure/adapters/conversation-db.adapter.ts`** — no `saveMessage`,
inclua `instance_name: opts.instanceName ?? null` no `.insert({...})` (mesmo objeto que já
grava `tenant_id`, `conversation_id`, `role`, `content`, `from_ai`, `tokens_used`).

**`packages/queue/src/workers/message.worker.ts`** — dois pontos:
1. Na chamada de `saveMessage` da mensagem do usuário (comentário `// 2. SALVAR MENSAGEM DO
   USUÁRIO`), adicione `instanceName: job.data.instanceName` ao objeto passado.
2. No insert direto via `supabaseAdmin.from('messages').insert({...})` da resposta da IA
   (comentário `// 4. SALVAR RESPOSTA DA IA`), adicione `instance_name: job.data.instanceName`
   dentro do objeto do insert (mesmo nível de `conversation_id`, `tenant_id`, `content`, etc.
   — atenção: aqui é `insert` cru via Supabase, então é `instance_name` com underscore, não
   `instanceName` como no port).
3. Na chamada de `sendChannelResponse` (comentário `// 5. ENVIAR VIA CANAL DE ORIGEM`), o
   `instanceName: job.data.instanceName` **já está sendo passado** — não mexer, só confirmar
   que continua lá.

---

## 5. Parte B — CRUD de conexões no backend

### 5.1 `apps/api/src/domain/atendimento/whatsapp-page.routes.ts`

Hoje só tem o `DELETE`. Adicione 3 rotas novas, MESMO padrão de auth/tenant-scoping do
DELETE existente (reusa o `auth` e o `tenantOf(req)` que já estão no arquivo):

- **`GET /api/v2/whatsapp/instances`** — lista as instâncias do tenant do JWT:
  ```ts
  app.get('/api/v2/whatsapp/instances', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data ?? []);
  });
  ```

- **`POST /api/v2/whatsapp/instances`** — cria uma conexão nova. Body:
  `{ instanceName: string, label: string, isPrimary?: boolean }`. Validação: 400 se
  `instanceName` ou `label` vier vazio. Upsert por `instance_name` (é o campo UNIQUE real —
  **não** use `onConflict: 'tenant_id,instance_name'`, esse par não tem constraint e vai dar
  erro do Postgres):
  ```ts
  app.post('/api/v2/whatsapp/instances', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { instanceName, label, isPrimary } = (req.body ?? {}) as { instanceName?: string; label?: string; isPrimary?: boolean };
    if (!instanceName || !label) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'instanceName e label são obrigatórios.' });
    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .upsert({ tenant_id: tenantId, instance_name: instanceName, label, is_primary: !!isPrimary, ai_enabled: true, status: 'unknown' }, { onConflict: 'instance_name' })
      .select('*')
      .single();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    return reply.send(data);
  });
  ```

- **`PATCH /api/v2/whatsapp/instances/:instanceName`** — atualiza `label`/`ai_enabled`/
  `phone_number` de uma conexão do PRÓPRIO tenant (filtra por `tenant_id` do JWT igual o
  DELETE já faz — segurança: nunca permita atualizar instância de outro tenant):
  ```ts
  app.patch('/api/v2/whatsapp/instances/:instanceName', { onRequest: auth }, async (req: any, reply: any) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    const { instanceName } = req.params as { instanceName: string };
    const { label, aiEnabled, phoneNumber } = (req.body ?? {}) as { label?: string; aiEnabled?: boolean; phoneNumber?: string };
    const patch: Record<string, unknown> = {};
    if (label !== undefined) patch.label = label;
    if (aiEnabled !== undefined) patch.ai_enabled = aiEnabled;
    if (phoneNumber !== undefined) patch.phone_number = phoneNumber;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Nada para atualizar.' });
    const { data, error } = await supabaseAdmin
      .from('tenant_evolution_instances')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('instance_name', instanceName)
      .select('*')
      .maybeSingle();
    if (error) return reply.code(500).send({ code: 'DB_ERROR', message: error.message });
    if (!data) return reply.code(404).send({ code: 'NOT_FOUND' });
    return reply.send(data);
  });
  ```

Atualize o comentário no topo do arquivo (o que hoje diz "Só esta operação (delete) foi
migrada") pra refletir que GET/POST/PATCH também foram, mas mantenha o aviso sobre o R5/F1-B
como histórico.

### 5.2 Teste — `apps/api/src/domain/atendimento/whatsapp-page.routes.test.ts`

Siga EXATAMENTE o padrão que já existe no arquivo (helper `makeChain`/`mockFrom`, já usa
`eq`/`delete` na lista de métodos encadeáveis — adicione `select`, `upsert`, `update`,
`single`, `maybeSingle`, `order` à lista de métodos do `makeChain` conforme cada rota
precisar). Cubra no mínimo, pra cada rota nova: (1) sem tenant no JWT → 401; (2) caminho
feliz; (3) não vaza pra outro tenant (mesmo teste de isolamento que já existe pro DELETE,
adaptado); (4) erro do Supabase → 500. Pro PATCH, cubra também 404 quando `data` vier vazio.

---

## 6. Parte C — Frontend `src/pages/WhatsAppPage.tsx`

**Não redesenhe nada visualmente** — é troca de fonte de dados atrás da UI que já existe
(R1 do CLAUDE.md: bugfix de camada de dados é permitido no frontend legado, componente
visual novo não é).

1. Import: adicione `apiPatch` ao import já existente de `@/src/lib/apiClient` (linha 22 do
   arquivo) — já existe exportado em `src/lib/apiClient.ts:105`, não precisa criar nada.

2. Troque a função `saveConnections` (que hoje faz `supabase.from('tenants').update({
   evolution_instances: ... })` — **essa coluna nem existe**, é bug morto — e
   `supabase.from('tenant_evolution_instances').upsert(...)` direto com client anônimo) por
   chamadas a `apiPost('/api/v2/whatsapp/instances', { instanceName, label: alias, isPrimary
   })` pra cada conexão nova (chame só pras conexões que ainda não foram salvas — controle
   isso com o campo `isDefault`/algum flag local, ou simplesmente faça upsert idempotente
   pra todas, já que o backend faz upsert por `instance_name`). Remova completamente o
   `supabase.from('tenants').update({ evolution_instances: ... })` (coluna não existe, dead
   code).

3. `handleAddConnection`: depois de gerar o `instanceName` e adicionar ao estado local,
   **também chame o proxy pra criar a instância de fato na Evolution API** antes de salvar no
   backend — reusa o padrão que `fetchStatusAndQr` já usa (`apiPost('/api/v2/evolution/proxy',
   { path: '/instance/create', method: 'POST', body: { instanceName: generatedInstanceName,
   webhook: ... } })`). **Não invente o shape do body** — olhe exatamente o payload que
   `apps/api/src/adapters/whatsapp/evolution-provision.service.ts` (`createInstance`) já
   manda pra Evolution (`instanceName`, `webhook`, `webhookByEvents: true`, `events:
   ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']`) e replique o mesmo shape — a URL do webhook é
   sempre a mesma (`{PUBLIC_API_URL}/api/v2/webhook/evolution`), mas você não tem acesso a
   env do backend no frontend: peça pro backend essa URL, OU (mais simples e correto) NÃO
   duplique a lógica de provisionamento no frontend — em vez disso, adicione um 4º parâmetro
   opcional ao `POST /api/v2/whatsapp/instances` do passo 5.1 (`provisionOnEvolution:
   boolean`, default `true`) e faça o create-na-Evolution ACONTECER NO BACKEND dentro dessa
   mesma rota, chamando as mesmas ports que `evolution-provision.service.ts` expõe
   (`makeDefaultPorts().createInstance`) — isso evita duplicar o webhook URL/eventos em dois
   lugares. Se essa integração ficar complexa demais dentro do escopo, PARE e reporte a
   dificuldade em vez de inventar um caminho alternativo.

4. `handleRemoveConnection` já usa `apiDelete` corretamente — não mexa.

---

## 7. Definition of Done

- `npx vitest run apps/api/src/domain/atendimento/whatsapp-page.routes.test.ts apps/api/src/adapters/whatsapp apps/api/src/adapters/channel packages/queue/src/workers/message.worker.test.ts` roda limpo (se `message.worker.test.ts` não existir, rode só os que existem e diga isso no report — não crie teste novo pra worker, fora do escopo desta rodada).
- `npx tsc --noEmit` sem erro NOVO introduzido pelos seus arquivos (baseline de erros pré-existentes do repo não é problema seu, só não aumente).
- Nenhuma coluna/tabela inventada — só as que este doc lista.
- `git status` mostra só os 8 arquivos da lista de "EDITAR" (+ o teste, que é edição do mesmo
  arquivo já listado).
- Commit local (sem `git push`), mensagem descrevendo as duas partes (fix de envio + CRUD).

## 8. Report final obrigatório

Ao terminar, reporte: (1) diff resumido por arquivo; (2) resultado do vitest (comandos +
saída); (3) se o passo 3 da Parte C (provisionar na Evolution) foi implementado no backend
como sugerido, ou se você preferiu outro caminho — e por quê; (4) qualquer divergência entre
o que este doc descreve e o código real que você encontrou.
