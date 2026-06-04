import { Webhook, WebhookRequiredHeaders } from 'svix';
import { Svix } from 'svix';
import { supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Svix — Outbound Webhooks
 *
 * BLOCO 7 — Webhooks gerenciados para ISPs clientes
 *
 * DIFERENÇA dos webhooks já implementados (inbound HMAC):
 * - Inbound: Evolution API/ISP envia → Astrum verifica HMAC → processa
 * - Outbound (Svix): Astrum envia → ISP recebe em sua URL configurada
 *
 * O QUE SVIX ENTREGA:
 * - Retry automático com backoff exponencial (72h de tentativas)
 * - Portal do ISP para ver histórico de webhooks
 * - Assinatura HMAC automática em cada entrega
 * - Dashboard de falhas e reentregas manuais
 *
 * EVENTOS OUTBOUND:
 * - invoice.paid       → ISP pode liberar acesso imediatamente
 * - invoice.overdue    → ISP pode acionar sistema de cobrança próprio
 * - ticket.created     → ISP integra com helpdesk próprio
 * - ticket.resolved    → ISP atualiza portal do cliente
 * - customer.suspended → ISP pode atualizar sistemas legados (IXC/SGP)
 * - customer.activated → ISP confirma reativação nos sistemas legados
 */

const svix = new Svix(process.env.SVIX_API_KEY ?? '');

// ─── Tipos de eventos ─────────────────────────────────────────────────────────

export type SvixEventType =
  | 'invoice.paid'
  | 'invoice.overdue'
  | 'invoice.cancelled'
  | 'ticket.created'
  | 'ticket.resolved'
  | 'ticket.escalated'
  | 'customer.suspended'
  | 'customer.activated'
  | 'cobrai.message_sent'
  | 'ai.resolution_failed';

interface SvixEventPayload {
  tenantId: string;
  eventType: SvixEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SvixService {

  /**
   * Envia evento outbound para todos os endpoints configurados pelo tenant.
   * Svix gerencia retries automaticamente.
   */
  async send(
    tenantId: string,
    eventType: SvixEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Verificar se tenant tem Svix configurado
    const appId = await this._getOrCreateApp(tenantId);

    const payload: SvixEventPayload = {
      tenantId,
      eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      await svix.message.create(appId, {
        eventType,
        payload,
        // Svix assina automaticamente com HMAC
      });

      infraLogger.info({ tenantId, eventType, appId }, 'Svix webhook sent');

      // Registrar no audit log
      await supabase.from('webhook_deliveries').insert({
        tenant_id: tenantId,
        event_type: eventType,
        payload,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

    } catch (err) {
      infraLogger.error({ err, tenantId, eventType }, 'Svix webhook failed');
      // Não relançar — Svix já faz retry automaticamente
    }
  }

  /**
   * Cria ou recupera o app Svix do tenant.
   * Cada tenant tem seu app isolado no Svix.
   */
  private async _getOrCreateApp(tenantId: string): Promise<string> {
    // Verificar cache no Supabase
    const { data: tenant } = await supabase
      .from('tenants')
      .select('svix_app_id')
      .eq('id', tenantId)
      .single();

    if (tenant?.svix_app_id) return tenant.svix_app_id;

    // Criar app no Svix
    const app = await svix.application.create({
      name: `Astrum ISP — ${tenantId}`,
      uid: tenantId, // uid único por tenant
    });

    // Persistir app_id
    await supabase
      .from('tenants')
      .update({ svix_app_id: app.id })
      .eq('id', tenantId);

    infraLogger.info({ tenantId, appId: app.id }, 'Svix app created for tenant');
    return app.id;
  }

  /**
   * Gerar URL do portal Svix para o painel do ISP.
   * O ISP vê histórico de webhooks e pode reenviar manualmente.
   */
  async getDashboardUrl(tenantId: string): Promise<string> {
    const appId = await this._getOrCreateApp(tenantId);
    const access = await svix.authentication.appPortalAccess(appId, {
      featureFlags: [],
    });
    return access.url;
  }

  /**
   * Registrar endpoint webhook do ISP.
   * Chamado quando o ISP configura uma URL no painel.
   */
  async addEndpoint(
    tenantId: string,
    url: string,
    eventTypes: SvixEventType[],
  ): Promise<string> {
    const appId = await this._getOrCreateApp(tenantId);

    const endpoint = await svix.endpoint.create(appId, {
      url,
      version: 1,
      filterTypes: eventTypes,
    });

    infraLogger.info({ tenantId, url, eventTypes }, 'Svix endpoint registered');
    return endpoint.id;
  }

  /**
   * Remover endpoint webhook do ISP.
   */
  async removeEndpoint(tenantId: string, endpointId: string): Promise<void> {
    const appId = await this._getOrCreateApp(tenantId);
    await svix.endpoint.delete(appId, endpointId);
  }

  /**
   * Listar endpoints configurados pelo tenant.
   */
  async listEndpoints(tenantId: string) {
    const appId = await this._getOrCreateApp(tenantId);
    return svix.endpoint.list(appId);
  }
}

export const svixService = new SvixService();

// ─── Helpers de publicação por domínio ───────────────────────────────────────

export const svixEvents = {
  invoicePaid: (tenantId: string, invoice: Record<string, unknown>) =>
    svixService.send(tenantId, 'invoice.paid', invoice),

  invoiceOverdue: (tenantId: string, invoice: Record<string, unknown>) =>
    svixService.send(tenantId, 'invoice.overdue', invoice),

  ticketCreated: (tenantId: string, ticket: Record<string, unknown>) =>
    svixService.send(tenantId, 'ticket.created', ticket),

  ticketResolved: (tenantId: string, ticket: Record<string, unknown>) =>
    svixService.send(tenantId, 'ticket.resolved', ticket),

  customerSuspended: (tenantId: string, customer: Record<string, unknown>) =>
    svixService.send(tenantId, 'customer.suspended', customer),

  customerActivated: (tenantId: string, customer: Record<string, unknown>) =>
    svixService.send(tenantId, 'customer.activated', customer),
};
