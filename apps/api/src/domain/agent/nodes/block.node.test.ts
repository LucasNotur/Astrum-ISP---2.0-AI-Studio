import { describe, it, expect, vi } from 'vitest';
import { makeNodeBlock } from './block.node';
import { initialState } from '../agent.state';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const nodeBlock = makeNodeBlock(logger);

describe('nodeBlock', () => {
  it('retorna mensagem de bloqueio padrão', async () => {
    const state = {
      ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'msg' }),
      guardReason: 'Injection detectada: ignore_instructions',
    } as any;
    const r = await nodeBlock(state);
    expect(r.response).toBeTruthy();
    expect(typeof r.response).toBe('string');
  });

  it('adiciona "block" ao array de steps', async () => {
    const state = {
      ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'msg' }),
    } as any;
    const r = await nodeBlock(state);
    expect(r.steps).toContain('block');
  });

  it('não expõe o motivo do bloqueio ao cliente', async () => {
    const state = {
      ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'msg' }),
      guardReason: 'Injection: dan_jailbreak',
    } as any;
    const r = await nodeBlock(state);
    expect(r.response).not.toContain('dan_jailbreak');
    expect(r.response).not.toContain('Injection');
  });
});
