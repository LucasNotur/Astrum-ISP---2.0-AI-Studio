import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportLabeledExamples,
  createRun,
  runFineTunePipeline,
  type FineTunePorts,
} from './isp-br-finetune.service';

const makeDb = (examples: any[] = []) => ({
  from: (table: string) => ({
    select: () => ({
      not: () => ({ order: () => ({ limit: () => ({ data: examples, error: null }) }) }),
    }),
    insert: (row: any) => ({
      select: () => ({
        single: () => ({ data: { id: 'run-1' }, error: null }),
      }),
    }),
    update: (patch: any) => ({
      eq: () => ({ error: null }),
    }),
  }),
} as any);

const makePorts = (overrides: Partial<FineTunePorts> = {}): FineTunePorts => ({
  db: makeDb([
    { input: 'oi', output: 'olá', label: null, source: 'manual' },
    { input: 'ajuda', output: 'claro', label: null, source: 'feedback' },
  ]),
  getBaselineScore: vi.fn().mockResolvedValue(0.75),
  submitFineTuneJob: vi.fn().mockResolvedValue('job-abc'),
  pollJobStatus: vi.fn().mockResolvedValue({ status: 'succeeded', model: 'ft:gpt-4o-mini:abc' }),
  ...overrides,
});

describe('D-10 exportLabeledExamples', () => {
  it('formata JSONL corretamente', async () => {
    const db = makeDb([{ input: 'oi', output: 'olá', source: 'manual' }]);
    const { jsonl, count } = await exportLabeledExamples(null, db);
    expect(count).toBe(1);
    const line = JSON.parse(jsonl);
    expect(line.messages[1].content).toBe('oi');
    expect(line.messages[2].content).toBe('olá');
  });

  it('filtra exemplos sem output', async () => {
    const db = makeDb([
      { input: 'ok', output: null, source: 'manual' },
      { input: 'bom', output: 'sim', source: 'feedback' },
    ]);
    const { count } = await exportLabeledExamples(null, db);
    expect(count).toBe(1);
  });
});

describe('D-10 runFineTunePipeline', () => {
  it('falha se exemplos insuficientes', async () => {
    const ports = makePorts({
      db: makeDb([{ input: 'x', output: 'y', source: 'manual' }]),
    });
    const result = await runFineTunePipeline(null, { minExamples: 5 }, ports);
    expect(result.status).toBe('failed');
    expect(result.promoted).toBe(false);
  });

  it('promove se eval melhora', async () => {
    let callCount = 0;
    const ports = makePorts({
      db: makeDb(Array.from({ length: 10 }, (_, i) => ({
        input: `q${i}`, output: `a${i}`, source: 'manual',
      }))),
      getBaselineScore: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? 0.70 : 0.80; // antes 70%, depois 80%
      }),
    });
    const result = await runFineTunePipeline(null, { minExamples: 5, pollDelayMs: 0 }, ports);
    expect(result.promoted).toBe(true);
    expect(result.fineTunedModel).toBe('ft:gpt-4o-mini:abc');
  });

  it('não promove se eval piora', async () => {
    let callCount = 0;
    const ports = makePorts({
      db: makeDb(Array.from({ length: 10 }, (_, i) => ({
        input: `q${i}`, output: `a${i}`, source: 'manual',
      }))),
      getBaselineScore: vi.fn().mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? 0.80 : 0.70; // piora
      }),
    });
    const result = await runFineTunePipeline(null, { minExamples: 5, pollDelayMs: 0 }, ports);
    expect(result.promoted).toBe(false);
  });
});
