import { CustomerRepository, TicketRepository, ServiceOrderRepository, KnowledgeRepository, TenantRepository } from './interfaces';
import { CustomerRepositoryFirebase } from './firebase/CustomerRepositoryFirebase';
import { TicketRepositoryFirebase } from './firebase/TicketRepositoryFirebase';
import { ServiceOrderRepositoryFirebase } from './firebase/ServiceOrderRepositoryFirebase';
import { KnowledgeRepositoryFirebase } from './firebase/KnowledgeRepositoryFirebase';
import { TenantRepositoryFirebase } from './firebase/TenantRepositoryFirebase';
import { CustomerRepositorySupabase } from './supabase/CustomerRepositorySupabase';
import { TicketRepositorySupabase } from './supabase/TicketRepositorySupabase';
import { ServiceOrderRepositorySupabase } from './supabase/ServiceOrderRepositorySupabase';
import { KnowledgeRepositorySupabase } from './supabase/KnowledgeRepositorySupabase';
import { TenantRepositorySupabase } from './supabase/TenantRepositorySupabase';

/**
 * Resolve o provider de dados do frontend. Default 'supabase' (S78 — data swap).
 * Firestore só se explicitamente pedido (fallback de emergência até o cutover S82).
 * Pura e testável.
 */
export function resolveDbProvider(env: { VITE_DB_PROVIDER?: string; DB_PROVIDER?: string } = {}): 'supabase' | 'firebase' {
  const raw = (env.VITE_DB_PROVIDER ?? env.DB_PROVIDER ?? 'supabase').toLowerCase();
  return raw === 'firebase' ? 'firebase' : 'supabase';
}

const DB_PROVIDER = resolveDbProvider({
  VITE_DB_PROVIDER: typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_DB_PROVIDER : undefined,
  DB_PROVIDER: typeof process !== 'undefined' ? process.env?.DB_PROVIDER : undefined,
});

export function getCustomerRepository(): CustomerRepository {
  if (DB_PROVIDER === 'supabase') return new CustomerRepositorySupabase();
  return new CustomerRepositoryFirebase();
}

export function getTicketRepository(): TicketRepository {
  if (DB_PROVIDER === 'supabase') return new TicketRepositorySupabase();
  return new TicketRepositoryFirebase();
}

export function getServiceOrderRepository(): ServiceOrderRepository {
  if (DB_PROVIDER === 'supabase') return new ServiceOrderRepositorySupabase();
  return new ServiceOrderRepositoryFirebase();
}

export function getKnowledgeRepository(): KnowledgeRepository {
  if (DB_PROVIDER === 'supabase') return new KnowledgeRepositorySupabase();
  return new KnowledgeRepositoryFirebase();
}

export function getTenantRepository(): TenantRepository {
  if (DB_PROVIDER === 'supabase') return new TenantRepositorySupabase();
  return new TenantRepositoryFirebase();
}

export * from './interfaces';
