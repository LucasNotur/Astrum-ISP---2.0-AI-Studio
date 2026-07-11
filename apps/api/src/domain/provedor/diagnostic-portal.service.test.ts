import { describe, it, expect, vi } from 'vitest';
import { runPortalDiagnostic } from './diagnostic-portal.service';
import type { ToolsExecutor } from '../../infrastructure/ai/tools.executor';

function makeExecutor(diagnosticResult: any, osResult: any = { service_order_id: 'os-1', success: true }): ToolsExecutor {
  return {
    execute: vi.fn().mockImplementation(async (tool: string) => {
      if (tool === 'run_diagnostics') return diagnosticResult;
      if (tool === 'schedule_technical_visit') return osResult;
      return {};
    }),
  } as any;
}

describe('runPortalDiagnostic', () => {
  it('sinal ok → retorna ok, sem OS', async () => {
    const exec = makeExecutor({ signal: 'ok', latency_ms: 12, packet_loss: 0, simulated: true });
    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('ok');
    expect(result.serviceOrderCreated).toBe(false);
    expect(result.message).toContain('funcionando normalmente');
    expect(exec.execute).toHaveBeenCalledTimes(1);
  });

  it('sinal no_signal → abre OS automaticamente', async () => {
    const exec = makeExecutor({ signal: 'no_signal', simulated: true });
    const result = await runPortalDiagnostic('t1', 'c1', 'Rua A, 1', { toolsExecutor: exec });

    expect(result.signal).toBe('no_signal');
    expect(result.serviceOrderCreated).toBe(true);
    expect(result.serviceOrderId).toBe('os-1');
    expect(result.message).toContain('OS #os-1');
    expect(exec.execute).toHaveBeenCalledTimes(2);
    expect(exec.execute).toHaveBeenCalledWith('schedule_technical_visit', expect.objectContaining({
      customer_id: 'c1',
      address: 'Rua A, 1',
    }));
  });

  it('sinal degraded → abre OS com mensagem de instabilidade', async () => {
    const exec = makeExecutor({ signal: 'degraded', simulated: true });
    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('degraded');
    expect(result.serviceOrderCreated).toBe(true);
    expect(result.message).toContain('instabilidade');
  });

  it('run_diagnostics falha → retorna unknown sem lançar exceção', async () => {
    const exec = {
      execute: vi.fn().mockRejectedValue(new Error('network timeout')),
    } as any;

    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('unknown');
    expect(result.serviceOrderCreated).toBe(false);
  });

  it('sinal no_signal + OS falha → ainda retorna resultado sem OS', async () => {
    const exec = {
      execute: vi.fn().mockImplementation(async (tool: string) => {
        if (tool === 'run_diagnostics') return { signal: 'no_signal', simulated: true };
        throw new Error('OS create failed');
      }),
    } as any;

    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('no_signal');
    expect(result.serviceOrderCreated).toBe(false);
  });

  it('latência alta (>150ms) → detecta degraded via heurística', async () => {
    const exec = makeExecutor({ signal: 'unknown', latency_ms: 200, packet_loss: 1, simulated: true });
    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('degraded');
    expect(result.serviceOrderCreated).toBe(true);
  });

  it('perda de pacotes alta (>5%) → detecta degraded', async () => {
    const exec = makeExecutor({ signal: 'unknown', latency_ms: 20, packet_loss: 10, simulated: true });
    const result = await runPortalDiagnostic('t1', 'c1', undefined, { toolsExecutor: exec });

    expect(result.signal).toBe('degraded');
  });
});
