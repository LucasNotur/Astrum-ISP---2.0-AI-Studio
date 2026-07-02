import { describe, it, expect } from 'vitest';
import { transition, initialCall } from './voice-call';

describe('voice-call — máquina de estados', () => {
  it('atende no horário comercial → greeting', () => {
    const c = transition(initialCall(true), { type: 'answer' });
    expect(c.state).toBe('greeting');
  });

  it('atende fora do horário → encerra (MVP sem fila noturna)', () => {
    const c = transition(initialCall(false), { type: 'answer' });
    expect(c.state).toBe('ended');
  });

  it('identificação bem-sucedida → serving com customerId', () => {
    const c = transition({ ...initialCall(true), state: 'identifying' }, { type: 'identified', customerId: 'c1' });
    expect(c.state).toBe('serving');
    expect(c.customerId).toBe('c1');
  });

  it('3 falhas de identificação → transfere para humano', () => {
    let c = initialCall(true);
    c = transition(c, { type: 'identify_failed' });
    expect(c.state).toBe('identifying');
    c = transition(c, { type: 'identify_failed' });
    c = transition(c, { type: 'identify_failed' });
    expect(c.state).toBe('transferring');
    expect(c.failedIdentifications).toBe(3);
  });

  it('intent self-serve (segunda_via) → serving', () => {
    const c = transition({ ...initialCall(true), state: 'greeting' }, { type: 'intent_detected', intent: 'segunda_via' });
    expect(c.state).toBe('serving');
  });

  it('intent fora do escopo MVP → transfere', () => {
    const c = transition({ ...initialCall(true), state: 'greeting' }, { type: 'intent_detected', intent: 'reclamacao_juridica' });
    expect(c.state).toBe('transferring');
  });

  it('resolved e hangup encerram a chamada', () => {
    expect(transition(initialCall(true), { type: 'resolved' }).state).toBe('ended');
    expect(transition(initialCall(true), { type: 'hangup' }).state).toBe('ended');
  });

  it('request_human sempre transfere', () => {
    expect(transition({ ...initialCall(true), state: 'serving' }, { type: 'request_human' }).state).toBe('transferring');
  });
});
