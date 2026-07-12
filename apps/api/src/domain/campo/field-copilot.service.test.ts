import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks ────────────────────────────────────────────────────────────────────

const mockClassifyFieldPhoto = vi.hoisted(() => vi.fn());

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
}));

vi.mock('../../infrastructure/vision/vision.service', () => ({
  classifyFieldPhoto: mockClassifyFieldPhoto,
}));

vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── import after mocks ────────────────────────────────────────────────────────

import { diagnosePlusAttach, listDiagnoses } from './field-copilot.service';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSupabaseFrom(insertResult: any, updateResult: any = { error: null }) {
  const chain: any = {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      then: undefined,
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  // update chain: .update().eq().eq() → resolves with updateResult
  const eqChain: any = { eq: vi.fn().mockResolvedValue(updateResult) };
  chain.update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(eqChain) });
  return chain;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('diagnosePlusAttach', () => {
  const tenantId = 'tenant-abc';
  const imageUrl = 'https://s3.example.com/photo.jpg';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persiste diagnóstico e retorna resultado quando visão retorna classificação', async () => {
    const classification = {
      equipment: 'cto' as const,
      issue: 'led_vermelho' as const,
      severity: 'alta' as const,
      recommended_action: 'Verificar alimentação da CTO',
      confidence: 0.92,
    };
    mockClassifyFieldPhoto.mockResolvedValue(classification);

    const diagnosisId = 'diag-uuid-123';
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: diagnosisId }, error: null }),
      }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    };
    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue(insertChain),
      update: vi.fn().mockReturnValue(updateChain),
    } as any);

    const result = await diagnosePlusAttach({
      tenantId,
      imageUrl,
      serviceOrderId: 'so-uuid-1',
    });

    expect(result.equipment).toBe('cto');
    expect(result.issue).toBe('led_vermelho');
    expect(result.severity).toBe('alta');
    expect(result.confidence).toBe(0.92);
    expect(result.lowConfidence).toBe(false);
    expect(result.id).toBe(diagnosisId);
  });

  it('marca low_confidence quando classificação retorna null (VISION_STRUCTURED_ENABLED=false)', async () => {
    mockClassifyFieldPhoto.mockResolvedValue(null);

    const diagnosisId = 'diag-low-conf';
    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: diagnosisId }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    } as any);

    const result = await diagnosePlusAttach({ tenantId, imageUrl });

    expect(result.lowConfidence).toBe(true);
    expect(result.equipment).toBe('outro');
    expect(result.attachedToOs).toBe(false);
  });

  it('marca low_confidence quando confidence < 0.6', async () => {
    mockClassifyFieldPhoto.mockResolvedValue({
      equipment: 'roteador' as const,
      issue: 'outro' as const,
      severity: 'baixa' as const,
      recommended_action: 'inspeção manual',
      confidence: 0.45,
    });

    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'diag-x' }, error: null }),
        }),
      }),
    } as any);

    const result = await diagnosePlusAttach({ tenantId, imageUrl });
    expect(result.lowConfidence).toBe(true);
    expect(result.confidence).toBe(0.45);
  });

  it('lança erro quando insert falha', async () => {
    mockClassifyFieldPhoto.mockResolvedValue(null);

    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        }),
      }),
    } as any);

    await expect(diagnosePlusAttach({ tenantId, imageUrl })).rejects.toThrow('Falha ao salvar diagnóstico de campo');
  });

  it('retorna attachedToOs=true quando serviceOrderId é fornecido e update não falha', async () => {
    mockClassifyFieldPhoto.mockResolvedValue({
      equipment: 'onu' as const,
      issue: 'sem_problema_visivel' as const,
      severity: 'baixa' as const,
      recommended_action: 'OK',
      confidence: 0.88,
    });

    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'diag-ok' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    } as any);

    const result = await diagnosePlusAttach({ tenantId, imageUrl, serviceOrderId: 'so-123' });
    expect(result.attachedToOs).toBe(true);
  });
});

describe('listDiagnoses', () => {
  it('retorna lista vazia quando não há registros', async () => {
    const chainable: any = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue(chainable),
    } as any);

    const result = await listDiagnoses({ tenantId: 'tenant-x' });
    expect(result).toEqual([]);
  });

  it('mapeia campos corretamente', async () => {
    const row = {
      id: 'abc',
      photo_url: 'https://s3.example.com/img.jpg',
      equipment: 'cto',
      issue: 'fibra_rompida',
      severity: 'critica',
      recommended_action: 'Substituir a fibra',
      confidence: 0.97,
      low_confidence: false,
      created_at: '2026-07-12T10:00:00Z',
    };
    const chainable: any = {
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    const { default: supabase } = await import('../../infrastructure/database/supabase.client');
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue(chainable),
    } as any);

    const result = await listDiagnoses({ tenantId: 'tenant-x', serviceOrderId: 'so-1' });
    expect(result).toHaveLength(1);
    expect(result[0].equipment).toBe('cto');
    expect(result[0].severity).toBe('critica');
    expect(result[0].lowConfidence).toBe(false);
    expect(result[0].photoUrl).toBe(row.photo_url);
  });
});
