# Consolidação de Migrations — Notas

> Deliverable "C". Registra a unificação das fontes de SQL fragmentadas e as decisões
> ainda em aberto. Criado em 2026-07-01.

## O que foi consolidado

Antes, o schema estava espalhado em **4 lugares**, com um runner que só aplicava um deles:

| Fonte | Status agora |
|---|---|
| `packages/db/src/migrations/` (001–012) | ✅ **Fonte canônica** |
| `013_outbox_r2.sql`, `014_svix.sql` (raiz) | ➡️ movidos para o diretório canônico |
| `supabase-migrations.sql` (raiz) | ⚠️ **deprecado** — conteúdo único extraído (ver abaixo) |
| `Supabase_Assinaturas/` | 🔸 concern separado, não conectado (ver abaixo) |

Conteúdo único do `supabase-migrations.sql` foi preservado no diretório canônico:
- `dead_letter_queue` → `002_dead_letter_queue.sql` (o "002" que a README já citava mas não existia)
- Realtime CDC (`ALTER PUBLICATION`) → `020_realtime_cdc.sql`
- Trigger `create_default_cobrai_rules` → já era o `010_cobrai_default_trigger.sql` (não reextraído)
- `idempotency_keys` → já era o `001` (duplicata descartada)

Resultado: sequência **001–020 contígua**, um runner ordenado com tracking
(`packages/db/src/migrate.ts`, via `npm run db:migrate`), e o runner antigo da raiz
(`run-migrations.ts`) reduzido a um aviso de deprecação.

## Runner de migrations

- Cria `schema_migrations (filename, checksum, applied_at)`.
- Aplica apenas pendentes, cada uma em sua própria transação (rollback em falha).
- `--dry-run` mostra o plano; `--baseline` marca existentes como aplicadas sem rodar.
- Alerta de **drift**: avisa se um arquivo já aplicado teve o conteúdo alterado
  (migrations devem ser imutáveis; mudanças viram novas migrations).

> **Primeiro uso em banco existente:** rode `npm run db:baseline` uma vez (registra
> 001–020 como aplicadas sem reexecutar — evita erro nos `CREATE POLICY` não-idempotentes),
> depois `npm run db:migrate` para as futuras. Em banco novo, só `npm run db:migrate`.

## ⚠️ Decisões em aberto (NÃO resolvidas — precisam de você)

### 1. Divergência de convenção de RLS (importante)

Existem **três** convenções de isolamento por tenant convivendo nas migrations:

| Convenção | Onde | Exemplo |
|---|---|---|
| `get_tenant_id()` (função custom) | 005–009, 015–019 | `USING (tenant_id = get_tenant_id())` |
| `auth.uid()` direto (Supabase Auth) | 002 (DLQ), idempotency legado | `USING (tenant_id = auth.uid())` |
| `(SELECT tenant_id FROM users WHERE id = auth.uid())` | 013, 014 | subquery em `users` |

Isso **não** foi unificado de propósito: mudar o modelo de RLS é decisão arquitetural
(depende de como o app injeta a identidade do tenant no Postgres — via JWT do Supabase
Auth vs. `SET LOCAL` de uma sessão da app). O conteúdo foi preservado **como está aplicado**
para não alterar comportamento. **Decisão necessária:** qual convenção é a oficial? Depois
disso, uma migration de reconciliação de policies pode alinhar as demais.

### 2. `Supabase_Assinaturas/`

Schemas de assinaturas (`01_schema*`, `02_rls*`, `03_usage_triggers`) **não referenciados
por nenhum código** e fora do runner. Provável relação com `apps/backend/billing_enterprise`.
**Decisão necessária:** integrar ao diretório canônico (renumerar 021+) ou manter como
concern separado com runner próprio?

### 3. `supabase-migrations.sql` e `run-migrations.ts` (raiz)

Mantidos como registro histórico/deprecados. Podem ser **removidos** num próximo passo
quando você confirmar que o baseline foi rodado e nada externo depende deles.
