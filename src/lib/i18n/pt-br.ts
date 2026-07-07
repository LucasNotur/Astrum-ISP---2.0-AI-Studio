/**
 * Strings centralizadas em pt-BR para as telas novas do módulo Inteligência.
 *
 * RN13/§1: toda string de UI nova vive aqui; nenhum literal solto em componente.
 */

export const ptBR = {
  intelligence: {
    sectionTitle: 'Inteligência',
    hub: {
      title: 'Central de Inteligência',
      subtitle: 'Módulos de IA do seu provedor — ativados por ambiente.',
      emptyState: {
        title: 'Nenhum módulo de inteligência ativo neste ambiente.',
        description: 'Os módulos são ativados por variável de ambiente. Consulte o plano IA-NEXTGEN.',
      },
      modules: {
        hub: {
          title: 'Central de Inteligência',
          description: 'Visão geral dos módulos de IA disponíveis.',
        },
      },
    },
    tools: {
      title: 'Ferramentas do Agente',
      subtitle: 'O que a IA pode executar neste provedor. Alterações valem em até 1 minuto.',
      columns: {
        name: 'Ferramenta',
        usage7d: 'Uso 7d',
        errors7d: 'Erros 7d',
        status: 'Status',
      },
      toasts: {
        disabled: 'Ferramenta desativada — vale em até 1 minuto.',
        enabled: 'Ferramenta reativada.',
        saveError: 'Não foi possível salvar. Verifique sua conexão e tente de novo.',
      },
      confirm: {
        title: (name: string) => `Desativar '${name}'?`,
        body: 'O agente deixa de conseguir suspender sinal de inadimplentes imediatamente. A régua de cobrança automática não é afetada.',
        confirm: 'Desativar',
        cancel: 'Cancelar',
      },
      statusLabels: {
        on: 'Ativa',
        off: 'Desativada',
      },
    },
    risk: {
      baixo: 'Baixo',
      medio: 'Médio',
      alto: 'Alto',
      critico: 'Crítico',
      'sem-dado': 'Sem dado',
    },
    drift: {
      title: 'Drift do Modelo',
      subtitle: 'A conversa dos clientes mudou? O modelo continua calibrado?',
      cards: {
        intents: 'Intents',
        sentimentos: 'Sentimentos',
        psi: (v: number) => v.toFixed(3),
      },
      chart: {
        distribution: 'Distribuição 7d × baseline 28d',
        baseline: 'Baseline 28d',
        actual: 'Últimos 7 dias',
        history: 'PSI diário (30 dias)',
        cutoffMedio: '0.10 — drift moderado',
        cutoffAlto: '0.25 — drift alto',
        xIntent: 'Intent',
        xSentiment: 'Sentimento',
        xDate: 'Data',
      },
      empty: {
        title: 'Coletando a linha de base.',
        body: 'O primeiro relatório de drift sai com 7 dias de conversas classificadas.',
      },
      windows: (actual: number, baseline: number) => `${actual}d × ${baseline}d`,
    },
    aiCosts: {
      tabs: {
        overview: 'Visão geral',
        byCustomer: 'Por cliente',
        byFeature: 'Por feature',
      },
      byCustomer: {
        title: 'Custo por cliente',
        subtitle: 'Top clientes que consumiram tokens. Drill-down: conversas do cliente.',
        columns: {
          customer: 'Cliente',
          conversations: 'Conversas',
          tokens: 'Tokens',
          cost: 'Custo (USD)',
          share: '% do total',
        },
        empty: {
          title: 'Sem dados de atribuição ainda.',
          body: 'Os custos passam a ser atribuídos por cliente a partir da ativação desta versão — os dados antigos não são reprocessados.',
        },
      },
      byFeature: {
        title: 'Custo por feature',
        subtitle: 'Custo agregado por caso de uso (agent_response, classify-intent, …).',
        columns: {
          feature: 'Feature',
          conversations: 'Conversas',
          tokens: 'Tokens',
          cost: 'Custo (USD)',
          share: '% do total',
        },
        empty: {
          title: 'Sem dados de atribuição ainda.',
          body: 'Os custos passam a ser atribuídos por feature a partir da ativação desta versão — os dados antigos não são reprocessados.',
        },
      },
      drill: {
        title: 'Conversas do cliente',
        subtitle: 'Cada linha = 1 conversa com custo atribuído.',
        columns: {
          conversation: 'Conversa',
          cost: 'Custo',
          open: 'Abrir',
        },
        close: 'Fechar',
      },
    },
  },
} as const;

export type PtBR = typeof ptBR;
