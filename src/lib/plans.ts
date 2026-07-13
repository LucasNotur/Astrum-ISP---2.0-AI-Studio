/**
 * A ESCADA ASTRUM — modelo de cobrança decidido pelo Lucas em 2026-07-13.
 *
 * Mapa: R$ 2,50/assinante do ISP é o preço-base da Astrum completa (acima de
 * 1.000 assinantes). Abaixo de 1.000, degrau de entrada com ferramentas
 * limitadas e preço calibrado pelo mercado (bots do Anel 2 cobram R$ 500–1.500
 * fixos — a Operação fica competitiva SEM canibalizar a Autonomia).
 * O RADAR é o cavalo de troia: grátis para sempre, lê o ERP e mostra o
 * dinheiro vazando. O upgrade é um botão, não uma reunião.
 *
 * Fonte da decisão: .astrum-progress/nextgen-2.0/MODELO_DE_COBRANCA_E_CENARIOS__DECIDIDO.md
 */

export type AstrumTier = 'radar' | 'operacao' | 'autonomia' | 'enterprise';

export interface AstrumTierDef {
  id: AstrumTier;
  name: string;
  tagline: string;
  /** Preço por assinante do ISP, em centavos/mês. 0 = grátis. -1 = sob consulta. */
  pricePerSubscriberCents: number;
  /** Piso mensal em centavos (cobre ISPs muito pequenos). */
  floorCents: number;
  /** Teto de assinantes do degrau (null = sem teto). */
  maxSubscribers: number | null;
  /** Chaves do MODULES_REGISTRY liberadas ('all' = tudo). */
  modules: string[] | 'all';
  /** O que o degrau entrega, em linguagem de venda. */
  features: string[];
}

export const ASTRUM_LADDER: Record<AstrumTier, AstrumTierDef> = {
  radar: {
    id: 'radar',
    name: 'Radar',
    tagline: 'Veja o dinheiro vazando. Grátis, para sempre.',
    pricePerSubscriberCents: 0,
    floorCents: 0,
    maxSubscribers: 1000,
    modules: ['customers', 'bi', 'map', 'intelligence'],
    features: [
      'Conector ERP somente-leitura (IXC, Voalle, MKAuth, SGP, HubSoft)',
      'Radar de churn: quem vai cancelar e quanto custa',
      'Radar de inadimplência: quanto dá para recuperar',
      'Relatório mensal "quanto a Astrum teria te economizado"',
      'Mapa de rede com saúde por CTO',
    ],
  },
  operacao: {
    id: 'operacao',
    name: 'Operação',
    tagline: 'A IA atende e cobra por você.',
    pricePerSubscriberCents: 190, // R$ 1,90 — degrau <1k calibrado pelo mercado
    floorCents: 34900,            // piso R$ 349/mês
    maxSubscribers: 1000,
    modules: [
      'customers', 'bi', 'map', 'intelligence',
      'tickets', 'chat', 'os', 'billing', 'cobrai', 'kb', 'quality-monitor', 'team',
    ],
    features: [
      'Tudo do Radar',
      'Atendimento IA no WhatsApp com 2ª via na conversa',
      'CobrAI: régua de cobrança com variantes que aprendem',
      'Inbox unificada + tickets + ordens de serviço',
      'Base de conhecimento que se escreve sozinha (curadoria 1-clique)',
      'Monitor de qualidade (CSAT) e gestão de equipe',
    ],
  },
  autonomia: {
    id: 'autonomia',
    name: 'Autonomia',
    tagline: 'A Astrum 100%: opera, vende, previne e aprende.',
    pricePerSubscriberCents: 250, // R$ 2,50 — o preço-base da Astrum completa
    floorCents: 99000,            // piso R$ 990/mês
    maxSubscribers: null,
    modules: 'all',
    features: [
      'Tudo da Operação',
      'Omnichannel completo (Instagram, Messenger, e-mail, voz)',
      'Vendedor autônomo com oferta calibrada por LTV e ocupação de rede',
      'Copiloto de campo (foto → diagnóstico → OS)',
      'Religue por confiança, negociação de dívida, suspensão via ERP',
      'Notificação proativa de falha em massa',
      'Dashboard Valor Gerado + status page pública + central do assinante',
      'API/MCP, webhooks e observabilidade completa de custo de IA',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para consolidadores e ISPs 30k+.',
    pricePerSubscriberCents: -1, // sob consulta — base 2,50 com volume negociado
    floorCents: -1,
    maxSubscribers: null,
    modules: 'all',
    features: [
      'Tudo da Autonomia',
      'Desconto por volume sobre a base de R$ 2,50/assinante',
      'CSM dedicado + SLA contratual',
      'Success fee opcional sobre recuperação de inadimplência',
      'Kit compliance/auditoria (trilha imutável das ações da IA)',
    ],
  },
};

/** Preço mensal em centavos para um degrau e nº de assinantes do ISP. */
export function monthlyPriceCents(tier: AstrumTier, subscribers: number): number {
  const def = ASTRUM_LADDER[tier];
  if (def.pricePerSubscriberCents < 0) return -1; // sob consulta
  const raw = def.pricePerSubscriberCents * Math.max(0, subscribers);
  return Math.max(def.floorCents, raw);
}

/** Degrau recomendado pelo tamanho do ISP (a venda pode subir, nunca descer). */
export function tierForSubscribers(subscribers: number): AstrumTier {
  if (subscribers > 30000) return 'enterprise';
  if (subscribers > 1000) return 'autonomia';
  return 'operacao'; // <1k: entrada paga é Operação; Radar é a isca grátis
}

/** O degrau comporta esse nº de assinantes? (Radar/Operação travam em 1.000) */
export function tierAllowsSubscribers(tier: AstrumTier, subscribers: number): boolean {
  const max = ASTRUM_LADDER[tier].maxSubscribers;
  return max === null || subscribers <= max;
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
