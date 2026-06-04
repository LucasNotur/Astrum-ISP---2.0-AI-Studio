# PROMPTS DO SPRINT 0 — PARTE 3
## Sessões 5, 6 e 7 (Dias 5, 6 e 7)

---

# ═══════════════════════════════════════════════════
# SESSÃO 5 — DIA 5: TOKEN BUCKET RATE LIMITING
# Sprint 0 | Sessão 5 de 14 | Tipo: REFACTOR
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/middleware/tenantRateLimiter.ts`
- `src/lib/redis.ts`
- `apps/api/src/infrastructure/cache/redis.client.ts`
- `.astrum-progress/sprint_0.md`

---

## PROMPT 5A — REFATORAR RATE LIMITER PARA TOKEN BUCKET NO FASTIFY

### CONTEXTO
O arquivo `src/middleware/tenantRateLimiter.ts` existe mas usa Express middleware. Precisamos:
1. Reescrever usando o algoritmo Token Bucket correto (mais justo que contador simples)
2. Migrar para plugin nativo do Fastify
3. Aplicar limites diferentes por tipo de rota

**O que é Token Bucket:** Cada tenant tem um "balde" de tokens. Cada request consome 1 token. Os tokens são reabastecidos a uma taxa constante (ex: 10 tokens por minuto). Se o balde esvaziar, a request é bloqueada. Isso permite bursts curtos mas bloqueia uso excessivo sustentado.

### TAREFA 1 — Criar o serviço Token Bucket no Redis

Crie `apps/api/src/infrastructure/rate-limit/token-bucket.service.ts`:

```typescript
import { getRedisClient } from '../cache/redis.client';

/**
 * Implementação de Token Bucket usando Redis para Rate Limiting distribuído.
 * 
 * Por que Redis? Para funcionar com múltiplas instâncias do servidor (cluster).
 * Se usarmos memória local, cada instância teria seu próprio balde separado.
 * 
 * Chave no Redis: `rate_limit:token_bucket:{routeGroup}:{tenantId}`
 */

export interface TokenBucketConfig {
  capacity: number;          // máximo de tokens no balde
  refillRate: number;        // tokens adicionados por segundo
  tokensPerRequest: number;  // tokens consumidos por request
}

// Configurações por grupo de rota
export const RATE_LIMIT_CONFIGS: Record<string, TokenBucketConfig> = {
  'ai': {
    capacity: 10,
    refillRate: 10 / 60,  // 10 tokens por minuto
    tokensPerRequest: 1,
  },
  'billing': {
    capacity: 5,
    refillRate: 5 / 60,   // 5 tokens por minuto
    tokensPerRequest: 1,
  },
  'webhooks': {
    capacity: 100,
    refillRate: 100 / 60, // 100 tokens por minuto (webhooks são de sistemas)
    tokensPerRequest: 1,
  },
  'default': {
    capacity: 60,
    refillRate: 60 / 60,  // 60 tokens por minuto (1 por segundo)
    tokensPerRequest: 1,
  },
};

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetInSeconds: number;
  limit: number;
}

/**
 * Verifica se um tenant pode fazer uma request usando o algoritmo Token Bucket.
 * Thread-safe via operações atômicas do Redis.
 */
export async function checkRateLimit(
  tenantId: string,
  routeGroup: keyof typeof RATE_LIMIT_CONFIGS = 'default'
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const config = RATE_LIMIT_CONFIGS[routeGroup] ?? RATE_LIMIT_CONFIGS.default;
  const key = `rate_limit:token_bucket:${routeGroup}:${tenantId}`;
  const now = Date.now() / 1000; // timestamp em segundos

  // Buscar estado atual do balde
  const [tokensStr, lastRefillStr] = await Promise.all([
    redis.get(`${key}:tokens`),
    redis.get(`${key}:last_refill`),
  ]);

  let tokens = tokensStr ? parseFloat(tokensStr) : config.capacity;
  const lastRefill = lastRefillStr ? parseFloat(lastRefillStr) : now;

  // Calcular tokens a adicionar desde o último refill
  const elapsed = now - lastRefill;
  const tokensToAdd = elapsed * config.refillRate;
  tokens = Math.min(config.capacity, tokens + tokensToAdd);

  if (tokens < config.tokensPerRequest) {
    // Sem tokens suficientes — calcular quando o balde terá tokens novamente
    const tokensNeeded = config.tokensPerRequest - tokens;
    const resetInSeconds = Math.ceil(tokensNeeded / config.refillRate);

    return {
      allowed: false,
      remainingTokens: Math.floor(tokens),
      resetInSeconds,
      limit: config.capacity,
    };
  }

  // Consumir tokens
  tokens -= config.tokensPerRequest;

  // Salvar novo estado no Redis (TTL de 1 hora para limpeza automática)
  await Promise.all([
    redis.set(`${key}:tokens`, tokens.toString(), 'EX', 3600),
    redis.set(`${key}:last_refill`, now.toString(), 'EX', 3600),
  ]);

  return {
    allowed: true,
    remainingTokens: Math.floor(tokens),
    resetInSeconds: 0,
    limit: config.capacity,
  };
}

/** 
 * Determina o grupo de rate limit baseado na URL da request.
 */
export function getRouteGroup(url: string): keyof typeof RATE_LIMIT_CONFIGS {
  if (url.startsWith('/api/ai') || url.startsWith('/api/chat')) return 'ai';
  if (url.startsWith('/api/billing') || url.startsWith('/api/payments')) return 'billing';
  if (url.startsWith('/api/webhook')) return 'webhooks';
  return 'default';
}
```

### TAREFA 2 — Criar o Plugin Fastify de Rate Limiting

Crie `apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts`:

```typescript
import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { checkRateLimit, getRouteGroup } from './token-bucket.service';

/**
 * Plugin Fastify de Rate Limiting por tenant usando Token Bucket.
 * Aplica automaticamente em todas as rotas /api/*.
 * 
 * Headers de resposta incluídos:
 * - X-RateLimit-Limit: capacidade máxima do balde
 * - X-RateLimit-Remaining: tokens restantes
 * - X-RateLimit-Reset: segundos até reset (quando bloqueado)
 */
const rateLimitPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Apenas aplicar em rotas da API
    if (!request.url.startsWith('/api/')) return;

    // Pular health check (monitoramento não deve ser limitado)
    if (request.url === '/api/health') return;

    // Extrair tenant_id do JWT ou header (disponível após auth middleware)
    const tenantId = (request as any).user?.tenantId ?? request.ip;
    const routeGroup = getRouteGroup(request.url);

    const result = await checkRateLimit(tenantId, routeGroup);

    // Sempre adicionar headers informativos
    reply.header('X-RateLimit-Limit', result.limit.toString());
    reply.header('X-RateLimit-Remaining', result.remainingTokens.toString());

    if (!result.allowed) {
      reply.header('X-RateLimit-Reset', result.resetInSeconds.toString());
      reply.header('Retry-After', result.resetInSeconds.toString());

      return reply.status(429).send({
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Limite de requisições excedido. Tente novamente em ${result.resetInSeconds} segundos.`,
        resetInSeconds: result.resetInSeconds,
        limit: result.limit,
      });
    }
  });

  done();
};

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '5.x',
});
```

### TAREFA 3 — Criar testes do Rate Limiter

Crie `apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from './token-bucket.service';

// Mock do Redis
vi.mock('../cache/redis.client', () => ({
  getRedisClient: () => ({
    get: vi.fn().mockResolvedValue(null),       // balde vazio = capacidade máxima
    set: vi.fn().mockResolvedValue('OK'),
  }),
}));

describe('Token Bucket Rate Limiting', () => {
  it('permite a primeira request (balde cheio)', async () => {
    const result = await checkRateLimit('tenant-123', 'ai');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(RATE_LIMIT_CONFIGS.ai.capacity);
  });

  it('bloqueia quando o balde está vazio', async () => {
    // Mock: balde com 0 tokens
    vi.mock('../cache/redis.client', () => ({
      getRedisClient: () => ({
        get: vi.fn().mockImplementation((key: string) => {
          if (key.endsWith(':tokens')) return Promise.resolve('0');
          return Promise.resolve(Date.now().toString());
        }),
        set: vi.fn().mockResolvedValue('OK'),
      }),
    }));

    const result = await checkRateLimit('tenant-456', 'ai');
    expect(result.allowed).toBe(false);
    expect(result.resetInSeconds).toBeGreaterThan(0);
  });

  it('rota de billing tem limite menor que default', () => {
    expect(RATE_LIMIT_CONFIGS.billing.capacity).toBeLessThan(
      RATE_LIMIT_CONFIGS.default.capacity
    );
  });

  it('rota de webhooks tem limite maior que AI', () => {
    expect(RATE_LIMIT_CONFIGS.webhooks.capacity).toBeGreaterThan(
      RATE_LIMIT_CONFIGS.ai.capacity
    );
  });
});
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 5 CONCLUÍDA
Sprint: 0 | Dia: 5 | Tipo: REFACTOR
Tarefa: Token Bucket Rate Limiting no Fastify
Arquivos criados:
  + apps/api/src/infrastructure/rate-limit/token-bucket.service.ts
  + apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts
  + apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts
Checklist para atualizar:
  sprint_0.md → Dia 5 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Rate Limiting (Token Bucket) em todas as rotas públicas" → ✅
Próxima sessão: Sessão 6 — Dia 6 — WAL + ETag + Memoization
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 6 — DIA 6: WAL + ETAG CACHING + MEMOIZATION
# Sprint 0 | Sessão 6 de 14 | Tipo: IMPL
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/lib/saasMetrics.ts`
- `packages/shared/src/utils/memoize.ts` (criado Sessão 2)
- `.astrum-progress/sprint_0.md`

---

## PROMPT 6A — WAL + ETAG + MEMOIZATION

### TAREFA 1 — Documentar e Verificar WAL do Supabase

Crie o arquivo `packages/db/src/docs/wal-configuration.md`:

```markdown
# Write-Ahead Logging (WAL) — Configuração Astrum

## O que é WAL?
WAL (Write-Ahead Log) garante que mudanças no banco sejam primeiro escritas num log
antes de serem aplicadas nas tabelas. Em caso de crash do servidor, o banco pode
recuperar o estado consistente lendo o log.

## Status no Supabase
O Supabase usa PostgreSQL que tem WAL ativado por padrão com `wal_level = logical`.
Não é necessário configuração adicional para o modo básico.

## Como verificar
Execute no SQL Editor do Supabase:
```sql
SHOW wal_level;
-- Deve retornar: logical
```

## Para Realtime (CDC — Sprint 1)
O wal_level = logical é NECESSÁRIO para o Supabase Realtime funcionar.
Confirme antes de ativar Realtime no Sprint 1.

## Teste de Crash Recovery
Para testar manualmente:
1. Iniciar uma transação longa via psql
2. Derrubar a conexão no meio
3. Verificar que a tabela está no estado pré-transação (sem corrupção)
Supabase gerencia isso automaticamente — este teste é apenas de validação.
```

### TAREFA 2 — Criar ETag Middleware para Arquivos Estáticos

Crie `apps/api/src/infrastructure/cache/etag.middleware.ts`:

```typescript
import type { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'node:crypto';

/**
 * Middleware de ETag para arquivos estáticos (PDFs, manuais, imagens).
 * 
 * Como funciona:
 * 1. Servidor calcula hash do conteúdo (ETag)
 * 2. Envia ETag no header da primeira resposta
 * 3. Cliente armazena ETag e envia no próximo request (If-None-Match)
 * 4. Se o conteúdo não mudou → servidor retorna 304 Not Modified (sem body)
 * 5. Cliente usa a versão em cache → zero transferência de dados
 */

const etagPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  // Aplicar em rotas de arquivos estáticos (PDFs, manuais, imagens)
  const STATIC_ROUTES = ['/api/documents/', '/api/manuals/', '/api/assets/'];

  fastify.addHook('onSend', async (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown
  ) => {
    const isStaticRoute = STATIC_ROUTES.some(route => request.url.startsWith(route));
    if (!isStaticRoute || reply.statusCode !== 200) return payload;

    // Calcular ETag baseado no conteúdo
    const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const etag = `"${crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)}"`;

    reply.header('ETag', etag);
    reply.header('Cache-Control', 'private, must-revalidate');

    // Verificar se cliente já tem este conteúdo
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      reply.status(304);
      return ''; // retorna vazio — cliente usa o cache
    }

    return payload;
  });

  done();
};

export default fp(etagPlugin, {
  name: 'etag',
  fastify: '5.x',
});
```

### TAREFA 3 — Aplicar Memoization nos cálculos pesados

Atualize `src/lib/saasMetrics.ts` adicionando Memoization nas funções pesadas.
Identifique as funções que fazem queries repetitivas e adicione o import:

```typescript
// Adicionar no topo de saasMetrics.ts
import { memoize } from '../../packages/shared/src/utils/memoize';

// Encontrar funções que calculam métricas por ISP e envolver com memoize
// Exemplo padrão a aplicar:
// ANTES: export async function calcularChurnMensal(ispId: string) { ... }
// DEPOIS:
export const calcularChurnMensal = memoize(
  async (ispId: string): Promise<number> => {
    // lógica original aqui — não mudar o corpo da função
  },
  (ispId) => `churn:${ispId}:${new Date().toISOString().slice(0, 7)}` // chave por ISP + mês
);
```

**INSTRUÇÃO:** Analise o arquivo `saasMetrics.ts` fornecido e aplique o memoize nas funções que:
- Recebem apenas `ispId` como parâmetro (ou `ispId` + período)
- Fazem queries ao banco (Supabase)
- São chamadas repetidamente com os mesmos parâmetros

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 6 CONCLUÍDA
Sprint: 0 | Dia: 6 | Tipo: IMPL
Tarefa: WAL documentado + ETag + Memoization aplicada
Arquivos criados:
  + packages/db/src/docs/wal-configuration.md
  + apps/api/src/infrastructure/cache/etag.middleware.ts
Arquivos modificados:
  ~ src/lib/saasMetrics.ts (memoize adicionado nas funções pesadas)
Checklist para atualizar:
  sprint_0.md → Dia 6 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "WAL ativo e testado com crash recovery" → ✅
Próxima sessão: Sessão 7 — Dia 7 — CRDTs + Revisão Semana 1
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 7 — DIA 7: CRDTs + REVISÃO SEMANA 1
# Sprint 0 | Sessão 7 de 14 | Tipo: IMPL + REVISÃO
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `apps/api/src/adapters/openai/openai.adapter.ts`
- `apps/api/src/adapters/openai/openai.adapter.test.ts`
- `apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts`
- `apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts`
- `packages/shared/src/utils/memoize.test.ts`
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 7A — IMPLEMENTAR CRDTs PARA EDIÇÃO COLABORATIVA

### CONTEXTO
CRDTs (Conflict-free Replicated Data Types) permitem que múltiplos usuários editem o mesmo documento simultaneamente sem conflitos. Na Astrum, isso será usado para tickets de suporte: múltiplos técnicos podem atualizar o mesmo ticket sem sobrescrever o trabalho uns dos outros.

### TAREFA 1 — Instalar Yjs e criar o serviço CRDT

Adicione ao `apps/api/package.json`:
```json
"yjs": "^13.6.0"
```

Crie `apps/api/src/infrastructure/crdt/ticket-collab.service.ts`:

```typescript
import * as Y from 'yjs';

/**
 * Serviço de colaboração em tempo real para Tickets usando CRDTs (Yjs).
 * 
 * Permite que múltiplos técnicos editem o mesmo ticket simultaneamente.
 * O Yjs resolve automaticamente conflitos sem necessidade de locks.
 * 
 * Uso atual: preparação de estrutura para Sprint 4 (WebSockets).
 * Por ora, apenas criamos a estrutura e os testes de merge.
 */

// Cache em memória de documentos Yjs por ticket (será movido para Redis no Sprint 1)
const ticketDocs = new Map<string, Y.Doc>();

export interface TicketUpdate {
  field: 'description' | 'solution' | 'notes';
  value: string;
  userId: string;
  timestamp: number;
}

/**
 * Obtém ou cria um documento Yjs para um ticket específico.
 */
export function getTicketDoc(ticketId: string): Y.Doc {
  if (!ticketDocs.has(ticketId)) {
    const doc = new Y.Doc();
    ticketDocs.set(ticketId, doc);
  }
  return ticketDocs.get(ticketId)!;
}

/**
 * Aplica uma atualização ao documento colaborativo do ticket.
 * Retorna o estado atual após a atualização.
 */
export function applyTicketUpdate(ticketId: string, update: TicketUpdate): Record<string, string> {
  const doc = getTicketDoc(ticketId);
  const fields = doc.getMap<string>('fields');

  doc.transact(() => {
    fields.set(update.field, update.value);
    fields.set(`${update.field}_updated_by`, update.userId);
    fields.set(`${update.field}_updated_at`, new Date(update.timestamp).toISOString());
  });

  return Object.fromEntries(fields.entries());
}

/**
 * Obtém o estado atual de um ticket colaborativo.
 */
export function getTicketState(ticketId: string): Record<string, string> {
  const doc = getTicketDoc(ticketId);
  const fields = doc.getMap<string>('fields');
  return Object.fromEntries(fields.entries());
}

/**
 * Gera um diff binário (Yjs update) para sincronização entre clientes.
 * Este update pode ser enviado via WebSocket para outros clientes.
 */
export function getTicketDiff(ticketId: string, sinceVersion?: Uint8Array): Uint8Array {
  const doc = getTicketDoc(ticketId);
  if (sinceVersion) {
    return Y.encodeStateAsUpdate(doc, sinceVersion);
  }
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Aplica um diff recebido de outro cliente (via WebSocket).
 */
export function applyTicketDiff(ticketId: string, diff: Uint8Array): void {
  const doc = getTicketDoc(ticketId);
  Y.applyUpdate(doc, diff);
}
```

### TAREFA 2 — Criar testes de CRDT

Crie `apps/api/src/infrastructure/crdt/ticket-collab.service.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTicketDoc,
  applyTicketUpdate,
  getTicketState,
  getTicketDiff,
  applyTicketDiff,
} from './ticket-collab.service';

describe('CRDT — Edição Colaborativa de Tickets', () => {
  const ticketId = 'ticket-test-001';

  it('dois usuários editam campos diferentes → ambas as mudanças preservadas', () => {
    applyTicketUpdate(ticketId, {
      field: 'description',
      value: 'Internet caiu às 14h',
      userId: 'tecnico-1',
      timestamp: Date.now(),
    });

    applyTicketUpdate(ticketId, {
      field: 'solution',
      value: 'Reiniciar OLT',
      userId: 'tecnico-2',
      timestamp: Date.now(),
    });

    const state = getTicketState(ticketId);
    expect(state.description).toBe('Internet caiu às 14h');
    expect(state.solution).toBe('Reiniciar OLT');
  });

  it('sync entre dois documentos via diff binário', () => {
    const ticketA = 'ticket-sync-a';
    const ticketB = 'ticket-sync-b';

    // Técnico 1 edita no documento A
    applyTicketUpdate(ticketA, {
      field: 'notes',
      value: 'Cliente ligou às 15h',
      userId: 'tecnico-1',
      timestamp: Date.now(),
    });

    // Gerar diff do A
    const diff = getTicketDiff(ticketA);

    // Aplicar diff no B
    applyTicketDiff(ticketB, diff);

    // B deve ter o mesmo estado que A
    const stateB = getTicketState(ticketB);
    expect(stateB.notes).toBe('Cliente ligou às 15h');
  });
});
```

## PROMPT 7B — REVISÃO DA SEMANA 1

Após implementar os CRDTs, execute a revisão da Semana 1.

### TAREFA — Rodar todos os testes criados nos dias 1–7

Verifique e corrija qualquer problema nos seguintes arquivos de teste:
1. `packages/shared/src/utils/memoize.test.ts`
2. `apps/api/src/adapters/openai/openai.adapter.test.ts`
3. `apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts`
4. `apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts`
5. `apps/api/src/infrastructure/crdt/ticket-collab.service.test.ts`

Para cada teste que falhar, forneça:
- O erro exato
- A causa raiz
- A correção aplicada

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 7 CONCLUÍDA
Sprint: 0 | Dia: 7 | Tipo: IMPL + REVISÃO
Tarefa: CRDTs implementados + Testes da Semana 1 passando
Dependências instaladas: yjs
Arquivos criados:
  + apps/api/src/infrastructure/crdt/ticket-collab.service.ts
  + apps/api/src/infrastructure/crdt/ticket-collab.service.test.ts
Status testes Semana 1: [PREENCHER com resultados]
Checklist para atualizar:
  sprint_0.md → Dia 7 → marcar todos os [ ] como [x]
Próxima sessão: Sessão 8 — Dia 8 — Remoção do Firebase
═══════════════════════════════════════
```
