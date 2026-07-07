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
    synthetic: {
      title: 'Dados Sintéticos',
      subtitle: 'Gere conversas de teste marcadas como sintéticas para carga e avaliação.',
      amberBanner: 'Disponível apenas em tenants de teste. Os dados gerados são fictícios e marcados como sintéticos.',
      notSandbox: 'Este provedor não é um ambiente de teste.',
      notSandboxHint: 'A geração sintética só é permitida em tenants marcados como sandbox no banco. Fale com a engenharia para liberar este provedor.',
      notSuperAdmin: 'Recurso restrito a super_admin.',
      notSuperAdminHint: 'Esta tela só pode ser usada por usuários com role super_admin no banco.',
      flagOff: 'Recurso desabilitado neste ambiente (SYNTH_DATA_ENABLED=false).',
      form: {
        conversationsLabel: 'Conversas a gerar',
        conversationsHelp: 'Quantas conversas sintéticas serão geradas via OpenAI Batch API.',
        intentMixTitle: 'Mix de intents',
        intentMixHelp: 'A soma deve fechar em 100%. O sistema usa este mix para variar o dataset.',
        remaining: (n: number) => `Restante: ${n}%`,
        mediaLabel: (pct: number) => `Mídia (anexos): ${pct}%`,
        mediaHelp: '0–30%. Percentual de conversas que terão has_media=true.',
        submit: 'Gerar dataset',
        submitting: 'Enfileirando...',
      },
      phases: {
        queued: 'Na fila...',
        generating: 'Gerando com a Batch API — isso pode levar até 24h; pode fechar a página.',
        inserting: 'Inserindo conversas...',
        done: (n: number) => `${n} conversas sintéticas criadas.`,
        failed: 'Falha na geração.',
      },
      stats: {
        generated: 'Geradas',
        discarded: 'Descartadas',
        status: 'Status',
      },
    },
    replay: {
      title: 'Replay de Conversas',
      subtitle:
        'Reexecute conversas reais contra o motor atual em modo dry-run e meça a equivalência com a resposta original.',
      stepSample: {
        title: 'Amostra',
        fromLabel: 'Data inicial',
        toLabel: 'Data final',
        sampleLabel: 'Tamanho da amostra',
        sampleHint: (n: number) => `≈ ${n} conversas do período (estimativa)`,
        next: 'Continuar',
        back: 'Voltar',
        invalidRange: 'A data inicial deve ser anterior à data final.',
      },
      stepConfirm: {
        title: 'Confirmar',
        body:
          'O replay reexecuta as conversas SEM enviar mensagens e SEM executar ações reais (modo seco). ' +
          'Tools de escrita (suspender sinal, abrir ticket, agendar visita técnica) são neutralizadas.',
        start: 'Iniciar replay',
        cancel: 'Cancelar',
      },
      status: {
        queued: 'Na fila',
        running: 'Em execução',
        done: 'Concluído',
        failed: 'Falhou',
      },
      runColumns: {
        date: 'Data',
        sample: 'Amostra',
        status: 'Status',
        passRate: 'Equivalência',
      },
      empty: {
        title: 'Nenhum replay executado.',
        description:
          'Execute o primeiro replay para validar o motor atual contra o histórico antes de qualquer cutover.',
        cta: 'Iniciar o primeiro replay',
      },
      detail: {
        title: 'Detalhe da corrida',
        passRateLabel: 'Equivalência',
        verdictFilter: {
          all: 'Todos os vereditos',
          equivalente: 'Equivalentes',
          divergente: 'Divergentes',
          erro: 'Com erro',
        },
        columns: {
          original: 'Resposta original',
          candidate: 'Resposta do motor',
          rationale: 'Justificativa',
        },
        divergenteBadge: 'Divergente',
        export: 'Exportar relatório',
        exporting: 'Exportando...',
        rationaleMissing: '(sem justificativa)',
      },
      toasts: {
        started: 'Replay iniciado — acompanhe o status aqui.',
        loadError: 'Não foi possível carregar a lista de replays.',
        detailError: 'Não foi possível carregar o detalhe da corrida.',
        exportOk: 'Relatório exportado.',
        exportError: 'Falha ao exportar relatório.',
      },
    },
  },
} as const;

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export type PtBR = typeof ptBR;
