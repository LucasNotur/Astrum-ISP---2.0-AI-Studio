import type { Response } from 'express';
import { logger } from './logger';

/**
 * APPSEC-04 (auditoria 2026-08-10): nunca devolver a mensagem de erro crua ao cliente.
 * Erros do Postgres/db-compat vazam nomes de tabela/coluna e detalhes internos. Logamos
 * o detalhe server-side (com redação de PII pelo logger) e devolvemos uma mensagem genérica.
 */
export function sendServerError(res: Response, err: unknown, event = 'server_error'): void {
  logger.error(event, { error: (err as Error)?.message });
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
