import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { atendimentoLogger } from '../../infrastructure/logging/logger';
import { sendMessage } from './whatsapp.adapter';
import type { ConnectionStatus, MultiConnPorts, WhatsAppConnection } from '../../domain/atendimento/multi-connection.service';

/** `tenant_evolution_instances.status` usa o vocabulário do webhook Evolution
 *  (open/close/connecting/unknown); o Dossiê #58 usa outro vocabulário. Trata
 *  qualquer coisa que não seja 'open' como indisponível (nunca assume saudável). */
function mapDbStatus(dbStatus: string | null | undefined): ConnectionStatus {
  if (dbStatus === 'open') return 'connected';
  if (dbStatus === 'connecting') return 'connecting';
  return 'disconnected';
}

function toConnection(row: any): WhatsAppConnection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    instanceName: row.instance_name,
    phoneNumber: row.phone_number || '',
    status: mapDbStatus(row.status),
    isPrimary: !!row.is_primary,
  };
}

/**
 * Adapter real do MultiConnPorts (Dossiê #58) sobre `tenant_evolution_instances`
 * + o adapter de envio existente (`whatsapp.adapter.ts`). `evolutionUrl`/
 * `evolutionApiKey` já vêm resolvidos pelo chamador (BYOK do tenant,
 * `resolveTenantKeys`) — evita resolver de novo por connectionId.
 *
 * `preferredInstance` (a instância que recebeu a mensagem original, quando
 * houver) sobrepõe `isPrimary` só nesta decisão de roteamento — não grava
 * nada no banco. É assim que uma resposta continua saindo pelo MESMO número
 * que o cliente usou (decisão de produto 2026-08-27) enquanto esse número
 * estiver saudável; se não estiver, `findConnectionForPhone` (chamado por
 * `sendViaAvailableConnection`) cai pro roteamento por DDD/primária real.
 */
export function makeMultiConnPorts(
  tenantId: string,
  evolutionUrl: string,
  evolutionApiKey: string,
  preferredInstance?: string,
): MultiConnPorts {
  return {
    async listConnections() {
      const { data } = await supabaseAdmin
        .from('tenant_evolution_instances')
        .select('*')
        .eq('tenant_id', tenantId);
      const connections = (data ?? []).map(toConnection);
      if (!preferredInstance) return connections;
      return connections.map((c) => ({ ...c, isPrimary: c.instanceName === preferredInstance }));
    },

    async getConnection(_tenantId, connectionId) {
      const { data } = await supabaseAdmin
        .from('tenant_evolution_instances')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', connectionId)
        .maybeSingle();
      return data ? toConnection(data) : null;
    },

    async updateStatus(connectionId, status, error) {
      // Não sobrescreve o `status` real (fonte da verdade é o webhook de
      // connection.update) com base numa falha pontual de envio — 1 timeout
      // não significa que o número caiu. Só registra pra observabilidade.
      atendimentoLogger.warn(
        { tenantId, connectionId, status, error },
        '[multi-connection] falha de envio numa conexão — failover acionado',
      );
    },

    async routeMessage(connectionId, phone, message) {
      const { data } = await supabaseAdmin
        .from('tenant_evolution_instances')
        .select('instance_name')
        .eq('tenant_id', tenantId)
        .eq('id', connectionId)
        .maybeSingle();
      if (!data?.instance_name) throw new Error('Conexão WhatsApp não encontrada');

      const result = await sendMessage({
        to: phone,
        content: message,
        tenantId,
        instanceName: data.instance_name,
        evolutionUrl,
        evolutionApiKey,
      });
      // O circuit breaker nunca rejeita (breaker.fallback sempre resolve) —
      // sem isso, sendViaAvailableConnection nunca veria a falha pra fazer failover.
      if (result.status === 'fallback') {
        throw new Error('Evolution API indisponível (circuit breaker aberto)');
      }
      return { messageId: result.messageId };
    },
  };
}
