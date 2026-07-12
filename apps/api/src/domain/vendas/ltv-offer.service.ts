/**
 * D-07 — Oferta calibrada por LTV + ocupação da CTO.
 *
 * Dado o plano escolhido e a CTO que atenderia o endereço, decide:
 *   - o LTV estimado do lead (novo cliente → band 'low')
 *   - o tier da oferta (promotional / premium / standard)
 *   - uma nota curta para o agente de vendas incluir no prompt
 *
 * Lógica de calibração:
 *   - CTO < 70% ocupada  → 'promotional': expansão barata, vale dar bônus
 *   - plano > R$100/mês  → 'premium': não desconta, reforça qualidade
 *   - caso contrário     → 'standard'
 */
import { computeLtv } from '../ml/ltv';
import supabase from '../../infrastructure/database/supabase.client';

export type OfferTier = 'standard' | 'premium' | 'promotional';

export interface LtvOfferInput {
  planPriceCents: number;
  ctoOccupancyPct: number | null;
}

export interface LtvOfferResult {
  estimatedLtvCents: number;
  offerTier: OfferTier;
  offerNotes: string;
}

const PROMOTIONAL_THRESHOLD_PCT = 70;
const PREMIUM_PRICE_CENTS = 10_000; // R$100/mês

export function computeLtvOffer(input: LtvOfferInput): LtvOfferResult {
  const { planPriceCents, ctoOccupancyPct } = input;

  const { ltvCents } = computeLtv({ mrrCents: planPriceCents, band: 'low' });

  let offerTier: OfferTier = 'standard';
  let offerNotes = '';

  if (ctoOccupancyPct !== null && ctoOccupancyPct < PROMOTIONAL_THRESHOLD_PCT) {
    offerTier = 'promotional';
    const livePct = 100 - ctoOccupancyPct;
    offerNotes = `CTO com ${livePct}% de capacidade livre — ótimo momento para oferecer instalação gratuita ou desconto no primeiro mês para fechar mais rápido.`;
  } else if (planPriceCents >= PREMIUM_PRICE_CENTS) {
    offerTier = 'premium';
    offerNotes = `Plano premium (${(planPriceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês) — não oferecer desconto, reforçar qualidade e SLA diferenciado.`;
  } else {
    offerNotes = `Oferta padrão. LTV estimado: ${(ltvCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;
  }

  return { estimatedLtvCents: ltvCents, offerTier, offerNotes };
}

export interface CtoDB {
  from: (table: string) => any;
}

export const defaultCtoDb: CtoDB = supabase as any;

/** Busca a ocupação atual de uma CTO (0–100). Retorna null se CTO não encontrada. */
export async function computeCtOccupancy(
  db: CtoDB,
  tenantId: string,
  ctoId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from('network_ctos')
    .select('total_ports, used_ports')
    .eq('id', ctoId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return null;

  const total = Number(data.total_ports) || 0;
  const used = Number(data.used_ports) || 0;
  if (total === 0) return null;

  return Math.round((used / total) * 100);
}
