import { describe, it, expect } from 'vitest';
import { memoize } from './memoize';

describe('memoize', () => {
  it('não reexecuta a função com o mesmo parâmetro', () => {
    let count = 0;
    const fn = memoize((x: number) => { count++; return x * 2; });
    fn(5); fn(5);
    expect(count).toBe(1);
  });
  it('executa novamente para parâmetros diferentes', () => {
    let count = 0;
    const fn = memoize((x: number) => { count++; return x; });
    fn(1); fn(2);
    expect(count).toBe(2);
  });
});
