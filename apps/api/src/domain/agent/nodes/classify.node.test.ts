import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeClassify } from './classify.node';
import { initialState } from '../agent.state';

const mockClassifyIntent = vi.fn();
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({ upsert: upsertMock }));

const db = { from: fromMock } as any;

function makeNodeClassifyWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.DRIFT_DETECTION_ENABLED;
  else process.env.DRIFT_DETECTION_ENABLED = flag;
  return makeNodeClassify({ ai: { classifyIntent: mockClassifyIntent }, logger, db });
}

function makeState(userMessage = 'Minha internet está lenta') {
  return initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage }) as any;
}

describe('nodeClassify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DRIFT_DETECTION_ENABLED;
  });

  it('mapeia retorno do service para o estado do agente', async () => {
    process.env.DRIFT_DETECTION_ENABLED = 'false';
    mockClassifyIntent.mockResolvedValue({
      intent: 'support_technical',
      urgency: 'high',
      sentiment: 'frustrated',
    });

    const node = makeNodeClassifyWith('false');
    const r = await node(makeState('Minha internet caiu há 3 horas!'));
    expect(r.intent).toBe('support_technical');
    expect(r.urgency).toBe('high');
    expect(r.sentiment).toBe('frustrated');
    expect(r.steps).toContain('classify');
  });

  it('passa userMessage e tenantId corretamente para o service', async () => {
    process.env.DRIFT_DETECTION_ENABLED = 'false';
    mockClassifyIntent.mockResolvedValue({ intent: 'other', urgency: 'low', sentiment: 'neutral' });

    const node = makeNodeClassifyWith('false');
    const state = initialState({ tenantId: 'tenant-ABC', customerId: 'c1', conversationId: 'c1', userMessage: 'Olá' }) as any;
    await node(state);

    expect(mockClassifyIntent).toHaveBeenCalledWith('Olá', '', 'tenant-ABC');
  });

  it('intent support_billing retornado corretamente', async () => {
    process.env.DRIFT_DETECTION_ENABLED = 'false';
    mockClassifyIntent.mockResolvedValue({ intent: 'support_billing', urgency: 'normal', sentiment: 'neutral' });

    const node = makeNodeClassifyWith('false');
    const r = await node(makeState('Preciso da 2ª via da minha fatura'));
    expect(r.intent).toBe('support_billing');
  });

  describe('IA-33 — drift upsert fire-and-forget', () => {
    it('DRIFT_DETECTION_ENABLED=true → chama db.from(ai_intent_daily).upsert(...)', async () => {
      process.env.DRIFT_DETECTION_ENABLED = 'true';
      mockClassifyIntent.mockResolvedValue({
        intent: 'support_technical',
        urgency: 'high',
        sentiment: 'frustrated',
      });
      upsertMock.mockReturnValue(Promise.resolve({ data: null, error: null }));

      const node = makeNodeClassifyWith('true');
      const state = initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'c1', userMessage: 'oi' }) as any;
      await node(state);

      expect(fromMock).toHaveBeenCalledWith('ai_intent_daily');
      expect(upsertMock).toHaveBeenCalledTimes(1);
      const [row, opts] = upsertMock.mock.calls[0];
      expect(row.tenant_id).toBe('t1');
      expect(row.intent).toBe('support_technical');
      expect(row.sentiment).toBe('frustrated');
      expect(row.count).toBe(1);
      expect(typeof row.day).toBe('string');
      expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(opts).toEqual({ onConflict: 'tenant_id,day,intent,sentiment' });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('DRIFT_DETECTION_ENABLED=true com sentiment ausente → grava sentiment=null', async () => {
      process.env.DRIFT_DETECTION_ENABLED = 'true';
      mockClassifyIntent.mockResolvedValue({ intent: 'other', urgency: 'low', sentiment: undefined as any });
      upsertMock.mockReturnValue(Promise.resolve({ data: null, error: null }));

      const node = makeNodeClassifyWith('true');
      const state = initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'c1', userMessage: 'oi' }) as any;
      await node(state);

      expect(upsertMock).toHaveBeenCalledTimes(1);
      const [row] = upsertMock.mock.calls[0];
      expect(row.sentiment).toBeNull();
    });

    it('DRIFT_DETECTION_ENABLED=true e upsert falha → logger.warn e o nó retorna normalmente', async () => {
      process.env.DRIFT_DETECTION_ENABLED = 'true';
      mockClassifyIntent.mockResolvedValue({ intent: 'other', urgency: 'low', sentiment: 'neutral' });
      upsertMock.mockReturnValue(Promise.reject(new Error('db down')));

      const node = makeNodeClassifyWith('true');
      const state = initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'c1', userMessage: 'oi' }) as any;
      // Não deve lançar
      const r = await node(state);
      expect(r.intent).toBe('other');

      // Espera o microtask drenar
      await new Promise((res) => setImmediate(res));
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), tenantId: 't1', intent: 'other' }),
        'drift-upsert-failed',
      );
    });

    it('DRIFT_DETECTION_ENABLED=false → ZERO write novo (from NÃO é chamado)', async () => {
      process.env.DRIFT_DETECTION_ENABLED = 'false';
      mockClassifyIntent.mockResolvedValue({
        intent: 'support_technical',
        urgency: 'high',
        sentiment: 'frustrated',
      });

      const node = makeNodeClassifyWith('false');
      const state = initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'c1', userMessage: 'oi' }) as any;
      await node(state);

      expect(fromMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
    });

    it('flag ausente (default) → ZERO write novo', async () => {
      delete process.env.DRIFT_DETECTION_ENABLED;
      mockClassifyIntent.mockResolvedValue({ intent: 'other', urgency: 'low', sentiment: 'neutral' });

      const node = makeNodeClassifyWith(undefined);
      const state = initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'c1', userMessage: 'oi' }) as any;
      await node(state);

      expect(fromMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
    });
  });
});
