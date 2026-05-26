import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isHoliday, fetchAndSaveNationalHolidays, getNextWorkingDay } from '../../lib/holidays';

// --- MOCK FIREBASE ---
const mockDb: Record<string, any> = {};

vi.mock('../../lib/firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn((path: string) => ({
      doc: vi.fn((docId: string) => ({
        get: vi.fn(async () => {
          const val = mockDb[`${path}/${docId}`];
          return {
            exists: !!val,
            data: () => val
          };
        }),
        set: vi.fn(async (data, opts) => {
           mockDb[`${path}/${docId}`] = data;
        })
      })),
      get: vi.fn(async () => {
        // Find all keys starting with this path
        const docs = Object.keys(mockDb)
          .filter(k => k.startsWith(`${path}/`))
          .map(k => ({ data: () => mockDb[k] }));
        return { docs };
      })
    })),
    batch: vi.fn(() => {
        const ops: Function[] = [];
        return {
           set: vi.fn((ref, data) => {
              ops.push(() => ref.set(data));
           }),
           commit: vi.fn(async () => {
              ops.forEach(op => op());
           })
        };
    })
  }
}));

describe('Holidays Logic', () => {
  beforeEach(() => {
     // clear db
     for (const key of Object.keys(mockDb)) {
        delete mockDb[key];
     }
     
     // add base mock data for some tests
     mockDb['holidays/t1/dates/2025-01-01'] = { name: 'Confraternização Universal', type: 'national' };
  });

  it('1. isHoliday(tenantId, 2025-01-01) → true (Confraternização Universal)', async () => {
    const res = await isHoliday('t1', '2025-01-01');
    expect(res).toBe(true);
  });

  it('2. isHoliday(tenantId, 2025-03-17) → false (dia útil comum)', async () => {
    const res = await isHoliday('t1', '2025-03-17');
    expect(res).toBe(false);
  });

  it('3. Feriado municipal cadastrado pelo admin → isHoliday retorna true nessa data', async () => {
    mockDb['holidays/t1/dates/2025-08-15'] = { name: 'Feriado Municipal de Teste', type: 'municipal' };
    const res = await isHoliday('t1', '2025-08-15');
    expect(res).toBe(true);
  });

  it('4. Job de cobrança agendado em feriado → adiado para próximo dia útil', async () => {
    // 2025-01-01 (Quarta-feira) é feriado
    // Próximo dia deve ser 2025-01-02 (Quinta-feira) se não for feriado!
    const resDate = await getNextWorkingDay('t1', '2025-01-01T12:00:00.000Z');
    
    expect(resDate.toISOString()).toContain('2025-01-02');
  });

  it('5. Dois tenants com feriados municipais diferentes → isHoliday independente por tenant', async () => {
    mockDb['holidays/tenantA/dates/2025-10-20'] = { name: 'Feriado Tenant A', type: 'municipal' };
    mockDb['holidays/tenantB/dates/2025-11-20'] = { name: 'Feriado Tenant B', type: 'municipal' };
    
    // For A
    expect(await isHoliday('tenantA', '2025-10-20')).toBe(true);
    expect(await isHoliday('tenantA', '2025-11-20')).toBe(false);
    
    // For B
    expect(await isHoliday('tenantB', '2025-10-20')).toBe(false);
    expect(await isHoliday('tenantB', '2025-11-20')).toBe(true);
  });

  it('6. BrasilAPI indisponível → usa lista hardcoded de feriados nacionais como fallback', async () => {
    // spy on global fetch and mock failure
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
        return {
           ok: false,
           json: async () => ({})
        } as any;
    });

    const holidays = await fetchAndSaveNationalHolidays('t1');
    expect(holidays.length).toBeGreaterThan(0);
    
    // Check if fallback was populated
    const currentYear = new Date().getFullYear();
    const hasNatal = holidays.some(h => h.date.includes(`${currentYear}-12-25`));
    expect(hasNatal).toBe(true);
    
    expect(mockDb[`holidays/t1/dates/${currentYear}-12-25`].name).toBe('Natal');
    
    fetchSpy.mockRestore();
  });
});
