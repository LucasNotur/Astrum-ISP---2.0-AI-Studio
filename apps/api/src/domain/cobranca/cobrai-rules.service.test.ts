import { describe, it, expect } from 'vitest';
import { interpolateTemplate, calculateActionDelay } from './cobrai-rules.service';

describe('CobrAI Rules Engine', () => {
  describe('interpolateTemplate', () => {
    it('substitui variáveis corretamente', () => {
      const result = interpolateTemplate(
        'Olá {{customerName}}! Sua fatura de R$ {{amountBRL}} venceu.',
        { customerName: 'João Silva', amountBRL: '150,00' }
      );
      expect(result).toBe('Olá João Silva! Sua fatura de R$ 150,00 venceu.');
    });

    it('mantém variáveis não encontradas intactas', () => {
      const result = interpolateTemplate('Olá {{nome}}!', {});
      expect(result).toBe('Olá {{nome}}!');
    });

    it('substitui múltiplas ocorrências da mesma variável', () => {
      const result = interpolateTemplate('{{x}} e {{x}}', { x: 'teste' });
      expect(result).toBe('teste e teste');
    });
  });

  describe('calculateActionDelay', () => {
    it('retorna 0 para data já passada', () => {
      const pastDate = new Date(Date.now() - 30 * 86400000); // 30 dias atrás
      const delay = calculateActionDelay(pastDate, 1); // D+1 da data passada
      expect(delay).toBe(0);
    });

    it('retorna delay positivo para data futura', () => {
      const futureDate = new Date(Date.now() + 5 * 86400000); // 5 dias no futuro
      const delay = calculateActionDelay(futureDate, 1); // D+1 = 6 dias no futuro
      expect(delay).toBeGreaterThan(0);
    });

    it('delay maior para mais dias de atraso', () => {
      const dueDate = new Date(Date.now() + 10 * 86400000);
      const delay1 = calculateActionDelay(dueDate, 1);
      const delay5 = calculateActionDelay(dueDate, 5);
      expect(delay5).toBeGreaterThan(delay1);
    });
  });
});
