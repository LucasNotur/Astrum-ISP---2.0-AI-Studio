import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocka o `ai` SDK antes de importar o service (singleton do grader na linha 22).
// vi.hoisted garante que a factory do vi.mock enxergue o mock (vitest hoista o mock).
const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock('ai', () => ({ generateObject: generateObjectMock }));
vi.mock('../logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { CragService } from './crag.service';

function makeService() {
  return new CragService();
}

function fakeObjectResult<T>(obj: T) {
  return { object: obj } as any;
}

describe('CragService', () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it('gradeContext: contexto relevante retorna grade=relevant', async () => {
    generateObjectMock.mockResolvedValue(fakeObjectResult({
      grade: 'relevant', confidence: 0.9, missing_info: '',
    }));
    const r = await makeService().gradeContext('Como reinicio o roteador?', 'manual PPPoE…', '', 't1');
    expect(r.grade).toBe('relevant');
    expect(r.confidence).toBe(0.9);
    //.Header Helicone UseCase preservado (RN7).
    const call = generateObjectMock.mock.calls[0][0] as any;
    expect(call.headers['Helicone-Property-UseCase']).toBe('crag-grade');
    expect(call.headers['Helicone-Property-TenantId']).toBe('t1');
    // Sistema deve ser o grader mini (gpt-4o-mini) — RN3: nãoоинamos o modelo na assertion frágil,
    // mas garantimos que generateObject foi chamado 1×.
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it('gradeContext: contexto fora do assunto → irrelevant', async () => {
    generateObjectMock.mockResolvedValue(fakeObjectResult({
      grade: 'irrelevant', confidence: 0.1, missing_info: 'endereço do CTO do cliente',
    }));
    const r = await makeService().gradeContext('qual meu CTO?', 'receita de bolo', '', 't1');
    expect(r.grade).toBe('irrelevant');
    expect(r.missing_info).toContain('CTO');
  });

  it('rewriteQuery: incorpora info que faltou', async () => {
    generateObjectMock.mockResolvedValue(fakeObjectResult({ rewritten: 'CTO do cliente João endereço centro' }));
    const r = await makeService().rewriteQuery('qual meu CTO?', 'endereço do cliente', 't1');
    expect(r).toBe('CTO do cliente João endereço centro');
    const call = generateObjectMock.mock.calls[0][0] as any;
    expect(call.headers['Helicone-Property-UseCase']).toBe('crag-rewrite');
  });

  it('selfCheck: claim sem fonte → grounded=false', async () => {
    generateObjectMock.mockResolvedValue(fakeObjectResult({
      grounded: false, unsupported_claims: ['valor R$ 99'], confidence: 0.2,
    }));
    const r = await makeService().selfCheck('Sua fatura é R$ 99.', 'sem dados de fatura', '', 't1');
    expect(r.grounded).toBe(false);
    expect(r.unsupported_claims).toHaveLength(1);
    const call = generateObjectMock.mock.calls[0][0] as any;
    expect(call.headers['Helicone-Property-UseCase']).toBe('crag-selfcheck');
  });

  it('selfCheck: resposta sustentada → grounded=true', async () => {
    generateObjectMock.mockResolvedValue(fakeObjectResult({
      grounded: true, unsupported_claims: [], confidence: 0.95,
    }));
    const r = await makeService().selfCheck('Reinicie o roteador por 30s.', 'manual: reinicie por 30s', '', 't1');
    expect(r.grounded).toBe(true);
    expect(r.unsupported_claims).toHaveLength(0);
  });

  it('falha do generateObject propaga (fail-open é responsabilidade dos nós, não do service)', async () => {
    generateObjectMock.mockRejectedValue(new Error('openai fora'));
    await expect(makeService().gradeContext('q', 'ctx', '', 't1')).rejects.toThrow('openai fora');
  });
});

// ─── Fail-open via nós ──────────────────────────────────────────────────────
describe('CRAG fail-open através dos nós (grade/rewrite/self-check)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('grade_context no-op quando flag off (short-circuit, 0 chamadas LLM)', async () => {
    vi.stubEnv('CRAG_ENABLED', 'false');
    const { makeNodeGradeContext } = await import('../../domain/agent/nodes/grade-context.node');
    const crag = { gradeContext: vi.fn() };
    const patch = await makeNodeGradeContext({ crag: crag as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any })
      ({ tenantId: 't', customerId: 'c', conversationId: 'cv', userMessage: 'q', steps: [] } as any);
    expect(crag.gradeContext).not.toHaveBeenCalled();
    expect(patch.steps).toContain('grade_context');
  });

  it('grade_context: service lança → nó retorna grade=relevant (fail-open)', async () => {
    vi.stubEnv('CRAG_ENABLED', 'true');
    const { makeNodeGradeContext } = await import('../../domain/agent/nodes/grade-context.node');
    const crag = { gradeContext: vi.fn().mockRejectedValue(new Error('boom')) };
    const patch = await makeNodeGradeContext({ crag: crag as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any })
      ({ tenantId: 't', customerId: 'c', conversationId: 'cv', userMessage: 'q', ragContext: 'ctx', steps: [] } as any);
    expect(patch.contextGrade).toBe('relevant');
    expect(patch.contextConfidence).toBe(0);
  });

  it('rewrite_query: service lança → falha em silence (rewritten=q original)', async () => {
    vi.stubEnv('CRAG_ENABLED', 'true');
    const { makeNodeRewriteQuery } = await import('../../domain/agent/nodes/rewrite-query.node');
    const crag = { rewriteQuery: vi.fn().mockRejectedValue(new Error('boom')) };
    const patch = await makeNodeRewriteQuery({ crag: crag as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any })
      ({ tenantId: 't', customerId: 'c', conversationId: 'cv', userMessage: 'q', retrievalAttempts: 0, steps: [] } as any);
    expect(patch.rewrittenQuery).toBe('q');
    expect(patch.retrievalAttempts).toBe(1);
  });

  it('self_check: service lança → grounded=true (fail-open p/ não escalar spam)', async () => {
    vi.stubEnv('CRAG_ENABLED', 'true');
    const { makeNodeSelfCheck } = await import('../../domain/agent/nodes/self-check.node');
    const crag = { selfCheck: vi.fn().mockRejectedValue(new Error('boom')) };
    const patch = await makeNodeSelfCheck({ crag: crag as any, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any })
      ({ tenantId: 't', customerId: 'c', conversationId: 'cv', userMessage: 'q', response: 'r', steps: [] } as any);
    expect(patch.selfCheckPassed).toBe(true);
  });
});