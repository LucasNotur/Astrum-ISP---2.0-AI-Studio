import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,

  base: {
    service: 'astrum-api',
    env: process.env.NODE_ENV ?? 'development',
  },

  // Esconder dados sensíveis automaticamente em TODOS os logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.cpf',
      '*.credit_card',
      '*.apikey',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
});

// Child loggers por domínio — use estes em vez do logger raiz
export const atendimentoLogger = logger.child({ domain: 'atendimento' });
export const cobrancaLogger = logger.child({ domain: 'cobranca' });
export const iaLogger = logger.child({ domain: 'ia' });
export const infraLogger = logger.child({ domain: 'infra' });
export const securityLogger = logger.child({ domain: 'security' });
