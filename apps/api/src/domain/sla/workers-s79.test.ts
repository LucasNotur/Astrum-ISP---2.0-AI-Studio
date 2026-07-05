import { describe, it, expect } from 'vitest';
import { evaluateSla, slaWarningLevel, DEFAULT_SLA } from './sla-eval';
import { computeFcr } from '../atendimento/fcr-calc';
import { isSnoozeDue, dueSnoozes } from '../atendimento/snooze';

const now = new Date('2026-07-01T12:00:00Z');

describe('SLA — evaluateSla', () => {
  it('viola SLA de resposta se sem resposta humana além do limite', () => {
    const created = new Date(now.getTime() - 20 * 60000).toISOString(); // 20min atrás
    const r = evaluateSla({ createdAt: created, status: 'open', humanResponded: false }, DEFAULT_SLA, now);
    expect(r).toMatchObject({ breached: true, type: 'response' });
  });

  it('não viola resposta se humano já respondeu', () => {
    const created = new Date(now.getTime() - 20 * 60000).toISOString();
    const r = evaluateSla({ createdAt: created, status: 'in_progress', humanResponded: true }, DEFAULT_SLA, now);
    expect(r.breached).toBe(false);
  });

  it('viola SLA de resolução após as horas configuradas', () => {
    const created = new Date(now.getTime() - 25 * 3600_000).toISOString(); // 25h atrás
    const r = evaluateSla({ createdAt: created, status: 'in_progress', humanResponded: true }, DEFAULT_SLA, now);
    expect(r).toMatchObject({ breached: true, type: 'resolution' });
  });

  it('ignora ticket já marcado como breached (não recontabiliza)', () => {
    const created = new Date(now.getTime() - 100 * 60000).toISOString();
    const r = evaluateSla({ createdAt: created, status: 'open', slaBreached: true }, DEFAULT_SLA, now);
    expect(r.breached).toBe(false);
  });

  it('slaWarningLevel escalona 0→1→2', () => {
    expect(slaWarningLevel(10, 15)).toBe(0);
    expect(slaWarningLevel(20, 15)).toBe(1);
    expect(slaWarningLevel(40, 15)).toBe(2);
  });
});

describe('FCR — computeFcr', () => {
  it('calcula FCR, taxa de IA e agregados', () => {
    const r = computeFcr([
      { status: 'resolved', resolvedByAi: true },
      { status: 'resolved', resolvedByAi: false },
      { status: 'resolved', resolvedByAi: true, escalated: true }, // resolvido mas escalou → não é FCR
      { status: 'escalated', escalated: true },
      { status: 'open' },
    ]);
    expect(r.total).toBe(5);
    expect(r.resolved).toBe(3);
    expect(r.aiResolved).toBe(2);
    expect(r.escalated).toBe(2);
    // FCR = resolvidos sem escalar/reabrir (2) / total (5)
    expect(r.fcrRate).toBeCloseTo(0.4, 5);
    expect(r.aiResolutionRate).toBeCloseTo(2 / 3, 5);
  });

  it('lista vazia não divide por zero', () => {
    const r = computeFcr([]);
    expect(r.fcrRate).toBe(0);
    expect(r.aiResolutionRate).toBe(0);
  });

  it('ticket reaberto não conta como FCR', () => {
    const r = computeFcr([{ status: 'resolved', reopened: true }]);
    expect(r.fcrRate).toBe(0);
  });
});

describe('Snooze', () => {
  it('vencido reativa, futuro não', () => {
    expect(isSnoozeDue(new Date(now.getTime() - 1000).toISOString(), now)).toBe(true);
    expect(isSnoozeDue(new Date(now.getTime() + 3600_000).toISOString(), now)).toBe(false);
  });

  it('dueSnoozes filtra só os vencidos', () => {
    const items = [
      { id: 'a', snoozedUntil: new Date(now.getTime() - 1000).toISOString() },
      { id: 'b', snoozedUntil: new Date(now.getTime() + 1000).toISOString() },
      { id: 'c', snoozedUntil: new Date(now.getTime() - 5000).toISOString() },
    ];
    expect(dueSnoozes(items, now).map((i) => i.id)).toEqual(['a', 'c']);
  });
});
