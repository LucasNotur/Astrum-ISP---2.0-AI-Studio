import { describe, it, expect } from 'vitest';
import { nodeDecideSource } from './decide-source.node';
import { initialState } from '../agent.state';

function makeState(intent: string, userMessage = 'Minha internet caiu') {
  return { ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage }), intent } as any;
}

describe('nodeDecideSource (Agentic RAG router)', () => {
  it('intent support_technical → qdrant', async () => {
    const r = await nodeDecideSource(makeState('support_technical'));
    expect(r.dataSource).toBe('qdrant');
    expect(r.steps).toContain('decide_source');
  });

  it('intent support_billing → supabase', async () => {
    const r = await nodeDecideSource(makeState('support_billing'));
    expect(r.dataSource).toBe('supabase');
  });

  it('intent check_status → supabase', async () => {
    const r = await nodeDecideSource(makeState('check_status'));
    expect(r.dataSource).toBe('supabase');
  });

  it('intent misto (technical+billing não é possível via enum simples) → fallback both', async () => {
    // Sem intent técnico e sem billing → both por default
    const r = await nodeDecideSource(makeState('complaint'));
    expect(r.dataSource).toBe('both');
  });

  it('mensagem conversacional (oi/olá) com intent other → none', async () => {
    const state = makeState('other', 'Olá, tudo bem?');
    const r = await nodeDecideSource(state);
    expect(r.dataSource).toBe('none');
  });

  it('mensagem técnica não conversacional com intent other → both', async () => {
    const state = makeState('other', 'Problema sério de ping alto no meu link');
    const r = await nodeDecideSource(state);
    // não é conversacional → both
    expect(r.dataSource).toBe('both');
  });

  it('sourceReason sempre preenchido', async () => {
    const r = await nodeDecideSource(makeState('support_technical'));
    expect(typeof r.sourceReason).toBe('string');
    expect((r.sourceReason as string).length).toBeGreaterThan(0);
  });
});
