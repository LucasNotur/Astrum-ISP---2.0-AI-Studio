/**
 * F6-03 — Rota de import de planilha.
 * POST /api/v2/genesis/import-sheet (multipart text/csv no body).
 */
import type { FastifyInstance } from 'fastify';
import { requirePermission } from '../../infrastructure/auth/rbac.middleware';
import { parseCSV, importSheet, type ColumnMapping } from './sheet-import.service';

export async function sheetImportRoutes(app: FastifyInstance) {
  app.post('/api/v2/genesis/import-sheet', {
    preHandler: [app.authenticate, requirePermission('ai_config', 'write')],
  }, async (request, reply) => {
    const { tenantId } = request.user as { tenantId: string };
    const body = (request.body ?? {}) as { csv?: string; mapping?: Partial<ColumnMapping> };

    if (!body.csv || typeof body.csv !== 'string') {
      return reply.code(400).send({ error: 'Campo csv (string) obrigatório' });
    }

    const mapping: ColumnMapping = {
      name: body.mapping?.name ?? 'nome',
      cpf: body.mapping?.cpf ?? 'cpf',
      phone: body.mapping?.phone ?? 'telefone',
      plan: body.mapping?.plan,
      amount: body.mapping?.amount,
      due_day: body.mapping?.due_day,
    };

    const rows = parseCSV(body.csv);
    if (rows.length === 0) {
      return reply.code(422).send({ error: 'Nenhuma linha válida no CSV' });
    }

    const result = await importSheet(tenantId, rows, mapping);
    return reply.code(201).send(result);
  });
}
