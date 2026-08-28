/**
 * Ports reais do synthetic-monitor.worker.ts (packages/queue) — S88 nunca
 * funcionou: createSyntheticMonitorWorker() era chamado sem `ports` em
 * server.ts, então o processor caía no `if (!ports) return` e o job de
 * 15/15min rodava como no-op desde 2026-07-21. Ver migration 125 pro porquê
 * da tabela synthetic_probe_results existir.
 *
 * Sonda via pipeline real de webchat (mesma fila `astrum-messages` +
 * message.worker.ts do WhatsApp, sem custo/efeito colateral de WhatsApp de
 * verdade) contra o tenant sandbox (`tenants.is_sandbox = true`) — hoje só
 * "ISP Demo Astrolândia". Reusa o mesmo protocolo enqueue+long-poll de
 * webchat.routes.ts (fila `astrum-messages` → channel-sender.service.ts
 * grava a resposta em `webchat_response:{sessionId}` no Redis), sem os
 * efeitos colaterais da rota pública (não abre ticket de rastreio — não é
 * atendimento real).
 */
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../database/supabase.client';
import { captureWarning } from './sentry.service';
import { infraLogger } from '../logging/logger';
import type { SyntheticMonitorPorts, ProbeResult } from '../../../../../packages/queue/src/workers/synthetic-monitor.worker';

const REPLY_TIMEOUT_MS = 15000;
const REPLY_POLL_INTERVAL_MS = 500;

export const syntheticMonitorPorts: SyntheticMonitorPorts = {
  async listPilotTenants() {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name')
      .eq('is_sandbox', true);
    if (error) throw error;
    return data ?? [];
  },

  async sendSyntheticMessage(tenantId, message) {
    const start = Date.now();
    const sessionId = `synthetic-probe-${randomUUID()}`;
    const messageId = randomUUID();

    const { messageQueue } = await import('../../../../../packages/queue/src/queues');
    await messageQueue.add(
      'inbound',
      {
        tenantId,
        senderPhone: sessionId,
        messageContent: message,
        channel: 'webchat',
        messageId,
      },
      { jobId: `synthetic-probe:${messageId}` },
    );

    const { redis } = await import('../cache/redis.client');
    const responseKey = `webchat_response:${sessionId}`;
    let response: string | null = null;

    while (Date.now() - start < REPLY_TIMEOUT_MS) {
      const value = await (redis as any).lpop(responseKey);
      if (value) { response = value; break; }
      await new Promise((resolve) => setTimeout(resolve, REPLY_POLL_INTERVAL_MS));
    }

    if (!response) throw new Error(`Sonda sintética: sem resposta em ${REPLY_TIMEOUT_MS}ms`);
    return { response, latencyMs: Date.now() - start };
  },

  async recordProbeResult(result: ProbeResult) {
    const { error } = await supabaseAdmin.from('synthetic_probe_results').insert({
      tenant_id: result.tenantId,
      success: result.success,
      latency_ms: result.latencyMs,
      response: result.response ?? null,
      error: result.error ?? null,
      probed_at: result.timestamp,
    });
    if (error) infraLogger.warn({ err: error, tenantId: result.tenantId }, '[synthetic-monitor] falha ao gravar resultado da sonda');
  },

  async alertOnFailure(tenantId, error) {
    captureWarning(`Sonda sintética falhou (tenant ${tenantId}): ${error}`, {
      source: 'synthetic-monitor',
      tenantId,
      error,
    });
  },
};
