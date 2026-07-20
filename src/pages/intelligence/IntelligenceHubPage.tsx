import React from 'react';
import { Sparkles, Wrench, ShieldCheck, Network, Database, Target, Activity, Terminal, FlaskConical, RefreshCw, TrendingDown, Trophy, Tags, FileSearch, Plug, HeartPulse, TrendingUp, PhoneCall, Brain, Radio, Zap } from 'lucide-react';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { ptBR } from '@/src/lib/i18n/pt-br';
import { supabase } from '@/src/lib/supabase';
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
  /** Quando true, o card exige role=super_admin além da flag. */
  superAdminOnly?: boolean;
}

// Registry de módulos da Central de Inteligência. Cada sessão futura adiciona sua entrada.
export const BRANCH_REGISTRY: Branch[] = [
  { key: 'toolreg', title: 'Ferramentas do Agente', description: 'Controle o que a IA pode fazer no seu provedor.', icon: Wrench, route: '/intelligence/tools' },
  { key: 'safety', title: 'Guardrails', description: 'Vetos do classificador de segurança e revisão humana.', icon: ShieldCheck, route: '/intelligence/guardrails' },
  { key: 'graphrag', title: 'Grafo da Rede', description: 'Impacto de falhas, reincidência e capacidade por CTO.', icon: Network, route: '/intelligence/graph' },
  { key: 'features', title: 'Catálogo de Features', description: 'As variáveis que alimentam os modelos preditivos.', icon: Database, route: '/intelligence/features' },
  { key: 'bandit', title: 'Campanhas Inteligentes', description: 'Variantes de mensagem de cobrança competindo por conversão.', icon: Target, route: '/intelligence/campaigns' },
  { key: 'drift', title: 'Drift do Modelo', description: 'A conversa dos clientes mudou? O modelo continua calibrado?', icon: Activity, route: '/intelligence/drift' },
  // IA-38: sandbox passa a exigir super_admin (duplo gate, alinhado com sandbox.routes.ts:65).
  { key: 'sandbox', title: 'Sandbox SQL', description: 'Console analítico somente leitura, com histórico auditado.', icon: Terminal, route: '/intelligence/sandbox', superAdminOnly: true },
  { key: 'churn', title: 'Risco de Churn', description: 'Probabilidade de cancelamento por cliente, com breakdown explicável.', icon: TrendingDown, route: '/intelligence/churn' },
  { key: 'synthdata', title: 'Dados Sintéticos', description: 'Gere conversas de teste para load e avaliação.', icon: FlaskConical, route: '/intelligence/synthetic', superAdminOnly: true },
  { key: 'replay', title: 'Replay de Conversas', description: 'Rode conversas reais contra o motor atual antes de qualquer cutover.', icon: RefreshCw, route: '/intelligence/replay' },
  { key: 'elo', title: 'Ranking de Modelos', description: 'Elo das configurações de modelo e prompt do seu ambiente.', icon: Trophy, route: '/intelligence/models' },
  { key: 'activelearn', title: 'Rotulagem de Exemplos', description: 'Corrija e exporte dados de treino coletados do fluxo real.', icon: Tags, route: '/intelligence/labeling' },
  { key: 'reviewqueue', title: 'Revisão de Documentos', description: 'Confirme extrações de boletos e faturas com baixa confiança.', icon: FileSearch, route: '/intelligence/review-queue' },
  { key: 'mcp', title: 'Conexões MCP', description: 'Conecte o Claude e outros clientes aos dados do seu provedor.', icon: Plug, route: '/intelligence/mcp' },
  { key: 'netanomaly', title: 'Saúde da Rede', description: 'Anomalias detectadas via EWMA + z-score em métricas de rede.', icon: HeartPulse, route: '/intelligence/network-health' },
  { key: 'forecast', title: 'Previsão de Demanda', description: 'Média móvel sazonal com sugestão de staffing por dia.', icon: TrendingUp, route: '/intelligence/staffing' },
  { key: 'voiceqa', title: 'Qualidade de Voz', description: 'Scorecard automático de todas as chamadas.', icon: PhoneCall, route: '/intelligence/voice-qa' },
  { key: 'reflections', title: 'Cérebro Noturno', description: 'O que a Astrum pensou enquanto você dormia.', icon: Brain, route: '/intelligence/reflections' },
  { key: 'incidents', title: 'Incidentes de Rede', description: 'NOC autônomo: da suspeita à normalização, com gate humano.', icon: Radio, route: '/intelligence/incidents' },
  { key: 'genesis', title: 'WhatsApp Engine', description: 'Análise retroativa do histórico de conversas da sua base.', icon: Zap, route: '/intelligence/genesis' },
];

export function IntelligenceHubPage() {
  const { flags, isLoading } = useFeatureFlags();
  const navigate = useNavigate();

  // IA-45: gate adicional — card synthdata só aparece para super_admin.
  // Mesmo padrão do Sidebar.tsx (consulta role na tabela users, não no JWT).
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) {
        if (mounted) setIsSuperAdmin(false);
        return;
      }
      supabase
        .from('users')
        .select('role')
        .eq('id', uid)
        .maybeSingle()
        .then(
          ({ data }) => {
            if (mounted) setIsSuperAdmin(data?.role === 'super_admin');
          },
          () => {
            if (mounted) setIsSuperAdmin(false);
          },
        );
    });
    return () => {
      mounted = false;
    };
  }, []);

  const visibleBranches = React.useMemo(
    () =>
      BRANCH_REGISTRY.filter((b) => {
        if (!flags[b.key]) return false;
        if (b.superAdminOnly && !isSuperAdmin) return false;
        return true;
      }),
    [flags, isSuperAdmin],
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
