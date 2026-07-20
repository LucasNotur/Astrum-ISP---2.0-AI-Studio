import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/src/lib/supabase';
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { toast } from 'sonner';
import { CheckCircle, ChevronRight, ChevronLeft, Loader2, Building2, Users, Wifi, Bot } from 'lucide-react';

// ─── Wizard steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'account',    title: 'Sua conta',        icon: <Users size={20} />,    desc: 'Crie seu login' },
  { id: 'company',    title: 'Seu provedor',      icon: <Building2 size={20} />, desc: 'Dados da empresa' },
  { id: 'network',    title: 'Sua rede',          icon: <Wifi size={20} />,     desc: 'Configuração inicial' },
  { id: 'ai',         title: 'Configure a IA',    icon: <Bot size={20} />,      desc: 'Tom e limites' },
  { id: 'done',       title: 'Pronto!',           icon: <CheckCircle size={20} />, desc: 'Trial de 14 dias ativo' },
];

interface FormData {
  email: string;
  password: string;
  companyName: string;
  cnpj: string;
  city: string;
  state: string;
  avgClients: string;
  primaryERP: string;
  aiTone: string;
  aiScope: string;
}

const ERP_OPTIONS = ['IXC Provedor', 'MKAuth', 'SGP', 'Voalle', 'HubSoft', 'RadiusNet', 'RBX', 'Outro'];

export function SignupPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>({
    email: '', password: '',
    companyName: '', cnpj: '', city: '', state: '',
    avgClients: '', primaryERP: '',
    aiTone: 'amigável e profissional',
    aiScope: 'suporte técnico e financeiro',
  });
  const [tenantCreated, setTenantCreated] = useState<string | null>(null);

  const set = (key: keyof FormData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const currentStep = STEPS[step];

  async function handleNext() {
    if (step === 0) {
      // Validate email+password
      if (!form.email || !form.password) { toast.error('Preencha e-mail e senha'); return; }
      if (form.password.length < 8) { toast.error('Senha deve ter ao menos 8 caracteres'); return; }
    }
    if (step === 1) {
      if (!form.companyName) { toast.error('Informe o nome do provedor'); return; }
    }
    if (step === 3) {
      // Final submit
      await createAccount();
      return;
    }
    setStep(s => s + 1);
  }

  async function createAccount() {
    setLoading(true);
    try {
      // v2 trial signup creates user + tenant with plan=radar_trial + enabled_modules
      const res = await fetch('/api/v2/trial/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ispName: form.companyName,
          email: form.email,
          password: form.password,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Erro ao criar provedor');
      }

      const { tenantId } = await res.json();
      setTenantCreated(tenantId);
      setStep(4); // Done
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao criar conta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Astrum ISP</h1>
          <p className="text-blue-300 text-sm">Atendimento inteligente para provedores</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-blue-500 text-white ring-2 ring-blue-300' :
                'bg-slate-700 text-slate-400'
              }`}>
                {i < step ? <CheckCircle size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-8 transition-all ${i < step ? 'bg-green-500' : 'bg-slate-700'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <Card className="border-0 bg-white/5 backdrop-blur-md shadow-2xl">
          <CardContent className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">{currentStep.icon}</div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{currentStep.title}</h2>
                    <p className="text-xs text-slate-400">{currentStep.desc}</p>
                  </div>
                </div>

                {/* Step 0: Account */}
                {step === 0 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">E-mail</Label>
                      <Input
                        type="email"
                        placeholder="voce@seuisp.com.br"
                        value={form.email}
                        onChange={e => set('email', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Senha (mín. 8 caracteres)</Label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={e => set('password', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px]">
                        ✓ 14 dias grátis
                      </Badge>
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                        ✓ Sem cartão de crédito
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Step 1: Company */}
                {step === 1 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Nome do provedor</Label>
                      <Input
                        placeholder="ISP Conecta Fibra Ltda"
                        value={form.companyName}
                        onChange={e => set('companyName', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">CNPJ (opcional)</Label>
                      <Input
                        placeholder="00.000.000/0001-00"
                        value={form.cnpj}
                        onChange={e => set('cnpj', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-300">Cidade</Label>
                        <Input
                          placeholder="São Paulo"
                          value={form.city}
                          onChange={e => set('city', e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-300">Estado</Label>
                        <Input
                          placeholder="SP"
                          maxLength={2}
                          value={form.state}
                          onChange={e => set('state', e.target.value.toUpperCase())}
                          className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Network */}
                {step === 2 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Número aproximado de clientes</Label>
                      <Input
                        type="number"
                        placeholder="500"
                        value={form.avgClients}
                        onChange={e => set('avgClients', e.target.value)}
                        className="bg-white/10 border-white/20 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Sistema de gestão (ERP)</Label>
                      <div className="grid grid-cols-2 gap-1.5 mt-1">
                        {ERP_OPTIONS.map(erp => (
                          <button
                            key={erp}
                            onClick={() => set('primaryERP', erp)}
                            className={`text-xs py-2 px-3 rounded-md border transition-all ${
                              form.primaryERP === erp
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-white/20 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {erp}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: AI Config */}
                {step === 3 && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Tom de voz da IA</Label>
                      <div className="grid grid-cols-1 gap-1.5">
                        {['amigável e profissional', 'formal e técnico', 'descontraído e próximo'].map(tone => (
                          <button
                            key={tone}
                            onClick={() => set('aiTone', tone)}
                            className={`text-xs py-2.5 px-3 rounded-md border text-left transition-all capitalize ${
                              form.aiTone === tone
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-white/20 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-300">Escopo do atendimento IA</Label>
                      <div className="grid grid-cols-1 gap-1.5">
                        {[
                          'suporte técnico e financeiro',
                          'somente suporte técnico',
                          'somente financeiro/cobrança',
                        ].map(scope => (
                          <button
                            key={scope}
                            onClick={() => set('aiScope', scope)}
                            className={`text-xs py-2.5 px-3 rounded-md border text-left transition-all ${
                              form.aiScope === scope
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'border-white/20 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {scope}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Done */}
                {step === 4 && (
                  <div className="text-center space-y-4 py-4">
                    <div className="flex justify-center">
                      <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                        <CheckCircle size={32} className="text-green-400" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">Bem-vindo ao Astrum!</h3>
                      <p className="text-slate-400 text-sm">Sua conta foi criada. Você tem 14 dias de trial completo.</p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-left space-y-2">
                      <p className="text-xs text-blue-300 font-semibold">Próximos passos:</p>
                      <ul className="text-xs text-slate-300 space-y-1">
                        <li>✅ Confirme seu e-mail ({form.email})</li>
                        <li>🔗 Configure a integração com {form.primaryERP || 'seu ERP'}</li>
                        <li>📱 Conecte seu WhatsApp Business</li>
                        <li>👥 Convide sua equipe de suporte</li>
                      </ul>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => window.location.href = '/dashboard'}
                    >
                      Acessar o painel
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            {step < 4 && (
              <div className="flex justify-between mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(s => s - 1)}
                  disabled={step === 0}
                  className="text-slate-400 hover:text-white"
                >
                  <ChevronLeft size={16} className="mr-1" /> Voltar
                </Button>
                <Button
                  size="sm"
                  onClick={handleNext}
                  disabled={loading}
                  className="gap-1"
                >
                  {loading ? (
                    <><Loader2 size={14} className="animate-spin" /> Criando…</>
                  ) : step === 3 ? (
                    <>Criar conta <CheckCircle size={14} /></>
                  ) : (
                    <>Continuar <ChevronRight size={14} /></>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500 mt-4">
          Já tem uma conta?{' '}
          <a href="/" className="text-blue-400 hover:underline">Fazer login</a>
        </p>
      </div>
    </div>
  );
}
