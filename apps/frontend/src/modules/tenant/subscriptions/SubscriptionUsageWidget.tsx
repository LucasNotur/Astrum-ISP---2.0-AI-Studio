import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/src/components/ui/dialog';
import { AlertTriangle, ShieldAlert, Zap, Box, MessageSquare, Bot, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ==========================================
// 1. Inline Shadcn/UI Componentes (Simulados para garantir portabilidade completa no arquivo)
// ==========================================

const Progress = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: number; indicatorClass?: string }
>(({ className, value, indicatorClass, ...props }, ref) => (
  <div
    ref={ref}
    className={`relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-800 ${className || ''}`}
    {...props}
  >
    <div
      className={`h-full w-full flex-1 transition-all duration-500 ease-in-out ${indicatorClass || 'bg-violet-600'}`}
      style={{ transform: `translateX(-${100 - Math.min(Math.max(value || 0, 0), 100)}%)` }}
    />
  </div>
));
Progress.displayName = "Progress";

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }
>(({ className, variant = "default", ...props }, ref) => {
  const baseClass = "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground";
  const variantClass = variant === "destructive" 
    ? "border-red-500/50 text-red-500 bg-red-500/10 [&>svg]:text-red-500" 
    : "bg-zinc-900 text-zinc-50 border-zinc-800";
    
  return (
    <div
      ref={ref}
      role="alert"
      className={`${baseClass} ${variantClass} ${className || ''}`}
      {...props}
    />
  );
});
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={`mb-1 font-semibold leading-none tracking-tight ${className || ''}`}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`text-sm [&_p]:leading-relaxed ${className || ''}`}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

// ==========================================
// 2. Types & Mock APIs
// ==========================================

interface MetricUsage {
  id: string;
  name: string;
  type: 'tokens_ia' | 'mensagens_whatsapp' | 'clientes_ativos' | 'storage_gb';
  current: number;
  limit: number;
  unit: string;
}

interface UpgradePlan {
  id: string;
  name: string;
  base_price: number;
  prorated_price: number;
  features: string[];
}

const mockFetchUsage = async (): Promise<MetricUsage[]> => {
  return new Promise((resolve) => setTimeout(() => {
    resolve([
      { id: '1', name: 'Tokens de IA', type: 'tokens_ia', current: 880000, limit: 1000000, unit: 'tokens' },
      { id: '2', name: 'Mensagens de WhatsApp', type: 'mensagens_whatsapp', current: 9500, limit: 10000, unit: 'msg' },
      { id: '3', name: 'Clientes Ativos', type: 'clientes_ativos', current: 400, limit: 1000, unit: 'cli' },
    ]);
  }, 600));
};

const mockFetchPlans = async (): Promise<UpgradePlan[]> => {
  return new Promise((resolve) => setTimeout(() => {
    resolve([
      { id: 'pro', name: 'Pro', base_price: 299.0, prorated_price: 154.50, features: ['2M Tokens IA', '15k Mensagens', 'Ilimitados Clientes'] },
      { id: 'enterprise', name: 'Enterprise', base_price: 599.0, prorated_price: 380.00, features: ['10M Tokens IA', '50k Mensagens', 'Gerente Dedicado'] }
    ]);
  }, 400));
};

// ==========================================
// 3. Componente Principal
// ==========================================

export default function SubscriptionUsageWidget() {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Queries
  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ['subscription_usage'],
    queryFn: mockFetchUsage,
  });

  const { data: plans, isLoading: isPlansLoading } = useQuery({
    queryKey: ['upgrade_plans'],
    queryFn: mockFetchPlans,
    enabled: isUpgradeModalOpen,
  });

  // Mutação com Idempotency-Key
  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
      const idempotencyKey = crypto.randomUUID(); // ou uuidv4()
      console.log('Enviando requisição de upgrade com X-Idempotency-Key:', idempotencyKey);
      
      // Delay simulado de transação financeira
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { planId, idempotencyKey };
    },
    onSuccess: () => {
      toast.success('Upgrade efetuado com sucesso!', {
        description: 'Os novos limites já estão ativos na sua conta.',
      });
      setIsUpgradeModalOpen(false);
    },
    onError: () => {
      toast.error('Erro ao processar upgrade', {
        description: 'Não foi possível completar a transação.',
      });
    }
  });

  // Lógica de Psicologia das Cores
  const getProgressState = (percentage: number) => {
    if (percentage >= 90) return { color: 'bg-red-500 animate-pulse', status: 'critical' };
    if (percentage >= 75) return { color: 'bg-amber-500', status: 'warning' };
    return { color: 'bg-emerald-500', status: 'safe' };
  };

  const getMetricIcon = (type: string) => {
    switch (type) {
      case 'tokens_ia': return <Bot className="h-4 w-4 text-gray-500" />;
      case 'mensagens_whatsapp': return <MessageSquare className="h-4 w-4 text-gray-500" />;
      case 'clientes_ativos': return <Box className="h-4 w-4 text-gray-500" />;
      default: return <Zap className="h-4 w-4 text-gray-500" />;
    }
  };

  const isCritical = metrics?.some(m => (m.current / m.limit) * 100 >= 90);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300 p-4 md:p-6">
      
      {/* Alerta Crítico (High Priority) */}
      {isCritical && (
        <Alert variant="destructive" className="border-red-500 border-2 shadow-sm animate-in slide-in-from-top-4">
          <ShieldAlert className="h-6 w-6" />
          <AlertTitle className="text-lg">Alerta Crítico: Risco de Bloqueio Automático</AlertTitle>
          <AlertDescription className="mt-1 font-medium">
            Uma ou mais métricas do seu plano ultrapassaram 90% da franquia contratada. 
            O sistema entrará em modo de contingência estático ao atingir 100% para evitar travamentos operacionais. 
            Recomendamos o upgrade imediato para garantir a disponibilidade.
          </AlertDescription>
        </Alert>
      )}

      {/* Widget Card */}
      <Card className="border border-zinc-800 bg-zinc-900 shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-950/50 border-b border-zinc-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-zinc-50">Consumo do Plano (Provedor)</CardTitle>
              <CardDescription className="text-zinc-400">
                Acompanhe o uso em tempo real do seu pacote "StartUP Mensal"
              </CardDescription>
            </div>
            
            <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2 shadow-sm transition-all justify-center">
                  <Zap className="h-4 w-4" fill="currentColor" />
                  Efetuar Upgrade de Plano
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] border-zinc-800 bg-zinc-900 text-zinc-50">
                <DialogHeader>
                  <DialogTitle>Migração e Upgrade (Pro-rata)</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    O sistema calculou o valor proporcional dos dias restantes. A migração das franquias ocorre instantaneamente.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  {isPlansLoading ? (
                    <div className="flex justify-center p-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-700 border-t-zinc-300" />
                    </div>
                  ) : (
                    plans?.map((plan) => (
                      <div 
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`p-4 border rounded-xl cursor-pointer transition-all duration-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between ${
                          selectedPlanId === plan.id 
                          ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500' 
                          : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <h4 className="font-semibold text-lg text-zinc-50">{plan.name}</h4>
                          <ul className="text-sm text-zinc-400 space-y-1">
                            {plan.features.map(f => (
                              <li key={f} className="flex items-center gap-1.5">
                                <AlertCircle className="h-3 w-3 text-emerald-500" /> {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-sm text-zinc-400">Valor Proporcional Hoje</p>
                          <p className="text-2xl font-bold text-zinc-50">
                            R$ {plan.prorated_price.toFixed(2)}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">Renova a R$ {plan.base_price.toFixed(2)}/mês</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <DialogFooter className="border-t border-zinc-800 pt-4 sm:justify-end">
                  <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => setIsUpgradeModalOpen(false)}>Cancelar</Button>
                  <Button 
                    disabled={!selectedPlanId || upgradeMutation.isPending} 
                    onClick={() => {
                      if (selectedPlanId) upgradeMutation.mutate(selectedPlanId);
                    }}
                    className="min-w-[140px] bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {upgradeMutation.isPending ? 'Processando...' : 'Confirmar Pagamento'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

          </div>
        </CardHeader>
        <CardContent className="pt-6">
          
          {isMetricsLoading ? (
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-zinc-800 rounded animate-pulse w-32" />
                  <div className="h-3 bg-zinc-800 rounded-full animate-pulse w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {metrics?.map((metric) => {
                const percentage = (metric.current / metric.limit) * 100;
                const { color, status } = getProgressState(percentage);

                return (
                  <div key={metric.id} className="space-y-2.5">
                    
                    {/* Header da Métrica */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getMetricIcon(metric.type)}
                        <h4 className="font-medium text-zinc-50">{metric.name}</h4>
                        {status === 'warning' && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 ml-2" title="Cota próxima do fim" />
                        )}
                        {status === 'critical' && (
                          <ShieldAlert className="h-4 w-4 text-red-500 animate-pulse ml-2" title="Gatilho de Contingência iminente!" />
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold ${status === 'critical' ? 'text-red-500' : 'text-zinc-50'}`}>
                          {metric.current.toLocaleString('pt-BR')}
                        </span>
                        <span className="text-zinc-400 text-sm"> / {metric.limit.toLocaleString('pt-BR')} {metric.unit}</span>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    <Progress 
                      value={percentage} 
                      indicatorClass={color}
                      className="h-2.5 bg-zinc-800"
                    />

                    {/* Informações Extras de Status */}
                    {status === 'critical' && (
                      <p className="text-xs text-red-500 font-medium">Você utilizou {percentage.toFixed(1)}% do seu limite. A plataforma será pausada em {metric.limit - metric.current} {metric.unit}.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </CardContent>
      </Card>
      
    </div>
  );
}
