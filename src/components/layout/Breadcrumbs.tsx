import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const PATH_LABELS: Record<string, string> = {
  dashboard:        'Dashboard',
  customers:        'Clientes',
  tickets:          'Tickets',
  chat:             'Atendimento',
  os:               'OS',
  billing:          'Financeiro',
  cobrai:           'CobrAI',
  monitoring:       'Monitoramento',
  'quality-monitor':'Qualidade',
  map:              'Mapa',
  team:             'Equipe',
  'ai-config':      'Núcleo IA',
  kb:               'Base de Conhecimento',
  whatsapp:         'WhatsApp',
  settings:         'Configurações',
  security:         'Segurança',
  inventory:        'Estoque',
  bi:               'Business Intelligence',
  observability:    'Logs & Auditoria',
  webhooks:         'Webhooks',
  integrations:     'Integrações ERP',
  'ai-costs':       'Custos IA',
  'super-admin':    'Super Admin',
  intelligence:     'Central de Inteligência',
  replay:           'Replay',
  sandbox:          'Sandbox SQL',
  guardrails:       'Guardrails',
  models:           'Modelos',
  labeling:         'Rotulagem',
  campaigns:        'Campanhas',
  churn:            'Churn',
  staffing:         'Staffing',
  'network-health': 'Saúde da Rede',
  'network-graph':  'Grafo de Rede',
  drift:            'Drift',
  tools:            'Ferramentas',
  mcp:              'MCP',
  synthetic:        'Sintético',
  features:         'Features',
  'voice-qa':       'Voz QA',
  'review-queue':   'Fila de Revisão',
};

function label(segment: string) {
  return PATH_LABELS[segment] ?? segment.replace(/-/g, ' ');
}

export function Breadcrumbs({ className }: { className?: string }) {
  const { pathname } = useLocation();

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav
      aria-label="breadcrumb"
      className={cn('flex items-center gap-1 text-sm text-muted-foreground min-w-0', className)}
    >
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const to = '/' + segments.slice(0, i + 1).join('/');

        return (
          <React.Fragment key={to}>
            {i > 0 && <ChevronRight size={12} className="shrink-0 opacity-40" />}
            {isLast ? (
              <span className="font-medium text-foreground truncate">{label(seg)}</span>
            ) : (
              <Link
                to={to}
                className="hover:text-foreground transition-colors duration-fast truncate"
              >
                {label(seg)}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
