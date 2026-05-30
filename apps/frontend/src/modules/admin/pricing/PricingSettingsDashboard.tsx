import React, { useState } from 'react';
import { 
  Plus, Edit, Trash2, Settings, CreditCard, Tag, 
  FileText, CheckCircle2, LayoutDashboard, PlusCircle, Trash
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/src/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/src/components/ui/dialog';
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
import { toast } from 'sonner';

// ==========================================
// Mocks de Dados
// ==========================================
const MOCK_PLANS = [
  { id: '1', name: 'StartUP', type: 'Flat Rate', basePrice: 199.0, cycle: 'Mensal', status: 'Ativo' },
  { id: '2', name: 'Growth', type: 'Tiered', basePrice: 499.0, cycle: 'Mensal', status: 'Ativo' },
  { id: '3', name: 'Enterprise', type: 'Volume', basePrice: 1290.0, cycle: 'Anual', status: 'Rascunho' },
];

const FEATURES_LIST = [
  { id: 'custom_domain', label: 'Domínio Personalizado', description: 'Permite o cliente utilizar seu próprio domínio (CNAME).' },
  { id: 'advanced_analytics', label: 'Relatórios Avançados', description: 'Libera o dashboard completo de BI e exportação CSV.' },
  { id: 'priority_support', label: 'Suporte Prioritário', description: 'SLA de 2 horas e atendimento via WhatsApp.' },
  { id: 'api_access', label: 'Acesso à API (Developers)', description: 'Chaves de API para integrações customizadas.' },
];

export default function PricingSettingsDashboard() {
  const [plans, setPlans] = useState(MOCK_PLANS);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // States do Formulário
  const [strategy, setStrategy] = useState('flat_rate');
  const [tiers, setTiers] = useState([{ id: Date.now(), start: 0, end: '', price: 0 }]);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddTier = () => {
    // Tenta sugerir o início do próximo degrau com base no último "end"
    const lastTier = tiers[tiers.length - 1];
    const newStart = lastTier && lastTier.end ? Number(lastTier.end) + 1 : 0;
    
    setTiers([...tiers, { id: Date.now(), start: newStart, end: '', price: 0 }]);
  };

  const handleRemoveTier = (id: number) => {
    if (tiers.length === 1) return; // Mantém pelo menos 1
    setTiers(tiers.filter(t => t.id !== id));
  };

  const handleUpdateTier = (id: number, field: string, value: string | number) => {
    setTiers(tiers.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const toggleFeature = (featureId: string) => {
    if (enabledFeatures.includes(featureId)) {
      setEnabledFeatures(enabledFeatures.filter(id => id !== featureId));
    } else {
      setEnabledFeatures([...enabledFeatures, featureId]);
    }
  };

  const handleSavePlan = async () => {
    setIsSaving(true);
    // Simular API Call
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsSaving(false);
    setIsModalOpen(false);
    toast.success('Plano criado com sucesso!', {
      description: 'O novo modelo de preço foi salvo e adicionado ao catálogo.'
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-50 w-full animate-in fade-in duration-300">
      
      {/* Sidebar de Navegação */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6">
          <h2 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-brand-600" />
            Astrum Billing
          </h2>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
            <Settings className="h-4 w-4" /> Configurações
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-gray-100 text-gray-900 font-medium transition-colors">
            <Tag className="h-4 w-4 text-brand-600" /> Pricing & Planos
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
            <CreditCard className="h-4 w-4" /> Pagamentos
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors">
            <FileText className="h-4 w-4" /> Faturas Geradas
          </a>
        </nav>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Catálogo e Preços</h1>
              <p className="text-gray-500 mt-1">Gerencie estratégias elásticas, cotas e recursos liberados.</p>
            </div>
            
            {/* Modal / Botão Criar Plano */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gray-900 hover:bg-gray-800 text-white gap-2 shadow-sm">
                  <Plus className="h-4 w-4" />
                  Criar Novo Plano
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-full p-0 gap-0">
                <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">Criar Produto / Plano</DialogTitle>
                    <DialogDescription>
                      Configure a engine de faturamento ponta-a-ponta.
                    </DialogDescription>
                  </div>
                </div>

                <div className="px-6 py-6 space-y-8 bg-gray-50/30">
                  
                  {/* Bloco: Informações Básicas e Estratégia */}
                  <Card className="border-gray-200/60 shadow-sm">
                    <CardHeader className="bg-white rounded-t-xl border-b border-gray-100 pb-4">
                      <CardTitle className="text-lg">1. Estrutura e Estratégia</CardTitle>
                      <CardDescription>Nome, recorrência e como o cliente será cobrado.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 grid gap-6 bg-white rounded-b-xl">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome do Plano</Label>
                          <Input placeholder="Ex: Enterprise Híbrido" />
                        </div>
                        <div className="space-y-2">
                          <Label>Intervalo de Cobrança</Label>
                          <Select defaultValue="monthly">
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Mensal</SelectItem>
                              <SelectItem value="yearly">Anual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Estratégia de Preço</Label>
                          <Select value={strategy} onValueChange={setStrategy}>
                            <SelectTrigger><SelectValue/></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="flat_rate">Taxa Fixa (Flat Rate)</SelectItem>
                              <SelectItem value="tiered">Degraus (Tiered Pricing)</SelectItem>
                              <SelectItem value="volume">Volume Bruto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Preço Base (R$)</Label>
                          <Input type="number" placeholder="0.00" />
                        </div>
                        <div className="space-y-2">
                          <Label>Trial Grátis (Dias)</Label>
                          <Input type="number" placeholder="7" defaultValue={0} />
                        </div>
                      </div>

                      {/* Renderização condicional para Tiered Pricing */}
                      {strategy === 'tiered' && (
                        <div className="mt-4 p-5 bg-blue-50/50 border border-blue-100 rounded-lg space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-blue-900 text-sm">Degraus de Consumo (Tiers)</h4>
                              <p className="text-xs text-blue-700 mt-0.5">Defina o fatiamento matemático para cobrança escalar.</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={handleAddTier} className="h-8 gap-1 border-blue-200 text-blue-700 bg-white hover:bg-blue-50">
                              <PlusCircle className="h-3.5 w-3.5" /> Adicionar Tier
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-gray-500 uppercase">
                              <div className="col-span-3">Início (Und)</div>
                              <div className="col-span-3">Até (Und)</div>
                              <div className="col-span-4">Preço Unitário (R$)</div>
                              <div className="col-span-2 text-right">Ação</div>
                            </div>
                            
                            {tiers.map((tier, index) => (
                              <div key={tier.id} className="grid grid-cols-12 gap-2 items-center">
                                <div className="col-span-3">
                                  <Input 
                                    type="number" 
                                    value={tier.start} 
                                    onChange={(e) => handleUpdateTier(tier.id, 'start', e.target.value)}
                                    className="bg-white h-9" 
                                  />
                                </div>
                                <div className="col-span-3">
                                  <Input 
                                    type="text" 
                                    value={tier.end}
                                    onChange={(e) => handleUpdateTier(tier.id, 'end', e.target.value)}
                                    placeholder="∞ Infinito"
                                    className="bg-white h-9 font-mono" 
                                  />
                                </div>
                                <div className="col-span-4 flex items-center gap-2">
                                  <span className="text-gray-400 text-sm">R$</span>
                                  <Input 
                                    type="number" 
                                    value={tier.price}
                                    step="0.001"
                                    onChange={(e) => handleUpdateTier(tier.id, 'price', e.target.value)}
                                    placeholder="0.05"
                                    className="bg-white h-9" 
                                  />
                                </div>
                                <div className="col-span-2 text-right">
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                    disabled={tiers.length === 1}
                                    onClick={() => handleRemoveTier(tier.id)}
                                  >
                                    <Trash className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Bloco: Capabilities / Feature Flags */}
                  <Card className="border-gray-200/60 shadow-sm">
                    <CardHeader className="bg-white rounded-t-xl border-b border-gray-100 pb-4">
                      <CardTitle className="text-lg">2. Módulos e Features (Soft-Lock)</CardTitle>
                      <CardDescription>Controle via Feature Flags o que este plano libera no app.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 grid gap-4 bg-white rounded-b-xl">
                      {FEATURES_LIST.map(feature => (
                        <div key={feature.id} className="flex items-start space-x-3 rounded-lg border p-4 hover:border-gray-300 transition-colors">
                          <Switch 
                            id={feature.id} 
                            checked={enabledFeatures.includes(feature.id)}
                            onCheckedChange={() => toggleFeature(feature.id)}
                            className="mt-0.5 data-[state=checked]:bg-brand-600"
                          />
                          <div className="space-y-1 leading-none">
                            <Label htmlFor={feature.id} className="text-base font-medium cursor-pointer">
                              {feature.label}
                            </Label>
                            <p className="text-sm text-gray-500">{feature.description}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Bloco: Franquia e Overage */}
                  <Card className="border-gray-200/60 shadow-sm">
                    <CardHeader className="bg-white rounded-t-xl border-b border-gray-100 pb-4">
                      <CardTitle className="text-lg">3. Franquia Inclusa e Overage (Soft-Cap)</CardTitle>
                      <CardDescription>Defina quotas estáticas embutidas no valor fixo do plano.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 grid gap-6 bg-white rounded-b-xl">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                          <h4 className="font-semibold text-gray-900 border-b pb-2 mb-2">Tokens de IA</h4>
                          <div className="space-y-2">
                            <Label className="text-xs">Cota Base Inclusa (Und)</Label>
                            <Input type="number" placeholder="-1 para Ilimitado" className="bg-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Valor Excedente (R$ por Unidade)</Label>
                            <Input type="number" placeholder="0.005" step="0.001" className="bg-white" />
                          </div>
                        </div>

                        <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                           <h4 className="font-semibold text-gray-900 border-b pb-2 mb-2">Armazenamento (GB)</h4>
                          <div className="space-y-2">
                            <Label className="text-xs">Cota Base Inclusa (Und)</Label>
                            <Input type="number" placeholder="-1 para Ilimitado" className="bg-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Valor Excedente (R$ por Unidade)</Label>
                            <Input type="number" placeholder="0.10" step="0.01" className="bg-white" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                </div>

                <div className="sticky bottom-0 z-10 bg-white border-t px-6 py-4 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    O plano criado entrará automático no modo 'Rascunho' por padrão.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                    <Button 
                      onClick={handleSavePlan} 
                      disabled={isSaving}
                      className="bg-gray-900 text-white hover:bg-black min-w-[150px]"
                    >
                      {isSaving ? 'Processando...' : 'Salvar Configuração'}
                    </Button>
                  </div>
                </div>

              </DialogContent>
            </Dialog>
          </div>

          {/* Navegação Superior */}
          <Tabs defaultValue="plans" className="w-full">
            <TabsList className="bg-gray-100/80 mb-6 p-1 rounded-lg h-auto">
              <TabsTrigger value="plans" className="py-2.5 px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Modelos de Preço</TabsTrigger>
              <TabsTrigger value="coupons" className="py-2.5 px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Descontos e Cupons</TabsTrigger>
              <TabsTrigger value="taxes" className="py-2.5 px-4 rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">Impostos</TabsTrigger>
            </TabsList>

            <TabsContent value="plans" className="mt-0">
              <Card className="border-gray-200 shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-[300px]">Nome do Plano</TableHead>
                      <TableHead>Estratégia</TableHead>
                      <TableHead>Preço Base / Ciclo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-medium">
                          {plan.name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <span className="text-gray-600 text-sm bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                              {plan.type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-gray-900 font-semibold">R$ {plan.basePrice.toFixed(2)}</span>
                            <span className="text-xs text-gray-500">{plan.cycle}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {plan.status === 'Ativo' ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80 border-none font-medium">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-none">Rascunho</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-900">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            <TabsContent value="coupons">
              <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                <Tag className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Módulo de Descontos</h3>
                <p className="text-gray-500 mt-1 max-w-sm mx-auto">Em breve: crie cupons percentuais ou de valor fixo limitados por tempo ou por cliente.</p>
              </div>
            </TabsContent>

            <TabsContent value="taxes">
               <div className="p-12 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900">Gestão de Impostos (Nota Fiscal)</h3>
                <p className="text-gray-500 mt-1 max-w-sm mx-auto">Em breve: configure a alíquota base (ISS/ICMS) e retenções de notas automáticas.</p>
              </div>
            </TabsContent>
          </Tabs>

        </div>
      </main>
    </div>
  );
}
