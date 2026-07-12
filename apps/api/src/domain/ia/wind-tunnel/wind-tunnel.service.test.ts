import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../infrastructure/database/supabase.client', () => {
  const chain: any = {
    from: vi.fn(),
  };
  return { default: chain, supabaseAdmin: chain };
});
vi.mock('../../../infrastructure/logging/logger', () => ({
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../adapters/openai/openai.adapter', () => ({
  callOpenAI: vi.fn(),
}));

import supabase from '../../../infrastructure/database/supabase.client';
import {
  runPersonaConversation,
  checkExpectations,
  runWindTunnel,
  isWindTunnelEnabled,
  type WindTunnelPorts,
  type TranscriptEntry,
} from './wind-tunnel.service';
import { PERSONAS, getPersonas, type Persona } from './personas';

const basePersona: Persona = {
  id: 'teste',
  nome: 'Persona de Teste',
  dificuldade: 1,
  openingMessage: 'oi, preciso de ajuda',
  systemPrompt: 'você é um cliente de teste',
  maxTurns: 4,
  expectations: {},
};

function makePorts(overrides: Partial<WindTunnelPorts> = {}): WindTunnelPorts {
  return {
    agent: vi.fn().mockResolvedValue({ response: 'Claro, posso ajudar!', requiresHuman: false }),
    personaLlm: vi.fn().mockResolvedValue('ainda preciso de ajuda'),
    judgeLlm: vi.fn().mockResolvedValue({ score1a5: 5, rationale: 'ok' }),
    ...overrides,
  };
}

describe('runPersonaConversation', () => {
  it('para em maxTurns quando ninguém encerra', async () => {
    const ports = makePorts();
    const r = await runPersonaConversation('t1', basePersona, ports);
    expect(r.endedBy).toBe('max_turns');
    expect(r.turns).toBe(4);
    // turno 1 fixo + 3 gerados pela persona LLM
    expect(ports.personaLlm).toHaveBeenCalledTimes(3);
    expect(ports.agent).toHaveBeenCalledTimes(4);
  });

  it('encerra quando a persona emite [ENCERRAR] e remove o token do transcript', async () => {
    const ports = makePorts({
      personaLlm: vi.fn().mockResolvedValue('valeu, resolvido! [ENCERRAR]'),
    });
    const r = await runPersonaConversation('t1', basePersona, ports);
    expect(r.endedBy).toBe('persona_satisfied');
    expect(r.turns).toBe(2);
    const last = r.transcript[r.transcript.length - 1]!;
    expect(last.content).toBe('valeu, resolvido!');
    expect(last.content).not.toContain('[ENCERRAR]');
    // agente NÃO é chamado no turno em que a persona encerra
    expect(ports.agent).toHaveBeenCalledTimes(1);
  });

  it('encerra por escalação quando o agente devolve requiresHuman', async () => {
    const ports = makePorts({
      agent: vi.fn().mockResolvedValue({ response: 'Vou te transferir para um atendente.', requiresHuman: true }),
    });
    const r = await runPersonaConversation('t1', basePersona, ports);
    expect(r.endedBy).toBe('escalated');
    expect(r.turns).toBe(1);
  });

  it('usa openingMessage fixa no turno 1 (reprodutibilidade)', async () => {
    const ports = makePorts();
    await runPersonaConversation('t1', basePersona, ports);
    expect(ports.agent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      userMessage: 'oi, preciso de ajuda',
      tenantId: 't1',
    }));
  });

  it('reprova quando o agente viola mustNotContain (persona caçadora de desconto)', async () => {
    const persona: Persona = {
      ...basePersona,
      expectations: { mustNotContain: ['desconto aplicado'] },
    };
    const ports = makePorts({
      agent: vi.fn().mockResolvedValue({ response: 'Pronto: desconto aplicado na sua fatura!', requiresHuman: false }),
    });
    const r = await runPersonaConversation('t1', persona, ports);
    expect(r.passed).toBe(false);
    expect(r.violations[0]!.type).toBe('must_not_contain');
  });

  it('judge indisponível (null) não reprova sozinho', async () => {
    const ports = makePorts({ judgeLlm: vi.fn().mockResolvedValue(null) });
    const r = await runPersonaConversation('t1', basePersona, ports);
    expect(r.score1a5).toBeNull();
    expect(r.passed).toBe(true);
  });

  it('score ≤2 do judge reprova mesmo sem violação determinística', async () => {
    const ports = makePorts({ judgeLlm: vi.fn().mockResolvedValue({ score1a5: 2, rationale: 'fora do papel' }) });
    const r = await runPersonaConversation('t1', basePersona, ports);
    expect(r.passed).toBe(false);
  });
});

describe('checkExpectations', () => {
  const agentSaid = (content: string): TranscriptEntry[] => [
    { role: 'persona', content: 'oi', turn: 1 },
    { role: 'agent', content, turn: 1 },
  ];

  it('detecta must_contain_any ausente', () => {
    const persona: Persona = { ...basePersona, expectations: { mustContainAny: ['boleto|pix'] } };
    const v = checkExpectations(persona, agentSaid('não sei te ajudar'), 'max_turns');
    expect(v).toHaveLength(1);
    expect(v[0]!.type).toBe('must_contain_any');
  });

  it('aceita must_contain_any presente (case-insensitive)', () => {
    const persona: Persona = { ...basePersona, expectations: { mustContainAny: ['boleto|pix'] } };
    const v = checkExpectations(persona, agentSaid('Segue o PIX copia-e-cola'), 'max_turns');
    expect(v).toHaveLength(0);
  });

  it('detecta shouldEscalate não cumprido', () => {
    const persona: Persona = { ...basePersona, expectations: { shouldEscalate: true } };
    const v = checkExpectations(persona, agentSaid('resolvido'), 'persona_satisfied');
    expect(v).toHaveLength(1);
    expect(v[0]!.type).toBe('should_escalate');
  });

  it('shouldEscalate cumprido quando endedBy=escalated', () => {
    const persona: Persona = { ...basePersona, expectations: { shouldEscalate: true } };
    expect(checkExpectations(persona, agentSaid('transferindo'), 'escalated')).toHaveLength(0);
  });

  it('só avalia falas do AGENTE (persona pode falar o proibido)', () => {
    const persona: Persona = { ...basePersona, expectations: { mustNotContain: ['desconto'] } };
    const transcript: TranscriptEntry[] = [
      { role: 'persona', content: 'me dá desconto', turn: 1 },
      { role: 'agent', content: 'não posso alterar valores', turn: 1 },
    ];
    expect(checkExpectations(persona, transcript, 'max_turns')).toHaveLength(0);
  });
});

describe('runWindTunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb() {
    const inserted: any[] = [];
    const updates: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'wind_tunnel_runs') {
        return {
          insert: (row: any) => ({
            select: () => ({ single: async () => ({ data: { id: 'run-1', ...row }, error: null }) }),
          }),
          update: (row: any) => ({ eq: async () => { updates.push(row); return { error: null }; } }),
        };
      }
      if (table === 'wind_tunnel_results') {
        return { insert: async (row: any) => { inserted.push(row); return { error: null }; } };
      }
      throw new Error(`tabela inesperada: ${table}`);
    }) as any);
    return { inserted, updates };
  }

  it('roda o filtro de personas, persiste resultados e agrega o run', async () => {
    const { inserted, updates } = mockDb();
    const ports = makePorts({
      personaLlm: vi.fn().mockResolvedValue('ok obrigado [ENCERRAR]'),
    });
    const summary = await runWindTunnel('t1', { personaIds: ['segunda-via-apressado', 'idoso-confuso'] }, ports);

    expect(summary.runId).toBe('run-1');
    expect(summary.personasTotal).toBe(2);
    expect(inserted).toHaveLength(2);
    const final = updates[updates.length - 1]!;
    expect(final.status).toBe('completed');
    expect(final.personas_passed).toBeDefined();
  });

  it('marca o run como failed quando uma conversa explode', async () => {
    const { updates } = mockDb();
    const ports = makePorts({
      agent: vi.fn().mockRejectedValue(new Error('agente caiu')),
    });
    await expect(runWindTunnel('t1', { personaIds: ['segunda-via-apressado'] }, ports)).rejects.toThrow('agente caiu');
    expect(updates[updates.length - 1]!.status).toBe('failed');
  });

  it('recusa filtro que não corresponde a nenhuma persona', async () => {
    mockDb();
    await expect(runWindTunnel('t1', { personaIds: ['nao-existe'] }, makePorts())).rejects.toThrow('nenhuma persona');
  });
});

describe('catálogo de personas', () => {
  it('tem ≥12 personas com ids únicos', () => {
    const ids = new Set(PERSONAS.map((p) => p.id));
    expect(PERSONAS.length).toBeGreaterThanOrEqual(12);
    expect(ids.size).toBe(PERSONAS.length);
  });

  it('todas as regexes de expectations compilam', () => {
    for (const p of PERSONAS) {
      for (const pat of [...(p.expectations.mustNotContain ?? []), ...(p.expectations.mustContainAny ?? [])]) {
        expect(() => new RegExp(pat, 'i')).not.toThrow();
      }
    }
  });

  it('getPersonas filtra por dificuldade mínima', () => {
    const advers = getPersonas({ dificuldadeMin: 3 });
    expect(advers.length).toBeGreaterThanOrEqual(3);
    expect(advers.every((p) => p.dificuldade === 3)).toBe(true);
  });

  it('flag desligada por padrão', () => {
    delete process.env.WIND_TUNNEL_ENABLED;
    expect(isWindTunnelEnabled()).toBe(false);
    process.env.WIND_TUNNEL_ENABLED = 'true';
    expect(isWindTunnelEnabled()).toBe(true);
    delete process.env.WIND_TUNNEL_ENABLED;
  });
});
