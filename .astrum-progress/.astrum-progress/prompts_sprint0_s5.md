# PROMPTS DO SPRINT 0 — PARTE 5
## Sessões 10, 11 e 12 (Dias 10, 11 e 12)

---

# ═══════════════════════════════════════════════════
# SESSÃO 10 — DIA 10: MIGRAÇÃO EXPRESS → FASTIFY
# Sprint 0 | Sessão 10 de 14 | Tipo: REFACTOR CRÍTICO
# Bloco: B07 — Backend
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `server.ts` (arquivo raiz — 69 linhas)
- `src/routes/api-v1.ts`
- `src/routes/evolutionWebhook.ts`
- `src/routes/cobrai.ts`
- `src/middleware/tenantRateLimiter.ts`
- `apps/api/src/infrastructure/idempotency/idempotency.middleware.ts`
- `apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts`
- `.astrum-progress/sprint_0.md`

---

## PROMPT 10A — CRIAR SERVIDOR FASTIFY PRODUCTION-GRADE

### CONTEXTO
O `server.ts` atual usa Express puro. Express não tem:
- Validação de JSON Schema nativa (Fastify tem)
- Performance comparável (Fastify processa ~10k req/s, Express ~5k)
- Plugin system tipado
- Suporte nativo a async/await sem try/catch em todo lugar

Vamos criar um novo servidor Fastify paralelo ao Express (Strangler Fig).
O Express continuará existindo durante a transição. As rotas serão migradas uma a uma.

### TAREFA 1 — Criar o servidor Fastify principal

Crie `apps/api/src/server.ts`:

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';

// Plugins internos criados nas sessões anteriores
import idempotencyPlugin from './infrastructure/idempotency/idempotency.middleware';
import rateLimitPlugin from './infrastructure/rate-limit/rate-limit.plugin';

/**
 * Cria e configura a instância do servidor Fastify.
 * 
 * Separado em função para facilitar testes de integração
 * (importar buildServer em vez de iniciar o servidor diretamente).
 */
export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Pino.js — será configurado completamente no Dia 12
    },
    // Graceful shutdown: aguardar requests em andamento antes de fechar
    closeCloseTimeout: 10000,
  });

  // ── Plugins de segurança e performance ──────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });

  await app.register(compress, { global: true });

  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    sign: { expiresIn: '15m' }, // JWT rotation — expira em 15 minutos
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB máximo para upload de manuais PDF
    },
  });

  // ── Plugins de negócio ───────────────────────────────────────────────
  await app.register(idempotencyPlugin);
  await app.register(rateLimitPlugin);

  // ── Decorators ──────────────────────────────────────────────────────
  // Adicionar helper de autenticação em todas as rotas
  app.decorate('authenticate', async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Token JWT inválido ou expirado.',
      });
    }
  });

  // ── Health Check ─────────────────────────────────────────────────────
  app.get('/api/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                redis: { type: 'string' },
                supabase: { type: 'string' },
                openai_circuit: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (_request, _reply) => {
    const { getRedisStatus } = await import('./infrastructure/cache/redis.client');
    const { getLLMStatus } = await import('./adapters/ai/llm.adapter');
    const llmStatus = getLLMStatus();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        redis: getRedisStatus(),
        supabase: 'connected', // TODO Sprint 1: verificar conexão real
        openai_circuit: llmStatus.openai,
      },
    };
  });

  // ── Rotas migradas do Express ────────────────────────────────────────
  // TODO: Migrar cada rota Express para plugins Fastify
  // Por ora, registrar placeholder:
  app.get('/api/v2/status', async () => ({
    version: '2.0.0',
    architecture: 'fastify-ddd-hexagonal',
    sprint: 0,
  }));

  // ── Handler de erros ─────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Não logar erros 4xx como error (são erros do cliente)
    if (statusCode >= 500) {
      app.log.error({ err: error }, 'Erro interno do servidor');
    }

    return reply.status(statusCode).send({
      code: error.code ?? 'INTERNAL_ERROR',
      message: statusCode === 500
        ? 'Erro interno. Nossa equipe foi notificada.'
        : error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  });

  // ── Not Found Handler ────────────────────────────────────────────────
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      message: 'Rota não encontrada.',
    });
  });

  return app;
}

/**
 * Inicia o servidor com Graceful Shutdown.
 */
export async function startServer() {
  const app = await buildServer();
  const port = parseInt(process.env.PORT ?? '3001'); // 3001 para não conflitar com Express legado

  try {
    await app.listen({ port, host: '0.0.0.0' });
    console.info(`[FASTIFY] Servidor rodando em http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // ── Graceful Shutdown ────────────────────────────────────────────────
  const gracefulShutdown = async (signal: string) => {
    console.info(`[FASTIFY] Recebido ${signal}. Encerrando graciosamente...`);
    try {
      // 1. Parar de aceitar novos requests
      await app.close();
      // 2. TODO Sprint 1: fechar conexões BullMQ e Redis
      console.info('[FASTIFY] Encerrado com sucesso.');
      process.exit(0);
    } catch (err) {
      console.error('[FASTIFY] Erro durante shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return app;
}
```

### TAREFA 2 — Adicionar dependências Fastify

No `apps/api/package.json`, adicione:
```json
"@fastify/cors": "^10.0.0",
"@fastify/jwt": "^9.0.0",
"@fastify/multipart": "^9.0.0",
"@fastify/helmet": "^12.0.0",
"@fastify/compress": "^8.0.0",
"fastify-plugin": "^5.0.0"
```

### TAREFA 3 — Criar teste de integração do servidor Fastify

Crie `apps/api/src/server.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server';
import type { FastifyInstance } from 'fastify';

describe('Servidor Fastify', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health retorna 200 com status dos serviços', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.services).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('rota inexistente retorna 404 com código correto', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/nao-existe',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('JSON malformado retorna 400 (nunca 500)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/status',
      headers: { 'content-type': 'application/json' },
      body: '{json: invalido}',
    });

    expect(response.statusCode).toBe(400);
  });
});
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 10 CONCLUÍDA
Sprint: 0 | Dia: 10 | Tipo: REFACTOR CRÍTICO
Tarefa: Servidor Fastify criado (coexiste com Express durante migração)
Arquivos criados:
  + apps/api/src/server.ts
  + apps/api/src/server.test.ts
Checklist para atualizar:
  sprint_0.md → Dia 10 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Graceful Shutdown implementado" → ✅
Próxima sessão: Sessão 11 — Dia 11 — TurboRepo Setup
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 11 — DIA 11: TURBOREPO MONOREPO SETUP
# Sprint 0 | Sessão 11 de 14 | Tipo: SETUP
# Bloco: B10 — DevOps
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `package.json` (raiz original)
- `turbo.json` (criado Sessão 2)
- `tsconfig.json` (raiz original)
- `vite.config.ts`
- `.astrum-progress/sprint_0.md`

---

## PROMPT 11A — CONFIGURAR TURBOREPO COMPLETO

### TAREFA 1 — Atualizar turbo.json com pipeline completo

Substitua o `turbo.json` existente por:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env", ".env.local"],
  "globalEnv": [
    "NODE_ENV",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "REDIS_URL",
    "OPENAI_API_KEY"
  ],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"],
      "env": ["NODE_ENV"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": false
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

### TAREFA 2 — Criar package.json da raiz do monorepo

Crie/substitua o `package.json` raiz:

```json
{
  "name": "astrum-monorepo",
  "version": "2.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:watch": "turbo run test -- --watch",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.3.3",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "_note": "Monorepo criado no Sprint 0 Dia 11. Astrum AI Engine v2.0"
}
```

### TAREFA 3 — Criar tsconfig base compartilhado

Crie `packages/shared/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true
  }
}
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 11 CONCLUÍDA
Sprint: 0 | Dia: 11 | Tipo: SETUP
Tarefa: TurboRepo monorepo configurado
Arquivos criados/modificados:
  ~ turbo.json (pipeline completo)
  ~ package.json (raiz monorepo)
  + packages/shared/tsconfig.base.json
Checklist para atualizar:
  sprint_0.md → Dia 11 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Monorepo TurboRepo inicializado" → ✅
Próxima sessão: Sessão 12 — Dia 12 — Pino.js Logging
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 12 — DIA 12: PINO.JS LOGGING
# Sprint 0 | Sessão 12 de 14 | Tipo: REFACTOR
# Bloco: B11 — Observabilidade
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `src/lib/logger.ts` (arquivo atual de logging)
- `apps/api/src/server.ts` (criado Sessão 10)
- `.astrum-progress/sprint_0.md`
- **IMPORTANTE:** Forneça também a lista de todos os arquivos do projeto que contêm `console.log`

---

## PROMPT 12A — IMPLEMENTAR PINO.JS LOGGING ESTRUTURADO

### CONTEXTO
O projeto tem `console.log` espalhado por dezenas de arquivos. Em produção, isso é inaceitável:
- Logs não têm estrutura (impossível filtrar por tenant, por tipo de erro)
- Logs não têm correlação (impossível rastrear uma request de ponta a ponta)
- `console.log` bloqueia o event loop brevemente (Pino usa streams assíncronos)

### TAREFA 1 — Instalar Pino

No `apps/api/package.json`, adicione:
```json
"pino": "^9.0.0",
"pino-http": "^10.0.0",
"sonic-boom": "^4.0.0"
```
Em devDependencies:
```json
"pino-pretty": "^13.0.0"
```

### TAREFA 2 — Criar o Logger centralizado

Crie `apps/api/src/infrastructure/logging/logger.ts`:

```typescript
import pino from 'pino';

/**
 * Logger centralizado da Astrum usando Pino.js.
 * 
 * CAMPOS OBRIGATÓRIOS em todo log:
 * - timestamp: automático pelo Pino
 * - level: info, warn, error, debug
 * 
 * CAMPOS RECOMENDADOS (adicionar manualmente quando disponível):
 * - tenant_id: sempre que o contexto de um ISP estiver disponível
 * - user_id: quando o usuário estiver autenticado
 * - request_id: gerado pelo pino-http para cada request HTTP
 * 
 * USO:
 * import { logger } from './infrastructure/logging/logger';
 * logger.info({ tenant_id: 'isp-1' }, 'ISP conectou');
 * logger.error({ err: error, tenant_id: 'isp-1' }, 'Falha ao processar mensagem');
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  // Em desenvolvimento: logs bonitos e legíveis
  // Em produção: JSON puro (consumido pelo Sentry/Datadog/Grafana)
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,

  // Campos base em todo log
  base: {
    service: 'astrum-api',
    version: process.env.npm_package_version ?? '2.0.0',
    environment: process.env.NODE_ENV ?? 'development',
  },

  // Serialização customizada para objetos de erro
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Redact: esconder dados sensíveis nos logs automaticamente
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.cpf',
      '*.credit_card',
      '*.card_number',
    ],
    censor: '[REDACTED]',
  },
});

// Child logger por domínio — use estes em vez do logger raiz
export const atendimentoLogger = logger.child({ domain: 'atendimento' });
export const cobrancaLogger = logger.child({ domain: 'cobranca' });
export const iaLogger = logger.child({ domain: 'ia' });
export const infraLogger = logger.child({ domain: 'infra' });
```

### TAREFA 3 — Substituir console.log nos arquivos críticos

Analise os arquivos fornecidos e produza um script de substituição.
Para cada arquivo com `console.log`, `console.error`, `console.warn`, `console.info`:

**Regras de substituição:**
- `console.log(mensagem)` → `logger.info(mensagem)` (ou child logger do domínio)
- `console.error(mensagem, err)` → `logger.error({ err }, mensagem)`
- `console.warn(mensagem)` → `logger.warn(mensagem)`
- `console.log('Connected to Redis')` → `infraLogger.info('Redis conectado')`
- `console.error('[DLQ]', ...)` → `infraLogger.error({ domain: 'dlq' }, ...)`
- `console.warn('[CIRCUIT_BREAKER]', ...)` → `iaLogger.warn('[CIRCUIT_BREAKER] ...')`

Aplique as substituições nos seguintes arquivos prioritários:
1. `apps/api/src/adapters/openai/openai.adapter.ts`
2. `apps/api/src/adapters/whatsapp/whatsapp.adapter.ts`
3. `apps/api/src/infrastructure/cache/redis.client.ts`
4. `apps/api/src/infrastructure/queue/bullmq.client.ts`
5. `apps/api/src/infrastructure/idempotency/idempotency.middleware.ts`

### TAREFA 4 — Criar teste do logger

Crie `apps/api/src/infrastructure/logging/logger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { logger, iaLogger } from './logger';

describe('Pino Logger', () => {
  it('logger existe e tem os métodos esperados', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('child loggers têm contexto de domínio', () => {
    expect(iaLogger.bindings()).toMatchObject({ domain: 'ia' });
  });
});
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 12 CONCLUÍDA
Sprint: 0 | Dia: 12 | Tipo: REFACTOR
Tarefa: Pino.js implementado + console.log substituídos nos arquivos críticos
Dependências instaladas: pino, pino-http, sonic-boom, pino-pretty (dev)
Arquivos criados:
  + apps/api/src/infrastructure/logging/logger.ts
  + apps/api/src/infrastructure/logging/logger.test.ts
Arquivos modificados:
  ~ apps/api/src/adapters/openai/openai.adapter.ts
  ~ apps/api/src/adapters/whatsapp/whatsapp.adapter.ts
  ~ apps/api/src/infrastructure/cache/redis.client.ts
  ~ apps/api/src/infrastructure/queue/bullmq.client.ts
  ~ apps/api/src/infrastructure/idempotency/idempotency.middleware.ts
Checklist para atualizar:
  sprint_0.md → Dia 12 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Pino.js: zero console.log no código de produção" → Em progresso
Próxima sessão: Sessão 13 — Dia 13 — Secrets Management + CSP
═══════════════════════════════════════
```
