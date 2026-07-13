/**
 * A ESCADA ASTRUM — modelo de cobrança do Lucas (revisão final 2026-07-13).
 *
 * REGRA ÚNICA: **R$ 2,50 × assinantes do ISP, em qualquer quantidade.**
 * Sem faixas, sem desconto por volume, sem piso, sem almoço grátis.
 * 1 ISP de 200 assinantes paga R$ 500; 1 de 50.000 paga R$ 125.000.
 *
 * O cavalo de troia continua sendo o RADAR — mas como TRIAL de 14 dias
 * (P5-05), não como plano grátis permanente: o prospect conecta o ERP,
 * vê o dinheiro vazando, e no 14º dia recebe o relatório "quanto a Astrum
 * teria te economizado" com o botão de assinar.
 *
 * Fonte: MODELO_DE_COBRANCA_E_CENARIOS__DECIDIDO.md §5–§7.
 */

export type AstrumTier = 'radar_trial' | 'astrum';

/** R$ 2,50 por assinante — o único preço da casa. */
export const PRICE_PER_SUBSCRIBER_CENTS = 250;
/** Duração do trial Radar (P5-05). */
export const RADAR_TRIAL_DAYS = 14;

export interface AstrumTierDef {
  id: AstrumTier;
  name: string;
  tagline: string;
  /** Preço por assinante em centavos/mês (0 = trial). */
  pricePerSubscriberCents: number;
  /** Dias de validade (null = permanente enquanto pagar). */
  trialDays: number | null;
  /** Chaves do MODULES_REGISTRY liberadas ('all' = tudo). */
  modules: string[] | 'all';
  features: string[];
}

export const ASTRUM_LADDER: Record<AstrumTier, AstrumTierDef> = {
  radar_trial: {
    id: 'radar_trial',
    name: 'Radar (trial 14 dias)',
    tagline: 'Conecte o ERP e veja o dinheiro vazando. 14 dias, sem cartão.',
    pricePerSubscriberCents: 0,
    trialDays: RADAR_TRIAL_DAYS,
    modules: ['customers', 'bi', 'map', 'intelligence'],
    features: [
      'Conector ERP somente-leitura (IXC, Voalle, MKAuth, SGP, HubSoft)',
      'Radar de churn: quem vai cancelar e quanto custa',
      'Radar de inadimplência: quanto dá para recuperar',
      'Mapa de rede com saúde por CTO',
      'No 14º dia: relatório "quanto a Astrum teria te economizado ESTE mês"',
    ],
  },
  astrum: {
    id: 'astrum',
    name: 'Astrum',
    tagline: 'A operação inteira por R$ 2,50 por assinante. Simples assim.',
    pricePerSubscriberCents: PRICE_PER_SUBSCRIBER_CENTS,
    trialDays: null,
    modules: 'all',
    features: [
      'Atendimento IA omnichannel (WhatsApp, Instagram, Messenger, e-mail, voz)',
      'CobrAI: régua de cobrança com variantes que aprendem + 2ª via na conversa',
      'Vendedor autônomo com oferta calibrada por LTV e ocupação de rede',
      'Copiloto de campo (foto → diagnóstico → OS) + central do assinante',
      'Religue por confiança, negociação de dívida, suspensão via ERP',
      'NOC: detecção de anomalia + notificação proativa de falha em massa',
      'Dashboard Valor Gerado + status page + kit compliance',
      'Cérebro noturno: a Astrum melhora sozinha e mostra o diário',
      'API/MCP, webhooks e observabilidade completa de custo de IA',
    ],
  },
};

/**
 * Preço mensal em centavos: SEMPRE 2,50 × assinantes.
 * Sem piso, sem teto, sem faixa — a régua que o Lucas definiu.
 */
export function monthlyPriceCents(tier: AstrumTier, subscribers: number): number {
  return ASTRUM_LADDER[tier].pricePerSubscriberCents * Math.max(0, subscribers);
}

/** Módulos (chaves do MODULES_REGISTRY) liberados no degrau. */
export function modulesForTier(tier: AstrumTier, allModuleKeys: string[]): string[] {
  const m = ASTRUM_LADDER[tier].modules;
  return m === 'all' ? [...allModuleKeys] : [...m];
}

/**
 * enabled_modules (JSONB do tenant, U6-02) para um degrau: chaves FORA do
 * degrau ficam explicitamente false (ausência = habilitado, por design do U6-02).
 */
export function enabledModulesForTier(
  tier: AstrumTier,
  allModuleKeys: string[],
): Record<string, boolean> {
  const allowed = new Set(modulesForTier(tier, allModuleKeys));
  const out: Record<string, boolean> = {};
  for (const key of allModuleKeys) {
    if (!allowed.has(key)) out[key] = false;
  }
  return out;
}
