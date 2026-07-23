/**
 * PLANO I — implementação Supabase dos ports da máquina de estados da OS.
 * Separa a lógica pura (os-lifecycle.service) do I/O, no padrão de ports do projeto.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import {
  type OsLifecyclePorts,
  type OsPhase,
  type OsStatus,
  phaseAfterEvent,
  statusToInitialPhase,
} from './os-lifecycle.service';

export const osLifecyclePorts: OsLifecyclePorts = {
  async getCurrentPhase(tenantId, serviceOrderId): Promise<OsPhase | null> {
    // Fase atual = resultado do último evento; se não houver, deriva do status.
    const { data: lastEvent } = await supabase
      .from('service_order_events')
      .select('event')
      .eq('tenant_id', tenantId)
      .eq('service_order_id', serviceOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastEvent?.event) {
      return phaseAfterEvent(lastEvent.event as any);
    }

    const { data: os } = await supabase
      .from('service_orders')
      .select('status')
      .eq('tenant_id', tenantId)
      .eq('id', serviceOrderId)
      .maybeSingle();

    if (!os) return null;
    return statusToInitialPhase(os.status as OsStatus);
  },

  async recordEvent(input): Promise<void> {
    const { error } = await supabase.from('service_order_events').insert({
      tenant_id: input.tenantId,
      service_order_id: input.serviceOrderId,
      technician_id: input.technicianId,
      event: input.event,
      latitude: input.lat ?? null,
      longitude: input.lng ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      infraLogger.error({ err: error, ...input }, 'PLANO_I: falha ao gravar service_order_events');
      throw new Error('Falha ao registrar evento da OS');
    }
  },

  async updateStatus(tenantId, serviceOrderId, status): Promise<void> {
    const { error } = await supabase
      .from('service_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', serviceOrderId);
    if (error) {
      infraLogger.error({ err: error, serviceOrderId, status }, 'PLANO_I: falha ao atualizar status da OS');
      throw new Error('Falha ao atualizar status da OS');
    }
  },
};
