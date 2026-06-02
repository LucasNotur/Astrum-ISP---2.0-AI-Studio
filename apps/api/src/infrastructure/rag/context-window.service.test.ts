import { describe, it, expect } from 'vitest';
import { applyContextWindow } from './context-window.service';

const makeMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `Mensagem número ${i + 1} com algum conteúdo para teste`,
  }));

describe('Context Window Manager', () => {
  it('retorna todas as mensagens quando dentro do limite', () => {
    const messages = makeMessages(5);
    const result = applyContextWindow(messages, { maxMessages: 20 });
    expect(result).toHaveLength(5);
  });

  it('comprime quando excede maxMessages', () => {
    const messages = makeMessages(25);
    const result = applyContextWindow(messages, { maxMessages: 20, recentMessagesCount: 6 });
    expect(result.length).toBeLessThan(25);
    // Deve ter o resumo + 6 mensagens recentes
    expect(result.length).toBeLessThanOrEqual(8); // 1 resumo + 6 recentes + possível system
  });

  it('preserva mensagens de sistema (system role)', () => {
    const messages = [
      { role: 'system' as const, content: 'Você é Astro.' },
      ...makeMessages(25),
    ];
    const result = applyContextWindow(messages, { maxMessages: 10, recentMessagesCount: 4 });
    const systemMsgs = result.filter(m => m.role === 'system');
    expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
    expect(systemMsgs.some(m => m.content.includes('Astro'))).toBe(true);
  });

  it('mensagens recentes são preservadas integralmente', () => {
    const messages = makeMessages(20);
    const result = applyContextWindow(messages, {
      maxMessages: 5,
      recentMessagesCount: 4,
    });
    const lastOriginal = messages[messages.length - 1].content;
    expect(result.some(m => m.content === lastOriginal)).toBe(true);
  });

  it('array vazio retorna array vazio', () => {
    expect(applyContextWindow([])).toHaveLength(0);
  });
});
