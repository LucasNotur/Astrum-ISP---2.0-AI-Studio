import React from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/src/components/ui/select';
import { Switch } from '@/src/components/ui/switch';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Trash2, Plus, GripVertical, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// ==========================================
// 1. Zod Schema e Tipos (Domain Validation)
// ==========================================

export const PlanLimitValidator = z.object({
  id: z.string(), // ID interno do frontend para a listagem
  metric_type: z.enum(['tokens_ia', 'clientes_ativos', 'mensagens_whatsapp', 'storage_gb']),
  limit_value: z.number().int().min(-1, 'O limite não pode ser menor que -1'),
  overage_price_per_unit: z.number().min(0, 'O valor mínimo é 0'),
});

export const PlanValidator = z.object({
  name: z.string().min(1, 'O nome do plano é obrigatório'),
  description: z.string().optional(),
  billing_mode: z.enum(['fixed', 'per_active_client', 'hybrid', 'usage_based']),
  base_price: z.number().min(0, 'O preço base não pode ser negativo'),
  currency: z.string().default('BRL'),
  is_active: z.boolean().default(true),
  limits: z.array(PlanLimitValidator).optional(),
});

type PlanFormData = z.infer<typeof PlanValidator>;
type PlanLimitData = z.infer<typeof PlanLimitValidator>;

// ==========================================
// 2. Zustand Store (Gerenciamento de Estado)
// ==========================================

interface PlanCreatorState {
  data: PlanFormData;
  errors: Record<string, string>;
  isSubmitting: boolean;
  updateField: <K extends keyof PlanFormData>(field: K, value: PlanFormData[K]) => void;
  addLimit: () => void;
  updateLimit: (id: string, field: keyof PlanLimitData, value: any) => void;
  removeLimit: (id: string) => void;
  validate: () => boolean;
  submit: () => Promise<void>;
  reset: () => void;
}

const initialData: PlanFormData = {
  name: '',
  description: '',
  billing_mode: 'fixed',
  base_price: 0,
  currency: 'BRL',
  is_active: true,
  limits: [],
};

export const usePlanCreatorStore = create<PlanCreatorState>((set, get) => ({
  data: { ...initialData },
  errors: {},
  isSubmitting: false,

  updateField: (field, value) => {
    set((state) => ({
      data: { ...state.data, [field]: value },
      errors: { ...state.errors, [field]: '' },
    }));
  },

  addLimit: () => {
    set((state) => ({
      data: {
        ...state.data,
        limits: [
          ...(state.data.limits || []),
          {
            id: crypto.randomUUID(),
            metric_type: 'tokens_ia',
            limit_value: 1000,
            overage_price_per_unit: 0,
          },
        ],
      },
      errors: { ...state.errors, limits: '' },
    }));
  },

  updateLimit: (id, field, value) => {
    set((state) => {
      const limits = state.data.limits?.map((limit) =>
        limit.id === id ? { ...limit, [field]: value } : limit
      );
      return { 
        data: { ...state.data, limits } 
      };
    });
  },

  removeLimit: (id) => {
    set((state) => ({
      data: {
        ...state.data,
        limits: state.data.limits?.filter((limit) => limit.id !== id),
      },
    }));
  },

  validate: () => {
    const { data } = get();
    const result = PlanValidator.safeParse(data);
    
    if (!result.success) {
      const formattedErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        formattedErrors[path] = issue.message;
      });
      set({ errors: formattedErrors });
      return false;
    }
    
    set({ errors: {} });
    return true;
  },

  submit: async () => {
    const { validate, data, reset } = get();
    
    if (!validate()) {
      toast.error('O formulário contém erros.', {
        description: 'Verifique os campos em vermelho antes de salvar.',
      });
      return;
    }

    set({ isSubmitting: true });
    
    try {
      // Simulação de delay de rede
      await new Promise(resolve => setTimeout(resolve, 800));
      
      console.log('Payload enviado para o servidor:', data);
      
      toast.success('Plano criado com sucesso!', {
        description: `O plano "${data.name}" agora está disponível para os tenants.`,
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
      });
      
      reset();
    } catch (error) {
      toast.error('Falha ao processar o plano.', {
        description: 'Ocorreu um erro interno de conexão. Tente novamente.',
      });
    } finally {
      set({ isSubmitting: false });
    }
  },
  
  reset: () => {
    set({ data: { ...initialData }, errors: {}, isSubmitting: false });
  }
}));

// ==========================================
// 3. UI Componentes
// ==========================================

export default function PlanCreatorDashboard() {
  const { 
    data, 
    errors, 
    isSubmitting, 
    updateField, 
    addLimit, 
    updateLimit, 
    removeLimit, 
    submit 
  } = usePlanCreatorStore();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Novo Plano</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Crie e configure as regras de negócio de um pacote de assinatura.</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="space-y-6">
        
        {/* Seção 1: Dados Básicos */}
        <Card className="border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <CardTitle className="text-lg">Dados Básicos</CardTitle>
            <CardDescription>
              Informações públicas e modelo de faturamento fundamental do plano.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 grid gap-6 md:grid-cols-2">
            
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nome do Plano <span className="text-red-500">*</span></Label>
              <Input 
                id="name" 
                placeholder="Ex: StartUP PRO" 
                value={data.name}
                onChange={(e) => updateField('name', e.target.value)}
                className={errors.name ? 'border-red-500 ring-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea 
                id="description" 
                placeholder="Detalhes visíveis aos tenants sobre os benefícios do plano..." 
                value={data.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Modo de Cobrança <span className="text-red-500">*</span></Label>
              <Select 
                value={data.billing_mode} 
                onValueChange={(val: any) => updateField('billing_mode', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o modo de cobrança" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Valor Fixo</SelectItem>
                  <SelectItem value="per_active_client">Por Cliente Ativo na Base</SelectItem>
                  <SelectItem value="hybrid">Modelo Híbrido</SelectItem>
                  <SelectItem value="usage_based">Baseado em Consumo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price">Preço Base (R$) <span className="text-red-500">*</span></Label>
              <Input 
                id="base_price" 
                type="number" 
                min="0"
                step="0.01"
                placeholder="0.00" 
                value={data.base_price}
                onChange={(e) => updateField('base_price', parseFloat(e.target.value) || 0)}
                className={errors.base_price ? 'border-red-500' : ''}
              />
              {errors.base_price && <p className="text-sm text-red-500">{errors.base_price}</p>}
            </div>

            <div className="flex items-center space-x-3 rounded-lg border dark:border-zinc-800 p-4 shadow-sm md:col-span-2 bg-white dark:bg-zinc-950">
              <Switch 
                id="is_active" 
                checked={data.is_active}
                onCheckedChange={(val) => updateField('is_active', val)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="text-base">Plano Ativo</Label>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Planos inativos não aparecem na listagem de upgrade dos tenants.
                </p>
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Seção 2: Injetor de Parâmetros Dinâmicos */}
        <Card className="border border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm">
          <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Limites e Cota (Overage)</CardTitle>
              <CardDescription>
                Defina franquias para gatilhos de restrição ou faturamento excedente.
              </CardDescription>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={addLimit}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar Limite
            </Button>
          </CardHeader>
          <CardContent className="pt-6">
            
            {!data.limits || data.limits.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 text-muted-foreground">
                  Nenhum injetor de limite configurado.<br />O plano operará sem restrições métricas caso nada seja adicionado.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.limits.map((limit, index) => {
                  const isUnlimited = limit.limit_value === -1;
                  const limitErrorPath = `limits.${index}.limit_value`;
                  const overageErrorPath = `limits.${index}.overage_price_per_unit`;

                  return (
                    <div 
                      key={limit.id} 
                      className="group flex flex-col md:flex-row gap-4 p-4 items-start md:items-center bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm transition-all hover:border-zinc-300 dark:hover:border-zinc-700 relative"
                    >
                      <div className="hidden md:flex cursor-grab text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400">
                        <GripVertical className="h-5 w-5" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 w-full">
                        
                        {/* Tipo de Métrica */}
                        <div className="md:col-span-4 space-y-1.5">
                          <Label className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Métrica</Label>
                          <Select 
                            value={limit.metric_type} 
                            onValueChange={(val: any) => updateLimit(limit.id, 'metric_type', val)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tokens_ia">Tokens IA</SelectItem>
                              <SelectItem value="clientes_ativos">Clientes Ativos</SelectItem>
                              <SelectItem value="mensagens_whatsapp">Mensagens WhatsApp</SelectItem>
                              <SelectItem value="storage_gb">Storage (GB)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Valor do Limite */}
                        <div className="md:col-span-4 space-y-1.5">
                          <Label className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Franquia</Label>
                          <div className="flex bg-zinc-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-md focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500 overflow-hidden">
                            <Input 
                              type="number" 
                              min="0"
                              disabled={isUnlimited}
                              value={isUnlimited ? '' : limit.limit_value}
                              onChange={(e) => updateLimit(limit.id, 'limit_value', parseInt(e.target.value) || 0)}
                              className="border-0 focus-visible:ring-0 rounded-none bg-transparent dark:text-zinc-50"
                              placeholder={isUnlimited ? '∞ Ilimitado' : 'Qtd'}
                            />
                            <div className="flex items-center px-3 border-l dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 gap-2 shrink-0">
                              <Switch 
                                id={`unlimited-${limit.id}`}
                                className="scale-75 data-[state=checked]:bg-blue-600"
                                checked={isUnlimited}
                                onCheckedChange={(checked) => 
                                  updateLimit(limit.id, 'limit_value', checked ? -1 : 0)
                                }
                              />
                              <Label htmlFor={`unlimited-${limit.id}`} className="text-xs cursor-pointer select-none">Ilimitado</Label>
                            </div>
                          </div>
                          {errors[limitErrorPath] && <p className="text-xs text-red-500">{errors[limitErrorPath]}</p>}
                        </div>

                        {/* Overage */}
                        <div className="md:col-span-3 space-y-1.5">
                          <Label className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wider" title="Custo por Unidade Excedente">
                            Taxa Excedente (R$)
                          </Label>
                          <Input 
                            type="number" 
                            min="0"
                            step="0.0001"
                            disabled={isUnlimited}
                            value={limit.overage_price_per_unit}
                            onChange={(e) => updateLimit(limit.id, 'overage_price_per_unit', parseFloat(e.target.value) || 0)}
                            className={`bg-white dark:bg-zinc-950 dark:text-zinc-50 disabled:bg-zinc-50 dark:disabled:bg-zinc-900 disabled:text-zinc-400 dark:disabled:text-zinc-600 ${errors[overageErrorPath] ? 'border-red-500' : ''}`}
                            placeholder="0.0000"
                          />
                          {errors[overageErrorPath] && <p className="text-xs text-red-500">{errors[overageErrorPath]}</p>}
                        </div>

                        {/* Actions */}
                        <div className="md:col-span-1 flex items-end justify-end pb-[2px]">
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="icon" 
                            className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => removeLimit(limit.id)}
                            title="Remover limite"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
          <CardFooter className="bg-zinc-50/50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 mt-2 px-6 py-4 flex items-center justify-end gap-3">
            <Button 
              type="button" 
              variant="outline"
              disabled={isSubmitting}
              onClick={() => usePlanCreatorStore.getState().reset()}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 min-w-[140px] shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Salvando...
                </>
              ) : (
                <>Salvar Plano</>
              )}
            </Button>
          </CardFooter>
        </Card>

      </form>
    </div>
  );
}
