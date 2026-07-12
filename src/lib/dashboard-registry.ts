export interface DashboardWidgetDef {
  id: string;
  label: string;
  description: string;
}

export const OVERVIEW_WIDGETS: DashboardWidgetDef[] = [
  {
    id: 'operation-summary',
    label: 'Resumo da Operação',
    description: 'Status geral, pontos de atenção e recomendação executiva.',
  },
  {
    id: 'stat-cards',
    label: 'KPIs Chave',
    description: 'Métricas principais: tickets, MRR, clientes ativos, resolução IA.',
  },
  {
    id: 'feed-and-tickets',
    label: 'Atividade + Tickets Críticos',
    description: 'Feed de atividade recente e chamados urgentes em aberto.',
  },
];

export const DASHBOARD_PRESETS: Record<string, {
  label: string;
  icon: string;
  items: { id: string; visible: boolean }[];
}> = {
  small_isp: {
    label: 'ISP Pequeno',
    icon: '🏠',
    items: [
      { id: 'stat-cards', visible: true },
      { id: 'feed-and-tickets', visible: true },
      { id: 'operation-summary', visible: false },
    ],
  },
  medium_isp: {
    label: 'ISP Médio',
    icon: '🏢',
    items: [
      { id: 'stat-cards', visible: true },
      { id: 'operation-summary', visible: true },
      { id: 'feed-and-tickets', visible: true },
    ],
  },
  large_isp: {
    label: 'ISP Grande',
    icon: '🏭',
    items: [
      { id: 'operation-summary', visible: true },
      { id: 'stat-cards', visible: true },
      { id: 'feed-and-tickets', visible: true },
    ],
  },
};
