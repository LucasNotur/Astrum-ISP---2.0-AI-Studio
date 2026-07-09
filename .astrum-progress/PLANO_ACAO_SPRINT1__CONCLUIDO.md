# PLANO DE AÇÃO — Sprint 1 (e roadmap S2/S3)

> **Público-alvo deste documento:** uma IA braçal (ou dev júnior) que vai executar
> sem ter que investigar nada. Cada passo tem: caminho absoluto do arquivo, o trecho
> EXATO de antes, o trecho EXATO de depois, o comando de verificação e a mensagem de
> commit. **Não improvise. Não "melhore" além do pedido.** Se um `old_string` não bater
> 1:1 com o arquivo, PARE e releia o arquivo — não force.
>
> **Base verificada em:** 2026-07-04, branch `chore/cleanup-repo-junk`.
> Todos os números de linha abaixo foram lidos do código real nesta data.
>
> **Regras do projeto que valem aqui:** R4 (lógica nova só em `apps/api`), padrão de
> qualidade (todo código novo tem teste Vitest). Ver `CLAUDE.md`.

---

## 0. Preparação (fazer UMA vez, antes de tudo)

### 0.1 Criar a branch de trabalho

Não trabalhe em `main`. Estamos em `chore/cleanup-repo-junk` — crie uma branch dedicada a partir dela:

```bash
git checkout -b fix/sprint1-hardening
```

### 0.2 Baseline verde ANTES de mexer

Rode a suíte inteira e guarde o número. Serve de referência ("antes eram 804 passing").

```bash
npx vitest run
```

Resultado esperado hoje: **804 passed, 6 skipped, 0 failed**. Se já vier vermelho,
PARE e reporte — não empilhe suas mudanças em cima de um baseline quebrado.

### 0.3 Ordem de execução (siga nesta sequência)

1. Fix 1 — `env.validator.ts` (fail-fast em produção)  ← 5 min
2. Fix 2 — `openai.adapter.ts` (matar `dummy_key`)      ← 15 min
3. Fix 3 — deletar `functions/src/index.ts`             ← 10 min (com verificação)
4. Fix 4 — teste real de `langgraph.service.ts`         ← 1 dia
5. Fix 5 — teste de `bullmq.client.ts`                  ← 1 dia

Cada fix é **1 commit**. Rode `npx vitest run` depois de cada um.

---

## FIX 1 — `env.validator.ts` deve abortar em produção (mata C1)

**Arquivo:** `apps/api/src/infrastructure/config/env.validator.ts`
**Problema:** quando o Zod falha, o código faz `_env = process.env as any` e sobe o
servidor **sem tipos e sem chaves obrigatórias**. Para um app de cobrança bancária +
LGPD, subir degradado é pior do que não subir. Queremos **fail-fast em produção** e
manter o comportamento tolerante só em dev/preview.

**Contexto atual (linhas 57-69):**

```ts
  if (!result.success) {
    console.error('\n❌ ERRO: Variáveis de ambiente inválidas ou ausentes:\n');
    result.error.issues.forEach(issue => {
      console.error(`  → ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nVerifique seu arquivo .env e corrija os erros acima.\n');

    // Sempre permitimos prosseguir, usando as variáveis disponíveis.
    // Isso evita crash no Preview / Cloud Run caso uma chave (como SUPABASE_URL) esteja faltando.
    console.warn('⚠️ Ignorando falha de variáveis de ambiente para permitir boot do server.');
    _env = process.env as any;
    return _env!;
  }
```

### Edit exato

- **old_string:**
```ts
    // Sempre permitimos prosseguir, usando as variáveis disponíveis.
    // Isso evita crash no Preview / Cloud Run caso uma chave (como SUPABASE_URL) esteja faltando.
    console.warn('⚠️ Ignorando falha de variáveis de ambiente para permitir boot do server.');
    _env = process.env as any;
    return _env!;
```

- **new_string:**
```ts
    // Em produção NUNCA subimos com env inválido: cobrança bancária + LGPD exigem
    // fail-fast. Degradar silenciosamente transforma "falta SUPABASE_URL" em
    // "undefined.something" no meio de uma transação — muito pior de diagnosticar.
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Boot abortado: variáveis de ambiente inválidas em produção.');
      process.exit(1);
    }

    // Fora de produção (dev/preview/test) seguimos degradado para não travar o Studio.
    console.warn('⚠️ [DEV] Ignorando falha de env para permitir boot local. NUNCA em produção.');
    _env = process.env as any;
    return _env!;
```

### Teste (obrigatório — R do CLAUDE.md)

Crie o arquivo `apps/api/src/infrastructure/config/env.validator.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

describe('validateEnv — fail-fast em produção', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();               // limpa o singleton _env entre testes
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('em produção com env inválido chama process.exit(1)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_URL;        // força falha do schema
    delete process.env.JWT_SECRET;

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('__exit__'); }) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { validateEnv } = await import('./env.validator');
    expect(() => validateEnv()).toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('em desenvolvimento com env inválido NÃO derruba o processo', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SUPABASE_URL;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { validateEnv } = await import('./env.validator');
    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
```

### Verificação

```bash
npx vitest run apps/api/src/infrastructure/config/env.validator.test.ts
```

Esperado: **2 passed**.

### Commit

```bash
git add apps/api/src/infrastructure/config/env.validator.ts \
        apps/api/src/infrastructure/config/env.validator.test.ts
git commit -m "$(cat <<'EOF'
fix(api): env.validator aborta em produção quando env é inválido (C1)

Antes, uma falha de schema caía em `process.env as any` e subia o server
degradado. Para cobrança + LGPD isso é perigoso: agora em NODE_ENV=production
fazemos process.exit(1). Dev/preview seguem tolerantes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## FIX 2 — matar `'dummy_key'` silencioso no OpenAI (mata M4/parte de C-segurança)

**Arquivo:** `apps/api/src/adapters/openai/openai.adapter.ts`
**Problema:** linha 15, `apiKey: process.env.OPENAI_API_KEY || 'dummy_key'`. Se a chave
não estiver configurada em produção, o cliente sobe com `dummy_key` e só falha na
**primeira chamada real** (runtime), não no boot. Queremos: em produção sem chave →
erro explícito; em dev/test → mantém dummy com aviso.

> ⚠️ Cuidado importante: `createOpenAIClient()` é chamado no load do módulo
> (linha 38, `const defaultOpenAI = createOpenAIClient()`). Se você jogar um `throw`
> cru no topo, o `import` do módulo quebra até nos testes. Por isso a resolução da
> chave fica numa função que só lança em `NODE_ENV==='production'`.

### Edit 1 — adicionar helper (logo após a linha 6)

- **old_string:**
```ts
const isHeliconeEnabled = !!process.env.HELICONE_API_KEY;
```

- **new_string:**
```ts
const isHeliconeEnabled = !!process.env.HELICONE_API_KEY;

/**
 * Resolve a API key da OpenAI com fail-fast em produção.
 * - produção sem chave → lança (não deixa subir cliente inútil que só falha em runtime)
 * - dev/test sem chave  → 'dummy_key' + warn (permite rodar local/CI sem segredo real)
 */
function resolveOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OPENAI_API_KEY ausente em produção — abortando criação do cliente OpenAI.');
  }
  iaLogger.warn('[OPENAI] OPENAI_API_KEY ausente — usando dummy_key (apenas dev/test).');
  return 'dummy_key';
}
```

### Edit 2 — usar o helper na config

- **old_string:**
```ts
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key',
```

- **new_string:**
```ts
    apiKey: resolveOpenAIKey(),
```

### Verificação

```bash
# 1) o teste já existente do adapter continua verde (roda com NODE_ENV=test → dummy_key)
npx vitest run apps/api/src/adapters/openai/openai.adapter.test.ts
```

Esperado: continua **verde**. (Opcional) adicione um caso ao teste existente cobrindo
o throw em produção:

```ts
it('lança em produção quando OPENAI_API_KEY falta', () => {
  const prev = process.env.OPENAI_API_KEY;
  const prevNode = process.env.NODE_ENV;
  delete process.env.OPENAI_API_KEY;
  process.env.NODE_ENV = 'production';
  // createOpenAIClient é a export usada pelo módulo; importe-a no topo do teste
  expect(() => createOpenAIClient()).toThrow('OPENAI_API_KEY ausente em produção');
  process.env.OPENAI_API_KEY = prev;
  process.env.NODE_ENV = prevNode;
});
```

### Commit

```bash
git add apps/api/src/adapters/openai/openai.adapter.ts \
        apps/api/src/adapters/openai/openai.adapter.test.ts
git commit -m "$(cat <<'EOF'
fix(api): OpenAI adapter falha explicitamente sem chave em produção (M4)

Remove o fallback silencioso `|| 'dummy_key'` que deixava o server subir e só
quebrar na primeira chamada. Agora produção lança no boot; dev/test seguem com
dummy_key + warn.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## FIX 3 — deletar `functions/src/index.ts` (resíduo Firebase) — COM verificação

**Arquivo:** `functions/src/index.ts` (24 KB, único arquivo em `functions/src/`).
**Problema:** ainda importa `firebase-functions/v2` e `firebase-admin` reais — viola R2
(Firestore-zero). Suspeita: código órfão. **NÃO delete às cegas.** Rode as 3 checagens
abaixo. Só delete se as TRÊS derem "órfão".

### Checagem A — alguém importa esse arquivo?

```bash
grep -rn "functions/src\|functions/index\|from ['\"].*functions['\"]" \
  --include="*.ts" apps src packages server.ts 2>/dev/null
```
Esperado para deletar: **nenhuma linha** apontando para `functions/`.

### Checagem B — há build/deploy configurado para `functions/`?

```bash
grep -rn "functions" package.json apps/api/package.json 2>/dev/null | \
  grep -i "deploy\|build\|predeploy\|firebase"
cat functions/package.json 2>/dev/null || echo "SEM functions/package.json"
cat firebase.json 2>/dev/null || echo "SEM firebase.json"
```
Esperado para deletar: sem script de deploy ativo de functions e/ou sem `firebase.json`
referenciando `functions`.

### Checagem C — o tsconfig raiz compila `functions/`?

```bash
grep -rn "functions" tsconfig*.json apps/api/tsconfig*.json 2>/dev/null
```
Esperado para deletar: `functions/` **não** está em `include`/`references`.

### Se as três confirmarem órfão → deletar

```bash
git rm functions/src/index.ts
# se a pasta functions/ ficar vazia e não tiver package.json próprio, remova-a:
git rm -r functions 2>/dev/null || true
```

Depois:

```bash
npx vitest run          # nada deve quebrar
```

> Se QUALQUER checagem apontar uso vivo, **não delete**. Em vez disso, reporte ao Lucas
> com a saída dos greps e pare este fix — segue para o Fix 4.

### Commit

```bash
git commit -m "$(cat <<'EOF'
chore: remover functions/src/index.ts órfão (resíduo firebase-functions/admin)

Único arquivo em functions/, sem imports vivos, sem deploy configurado, fora do
tsconfig. Fecha o último resquício real de Firebase (R2 / Plano FIRESTORE-ZERO).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## FIX 4 — teste REAL do `langgraph.service.ts` (mata C2)

**Arquivo de teste:** `apps/api/src/domain/agent/langgraph.service.test.ts`
**Problema exato (confirmado lendo o código):** o teste atual mocka toda a infra e só
exercita `initialState`, `nodeDecideSource`, `nodeValidate`. Ele **NUNCA** importa
`langgraph.service.ts`, logo `buildAgentGraph()` (linhas 29-95) e
`LangGraphService.processMessage()` (linhas 108-155) ficam **0% cobertos**. Esse é o
cérebro do atendimento IA.

**Estratégia:** mockar o módulo de nós (`./agent.nodes`) com funções deterministas que
devolvem *patches* de estado, e então invocar `langGraphService.processMessage()` de
verdade. Isso exercita: montagem do grafo, edges lineares, os **dois** edges
condicionais (guardrails→block e validate→escalate) e o service. Não precisa de rede,
Supabase nem OpenAI.

> Por que mockar `./agent.nodes` e não a infra? Porque `buildAgentGraph()` roda no load
> de `langgraph.service.ts` (linha 98) usando os nós importados. Trocar os nós por stubs
> nos dá controle total do roteamento e cobre o arquivo-alvo de ponta a ponta.

### Ação: ADICIONE este bloco ao FINAL de `langgraph.service.test.ts`

(não apague os testes existentes — só acrescente)

```ts
// ─────────────────────────────────────────────────────────────────────────────
// Cobertura REAL do grafo: exercita buildAgentGraph() + processMessage()
// mockando os nós para controlar o roteamento (happy / block / escalate).
// ─────────────────────────────────────────────────────────────────────────────
describe('LangGraphService.processMessage — grafo completo', () => {
  // Handles mutáveis para cada nó; trocamos o retorno por teste.
  const nodes = {
    guardPassed: true,
    validationPassed: true,
    requiresHuman: false,
  };

  // O mock precisa ser resolvido ANTES do import de langgraph.service.
  vi.doMock('./agent.nodes', () => ({
    nodeClassify:     async () => ({ intent: 'support_technical', steps: ['classify'] }),
    nodeGuardrails:   async () => ({ guardPassed: nodes.guardPassed }),
    nodeDecideSource: async () => ({ dataSource: 'qdrant' }),
    nodeFetchContext: async () => ({ ragContext: 'contexto-fake' }),
    nodeGenerate:     async () => ({ response: 'resposta-gerada' }),
    nodeValidate:     async () => ({
      validationPassed: nodes.validationPassed,
      requiresHuman: nodes.requiresHuman,
    }),
    nodeEscalate:     async () => ({ response: 'escalado-humano', requiresHuman: true }),
    nodeBlock:        async () => ({ response: 'mensagem-bloqueada', requiresHuman: true }),
  }));

  const input = {
    tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
    userMessage: 'Minha internet caiu',
  };

  async function run() {
    vi.resetModules();
    const { langGraphService } = await import('./langgraph.service');
    return langGraphService.processMessage(input);
  }

  it('caminho feliz: guardrails ok + validação ok → resposta gerada', async () => {
    nodes.guardPassed = true; nodes.validationPassed = true; nodes.requiresHuman = false;
    const out = await run();
    expect(out.response).toBe('resposta-gerada');
    expect(out.requiresHuman).toBe(false);
  });

  it('guardrails reprova → nó block encerra o grafo', async () => {
    nodes.guardPassed = false; nodes.validationPassed = true; nodes.requiresHuman = false;
    const out = await run();
    expect(out.response).toBe('mensagem-bloqueada');
  });

  it('validação reprova → nó escalate encerra o grafo', async () => {
    nodes.guardPassed = true; nodes.validationPassed = false; nodes.requiresHuman = false;
    const out = await run();
    expect(out.response).toBe('escalado-humano');
    expect(out.requiresHuman).toBe(true);
  });
});
```

> **Se algum teste falhar por causa do reducer de canais** (`value: (x,y) => y ?? x`):
> o canal `response` guarda o último valor não-nulo. No caminho feliz, `nodeGenerate`
> seta e `nodeValidate` não sobrescreve → `resposta-gerada`. Se o resultado vier
> diferente, LEIA `agent.state.ts` para confirmar os reducers antes de mexer no teste —
> não ajuste o assert para "passar de qualquer jeito".

### Verificação com cobertura

```bash
npx vitest run apps/api/src/domain/agent/langgraph.service.test.ts --coverage
```

Esperado: os 3 novos testes passam **e** `langgraph.service.ts` sai de **0%** para
cobertura alta (>80% de linhas — buildAgentGraph + processMessage exercitados,
incluindo o `catch` se você quiser um 4º teste forçando um nó a lançar).

### (Opcional, recomendado) 4º teste — cobre o `catch` fatal (linhas 145-154)

```ts
it('erro dentro de um nó → resposta de fallback + requiresHuman', async () => {
  nodes.guardPassed = true; nodes.validationPassed = true; nodes.requiresHuman = false;
  vi.resetModules();
  vi.doMock('./agent.nodes', () => ({
    nodeClassify: async () => { throw new Error('boom'); },
    nodeGuardrails: async () => ({}), nodeDecideSource: async () => ({}),
    nodeFetchContext: async () => ({}), nodeGenerate: async () => ({}),
    nodeValidate: async () => ({}), nodeEscalate: async () => ({}), nodeBlock: async () => ({}),
  }));
  const { langGraphService } = await import('./langgraph.service');
  const out = await langGraphService.processMessage(input);
  expect(out.requiresHuman).toBe(true);
  expect(out.response).toContain('erro interno');
});
```

### Commit

```bash
git add apps/api/src/domain/agent/langgraph.service.test.ts
git commit -m "$(cat <<'EOF'
test(api): cobrir grafo LangGraph real (buildAgentGraph + processMessage) (C2)

O teste antigo só exercitava nós isolados; o service e o roteamento condicional
ficavam 0%. Novos casos mockam ./agent.nodes e invocam processMessage cobrindo
happy-path, block (guardrails) e escalate (validação) + catch fatal.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## FIX 5 — teste de `bullmq.client.ts` (mata C4 parte de testes)

**Arquivo de teste (novo):** `apps/api/src/infrastructure/queue/bullmq.client.test.ts`
**Contexto:** o módulo detecta Redis mock via `isMockRedis = !((redis as any).options)`.
Em teste, o `redis.client` cai no mock (sem `.options`), então **todas** as filas viram
os stubs em memória — perfeito para testar `enqueueMessage`, `getMessagePriority`,
`getTenantQueue`, `getAggregateJobCounts` e `setupDLQ` sem Redis real.

> ⚠️ Os 4 TODOs (linhas 34, 83, 111, 135) permanecem — **não os implemente neste fix**;
> isso é escopo de sprint futura (DLQ no Supabase). Aqui só travamos o comportamento
> atual com testes para permitir refatorar com segurança depois.

### Ação: crie `apps/api/src/infrastructure/queue/bullmq.client.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Garante caminho "mock redis": um objeto sem `.options` → isMockRedis = true
vi.mock('../cache/redis.client', () => ({
  default: {
    // sem `options` de propósito
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  },
}));

describe('bullmq.client (modo mock redis)', () => {
  beforeEach(() => vi.resetModules());

  it('getMessagePriority: sem customerId → prioridade padrão 5', async () => {
    const { getMessagePriority } = await import('./bullmq.client');
    await expect(getMessagePriority('', 't1')).resolves.toBe(5);
  });

  it('getTenantQueue: retorna sempre a mesma fila mock por tenant', async () => {
    const { getTenantQueue } = await import('./bullmq.client');
    const q1 = getTenantQueue('tenant-A');
    const q2 = getTenantQueue('tenant-A');
    expect(q1).toBe(q2);                       // cacheada no Map
    expect(typeof (q1 as any).add).toBe('function');
  });

  it('enqueueMessage: adiciona job na fila do tenant e devolve id', async () => {
    const { enqueueMessage } = await import('./bullmq.client');
    const res: any = await enqueueMessage('tenant-A', { messageId: 'm1', customerId: 'c1' });
    expect(res).toHaveProperty('id');
  });

  it('getAggregateJobCounts: em mock redis devolve zeros para cada tipo', async () => {
    const { getAggregateJobCounts } = await import('./bullmq.client');
    const counts = await getAggregateJobCounts('waiting', 'active');
    expect(counts).toEqual({ waiting: 0, active: 0 });
  });

  it('setupDLQ: no failed após max tentativas loga movimentação para DLQ', async () => {
    const { setupDLQ } = await import('./bullmq.client');
    const { infraLogger } = await import('../logging/logger');
    const errSpy = vi.spyOn(infraLogger, 'error').mockImplementation(() => infraLogger as any);

    // worker fake que só guarda o handler de 'failed'
    let failedHandler: any;
    const worker = { on: (ev: string, cb: any) => { if (ev === 'failed') failedHandler = cb; } };
    setupDLQ(worker);

    await failedHandler(
      { name: 'process-message', attemptsMade: 3, opts: { attempts: 3 } },
      new Error('falhou'),
    );
    expect(errSpy).toHaveBeenCalled();          // [DLQ] Job movido para DLQ
  });
});
```

### Verificação

```bash
npx vitest run apps/api/src/infrastructure/queue/bullmq.client.test.ts --coverage
```

Esperado: **5 passed**, e `bullmq.client.ts` sobe de ~0% para cobertura relevante do
caminho mock (que é o que roda em CI).

### Commit

```bash
git add apps/api/src/infrastructure/queue/bullmq.client.test.ts
git commit -m "$(cat <<'EOF'
test(api): smoke + DLQ tests para bullmq.client no caminho mock-redis (C4)

Trava comportamento de enqueueMessage/getMessagePriority/getTenantQueue/
getAggregateJobCounts/setupDLQ antes de implementar os TODOs de DLQ no Supabase.
TODOs (linhas 34/83/111/135) permanecem — escopo de sprint futura.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Fechamento do Sprint 1

```bash
# 1) suíte inteira verde
npx vitest run
# esperado: >= 813 passed (804 antigos + ~9 novos), 0 failed

# 2) empurrar a branch e abrir PR (só quando Lucas autorizar o push)
git push -u origin fix/sprint1-hardening
```

**Checklist de Definition of Done (Sprint 1):**

- [ ] Fix 1 aplicado + `env.validator.test.ts` verde
- [ ] Fix 2 aplicado + adapter test verde
- [ ] Fix 3: 3 checagens rodadas; deletado SÓ se órfão (senão reportado)
- [ ] Fix 4: 3-4 testes novos, `langgraph.service.ts` > 80% linhas
- [ ] Fix 5: 5 testes novos, `bullmq.client.ts` deixa de ser 0%
- [ ] `npx vitest run` verde no fim
- [ ] 5 commits atômicos (um por fix), mensagens conforme acima

---

# ROADMAP — Sprints 2 e 3 (granularidade menor; detalhar quando chegar a vez)

> Estes ainda NÃO têm diffs prontos — são refatorações grandes que precisam de decisão
> de arquitetura do Lucas. Abaixo fica o esqueleto + os arquivos exatos a tocar.

## Sprint 2 — dívida estrutural

### S2.1 — Refatorar `domain/agent/agent.nodes.ts` para usar PORTS (mata C3)
- **Problema:** `domain/` importa de `infrastructure/` (viola DDD hexagonal).
  Arquivos: `agent.nodes.ts`, `atendimento/conversation.service.ts`,
  `atendimento/tickets.routes.ts`, `auth/auth.routes.ts`.
- **Ação:** criar `apps/api/src/domain/ports/` com interfaces
  (`AIService`, `SearchService`, `MemoryService`, `ToolsPort`, `LoggerPort`).
  `infrastructure/` implementa; injeta via factory/DI no boot.
- **Estratégia segura:** um port por vez, começando por `LoggerPort` (mais fácil),
  rodando `npx vitest run` a cada extração. Não faça tudo num commit.
- **Esforço:** ~2 dias.

### S2.2 — ESLint `@typescript-eslint/no-explicit-any` (reduz M1: 108 `as any`)
- Adicionar a regra como **warning** primeiro (não quebra CI), medir, migrar em lotes,
  depois virar **error**. Ofensores-topo: `websocket.routes.ts`, `tools.executor.ts`,
  `adapters/erp/{ixc,mkauth}.adapter.ts`.

### S2.3 — Migrar `@ai-sdk` v5→v6 e `zod` v3→v4 (mata C6: 26 erros TS)
- Erros concretos a resolver:
  - `vercel-ai.service.ts:219` — `maxSteps` saiu de `CallSettings` (nova API de steps)
  - `vercel-ai.service.ts:225` — `TypedToolCall.args` renomeado
  - `env.validator.ts:5` — overload de `ZodDefault` mudou no zod v4
  - `feature-flags.ts:36` — `exactOptionalPropertyTypes` reclamando de `boolean|undefined`
- Ler o CHANGELOG de cada lib ANTES. Rodar `npx tsc --noEmit -p apps/api` até zerar.

### S2.4 — Testes de integração para `realtime/` + `webhooks/` (mata C5/M2)
- Alvos 0%: `realtime.service.ts`, `business-listeners.ts`, `domain/webhooks/*`.

## Sprint 3 — qualidade estrutural
- S3.1 — Quebrar `agent.nodes.ts` (346 linhas, ciclomática ~28) em sub-nós por responsabilidade.
- S3.2 — Centralizar os 56 `process.env.*` diretos via `env.validator.ts`.
- S3.3 — Limpar 155 erros TS do legado (foco `SettingsPage.tsx`, `AIConfigPage.tsx`).
- S3.4 — Mutation testing (Stryker) nos serviços críticos.

---

## Apêndice — comandos de referência rápida

```bash
# suíte inteira
npx vitest run
# um arquivo
npx vitest run <caminho/arquivo.test.ts>
# com cobertura de um arquivo
npx vitest run <caminho/arquivo.test.ts> --coverage
# typecheck do backend novo (sem emitir)
npx tsc --noEmit -p apps/api
# ciclos de dependência
npx madge --circular apps/api/src
```
