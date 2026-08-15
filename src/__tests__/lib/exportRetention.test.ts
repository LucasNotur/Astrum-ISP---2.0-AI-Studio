import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/supabaseAdmin', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));

import { purgeExpiredExports } from '../../lib/exportRetention';
import { supabaseAdmin } from '../../lib/supabaseAdmin';

// Controla storage.from por teste.
function mockStorage(files: Array<{ name: string }>, removeResult: any = { error: null }) {
  const list = vi.fn().mockResolvedValue({ data: files, error: null });
  const remove = vi.fn().mockResolvedValue(removeResult);
  (supabaseAdmin.storage.from as any).mockReturnValue({ list, remove });
  return { list, remove };
}

describe('purgeExpiredExports (LGPD-01)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remove só os ZIPs vencidos (>72h), mantém os recentes', async () => {
    const now = Date.now();
    const oldTs = now - 100 * 3600 * 1000; // 100h → vencido
    const freshTs = now - 1 * 3600 * 1000; // 1h → válido
    const { remove } = mockStorage([
      { name: `data_export_${oldTs}.zip` },
      { name: `data_export_${freshTs}.zip` },
    ]);

    const n = await purgeExpiredExports('tenant-1');

    expect(n).toBe(1);
    expect(remove).toHaveBeenCalledWith([`exports/tenant-1/data_export_${oldTs}.zip`]);
  });

  it('nada vencido → não chama remove', async () => {
    const now = Date.now();
    const { remove } = mockStorage([{ name: `data_export_${now}.zip` }]);
    const n = await purgeExpiredExports('tenant-1');
    expect(n).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('ignora arquivos que não são export (nome fora do padrão)', async () => {
    const { remove } = mockStorage([{ name: 'outro-arquivo.txt' }, { name: 'data_export_naoNumero.zip' }]);
    const n = await purgeExpiredExports('tenant-1');
    expect(n).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('erro no list → 0 sem lançar', async () => {
    (supabaseAdmin.storage.from as any).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
      remove: vi.fn(),
    });
    await expect(purgeExpiredExports('tenant-1')).resolves.toBe(0);
  });
});
