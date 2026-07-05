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
  },
} as const;

export type PtBR = typeof ptBR;
