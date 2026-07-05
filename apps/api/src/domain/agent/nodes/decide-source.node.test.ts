import { describe, it, expect, vi } from 'vitest';
import { makeNodeDecideSource } from './decide-source.node';
import { initialState } from '../agent.state';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const nodeDecideSource = makeNodeDecideSource(logger);

function makeState(intent: string, userMessage = 'Minha internet está lenta') {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage }),
    intent,
  } as any;
}

describe('nodeDecideSource', () => {
  it('support_technical → qdrant', async () => {
    const r = await nodeDecideSource(makeState('support_technical'));
    expect(r.dataSource).toBe('qdrant');
    expect(r.steps).toContain('decide_source');
  });

  it('support_billing → supabase', async () => {
    const r = await nodeDecideSource(makeState('support_billing'));
    expect(r.dataSource).toBe('supabase');
  });

  it('intent ambígua → both', async () => {
    const r = await nodeDecideSource(makeState('complaint'));
    expect(r.dataSource).toBe('both');
  });

  it('mensagem conversacional → none', async () => {
    const r = await nodeDecideSource(makeState('other', 'Olá, boa tarde!'));
    expect(r.dataSource).toBe('none');
  });

  it('check_status → supabase', async () => {
    const r = await nodeDecideSource(makeState('check_status'));
    expect(r.dataSource).toBe('supabase');
  });
});
