import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBootState,
  markFastifyBooted,
  markFastifyBootFailed,
  _resetBootState,
} from './boot-state';

describe('boot-state', () => {
  beforeEach(() => _resetBootState());

  it('estado inicial: não bootado, sem falha', () => {
    const s = getBootState();
    expect(s.fastifyBooted).toBe(false);
    expect(s.fastifyBootFailed).toBe(false);
    expect(s.lastError).toBeNull();
  });

  it('markFastifyBooted marca sucesso e limpa erro anterior', () => {
    markFastifyBootFailed(new Error('boom'));
    markFastifyBooted();
    const s = getBootState();
    expect(s.fastifyBooted).toBe(true);
    expect(s.fastifyBootFailed).toBe(false);
    expect(s.lastError).toBeNull();
  });

  it('markFastifyBootFailed registra mensagem e timestamp', () => {
    markFastifyBootFailed(new Error('redis down'));
    const s = getBootState();
    expect(s.fastifyBootFailed).toBe(true);
    expect(s.fastifyBooted).toBe(false);
    expect(s.lastError).toBe('redis down');
    expect(s.failedAt).not.toBeNull();
  });

  it('aceita erro que não é instância de Error', () => {
    markFastifyBootFailed('string error');
    expect(getBootState().lastError).toBe('string error');
  });

  it('getBootState retorna cópia (imutável por fora)', () => {
    const s = getBootState() as any;
    s.fastifyBooted = true;
    expect(getBootState().fastifyBooted).toBe(false);
  });
});
