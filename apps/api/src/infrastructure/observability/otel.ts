/**
 * IA-32 — OpenTelemetry (boot condicional do SDK).
 *
 * DECISÕES REGISTRADAS:
 *  - Instrumentação MANUAL (sem auto-instrument): LangGraph JS não tem
 *    instrumentação oficial estável. Cobrimos os 12 nós do grafo + 4
 *    chamadas LLM via `withSpan` (ver otel-span.helper.ts).
 *  - Import DINÂMICO do SDK: com OTEL_ENABLED=false o módulo
 *    `@opentelemetry/sdk-node` nem é carregado (não polui o boot, não
 *    instala span processors na API global).
 *  - Fail-open: erros do exporter são throttled (1x/min) e NUNCA
 *    derrubam a mensagem. Rastreados em `getOtelState().lastError`
 *    para inspeção via rota `/api/v2/ia/otel/status`.
 *
 * ENV:
 *  - OTEL_ENABLED ('true' liga; default off)
 *  - OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318/v1/traces)
 *  - OTEL_SERVICE_NAME (default 'astrum-api')
 */

import { infraLogger } from '../logging/logger';

export interface OtelState {
  enabled: boolean;
  endpoint: string | null;
  endpointMasked: string | null;
  serviceName: string | null;
  spansInSession: number;
  lastError: string | null;
  exporterHealthy: boolean;
  lastWarnAt: number | null;
  startedAt: string | null;
}

const WARN_THROTTLE_MS = 60_000;

const state: OtelState = {
  enabled: false,
  endpoint: null,
  endpointMasked: null,
  serviceName: null,
  spansInSession: 0,
  lastError: null,
  exporterHealthy: true,
  lastWarnAt: null,
  startedAt: null,
};

let _sdk: { shutdown: () => Promise<void> } | null = null;
let _exporter: { export: (...args: any[]) => void; shutdown: () => Promise<void> } | null = null;

export function getOtelState(): Readonly<OtelState> {
  return { ...state };
}

export function isOtelEnabled(): boolean {
  return state.enabled;
}

/** Para testes: zera o estado interno. NÃO usar em produção. */
export function _resetOtelState(): void {
  state.enabled = false;
  state.endpoint = null;
  state.endpointMasked = null;
  state.serviceName = null;
  state.spansInSession = 0;
  state.lastError = null;
  state.exporterHealthy = true;
  state.lastWarnAt = null;
  state.startedAt = null;
  _sdk = null;
  _exporter = null;
}

/** Mascara a porta (e path) do endpoint para não vazar infra na rota /status. */
function maskEndpoint(endpoint: string): string {
  try {
    const u = new URL(endpoint);
    return `${u.protocol}//${u.hostname}:****${u.pathname}`;
  } catch {
    return 'invalid-endpoint';
  }
}

/**
 * Carregamento dinâmico do SDK. Encapsulado em uma função para
 * permitir spy em testes ("zero import do SDK" com flag off).
 */
export async function _loadOtelSdk(): Promise<{
  NodeSDK: any;
  OTLPTraceExporter: any;
}> {
  const sdkMod: any = await import('@opentelemetry/sdk-node');
  const exporterMod: any = await import('@opentelemetry/exporter-trace-otlp-http');
  return {
    NodeSDK: sdkMod.NodeSDK,
    OTLPTraceExporter: exporterMod.OTLPTraceExporter,
  };
}

/**
 * Boot do SDK. Idempotente — segunda chamada é no-op.
 * Fail-open: nunca lança; em caso de erro apenas marca `state.lastError`.
 */
export async function initOtel(): Promise<void> {
  if (state.enabled) return;

  if ((process.env.OTEL_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    infraLogger.info('OTel: OTEL_ENABLED=false — SDK não carregado (instrumentação manual segue no-op)');
    return;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || 'http://localhost:4318/v1/traces';
  const serviceName = process.env.OTEL_SERVICE_NAME?.trim() || 'astrum-api';

  try {
    const { NodeSDK, OTLPTraceExporter } = await _loadOtelSdk();

    const exporter = new OTLPTraceExporter({ url: endpoint });
    _exporter = exporter;

    const originalExport = exporter.export.bind(exporter);
    exporter.export = (spans: any[], cb: any) => {
      state.spansInSession += spans.length;
      try {
        originalExport(spans, (result: any) => {
          if (result && typeof result.code === 'number' && result.code !== 0) {
            handleExporterError(new Error(result.error?.message ?? 'OTLP export failed'));
          } else {
            state.exporterHealthy = true;
          }
          // Sempre chama o callback com success (fail-open): se a rede cair,
          // o BatchSpanProcessor do SDK NÃO derruba a app.
          if (cb) cb(result && result.code === 0 ? result : { code: 0 });
        });
      } catch (err) {
        handleExporterError(err);
        if (cb) cb({ code: 0 });
      }
    };

    const sdk = new NodeSDK({
      traceExporter: exporter,
      serviceName,
    });
    sdk.start();
    _sdk = sdk;

    state.enabled = true;
    state.endpoint = endpoint;
    state.endpointMasked = maskEndpoint(endpoint);
    state.serviceName = serviceName;
    state.exporterHealthy = true;
    state.startedAt = new Date().toISOString();
    state.lastError = null;

    infraLogger.info({ endpoint: state.endpointMasked, serviceName }, 'OTel: SDK iniciado (instrumentação manual ativa)');
  } catch (err) {
    state.enabled = false;
    state.lastError = err instanceof Error ? err.message : String(err);
    state.exporterHealthy = false;
    infraLogger.warn({ err }, 'OTel: falhou ao iniciar SDK — continuando sem tracing (fail-open)');
  }
}

/** Throttle: 1 warn/min no máximo para não inundar o log se o collector estiver fora. */
function handleExporterError(err: unknown): void {
  state.exporterHealthy = false;
  state.lastError = err instanceof Error ? err.message : String(err);
  const now = Date.now();
  if (state.lastWarnAt === null || now - state.lastWarnAt >= WARN_THROTTLE_MS) {
    state.lastWarnAt = now;
    infraLogger.warn({ err, spansInSession: state.spansInSession }, 'OTel: exporter falhou (throttled 1x/min)');
  }
}

/** Encerramento gracioso — usado no shutdown do Fastify. */
export async function shutdownOtel(): Promise<void> {
  if (_sdk) {
    try {
      await _sdk.shutdown();
    } catch (err) {
      infraLogger.warn({ err }, 'OTel: erro no shutdown');
    }
    _sdk = null;
  }
  _exporter = null;
  state.enabled = false;
}
