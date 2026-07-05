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
    beforeAll(() => {
      vi.mock('../database/supabase.client', () => ({
        default: {
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'ticket-1' }, error: null })
              })
            })
          })
        }
      }));

      vi.mock('../../../../../packages/queue/src/queues', () => ({
        suspensionQueue: {
          add: vi.fn().mockResolvedValue({})
        }
      }));
    });

    it('ferramenta desconhecida retorna erro sem crash', async () => {
      const { ToolsExecutor } = await import('./tools.executor');
      const executor = new ToolsExecutor('tenant-test');

      const result = await executor.execute('unknown_tool', { foo: 'bar' });
      expect(result).toHaveProperty('error');
    }, 10000);
  });

  describe('IA-37: onStepFinish batching', () => {
    const originalEnv = process.env;
    let streamTextMock: any;
    let onStepFinishCb: any;

    beforeEach(async () => {
      process.env = { ...originalEnv };
      vi.resetModules();
      onStepFinishCb = undefined;
      // Re-mock the ai SDK streamText to capture the options
      streamTextMock = vi.fn((opts: any) => {
        onStepFinishCb = opts.onStepFinish;
        return { textStream: (async function* () { yield 'ok'; })() };
      });
      vi.doMock('ai', () => ({
        generateObject: vi.fn(),
        generateText: vi.fn(),
        streamText: streamTextMock,
        stepCountIs: (n: number) => ({ __stepCount: n }),
      }));
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    function makeStep(calls: Array<{ toolName: string; input: any }>) {
      return { toolCalls: calls };
    }

    it('flag off: tool calls executam sequencialmente (>= 300ms para 3 de 100ms)', async () => {
      process.env.TOOL_BATCHING_ENABLED = 'false';
      const { VercelAIService } = await import('./vercel-ai.service');
      const svc = new VercelAIService();

      const t0 = Date.now();
      await svc.streamWithTools(
        [{ role: 'user', content: 'x' }],
        'ctx',
        't1',
        async (name) => {
          await new Promise((r) => setTimeout(r, 100));
          return { ok: name };
        },
      );
      // streamWithTools doesn't run onStepFinish; we have to call it ourselves.
      const step = makeStep([
        { toolName: 'a', input: {} },
        { toolName: 'b', input: {} },
        { toolName: 'c', input: {} },
      ]);
      await onStepFinishCb(step);
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeGreaterThanOrEqual(290); // ~300ms com pequena folga
    });

    it('flag on: 3 tool calls de 100ms cada executam em paralelo (< 200ms total)', async () => {
      process.env.TOOL_BATCHING_ENABLED = 'true';
      const { VercelAIService } = await import('./vercel-ai.service');
      const svc = new VercelAIService();

      await svc.streamWithTools(
        [{ role: 'user', content: 'x' }],
        'ctx',
        't1',
        async (name) => {
          await new Promise((r) => setTimeout(r, 100));
          return { ok: name };
        },
      );
      const step = makeStep([
        { toolName: 'a', input: {} },
        { toolName: 'b', input: {} },
        { toolName: 'c', input: {} },
      ]);
      const t0 = Date.now();
      await onStepFinishCb(step);
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(200);
    });

    it('flag on: callback que lança não derruba as outras (allSettled)', async () => {
      process.env.TOOL_BATCHING_ENABLED = 'true';
      const { VercelAIService } = await import('./vercel-ai.service');
      const svc = new VercelAIService();

      const results: any[] = [];
      await svc.streamWithTools(
        [{ role: 'user', content: 'x' }],
        'ctx',
        't1',
        async (name) => {
          if (name === 'quebra') throw new Error('boom');
          results.push(name);
          return { ok: name };
        },
      );
      const step = makeStep([
        { toolName: 'a', input: {} },
        { toolName: 'quebra', input: {} },
        { toolName: 'b', input: {} },
      ]);
      // Não deve lançar — allSettled absorve.
      await expect(onStepFinishCb(step)).resolves.toBeUndefined();
      // a e b completaram apesar da quebra
      expect(results.sort()).toEqual(['a', 'b']);
    });

    it('sem toolCalls: onStepFinish é no-op', async () => {
      process.env.TOOL_BATCHING_ENABLED = 'true';
      const { VercelAIService } = await import('./vercel-ai.service');
      const svc = new VercelAIService();

      const cb = vi.fn();
      await svc.streamWithTools(
        [{ role: 'user', content: 'x' }],
        'ctx',
        't1',
        cb,
      );
      await onStepFinishCb({ toolCalls: [] });
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
