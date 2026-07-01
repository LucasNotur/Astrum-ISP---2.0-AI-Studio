# Guia de Migração — Motor de IA

## Código LEGADO (não usar em código novo)
- `src/lib/gemini.ts` — chamadas diretas ao Gemini/OpenAI
- `src/lib/gemini.server.ts` — lógica de servidor legada (172kb)
- `src/ai-provider/ai-provider.service.ts` — service provider antigo

## Código NOVO (use sempre este)
- `apps/api/src/adapters/ai/llm.adapter.ts` → função `callLLM(request)`

## Como migrar
ANTES:
```typescript
import { generateResponse } from '../lib/gemini';
const response = await generateResponse(prompt);
```

DEPOIS:
```typescript
import { callLLM } from '../adapters/ai/llm.adapter';
const response = await callLLM({
  messages: [{ role: 'user', content: prompt }],
  tenantId: req.user.tenantId,
  context: 'support',
});
```

## Status da migração (revisado 2026-07-01)

> ⚠️ **CORREÇÃO:** A versão anterior dizia que estes arquivos "serão removidos no
> Sprint 3 quando LangGraph assumir completamente". Estamos no **Sprint 6** e isso
> **não aconteceu**. `gemini.server.ts` (172kb) continua sendo importado por código
> ativo e central: `src/workers/messageWorker.ts`, `src/lib/toolRegistry.ts`,
> `src/pages/ChatPage.tsx` e `src/App.tsx`.

O motor de IA legado (`gemini.ts`, `gemini.server.ts`, `ai-provider.service.ts`)
ainda está **em produção**. O `apps/api` (LangGraph + `callLLM`) é uma base nova
que ainda não recebeu o cérebro do atendimento — o `messageWorker` de 1605 linhas
segue no legado.

Remoção real: **Fase 1** do plano em `docs/LEGACY_RETIREMENT_PLAN.md`.
