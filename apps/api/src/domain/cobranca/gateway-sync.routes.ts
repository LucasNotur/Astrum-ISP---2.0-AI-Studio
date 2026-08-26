import type { FastifyInstance } from 'fastify';
import { getTenantId } from '../../lib/jwt-claims';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { decryptCredentials } from '../../adapters/erp/credential-cipher';
import { AsaasAdapter, type AsaasCredentials, type AsaasCharge } from '../../adapters/gateway/asaas.adapter';
import { syncAsaasInvoices, type AsaasSyncPorts, type InvoiceUpsertRow } from './asaas-sync.service';

/** Ports Supabase para o sync Asaas → invoices. */
function makeAsaasSyncPorts(): AsaasSyncPorts {
  return {
    async listCharges(tenantId: string): Promise<AsaasCharge[]> {
      const { data: cred, error } = await supabase
        .from('tenant_erp_credentials')
        .select('credentials_encrypted')
        .eq('tenant_id', tenantId)
        .eq('provider', 'asaas')
        .maybeSingle();
      if (error) {
        infraLogger.error({ tenantId, err: error }, 'F6-02: falha ao consultar tenant_erp_credentials para sync Asaas');
        throw new Error(`falha ao consultar credenciais Asaas: ${error.message ?? error}`);
      }
      if (!cred?.credentials_encrypted) return [];
      const creds = decryptCredentials<AsaasCredentials>(cred.credentials_encrypted);
      const adapter = new AsaasAdapter(creds);
      return adapter.listCharges(); // todos os status (paid/overdue/pending)
    },

    async resolveCustomerId(tenantId: string, customerExternalId: string): Promise<string | null> {
      if (!customerExternalId) return null;
      // Cliente precisa existir (importado via ERP/planilha). Casa por legacy_id.
      const { data, error } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('legacy_id', customerExternalId)
        .maybeSingle();
      if (error) {
        infraLogger.error({ tenantId, customerExternalId, err: error }, 'F6-02: falha ao resolver customer_id para sync Asaas');
        throw new Error(`falha ao resolver cliente ${customerExternalId}: ${error.message ?? error}`);
      }
      return (data as any)?.id ?? null;
    },

    async upsertInvoice(row: InvoiceUpsertRow): Promise<'inserted' | 'updated'> {
      const { data: existing, error: selectErr } = await supabase
        .from('invoices')
        .select('id')
        .eq('tenant_id', row.tenant_id)
        .eq('external_id', row.external_id)
        .maybeSingle();
      if (selectErr) {
        infraLogger.error({ tenantId: row.tenant_id, externalId: row.external_id, err: selectErr }, 'F6-02: falha ao verificar invoice existente para sync Asaas');
        throw new Error(`falha ao verificar invoice ${row.external_id}: ${selectErr.message ?? selectErr}`);
      }

      if (existing?.id) {
        const { error: updateErr } = await supabase.from('invoices').update({
          amount_cents: row.amount_cents, status: row.status, due_date: row.due_date,
          paid_at: row.paid_at, payment_url: row.payment_url, pix_copy_paste: row.pix_copy_paste,
          extra: row.extra,
        }).eq('id', existing.id);
        if (updateErr) {
          infraLogger.error({ tenantId: row.tenant_id, externalId: row.external_id, err: updateErr }, 'F6-02: falha ao atualizar invoice no sync Asaas');
          throw new Error(`falha ao atualizar invoice ${row.external_id}: ${updateErr.message ?? updateErr}`);
        }
        return 'updated';
      }

      const { error: insertErr } = await supabase.from('invoices').insert(row);
      if (insertErr) {
        infraLogger.error({ tenantId: row.tenant_id, externalId: row.external_id, err: insertErr }, 'F6-02: falha ao inserir invoice no sync Asaas');
        throw new Error(`falha ao inserir invoice ${row.external_id}: ${insertErr.message ?? insertErr}`);
      }
      return 'inserted';
    },
  };
}

export async function gatewaySyncRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v2/gateway/asaas/sync — puxa cobranças do Asaas para `invoices`.
   * Requer credenciais do tenant em tenant_erp_credentials (provider='asaas').
   */
  fastify.post('/api/v2/gateway/asaas/sync', {
    onRequest: [fastify.authenticate],
    preHandler: [requirePermission('billing', 'write')],
  }, async (request, reply) => {
    const tenantId = getTenantId((request as any).user) ?? '';
    try {
      const result = await syncAsaasInvoices(tenantId, makeAsaasSyncPorts());
      infraLogger.info({ tenantId, ...result }, 'F6-02: Asaas sync concluído');
      return reply.code(200).send(result);
    } catch (err: any) {
      infraLogger.error({ err, tenantId }, 'F6-02: Asaas sync falhou');
      return reply.code(502).send({ code: 'ASAAS_SYNC_ERROR', message: 'Falha ao sincronizar com o Asaas.' });
    }
  });
}
