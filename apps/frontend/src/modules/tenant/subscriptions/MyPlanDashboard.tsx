import React, { useState } from 'react';
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
} from '@/src/components/ui/dialog';
import { Lock, CheckCircle2, Zap, Sparkles, TrendingUp, ShieldCheck, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

// ==========================================
// Componentes Inline (Progress Bar)
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
      className={`h-full w-full flex-1 transition-all duration-500 ease-in-out ${indicatorClass || 'bg-brand-600'}`}
      style={{ transform: `translateX(-${100 - Math.min(Math.max(value || 0, 0), 100)}%)` }}
    />
  </div>
));
Progress.displayName = "Progress";

// ==========================================
// Mocks
// ==========================================
const MOCK_USAGES = [
  { id: 'tokens', label: 'Tokens de IA (Chatbot)', current: 85000, limit: 100000, unit: 'tokens' },
  { id: 'storage', label: 'Armazenamento de Arquivos', current: 48, limit: 50, unit: 'GB' },
  { id: 'wpp', label: 'Mensagens WhatsApp', current: 12000, limit: 10000, unit: 'msg' }, // Excedido
];

const MOCK_FEATURES = [
  { id: 'f1', label: 'Dashboard Básico', description: 'Métricas diárias de atendimento.', isUnlocked: true },
  { id: 'f2', label: 'Multi-Atendentes', description: 'Até 5 operadores simultâneos na plataforma.', isUnlocked: true },
  { id: 'f3', label: 'Relatórios Avançados', description: 'Exportação CSV, BI e cruzamento de dados com IA.', isUnlocked: false, requiredPlan: 'Growth', proratedPrice: 145.50 },
  { id: 'f4', label: 'API de Integração', description: 'Webhooks e chaves de API para seu ERP.', isUnlocked: false, requiredPlan: 'Enterprise', proratedPrice: 380.00 },
  { id: 'f5', label: 'Domínio Personalizado', description: 'Acesse o Astrum pelo seu próprio link (CNAME).', isUnlocked: false, requiredPlan: 'Enterprise', proratedPrice: 380.00 },
];

export default function MyPlanDashboard() {
  const [lockedFeature, setLockedFeature] = useState<typeof MOCK_FEATURES[0] | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgradeClick = async () => {
    setIsUpgrading(true);
    // Simula chamada de backend enviando Idempotency-Key
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsUpgrading(false);
    toast.success('Upgrade realizado com sucesso!', {
      description: `O recurso "${lockedFeature?.label}" já está liberado em sua conta.`
    });
    setLockedFeature(null);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage > 100) return 'bg-red-500'; // Excedido (Overage sendo cobrado)
    if (percentage >= 85) return 'bg-amber-500'; // Atenção
    return 'bg-emerald-500'; // Ok
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-50">Meu Plano</h1>
          <p className="text-zinc-400 mt-1">Acompanhe seu consumo mensal e expanda os recursos da sua operação.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-lg shadow-sm text-violet-400 font-medium flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-violet-500" />
            Plano StartUP Ativo
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Lado Esquerdo: Consumo / Cotas */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm">
            <CardHeader className="bg-zinc-950/50 border-b border-zinc-800 pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-zinc-50">
                <TrendingUp className="h-5 w-5 text-zinc-400" />
                Consumo da Franquia
              </CardTitle>
              <CardDescription className="text-zinc-400">Uso atual no ciclo de faturamento corrente.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6 text-zinc-50">
              {MOCK_USAGES.map(usage => {
                const percentage = (usage.current / usage.limit) * 100;
                const isOverage = percentage > 100;

                return (
                  <div key={usage.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-zinc-50">{usage.label}</span>
                      <div className="text-right">
                        <span className={`font-bold ${isOverage ? 'text-red-500' : 'text-zinc-50'}`}>
                          {usage.current.toLocaleString('pt-BR')}
                        </span>
                        <span className="text-zinc-500"> / {usage.limit.toLocaleString('pt-BR')} {usage.unit}</span>
                      </div>
                    </div>
                    
                    <Progress 
                      value={percentage} 
                      className="bg-zinc-800"
                      indicatorClass={getUsageColor(percentage)} 
                    />
                    
                    {isOverage && (
                      <p className="text-xs text-red-500 font-medium">
                        Excedente! Overage tarifado: {(usage.current - usage.limit).toLocaleString('pt-BR')} {usage.unit} extras.
                      </p>
                    )}
                    {!isOverage && percentage >= 85 && (
                      <p className="text-xs text-amber-500 font-medium">
                        Cota próxima do fim. Considere um upgrade.
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
            <CardFooter className="bg-zinc-950/50 border-t border-zinc-800 px-6 py-4">
               <p className="text-xs text-zinc-500 w-full text-center">
                 O faturamento encerra em 5 dias.
               </p>
            </CardFooter>
          </Card>
        </div>

        {/* Lado Direito: Feature Flags (Soft-Locks e Upsell) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-900 shadow-sm h-full">
            <CardHeader className="bg-zinc-900 border-b border-zinc-800 pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-zinc-50">
                <Sparkles className="h-5 w-5 text-violet-500" />
                Módulos e Funcionalidades
              </CardTitle>
              <CardDescription className="text-zinc-400">Expanda os limites da sua operação descobrindo novas integrações.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {MOCK_FEATURES.map(feature => (
                  <div 
                    key={feature.id}
                    onClick={() => !feature.isUnlocked && setLockedFeature(feature)}
                    className={`relative p-4 rounded-xl border transition-all duration-200 ${
                      feature.isUnlocked 
                      ? 'border-zinc-800 bg-zinc-900 hover:border-zinc-700' 
                      : 'border-dashed border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900 hover:border-violet-500/50 hover:shadow-md cursor-pointer group'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {feature.isUnlocked ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <div className="p-1.5 bg-zinc-800 rounded-md group-hover:bg-violet-500/10 group-hover:text-violet-400 transition-colors">
                            <Lock className="h-4 w-4 text-zinc-500 group-hover:text-violet-400" />
                          </div>
                        )}
                        <h4 className={`font-semibold ${feature.isUnlocked ? 'text-zinc-50' : 'text-zinc-400 group-hover:text-zinc-50'}`}>
                          {feature.label}
                        </h4>
                      </div>
                    </div>
                    
                    <p className={`text-sm ${feature.isUnlocked ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {feature.description}
                    </p>

                    {!feature.isUnlocked && (
                      <div className="mt-4 flex items-center text-xs font-medium text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        Desbloquear agora <ArrowRight className="h-3 w-3 ml-1" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Modal de Upsell Elegante */}
      <Dialog open={!!lockedFeature} onOpenChange={(open) => !open && setLockedFeature(null)}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-zinc-800 shadow-2xl bg-zinc-900">
          {/* Banner Hero do Upsell */}
          <div className="bg-gradient-to-r from-violet-900 to-violet-700 p-8 text-center relative overflow-hidden">
             
            {/* Shapes de fundo super decorativos e elegantes */}
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-2xl"></div>
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-24 h-24 rounded-full bg-violet-400/20 blur-xl"></div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="h-14 w-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-inner">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Desbloquear {lockedFeature?.label}</h2>
              <p className="text-violet-100 text-sm max-w-xs mx-auto">
                Este recurso é exclusivo do <strong>Plano {lockedFeature?.requiredPlan}</strong>. Melhore sua operação com mais performance e limites.
              </p>
            </div>
          </div>

          <div className="p-6 bg-zinc-900 space-y-6">
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-400">Valor Proporcional (Pró-rata Hoje)</p>
                <div className="flex items-end gap-1 mt-1">
                  <span className="text-zinc-500 font-medium">R$</span>
                  <span className="text-3xl font-bold text-zinc-50 leading-none">
                    {lockedFeature?.proratedPrice?.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="h-12 w-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                <Zap className="h-5 w-5 text-emerald-400" />
              </div>
            </div>

            <ul className="space-y-3">
               <li className="flex items-start gap-2 text-sm text-zinc-300">
                 <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                 Acesso imediato a: {lockedFeature?.label}
               </li>
               <li className="flex items-start gap-2 text-sm text-zinc-300">
                 <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                 Migração automática de todas as franquias
               </li>
            </ul>

            <Button 
              onClick={handleUpgradeClick}
              disabled={isUpgrading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white h-12 text-base font-medium transition-all shadow-md hover:shadow-lg"
            >
              {isUpgrading ? (
                <div className="flex items-center gap-2">
                   <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                   Processando Pagamento...
                </div>
              ) : 'Fazer Upgrade Agora'}
            </Button>
            
            <p className="text-xs text-center text-zinc-500">
              Pagamento seguro e processamento idempotente via Stripe/API.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}
