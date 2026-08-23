import { describe, it, expect, vi } from 'vitest';
import {
  getEmergencyStopStatus,
  activateEmergencyStop,
  deactivateEmergencyStop,
  isEmergencyStopped,
  type EmergencyStopDeps,
  type EmergencyStopRow,
} from './emergency-stop.service';

const ROW: EmergencyStopRow = {
  id: 'stop-1',
  reason: 'IA respondendo boletos com valor errado',
  activated_at: '2026-08-23T12:00:00.000Z',
  activated_by: 'user-1',
};

function makeDeps(overrides: Partial<EmergencyStopDeps> = {}): EmergencyStopDeps {
  return {
    findActive: vi.fn(async () => null),
    insertActivation: vi.fn(async (input) => ({ ...ROW, reason: input.reason, activated_by: input.activatedBy })),
    deactivate: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('getEmergencyStopStatus', () => {
  it('active:false quando não há linha ativa', async () => {
    const deps = makeDeps();
    expect(await getEmergencyStopStatus(deps)).toEqual({ active: false });
  });

  it('active:true com os dados da linha quando há parada ativa', async () => {
    const deps = makeDeps({ findActive: vi.fn(async () => ROW) });
    expect(await getEmergencyStopStatus(deps)).toEqual({
      active: true,
      reason: ROW.reason,
      activatedAt: ROW.activated_at,
      activatedBy: ROW.activated_by,
    });
  });
});

describe('activateEmergencyStop', () => {
  it('cria a ativação quando não há nenhuma ativa', async () => {
    const deps = makeDeps();
    const row = await activateEmergencyStop({ reason: '  custo disparou  ', activatedBy: 'user-9' }, deps);
    expect(deps.insertActivation).toHaveBeenCalledWith({ reason: 'custo disparou', activatedBy: 'user-9' });
    expect(row.activated_by).toBe('user-9');
  });

  it('rejeita motivo vazio', async () => {
    const deps = makeDeps();
    await expect(activateEmergencyStop({ reason: '   ', activatedBy: 'user-9' }, deps)).rejects.toThrow(
      'Motivo é obrigatório',
    );
    expect(deps.insertActivation).not.toHaveBeenCalled();
  });

  it('rejeita ativar de novo quando já está ativa (não duplica)', async () => {
    const deps = makeDeps({ findActive: vi.fn(async () => ROW) });
    await expect(activateEmergencyStop({ reason: 'outro motivo', activatedBy: 'user-2' }, deps)).rejects.toThrow(
      'já está ativa',
    );
    expect(deps.insertActivation).not.toHaveBeenCalled();
  });
});

describe('deactivateEmergencyStop', () => {
  it('desativa a linha ativa encontrada', async () => {
    const deps = makeDeps({ findActive: vi.fn(async () => ROW) });
    await deactivateEmergencyStop({ deactivatedBy: 'user-3' }, deps);
    expect(deps.deactivate).toHaveBeenCalledWith({ id: ROW.id, deactivatedBy: 'user-3' });
  });

  it('rejeita quando não há nada ativo pra desativar', async () => {
    const deps = makeDeps();
    await expect(deactivateEmergencyStop({ deactivatedBy: 'user-3' }, deps)).rejects.toThrow('Nenhuma parada');
    expect(deps.deactivate).not.toHaveBeenCalled();
  });
});

describe('isEmergencyStopped (hot path do worker)', () => {
  it('false quando não há parada ativa', async () => {
    expect(await isEmergencyStopped({ findActive: vi.fn(async () => null) })).toBe(false);
  });

  it('true quando há parada ativa', async () => {
    expect(await isEmergencyStopped({ findActive: vi.fn(async () => ROW) })).toBe(true);
  });

  it('fail-open: nunca lança, assume false se a checagem falhar', async () => {
    const findActive = vi.fn(async () => {
      throw new Error('Supabase indisponível');
    });
    await expect(isEmergencyStopped({ findActive })).resolves.toBe(false);
  });
});
