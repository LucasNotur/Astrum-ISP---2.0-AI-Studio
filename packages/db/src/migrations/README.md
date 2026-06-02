# Migrations Supabase — Astrum

Execute no SQL Editor do Supabase em ordem numérica.

| # | Arquivo | Descrição | Executada |
|---|---------|-----------|-----------|
| 001 | idempotency_keys.sql | Idempotency Keys | ✅ Sprint 0 Dia 4 |
| 002 | dead_letter_queue.sql | DLQ (substitui Firestore) | ✅ Sprint 0 Dia 8 |
| 003 | refresh_tokens.sql | JWT Rotation | ✅ Sprint 1 Dia 16 |
| 004 | users.sql | Usuários + Argon2id | ✅ Sprint 1 Dia 17 |
| 005 | rls_policies.sql | RLS + tabelas principais | ✅ Sprint 1 Dia 19 |
| 006 | rbac.sql | RBAC + permissões | ✅ Sprint 1 Dia 20 |
| 007 | audit_log.sql | Log de auditoria | ✅ Sprint 1 Dia 21 |
| 008 | billing.sql | Faturamento + CobrAI | ✅ Sprint 1 Dia 22 |
| 009 | rag_knowledge.sql | RAG + AI Config | ✅ Sprint 1 Dia 22 |

## Verificação
Execute para confirmar todas as tabelas:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
