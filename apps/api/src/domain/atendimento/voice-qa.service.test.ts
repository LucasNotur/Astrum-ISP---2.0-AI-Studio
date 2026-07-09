import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPhone,
  maskPhone,
  computeTotal,
  isVoiceQaEnabled,
  VOICE_QA_CRITERIA,
  ScorecardSchema,
  type Criterion,
} from './voice-qa.service';

describe('voice-qa.service', () => {
  it('maskPhone returns last 4 digits', () => {
    expect(maskPhone('+5511999887766')).toBe('7766');
    expect(maskPhone('1234')).toBe('1234');
    expect(maskPhone('12')).toBe('****');
  });

  it('hashPhone produces consistent sha256', () => {
    const h1 = hashPhone('+5511999887766');
    const h2 = hashPhone('+5511999887766');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('hashPhone never contains the original number', () => {
    const phone = '+5511999887766';
    const hash = hashPhone(phone);
    expect(hash).not.toContain('999887766');
  });

  it('computeTotal averages criteria scores', () => {
    const criteria: Criterion[] = VOICE_QA_CRITERIA.map((key) => ({
      key,
      score: 80,
      justification: 'ok',
    }));
    expect(computeTotal(criteria)).toBe(80);
  });

  it('computeTotal handles empty array', () => {
    expect(computeTotal([])).toBe(0);
  });

  it('computeTotal rounds correctly', () => {
    const criteria: Criterion[] = VOICE_QA_CRITERIA.map((key, i) => ({
      key,
      score: i === 0 ? 77 : 80,
      justification: 'ok',
    }));
    // (77 + 80*5) / 6 = 477/6 = 79.5 → 80
    expect(computeTotal(criteria)).toBe(80);
  });

  it('ScorecardSchema validates correct data', () => {
    const data = {
      criteria: VOICE_QA_CRITERIA.map((key) => ({
        key,
        score: 85,
        justification: 'bom',
      })),
    };
    expect(() => ScorecardSchema.parse(data)).not.toThrow();
  });

  it('ScorecardSchema rejects invalid criterion key', () => {
    const data = {
      criteria: [
        { key: 'invalid_key', score: 50, justification: 'x' },
        ...VOICE_QA_CRITERIA.slice(1).map((key) => ({
          key,
          score: 50,
          justification: 'x',
        })),
      ],
    };
    expect(() => ScorecardSchema.parse(data)).toThrow();
  });

  it('isVoiceQaEnabled defaults to false', () => {
    delete (process.env as any).VOICE_QA_ENABLED;
    expect(isVoiceQaEnabled()).toBe(false);
  });

  it('isVoiceQaEnabled returns true when set', () => {
    process.env.VOICE_QA_ENABLED = 'true';
    expect(isVoiceQaEnabled()).toBe(true);
    delete (process.env as any).VOICE_QA_ENABLED;
  });

  it('VOICE_QA_CRITERIA has exactly 6 items', () => {
    expect(VOICE_QA_CRITERIA).toHaveLength(6);
  });
});
