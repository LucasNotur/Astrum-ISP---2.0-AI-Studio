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
    churn: {
      title: 'Risco de Churn',
      subtitle:
        'Probabilidade de cancelamento por cliente. Modelo linear auditável — o score é a soma de contribuições por feature.',
      gate: {
        flagOff: 'Motor de churn desligado neste ambiente (CHURN_ENGINE=off).',
        loadError: 'Não foi possível carregar os scores. Recarregue a página.',
      },
      stats: {
        critical: 'Clientes em crítico',
        high: 'Clientes em alto',
        mrrAtRisk: 'MRR em risco',
        mrrAtRiskHint: (cents: number) =>
          `Soma do MRR (centavos→R$) de clientes em alto + crítico.`,
      },
      columns: {
        customer: 'Cliente',
        score: 'Score',
        band: 'Banda',
        mrr: 'MRR',
        updatedAt: 'Atualizado',
      },
      empty: {
        title: 'Nenhum score de churn ainda.',
        body: 'O cálculo roda toda noite às 03h (BRT).',
      },
      waterfall: {
        title: (name: string) => `Por que ${name} está em risco?`,
        subtitle: 'Contribuição de cada feature para o score final.',
        feature: 'Feature',
        contribution: 'Contribuição',
        total: 'Score total',
        invariant: (sum: number, score: number) =>
          `Invariante: soma das contribuições = ${sum.toFixed(2)} ≈ score = ${score.toFixed(2)} (±0.01).`,
        contributionLabel: (c: number) => (c >= 0 ? `+${c.toFixed(2)}` : c.toFixed(2)),
        valueLabel: (v: number) => `valor normalizado ${v.toFixed(2)}`,
        weightLabel: (w: number) => `peso ${w}`,
      },
    },
    sandbox: {
      title: 'Sandbox SQL',
      subtitle:
        'Console analítico somente leitura. Cada query executada fica registrada com tenant, usuário, ms e linhas.',
      editor: {
        label: 'Consulta',
        placeholder: 'SELECT * FROM vw_agent_customers WHERE tenant_id = $1 LIMIT 10;',
        hint:
          'Somente SELECT sobre vw_agent_customers, vw_agent_invoices, vw_agent_tickets. Limite 500 linhas, 3s.',
        run: 'Executar consulta',
        running: 'Executando…',
      },
      results: {
        title: 'Resultado',
        ms: (ms: number) => `${ms.toFixed(1)} ms`,
        rows: (n: number) => `${n} linha${n === 1 ? '' : 's'}`,
        empty: 'A consulta não retornou linhas.',
        copyError: 'Não foi possível executar a consulta.',
      },
      errorCard: {
        title: 'Consulta rejeitada pelo guard de SQL',
        genericError: 'Erro',
      },
      history: {
        title: 'Histórico',
        empty: 'Nenhuma consulta executada ainda.',
        cols: {
          when: 'Quando',
          sql: 'SQL',
          rows: 'Linhas',
          ms: 'ms',
        },
        clickHint: 'Clique para carregar a consulta no editor.',
      },
      gate: {
        flagOff: 'Sandbox do agente desabilitado (AGENT_SANDBOX_ENABLED=false).',
        notSuperAdmin: 'Acesso restrito a super_admin.',
        notSuperAdminHint:
          'Esta tela só pode ser usada por usuários com role super_admin no banco.',
        sandboxUnavailable: 'Sandbox indisponível neste ambiente (SANDBOX_DB_URL ausente).',
      },
    },
  },
} as const;

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export type PtBR = typeof ptBR;
