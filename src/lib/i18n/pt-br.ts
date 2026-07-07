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
  },
} as const;

export type PtBR = typeof ptBR;
