/**
 * ERP Sync Outcome — interpreta o resultado de um push de dados ao ERP. Port do
 * erpSyncWorker (S81). Puro: decide sucesso / retry sem tocar em I/O.
 */

export interface ErpUpdateResult {
  error?: string;
  [k: string]: unknown;
}

export type ErpSyncOutcome =
  | { status: 'ok'; clearPending: true }
  | { status: 'retry'; reason: string };

/**
 * Um resultado com `error` significa falha → retry (BullMQ aplica backoff).
 * Sucesso → limpar sync_pending do cliente.
 */
export function buildErpSyncOutcome(result: ErpUpdateResult | null | undefined): ErpSyncOutcome {
  if (!result) return { status: 'retry', reason: 'no_result' };
  if (result.error) return { status: 'retry', reason: result.error };
  return { status: 'ok', clearPending: true };
}
