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
 *   - (sem % de ocupação) CTO com ≥ N portas livres → 'promotional': mesmo sinal,
 *     proxy grosseiro usado quando o total de portas é desconhecido (path ERP, que
 *     em geral só expõe portas livres) — ver occupancyPctFromPorts
 *   - plano > R$100/mês  → 'premium': não desconta, reforça qualidade
 *   - caso contrário     → 'standard'
 */
import { computeLtv } from '../ml/ltv';
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export type OfferTier = 'standard' | 'premium' | 'promotional';

export interface LtvOfferInput {
  planPriceCents: number;
  ctoOccupancyPct: number | null;
  /**
   * Portas livres da CTO. Usado como proxy do sinal 'promotional' QUANDO
   * `ctoOccupancyPct` é null (path ERP não expõe total de portas → não dá % de
   * ocupação, mas dá portas livres). Ignorado quando há % de ocupação.
   */
  ctoAvailablePorts?: number | null;
}

export interface LtvOfferResult {
  estimatedLtvCents: number;
  offerTier: OfferTier;
  offerNotes: string;
}

const PROMOTIONAL_THRESHOLD_PCT = 70;
// Proxy de "CTO com folga" quando o total de portas é desconhecido (path ERP):
// uma CTO com >= 4 portas livres claramente tem espaço para expansão barata. É
// grosseiro de propósito (sem o total não dá pra saber a % exata) — o path do
// grafo local, que sabe o total, sempre prefere a % de ocupação.
const PROMOTIONAL_MIN_FREE_PORTS = 4;
const PREMIUM_PRICE_CENTS = 10_000; // R$100/mês

/**
 * Ocupação da CTO (0–100) a partir das contagens de porta. Retorna null quando o
 * total é desconhecido ou zero (aí a calibração D-07 cai no proxy por portas livres).
 * Puro — sem I/O; funciona igual pro grafo local e pra qualquer ERP que exponha o total.
 */
export function occupancyPctFromPorts(
  totalPorts?: number | null,
  availablePorts?: number | null,
): number | null {
  const total = Number(totalPorts) || 0;
  if (total <= 0) return null;
  const available = Math.max(0, Number(availablePorts) || 0);
  const used = Math.max(0, total - available);
  return Math.round((used / total) * 100);
}

export function computeLtvOffer(input: LtvOfferInput): LtvOfferResult {
  const { planPriceCents, ctoOccupancyPct, ctoAvailablePorts = null } = input;

  const { ltvCents } = computeLtv({ mrrCents: planPriceCents, band: 'low' });

  let offerTier: OfferTier = 'standard';
  let offerNotes = '';

  // Fallback por portas livres: só quando NÃO temos % de ocupação (path ERP).
  const underByFreePorts =
    ctoOccupancyPct === null &&
    ctoAvailablePorts !== null &&
    ctoAvailablePorts >= PROMOTIONAL_MIN_FREE_PORTS;

  if (ctoOccupancyPct !== null && ctoOccupancyPct < PROMOTIONAL_THRESHOLD_PCT) {
    offerTier = 'promotional';
    const livePct = 100 - ctoOccupancyPct;
    offerNotes = `CTO com ${livePct}% de capacidade livre — ótimo momento para oferecer instalação gratuita ou desconto no primeiro mês para fechar mais rápido.`;
  } else if (underByFreePorts) {
    offerTier = 'promotional';
    offerNotes = `CTO com ${ctoAvailablePorts} portas livres — ótimo momento para oferecer instalação gratuita ou desconto no primeiro mês para fechar mais rápido.`;
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

  if (error || !data) {
    if (error) {
      infraLogger.warn(
        { tenantId, ctoId, err: error.message },
        'computeCtOccupancy: erro ao buscar ocupação da CTO — calibração de oferta LTV cai no fallback sem ocupação',
      );
    }
    return null;
  }

  const total = Number(data.total_ports) || 0;
  const used = Number(data.used_ports) || 0;
  if (total === 0) return null;

  return Math.round((used / total) * 100);
}
