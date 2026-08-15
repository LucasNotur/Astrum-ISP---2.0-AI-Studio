import { describe, it, expect, vi } from 'vitest';
import { handleConnectionUpdate, type ConnectionUpdateDeps } from '../../routes/evolutionConnection.ts';

function makeDeps(prev: string | undefined): ConnectionUpdateDeps & {
  setStatus: ReturnType<typeof vi.fn>;
  appendLog: ReturnType<typeof vi.fn>;
} {
  return {
    getPrevStatus: vi.fn().mockResolvedValue(prev),
    setStatus: vi.fn().mockResolvedValue(undefined),
    appendLog: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleConnectionUpdate (OBS-11 idempotência)', () => {
  it('estado mudou (undefined → open): persiste status + log', async () => {
    const deps = makeDeps(undefined);
    const r = await handleConnectionUpdate(deps, 'open');
    expect(r.changed).toBe(true);
    expect(deps.setStatus).toHaveBeenCalledWith('open');
    expect(deps.appendLog).toHaveBeenCalledWith('open');
  });

  it('mesmo estado (open → open): NO-OP, não grava nem loga (anti-replay/spam)', async () => {
    const deps = makeDeps('open');
    const r = await handleConnectionUpdate(deps, 'open');
    expect(r.changed).toBe(false);
    expect(deps.setStatus).not.toHaveBeenCalled();
    expect(deps.appendLog).not.toHaveBeenCalled();
  });

  it('transição real (open → close): persiste', async () => {
    const deps = makeDeps('open');
    const r = await handleConnectionUpdate(deps, 'close');
    expect(r.changed).toBe(true);
    expect(deps.setStatus).toHaveBeenCalledWith('close');
    expect(deps.appendLog).toHaveBeenCalledWith('close');
  });

  it('estado vazio/nulo: NO-OP (nada a registrar)', async () => {
    const deps = makeDeps('open');
    expect((await handleConnectionUpdate(deps, undefined)).changed).toBe(false);
    expect((await handleConnectionUpdate(deps, null)).changed).toBe(false);
    expect((await handleConnectionUpdate(deps, '')).changed).toBe(false);
    expect(deps.setStatus).not.toHaveBeenCalled();
  });
});
