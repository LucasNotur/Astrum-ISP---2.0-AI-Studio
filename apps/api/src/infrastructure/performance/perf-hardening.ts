/**
 * S97 — Performance hardening: configuração de tuning de filas,
 * recomendações de índices e thresholds de performance. Puro e testável.
 */

export interface QueueTuningConfig {
  name: string;
  concurrency: number;
  maxRetries: number;
  backoffType: 'exponential' | 'fixed';
  backoffDelay: number;
  removeOnComplete: number;
  rateLimitMax?: number;
  rateLimitDuration?: number;
}

export const QUEUE_TUNING: QueueTuningConfig[] = [
  { name: 'astrum:messages', concurrency: 5, maxRetries: 3, backoffType: 'exponential', backoffDelay: 2000, removeOnComplete: 500 },
  { name: 'astrum:cobrai', concurrency: 10, maxRetries: 5, backoffType: 'exponential', backoffDelay: 5000, removeOnComplete: 100, rateLimitMax: 50, rateLimitDuration: 60_000 },
  { name: 'astrum:erp-sync', concurrency: 2, maxRetries: 3, backoffType: 'exponential', backoffDelay: 3000, removeOnComplete: 200 },
  { name: 'astrum:indexing', concurrency: 2, maxRetries: 2, backoffType: 'fixed', backoffDelay: 5000, removeOnComplete: 100 },
  { name: 'astrum:crisis-detector', concurrency: 1, maxRetries: 2, backoffType: 'fixed', backoffDelay: 1000, removeOnComplete: 50 },
  { name: 'astrum:network-telemetry', concurrency: 1, maxRetries: 2, backoffType: 'fixed', backoffDelay: 5000, removeOnComplete: 50 },
  { name: 'astrum:synthetic-monitor', concurrency: 1, maxRetries: 1, backoffType: 'fixed', backoffDelay: 10000, removeOnComplete: 20 },
  { name: 'astrum:batch', concurrency: 1, maxRetries: 2, backoffType: 'exponential', backoffDelay: 10000, removeOnComplete: 10 },
];

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  exists: boolean;
}

export const INDEX_RECOMMENDATIONS: IndexRecommendation[] = [
  { table: 'invoices', columns: ['tenant_id', 'customer_id', 'status'], reason: 'Portal 2ª via: busca faturas abertas por cliente', exists: false },
  { table: 'invoices', columns: ['tenant_id', 'due_date', 'status'], reason: 'CobrAI: lotes de cobranças vencidas por tenant', exists: false },
  { table: 'service_orders', columns: ['tenant_id', 'customer_id', 'status'], reason: 'Portal OS: acompanhamento por cliente', exists: false },
  { table: 'customers', columns: ['tenant_id', 'cpf'], reason: 'Portal auth: lookup por CPF no tenant', exists: false },
  { table: 'messages', columns: ['tenant_id', 'created_at'], reason: 'Janela deslizante de crise: mensagens recentes', exists: true },
  { table: 'tickets', columns: ['tenant_id', 'status', 'created_at'], reason: 'Dashboard: tickets abertos com ordenação', exists: false },
  { table: 'conversations', columns: ['tenant_id', 'customer_id', 'created_at'], reason: 'Histórico: conversas por cliente recentes', exists: false },
];

export interface PerformanceThreshold {
  metric: string;
  target: number;
  unit: string;
  category: 'latency' | 'throughput' | 'quality' | 'cost';
}

export const PERFORMANCE_THRESHOLDS: PerformanceThreshold[] = [
  { metric: 'api_response_p95', target: 1500, unit: 'ms', category: 'latency' },
  { metric: 'webhook_processing_p95', target: 3000, unit: 'ms', category: 'latency' },
  { metric: 'rag_query_p95', target: 2000, unit: 'ms', category: 'latency' },
  { metric: 'lighthouse_performance', target: 85, unit: 'score', category: 'quality' },
  { metric: 'lighthouse_accessibility', target: 90, unit: 'score', category: 'quality' },
  { metric: 'cobrai_batch_throughput', target: 100, unit: 'jobs/min', category: 'throughput' },
  { metric: 'message_worker_throughput', target: 50, unit: 'msgs/min', category: 'throughput' },
  { metric: 'cost_per_conversation_brl', target: 0.15, unit: 'BRL', category: 'cost' },
  { metric: 'autonomous_resolution_rate', target: 0.80, unit: 'ratio', category: 'quality' },
];

export function getMissingIndexes(): IndexRecommendation[] {
  return INDEX_RECOMMENDATIONS.filter((i) => !i.exists);
}

export function generateIndexSQL(rec: IndexRecommendation): string {
  const cols = rec.columns.join('_');
  const name = `idx_${rec.table}_${cols}`;
  return `CREATE INDEX IF NOT EXISTS ${name} ON ${rec.table} (${rec.columns.join(', ')});`;
}

export function generateAllMissingIndexSQL(): string {
  return getMissingIndexes().map(generateIndexSQL).join('\n');
}

export function validateQueueTuning(config: QueueTuningConfig): string[] {
  const errors: string[] = [];
  if (config.concurrency < 1 || config.concurrency > 50) errors.push(`${config.name}: concurrency fora do range 1-50`);
  if (config.maxRetries < 0 || config.maxRetries > 10) errors.push(`${config.name}: maxRetries fora do range 0-10`);
  if (config.removeOnComplete < 1) errors.push(`${config.name}: removeOnComplete deve ser >= 1`);
  if (config.rateLimitMax && config.rateLimitMax < 1) errors.push(`${config.name}: rateLimitMax inválido`);
  return errors;
}
