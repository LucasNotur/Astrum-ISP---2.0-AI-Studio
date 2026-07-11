import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { normalizeCpf } from '../provedor/subscriber-portal';

/**
 * IA-08 A3 — identificação do cliente na chamada de voz (CPF por DTMF/fala,
 * telefone como fallback quando o cliente não sabe/não digita o CPF).
 *
 * Deps injetáveis (parâmetro `db`) → testável sem Supabase real (padrão de
 * `domain/rede/network-graph.service.ts`).
 */

export interface CustomerLookupPort {
  from: (table: string) => {
    select: (cols?: string) => any;
  };
}

export const defaultCustomerLookupDb: CustomerLookupPort = supabase as any;

function normalizePhone(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** CPF tem precedência (mais preciso); telefone é fallback. */
export async function identifyCustomerByCpfOrPhone(
  db: CustomerLookupPort,
  tenantId: string,
  input: { cpf?: string; phone?: string },
): Promise<string | null> {
  const cpf = input.cpf ? normalizeCpf(input.cpf) : '';
  const phone = input.phone ? normalizePhone(input.phone) : '';
  if (!cpf && !phone) return null;

  const column = cpf ? 'cpf' : 'phone';
  const value = cpf || phone;

  const { data, error } = await db.from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq(column, value)
    .maybeSingle();

  if (error) {
    infraLogger.warn({ err: error.message, tenantId }, 'voice-identify: erro na consulta — tratado como não identificado');
    return null;
  }
  return data?.id ?? null;
}
