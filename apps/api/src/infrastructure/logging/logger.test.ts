import { describe, it, expect } from 'vitest';
import { logger, iaLogger, infraLogger, atendimentoLogger, cobrancaLogger } from './logger';

describe('Pino Logger', () => {
  it('logger principal tem os métodos esperados', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('child loggers têm contexto de domínio correto', () => {
    expect(iaLogger.bindings().domain).toBe('ia');
    expect(infraLogger.bindings().domain).toBe('infra');
    expect(atendimentoLogger.bindings().domain).toBe('atendimento');
    expect(cobrancaLogger.bindings().domain).toBe('cobranca');
  });
});
