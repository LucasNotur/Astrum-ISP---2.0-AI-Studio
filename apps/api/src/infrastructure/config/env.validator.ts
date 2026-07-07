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

  // IA-08 — Voz MVP (telefonia + OpenAI Realtime)
  VOICE_ENGINE: z.enum(['off', 'mvp']).default('off'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().optional().default('gpt-4o-realtime-preview'),
  VOICE_HUMAN_QUEUE_NUMBER: z.string().optional(),
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
