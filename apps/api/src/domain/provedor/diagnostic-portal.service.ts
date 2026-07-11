/**
 * P4-02 — Diagnóstico self-service do portal do assinante.
 *
 * "Minha internet está lenta" → roda diagnóstico real → retorna resultado →
 * abre OS de visita técnica automaticamente se sinal ruim.
 */
import { ToolsExecutor } from '../../infrastructure/ai/tools.executor';
import { infraLogger } from '../../infrastructure/logging/logger';

export type DiagnosticSignal = 'ok' | 'no_signal' | 'degraded' | 'unknown';

export interface DiagnosticResult {
  signal: DiagnosticSignal;
  latencyMs?: number;
  packetLoss?: number;
  reason?: string;
  simulated: boolean;
  serviceOrderId?: string;    // criado automaticamente se sinal ruim
  serviceOrderCreated: boolean;
  message: string;            // texto amigável para o assinante
}

export interface DiagnosticPortalDeps {
  toolsExecutor?: ToolsExecutor;
  createOsFn?: (args: Record<string, unknown>) => Promise<unknown>;
}

export async function runPortalDiagnostic(
  tenantId: string,
  customerId: string,
  address?: string,
  deps: DiagnosticPortalDeps = {},
): Promise<DiagnosticResult> {
  const executor = deps.toolsExecutor ?? new ToolsExecutor(tenantId);

  let diagnosticRaw: any;
  try {
    diagnosticRaw = await executor.execute('run_diagnostics', { customer_id: customerId });
  } catch (err) {
    infraLogger.warn({ err, tenantId, customerId }, 'Portal: run_diagnostics falhou');
    return {
      signal: 'unknown',
      simulated: true,
      serviceOrderCreated: false,
      message: 'Não foi possível verificar sua conexão agora. Tente novamente em alguns minutos.',
    };
  }

  const signal = mapSignal(diagnosticRaw);

  // Sinal ruim → abre OS de visita técnica automaticamente.
  if (signal === 'no_signal' || signal === 'degraded') {
    try {
      const osResult: any = await executor.execute('schedule_technical_visit', {
        customer_id: customerId,
        reason: `Portal self-service: sinal ${signal} detectado automaticamente.`,
        address: address ?? undefined,
      });

      const soId = osResult?.service_order_id as string | undefined;
      infraLogger.info({ tenantId, customerId, soId, signal }, 'Portal: OS aberta automaticamente');

      return {
        signal,
        latencyMs: diagnosticRaw?.latency_ms,
        packetLoss: diagnosticRaw?.packet_loss,
        reason: diagnosticRaw?.reason,
        simulated: diagnosticRaw?.simulated ?? true,
        serviceOrderId: soId,
        serviceOrderCreated: !!soId,
        message: buildMessage(signal, soId),
      };
    } catch (osErr) {
      infraLogger.warn({ osErr, tenantId, customerId }, 'Portal: criação de OS automática falhou');
      return {
        signal,
        simulated: diagnosticRaw?.simulated ?? true,
        serviceOrderCreated: false,
        message: buildMessage(signal, undefined),
      };
    }
  }

  return {
    signal,
    latencyMs: diagnosticRaw?.latency_ms,
    packetLoss: diagnosticRaw?.packet_loss,
    simulated: diagnosticRaw?.simulated ?? true,
    serviceOrderCreated: false,
    message: buildMessage(signal, undefined),
  };
}

function mapSignal(raw: any): DiagnosticSignal {
  const s = raw?.signal;
  if (s === 'ok') return 'ok';
  if (s === 'no_signal') return 'no_signal';
  if (s === 'degraded') return 'degraded';
  // Heurística: latência alta ou perda de pacotes = degraded.
  if (typeof raw?.latency_ms === 'number' && raw.latency_ms > 150) return 'degraded';
  if (typeof raw?.packet_loss === 'number' && raw.packet_loss > 5) return 'degraded';
  if (raw?.error) return 'unknown';
  return 'unknown';
}

function buildMessage(signal: DiagnosticSignal, serviceOrderId?: string): string {
  switch (signal) {
    case 'ok':
      return 'Sua conexão está funcionando normalmente. Se ainda estiver com problemas, tente reiniciar o roteador.';
    case 'no_signal':
      return serviceOrderId
        ? `Detectamos ausência de sinal na sua conexão e já abrimos uma ordem de serviço (OS #${serviceOrderId}) para um técnico verificar. Entraremos em contato em breve.`
        : 'Detectamos ausência de sinal. Por favor, entre em contato com o suporte para abertura de visita técnica.';
    case 'degraded':
      return serviceOrderId
        ? `Sua conexão está com instabilidade e abrimos uma OS #${serviceOrderId} para análise. Se o problema persistir, nosso técnico já está sendo acionado.`
        : 'Sua conexão está instável. Tente reiniciar o roteador. Se o problema persistir, entre em contato com o suporte.';
    default:
      return 'Não foi possível completar o diagnóstico. Se o problema persistir, entre em contato com o suporte.';
  }
}
