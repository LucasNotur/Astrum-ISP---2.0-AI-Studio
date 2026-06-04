# PROMPTS DO SPRINT 0 — PARTE 2
## Sessões 3 e 4 (Dias 3 e 4)

---

# ═══════════════════════════════════════════════════
# SESSÃO 3 — DIA 3: CIRCUIT BREAKER
# Sprint 0 | Sessão 3 de 14 | Tipo: IMPL
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/lib/gemini.ts` (primeiras 80 linhas)
- `src/ai-provider/ai-provider.service.ts`
- `src/workers/messageWorker.ts` (primeiras 80 linhas)
- `apps/api/src/adapters/openai/openai.adapter.ts` (criado na Sessão 2)
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 3A — INSTALAR E CONFIGURAR CIRCUIT BREAKER

Você é um engenheiro de software sênior especializado em sistemas resilientes para SaaS B2B.

### CONTEXTO
A Astrum ISP usa a API da OpenAI para responder mensagens de suporte dos clientes via WhatsApp. Atualmente, se a OpenAI ficar fora do ar, o sistema trava indefinidamente esperando uma resposta que nunca vem — bloqueando toda a fila de atendimento.

O Circuit Breaker é um padrão que monitora chamadas a serviços externos. Quando detecta falhas consecutivas, "abre o disjuntor" e para de chamar o serviço por um período, retornando uma resposta de fallback imediatamente.

### DEPENDÊNCIAS A INSTALAR
Adicione ao `apps/api/package.json`:
```json
"opossum": "^8.1.0",
"@types/opossum": "^8.1.4"
```

### TAREFA 1 — Criar configuração do Circuit Breaker

Crie o arquivo `apps/api/src/adapters/openai/circuit-breaker.config.ts`:

```typescript
/**
 * Configuração do Circuit Breaker para chamadas à API da OpenAI.
 * 
 * Comportamento:
 * - Abre após 5 falhas consecutivas em uma janela de 10 segundos
 * - Permanece aberto por 30 segundos antes de tentar novamente (half-open)
 * - Timeout de 15 segundos por chamada (OpenAI raramente demora mais)
 * - Se 50% das chamadas falharem no estado half-open, volta a abrir
 */

export const OPENAI_CIRCUIT_BREAKER_CONFIG = {
  timeout: 15000,           // 15s — tempo máximo esperando resposta da OpenAI
  errorThresholdPercentage: 50,  // abre se 50% das chamadas falharem
  resetTimeout: 30000,      // 30s fechado antes de tentar novamente
  volumeThreshold: 5,       // mínimo de 5 chamadas antes de avaliar
  rollingCountTimeout: 10000,    // janela de 10s para contar falhas
  rollingCountBuckets: 10,
} as const;

export const WHATSAPP_CIRCUIT_BREAKER_CONFIG = {
  timeout: 10000,           // 10s para WhatsApp (mais rápido que OpenAI)
  errorThresholdPercentage: 50,
  resetTimeout: 20000,
  volumeThreshold: 3,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
} as const;

export const PAYMENT_CIRCUIT_BREAKER_CONFIG = {
  timeout: 20000,           // 20s para gateways de pagamento (podem ser lentos)
  errorThresholdPercentage: 30, // mais conservador para pagamentos
  resetTimeout: 60000,      // 1 minuto antes de tentar gateway de pagamento novamente
  volumeThreshold: 3,
  rollingCountTimeout: 30000,
  rollingCountBuckets: 10,
} as const;
```

### TAREFA 2 — Criar o Adapter da OpenAI com Circuit Breaker

Crie o arquivo `apps/api/src/adapters/openai/openai.adapter.ts`:

```typescript
import CircuitBreaker from 'opossum';
import { OPENAI_CIRCUIT_BREAKER_CONFIG } from './circuit-breaker.config';

/**
 * Adapter da OpenAI com Circuit Breaker integrado.
 * 
 * FILOSOFIA: Este arquivo é o ÚNICO ponto de saída para a OpenAI.
 * Nenhuma outra parte do sistema chama a OpenAI diretamente.
 * Se a OpenAI mudar sua API ou precisarmos trocar por outro provider,
 * mudamos APENAS este arquivo.
 */

// Tipo base para as opções de chamada
interface OpenAICallOptions {
  model: 'gpt-4o-mini' | 'gpt-4o';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIResponse {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  fromFallback?: boolean; // true se veio do fallback (Circuit Breaker aberto)
}

// Mensagem de fallback quando a OpenAI está indisponível
const FALLBACK_RESPONSE: OpenAIResponse = {
  content: 'Estou com dificuldades técnicas no momento. Seu atendimento foi registrado e nossa equipe entrará em contato em breve. Pedimos desculpas pelo inconveniente.',
  model: 'fallback',
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  fromFallback: true,
};

// Função que realmente chama a OpenAI (wrapped pelo Circuit Breaker)
async function callOpenAIAPI(options: OpenAICallOptions): Promise<OpenAIResponse> {
  // TODO Sprint 2: Substituir por import do SDK OpenAI via Helicone
  // Por ora, placeholder que simula a chamada
  const openaiModule = await import('openai');
  const OpenAI = openaiModule.default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const response = await client.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 1000,
  });

  const choice = response.choices[0];
  if (!choice?.message?.content) {
    throw new Error('OpenAI retornou resposta vazia');
  }

  return {
    content: choice.message.content,
    model: response.model,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// Instância do Circuit Breaker
const openAIBreaker = new CircuitBreaker(callOpenAIAPI, OPENAI_CIRCUIT_BREAKER_CONFIG);

// Eventos de monitoramento (logs estruturados — Pino virá no Sprint 0 Dia 12)
openAIBreaker.on('open', () => {
  console.error('[CIRCUIT_BREAKER] OpenAI circuit ABERTO. Usando fallback por 30s.');
});

openAIBreaker.on('halfOpen', () => {
  console.warn('[CIRCUIT_BREAKER] OpenAI circuit HALF-OPEN. Testando conexão...');
});

openAIBreaker.on('close', () => {
  console.info('[CIRCUIT_BREAKER] OpenAI circuit FECHADO. Serviço restaurado.');
});

openAIBreaker.on('fallback', (result: unknown) => {
  console.warn('[CIRCUIT_BREAKER] Fallback ativado para OpenAI.');
});

openAIBreaker.fallback(() => FALLBACK_RESPONSE);

/**
 * Função principal para chamar a OpenAI com proteção de Circuit Breaker.
 * Use esta função em QUALQUER lugar que precisar chamar a OpenAI.
 */
export async function callOpenAI(options: OpenAICallOptions): Promise<OpenAIResponse> {
  return openAIBreaker.fire(options) as Promise<OpenAIResponse>;
}

/**
 * Retorna o estado atual do Circuit Breaker.
 * Útil para endpoints de health check.
 */
export function getOpenAICircuitStatus(): 'closed' | 'open' | 'halfOpen' {
  if (openAIBreaker.opened) return 'open';
  if (openAIBreaker.halfOpen) return 'halfOpen';
  return 'closed';
}

export type { OpenAICallOptions, OpenAIResponse };
```

### TAREFA 3 — Criar o Adapter do WhatsApp com Circuit Breaker

Crie `apps/api/src/adapters/whatsapp/whatsapp.adapter.ts`:

```typescript
import CircuitBreaker from 'opossum';
import { WHATSAPP_CIRCUIT_BREAKER_CONFIG } from '../openai/circuit-breaker.config';

/**
 * Adapter do WhatsApp (Evolution API) com Circuit Breaker.
 * ÚNICO ponto de saída para envio de mensagens WhatsApp.
 */

interface WhatsAppMessage {
  to: string;       // número no formato: 5511999999999@s.whatsapp.net
  content: string;
  tenantId: string;
}

interface WhatsAppResponse {
  messageId: string;
  status: 'sent' | 'failed' | 'fallback';
  timestamp: string;
}

async function sendWhatsAppMessage(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  
  if (!evolutionUrl || !evolutionKey) {
    throw new Error('Evolution API não configurada. Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.');
  }

  const response = await fetch(`${evolutionUrl}/message/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': evolutionKey,
    },
    body: JSON.stringify({
      number: message.to,
      text: message.content,
    }),
  });

  if (!response.ok) {
    throw new Error(`Evolution API retornou ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as { key?: { id?: string } };
  return {
    messageId: data.key?.id ?? crypto.randomUUID(),
    status: 'sent',
    timestamp: new Date().toISOString(),
  };
}

const whatsAppBreaker = new CircuitBreaker(sendWhatsAppMessage, WHATSAPP_CIRCUIT_BREAKER_CONFIG);

whatsAppBreaker.on('open', () => {
  console.error('[CIRCUIT_BREAKER] WhatsApp circuit ABERTO. Mensagens serão enfileiradas.');
});

whatsAppBreaker.on('close', () => {
  console.info('[CIRCUIT_BREAKER] WhatsApp circuit FECHADO. Envio restaurado.');
});

whatsAppBreaker.fallback((message: WhatsAppMessage) => ({
  messageId: `fallback-${crypto.randomUUID()}`,
  status: 'fallback' as const,
  timestamp: new Date().toISOString(),
}));

export async function sendMessage(message: WhatsAppMessage): Promise<WhatsAppResponse> {
  return whatsAppBreaker.fire(message) as Promise<WhatsAppResponse>;
}

export function getWhatsAppCircuitStatus(): 'closed' | 'open' | 'halfOpen' {
  if (whatsAppBreaker.opened) return 'open';
  if (whatsAppBreaker.halfOpen) return 'halfOpen';
  return 'closed';
}

export type { WhatsAppMessage, WhatsAppResponse };
```

### TAREFA 4 — Criar testes do Circuit Breaker

Crie `apps/api/src/adapters/openai/openai.adapter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callOpenAI, getOpenAICircuitStatus } from './openai.adapter';

describe('OpenAI Adapter — Circuit Breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna resposta normal quando OpenAI está operacional', async () => {
    // Mock da chamada bem-sucedida
    vi.mock('openai', () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: 'Resposta de teste' } }],
              model: 'gpt-4o-mini',
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
          },
        },
      })),
    }));

    const result = await callOpenAI({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Olá' }],
    });

    expect(result.fromFallback).toBeUndefined();
    expect(result.content).toBe('Resposta de teste');
  });

  it('ativa o fallback quando OpenAI está indisponível', async () => {
    // Simular falha da OpenAI
    vi.mock('openai', () => ({
      default: vi.fn().mockImplementation(() => ({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Service Unavailable')),
          },
        },
      })),
    }));

    // Forçar múltiplas falhas para abrir o circuit breaker
    const promises = Array(5).fill(null).map(() =>
      callOpenAI({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'test' }] })
    );
    
    const results = await Promise.allSettled(promises);
    
    // Verificar que o fallback foi retornado (não rejeitou a promise)
    const resolved = results.filter(r => r.status === 'fulfilled');
    expect(resolved.length).toBeGreaterThan(0);
    
    // Última chamada deve usar fallback
    const fallbackResult = await callOpenAI({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'após falhas' }],
    });
    expect(fallbackResult.fromFallback).toBe(true);
    expect(fallbackResult.content).toContain('dificuldades técnicas');
  }, 10000);

  it('getOpenAICircuitStatus retorna estado correto', () => {
    const status = getOpenAICircuitStatus();
    expect(['closed', 'open', 'halfOpen']).toContain(status);
  });
});
```

### REGRAS INEGOCIÁVEIS
- O Circuit Breaker DEVE ser usado em toda chamada externa — nunca chamar OpenAI, WhatsApp ou pagamentos diretamente
- O fallback NUNCA pode lançar uma exceção — deve retornar uma resposta degradada mas funcional
- Os logs devem ter prefixo `[CIRCUIT_BREAKER]` para facilitar o filtro no Sentry (Sprint 3)
- TypeScript strict: sem `any` nos tipos de retorno das funções públicas

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 3 CONCLUÍDA
Sprint: 0 | Dia: 3 | Tipo: IMPL
Tarefa: Circuit Breaker — OpenAI e WhatsApp
Dependências instaladas: opossum, @types/opossum
Arquivos criados:
  + apps/api/src/adapters/openai/circuit-breaker.config.ts
  + apps/api/src/adapters/openai/openai.adapter.ts
  + apps/api/src/adapters/openai/openai.adapter.test.ts
  + apps/api/src/adapters/whatsapp/whatsapp.adapter.ts
Checklist para atualizar:
  sprint_0.md → Dia 3 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Circuit Breaker em OpenAI, WhatsApp, pagamentos" → ✅
Próxima sessão: Sessão 4 — Dia 4 — Idempotency Keys
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 4 — DIA 4: IDEMPOTENCY KEYS
# Sprint 0 | Sessão 4 de 14 | Tipo: IMPL
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/routes/cobrai.ts`
- `src/routes/api-v1.ts` (primeiras 60 linhas)
- `apps/api/src/infrastructure/database/supabase.client.ts`
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 4A — IMPLEMENTAR IDEMPOTENCY KEYS

### CONTEXTO
Idempotência garante que uma operação executada múltiplas vezes produz o mesmo resultado da primeira execução. No contexto financeiro da Astrum: se a rede do cliente cair após clicar em "Pagar" e o celular reenviar a request, o cartão só pode ser cobrado UMA vez.

### TAREFA 1 — Criar a migration SQL

Crie o arquivo `packages/db/src/migrations/001_idempotency_keys.sql`:

```sql
-- Tabela de Idempotency Keys
-- Garante que operações financeiras e de suspensão não sejam executadas duas vezes
-- mesmo que o cliente envie a request duplicada

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  endpoint TEXT NOT NULL,           -- ex: POST /api/billing/charge
  request_hash TEXT NOT NULL,       -- hash do body da request
  response_status INTEGER NOT NULL, -- HTTP status da resposta original
  response_body JSONB NOT NULL,     -- corpo da resposta original
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Índice para busca rápida por chave
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key ON idempotency_keys (idempotency_key);

-- Índice para limpeza automática de chaves expiradas
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys (expires_at);

-- RLS: cada tenant só vê suas próprias chaves
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON idempotency_keys
  USING (tenant_id = auth.uid());

-- Comentário explicativo
COMMENT ON TABLE idempotency_keys IS 
  'Garante idempotência em operações financeiras e de suspensão de sinal. 
   Chaves expiram após 24h. Recomendado: job de limpeza diário via BullMQ.';
```

### TAREFA 2 — Criar o Middleware de Idempotência

Crie `apps/api/src/infrastructure/idempotency/idempotency.middleware.ts`:

```typescript
import type { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import { supabaseClient } from '../database/supabase.client';

/**
 * Middleware de Idempotência para o Fastify.
 * 
 * Como usar: adicionar o header `Idempotency-Key: <UUID>` nas requests.
 * Rotas financeiras e de suspensão EXIGEM este header.
 * 
 * Comportamento:
 * 1. Se a chave não existir → processa normalmente e salva a resposta
 * 2. Se a chave existir e não expirou → retorna a resposta salva sem reprocessar
 * 3. Se a chave existir mas expirou → processa normalmente como nova request
 */

const REQUIRED_ON_ROUTES = [
  'POST /api/billing/charge',
  'POST /api/billing/refund',
  'POST /api/suspension/suspend',
  'POST /api/suspension/reactivate',
  'POST /api/payments/process',
];

function isIdempotencyRequired(method: string, url: string): boolean {
  return REQUIRED_ON_ROUTES.some(route => {
    const [routeMethod, routePath] = route.split(' ');
    return method === routeMethod && url.startsWith(routePath);
  });
}

function hashBody(body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

const idempotencyPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const method = request.method;
    const url = request.url;

    // Verificar se a rota exige idempotency key
    if (isIdempotencyRequired(method, url) && !idempotencyKey) {
      return reply.status(400).send({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'O header Idempotency-Key é obrigatório para esta operação financeira.',
        details: 'Gere um UUID v4 único no frontend e envie no header Idempotency-Key.',
      });
    }

    if (!idempotencyKey) return; // Rota não crítica, continua normalmente

    // Validar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(idempotencyKey)) {
      return reply.status(400).send({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'O header Idempotency-Key deve ser um UUID v4 válido.',
      });
    }

    // Buscar chave existente no banco
    const { data: existingKey } = await supabaseClient
      .from('idempotency_keys')
      .select('response_status, response_body, expires_at')
      .eq('idempotency_key', idempotencyKey)
      .single();

    // Chave existe e não expirou → retornar resposta salva
    if (existingKey && new Date(existingKey.expires_at) > new Date()) {
      console.info(`[IDEMPOTENCY] Chave ${idempotencyKey} encontrada. Retornando resposta cacheada.`);
      return reply
        .status(existingKey.response_status)
        .header('X-Idempotency-Replayed', 'true')
        .send(existingKey.response_body);
    }

    // Guardar referência para salvar após o handler
    (request as any).__idempotencyKey = idempotencyKey;
    (request as any).__requestHash = hashBody(request.body);
  });

  // Hook após o envio da resposta para salvar a chave
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const idempotencyKey = (request as any).__idempotencyKey;
    if (!idempotencyKey) return payload;

    // Extrair tenant_id do JWT (disponível após autenticação)
    const tenantId = (request as any).user?.tenantId ?? 'unknown';

    try {
      await supabaseClient.from('idempotency_keys').upsert({
        idempotency_key: idempotencyKey,
        tenant_id: tenantId,
        endpoint: `${request.method} ${request.url}`,
        request_hash: (request as any).__requestHash,
        response_status: reply.statusCode,
        response_body: typeof payload === 'string' ? JSON.parse(payload) : payload,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (err) {
      // Não falhar a request por erro ao salvar a chave
      console.error('[IDEMPOTENCY] Erro ao salvar chave:', err);
    }

    return payload;
  });

  done();
};

export default fp(idempotencyPlugin, {
  name: 'idempotency',
  fastify: '5.x',
});
```

### TAREFA 3 — Criar testes de Idempotência

Crie `apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import idempotencyPlugin from './idempotency.middleware';

// Mock do Supabase
vi.mock('../database/supabase.client', () => ({
  supabaseClient: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

describe('Idempotency Middleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(idempotencyPlugin);
    app.post('/api/billing/charge', async () => ({ charged: true, amount: 100 }));
    await app.ready();
  });

  it('rejeita request sem Idempotency-Key em rota financeira', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/charge',
      body: { amount: 100 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejeita Idempotency-Key com formato inválido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/charge',
      headers: { 'idempotency-key': 'nao-e-um-uuid' },
      body: { amount: 100 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('processa request normalmente com Idempotency-Key válida e nova', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/billing/charge',
      headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
      body: { amount: 100 },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ charged: true, amount: 100 });
  });
});
```

### REGRAS INEGOCIÁVEIS
- A Idempotency-Key DEVE ser um UUID v4 gerado no frontend (nunca no backend)
- O middleware NUNCA deve fazer a request falhar por erro interno de salvamento da chave
- Toda rota financeira ou de suspensão de sinal DEVE estar na lista `REQUIRED_ON_ROUTES`

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 4 CONCLUÍDA
Sprint: 0 | Dia: 4 | Tipo: IMPL
Tarefa: Idempotency Keys — Middleware + Migration
Arquivos criados:
  + packages/db/src/migrations/001_idempotency_keys.sql
  + apps/api/src/infrastructure/idempotency/idempotency.middleware.ts
  + apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts
Checklist para atualizar:
  sprint_0.md → Dia 4 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Idempotency keys table criada" → ✅
Próxima sessão: Sessão 5 — Dia 5 — Token Bucket Rate Limiting
═══════════════════════════════════════
```
