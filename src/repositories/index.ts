import { CustomerRepository, TicketRepository, ServiceOrderRepository, KnowledgeRepository, TenantRepository } from './interfaces';
import { CustomerRepositorySupabase } from './supabase/CustomerRepositorySupabase';
import { TicketRepositorySupabase } from './supabase/TicketRepositorySupabase';
import { ServiceOrderRepositorySupabase } from './supabase/ServiceOrderRepositorySupabase';
import { KnowledgeRepositorySupabase } from './supabase/KnowledgeRepositorySupabase';
import { TenantRepositorySupabase } from './supabase/TenantRepositorySupabase';

/**
 * FZ-5: Supabase é o ÚNICO provider de dados — o Firestore foi removido do
 * projeto (Plano FIRESTORE-ZERO, 2026-07-03). A função continua exportada
 * por compatibilidade com quem inspeciona a decisão, mas sempre resolve
 * 'supabase' e loga um aviso se alguém pedir 'firebase'.
 */
export function resolveDbProvider(env: { VITE_DB_PROVIDER?: string; DB_PROVIDER?: string } = {}): 'supabase' {
  const raw = (env.VITE_DB_PROVIDER ?? env.DB_PROVIDER ?? 'supabase').toLowerCase();
  if (raw === 'firebase') {
    console.warn('[repositories] DB_PROVIDER=firebase ignorado — o Firestore foi removido (Plano FZ). Usando supabase.');
  }
  return 'supabase';
}

export function getCustomerRepository(): CustomerRepository {
  return new CustomerRepositorySupabase();
}

export function getTicketRepository(): TicketRepository {
  return new TicketRepositorySupabase();
}

export function getServiceOrderRepository(): ServiceOrderRepository {
  return new ServiceOrderRepositorySupabase();
}

export function getKnowledgeRepository(): KnowledgeRepository {
  return new KnowledgeRepositorySupabase();
}

export function getTenantRepository(): TenantRepository {
  return new TenantRepositorySupabase();
}

export * from './interfaces';
