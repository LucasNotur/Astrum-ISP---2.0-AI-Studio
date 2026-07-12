/** Registry of toggleable product modules.
 *  Key matches the sidebar canAccess() tab name.
 *  Stored per-tenant in tenants.enabled_modules (JSONB).
 *  Default: all enabled (absence of a key = enabled).
 */
export interface ModuleDefinition {
  key: string;
  label: string;
  description: string;
  category: string;
  /** Modules the admin cannot disable (core operational) */
  protected?: boolean;
}

export const MODULES_REGISTRY: ModuleDefinition[] = [
  // ── Atendimento ─────────────────────────────────────────────────────────────
  { key: 'customers',       label: 'Clientes',              description: 'Cadastro e perfil de clientes.',                         category: 'Atendimento' },
  { key: 'tickets',         label: 'Tickets de Suporte',    description: 'Fila de chamados e histórico.',                          category: 'Atendimento' },
  { key: 'chat',            label: 'Chat Unificado',        description: 'Inbox de mensagens em tempo real.',                      category: 'Atendimento' },
  { key: 'os',              label: 'Ordens de Serviço',     description: 'CRM técnico e agenda de campo.',                         category: 'Atendimento' },

  // ── Infra & Gestão ───────────────────────────────────────────────────────────
  { key: 'billing',         label: 'Financeiro',            description: 'Faturas, assinaturas e inadimplência.',                  category: 'Infra & Gestão' },
  { key: 'inventory',       label: 'Estoque',               description: 'Controle de materiais e equipamentos.',                  category: 'Infra & Gestão' },
  { key: 'map',             label: 'Mapa de Cobertura',     description: 'Visualização geográfica da rede e CTOs.',                category: 'Infra & Gestão' },
  { key: 'team',            label: 'Equipe',                description: 'Gestão de operadores e permissões.',                     category: 'Infra & Gestão' },

  // ── Inteligência & Automação ─────────────────────────────────────────────────
  { key: 'cobrai',          label: 'CobrAI',                description: 'Régua de cobrança automatizada com IA.',                 category: 'Inteligência & Automação' },
  { key: 'kb',              label: 'Base de Conhecimento',  description: 'Artigos e vetorização para o atendente IA.',             category: 'Inteligência & Automação' },
  { key: 'intelligence',    label: 'Central de Inteligência', description: 'Hub com análises preditivas e ferramentas de IA.',     category: 'Inteligência & Automação' },

  // ── Relatórios & Monitoria ───────────────────────────────────────────────────
  { key: 'bi',              label: 'Business Intelligence', description: 'Relatórios e gráficos executivos.',                      category: 'Relatórios & Monitoria' },
  { key: 'quality-monitor', label: 'Monitor de Qualidade',  description: 'CSAT, NPS e avaliações de atendimento.',                 category: 'Relatórios & Monitoria' },
  { key: 'observability',   label: 'Logs e Auditoria IA',   description: 'Custo de tokens, rastreio de chamadas à IA.',            category: 'Relatórios & Monitoria' },
  { key: 'monitoring',      label: 'Monitoramento',         description: 'Alertas de falhas e fila de mensagens mortas.',          category: 'Relatórios & Monitoria' },
];

export const MODULE_CATEGORIES = [
  'Atendimento',
  'Infra & Gestão',
  'Inteligência & Automação',
  'Relatórios & Monitoria',
] as const;
