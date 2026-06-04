# PROMPTS DO SPRINT 0 — PARTE 6
## Sessões 13 e 14 (Dias 13 e 14) — Gate Final

---

# ═══════════════════════════════════════════════════
# SESSÃO 13 — DIA 13: SECRETS MANAGEMENT + CSP
# Sprint 0 | Sessão 13 de 14 | Tipo: SETUP
# Bloco: B09 — Segurança
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload:
- `.env.example` (arquivo existente)
- `apps/api/src/server.ts` (criado Sessão 10)
- `.astrum-progress/sprint_0.md`

---

## PROMPT 13A — SECRETS MANAGEMENT + CSP + CI SECRET SCAN

### CONTEXTO
Secrets (API keys, passwords, tokens) nunca devem existir no código-fonte.
Um único vazamento de API key pode comprometer toda a infraestrutura.
Esta sessão implementa as camadas de proteção de secrets.

### TAREFA 1 — Auditar e atualizar .env.example

Analise o `.env.example` existente e adicione todas as variáveis necessárias para o sistema atual.
O arquivo deve conter TODAS as variáveis usadas em qualquer arquivo do projeto, com valores de placeholder e comentários explicativos:

```bash
# ═══════════════════════════════════════════════════
# ASTRUM AI ENGINE — Variáveis de Ambiente
# Copie este arquivo para .env e preencha com valores reais
# NUNCA commite o arquivo .env no Git
# ═══════════════════════════════════════════════════

# ── Servidor ────────────────────────────────────────
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# ── Supabase ─────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
# Nunca exponha a SERVICE_ROLE_KEY no frontend

# ── Redis ────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# Produção: redis://user:password@host:port

# ── OpenAI ───────────────────────────────────────────
OPENAI_API_KEY=sk-your-key-here
# Sprint 2: será roteado via Helicone

# ── Helicone (Sprint 2) ──────────────────────────────
HELICONE_API_KEY=your-helicone-key-here

# ── WhatsApp / Evolution API ─────────────────────────
EVOLUTION_API_URL=https://your-evolution-instance.com
EVOLUTION_API_KEY=your-evolution-key-here

# ── JWT ──────────────────────────────────────────────
JWT_SECRET=change-this-to-random-64-char-string-in-production

# ── Webhook HMAC (Sprint 1) ──────────────────────────
WEBHOOK_HMAC_SECRET=change-this-to-random-32-char-string

# ── Cloudflare R2 (Sprint 1) ─────────────────────────
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=astrum-documents

# ── Sentry (Sprint 3) ────────────────────────────────
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project

# ── LangSmith (Sprint 3) ─────────────────────────────
LANGCHAIN_API_KEY=your-langsmith-key
LANGCHAIN_TRACING=false
LANGCHAIN_PROJECT=astrum-production

# ── Origens permitidas ────────────────────────────────
ALLOWED_ORIGINS=http://localhost:5173,https://app.astrum.com.br
```

### TAREFA 2 — Criar GitHub Actions CI com Secret Scanner

Crie `.github/workflows/ci.yml`:

```yaml
name: Astrum CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  # ── Job 1: Secret Scanner ──────────────────────────────────────────
  secret-scan:
    name: 🔐 Secret Scanner
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verificar API keys expostas no código
        run: |
          echo "🔍 Verificando por secrets expostos..."
          
          # Padrões a bloquear
          PATTERNS=(
            "sk-[a-zA-Z0-9]{20,}"          # OpenAI API key
            "AKIA[0-9A-Z]{16}"             # AWS Access Key
            "AIza[0-9A-Za-z\\-_]{35}"      # Google API Key
            "eyJhbGciOiJIUzI1NiJ9"         # JWT com secret hardcoded
            "password\s*=\s*[\"'][^\"']{8,}" # Password no código
          )
          
          FOUND=0
          for PATTERN in "${PATTERNS[@]}"; do
            if grep -rE "$PATTERN" --include="*.ts" --include="*.js" --include="*.env" \
               --exclude-dir=".git" --exclude-dir="node_modules" --exclude-dir="dist" \
               --exclude="*.example" --exclude="*.test.ts" .; then
              echo "❌ BLOQUEADO: Secret encontrado no código!"
              FOUND=1
            fi
          done
          
          if [ $FOUND -eq 1 ]; then
            exit 1
          fi
          echo "✅ Nenhum secret encontrado."

  # ── Job 2: Typecheck ──────────────────────────────────────────────
  typecheck:
    name: 🔷 TypeScript
    runs-on: ubuntu-latest
    needs: secret-scan
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx turbo run typecheck

  # ── Job 3: Tests ─────────────────────────────────────────────────
  test:
    name: 🧪 Vitest
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx turbo run test
        env:
          NODE_ENV: test

  # ── Job 4: Build ─────────────────────────────────────────────────
  build:
    name: 🏗️ Build
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx turbo run build
        env:
          NODE_ENV: production
```

### TAREFA 3 — Criar validação de variáveis de ambiente na inicialização

Crie `apps/api/src/infrastructure/config/env.validator.ts`:

```typescript
import { z } from 'zod';

/**
 * Validação de variáveis de ambiente na inicialização do servidor.
 * O servidor não sobe se variáveis críticas estiverem faltando.
 * 
 * Isso evita erros silenciosos em produção onde uma variável ausente
 * causa falha apenas na primeira request que a precisa.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3001'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // Supabase — obrigatórios
  SUPABASE_URL: z.string().url('SUPABASE_URL deve ser uma URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatório'),

  // Redis — obrigatório em produção
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // OpenAI — obrigatório
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY deve começar com sk-'),

  // JWT — obrigatório
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

  // Opcionais (adicionados nos sprints seguintes)
  HELICONE_API_KEY: z.string().optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Valida e retorna as variáveis de ambiente.
 * Chame esta função no início do servidor (antes de qualquer operação).
 * Em caso de variável inválida, lança erro descritivo e encerra o processo.
 */
export function validateEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ ERRO DE CONFIGURAÇÃO: Variáveis de ambiente inválidas:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nVerifique seu arquivo .env e corrija os erros acima.');
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('validateEnv() deve ser chamado antes de getEnv()');
  return _env;
}
```

### TAREFA 4 — Integrar validação de env no servidor

Atualize o início de `apps/api/src/server.ts`:

No início da função `startServer()`, adicione como primeira linha:
```typescript
import { validateEnv } from './infrastructure/config/env.validator';
// ...
export async function startServer() {
  validateEnv(); // DEVE ser a primeira linha — bloqueia servidor se env inválido
  const app = await buildServer();
  // ... resto do código
}
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 13 CONCLUÍDA
Sprint: 0 | Dia: 13 | Tipo: SETUP
Tarefa: Secrets Management + GitHub Actions CI + Env Validator
Arquivos criados:
  + .github/workflows/ci.yml
  + apps/api/src/infrastructure/config/env.validator.ts
Arquivos modificados:
  ~ .env.example (atualizado com todas as variáveis)
  ~ apps/api/src/server.ts (validateEnv() adicionado)
Checklist para atualizar:
  sprint_0.md → Dia 13 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "CI job: grep no repositório = zero API keys" → ✅
Próxima sessão: Sessão 14 — GATE SPRINT 0
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 14 — DIA 14: GATE SPRINT 0
# Sprint 0 | Sessão 14 de 14 | Tipo: GATE
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload (todos os arquivos criados no Sprint 0):
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/adapters/openai/openai.adapter.test.ts`
- `apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts`
- `apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts`
- `apps/api/src/infrastructure/crdt/ticket-collab.service.test.ts`
- `packages/shared/src/utils/memoize.test.ts`
- `apps/api/src/infrastructure/logging/logger.test.ts`
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/CHECKLIST_MASTER.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 14A — VALIDAR GATE DO SPRINT 0

### TAREFA — Executar e validar todos os critérios do Gate

Você é um engenheiro de qualidade sênior. Execute a validação completa do Sprint 0.

Para cada critério abaixo, indique:
- ✅ PASSOU — com evidência (nome do teste, resultado)
- ❌ FALHOU — com causa e correção necessária
- ⚠️ PARCIAL — o que foi feito e o que falta

---

#### CRITÉRIO 1 — Circuit Breaker
**Teste:** `openai.adapter.test.ts`
- [ ] Fallback retorna em <500ms quando OpenAI indisponível
- [ ] `getOpenAICircuitStatus()` retorna estado correto
- [ ] Log `[CIRCUIT_BREAKER]` aparece quando disjuntor abre

#### CRITÉRIO 2 — Idempotência
**Teste:** `idempotency.middleware.test.ts`
- [ ] Request sem `Idempotency-Key` em rota financeira → 400
- [ ] `Idempotency-Key` com UUID inválido → 400
- [ ] Request com UUID válido → 200 processado normalmente

#### CRITÉRIO 3 — Rate Limiting (Token Bucket)
**Teste:** `token-bucket.service.test.ts`
- [ ] Primeira request → allowed: true
- [ ] Balde vazio → allowed: false com resetInSeconds > 0
- [ ] Rota billing tem menor capacidade que default

#### CRITÉRIO 4 — WAL + ETag + Memoization
**Teste:** `memoize.test.ts`
- [ ] Mesma função chamada 2x com mesmo param → executada 1 vez
- [ ] Parâmetros diferentes → executada 2 vezes
- [ ] Chave customizada funcionando

#### CRITÉRIO 5 — DDD: estrutura de pastas correta
**Verificação manual:**
- [ ] Pasta `apps/api/src/domain/` existe com 4 subdomínios
- [ ] Pasta `apps/api/src/infrastructure/` existe com database, cache, queue, logging
- [ ] Pasta `apps/api/src/adapters/` existe com openai, whatsapp, ai
- [ ] Pasta `/controllers` NÃO existe em lugar algum

#### CRITÉRIO 6 — Zero Firebase
**Verificação manual:**
- [ ] `src/lib/firebase.ts` não é importado por nenhum arquivo ativo
- [ ] `src/lib/firebaseAdmin.ts` não é importado por nenhum arquivo ativo
- [ ] `apps/api/src/infrastructure/queue/bullmq.client.ts` usa Supabase (não Firestore) na setupDLQ

#### CRITÉRIO 7 — Zero Express no código novo
**Verificação manual:**
- [ ] `apps/api/src/server.ts` usa Fastify (não Express)
- [ ] Graceful Shutdown implementado (SIGTERM handler)
- [ ] `/api/health` retorna status dos serviços

#### CRITÉRIO 8 — Pino.js ativo
**Teste:** `logger.test.ts`
- [ ] Logger existe com métodos info, error, warn, debug
- [ ] Child loggers têm contexto de domínio correto
- [ ] Arquivos críticos substituídos (openai.adapter, redis.client, etc.)

#### CRITÉRIO 9 — Zero secrets no repositório
**Verificação:**
- [ ] `.github/workflows/ci.yml` criado com secret scanner
- [ ] `.env.example` atualizado com todas as variáveis
- [ ] Arquivo `.env` NÃO existe no repositório (somente `.env.example`)

#### CRITÉRIO 10 — TurboRepo funcionando
**Verificação:**
- [ ] `turbo.json` criado com pipeline build, test, lint, dev
- [ ] `package.json` raiz com workspaces configurados
- [ ] `packages/shared/tsconfig.base.json` criado

---

### PRODUZIR RELATÓRIO FINAL

Ao final, produza:

```
═══════════════════════════════════════════════
GATE SPRINT 0 — RELATÓRIO FINAL
Data: [DATA]
═══════════════════════════════════════════════

CRITÉRIOS APROVADOS: X / 10

Detalhamento:
1. Circuit Breaker: ✅/❌/⚠️
2. Idempotência: ✅/❌/⚠️
3. Rate Limiting: ✅/❌/⚠️
4. WAL/ETag/Memoization: ✅/❌/⚠️
5. DDD Estrutura: ✅/❌/⚠️
6. Zero Firebase: ✅/❌/⚠️
7. Zero Express (novo código): ✅/❌/⚠️
8. Pino.js: ✅/❌/⚠️
9. Zero Secrets no repo: ✅/❌/⚠️
10. TurboRepo: ✅/❌/⚠️

VEREDICTO: APROVADO ✅ / REPROVADO ❌

[Se APROVADO]:
→ Sprint 1 pode ser iniciado.
→ Marcar Gate Sprint 0 como aprovado no CHECKLIST_MASTER.md

[Se REPROVADO]:
→ Lista de itens a corrigir antes de avançar:
  1. ...
  2. ...
═══════════════════════════════════════════════
```

### CHECKLIST UPDATE FINAL DO SPRINT 0
```
═══════════════════════════════════════
SESSÃO 14 — GATE SPRINT 0 CONCLUÍDA
Sprint: 0 | Dia: 14 | Tipo: GATE
Status do Gate: [APROVADO / REPROVADO]
Critérios passando: X / 10
Arquivos para atualizar:
  sprint_0.md → Dia 14 → marcar Gate como APROVADO/REPROVADO
  CHECKLIST_MASTER.md → Sprint 0 → marcar Gate como ✅/❌
  PROGRESS_LOG.md → adicionar entrada com data e resultado
Próxima sessão: [Sprint 1 / Dia 1 se aprovado] ou [correções se reprovado]
═══════════════════════════════════════
```

---

# ══════════════════════════════════════════════════
# SUMÁRIO DO SPRINT 0
# ══════════════════════════════════════════════════

## Arquivos Criados no Sprint 0 (referência completa)

### Novo código (DDD)
- `apps/api/src/server.ts`
- `apps/api/src/server.test.ts`
- `apps/api/src/adapters/openai/circuit-breaker.config.ts`
- `apps/api/src/adapters/openai/openai.adapter.ts`
- `apps/api/src/adapters/openai/openai.adapter.test.ts`
- `apps/api/src/adapters/whatsapp/whatsapp.adapter.ts`
- `apps/api/src/adapters/ai/llm.adapter.ts`
- `apps/api/src/adapters/ai/llm.adapter.test.ts`
- `apps/api/src/infrastructure/database/supabase.client.ts`
- `apps/api/src/infrastructure/cache/redis.client.ts`
- `apps/api/src/infrastructure/cache/etag.middleware.ts`
- `apps/api/src/infrastructure/queue/bullmq.client.ts`
- `apps/api/src/infrastructure/idempotency/idempotency.middleware.ts`
- `apps/api/src/infrastructure/idempotency/idempotency.middleware.test.ts`
- `apps/api/src/infrastructure/rate-limit/token-bucket.service.ts`
- `apps/api/src/infrastructure/rate-limit/token-bucket.service.test.ts`
- `apps/api/src/infrastructure/rate-limit/rate-limit.plugin.ts`
- `apps/api/src/infrastructure/logging/logger.ts`
- `apps/api/src/infrastructure/logging/logger.test.ts`
- `apps/api/src/infrastructure/crdt/ticket-collab.service.ts`
- `apps/api/src/infrastructure/crdt/ticket-collab.service.test.ts`
- `apps/api/src/infrastructure/config/env.validator.ts`
- `packages/shared/src/utils/memoize.ts`
- `packages/shared/src/utils/memoize.test.ts`
- `packages/shared/tsconfig.base.json`
- `packages/db/src/migrations/001_idempotency_keys.sql`
- `packages/db/src/migrations/002_dead_letter_queue.sql`
- `packages/db/src/docs/wal-configuration.md`

### Infraestrutura
- `turbo.json`
- `package.json` (raiz monorepo)
- `.github/workflows/ci.yml`
- `.env.example` (atualizado)
- `src/lib/DEPRECATED.md`

### Dependências instaladas
- `opossum` + `@types/opossum` (Circuit Breaker)
- `yjs` (CRDTs)
- `pino` + `pino-http` + `sonic-boom` (Logging)
- `pino-pretty` (dev)
- `@fastify/cors` + `@fastify/jwt` + `@fastify/multipart`
- `@fastify/helmet` + `@fastify/compress` + `fastify-plugin`
- `turbo` (monorepo)

*Sprint 0 — Prompts criados em: 2026-05-31*
*Próximo: prompts_sprint1.md será criado após aprovação do Gate Sprint 0*
