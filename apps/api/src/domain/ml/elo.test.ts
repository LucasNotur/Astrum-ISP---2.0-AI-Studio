import { describe, it, expect } from 'vitest';
import { expectedScore, updateElo } from './elo';

describe('elo', () => {
  it('expectedScore is 0.5 for equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
  });

  it('expectedScore: higher rated player has higher expected score', () => {
    const ea = expectedScore(1200, 1000);
    expect(ea).toBeGreaterThan(0.5);
    expect(ea).toBeLessThan(1);
  });

  it('symmetry: gain of A = loss of B', () => {
    const [newA, newB] = updateElo(1000, 1000, 1);
    const deltaA = newA - 1000;
    const deltaB = newB - 1000;
    expect(deltaA).toBe(-deltaB);
  });

  it('draw moves less than a win', () => {
    const [winA] = updateElo(1000, 1000, 1);
    const [drawA] = updateElo(1000, 1000, 0.5);
    const winDelta = Math.abs(winA - 1000);
    const drawDelta = Math.abs(drawA - 1000);
    expect(drawDelta).toBeLessThan(winDelta);
  });

  it('draw between equal players does not change ratings', () => {
    const [newA, newB] = updateElo(1000, 1000, 0.5);
    expect(newA).toBe(1000);
    expect(newB).toBe(1000);
  });

  it('K factor is respected', () => {
    const [a16] = updateElo(1000, 1000, 1, 16);
    const [a32] = updateElo(1000, 1000, 1, 32);
    expect(a32 - 1000).toBe(2 * (a16 - 1000));
  });

  it('win by lower-rated player gives bigger gain', () => {
    const [newLow] = updateElo(800, 1200, 1);
    const [newHigh] = updateElo(1200, 800, 1);
    const upsetGain = newLow - 800;
    const expectedGain = newHigh - 1200;
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it('loss result (0) is the inverse of win', () => {
    const [winA, winB] = updateElo(1000, 1000, 1);
    const [lossA, lossB] = updateElo(1000, 1000, 0);
    expect(winA).toBe(lossB);
    expect(winB).toBe(lossA);
  });
});
