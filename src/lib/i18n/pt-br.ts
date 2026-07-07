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
    guardrails: {
      title: 'Guardrails',
      subtitle: 'Vetos do classificador de segurança e revisão humana.',
      stats: {
        vetosToday: 'Vetos hoje',
        vetoRate7d: 'Taxa de veto 7d',
        falsePositiveRate: 'Falsos positivos',
      },
      pendingTitle: 'Pendentes de revisão',
      buttons: {
        vetoCorrect: 'Veto correto',
        falsePositive: 'Falso positivo',
      },
      toasts: {
        reviewRegistered: 'Revisão registrada.',
      },
      emptyState: {
        title: 'Nenhum veto pendente de revisão.',
        description: 'O classificador está ativo e nenhuma resposta foi vetada recentemente.',
      },
      loadError: 'Não foi possível carregar os vetos. Recarregue a página.',
      reload: 'Recarregar',
    },
    graphrag: {
      title: 'Grafo da Rede',
      subtitle: 'Impacto de falhas, reincidência e capacidade por CTO.',
      tabs: {
        impact: 'Impacto',
        recurrence: 'Reincidência',
        capacity: 'Capacidade',
      },
      impact: {
        ctoLabel: 'CTO',
        selectPlaceholder: 'Escolha uma CTO',
        calculate: 'Calcular impacto',
        emptyState: 'Escolha uma CTO para simular o impacto de uma falha.',
        stats: {
          customersAffected: 'Clientes afetados',
          withOpenTicket: 'Com ticket aberto',
          mrrAtRisk: 'MRR em risco',
        },
        customersTitle: 'Clientes na CTO',
      },
      recurrence: {
        daysLabel: 'Janela (dias)',
        daysOptions: [7, 30, 90],
        columns: {
          cto: 'CTO',
          tickets: 'Tickets',
          risk: 'Risco',
        },
      },
      capacity: {
        columns: {
          cto: 'CTO',
          occupancy: 'Ocupação',
          ports: 'Portas',
          risk: 'Risco',
        },
        viewOnMap: 'Ver no mapa',
        emptyState: 'Nenhuma CTO acima de 85% de ocupação.',
      },
      risk: {
        baixo: 'Baixo',
        medio: 'Médio',
        alto: 'Alto',
        critico: 'Crítico',
      },
      loadError: 'Não foi possível carregar o grafo. Tente novamente.',
      retry: 'Tentar novamente',
    },
    risk: {
      baixo: 'Baixo',
      medio: 'Médio',
      alto: 'Alto',
      critico: 'Crítico',
      'sem-dado': 'Sem dado',
    },
    features: {
      title: 'Catálogo de Features',
      subtitle: 'As variáveis pré-computadas que alimentam os modelos preditivos.',
      columns: {
        name: 'Feature',
        describe: 'Descrição',
        entities: 'Entidades',
        computedAt: 'Atualizada',
        ttl: 'TTL',
      },
      ttlHours: (h: number) => `${h}h`,
      empty: {
        title: 'Nenhuma feature computada ainda.',
        body: 'O cálculo roda toda noite às 02h. Você também pode aguardar a primeira execução do worker.',
      },
    },
    campaigns: {
      title: 'Campanhas Inteligentes',
      subtitle: 'Variantes de mensagem de cobrança competindo por conversão.',
      badges: {
        exploring: 'explorando',
        converged: 'convergiu',
      },
      columns: {
        variant: 'Variante',
        template: 'Template',
        sends: 'Envios',
        conversion: 'Conversão',
        status: 'Status',
      },
      status: {
        active: 'Ativa',
        paused: 'Pausada',
      },
      ci: (low: number, high: number) => `IC95: ${formatPct(low)}–${formatPct(high)}`,
      conversionPct: (n: number) => formatPct(n),
      actions: {
        pause: 'Pausar',
        resume: 'Reativar',
        newVariant: 'Nova variante',
        createFirst: 'Criar primeira variante',
        templateLabel: 'Template',
        templateHint:
          'Variáveis disponíveis: {{customerName}}, {{amountBRL}}, {{paymentLink}}, {{daysOverdue}}, {{invoiceId}}.',
        campaignKeyLabel: 'Chave da campanha',
        campaignKeyPlaceholder: 'ex.: cobranca_d1',
        variantKeyLabel: 'Chave da variante',
        variantKeyPlaceholder: 'ex.: A',
        save: 'Criar variante',
        cancel: 'Cancelar',
      },
      pauseDialog: {
        title: (variantKey: string) => `Pausar a variante ${variantKey}?`,
        body:
          'Ela sai do sorteio imediatamente. Os envios já feitos continuam contando conversão.',
        confirm: 'Pausar',
        cancel: 'Cancelar',
      },
      toasts: {
        paused: 'Variante pausada — tráfego realocado.',
        resumed: 'Variante reativada — voltou ao sorteio.',
        created: 'Variante criada.',
        error: 'Não foi possível concluir. Tente de novo.',
      },
      empty: {
        title: 'Nenhuma campanha com variantes ainda.',
        body: 'Crie a primeira variante para que o bandit comece a explorar e convergir.',
      },
    },
  },
} as const;

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export type PtBR = typeof ptBR;
