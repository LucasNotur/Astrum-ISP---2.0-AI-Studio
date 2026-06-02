# Arquivos Deprecados — Sprint 0 / Dia 8

Os seguintes arquivos serão deletados quando todos os imports forem migrados.
NÃO importe mais destes arquivos em código novo.

## Firebase (substituído por Supabase)
- `src/lib/firebase.ts` → substituído por `src/lib/supabase.ts`
- `src/lib/firebaseAdmin.ts` → substituído por `src/lib/supabaseAdmin.ts`

## Motivo
Firebase/Firestore removido no Sprint 0 conforme plano de migração DDD.
Dados históricos preservados — apenas novos writes vão para o Supabase.

## Data de remoção planejada
Sprint 1 — após validação completa de que nenhum código ativo importa estes arquivos.
