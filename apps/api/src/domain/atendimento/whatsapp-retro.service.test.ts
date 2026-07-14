import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  atendimentoLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import supabase from '../../infrastructure/database/supabase.client';
import {
  buildContactProfile,
  classifyCommStyle,
  classifyPayer,
  resolveIssueBuckets,
  runRetroAnalysis,
  ISSUE_BUCKETS,
  type RetroMessage,
  type RetroInvoice,
} from './whatsapp-retro.service';

const msg = (content: string, role = 'user', at = '2026-06-01T15:00:00Z'): RetroMessage =>
  ({ role, content, created_at: at });

const inv = (kind: 'onTime' | 'late' | 'overdue'): RetroInvoice => ({
  status: kind === 'overdue' ? 'overdue' : 'paid',
  due_date: '2026-06-10',
  paid_at: kind === 'onTime' ? '2026-06-09' : kind === 'late' ? '2026-06-20' : null,
});

describe('classifyCommStyle (IA-28 retroativo)', () => {
  it('gíria e emoji → coloquial', () => {
    expect(classifyCommStyle([msg('mano a net tá ruim kkk'), msg('vc pode ver isso? 😅')])).toBe('coloquial');
  });
  it('jargão técnico → tecnico', () => {
    expect(classifyCommStyle([msg('meu ping subiu pra 300ms'), msg('a ONU tá com -27dBm no sinal')])).toBe('tecnico');
  });
  it('linguagem formal → formal', () => {
    expect(classifyCommStyle([msg('Prezados, gostaria de solicitar a segunda via.'), msg('Agradeço a atenção.')])).toBe('formal');
  });
});

describe('classifyPayer', () => {
  it('maioria em dia → pontual', () => {
    expect(classifyPayer([inv('onTime'), inv('onTime'), inv('onTime'), inv('late')]).type).toBe('pontual');
  });
  it('≥30% atrasado → atrasa', () => {
    expect(classifyPayer([inv('onTime'), inv('late'), inv('late')]).type).toBe('atrasa');
  });
  it('≥25% em aberto → inadimplente', () => {
    expect(classifyPayer([inv('onTime'), inv('onTime'), inv('overdue')]).type).toBe('inadimplente');
  });
  it('sem faturas → sem_historico', () => {
    expect(classifyPayer([]).type).toBe('sem_historico');
  });
});

describe('buildContactProfile', () => {
  it('extrai problemas recorrentes do vocabulário real do assinante', () => {
    const p = buildContactProfile([
      msg('minha internet caiu de novo'),
      msg('caiu tudo aqui em casa'),
      msg('preciso da segunda via do boleto'),
      msg('Claro, vou verificar!', 'assistant'),
    ], [inv('onTime')]);
    expect(p.topIssues[0]!.issue).toBe('sem internet / queda');
    expect(p.topIssues[0]!.count).toBe(2);
    expect(p.topIssues.map((i) => i.issue)).toContain('boleto / 2ª via');
    expect(p.messageCount).toBe(4);
    expect(p.payerType).toBe('pontual');
  });

  it('mensagens do assistente NÃO contam como problema do cliente', () => {
    const p = buildContactProfile([
      msg('Sua internet caiu? Vou verificar o sinal.', 'assistant'),
    ], []);
    expect(p.topIssues).toHaveLength(0);
  });

  it('perfil vazio não explode', () => {
    const p = buildContactProfile([], []);
    expect(p.messageCount).toBe(0);
    expect(p.commStyle).toBe('coloquial');
    expect(p.payerType).toBe('sem_historico');
  });
});

describe('runRetroAnalysis (o botão)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('agrega por cliente, grava retro_profile no extra e devolve o relatório', async () => {
    const updates: any[] = [];
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const chainOf = (data: any) => {
        const c: any = {
          select: () => c, eq: () => c, in: () => c, not: () => c, order: () => c,
          maybeSingle: async () => ({ data: { extra: { legado: true } }, error: null }),
          update: (row: any) => { updates.push(row); return c; },
          then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
        };
        return c;
      };
      if (table === 'conversations') return chainOf([
        { id: 'conv-1', customer_id: 'cust-1' },
        { id: 'conv-2', customer_id: 'cust-1' },
        { id: 'conv-3', customer_id: 'cust-2' },
      ]);
      if (table === 'messages') return chainOf([
        { role: 'user', content: 'internet caiu de novo mano', created_at: '2026-06-01T15:00:00Z' },
      ]);
      if (table === 'invoices') return chainOf([inv('overdue'), inv('onTime')]);
      if (table === 'customers') return chainOf([]);
      if (table === 'tenants') {
        const t: any = { select: () => t, eq: () => t, maybeSingle: async () => ({ data: { extra: {} }, error: null }) };
        return t;
      }
      throw new Error(`tabela: ${table}`);
    }) as any);

    const r = await runRetroAnalysis('t1');
    expect(r.contactsAnalyzed).toBe(2);       // cust-1 (2 convs) + cust-2
    expect(r.profilesWritten).toBe(2);
    expect(r.payerMix.inadimplente).toBe(2);  // 1 de 2 em aberto = 50% ≥ 25%
    expect(r.topIssuesGlobal[0]!.issue).toBe('sem internet / queda');
    expect(r.headline).toContain('60–90 dias');
    // merge preserva o extra existente
    expect(updates[0].extra.legado).toBe(true);
    expect(updates[0].extra.retro_profile.commStyle).toBe('coloquial');
  });
});

describe('resolveIssueBuckets (H6-02 — multi-vertical sem fork)', () => {
  it('sem config do tenant → vocabulário ISP default', () => {
    expect(resolveIssueBuckets(null)).toBe(ISSUE_BUCKETS);
    expect(resolveIssueBuckets(undefined)).toBe(ISSUE_BUCKETS);
  });

  it('tenant de academia troca o vocabulário — mesmo motor, outro negócio', () => {
    // Lição para quem configurar buckets: cubra os acentos (matr[ií]cul, não matricul)
    const buckets = resolveIssueBuckets({
      'matrícula / plano': 'matr[ií]cul|inscri|plano',
      'aula / horário': 'aula|hor[aá]rio|professor',
    });
    const p = buildContactProfile([
      { role: 'user', content: 'queria saber do horário das aulas de spinning', created_at: '2026-06-01T15:00:00Z' },
      { role: 'user', content: 'e como faço a matrícula?', created_at: '2026-06-01T15:01:00Z' },
    ], [], buckets);
    const issues = p.topIssues.map((i) => i.issue);
    expect(issues).toContain('aula / horário');
    expect(issues).toContain('matrícula / plano');
  });

  it('regex inválida do tenant é pulada; se todas inválidas, volta ao default', () => {
    const ok = resolveIssueBuckets({ 'válida': 'aula', 'quebrada': '[invalida(' });
    expect(Object.keys(ok)).toEqual(['válida']);
    expect(resolveIssueBuckets({ 'quebrada': '[(' })).toBe(ISSUE_BUCKETS);
  });
});
