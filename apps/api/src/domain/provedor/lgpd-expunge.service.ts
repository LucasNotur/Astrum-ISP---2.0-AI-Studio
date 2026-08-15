/**
 * LGPD Art. 18 (direito ao apagamento) — expurgo de dados de um cliente por e-mail.
 *
 * ESTRATÉGIA: **anonimizar, não deletar.** Deletar a linha do cliente violaria a
 * retenção FISCAL (invoices/service_orders devem ser mantidos ~5 anos — ver
 * `data-retention.service.ts`) e quebraria integridade referencial (FKs). A LGPD é
 * atendida REMOVENDO a PII (nome, e-mail, CPF, telefone, endereço, conteúdo de
 * mensagens) e preservando o registro estrutural anonimizado. Isso é o padrão para
 * obrigações legais concorrentes (LGPD Art. 16, II).
 *
 * SEGURANÇA: roda dentro de uma transação JÁ escopada por tenant (`withTenantRLS`),
 * então a RLS `tenant_own_*` garante que só o tenant dono é afetado (um bug no filtro
 * não vaza para outro tenant — a RLS nega). O `client` é o `PoolClient` dessa transação.
 *
 * O registro de AUDITORIA (`audit_log`) é gravado SEPARADAMENTE pela rota via
 * `supabaseAdmin` (service_role), porque a policy do `audit_log` só aceita insert de
 * super_admin/service_role, não do role `authenticated` da transação RLS.
 */

import { zepMemoryService } from '../../infrastructure/memory/zep.service';
import { deleteCustomerPoints } from '../../adapters/vector/qdrant.adapter';
import { securityLogger } from '../../infrastructure/logging/logger';

export const LGPD_REDACTED = '[REMOVIDO — LGPD]';

export interface DbClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

/**
 * Anonimiza toda a PII do(s) cliente(s) com o e-mail dado, no tenant informado.
 * Retorna os IDs de cliente afetados (vazio se nenhum e-mail bateu).
 */
export async function anonymizeCustomerByEmail(
  client: DbClient,
  tenantId: string,
  email: string,
): Promise<string[]> {
  const trimmed = email.trim();
  if (!trimmed) return [];

  const found = await client.query(
    `SELECT id FROM customers WHERE tenant_id = $1 AND lower(email) = lower($2)`,
    [tenantId, trimmed],
  );
  const ids: string[] = found.rows.map((r) => r.id);
  if (ids.length === 0) return [];

  // 1) Cliente: zera a PII direta (mantém id/tenant/plan para FK + análise agregada).
  await client.query(
    `UPDATE customers
        SET name = $3, email = NULL, phone = NULL, cpf = NULL, address = NULL
      WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, ids, LGPD_REDACTED],
  );

  // 2) Ordens de serviço: nome/endereço copiados são PII.
  await client.query(
    `UPDATE service_orders
        SET customer_name = $3, address = NULL
      WHERE tenant_id = $1 AND customer_id = ANY($2::uuid[])`,
    [tenantId, ids, LGPD_REDACTED],
  );

  // 3) Mensagens: o conteúdo das conversas do cliente é dado pessoal.
  await client.query(
    `UPDATE messages
        SET content = $3
      WHERE tenant_id = $1
        AND conversation_id IN (
          SELECT id FROM conversations WHERE tenant_id = $1 AND customer_id = ANY($2::uuid[])
        )`,
    [tenantId, ids, LGPD_REDACTED],
  );

  return ids;
}

/**
 * Resultado do expurgo dos armazenamentos de PII que vivem FORA do Postgres.
 * Contadores por store: `ok` (purgado), `failed` (tentou e falhou), `skipped`
 * (store desabilitado — nada a purgar, não é falha).
 */
export interface ExternalPurgeResult {
  zep: { ok: number; failed: number; skipped: number };
  qdrant: { ok: number; failed: number };
}

/**
 * Purga a PII do cliente que vive FORA do Postgres: memória de conversa (Zep)
 * e vetores derivados (Qdrant).
 *
 * ONDE RODA: na ROTA, DEPOIS da anonimização Supabase e FORA da transação RLS.
 * São chamadas de rede — não podem segurar a transação aberta nem, ao falhar,
 * derrubar a anonimização que a lei já exige (essa é a obrigação central e já
 * foi commitada quando chegamos aqui).
 *
 * GARANTIAS:
 *  - best-effort: a falha de um store (ou de um cliente) NÃO impede os demais;
 *  - idempotente: deletar sessão/vetor inexistente é no-op — pode reexecutar;
 *  - tenant-scoped: Zep usa sessão `tenant::customer`, Qdrant a coleção do tenant.
 * Toda falha é logada em `securityLogger` (trilha de segurança).
 */
export async function purgeExternalCustomerData(
  tenantId: string,
  customerIds: string[],
): Promise<ExternalPurgeResult> {
  const result: ExternalPurgeResult = {
    zep: { ok: 0, failed: 0, skipped: 0 },
    qdrant: { ok: 0, failed: 0 },
  };

  for (const customerId of customerIds) {
    // ── Zep: memória de longo prazo (sessão tenant::customer) ──────────────
    if (!zepMemoryService.isEnabled()) {
      result.zep.skipped++;
    } else {
      try {
        const deleted = await zepMemoryService.deleteCustomerMemory(customerId, tenantId);
        if (deleted) result.zep.ok++;
        else result.zep.failed++;
      } catch (err) {
        // deleteCustomerMemory já engole o erro, mas mantemos a rede de segurança.
        result.zep.failed++;
        securityLogger.error(
          { err: (err as Error).message, tenantId, customerId },
          'LGPD expunge: falha ao purgar memória Zep',
        );
      }
    }

    // ── Qdrant: vetores derivados do cliente (idempotente; no-op se vazio) ──
    try {
      await deleteCustomerPoints(tenantId, customerId);
      result.qdrant.ok++;
    } catch (err) {
      result.qdrant.failed++;
      securityLogger.error(
        { err: (err as Error).message, tenantId, customerId },
        'LGPD expunge: falha ao purgar vetores Qdrant',
      );
    }
  }

  return result;
}
