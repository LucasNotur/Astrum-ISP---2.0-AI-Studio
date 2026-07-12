export interface OnboardingStep {
  title: string;
  description: string;
  icon: string;
  hint?: string;
}

export const ONBOARDING_STEPS: Record<string, OnboardingStep[]> = {
  admin: [
    {
      icon: '👋',
      title: 'Bem-vindo ao Astrum ISP',
      description: 'Você entrou como Administrador. Tem acesso completo a todas as funcionalidades do sistema.',
      hint: 'Use o menu lateral para navegar entre os módulos.',
    },
    {
      icon: '📊',
      title: 'Dashboard',
      description: 'O Dashboard mostra a saúde operacional do seu provedor em tempo real: tickets, MRR, clientes ativos e resolução IA.',
      hint: 'Clique em "Configurar" para personalizar quais widgets aparecem e em qual ordem.',
    },
    {
      icon: '🤖',
      title: 'CobrAI e Inteligência',
      description: 'O CobrAI automatiza sua régua de cobrança. A Central de Inteligência reúne análises preditivas e ferramentas de IA.',
      hint: 'Configure a régua em CobrAI → Campanhas.',
    },
    {
      icon: '⚙️',
      title: 'Configurações',
      description: 'Em Configurações você pode personalizar o visual (white-label), habilitar/desabilitar módulos por papel e gerenciar a equipe.',
      hint: 'Aba "Módulos" para controlar o que sua equipe vê.',
    },
  ],
  owner: [
    {
      icon: '👋',
      title: 'Bem-vindo ao Astrum ISP',
      description: 'Você entrou como Dono do Provedor. Tem visão completa das finanças, equipe e inteligência do negócio.',
    },
    {
      icon: '💰',
      title: 'Financeiro e MRR',
      description: 'Acompanhe o Faturamento Recorrente (MRR), inadimplência e upsells automatizados pelo CobrAI no Dashboard.',
      hint: 'Aba "Inteligência Artificial & Preditivo" no Dashboard para previsão de churn.',
    },
    {
      icon: '👥',
      title: 'Equipe e Módulos',
      description: 'Em Configurações você gerencia operadores, define papéis e controla quais módulos cada equipe acessa.',
      hint: 'Aba "Equipe" para convidar colaboradores.',
    },
  ],
  support: [
    {
      icon: '👋',
      title: 'Bem-vindo ao Astrum ISP',
      description: 'Você é Suporte Técnico. Seu foco é atender clientes e resolver chamados com agilidade.',
    },
    {
      icon: '🎫',
      title: 'Tickets e Chat',
      description: 'Receba e responda chamados em Tickets. O Chat Unificado reúne todas as conversas de WhatsApp em um só lugar.',
      hint: 'Tickets vermelhos são urgentes — priorize-os.',
    },
    {
      icon: '📚',
      title: 'Base de Conhecimento',
      description: 'A Base de Conhecimento tem artigos para resolver dúvidas comuns. A IA usa esses artigos para responder automaticamente.',
      hint: 'Quanto mais artigos, mais precisa fica a IA.',
    },
  ],
  tecnico: [
    {
      icon: '👋',
      title: 'Bem-vindo ao Astrum ISP',
      description: 'Você é Técnico de Campo. Aqui você acompanha suas Ordens de Serviço e acessa o mapa de cobertura.',
    },
    {
      icon: '🔧',
      title: 'Ordens de Serviço',
      description: 'Em "OS / Técnico" você vê suas ordens do dia, registra execuções e envia fotos da instalação.',
      hint: 'Instale o app no celular: abra no Chrome e "Adicionar à tela inicial".',
    },
    {
      icon: '🗺️',
      title: 'Mapa de Cobertura',
      description: 'O Mapa mostra CTOs, clientes e pontos de falha em tempo real. Útil para planejar rotas de campo.',
    },
  ],
};

export interface HelpLink {
  label: string;
  description: string;
  path: string;
  icon: string;
}

export const HELP_LINKS: Record<string, HelpLink[]> = {
  admin: [
    { icon: '📊', label: 'Dashboard', description: 'Visão geral da operação', path: '/dashboard' },
    { icon: '👥', label: 'Equipe', description: 'Gerenciar operadores e papéis', path: '/team' },
    { icon: '🧩', label: 'Módulos', description: 'Ativar/desativar funcionalidades', path: '/settings' },
    { icon: '🎨', label: 'Personalização', description: 'Logo, cores e white-label', path: '/settings' },
    { icon: '🤖', label: 'CobrAI', description: 'Configurar régua de cobrança', path: '/cobrai' },
    { icon: '🏦', label: 'Central de Inteligência', description: 'Análises preditivas e IA', path: '/intelligence' },
  ],
  owner: [
    { icon: '📊', label: 'Dashboard Executivo', description: 'MRR, churn e saúde do negócio', path: '/dashboard' },
    { icon: '💰', label: 'Financeiro', description: 'Faturas e inadimplência', path: '/billing' },
    { icon: '🤖', label: 'CobrAI', description: 'Régua de cobrança automatizada', path: '/cobrai' },
    { icon: '📈', label: 'Business Intelligence', description: 'Relatórios executivos', path: '/bi' },
  ],
  support: [
    { icon: '🎫', label: 'Tickets', description: 'Fila de chamados', path: '/tickets' },
    { icon: '💬', label: 'Chat', description: 'Inbox unificado', path: '/chat' },
    { icon: '📚', label: 'Base de Conhecimento', description: 'Artigos e soluções', path: '/kb' },
    { icon: '👤', label: 'Clientes', description: 'Perfis e histórico', path: '/customers' },
  ],
  tecnico: [
    { icon: '🔧', label: 'Minhas OS', description: 'Ordens de serviço do dia', path: '/os' },
    { icon: '🗺️', label: 'Mapa', description: 'Cobertura e CTOs', path: '/map' },
    { icon: '📚', label: 'Base de Conhecimento', description: 'Guias técnicos', path: '/kb' },
  ],
};

export const onboardingKey = (tenantId: string, role: string) =>
  `astrum:onboarding:${tenantId}:${role}:done`;
