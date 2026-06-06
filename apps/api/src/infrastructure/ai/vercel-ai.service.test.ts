import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vercelAIService, NetworkDiagnosticSchema, CustomerIntentSchema } from './vercel-ai.service';

// Mock do Vercel AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({})),
}));

describe('VercelAIService — Structured Outputs', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('NetworkDiagnosticSchema', () => {
    it('aceita diagnóstico válido', () => {
      const valid = {
        problem_category: 'signal_loss',
        severity: 'high',
        recommended_action: 'schedule_technician',
        estimated_resolution_hours: 4,
        technical_notes: 'Possível falha no cabo de entrada.',
        requires_human: true,
      };
      expect(() => NetworkDiagnosticSchema.parse(valid)).not.toThrow();
    });

    it('rejeita category inválida', () => {
      const invalid = {
        problem_category: 'unknown_category', // inválido
        severity: 'high',
        recommended_action: 'reboot_equipment',
        estimated_resolution_hours: 1,
        technical_notes: 'Teste',
        requires_human: false,
      };
      expect(() => NetworkDiagnosticSchema.parse(invalid)).toThrow();
    });

    it('rejeita estimated_resolution_hours > 72', () => {
      const invalid = {
        problem_category: 'slow_speed',
        severity: 'low',
        recommended_action: 'send_instructions',
        estimated_resolution_hours: 100, // inválido
        technical_notes: 'Teste',
        requires_human: false,
      };
      expect(() => NetworkDiagnosticSchema.parse(invalid)).toThrow();
    });
  });

  describe('CustomerIntentSchema', () => {
    it('aceita intent válida com suggested_tools', () => {
      const valid = {
        intent: 'support_technical',
        urgency: 'high',
        sentiment: 'frustrated',
        extracted_data: { equipment_model: 'TP-Link AX1500' },
        suggested_tools: ['query_rag', 'create_ticket'],
      };
      expect(() => CustomerIntentSchema.parse(valid)).not.toThrow();
    });

    it('rejeita intent inválida', () => {
      const invalid = {
        intent: 'hacking_attempt', // inválido
        urgency: 'high',
        sentiment: 'neutral',
        extracted_data: {},
        suggested_tools: [],
      };
      expect(() => CustomerIntentSchema.parse(invalid)).toThrow();
    });

    it('extracted_data pode ter todos os campos opcionais vazios', () => {
      const valid = {
        intent: 'check_status',
        urgency: 'low',
        sentiment: 'neutral',
        extracted_data: {},
        suggested_tools: ['query_supabase'],
      };
      expect(() => CustomerIntentSchema.parse(valid)).not.toThrow();
    });
  });

  describe('ToolsExecutor', () => {
    it('ferramenta desconhecida retorna erro sem crash', async () => {
      const { ToolsExecutor } = await import('./tools.executor');
      const executor = new ToolsExecutor('tenant-test');

      // Mockar supabase
      vi.mock('../database/supabase.client', () => ({
        supabase: {
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'ticket-1' }, error: null })
              })
            })
          })
        }
      }));

      const result = await executor.execute('unknown_tool', { foo: 'bar' });
      expect(result).toHaveProperty('error');
    });
  });
});
