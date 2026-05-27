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

export const logger = {
  info: (event: string, ctx: Partial<StructuredLog> = {}) =>
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event, ...ctx })),
  warn: (event: string, ctx: Partial<StructuredLog> = {}) =>
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', event, ...ctx })),
  error: (event: string, ctx: Partial<StructuredLog> = {}) =>
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event, ...ctx })),
  debug: (event: string, ctx: Partial<StructuredLog> = {}) =>
    console.debug(JSON.stringify({ timestamp: new Date().toISOString(), level: 'debug', event, ...ctx })),
};
