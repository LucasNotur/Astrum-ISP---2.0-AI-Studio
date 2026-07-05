# Migrations Supabase — Astrum

**Fonte canônica** de schema. Aplicadas em ordem numérica pelo runner com tracking.

## Como aplicar

```bash
npm run db:migrate:dry   # mostra o plano (nada é escrito)
npm run db:migrate       # aplica as migrations pendentes
```

Banco **já provisionado à mão** (001–014 aplicadas no Sprint 0/1 via SQL Editor)?
Marque-as como aplicadas sem reexecutar, antes do primeiro `db:migrate`:

```bash
npm run db:baseline      # registra todas as atuais em schema_migrations, sem rodar
```

O runner (`packages/db/src/migrate.ts`) cria a tabela `schema_migrations`, pula o que
já foi aplicado, roda cada arquivo em sua própria transação e alerta em caso de drift
(checksum divergente). Requer `DATABASE_URL` no `.env`.

## Migrations

| # | Arquivo | Descrição |
|---|---------|-----------|
| 001 | idempotency_keys.sql | Idempotency Keys |
| 002 | dead_letter_queue.sql | DLQ (substitui Firestore) |
| 003 | refresh_tokens.sql | JWT Rotation |
| 004 | users.sql | Usuários + Argon2id |
| 005 | rls_policies.sql | RLS + tabelas principais (customers, tickets, conversations, messages) |
| 006 | rbac.sql | RBAC + permissões |
| 007 | audit_log.sql | Log de auditoria (segurança) |
| 008 | billing.sql | Faturamento + CobrAI (billing_plans, invoices, cobrai_rules/jobs) |
| 009 | rag_knowledge.sql | RAG (knowledge_documents) + AI Config |
| 010 | cobrai_default_trigger.sql | Trigger de regras CobrAI padrão por tenant |
| 011 | performance_indexes.sql | Índices de performance |
| 012 | batch_api.sql | Batch API + churn predictions |
| 013 | outbox_r2.sql | Outbox pattern |
| 014 | svix.sql | Webhook deliveries (Svix) |
| 015 | field_operations.sql | **Migração legado:** network_ctos, technicians, service_orders |
| 016 | inventory_notifications_team.sql | **Migração legado:** inventory, notifications, team_members |
| 017 | knowledge_articles.sql | **Migração legado:** artigos (texto original + re-ingestão RAG) |
| 018 | ai_performance_logs.sql | **Migração legado:** audit_logs de IA/SLA (≠ audit_log de segurança) |
| 019 | legacy_reconciliation.sql | **Migração legado:** ALTERs em customers/tickets/invoices/ai_configurations |
| 020 | realtime_cdc.sql | Supabase Realtime (CDC) nas tabelas principais |

015–020 fecham o gap Firestore→Supabase — ver `docs/DB_MIGRATION_GAP_REPORT.md`.

## Verificação

```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;

SELECT * FROM schema_migrations ORDER BY filename;
```

⚠️ Ver `docs/DB_CONSOLIDATION_NOTES.md` para a divergência de convenção de RLS entre
migrations (decisão pendente).
