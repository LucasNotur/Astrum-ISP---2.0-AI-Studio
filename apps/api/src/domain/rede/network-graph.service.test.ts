import { describe, it, expect, vi } from 'vitest';
import { impactoCto, reincidencia, capacidade, type NetworkGraphPort } from './network-graph.service';

/**
 * Builder de query encadeável: cada método retorna o builder OU a Promise final
 * quando é o "último elo" da chain. O `expectLastResolve(true)` permite
 * indicar que a PRÓXIMA chamada encerra a chain.
 */
function builder(table: string, finalResult: any = { data: null, error: null }) {
  const b: any = { _table: table, _final: finalResult };
  for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'single']) {
    b[m] = vi.fn(() => b);
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(finalResult));
  b.single = vi.fn(() => Promise.resolve(finalResult));
  // O último elo de uma chain é quando o builder é chamado como função (then).
  b.then = (resolve: any) => Promise.resolve(finalResult).then(resolve);
  return b;
}

function makeDb(plan: Array<{ table: string; result: any; last?: boolean }>): NetworkGraphPort {
  let i = 0;
  return {
    from: (table: string) => {
      const step = plan[i++] ?? { table, result: { data: null, error: null } };
      const b = builder(table, step.result);
      return b;
    },
  } as any;
}

describe('network-graph.service (IA-16)', () => {
  describe('impactoCto', () => {
    it('CTO não encontrada → retorna {error}', async () => {
      const db = makeDb([
        { table: 'network_ctos', result: { data: null, error: { message: 'not found' } } },
      ]);
      const r = await impactoCto(db, 't1', 'cto-x');
      expect(r).toEqual({ error: 'CTO não encontrada' });
    });

    it('soma MRR em CENTAVOS (B4) e lista clientes com mrr_cents', async () => {
      const db = makeDb([
        { table: 'network_ctos', result: { data: { id: 'cto1', name: 'Centro' }, error: null } },
        { table: 'customers', result: {
          data: [
            { id: 'c1', name: 'Maria', plan_id: '100MB', status: 'active', mrr_cents: 9990 },
            { id: 'c2', name: 'João',  plan_id: '200MB', status: 'active', mrr_cents: 14990 },
            { id: 'c3', name: 'Ana',   plan_id: '50MB',  status: 'suspended', mrr_cents: null },
          ],
          error: null,
        } },
        { table: 'tickets', result: { data: null, count: 1, error: null } },
      ]);
      const r = await impactoCto(db, 't1', 'cto1');
      expect(r).toMatchObject({
        cto: { id: 'cto1', name: 'Centro' },
        customers_total: 3,
        customers_with_open_ticket: 1,
        mrr_at_risk_cents: 9990 + 14990 + 0, // null = 0
      });
      expect((r as any).customers).toHaveLength(3);
    });
  });

  describe('reincidencia', () => {
    it('ordena por nº de tickets desc, top 10, classifica risco por quartil', async () => {
      const db = makeDb([
        { table: 'tickets', result: {
          data: [
            { customers: { network_ctos: { id: 'a', name: 'A' } } },
            { customers: { network_ctos: { id: 'a', name: 'A' } } },
            { customers: { network_ctos: { id: 'a', name: 'A' } } },
            { customers: { network_ctos: { id: 'b', name: 'B' } } },
            { customers: { network_ctos: { id: 'c', name: 'C' } } },
            { customers: { network_ctos: { id: 'd', name: 'D' } } },
          ],
          error: null,
        } },
      ]);
      const r = await reincidencia(db, 't1', 30);
      expect(r).toHaveLength(4);
      expect(r[0]).toMatchObject({ cto_id: 'a', tickets: 3, risk: 'critico' }); // max
      expect(r[1].tickets).toBe(1);
      // 1/3 = 0.33 → cai em [0.25, 0.5) → 'medio'
      expect(r[1].risk).toBe('medio');
    });

    it('retorna [] se não há tickets na janela', async () => {
      const db = makeDb([{ table: 'tickets', result: { data: [], error: null } }]);
      const r = await reincidencia(db, 't1', 30);
      expect(r).toEqual([]);
    });
  });

  describe('capacidade', () => {
    it('filtra CTOs > 0.85 e classifica risco pela ocupação', async () => {
      const db = makeDb([
        { table: 'network_ctos', result: {
          data: [
            { id: 'a', name: 'A', total_ports: 16, used_ports: 16 }, // 1.00 critico
            { id: 'b', name: 'B', total_ports: 16, used_ports: 15 }, // 0.9375 alto
            { id: 'c', name: 'C', total_ports: 16, used_ports: 14 }, // 0.875 medio
            { id: 'd', name: 'D', total_ports: 16, used_ports: 8 },  // 0.50 fora
            { id: 'e', name: 'E', total_ports: 0,  used_ports: 0  }, // 0   ignorado
          ],
          error: null,
        } },
      ]);
      const r = await capacidade(db, 't1');
      expect(r).toHaveLength(3);
      expect(r[0].cto_id).toBe('a');
      expect(r[0].risk).toBe('critico');
      expect(r[1].risk).toBe('alto');
      expect(r[2].risk).toBe('medio');
    });
  });
});
