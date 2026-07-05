import { describe, it, expect } from 'vitest';
import {
  isWithinCobraiWindow,
  withinHourlyLimit,
  withinDailyLimit,
  isStageActive,
  evaluateCobraiGate,
} from './cobrai-guards';

describe('isWithinCobraiWindow', () => {
  it('sem janela = sempre permitido', () => {
    expect(isWithinCobraiWindow(3, null)).toBe(true);
  });
  it('janela normal 8–20', () => {
    expect(isWithinCobraiWindow(9, { start: 8, end: 20 })).toBe(true);
    expect(isWithinCobraiWindow(20, { start: 8, end: 20 })).toBe(false);
    expect(isWithinCobraiWindow(3, { start: 8, end: 20 })).toBe(false);
  });
  it('janela que cruza meia-noite 22–6', () => {
    expect(isWithinCobraiWindow(23, { start: 22, end: 6 })).toBe(true);
    expect(isWithinCobraiWindow(2, { start: 22, end: 6 })).toBe(true);
    expect(isWithinCobraiWindow(12, { start: 22, end: 6 })).toBe(false);
  });
});

describe('limites', () => {
  it('hourly', () => {
    expect(withinHourlyLimit(29, 30)).toBe(true);
    expect(withinHourlyLimit(30, 30)).toBe(false);
  });
  it('daily (null = sem limite)', () => {
    expect(withinDailyLimit(999, null)).toBe(true);
    expect(withinDailyLimit(100, 100)).toBe(false);
  });
});

describe('isStageActive (opt-out por estágio)', () => {
  it('sem config = ativo', () => expect(isStageActive('lembrete', null)).toBe(true));
  it('estágio marcado inativo', () => {
    expect(isStageActive('suspensao', { suspensao: { active: false } })).toBe(false);
    expect(isStageActive('lembrete', { suspensao: { active: false } })).toBe(true);
  });
});

describe('evaluateCobraiGate — decisão combinada', () => {
  const base = {
    hour: 10, window: { start: 8, end: 20 }, sentThisHour: 0, hourlyLimit: 30,
    sentToday: 0, dailyLimit: 100, stage: 'lembrete', stagesConfig: null,
  };

  it('passa quando tudo ok', () => {
    expect(evaluateCobraiGate(base).allowed).toBe(true);
  });

  it('bloqueia cliente opt-out ANTES de qualquer outra checagem', () => {
    expect(evaluateCobraiGate({ ...base, customerOptedOut: true })).toEqual({ allowed: false, reason: 'customer_opted_out' });
  });

  it('bloqueia fora da janela', () => {
    expect(evaluateCobraiGate({ ...base, hour: 3 }).reason).toBe('outside_window');
  });

  it('bloqueia no limite por hora', () => {
    expect(evaluateCobraiGate({ ...base, sentThisHour: 30 }).reason).toBe('hourly_limit');
  });

  it('bloqueia no limite diário', () => {
    expect(evaluateCobraiGate({ ...base, sentToday: 100 }).reason).toBe('daily_limit');
  });

  it('bloqueia estágio inativo', () => {
    expect(evaluateCobraiGate({ ...base, stage: 'suspensao', stagesConfig: { suspensao: { active: false } } }).reason).toBe('stage_inactive');
  });
});
