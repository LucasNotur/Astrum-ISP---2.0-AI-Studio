import { addDays, subDays } from 'date-fns';

export interface InvoiceRecord {
  id: string; // UUID simulado
  tenant_id: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  total: number;
  created_at: string; // Representa temporalidade do cursor
}

// Criando dados mockados distribuídos serialmente em ordem de data decrescente
const MOCK_DB: InvoiceRecord[] = Array.from({ length: 200 }).map((_, i) => ({
  id: `inv_mock_${1000 - i}`,
  tenant_id: 'tenant_mock_1',
  status: i % 2 === 0 ? 'paid' : 'open',
  total: 10000 + i * 150, // cents
  created_at: subDays(new Date(), i).toISOString()
}));

export class InvoiceRepository {
  /**
   * Padrão Paginação Baseada em Cursor
   * @param limit Limite de registros (max 100)
   * @param cursor Cursor codificado em base64 (geralmente aponta para o ID ou timestamp do último registro visitado)
   * @param status Opcional para filtragem
   */
  async getInvoicesWithCursor(tenantId: string, limit: number, cursor?: string, status?: string) {
    let dataset = MOCK_DB.filter(x => x.tenant_id === tenantId);
    
    if (status) {
      dataset = dataset.filter(x => x.status === status);
    }
    
    // Sort Decrescente (Mais novas primeiro)
    dataset.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let startIndex = 0;
    if (cursor) {
      // Decode Base64 Cursor -> encontra posição no dataset real
      const decodedCursorInfo = Buffer.from(cursor, 'base64').toString('ascii');
      const lastSeenId = decodedCursorInfo.split('_').pop();
      const cursorIndex = dataset.findIndex(x => x.id === `inv_mock_${lastSeenId}`);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1; // Pega após o cursor
      }
    }

    const paginatedItems = dataset.slice(startIndex, startIndex + limit);
    
    const hasMore = (startIndex + limit) < dataset.length;
    let nextCursor = null;

    if (hasMore && paginatedItems.length > 0) {
      const lastItem = paginatedItems[paginatedItems.length - 1];
      // Codifica o ID no cursor
      nextCursor = Buffer.from(`InvCursor_${lastItem.id.replace('inv_mock_', '')}`).toString('base64');
    }

    return {
      data: paginatedItems,
      pagination: {
        has_more: hasMore,
        next_cursor: nextCursor
      }
    };
  }
}
