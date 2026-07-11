import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  FASTIFY_PORT: z.string().default('3001').transform(Number),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  SUPABASE_URL: z.string().url('SUPABASE_URL deve ser uma URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatório'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatório'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY deve começar com sk-'),

  // IA-43 — Multi-provider failover (R3). Opcionais — a presença habilita
  // o provider correspondente em PROVIDER_ORDER.
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  // Ordem de tentativa do failover: csv de 'openai' | 'anthropic' | 'google'.
  PROVIDER_ORDER: z.string().optional(),
  PROVIDER_FAILOVER_ENABLED: z.string().optional().default('false'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Opcionais — integrações de canal / observabilidade
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  HELICONE_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  LANGCHAIN_API_KEY: z.string().optional(),

  // Opcionais — armazenamento Cloudflare R2
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('astrum-documents'),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Opcionais — busca vetorial e memória
  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),
  ZEP_API_URL: z.string().url().optional(),
  ZEP_API_KEY: z.string().optional(),

  // Opcionais — webhooks de saída (Svix) e segurança
  SVIX_API_KEY: z.string().optional(),
  WEBHOOK_HMAC_SECRET: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  // Opcionais — ERP (IXC, MK-Auth)
  ERP_CRED_KEY: z.string().optional(),

  // IA-09 — Coleta de métricas de rede + alerta de CTO
  CTO_ALERT_ENABLED: z.string().optional().default('false'),

  // IA-08 — Voz MVP (telefonia + OpenAI Realtime)
  VOICE_ENGINE: z.enum(['off', 'mvp']).default('off'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().optional().default('gpt-4o-realtime-preview'),
  VOICE_HUMAN_QUEUE_NUMBER: z.string().optional(),

  // IA-44 — Sandbox SQL do agente (somente leitura). Opcional: se
  // ausente, o endpoint /api/v2/ia/sandbox/query responde 503
  // (fail-open: backend não cai).
  SANDBOX_DB_URL: z.string().url().optional(),

  // IA-32 — OpenTelemetry (instrumentação manual por nó do grafo).
  OTEL_ENABLED: z.string().optional().default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),

  // IA-23 — LTV heurístico.
  LTV_ENABLED: z.string().optional().default('false'),

  // IA-29 — Active learning (rotulagem de exemplos).
  ACTIVE_LEARNING_ENABLED: z.string().optional().default('false'),

  // IA-15 — OCR multi-layout + fila de revisão.
  OCR_MULTILAYOUT_ENABLED: z.string().optional().default('false'),

  // IA-17 — MCP server (tools read-only via API key).
  MCP_SERVER_ENABLED: z.string().optional().default('false'),

  // IA-22 — Web browsing (allowlist + citação).
  BROWSING_ENABLED: z.string().optional().default('false'),

  // IA-39 — Constitutional loop (princípios editáveis).
  CONSTITUTIONAL_LOOP_ENABLED: z.string().optional().default('false'),

  // IA-28 — Perfil de comunicação (estilo inferido por heurística).
  COMM_PROFILE_ENABLED: z.string().optional().default('false'),

  // IA-36 — Edge inference shadow mode (Cloudflare Workers AI).
  EDGE_INFERENCE_MODE: z.enum(['off', 'shadow']).default('off'),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_AI_API_TOKEN: z.string().optional(),

  // IA-35 — Latency budget (orçamento de latência por nó).
  LATENCY_BUDGET_ENABLED: z.string().optional().default('false'),

  // IA-24 — Network anomaly detection (EWMA + z-score).
  NETWORK_ANOMALY_ENABLED: z.string().optional().default('false'),

  // IA-25 — Demand forecast (seasonal moving average).
  DEMAND_FORECAST_ENABLED: z.string().optional().default('false'),
  AGENT_CAPACITY_PER_DAY: z.string().optional().default('25'),

  // IA-13 — Voice QA (scorecard de chamadas de voz).
  VOICE_QA_ENABLED: z.string().optional().default('false'),

  // IA-40 — PII masking em transcrições de voz.
  VOICE_PII_MASK_ENABLED: z.string().optional().default('false'),

  // IA-12 — Voice biometrics (consentimento + verificação).
  VOICE_BIOMETRICS_ENABLED: z.string().optional().default('false'),

  // P2-01 — Meta (Instagram DM + Messenger)
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_PAGE_ACCESS_TOKEN: z.string().optional(),

  // P2-02 — E-mail inbound/outbound
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional().default('587').transform(Number),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional().default('noreply@astrum.app'),
  EMAIL_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function validateEnv(): Env {
  if (_env) return _env;

  // Mapeamento de possíveis aliases do Studio para os nomes aguardados
  const envSource = { ...process.env };
  
  // Tratativas para nomes alternativos que podem estar nos Secrets
  if (!envSource.SUPABASE_URL) {
    envSource.SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE;
  }
  if (!envSource.SUPABASE_ANON_KEY) {
    envSource.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE;
  }
  if (!envSource.OPENAI_API_KEY && process.env.GEMINI_API_KEY) {
    // Se o user cadastrou GEMINI_API_KEY em vez de OPENAI_API_KEY
    envSource.OPENAI_API_KEY = process.env.GEMINI_API_KEY;
  }

  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    console.error('\n❌ ERRO: Variáveis de ambiente inválidas ou ausentes:\n');
    result.error.issues.forEach(issue => {
      console.error(`  → ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\nVerifique seu arquivo .env e corrija os erros acima.\n');
    
    // Em produção NUNCA subimos com env inválido: cobrança bancária + LGPD exigem
    // fail-fast. Degradar silenciosamente transforma "falta SUPABASE_URL" em
    // "undefined.something" no meio de uma transação — muito pior de diagnosticar.
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Boot abortado: variáveis de ambiente inválidas em produção.');
      process.exit(1);
    }

    // Fora de produção (dev/preview/test) seguimos degradado para não travar o Studio.
    console.warn('⚠️ [DEV] Ignorando falha de env para permitir boot local. NUNCA em produção.');
    _env = process.env as any;
    return _env!;
  }

  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error('validateEnv() deve ser chamado antes de getEnv()');
  return _env;
}
