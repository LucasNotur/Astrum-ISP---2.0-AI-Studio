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

export type PtBR = typeof ptBR;
