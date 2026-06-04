# PROMPTS DO SPRINT 0 — PARTE 1
## Sessões 1 e 2 (Dias 1 e 2)

---

# ═══════════════════════════════════════════════════
# SESSÃO 1 — DIA 1: AUDITORIA E MAPA DDD
# Sprint 0 | Sessão 1 de 14 | Tipo: SETUP
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload junto com este prompt:
- `server.ts`
- `package.json`
- `src/lib/firebase.ts`
- `src/lib/firebaseAdmin.ts`
- `src/lib/supabase.ts`
- `src/lib/redis.ts`
- `src/lib/queue.ts`
- `src/lib/gemini.ts` (primeiras 100 linhas)
- `src/lib/guardrails.ts`
- `.astrum-progress/CHECKLIST_MASTER.md`
- `.astrum-progress/PROGRESS_LOG.md`
- `.astrum-progress/sprint_0.md`

---

## PROMPT 1A — AUDITORIA COMPLETA DO PROJETO

Você é um arquiteto de software sênior especializado em Domain-Driven Design (DDD) e arquitetura hexagonal para SaaS B2B.

Estou iniciando a transformação da plataforma **Astrum ISP** — um sistema de gestão para provedores de internet (ISPs) com IA. O projeto precisa ser refatorado de uma arquitetura monolítica desorganizada para uma arquitetura DDD + Hexagonal production-grade.

### CONTEXTO DO PROJETO ATUAL

**Stack atual (o que existe hoje):**
- Node.js com Express (legado) + Fastify (parcialmente instalado mas não usado como principal)
- Firebase/Firestore (legado — deve ser COMPLETAMENTE removido)
- Supabase (PostgreSQL) — banco principal a manter
- Redis + BullMQ — sistema de filas (funcional mas com mock fallback)
- OpenAI + Anthropic + Google Gemini — três SDKs de IA instalados (precisa unificar)
- React 18 + Vite + TypeScript — frontend
- Qdrant — banco vetorial (instalado, pouco usado)
- Zod — validação (instalado mas subutilizado)

**Problemas críticos identificados:**
1. `server.ts` usa Express puro — sem validação de schema, sem Graceful Shutdown
2. `queue.ts` — DLQ usa Firebase/Firestore (deve migrar para Supabase)
3. `redis.ts` — tem fallback in-memory (aceitável para dev, não para produção)
4. Três SDKs de IA diferentes sem abstração unificada
5. Estrutura de pastas por tecnologia (`lib/`, `workers/`) em vez de por domínio de negócio
6. `console.log` espalhado por todo o código (sem sistema de logs estruturado)
7. Zero Circuit Breaker nas chamadas externas (OpenAI, WhatsApp, pagamentos)

### TAREFA DA SESSÃO 1

Analise os arquivos fornecidos e produza um **Documento de Auditoria Arquitetural** com as seguintes seções:

#### SEÇÃO 1 — MAPEAMENTO DE DOMÍNIOS
Classifique cada arquivo da pasta `src/lib/` em um dos domínios DDD abaixo. Para cada arquivo, explique em uma linha o que ele faz e qual domínio pertence:

| Domínio | Descrição | Arquivos que pertencem |
|---------|-----------|----------------------|
| `domain/atendimento` | Tickets, Chat, Clientes, Mensagens | |
| `domain/cobranca` | CobrAI, Faturas, Pagamentos, Inadimplência | |
| `domain/provedor` | ISP, Contratos, Planos, Configurações | |
| `domain/ia` | Prompts, Agentes, RAG, Embeddings | |
| `infrastructure/` | Supabase, Redis, BullMQ (sem lógica de negócio) | |
| `adapters/` | OpenAI, Qdrant, WhatsApp, Evolution API | |
| `DELETAR` | Firebase, legados, mock implementations | |

#### SEÇÃO 2 — LISTA DE PROBLEMAS PRIORITÁRIOS
Rank os 10 problemas mais críticos do código atual, do mais grave ao menos grave, com:
- Nome do problema
- Arquivo(s) afetado(s)
- Risco se não corrigido
- Esforço estimado (Baixo/Médio/Alto)

#### SEÇÃO 3 — DEPENDÊNCIAS CIRCULARES
Identifique nos arquivos fornecidos qualquer import circular (A importa B que importa A). Liste cada ocorrência.

#### SEÇÃO 4 — INVENTÁRIO DE FIREBASE
Liste TODOS os usos de Firebase/Firestore encontrados nos arquivos fornecidos:
- Arquivo
- Linha aproximada
- O que faz
- Equivalente Supabase proposto

#### SEÇÃO 5 — PLANO DE MIGRAÇÃO RESUMIDO
Uma tabela com:
- O que existe hoje → O que será no final do Sprint 0
- Arquivo atual → Arquivo novo na estrutura DDD

### FORMATO DE SAÍDA

Produza o documento em Markdown limpo e organizado. Seja específico — cite nomes de arquivos e funções reais, não genéricos.

### REGRAS INEGOCIÁVEIS
- Não escreva código ainda. Esta sessão é APENAS de análise e documentação.
- Baseie-se APENAS nos arquivos fornecidos — não invente estruturas que não existem.
- Se encontrar algo preocupante não listado nas tarefas, adicione na Seção 2.

### CHECKLIST UPDATE (ao final)
Após produzir o documento, retorne o seguinte bloco para eu atualizar os arquivos de progresso:

```
═══════════════════════════════════════
SESSÃO 1 CONCLUÍDA
Sprint: 0 | Dia: 1 | Tipo: SETUP
Tarefa: Auditoria e Mapa DDD
Documentos produzidos: AUDITORIA_ARQUITETURAL.md
Checklist para atualizar:
  sprint_0.md → Dia 1 → marcar todos os [ ] como [x]
Próxima sessão: Sessão 2 — Dia 2 — Reestruturação de Pastas DDD
═══════════════════════════════════════
```

---

# ═══════════════════════════════════════════════════
# SESSÃO 2 — DIA 2: REESTRUTURAÇÃO DE PASTAS DDD
# Sprint 0 | Sessão 2 de 14 | Tipo: SETUP
# Bloco: B12 — Padrões Arquiteturais
# ═══════════════════════════════════════════════════

## INSTRUÇÕES PARA O AI STUDIO
Arquivos para fazer upload junto com este prompt:
- Documento de Auditoria produzido na Sessão 1
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `.astrum-progress/sprint_0.md`
- `.astrum-progress/PROGRESS_LOG.md`

---

## PROMPT 2A — CRIAR ESTRUTURA DDD + MONOREPO

Você é um arquiteto de software sênior. Com base no Documento de Auditoria da Sessão 1, vamos criar a estrutura de pastas DDD + Hexagonal + Monorepo TurboRepo da Astrum.

### ESTRUTURA ALVO

Crie os seguintes arquivos e pastas (arquivos de index vazios onde necessário para marcar a estrutura):

```
astrum/                                    ← raiz do monorepo
├── turbo.json                             ← configuração TurboRepo
├── package.json                           ← package.json raiz (workspaces)
│
├── apps/
│   ├── api/                               ← Node.js + Fastify (motor central)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── domain/
│   │       │   ├── atendimento/           ← Tickets, Chat, Clientes
│   │       │   │   └── index.ts
│   │       │   ├── cobranca/              ← CobrAI, Faturas, Pagamentos
│   │       │   │   └── index.ts
│   │       │   ├── provedor/              ← ISP, Contratos, Planos
│   │       │   │   └── index.ts
│   │       │   └── ia/                   ← Prompts, Agentes, RAG
│   │       │       └── index.ts
│   │       ├── application/              ← Use cases (lógica pura de negócio)
│   │       │   └── index.ts
│   │       ├── infrastructure/           ← Implementações técnicas
│   │       │   ├── database/
│   │       │   │   └── supabase.client.ts
│   │       │   ├── cache/
│   │       │   │   └── redis.client.ts
│   │       │   ├── queue/
│   │       │   │   └── bullmq.client.ts
│   │       │   └── logging/
│   │       │       └── logger.ts
│   │       └── adapters/                 ← Integrações externas
│   │           ├── openai/
│   │           │   └── openai.adapter.ts
│   │           ├── qdrant/
│   │           │   └── qdrant.adapter.ts
│   │           └── whatsapp/
│   │               └── whatsapp.adapter.ts
│   │
│   └── web/                              ← React 18 + Vite SPA
│       ├── package.json
│       └── src/
│           └── index.ts
│
├── packages/
│   ├── ai/                               ← LangGraph + Vercel AI SDK
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   ├── db/                               ← Supabase schema + RLS + migrations
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   ├── queue/                            ← BullMQ workers + DLQ
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   └── shared/                           ← Zod schemas + tipos compartilhados
│       ├── package.json
│       └── src/
│           ├── schemas/
│           │   └── index.ts
│           └── utils/
│               └── index.ts
│
└── infra/                                ← Pulumi IaC
    └── index.ts
```

### TAREFAS ESPECÍFICAS

**1. Criar `turbo.json`** na raiz com o pipeline:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**2. Criar `package.json` raiz** com workspaces configurados:
```json
{
  "name": "astrum-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  }
}
```

**3. Criar `apps/api/src/infrastructure/database/supabase.client.ts`**
Mova o conteúdo de `src/lib/supabase.ts` para cá, mas adicione:
- Comentário de documentação explicando que este é o único ponto de acesso ao Supabase
- Export nomeado `supabaseClient` (além do default)
- Validação: se `SUPABASE_URL` ou `SUPABASE_ANON_KEY` não existir, lançar erro descritivo

**4. Criar `apps/api/src/infrastructure/cache/redis.client.ts`**
Mova o conteúdo de `src/lib/redis.ts` para cá, mas:
- Adicione comentário documentando que o mock in-memory é apenas para desenvolvimento local
- Exporte uma função `getRedisStatus()` que retorna `'real' | 'mock'`
- Adicione log via Pino (placeholder por ora: `console.info` com prefixo `[REDIS]`)

**5. Criar `apps/api/src/infrastructure/queue/bullmq.client.ts`**
Mova a lógica de `src/lib/queue.ts` para cá, mas:
- **REMOVA** toda referência a `firebaseAdmin` e Firestore da função `setupDLQ`
- Substitua o salvamento no Firestore por um `TODO: Implementar DLQ no Supabase (Sprint 1)`
- Adicione log `console.info('[BULLMQ] Job moved to DLQ:', job.name)` no lugar do Firestore

**6. Criar `packages/shared/src/utils/memoize.ts`** com implementação TypeScript:
```typescript
// Memoization utility — evita recalcular funções pesadas com os mesmos parâmetros
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}
```

### REGRAS INEGOCIÁVEIS
- TypeScript strict: todos os arquivos novos devem ter tipos explícitos, sem `any`
- Nenhum import de Firebase nos novos arquivos
- Arquivos de `index.ts` vazios nas pastas que ainda não têm conteúdo (marcadores de estrutura)
- Não apague ainda os arquivos originais em `src/lib/` — apenas crie os novos. A migração completa será gradual (Strangler Fig Pattern)

### TESTES A CRIAR

Crie o arquivo `packages/shared/src/utils/memoize.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { memoize } from './memoize';

describe('memoize', () => {
  it('retorna o mesmo resultado na segunda chamada sem reexecutar a função', () => {
    let callCount = 0;
    const fn = memoize((x: number) => { callCount++; return x * 2; });
    expect(fn(5)).toBe(10);
    expect(fn(5)).toBe(10);
    expect(callCount).toBe(1); // só executou 1 vez
  });

  it('executa novamente para parâmetros diferentes', () => {
    let callCount = 0;
    const fn = memoize((x: number) => { callCount++; return x * 2; });
    fn(5);
    fn(10);
    expect(callCount).toBe(2);
  });

  it('aceita função de chave customizada', () => {
    let callCount = 0;
    const fn = memoize(
      (isp_id: string, _period: string) => { callCount++; return isp_id; },
      (isp_id) => isp_id // ignora o período na chave
    );
    fn('isp-1', 'jan');
    fn('isp-1', 'fev'); // mesma chave, não reexecuta
    expect(callCount).toBe(1);
  });
});
```

### CHECKLIST UPDATE
```
═══════════════════════════════════════
SESSÃO 2 CONCLUÍDA
Sprint: 0 | Dia: 2 | Tipo: SETUP
Tarefa: Reestruturação de Pastas DDD + Monorepo
Arquivos criados:
  + turbo.json
  + package.json (raiz)
  + apps/api/src/infrastructure/database/supabase.client.ts
  + apps/api/src/infrastructure/cache/redis.client.ts
  + apps/api/src/infrastructure/queue/bullmq.client.ts
  + packages/shared/src/utils/memoize.ts
  + packages/shared/src/utils/memoize.test.ts
  + [todos os index.ts de estrutura DDD]
Checklist para atualizar:
  sprint_0.md → Dia 2 → marcar todos os [ ] como [x]
  CHECKLIST_MASTER.md → "Monorepo TurboRepo inicializado" → Em progresso
Próxima sessão: Sessão 3 — Dia 3 — Circuit Breaker
═══════════════════════════════════════
```
