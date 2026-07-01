# Arquivos Legados — Estado Real (revisado 2026-07-01)

> ⚠️ **CORREÇÃO IMPORTANTE:** A versão anterior deste documento afirmava que o
> Firebase havia sido "removido no Sprint 0". **Isso é factualmente incorreto.**
> O Firebase/Firestore continua sendo o banco de dados **VIVO** de todo o app
> legado `/src`. Não houve remoção — apenas o backend novo (`apps/api`) nasceu
> sobre Supabase. Os dois coexistem hoje (Strangler Fig em andamento).

## Estado atual (verificado)

- `src/lib/db.ts` é construído sobre **Firestore** (`collection`, `addDoc`,
  `onSnapshot`, `serverTimestamp`...) e é a camada central de dados do legado.
- **~30 arquivos ativos** em `src/lib`, `src/components`, `src/workers` e
  `src/routes` importam Firebase diretamente.
- `firebase-applet-config.json` (raiz) é a config **viva** usada por
  `src/lib/firebase.ts` — **NÃO deletar**.

## Regra para código NOVO

- **Não escreva features novas no `/src`.** Todo código novo nasce em `apps/api`
  (Fastify + Supabase) conforme o plano de migração.
- Ao tocar código legado, prefira migrar o trecho para `apps/api` a estendê-lo.

## Firebase → Supabase (substituições-alvo)

| Legado (Firestore) | Alvo (Supabase) |
|---|---|
| `src/lib/firebase.ts` | `src/lib/supabase.ts` / `apps/api` supabase.client |
| `src/lib/firebaseAdmin.ts` | `src/lib/supabaseAdmin.ts` / `apps/api` supabaseAdmin |
| `src/lib/db.ts` (Firestore) | `apps/api/src/infrastructure/database/tenant-db.service.ts` |

## Quando o Firebase sai de fato

Somente na **Fase 5** do plano de aposentadoria do legado
(`docs/LEGACY_RETIREMENT_PLAN.md`), após portar ingresso WhatsApp, integrações
ERP, workers operacionais e UI para o `apps/api`. Até lá, Firebase permanece
em produção.
