/**
 * P1-02 — Notificação proativa de falha em massa.
 * Versão paridade: detecção manual (operador reporta a CTO/região),
 * Astrum busca afetados e envia. O autônomo completo (D-04) fica no PLANO_A.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { sendWhatsAppResponse } from '../../adapters/whatsapp/message-sender.service';

export interface OutageNotifierDb {
  from: (table: string) => any;
}

export const defaultOutageNotifierDb: OutageNotifierDb = supabase as any;

export type NotifySendFn = (params: {
  to: string;
  content: string;
  tenantId: string;
}) => Promise<void>;

export const defaultSendFn: NotifySendFn = ({ to, content, tenantId }) =>
  sendWhatsAppResponse({ to, content, tenantId });

export interface MassOutageInput {
  tenantId: string;
  ctoId?: string;
  message: string;
}

export interface MassOutageResult {
  outageId: string;
  notified: number;
  failed: number;
  totalAffected: number;
}

export async function notifyMassOutage(
  db: OutageNotifierDb,
  send: NotifySendFn,
  input: MassOutageInput,
): Promise<MassOutageResult> {
  const { tenantId, ctoId, message } = input;

  // Busca clientes ativos (filtro por CTO quando informada)
  let q = db
    .from('customers')
    .select('id, phone, whatsapp_number')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(1000);

  if (ctoId) {
    q = q.eq('cto_id', ctoId);
  }

  const { data: customers, error } = await q;

  if (error) {
    infraLogger.error({ tenantId, ctoId, error }, 'outage-notifier: falha ao buscar clientes afetados');
    throw new Error('Não foi possível buscar clientes afetados');
  }

  const affected = customers ?? [];

  // Registra a notificação de falha em massa ANTES de enviar
  const { data: outageRow } = await db
    .from('outage_notifications')
    .insert({
      tenant_id: tenantId,
      cto_id: ctoId ?? null,
      message,
      customer_count: affected.length,
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const outageId: string = outageRow?.id ?? crypto.randomUUID();

  let notified = 0;
  let failed = 0;

  for (const customer of affected) {
    const phone: string | undefined = customer.whatsapp_number ?? customer.phone;
    if (!phone) {
      failed++;
      continue;
    }

    try {
      await send({ to: phone, content: message, tenantId });
      notified++;
    } catch (err) {
      infraLogger.warn(
        { tenantId, customerId: customer.id, err },
        'outage-notifier: falha ao enviar para cliente',
      );
      failed++;
    }
  }

  infraLogger.info(
    { tenantId, ctoId, outageId, notified, failed, total: affected.length },
    'outage-notifier: disparos concluídos',
  );

  return { outageId, notified, failed, totalAffected: affected.length };
}
