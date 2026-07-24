import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { decryptCredentials } from '../../adapters/erp/credential-cipher';
import { AsaasAdapter, type AsaasCredentials, type AsaasCharge } from '../../adapters/gateway/asaas.adapter';
import { syncAsaasInvoices, type AsaasSyncPorts, type InvoiceUpsertRow } from './asaas-sync.service';

/** Ports Supabase para o sync Asaas → invoices. */
function makeAsaasSyncPorts(): AsaasSyncPorts {
  return {
    async listCharges(tenantId: string): Promise<AsaasCharge[]> {
      const { data: cred } = await supabase
        .from('tenant_erp_credentials')
        .select('credentials_encrypted')
        .eq('tenant_id', tenantId)
        .eq('provider', 'asaas')
        .maybeSingle();
      if (!cred?.credentials_encrypted) return [];
      const creds = decryptCredentials<AsaasCredentials>(cred.credentials_encrypted);
      const adapter = new AsaasAdapter(creds);
      return adapter.listCharges(); // todos os status (paid/overdue/pending)
    },

    async resolveCustomerId(tenantId: string, customerExternalId: string): Promise<string | null> {
      if (!customerExternalId) return null;
      // Cliente precisa existir (importado via ERP/planilha). Casa por legacy_id.
      const { data } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('legacy_id', customerExternalId)
        .maybeSingle();
      return (data as any)?.id ?? null;
    },

    async upsertInvoice(row: InvoiceUpsertRow): Promise<'inserted' | 'updated'> {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('tenant_id', row.tenant_id)
        .eq('external_id', row.external_id)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from('invoices').update({
          amount_cents: row.amount_cents, status: row.status, due_date: row.due_date,
          paid_at: row.paid_at, payment_url: row.payment_url, pix_copy_paste: row.pix_copy_paste,
          extra: row.extra,
        }).eq('id', existing.id);
        return 'updated';
      }

      await supabase.from('invoices').insert(row);
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
    const { tenantId } = (request as any).user;
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
