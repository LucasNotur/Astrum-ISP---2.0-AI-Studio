import React from 'react';
import { Sparkles, Wrench, ShieldCheck, Network, Database, Target, Activity, Terminal, FlaskConical, RefreshCw } from 'lucide-react';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { RiskStripeCard } from '@/src/components/intelligence/RiskStripeCard';
import { EmptyState } from '@/src/components/intelligence/EmptyState';
import { CardContent } from '@/src/components/ui/card';
import { cn } from '@/src/lib/utils';
import { useNavigate } from 'react-router-dom';

interface Branch {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
  route: string;
}

// Registry de módulos da Central de Inteligência. Cada sessão futura adiciona sua entrada.
export const BRANCH_REGISTRY: Branch[] = [
  { key: 'toolreg', title: 'Ferramentas do Agente', description: 'Controle o que a IA pode fazer no seu provedor.', icon: Wrench, route: '/intelligence/tools' },
  { key: 'safety', title: 'Guardrails', description: 'Vetos do classificador de segurança e revisão humana.', icon: ShieldCheck, route: '/intelligence/guardrails' },
  { key: 'graphrag', title: 'Grafo da Rede', description: 'Impacto de falhas, reincidência e capacidade por CTO.', icon: Network, route: '/intelligence/graph' },
  { key: 'features', title: 'Catálogo de Features', description: 'As variáveis que alimentam os modelos preditivos.', icon: Database, route: '/intelligence/features' },
  { key: 'bandit', title: 'Campanhas Inteligentes', description: 'Variantes de mensagem de cobrança competindo por conversão.', icon: Target, route: '/intelligence/campaigns' },
  { key: 'drift', title: 'Drift do Modelo', description: 'A conversa dos clientes mudou? O modelo continua calibrado?', icon: Activity, route: '/intelligence/drift' },
  { key: 'sandbox', title: 'Sandbox SQL', description: 'Console analítico somente leitura, com histórico auditado.', icon: Terminal, route: '/intelligence/sandbox' },
  { key: 'synthdata', title: 'Dados Sintéticos', description: 'Gere conversas de teste para load e avaliação.', icon: FlaskConical, route: '/intelligence/synthetic' },
  { key: 'replay', title: 'Replay de Conversas', description: 'Rode conversas reais contra o motor atual antes de qualquer cutover.', icon: RefreshCw, route: '/intelligence/replay' },
];

export function IntelligenceHubPage() {
  const { flags, isLoading } = useFeatureFlags();
  const navigate = useNavigate();

  const visibleBranches = React.useMemo(
    () => BRANCH_REGISTRY.filter((b) => flags[b.key]),
    [flags],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          {ptBR.intelligence.hub.title}
        </h1>
        <p className="mt-1 text-muted-foreground">{ptBR.intelligence.hub.subtitle}</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : visibleBranches.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={ptBR.intelligence.hub.emptyState.title}
          description={ptBR.intelligence.hub.emptyState.description}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleBranches.map((branch) => {
            const Icon = branch.icon;
            return (
              <button
                key={branch.key}
                onClick={() => navigate(branch.route)}
                className="text-left transition-transform hover:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RiskStripeCard className="h-full hover:border-l-astrum-fiber">
                  <CardContent className="flex h-full flex-col justify-between p-5">
                    <div className="flex items-start justify-between">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary">
                        <Icon size={24} />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-card-foreground">
                        {branch.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{branch.description}</p>
                    </div>
                  </CardContent>
                </RiskStripeCard>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default IntelligenceHubPage;
