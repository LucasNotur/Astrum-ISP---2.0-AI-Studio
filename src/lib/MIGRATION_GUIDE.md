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

## Status da migração
Os arquivos legados continuam funcionando (Strangler Fig).
Serão removidos no Sprint 3 quando LangGraph assumir completamente.
