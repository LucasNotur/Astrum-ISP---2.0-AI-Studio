export interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  event: string;
  trace_id?: string;
  tenant_id?: string;
  session_id?: string;
  phone_last4?: string;
  agent?: string;
  tool?: string;
  latency_ms?: number;
  error?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

// OBS-06 (auditoria 2026-08-10): redação de PII antes de logar. O logger é usado em todo o
// backend legado e antes despejava o ctx cru (podia conter cpf, telefone, e-mail, endereço,
// conteúdo de mensagem, tokens) — violação LGPD e vazamento p/ observabilidade externa.
const SENSITIVE_KEY =
  /(cpf|cnpj|senha|password|passwd|secret|token|api[_-]?key|authorization|auth_?header|bearer|e?mail|phone|telefone|whatsapp|address|endereco|street|full[_-]?name|nome[_-]?completo|birth|nascimento|rg\b|card|cartao|content|body|text|caption|base64)/i;
// Campos estruturais/já-seguros que nunca devem ser redigidos.
const SAFE_KEY = new Set([
  'phone_last4', 'tenant_id', 'tenantId', 'session_id', 'sessionId', 'trace_id', 'traceId',
  'event', 'level', 'timestamp', 'agent', 'tool', 'latency_ms', 'status', 'code',
]);

export function redactPII(value: any, depth = 0): any {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactPII(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!SAFE_KEY.has(k) && SENSITIVE_KEY.test(k)) out[k] = '[REDACTED]';
      else out[k] = redactPII(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(fn: (s: string) => void, level: string, event: string, ctx: Partial<StructuredLog>) {
  fn(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...redactPII(ctx) }));
}

export const logger = {
  info: (event: string, ctx: Partial<StructuredLog> = {}) => emit(console.log, 'info', event, ctx),
  warn: (event: string, ctx: Partial<StructuredLog> = {}) => emit(console.warn, 'warn', event, ctx),
  error: (event: string, ctx: Partial<StructuredLog> = {}) => emit(console.error, 'error', event, ctx),
  debug: (event: string, ctx: Partial<StructuredLog> = {}) => emit(console.debug, 'debug', event, ctx),
};
