import { describe, it, expect, vi, afterEach } from 'vitest';
import { interpolateTemplate, calculateActionDelay, makeCobrancaRulesService } from './cobrai-rules.service';
import type { ICobrancaDbPort } from '../ports/cobranca.port';
import type { ILoggerPort } from '../ports/logger.port';

function makeTestDeps() {
  const db: ICobrancaDbPort = {
    getTenantCobraiRules: vi.fn().mockResolvedValue([
      { id: 'r1', name: 'D+1', daysOverdue: 1, action: 'send_message', active: true },
    ]),
    registerCobraiJob: vi.fn().mockResolvedValue(undefined),
    cancelInvoiceCobraiJobs: vi.fn().mockResolvedValue(['job-1', 'job-2']),
    createDefaultCobraiRules: vi.fn().mockResolvedValue(undefined),
  };
  const logger: ILoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { db, logger };
}

describe('CobrAI Rules Engine', () => {
  describe('interpolateTemplate', () => {
    it('substitui variáveis corretamente', () => {
      const result = interpolateTemplate(
        'Olá {{customerName}}! Sua fatura de R$ {{amountBRL}} venceu.',
        { customerName: 'João Silva', amountBRL: '150,00' },
      );
      expect(result).toBe('Olá João Silva! Sua fatura de R$ 150,00 venceu.');
    });

    it('mantém variáveis não encontradas intactas com {{key}}', () => {
      const result = interpolateTemplate('Olá {{nome}}!', {});
      // Mutante que remove {{}} falharia aqui
      expect(result).toBe('Olá {{nome}}!');
    });

    it('substitui múltiplas ocorrências da mesma variável', () => {
      const result = interpolateTemplate('{{x}} e {{x}}', { x: 'teste' });
      expect(result).toBe('teste e teste');
    });

    it('converte valor numérico em string', () => {
      const result = interpolateTemplate('R$ {{valor}}', { valor: 150 });
      expect(result).toBe('R$ 150');
    });

    it('template sem variáveis retorna inalterado', () => {
      const result = interpolateTemplate('Sem variáveis aqui.', { x: 'y' });
      expect(result).toBe('Sem variáveis aqui.');
    });

    it('não substitui variáveis com apenas um bracket', () => {
      const result = interpolateTemplate('{nome} e {{nome}}', { nome: 'João' });
      // {nome} não deve ser substituído, {{nome}} sim
      expect(result).toBe('{nome} e João');
    });
  });

  describe('calculateActionDelay', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('retorna 0 para data já passada', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
      // dueDate 30 dias atrás; D+1 = ainda no passado
      const pastDate = new Date('2026-06-10T12:00:00Z');
      const delay = calculateActionDelay(pastDate, 1);
      expect(delay).toBe(0);
    });

    it('nunca retorna negativo', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
      const deepPast = new Date('2020-01-01T00:00:00Z');
      const delay = calculateActionDelay(deepPast, 0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });

    it('retorna delay positivo para data futura', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
      const futureDate = new Date('2026-07-15T12:00:00Z'); // 5 dias no futuro
      const delay = calculateActionDelay(futureDate, 1); // D+1 = 6 dias
      expect(delay).toBeGreaterThan(0);
    });

    it('D+1 de amanhã retorna ~2 dias em ms', () => {
      vi.useFakeTimers();
      const now = new Date('2026-07-10T00:00:00Z');
      vi.setSystemTime(now);
      const tomorrow = new Date('2026-07-11T00:00:00Z');
      const delay = calculateActionDelay(tomorrow, 1); // D+1 de amanhã = 2 dias
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      expect(delay).toBe(twoDaysMs);
    });

    it('delay de D+5 é exatamente 5 dias a mais que D+0', () => {
      vi.useFakeTimers();
      const now = new Date('2026-07-10T00:00:00Z');
      vi.setSystemTime(now);
      const dueDate = new Date('2026-07-20T00:00:00Z'); // 10 dias no futuro
      const delay0 = calculateActionDelay(dueDate, 0);  // 10 dias em ms
      const delay5 = calculateActionDelay(dueDate, 5);  // 15 dias em ms
      expect(delay5 - delay0).toBe(5 * 24 * 60 * 60 * 1000);
    });

    it('não muta a dueDate original (cria cópia internamente)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T00:00:00Z'));
      const dueDate = new Date('2026-07-20T00:00:00Z');
      const original = dueDate.getTime();
      calculateActionDelay(dueDate, 3);
      // A função cria new Date(dueDate) internamente — original não deve mudar
      expect(dueDate.getTime()).toBe(original);
    });
  });

  describe('makeCobrancaRulesService', () => {
    it('getTenantCobraiRules delega ao db e retorna regras', async () => {
      const { db, logger } = makeTestDeps();
      const svc = makeCobrancaRulesService({ db, logger });
      const rules = await svc.getTenantCobraiRules('tenant-1');
      expect(rules).toHaveLength(1);
      expect(rules[0]?.id).toBe('r1');
      expect(db.getTenantCobraiRules).toHaveBeenCalledWith('tenant-1');
    });

    it('getTenantCobraiRules captura erro e retorna array vazio', async () => {
      const { db, logger } = makeTestDeps();
      (db.getTenantCobraiRules as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB down'));
      const svc = makeCobrancaRulesService({ db, logger });
      const rules = await svc.getTenantCobraiRules('tenant-err');
      expect(rules).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('cancelInvoiceCobraiJobs retorna jobIds e loga quando há jobs', async () => {
      const { db, logger } = makeTestDeps();
      const svc = makeCobrancaRulesService({ db, logger });
      const ids = await svc.cancelInvoiceCobraiJobs('t1', 'inv-1');
      expect(ids).toEqual(['job-1', 'job-2']);
      expect(logger.info).toHaveBeenCalled();
    });

    it('cancelInvoiceCobraiJobs não loga quando não há jobs', async () => {
      const { db, logger } = makeTestDeps();
      (db.cancelInvoiceCobraiJobs as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      const svc = makeCobrancaRulesService({ db, logger });
      await svc.cancelInvoiceCobraiJobs('t1', 'inv-vazio');
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('createDefaultCobraiRules delega ao db e loga', async () => {
      const { db, logger } = makeTestDeps();
      const svc = makeCobrancaRulesService({ db, logger });
      await svc.createDefaultCobraiRules('new-tenant');
      expect(db.createDefaultCobraiRules).toHaveBeenCalledWith('new-tenant');
      expect(logger.info).toHaveBeenCalled();
    });

    it('registerCobraiJob delega ao db', async () => {
      const { db, logger } = makeTestDeps();
      const svc = makeCobrancaRulesService({ db, logger });
      await svc.registerCobraiJob({
        tenantId: 't1',
        customerId: 'c1',
        invoiceId: 'inv-1',
        ruleId: 'r1',
        bullmqJobId: 'job-abc',
        scheduledFor: new Date(),
      });
      expect(db.registerCobraiJob).toHaveBeenCalled();
    });
  });
});
