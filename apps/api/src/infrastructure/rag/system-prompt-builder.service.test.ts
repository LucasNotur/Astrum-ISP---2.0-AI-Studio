import { describe, it, expect, vi } from 'vitest';

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          bot_name: 'Astro',
          personality: 'profissional e técnico',
          temperature: 0.7,
          max_tokens_per_message: 1000,
          custom_instructions: 'Atendimento das 8h às 20h.',
        }
      }),
    }),
  },
}));

describe('System Prompt Builder', () => {
  it('inclui nome do bot no prompt', async () => {
    const { buildSystemPrompt } = await import('./system-prompt-builder.service');
    const result = await buildSystemPrompt({ tenantId: 'tenant-1' });
    expect(result.prompt).toContain('Astro');
    expect(result.botName).toBe('Astro');
  });

  it('inclui nome do cliente quando fornecido', async () => {
    const { buildSystemPrompt } = await import('./system-prompt-builder.service');
    const result = await buildSystemPrompt({
      tenantId: 'tenant-1',
      customerName: 'João Silva',
    });
    expect(result.prompt).toContain('João Silva');
  });

  it('inclui aviso de suspensão quando cliente suspenso', async () => {
    const { buildSystemPrompt } = await import('./system-prompt-builder.service');
    const result = await buildSystemPrompt({
      tenantId: 'tenant-1',
      customerName: 'João Silva',
      customerStatus: 'suspended',
    });
    expect(result.prompt).toContain('SUSPENSA');
  });

  it('inclui contexto RAG quando fornecido', async () => {
    const { buildSystemPrompt } = await import('./system-prompt-builder.service');
    const result = await buildSystemPrompt({
      tenantId: 'tenant-1',
      ragContext: 'Manual técnico: reset = 10 segundos',
    });
    expect(result.prompt).toContain('BASE DE CONHECIMENTO');
    expect(result.prompt).toContain('reset = 10 segundos');
  });

  it('inclui instruções customizadas do ISP', async () => {
    const { buildSystemPrompt } = await import('./system-prompt-builder.service');
    const result = await buildSystemPrompt({ tenantId: 'tenant-1' });
    expect(result.prompt).toContain('Atendimento das 8h às 20h.');
  });
});
