# Plano de Aposentadoria do Legado — Astrum

> Documento vivo. Criado em 2026-07-01 a partir de auditoria do repositório.
> Objetivo: consolidar as 3 frentes de backend em um único stack (`apps/api`
> Fastify + Supabase) e desligar o legado `/src` (Express + Firestore).

---

## 1. Estado real (o que a auditoria encontrou)

O repositório está no meio de uma migração **Strangler Fig** e contém **três
frentes** de código coexistindo:

```
server.ts (raiz, Express :3000) ──monta──> /src/routes/*  ──usa──> Firestore + /src/lib/* (ERPs, workers)
        │
        └──boota em background──> apps/api (Fastify) ──usa──> Supabase + Qdrant + Redis  [independente]

apps/backend  → billing_enterprise / subscriptions (frente isolada, Supabase)
```

Fatos verificados:

- **`apps/api` NÃO é reimplementação do legado** — é uma fundação nova de
  *primitivos de plataforma de IA* que ainda não recebeu a lógica de negócio ISP.
  - `packages/queue/.../message.worker.ts` = **103 linhas** (esqueleto)
  - `src/workers/messageWorker.ts` = **1605 linhas** (o cérebro real, em produção)
- **Firebase está VIVO**, não dormente. `src/lib/db.ts` é Firestore; ~30 arquivos
  ativos importam Firebase. Docs antigos que diziam "Firebase removido no Sprint 0"
  estavam errados (corrigidos em `src/lib/DEPRECATED.md`).
- **Motor de IA legado em produção:** `gemini.server.ts` (172kb) ainda é importado
  por `messageWorker`, `toolRegistry`, `ChatPage`, `App.tsx`.
- ✅ **Separação limpa:** `apps/api` não importa nada de `/src` (0 acoplamento
  reverso). A dependência é de mão única — o que facilita a migração.

### Divisão de responsabilidades

| Domínio | Legado `/src` (Firestore) | Novo `apps/api` (Supabase) |
|---|---|---|
| Ingresso WhatsApp (Evolution) | ✅ `evolutionWebhook`, `messageWorker` | ❌ ausente |
| Integrações ERP (IXC, Hubsoft, Voalle, SGP, MK-Auth, RadiusNet, RBX) | ✅ `src/lib/integrations/*` | ❌ **nenhuma** |
| Auth (JWT) | ✅ | ✅ (novo, Argon2 + rotation) |
| Tickets | ✅ `/api/v1/tickets` | ✅ `/api/v2/tickets` (**divergente**) |
| CobrAI | ✅ `cobraiWorker` + `/api/cobrai/*` | ✅ `cobranca/*` (**divergente**) |
| RAG / documents / guardrails | parcial (`gemini.server`, `guardrails.ts`) | ✅ pipeline completo |
| Workers operacionais (sla, fcr, snooze, report, gamification, planSync, vision, siteScrape, erpSync) | ✅ | ❌ ausentes |
| UI admin (22 páginas) | ✅ `src/pages/*` | 🟡 parcial em `apps/web` |
| Observabilidade / filas infra | básico | ✅ Sentry, LangSmith, BullMQ, Outbox |

---

## 2. Relatório de Divergência (risco de split-brain)

O maior risco **não** é código morto — é o mesmo domínio existindo em **dois bancos
simultaneamente sem sincronização**. Enquanto ambos os backends rodam, entidades
podem divergir.

### 2.1 Tickets

| | Legado | Novo |
|---|---|---|
| Endpoint | `GET /api/v1/tickets` (Express) | `/api/v2/tickets` (GET/POST/PUT `:id`) |
| Banco | Firestore (`src/lib/db.ts`) | Supabase (`tenant-db.service`) |

**Risco:** um ticket criado via v1 (Firestore) **não aparece** na v2 (Supabase) e
vice-versa. O frontend precisa escolher uma versão; se UIs diferentes usarem versões
diferentes, operadores veem filas divergentes.

### 2.2 CobrAI (mais grave)

| | Legado | Novo |
|---|---|---|
| Endpoints | `/api/cobrai/queue`, `/queue-stats`, `/send-now` | `cobranca/` (rules + scheduler) |
| Worker | `cobraiWorker.ts` (454L) | `cobrai.worker.ts` + `cobrai.scheduler.ts` |
| Config de limites | Firestore `tenants` (hourly limit) | Supabase `cobrai_rules` |
| Jobs/auditoria | Firestore `logs` | Supabase `cobrai_jobs` |

**Risco crítico:** duas réguas de cobrança independentes sobre bancos diferentes.
Se ambas dispararem, um cliente inadimplente pode receber **cobrança dupla**, ou os
limites por hora (um em Firestore, outro em Supabase) podem ser violados porque
nenhum dos dois enxerga os disparos do outro. **Recomendação imediata: garantir que
apenas UMA régua CobrAI esteja ativa em produção** até a migração concluir.

### 2.3 Ação de contenção (antes de qualquer port)

1. Determinar qual backend está **realmente servindo produção** hoje (v1 ou v2) para
   tickets e cobrança.
2. Desativar o worker CobrAI do backend não-canônico (feature flag / não subir o
   worker) para eliminar o risco de disparo duplo.
3. Documentar a fonte-da-verdade por domínio nesta tabela antes de portar.

---

## 3. Estratégia faseada de aposentadoria

> Princípio: **portar, não apagar.** O legado só é deletado quando seu comportamento
> for reproduzido e validado no `apps/api`.

### Fase 0 — Estancar o sangramento (baixo esforço) — *em andamento*
- [x] Corrigir docs enganosos (`DEPRECATED.md`, `MIGRATION_GUIDE.md`).
- [x] Escrever este plano.
- [ ] Congelar features novas no `/src` (regra de time; toda feature nova em `apps/api`).
- [ ] Resolver a contenção de divergência da seção 2.3 (fonte-da-verdade + CobrAI único).

### Fase 1 — Portar ingresso e cérebro do atendimento
- Migrar `evolutionWebhook` + `messageWorker` (1605L) para `apps/api`.
- Substituir o stub `message.worker.ts` (103L) pela lógica real, agora sobre
  Supabase + guardrails/RAG novos.
- É o caminho quente: quase todo o resto depende do fluxo de mensagem.

### Fase 2 — Portar integrações ERP (diferencial do produto)
- Trazer `src/lib/integrations/*` para `apps/api/src/adapters/erp/`, reaproveitando
  os circuit breakers (Opossum) já existentes no novo backend.
- Sem isso, a IA nova não resolve boleto/pagamento/sinal reais.

### Fase 3 — Portar workers operacionais
- `sla`, `fcr`, `snooze`, `report`, `gamification`, `planSync`, `vision`,
  `siteScrape`, `erpSync` → `packages/queue/src/workers`.

### Fase 4 — Migrar a UI
- `src/pages/*` (22 páginas) → `apps/web` (React Query + `api-client` novo, `/api/v2`).

### Fase 5 — Cortar o cordão
- Remover Firestore de `src/lib/db.ts`; deletar `/src`, Express e `server.ts` raiz.
- Fastify (`apps/api`) vira o único servidor.
- **Só aqui** saem Firebase, suas configs (`firebase*.json`, `firestore.rules`) e as
  dependências `firebase` / `firebase-admin` do `package.json`.

---

## 4. Definição de pronto (por fase)

Uma fase só é considerada concluída quando:
1. O comportamento equivalente existe e está testado em `apps/api`.
2. O tráfego de produção aponta para o novo caminho.
3. O código legado correspondente foi removido (não apenas marcado como deprecated).
4. Esta página foi atualizada.

---

## 5. Referências

- Auditoria de estrutura e stack: `.astrum-progress/12_BLOCOS_TECNOLOGICOS.md`
- PRD (parcialmente desatualizado — ainda cita Firestore como banco principal): `docs/PRD.md`
- Progresso das sessões: `.astrum-progress/PROGRESS_LOG.md`
