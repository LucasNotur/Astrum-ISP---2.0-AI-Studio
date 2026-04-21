import { createClient } from '@supabase/supabase-js';

// Estas variáveis devem ser configuradas no seu arquivo .env na VPS
// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
// @ts-ignore
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// O cliente só é inicializado se as chaves existirem
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

/**
 * NOTA DE ARQUITETURA (MIGRAÇÃO FUTURA):
 * 
 * Quando for o momento de migrar do Firebase para o Supabase, 
 * nós usaremos este arquivo como base.
 * 
 * O processo será:
 * 1. A IA lerá o arquivo `firebase-blueprint.json`.
 * 2. A IA gerará o script SQL para criar as tabelas no Supabase.
 * 3. Nós substituiremos as funções do arquivo `src/lib/db.ts` 
 *    (que hoje usam addDoc, getDocs do Firebase) por chamadas 
 *    do Supabase (ex: supabase.from('customers').select('*')).
 */
