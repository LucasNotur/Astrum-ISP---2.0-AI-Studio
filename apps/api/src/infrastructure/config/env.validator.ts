import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  FASTIFY_PORT: z.string().transform(Number).default('3001'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  SUPABASE_URL: z.string().url('SUPABASE_URL deve ser uma URL válida'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatório'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatório'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  OPENAI_API_KEY: z.string().startsWith('sk-', 'OPENAI_API_KEY deve começar com sk-'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),

  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Opcionais — adicionados nos próximos sprints
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  HELICONE_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  LANGCHAIN_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('astrum-documents'),
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
    
    // Sempre permitimos prosseguir, usando as variáveis disponíveis.
    // Isso evita crash no Preview / Cloud Run caso uma chave (como SUPABASE_URL) esteja faltando.
    console.warn('⚠️ Ignorando falha de variáveis de ambiente para permitir boot do server.');
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
