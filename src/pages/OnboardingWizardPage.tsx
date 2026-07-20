/**
 * F6-05 — Fluxo de onboarding plug-and-play.
 * Wizard que guia: conectar WhatsApp → importar histórico → rodar análise →
 * conectar ERP/Asaas → ver Relatório da Situação Atual (gancho de venda dia 1).
 */
import React from 'react';
import {
  MessageSquare, Download, Zap, Plug, FileText, Check, ChevronRight, Loader2, Upload,
} from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { PageHeader } from '@/src/components/ui/PageHeader';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:3001';

interface Step {
  key: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: Step[] = [
  { key: 'whatsapp', title: 'Conectar WhatsApp', description: 'Escaneie o QR Code para conectar sua instância do Evolution API.', icon: MessageSquare },
  { key: 'import', title: 'Importar Histórico', description: 'Importe conversas do WhatsApp ou uma planilha CSV da sua base.', icon: Download },
  { key: 'analysis', title: 'Análise Completa', description: 'A Astrum analisa o perfil de cada cliente a partir das conversas.', icon: Zap },
  { key: 'erp', title: 'Conectar ERP/Gateway', description: 'Vincule seu ERP (SGP, IXC) ou gateway de cobrança (Asaas).', icon: Plug },
  { key: 'report', title: 'Relatório da Situação', description: 'Veja o diagnóstico completo do seu provedor — o gancho de venda.', icon: FileText },
];

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? '';
}

function StepIndicator({ step, index, current, completed }: {
  step: Step; index: number; current: number; completed: Set<string>;
}) {
  const Icon = step.icon;
  const isDone = completed.has(step.key);
  const isCurrent = index === current;

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-lg border p-4 transition-all cursor-pointer',
      isCurrent && 'border-primary bg-primary/5',
      isDone && !isCurrent && 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20',
      !isCurrent && !isDone && 'border-border opacity-60',
    )}>
      <div className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full shrink-0',
        isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
      )}>
        {isDone ? <Check size={16} /> : <Icon size={16} />}
      </div>
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>{step.title}</p>
        <p className="text-xs text-muted-foreground truncate">{step.description}</p>
      </div>
    </div>
  );
}

function WhatsAppStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure sua instância do Evolution API e escaneie o QR Code no painel de administração.
        Quando a conexão estiver ativa, clique em "Prosseguir".
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
        QR Code aparece no painel do Evolution API (configuração externa)
      </div>
      <Button size="sm" onClick={onComplete}>
        WhatsApp conectado <ChevronRight size={14} className="ml-1" />
      </Button>
    </div>
  );
}

function ImportStep({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [csvContent, setCsvContent] = React.useState('');

  async function handleImportWhatsApp() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/genesis/retro-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Histórico de WhatsApp importado com sucesso');
      onComplete();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportCSV() {
    if (!csvContent.trim()) {
      toast.error('Cole o conteúdo CSV primeiro');
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/genesis/import-sheet`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvContent }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toast.success(`${data.imported} clientes importados (${data.duplicatesSkipped} duplicatas ignoradas)`);
      onComplete();
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Escolha como importar sua base de clientes:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-primary" />
              <span className="text-sm font-semibold">Via WhatsApp</span>
            </div>
            <p className="text-xs text-muted-foreground">Importa automaticamente do histórico da Evolution API.</p>
            <Button size="sm" variant="outline" onClick={handleImportWhatsApp} disabled={loading}>
              {loading ? <Loader2 size={13} className="animate-spin mr-1" /> : <Download size={13} className="mr-1" />}
              Importar do WhatsApp
            </Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary transition-colors">
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload size={16} className="text-primary" />
              <span className="text-sm font-semibold">Via Planilha CSV</span>
            </div>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs min-h-[60px] focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="Cole o conteúdo CSV aqui (Nome;CPF;Telefone;...)"
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={handleImportCSV} disabled={loading}>
              {loading ? <Loader2 size={13} className="animate-spin mr-1" /> : <Upload size={13} className="mr-1" />}
              Importar CSV
            </Button>
          </CardContent>
        </Card>
      </div>
      <Button size="sm" variant="ghost" onClick={onComplete} className="text-muted-foreground">
        Pular esta etapa <ChevronRight size={14} className="ml-1" />
      </Button>
    </div>
  );
}

function AnalysisStep({ onComplete }: { onComplete: () => void }) {
  const [loading, setLoading] = React.useState(false);
  const [headline, setHeadline] = React.useState<string | null>(null);

  async function handleAnalysis() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/genesis/retro-analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHeadline(data.headline);
      toast.success(`${data.contactsAnalyzed} contatos analisados`);
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A Astrum vai analisar todas as conversas importadas e classificar cada cliente
        por perfil de pagamento, estilo de comunicação e principais problemas.
      </p>
      {headline && (
        <Card className="border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30">
          <CardContent className="pt-4 pb-4 text-sm text-foreground">{headline}</CardContent>
        </Card>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAnalysis} disabled={loading}>
          {loading ? <><Loader2 size={13} className="animate-spin mr-1" />Analisando...</> : <><Zap size={13} className="mr-1" />Rodar análise</>}
        </Button>
        {headline && (
          <Button size="sm" variant="outline" onClick={onComplete}>
            Prosseguir <ChevronRight size={14} className="ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ErpStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecte seu ERP (SGP, IXC, MikWeb) ou gateway de cobrança (Asaas) para que a Astrum
        acesse faturas e dados financeiros em tempo real.
      </p>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
        Configuração de credenciais ERP (tela de Settings → Integrações)
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onComplete}>
          ERP conectado <ChevronRight size={14} className="ml-1" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onComplete} className="text-muted-foreground">
          Pular
        </Button>
      </div>
    </div>
  );
}

function ReportStep() {
  return (
    <div className="space-y-4">
      <Card className="border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="pt-5 pb-4 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Onboarding concluído!</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Seu provedor está configurado. A Astrum já conhece sua base, sabe quem são
            seus clientes e está pronta para operar. Explore o dashboard de Valor Gerado
            para acompanhar o ROI em tempo real.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button size="sm" onClick={() => window.location.href = '/valor-gerado'}>
              <FileText size={13} className="mr-1" /> Ver Valor Gerado
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.location.href = '/intelligence/genesis'}>
              <Zap size={13} className="mr-1" /> Relatório completo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OnboardingWizardPage() {
  const [current, setCurrent] = React.useState(0);
  const [completed, setCompleted] = React.useState<Set<string>>(new Set());

  function completeStep(key: string) {
    setCompleted((prev) => new Set([...prev, key]));
    const nextIdx = STEPS.findIndex((s) => s.key === key) + 1;
    if (nextIdx < STEPS.length) setCurrent(nextIdx);
  }

  const stepComponents: Record<string, React.ReactNode> = {
    whatsapp: <WhatsAppStep onComplete={() => completeStep('whatsapp')} />,
    import: <ImportStep onComplete={() => completeStep('import')} />,
    analysis: <AnalysisStep onComplete={() => completeStep('analysis')} />,
    erp: <ErpStep onComplete={() => completeStep('erp')} />,
    report: <ReportStep />,
  };

  const currentStep = STEPS[current];

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Configurar seu provedor"
        subtitle="Siga os passos para colocar a Astrum em operação — leva menos de 10 minutos"
      />

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-2">
          {STEPS.map((step, i) => (
            <div key={step.key} onClick={() => setCurrent(i)}>
              <StepIndicator step={step} index={i} current={current} completed={completed} />
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-2 mb-4">
              {currentStep && <currentStep.icon size={18} className="text-primary" />}
              <h2 className="text-base font-semibold">{currentStep?.title}</h2>
            </div>
            {currentStep && stepComponents[currentStep.key]}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
