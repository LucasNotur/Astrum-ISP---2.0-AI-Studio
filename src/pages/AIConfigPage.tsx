
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/src/lib/supabase';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Bot, Sparkles, Plus, Edit2, Trash2, Download, Database, Upload, Eye, EyeOff, ShieldAlert, Lock, Info, ExternalLink, Clock, BookOpen, Zap, Send, RefreshCw, Smile, Meh, Frown } from 'lucide-react';
import { RingChart, RingLegend, ASTRUM_SEMANTIC } from '@/src/components/ui/ring-chart';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { useAppStore } from '@/src/store/useAppStore';
import { getSystemPrompts, saveSystemPrompts, seedKnowledgeBase, createKBArticle, updateKBArticle, deleteKBArticle } from '@/src/lib/db';
import { getKnowledgeBase as sbGetKnowledgeBase } from '@/src/lib/supabaseDb';
import { getAIResponse, generateKBArticleFromTickets, SYSTEM_PROMPTS } from '@/src/lib/gemini';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { Switch } from "@/src/components/ui/switch";
import { WorkflowVisualizer } from '@/src/components/WorkflowVisualizer';
import { EscalationRulesBuilder } from '@/src/components/EscalationRulesBuilder';
import { MultilingualCard } from '@/src/components/intelligence/MultilingualCard';
import { ProviderFallbackOrderCard } from '@/src/components/intelligence/ProviderFallbackOrderCard';
import { cn } from '@/src/lib/utils';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import autoTable from 'jspdf-autotable';
import { COBRAI_TEMPLATES } from '@/src/lib/cobraiTemplates';

const toolsCatalog = [
  { id: "check_billing_status", name: "Consultar Faturas", desc: "Permite à IA verificar e enviar faturas, status de pagamento e linha digitável.", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "generate_second_copy", name: "Segunda Via", desc: "Permite gerar código PIX e PDF da segunda via diretamente do ERP.", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "unlock_customer", name: "Desbloqueio em Confiança", desc: "Permite desbloquear a conexão do cliente automaticamente (com promessa de pagamento).", required_plan: "pro", requires_erp_integration: true, risk_level: "high" },
  { id: "check_connection_status", name: "Diagnóstico de Conexão", desc: "Realiza ping, verifica uptime e status da ONU/Roteador.", required_plan: "basic", requires_erp_integration: true, risk_level: "low" },
  { id: "open_service_order", name: "Abertura de Chamados (OS)", desc: "Permite que a IA abra OS automaticamente no ERP baseada em problemas técnicos.", required_plan: "pro", requires_erp_integration: true, risk_level: "medium" },
  { id: "schedule_technician", name: "Agendamento de Visita Técnica", desc: "Integra o calendário e reserva horários reais nas frotas técnicas.", required_plan: "enterprise", requires_erp_integration: true, risk_level: "medium" },
  { id: "get_plans_info", name: "Consultar Planos e Preços", desc: "Fornece valores, gigas e informações sobre os planos da provedora.", required_plan: "basic", requires_erp_integration: false, risk_level: "low" },
  { id: "process_upsell", name: "Processar Upsell/Upgrade", desc: "Permite que a IA altere o plano do cliente no sistema sem humano.", required_plan: "pro", requires_erp_integration: true, risk_level: "medium" },
  { id: "send_nps", name: "Pesquisa de Satisfação (NPS)", desc: "Envia perguntas automáticas de avaliação após encerramento do chamado.", required_plan: "pro", requires_erp_integration: false, risk_level: "low" },
  { id: "check_cto_status", name: "Consultar Alarme Massivo (CTO)", desc: "Identifica alarmes e quedas em massa antes de encaminhar ao atendente.", required_plan: "enterprise", requires_erp_integration: true, risk_level: "low" },
];

export function AIConfigPage() {
  const { user, userProfile, auditLogs, messages, integrationKeys, setIntegrationKeys } = useAppStore();

  const isDeveloper =
    user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' ||
    user?.email?.toLowerCase() === 'noturcursos1@gmail.com';

  const [aiPrompts, setAiPrompts] = useState<Record<string, string>>(SYSTEM_PROMPTS);
  const [isSavingPrompts, setIsSavingPrompts] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isKBDialogOpen, setIsKBDialogOpen] = useState(false);
  const [editingKB, setEditingKB] = useState<any>(null);
  const [newKB, setNewKB] = useState<any>({ title: '', content: '', category: 'Geral', tags: [] });
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isMiningDialogOpen, setIsMiningDialogOpen] = useState(false);
  const [pdfSummary, setPdfSummary] = useState<string | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [miningResult, setMiningResult] = useState<any>(null);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [isTestAgentOpen, setIsTestAgentOpen] = useState(false);
  const [testAgentCategory, setTestAgentCategory] = useState<string>('');
  const [testAgentResponse, setTestAgentResponse] = useState<any>(null);
  const [testAgentMessage, setTestAgentMessage] = useState('');
  const [isTestingAgent, setIsTestingAgent] = useState(false);

  const sentimentChartData = useMemo(() => {
    if (!auditLogs || auditLogs.length === 0) return [{ name: 'Sem Dados', value: 1, color: ASTRUM_SEMANTIC.neutral }];
    const counts = auditLogs.reduce((acc: any, log: any) => {
      if (log.sentiment) acc[log.sentiment] = (acc[log.sentiment] || 0) + 1;
      return acc;
    }, { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 });
    return [
      { name: 'Positivo', value: counts.POSITIVO, color: ASTRUM_SEMANTIC.ok },
      { name: 'Neutro', value: counts.NEUTRO, color: ASTRUM_SEMANTIC.neutral },
      { name: 'Negativo', value: counts.NEGATIVO, color: ASTRUM_SEMANTIC.bad },
    ].filter((d) => d.value > 0);
  }, [auditLogs]);

  const PasswordInput = ({ value, onChange, placeholder, className }: any) => {
    const [show, setShow] = useState(false);
    return (
      <div className="relative w-full">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={cn("pr-8", className)}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    );
  };

  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [testResponses, setTestResponses] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState<Record<string, boolean>>({});

  const [tenantTokenLimit, setTenantTokenLimit] = useState(0);
  const [tenantPlan, setTenantPlan] = useState('basic');
  const [workerConcurrency, setWorkerConcurrency] = useState(1);
  const [expandVectorStore, setExpandVectorStore] = useState(false);
  const [vectorTestResult, setVectorTestResult] = useState<{success: boolean, error?: string} | null>(null);
  const [vectorConfig, setVectorConfig] = useState({ provider: 'qdrant', url: '', apiKey: '', collection: 'astrum_knowledge' });
  const [transcriptionConfig, setTranscriptionConfig] = useState({ enabled: true, provider: 'whisper', apiKey: '' });
  const [reindexStatus, setReindexStatus] = useState<{status: string, indexed: number, total: number} | null>(null);
  const [indexedCount, setIndexedCount] = useState(0);
  const [tenantData, setTenantData] = useState<any>({});

  const [personas, setPersonas] = useState<any[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [personaForm, setPersonaForm] = useState<any>({
    name: '', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false
  });
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaWizardStep, setPersonaWizardStep] = useState(1);
  const [isTestPersonaOpen, setIsTestPersonaOpen] = useState(false);
  const [testPersonaId, setTestPersonaId] = useState<string | null>(null);
  const [testPersonaChat, setTestPersonaChat] = useState<{role: 'user'|'assistant', text: string}[]>([]);
  const [testPersonaInput, setTestPersonaInput] = useState('');

  const fetchPersonas = async () => {
    setLoadingPersonas(true);
    try {
      const res = await fetch(`/api/personas?tenantId=${tenantId}`);
      if (res.ok) setPersonas(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPersonas(false);
    }
  };

  useEffect(() => {
    fetchPersonas();
  }, []);

  const handleSavePersona = async () => {
    try {
      if (editingPersonaId) {
        await fetch(`/api/personas/${editingPersonaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify(personaForm)
        });
        toast.success("Persona atualizada");
      } else {
        await fetch(`/api/personas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
          body: JSON.stringify(personaForm)
        });
        toast.success("Persona criada");
      }
      setIsPersonaModalOpen(false);
      fetchPersonas();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeletePersona = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover esta persona?")) return;
    try {
      await fetch(`/api/personas/${id}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId }
      });
      toast.success("Persona removida");
      fetchPersonas();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleTestPersona = (id: string) => {
    setTestPersonaId(id);
    setTestPersonaChat([]);
    setIsTestPersonaOpen(true);
  };

  const tenantId = userProfile?.tenantId || user?.tenantId || 'default';

  useEffect(() => {
    getSystemPrompts(tenantId).then((prompts) => {
      if (prompts) setAiPrompts((prev) => ({ ...prev, ...prompts }));
    });
    sbGetKnowledgeBase(setKnowledgeBase, tenantId);
  }, [tenantId]);

  const handleSavePrompts = async () => {
    setIsSavingPrompts(true);
    try {
      await saveSystemPrompts(aiPrompts, tenantId);
      toast.success('Núcleo IA atualizado com sucesso!');
    } catch {
      toast.error('Erro ao salvar prompts.');
    } finally {
      setIsSavingPrompts(false);
    }
  };

  const handleExportCSV = () => {
    if (!auditLogs || auditLogs.length === 0) { toast.error('Nenhum dado para exportar.'); return; }
    const headers = ['Data/Hora', 'Ticket ID', 'Categoria', 'Sentimento', 'Tempo de Resposta (s)', 'SLA Cumprido', 'Crítico'];
    const rows = [headers.join(','), ...auditLogs.map((log: any) => {
      const date = log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('pt-BR') : 'N/A';
      return [`"${date}"`, `"${log.ticketId}"`, `"${log.category}"`, `"${log.sentiment}"`,
        `${log.responseTime?.toFixed(1)}`, `"${log.slaCompliant ? 'Sim' : 'Não'}"`,
        `"${log.isCritical ? 'Sim' : 'Não'}"`].join(',');
    })].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_ia_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast.success('Exportação concluída!');
  };

  const handleSeedKB = async () => {
    setIsSeeding(true);
    try { await seedKnowledgeBase(); toast.success('Base de conhecimento populada!'); }
    catch { toast.error('Erro ao popular base de conhecimento.'); }
    finally { setIsSeeding(false); }
  };

  const handleSaveKB = async () => {
    if (!newKB.title || !newKB.content) { toast.error('Título e conteúdo são obrigatórios.'); return; }
    try {
      if (editingKB) { await updateKBArticle(editingKB.id, newKB); toast.success('Artigo atualizado!'); }
      else { await createKBArticle(newKB); toast.success('Artigo criado!'); }
      setIsKBDialogOpen(false); setEditingKB(null);
      setNewKB({ title: '', content: '', category: 'Geral', tags: [] });
    } catch { toast.error('Erro ao salvar artigo.'); }
  };

  const handleDeleteKB = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este artigo?')) return;
    try { await deleteKBArticle(id); toast.success('Artigo excluído!'); }
    catch { toast.error('Erro ao excluir artigo.'); }
  };

  const handleTestAgent = async () => {
    if (!testAgentMessage.trim()) return;
    setIsTestingAgent(true); setTestAgentResponse(null);
    try {
      const res = await getAIResponse([{ role: 'user', parts: [{ text: testAgentMessage }] }], testAgentCategory);
      setTestAgentResponse(res);
    } catch (err: any) {
      setTestAgentResponse({ error: err.message || 'Erro ao testar agente' });
    } finally { setIsTestingAgent(false); }
  };

  useEffect(() => {
    // Check vector store connection on mount
    fetch(`/api/integrations/vectorstore/ping?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.connected) setVectorTestResult({ success: true });
        else setVectorTestResult({ success: false, error: data.error });
      })
      .catch(e => setVectorTestResult({ success: false, error: e.message }));
      
    // S99 — carrega config do tenant via Supabase
    const loadConfig = async () => {
      const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
      if (tenant) {
        if (tenant.vector_store_config) setVectorConfig(tenant.vector_store_config);
        setTenantData(tenant);
        if (tenant.monthly_token_limit) setTenantTokenLimit(tenant.monthly_token_limit);
        if (tenant.worker_concurrency) setWorkerConcurrency(tenant.worker_concurrency);
        if (tenant.plan) setTenantPlan(tenant.plan);
      }
      const { count } = await supabase
        .from('knowledge_articles')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('vector_indexed', true);
      setIndexedCount(count ?? 0);
    };
    loadConfig();
  }, []);

  // S99 — tenant mutations via Supabase
  const updateTenant = async (patch: Record<string, any>, successMsg: string) => {
    const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
    if (error) { toast.error('Erro ao salvar'); return; }
    toast.success(successMsg);
    setTenantData((prev: any) => ({ ...prev, ...patch }));
  };

  const toggleCobraiEnabled = (checked: boolean) =>
    updateTenant({ cobrai_enabled: checked }, checked ? "CobrAI ativado" : "CobrAI pausado");

  const updateCobraiLimiter = (limitHourly: number) =>
    updateTenant({ cobrai_hourly_limit: limitHourly }, "Limite atualizado");

  const updateCobraiWindow = (start: number, end: number) =>
    updateTenant({ cobrai_window: { start, end } }, "Janela de disparo atualizada");

  const toggleCobraiStage = (stage: string, checked: boolean) =>
    updateTenant({ cobrai_stages: { ...(tenantData?.cobrai_stages ?? {}), [stage]: { active: checked } } }, `Etapa ${stage} ${checked ? 'ativada' : 'desativada'}`);

  const testVectorStore = async () => {
    setVectorTestResult(null);
    try {
      const res = await fetch(`/api/integrations/vectorstore/ping?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.connected) {
        setVectorTestResult({ success: true });
        toast.success("Banco Vetorial Conectado");
      } else {
        setVectorTestResult({ success: false, error: data.error });
        toast.error("Falha na conexão: " + data.error);
      }
    } catch (e: any) {
      setVectorTestResult({ success: false, error: e.message });
      toast.error("Erro interno: " + e.message);
    }
  };

  const saveVectorConfig = () =>
    updateTenant({ vector_store_config: vectorConfig }, "Configuração do Banco Vetorial salva").then(testVectorStore);

  const saveTranscriptionConfig = () =>
    updateTenant({ transcription_config: transcriptionConfig }, "Configuração de Transcrição salva");

  const startReindex = async () => {
    toast.success("Iniciando reindexação...");
    setReindexStatus({ status: 'running', indexed: 0, total: 100 });
    // mock realtime progress
    let i = 0;
    const int = setInterval(() => {
      i += 10;
      setReindexStatus({ status: 'running', indexed: i, total: 100 });
      if (i >= 100) {
        clearInterval(int);
        setReindexStatus({ status: 'done', indexed: 100, total: 100 });
        toast.success("Reindexação concluída!");
      }
    }, 500);
  };

  const saveTokenLimit = (limit: number, concurrency: number) =>
    updateTenant({ monthly_token_limit: limit, worker_concurrency: concurrency }, "Limites salvos");

  const saveIntegrationKeys = async () => {
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationKeys, tenantId })
      });
      if (res.ok) {
        toast.success("Configurações salvas!");
      } else {
        toast.error("Erro ao salvar configurações");
      }
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    }
  };

  const handleSaveAllConfig = async () => {
    await saveIntegrationKeys();
    await handleSavePrompts();
  };

  const validateAndSave = async (agent: string, content: string) => {
    try {
      setIsValidating(prev => ({ ...prev, [agent]: true }));
      setValidationErrors(prev => ({ ...prev, [agent]: [] }));
      setTestResponses(prev => ({ ...prev, [agent]: '' }));

      const res = await fetch('/api/prompts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, agent })
      });
      const data = await res.json();
      
      if (!data.valid) {
        setValidationErrors(prev => ({ ...prev, [agent]: data.errors }));
        return;
      }
      
      if (data.test_response) {
         setTestResponses(prev => ({ ...prev, [agent]: data.test_response }));
      }
      
      await handleSavePrompts();
    } catch (e: any) {
      console.error(e);
      setValidationErrors(prev => ({ ...prev, [agent]: ["Erro na validação: " + e.message] }));
    } finally {
      setIsValidating(prev => ({ ...prev, [agent]: false }));
    }
  };

  // S99 — usage logs via Supabase ai_performance_logs
  useEffect(() => {
    setLoadingAiUsage(true);
    supabase
      .from('ai_performance_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setAiUsageLogs(data ?? []);
        setLoadingAiUsage(false);
      });
  }, []);

  return (<>
    <motion.div
              key="ai-config"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              
              
              <Tabs defaultValue="orchestrator" className="flex flex-col md:flex-row w-full gap-6 lg:gap-10">
                <TabsList className="flex flex-row md:flex-col justify-start md:h-auto overflow-x-auto bg-transparent p-0 w-full md:w-64 lg:w-72 shrink-0 space-x-1 md:space-x-0 md:space-y-1 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 pb-2 md:pb-0 md:pr-4">
                  <TabsTrigger 
                    value="flow" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Arquitetura de Fluxo</TabsTrigger>
                  <TabsTrigger 
                    value="models" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Motores e Prompts</TabsTrigger>
                  <TabsTrigger 
                    value="orchestrator" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Orquestrador</TabsTrigger>
                  <TabsTrigger 
                    value="cobrai" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >CobrAI</TabsTrigger>
                  <TabsTrigger 
                    value="complexity" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Classificador Complexidade</TabsTrigger>
                  <TabsTrigger 
                    value="triage" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Triagem de Segurança</TabsTrigger>
                  <TabsTrigger 
                    value="negotiator" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Agente de Cobrança</TabsTrigger>
                  <TabsTrigger 
                    value="qa" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Avaliador de Qualidade (QA)</TabsTrigger>
                  <TabsTrigger 
                    value="retention" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Analista de Retenção</TabsTrigger>
                  <TabsTrigger 
                    value="expert" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Especialista Técnico</TabsTrigger>
                  <TabsTrigger 
                    value="consolidator" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Consolidador de Memória</TabsTrigger>
                  <TabsTrigger 
                    value="routing" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Roteamento (State Machine)</TabsTrigger>
                  <TabsTrigger 
                    value="extractor" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Extrator de Dados</TabsTrigger>
                  <TabsTrigger 
                    value="support" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Suporte</TabsTrigger>
                  <TabsTrigger 
                    value="billing" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Financeiro</TabsTrigger>
                  <TabsTrigger 
                    value="retention" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Retenção</TabsTrigger>
                  <TabsTrigger 
                    value="sales" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Vendas</TabsTrigger>
                  <TabsTrigger 
                    value="audit" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Logs de Auditoria</TabsTrigger>
                  <TabsTrigger 
                    value="personas" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Personas AI</TabsTrigger>
                  <TabsTrigger 
                    value="escalation" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Regras de Escalonamento</TabsTrigger>
                  <TabsTrigger 
                    value="ai_usage" 
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Custos & Uso de Tokens</TabsTrigger>
                  <TabsTrigger
                    value="sandbox"
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Sandbox (Testes)</TabsTrigger>
                  {/* IA-14 — Atendimento multilíngue */}
                  <TabsTrigger
                    value="multilingual"
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Multilíngue</TabsTrigger>
                  <TabsTrigger
                    value="providers"
                    className="w-full justify-start px-4 py-2 border-b-2 md:border-b-0 md:border-r-2 border-transparent data-[state=active]:border-indigo-600 dark:data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-50 dark:data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 dark:data-[state=active]:text-indigo-400 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 rounded-none rounded-t-md md:rounded-l-md md:rounded-t-none whitespace-nowrap transition-colors"
                  >Providers</TabsTrigger>
                </TabsList>
                
                <div className="flex-1 w-full min-w-0 md:mt-0">
                  <TabsContent value="sandbox">
                     <Card>
                       <CardHeader>
                         <CardTitle>Sandbox Isolado</CardTitle>
                         <CardDescription>Simule interações e teste a IA num ambiente seguro sem afetar clientes reais.</CardDescription>
                       </CardHeader>
                       <CardContent>
                          <div className="flex flex-col space-y-4 h-[400px] border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-[#09090b] p-4">
                              <div className="flex-1 overflow-y-auto space-y-4">
                                  <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 p-3 rounded-lg mr-12 text-sm text-zinc-700 dark:text-zinc-300">
                                      Estou pronto para testar as novas configurações. O que deseja simular?
                                  </div>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                  <Input placeholder="Digite sua mensagem de teste..." className="flex-1 bg-white dark:bg-zinc-900" />
                                  <Button>Enviar</Button>
                              </div>
                          </div>
                       </CardContent>
                     </Card>
                  </TabsContent>

                  <TabsContent value="cobrai">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="shadow-sm">
                          <CardHeader>
                            <CardTitle className="text-lg">Configurações Gerais (CobrAI)</CardTitle>
                            <CardDescription>Ative e defina limites para o motor de cobrança automática.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-100 dark:border-zinc-800">
                              <div className="space-y-0.5">
                                <Label className="text-base font-semibold">CobrAI Ativo</Label>
                                <p className="text-xs text-zinc-500">Mestre de disparo</p>
                              </div>
                              <Switch 
                                checked={tenantData.cobrai_enabled || false}
                                onCheckedChange={toggleCobraiEnabled}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Limite de envios por hora</Label>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number" 
                                  value={tenantData.cobrai_hourly_limit ?? 30} 
                                  onChange={(e) => updateCobraiLimiter(Number(e.target.value))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500">Ajuda a evitar bloqueios do WhatsApp.</p>
                            </div>

                            <div className="space-y-2">
                              <Label>Janela de disparo (Horas)</Label>
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="number" 
                                  min={0} max={23}
                                  value={tenantData.cobrai_window?.start ?? 8} 
                                  onChange={(e) => updateCobraiWindow(Number(e.target.value), tenantData.cobrai_window?.end ?? 20)}
                                />
                                <span className="text-sm">às</span>
                                <Input 
                                  type="number" 
                                  min={0} max={23}
                                  value={tenantData.cobrai_window?.end ?? 20} 
                                  onChange={(e) => updateCobraiWindow(tenantData.cobrai_window?.start ?? 8, Number(e.target.value))}
                                />
                              </div>
                              <p className="text-xs text-zinc-500">Disparos fora desse horário serão ignorados (ou pausados).</p>
                            </div>
                          </CardContent>
                        </Card>

                        <div className="space-y-4">
                          <h3 className="font-semibold text-lg">Habilitar Etapas (Régua)</h3>
                          {Object.keys(COBRAI_TEMPLATES).map((stage) => {
                            const template = COBRAI_TEMPLATES[stage];
                            const isActive = tenantData.cobrai_stages?.[stage]?.active !== false; // default true if undefined
                            const delayStr = "24h"; // mock display
                            
                            return (
                              <Card key={stage} className={isActive ? 'border-zinc-200 dark:border-zinc-800' : 'opacity-60 border-dashed'}>
                                <div className="flex items-start justify-between p-4">
                                  <div>
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-bold text-base">{stage}</h4>
                                      <Badge variant="outline" className="text-[10px] uppercase font-mono bg-zinc-50 dark:bg-zinc-900">
                                        {template.templateName}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-zinc-500 max-w-lg mb-3">
                                      Template Info: "{template.components.find((c: any) => c.type === 'body')?.parameters?.[0]?.key}..."
                                    </p>
                                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                                      <span className="flex items-center gap-1"><Clock size={12}/> Retry Delay: {delayStr}</span>
                                    </div>
                                  </div>
                                  <Switch 
                                    checked={isActive}
                                    onCheckedChange={(c) => toggleCobraiStage(stage, c)}
                                  />
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                     </div>
                  </TabsContent>
                  <TabsContent value="flow">
                    <WorkflowVisualizer />
                  </TabsContent>
                  
                  <TabsContent value="audit">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                      <Card className="border-none shadow-sm md:col-span-1 dark:bg-zinc-900">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Distribuição de Sentimento</CardTitle>
                        </CardHeader>
                        {/* D-015 — anel padrão com badge de fonte por fatia */}
                        <CardContent className="flex flex-col items-center gap-4">
                          <RingChart
                            size={190}
                            segments={sentimentChartData.map((d) => ({
                              value: d.value,
                              color: d.color,
                              label: d.name,
                              icon: d.name === 'Positivo'
                                ? <Smile size={15} strokeWidth={2} className="text-astrum-signal" />
                                : d.name === 'Negativo'
                                ? <Frown size={15} strokeWidth={2} className="text-astrum-red" />
                                : <Meh size={15} strokeWidth={2} className="text-astrum-slate" />,
                            }))}
                            centerValue={sentimentChartData.reduce((s, d) => s + d.value, 0)}
                            centerLabel="interações"
                          />
                          <RingLegend
                            items={sentimentChartData.map((d) => ({ label: d.name, value: d.value, color: d.color }))}
                          />
                        </CardContent>
                      </Card>
                      <Card className="border-none shadow-sm md:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle>Auditoria de Performance IA</CardTitle>
                            <CardDescription>Monitoramento em tempo real das interações e cumprimento de SLA.</CardDescription>
                          </div>
                          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
                            <Download size={16} /> Exportar CSV
                          </Button>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                            <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                              <TableRow>
                                <TableHead className="text-[10px] uppercase">Data/Hora</TableHead>
                                <TableHead className="text-[10px] uppercase">Ticket</TableHead>
                                <TableHead className="text-[10px] uppercase">Categoria</TableHead>
                                <TableHead className="text-[10px] uppercase">Sentimento</TableHead>
                                <TableHead className="text-[10px] uppercase">SLA</TableHead>
                                <TableHead className="text-[10px] uppercase">Crítico</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {auditLogs.length > 0 ? auditLogs.map(log => (
                                <TableRow key={log.id} className="text-xs">
                                  <TableCell className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                                    {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleString('pt-BR') : '...'}
                                  </TableCell>
                                  <TableCell className="font-mono text-[10px]">
                                    {log.action ? <span className="font-bold text-primary">{log.action}</span> : (log.ticketId?.slice(0, 8) || '-')}
                                  </TableCell>
                                  <TableCell>
                                    {log.action ? (
                                      <span className="text-[10px] text-zinc-500 truncate max-w-[200px] inline-block" title={JSON.stringify(log.details)}>
                                        {log.details?.name || log.details?.itemName || log.details?.subject || JSON.stringify(log.details)}
                                      </span>
                                    ) : (
                                      <Badge variant="outline" className="text-[9px]">{log.category}</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {log.action ? (
                                      <span className="text-zinc-400">-</span>
                                    ) : (
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-bold",
                                        log.sentiment === 'NEGATIVO' ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                                        log.sentiment === 'POSITIVO' ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                        "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                                      )}>
                                        {log.sentiment}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {log.action ? (
                                      <span className="text-zinc-400">-</span>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <div className={cn("w-1.5 h-1.5 rounded-full", log.slaCompliant ? "bg-green-500" : "bg-red-500")} />
                                        {log.responseTime?.toFixed(1)}s
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {log.isCritical ? <Badge className="bg-red-500 text-white border-none text-[9px]">SIM</Badge> : <span className="text-zinc-300">-</span>}
                                  </TableCell>
                                </TableRow>
                              )) : (
                                <TableRow>
                                  <TableCell colSpan={6} className="text-center py-20 text-zinc-400 italic">
                                    Nenhum log de auditoria registrado ainda.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="models" className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 mb-6">
                              <div className="grid gap-2">
                                <Label className="font-semibold flex items-center gap-2">Limite Mensal de Tokens</Label>
                                <div className="flex gap-2">
                                  <Input 
                                    type="number" 
                                    value={tenantTokenLimit}
                                    onChange={(e) => setTenantTokenLimit(parseInt(e.target.value) || 0)}
                                  />
                                </div>
                                <p className="text-xs text-zinc-500">Impede custos excessivos de LLM bloqueando as chamadas quando o limite é atingido no mês.</p>
                              </div>

                              <div className="grid gap-2">
                                <Label className="font-semibold flex items-center gap-2">Concorrência de processamento (1-10)</Label>
                                <div className="flex gap-2">
                                  <Input 
                                    type="number" 
                                    min="1"
                                    max="10"
                                    value={workerConcurrency}
                                    onChange={(e) => setWorkerConcurrency(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                                  />
                                  <Button onClick={() => saveTokenLimit(tenantTokenLimit, workerConcurrency)}>Salvar</Button>
                                </div>
                                <p className="text-xs text-zinc-500">Quantidade de mensagens processadas simultaneamente neste ISP.</p>
                              </div>
                            </div>

                            {[
                              { id: "chat", title: "Agente Conversacional (Chat)", desc: "Motor principal de conversação com o cliente.", icon: <Bot size={18} className="text-emerald-600" /> },
                              { id: "orchestrator", title: "Agente Orquestrador", desc: "Classifica o sentimento e a categoria da primeira mensagem.", icon: <Bot size={18} className="text-blue-600" /> },
                              { id: "rag", title: "Motor RAG (Busca e IA)", desc: "Motor que lê e resume PDFs para a base de conhecimento.", icon: <Bot size={18} className="text-orange-600" /> },
                              { id: "summary", title: "Resumo de Tickets", desc: "Gera resumos rápidos do histórico de atendimento.", icon: <Bot size={18} className="text-purple-600" /> },
                              { id: "smartreply", title: "Respostas Rápidas", desc: "Sugere respostas prontas para os atendentes humanos.", icon: <Bot size={18} className="text-purple-600" /> },
                              { id: "kb", title: "Base de Conhecimento", desc: "Gera artigos para a base de conhecimento a partir de tickets resolvidos.", icon: <Bot size={18} className="text-purple-600" /> }
                            ].map((feature) => {
                              // Defaults handling
                              const providerMode = integrationKeys[`${feature.id}Provider`] || (['summary', 'smartreply', 'kb'].includes(feature.id) ? 'gemini' : 'openai');
                              
                              const openaiModels = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1-preview", "o3-mini"];
                              const geminiModels = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];
                              
                              return (
                                <div key={feature.id} className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                                  <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2">
                                      {feature.icon}
                                      <div>
                                        <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{feature.title}</h3>
                                        <p className="text-xs text-zinc-500">{feature.desc}</p>
                                      </div>
                                    </div>
                                    <select 
                                      className="text-xs border p-1 rounded bg-zinc-50 dark:bg-zinc-800"
                                      value={providerMode}
                                      onChange={(e) => setIntegrationKeys(prev => ({ ...prev, [`${feature.id}Provider`]: e.target.value }))}
                                    >
                                      <option value="openai">OpenAI</option>
                                      <option value="gemini">Google Gemini</option>
                                      <option value="custom">Outro (DeepSeek, Groq, via OpenAI-compatible)</option>
                                    </select>
                                  </div>
                                  
                                  <div className="flex flex-col md:flex-row gap-4 mt-2">
                                    <div className="flex-1">
                                      <Label className="text-xs text-zinc-500 mb-1 block">API Key ({providerMode === 'openai' ? 'OpenAI' : providerMode === 'gemini' ? 'Gemini' : 'Custom / Outra'})</Label>
                                      <PasswordInput 
                                        className="h-8 text-xs"
                                        placeholder={providerMode === 'custom' ? "Sua chave de API..." : "Usa a Global se vazio..."}
                                        value={integrationKeys[`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}`] || integrationKeys[`${providerMode}Global`] || ''}
                                        onChange={(e: any) => setIntegrationKeys((prev: any) => ({ ...prev, [`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}`]: e.target.value }))}
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <Label className="text-xs text-zinc-500 mb-1 block">Modelo Exato</Label>
                                      {providerMode === 'custom' ? (
                                        <Input
                                          type="text"
                                          className="h-8 text-xs"
                                          placeholder="Ex: meta-llama-3-70b-instruct"
                                          value={integrationKeys[`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}Model`] || ''}
                                          onChange={(e) => setIntegrationKeys(prev => ({ ...prev, [`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}Model`]: e.target.value }))}
                                        />
                                      ) : (
                                        <select 
                                          className="w-full h-8 text-xs border rounded-md px-2 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                                          value={integrationKeys[`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}Model`] || (providerMode === 'openai' ? openaiModels[0] : geminiModels[0])}
                                          onChange={(e) => setIntegrationKeys(prev => ({ ...prev, [`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}Model`]: e.target.value }))}
                                        >
                                          {(providerMode === 'openai' ? openaiModels : geminiModels).map(m => (
                                            <option key={m} value={m}>{m}</option>
                                          ))}
                                        </select>
                                      )}
                                    </div>
                                    {providerMode === 'custom' && (
                                      <div className="flex-1 w-full md:w-auto">
                                        <Label className="text-xs text-zinc-500 mb-1 block">Base URL / Endpoint da API</Label>
                                        <Input 
                                          type="text" 
                                          className="h-8 text-xs"
                                          placeholder="Ex: https://api.groq.com/openai/v1"
                                          value={integrationKeys[`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}BaseUrl`] || ''}
                                          onChange={(e) => setIntegrationKeys(prev => ({ ...prev, [`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}BaseUrl`]: e.target.value }))}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  <details className="mt-3 group border border-zinc-200 dark:border-zinc-800 rounded">
                                    <summary className="text-[11px] font-medium text-zinc-500 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 uppercase tracking-wider flex items-center justify-between">
                                      Configurações Avançadas de Geração
                                      <span className="group-open:rotate-180 transition-transform">▼</span>
                                    </summary>
                                    <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <Label className="text-[10px] text-zinc-500 block mb-1">Temperatura (Criatividade): <strong>{integrationKeys[`${feature.id}Temperature`] || "0.7"}</strong></Label>
                                        <input 
                                          type="range" min="0" max="2" step="0.1" 
                                          className="w-full h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer"
                                          value={integrationKeys[`${feature.id}Temperature`] || "0.7"}
                                          onChange={(e) => setIntegrationKeys((prev: any) => ({ ...prev, [`${feature.id}Temperature`]: e.target.value }))}
                                        />
                                        <div className="flex justify-between text-[9px] text-zinc-400 mt-1"><span>Exato (0)</span><span>Criativo (2)</span></div>
                                      </div>
                                      <div>
                                        <Label className="text-[10px] text-zinc-500 block mb-1">Max Output Tokens</Label>
                                        <Input 
                                          type="number" className="h-6 text-xs bg-white dark:bg-zinc-950" 
                                          placeholder="Ex: 1024"
                                          value={integrationKeys[`${feature.id}MaxTokens`] || ''}
                                          onChange={(e) => setIntegrationKeys((prev: any) => ({ ...prev, [`${feature.id}MaxTokens`]: e.target.value }))}
                                        />
                                      </div>
                                      <div className="md:col-span-2">
                                        <Label className="text-[10px] text-zinc-500 block mb-1">Instrução de Sistema Customizada (System Prompt Override)</Label>
                                        <textarea
                                          className="w-full min-h-[60px] text-xs p-2 border rounded-md bg-white dark:bg-zinc-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                          placeholder="Sobrescreve a instrução padrão de sistema. Se vazio, usará a prompt nativa do astrum."
                                          value={integrationKeys[`${feature.id}SystemPrompt`] || ''}
                                          onChange={(e) => setIntegrationKeys((prev: any) => ({ ...prev, [`${feature.id}SystemPrompt`]: e.target.value }))}
                                        />
                                      </div>
                                    </div>
                                  </details>
                                </div>
                              );
                            })}

                            <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <Database size={18} className="text-blue-500" />
                                  <div>
                                    <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Busca Semântica (RAG)</h3>
                                    <p className="text-xs text-zinc-500">encontra artigos por significado, não por palavra exata</p>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <select 
                                    className="text-xs border p-1 rounded bg-zinc-50 dark:bg-zinc-800"
                                    value={vectorConfig.provider}
                                    onChange={(e) => setVectorConfig({ ...vectorConfig, provider: e.target.value })}
                                  >
                                    <option value="qdrant">Qdrant</option>
                                    <option value="pinecone">Pinecone</option>
                                    <option value="weaviate">Weaviate</option>
                                    <option value="custom">Personalizado</option>
                                  </select>
                                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none dark:bg-blue-900/30 dark:text-blue-400">
                                    {indexedCount} artigos indexados
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {expandVectorStore && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <div>
                                  <h3 className="font-semibold text-sm">Configuração do Banco Vetorial</h3>
                                  <p className="text-xs text-zinc-500 mb-4">Gerencie as credenciais e recrie o index do banco semântico.</p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <Label className="text-xs mb-1 block">Provedor</Label>
                                    <select 
                                      className="w-full text-xs border p-2 rounded-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                                      value={vectorConfig.provider}
                                      onChange={(e) => setVectorConfig({ ...vectorConfig, provider: e.target.value })}
                                    >
                                      <option value="qdrant">Qdrant</option>
                                      <option value="pinecone">Pinecone</option>
                                      <option value="weaviate">Weaviate</option>
                                      <option value="custom">Personalizado</option>
                                    </select>
                                  </div>

                                  <div>
                                    <Label className="text-xs mb-1 block">Nome da Coleção</Label>
                                    <Input 
                                      type="text" 
                                      placeholder="Ex: astrum_knowledge" 
                                      className="h-8 text-xs"
                                      value={vectorConfig.collection}
                                      onChange={(e) => setVectorConfig({ ...vectorConfig, collection: e.target.value })}
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <Label className="text-xs mb-1 block">URL da Instância</Label>
                                    <Input 
                                      type="text" 
                                      placeholder="https://sua-instancia.qdrant.io" 
                                      className="h-8 text-xs"
                                      value={vectorConfig.url}
                                      onChange={(e) => setVectorConfig({ ...vectorConfig, url: e.target.value })}
                                    />
                                  </div>
                                  
                                  <div className="md:col-span-2">
                                    <Label className="text-xs mb-1 block">API Key</Label>
                                    <Input 
                                      type="password" 
                                      placeholder="Sua chave de API..." 
                                      className="h-8 text-xs"
                                      value={vectorConfig.apiKey}
                                      onChange={(e) => setVectorConfig({ ...vectorConfig, apiKey: e.target.value })}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                  <Button onClick={testVectorStore} variant="outline" size="sm">Testar Conexão</Button>
                                  <Button onClick={saveVectorConfig} size="sm">Salvar Configuração</Button>
                                </div>

                                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700 mt-4">
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <h4 className="text-sm font-semibold">Base de Conhecimento</h4>
                                      <p className="text-xs text-zinc-500">Transforma textos em embeddings e envia para o provedor ativo ({vectorConfig.provider}).</p>
                                    </div>
                                    <Button onClick={startReindex} variant="secondary" size="sm">Reindexar Base</Button>
                                  </div>
                                  {reindexStatus && reindexStatus.status === 'running' && (
                                    <div className="p-3 bg-white dark:bg-zinc-900 border rounded-md">
                                      <p className="text-xs mb-2">Reindexando... {reindexStatus.indexed} de {reindexStatus.total}</p>
                                      <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500 transition-all" style={{ width: `${(reindexStatus.indexed / reindexStatus.total) * 100}%` }}></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}

                            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-semibold text-sm">Transcrição de Áudio</h3>
                                  <p className="text-xs text-zinc-500">Habilita transcrição de áudios enviados pelos clientes via Whisper ou outras APIs.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-500">{transcriptionConfig.enabled ? 'Ativado' : 'Desativado'}</span>
                                  <button
                                    type="button"
                                    onClick={() => setTranscriptionConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors ${transcriptionConfig.enabled ? 'bg-primary' : 'bg-input'}`}
                                  >
                                    <span
                                      className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${transcriptionConfig.enabled ? 'translate-x-4' : 'translate-x-0'}`}
                                    />
                                  </button>
                                </div>
                              </div>
                              
                              {transcriptionConfig.enabled && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-700 mt-2">
                                  <div>
                                    <Label className="text-xs mb-1 block">Provedor</Label>
                                    <select 
                                      className="w-full text-xs border p-2 rounded-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                                      value={transcriptionConfig.provider}
                                      onChange={(e) => setTranscriptionConfig({ ...transcriptionConfig, provider: e.target.value })}
                                    >
                                      <option value="whisper">OpenAI Whisper</option>
                                      <option value="custom">API Customizada</option>
                                    </select>
                                  </div>
                                  <div>
                                    <Label className="text-xs mb-1 block">API Key</Label>
                                    <Input 
                                      type="password" 
                                      placeholder="sk-..." 
                                      className="h-8 text-xs"
                                      value={transcriptionConfig.apiKey}
                                      onChange={(e) => setTranscriptionConfig({ ...transcriptionConfig, apiKey: e.target.value })}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-end pt-2">
                                <Button size="sm" onClick={saveTranscriptionConfig}>Salvar Transcrição</Button>
                              </div>
                            </div>
                          </TabsContent>

                          
<TabsContent value="orchestrator">
                    <div className="space-y-6">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle>Agente Orquestrador</CardTitle>
                            <CardDescription>Responsável por classificar a intenção do cliente e rotear para o agente correto.</CardDescription>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory(''); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                            <Bot size={16} className="mr-2" /> Testar Agente
                          </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <textarea 
                            className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={aiPrompts.ORCHESTRATOR || ''}
                            onChange={(e) => setAiPrompts(prev => ({ ...prev, ORCHESTRATOR: e.target.value }))}
                          />
                          {validationErrors.ORCHESTRATOR?.length > 0 && (
                            <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                              <strong>Erros de Validação:</strong>
                              <ul className="list-disc pl-4">
                                {validationErrors.ORCHESTRATOR.map((err, i) => <li key={i}>{err}</li>)}
                              </ul>
                            </div>
                          )}
                          {testResponses.ORCHESTRATOR && (
                            <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                              <strong>Teste Sandbox:</strong> {testResponses.ORCHESTRATOR}
                            </div>
                          )}
                          <Button className="w-full" onClick={() => validateAndSave('ORCHESTRATOR', aiPrompts.ORCHESTRATOR)} disabled={isValidating['ORCHESTRATOR'] || isSavingPrompts}>
                            {isValidating['ORCHESTRATOR'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                          </Button>
                        </CardContent>
                      </Card>

                      <Card className="border-none shadow-sm">
                        <CardHeader>
                          <CardTitle className="text-lg">Regras de Automação Inteligente</CardTitle>
                          <CardDescription>Defina gatilhos para ações automáticas da IA.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {[
                            { label: 'Escalamento por Sentimento Crítico', desc: 'Transfere para humano se o sentimento for NEGATIVO e houver palavras críticas.', active: true },
                            { label: 'Auto-Resumo de Encerramento', desc: 'Gera um resumo automático do ticket ao ser finalizado pela IA.', active: true },
                            { label: 'Priorização por Inadimplência', desc: 'Marca tickets como alta prioridade se o cliente tiver faturas vencidas.', active: false },
                            { label: 'Sugestão de Upgrade Proativa', desc: 'Oferece upgrade de plano se o cliente reclamar de lentidão e o sinal estiver bom.', active: true }
                          ].map((rule, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                              <div className="space-y-1">
                                <p className="text-sm font-bold">{rule.label}</p>
                                <p className="text-xs text-zinc-500">{rule.desc}</p>
                              </div>
                              <div className={cn(
                                "w-10 h-5 rounded-full relative cursor-pointer transition-colors",
                                rule.active ? "bg-primary" : "bg-zinc-200 dark:bg-zinc-700"
                              )}>
                                <div className={cn(
                                  "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                                  rule.active ? "right-1" : "left-1"
                                )} />
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="complexity">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Classificador de Complexidade</CardTitle>
                          <CardDescription>Agente responsável por analisar e classificar mensagens de suporte em níveis (LOW, MEDIUM, HIGH) para economia de tokens.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('COMPLEXITY_CLASSIFIER'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.COMPLEXITY_CLASSIFIER || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, COMPLEXITY_CLASSIFIER: e.target.value }))}
                        />
                        {validationErrors.COMPLEXITY_CLASSIFIER?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.COMPLEXITY_CLASSIFIER.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.COMPLEXITY_CLASSIFIER && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.COMPLEXITY_CLASSIFIER}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('COMPLEXITY_CLASSIFIER', aiPrompts.COMPLEXITY_CLASSIFIER)} disabled={isValidating['COMPLEXITY_CLASSIFIER'] || isSavingPrompts}>
                          {isValidating['COMPLEXITY_CLASSIFIER'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="triage">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Triagem de Segurança e PII</CardTitle>
                          <CardDescription>Agente responsável por analisar e mascarar dados sensíveis (PII) e tentativas de jailbreak.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('SECURITY_TRIAGE'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.SECURITY_TRIAGE || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, SECURITY_TRIAGE: e.target.value }))}
                        />
                        {validationErrors.SECURITY_TRIAGE?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.SECURITY_TRIAGE.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.SECURITY_TRIAGE && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.SECURITY_TRIAGE}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('SECURITY_TRIAGE', aiPrompts.SECURITY_TRIAGE)} disabled={isValidating['SECURITY_TRIAGE'] || isSavingPrompts}>
                          {isValidating['SECURITY_TRIAGE'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="negotiator">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Agente de Cobrança</CardTitle>
                          <CardDescription>Responsável por negociar dívidas e tratar de pendências financeiras via chat.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('BILLING_NEGOTIATOR'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.BILLING_NEGOTIATOR || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, BILLING_NEGOTIATOR: e.target.value }))}
                        />
                        {validationErrors.BILLING_NEGOTIATOR?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.BILLING_NEGOTIATOR.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.BILLING_NEGOTIATOR && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.BILLING_NEGOTIATOR}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('BILLING_NEGOTIATOR', aiPrompts.BILLING_NEGOTIATOR)} disabled={isValidating['BILLING_NEGOTIATOR'] || isSavingPrompts}>
                          {isValidating['BILLING_NEGOTIATOR'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="qa">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Avaliador de Qualidade (QA)</CardTitle>
                          <CardDescription>Avalia a qualidade das respostas do AstroChat seguindo critérios para suportes em ISPs.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('QA_EVALUATOR'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.QA_EVALUATOR || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, QA_EVALUATOR: e.target.value }))}
                        />
                        {validationErrors.QA_EVALUATOR?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.QA_EVALUATOR.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.QA_EVALUATOR && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.QA_EVALUATOR}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('QA_EVALUATOR', aiPrompts.QA_EVALUATOR)} disabled={isValidating['QA_EVALUATOR'] || isSavingPrompts}>
                          {isValidating['QA_EVALUATOR'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="retention">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Analista de Retenção</CardTitle>
                          <CardDescription>Analisa os dados do cliente e calcula o risco de cancelamento (churn).</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('RETENTION_ANALYST'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.RETENTION_ANALYST || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, RETENTION_ANALYST: e.target.value }))}
                        />
                        {validationErrors.RETENTION_ANALYST?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.RETENTION_ANALYST.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.RETENTION_ANALYST && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.RETENTION_ANALYST}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('RETENTION_ANALYST', aiPrompts.RETENTION_ANALYST)} disabled={isValidating['RETENTION_ANALYST'] || isSavingPrompts}>
                          {isValidating['RETENTION_ANALYST'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="expert">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Especialista Técnico</CardTitle>
                          <CardDescription>Agente responsável por analisar e guiar os clientes em passos para tentar resolver o problema com o roteador/internet.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('TECHNICAL_EXPERT'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.TECHNICAL_EXPERT || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, TECHNICAL_EXPERT: e.target.value }))}
                        />
                        {validationErrors.TECHNICAL_EXPERT?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.TECHNICAL_EXPERT.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.TECHNICAL_EXPERT && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.TECHNICAL_EXPERT}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('TECHNICAL_EXPERT', aiPrompts.TECHNICAL_EXPERT)} disabled={isValidating['TECHNICAL_EXPERT'] || isSavingPrompts}>
                          {isValidating['TECHNICAL_EXPERT'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="consolidator">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Consolidador de Memória</CardTitle>
                          <CardDescription>Agente responsável por resumir e estruturar a conversa para a memória de longo prazo do cliente.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('MEMORY_CONSOLIDATOR'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.MEMORY_CONSOLIDATOR || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, MEMORY_CONSOLIDATOR: e.target.value }))}
                        />
                        {validationErrors.MEMORY_CONSOLIDATOR?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.MEMORY_CONSOLIDATOR.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.MEMORY_CONSOLIDATOR && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.MEMORY_CONSOLIDATOR}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('MEMORY_CONSOLIDATOR', aiPrompts.MEMORY_CONSOLIDATOR)} disabled={isValidating['MEMORY_CONSOLIDATOR'] || isSavingPrompts}>
                          {isValidating['MEMORY_CONSOLIDATOR'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="routing">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Roteamento (State Machine)</CardTitle>
                          <CardDescription>Nó de roteamento que classifica a intenção do cliente e direciona para o agente adequado.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('ROUTING_NODE'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.ROUTING_NODE || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, ROUTING_NODE: e.target.value }))}
                        />
                        {validationErrors.ROUTING_NODE?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.ROUTING_NODE.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.ROUTING_NODE && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.ROUTING_NODE}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('ROUTING_NODE', aiPrompts.ROUTING_NODE)} disabled={isValidating['ROUTING_NODE'] || isSavingPrompts}>
                          {isValidating['ROUTING_NODE'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="extractor">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Extrator de Dados Estruturados</CardTitle>
                          <CardDescription>Agente responsável por analisar e extrair as informações do cliente retornando JSON estruturado para o Astrum.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('DATA_EXTRACTOR'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.DATA_EXTRACTOR || ''}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, DATA_EXTRACTOR: e.target.value }))}
                        />
                        {validationErrors.DATA_EXTRACTOR?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.DATA_EXTRACTOR.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.DATA_EXTRACTOR && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.DATA_EXTRACTOR}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('DATA_EXTRACTOR', aiPrompts.DATA_EXTRACTOR)} disabled={isValidating['DATA_EXTRACTOR'] || isSavingPrompts}>
                          {isValidating['DATA_EXTRACTOR'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="support">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Agente de Suporte Técnico</CardTitle>
                          <CardDescription>Especialista em resolver problemas de conexão e lentidão.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('SUPORTE_TECNICO'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.SUPORTE_TECNICO}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, SUPORTE_TECNICO: e.target.value }))}
                        />
                        {validationErrors.SUPORTE_TECNICO?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.SUPORTE_TECNICO.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.SUPORTE_TECNICO && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.SUPORTE_TECNICO}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('SUPORTE_TECNICO', aiPrompts.SUPORTE_TECNICO)} disabled={isValidating['SUPORTE_TECNICO'] || isSavingPrompts}>
                          {isValidating['SUPORTE_TECNICO'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="billing">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Agente Financeiro</CardTitle>
                          <CardDescription>Lida com boletos, pagamentos e negociações.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('FATURA'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.FATURA}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, FATURA: e.target.value }))}
                        />
                        {validationErrors.FATURA?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.FATURA.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.FATURA && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.FATURA}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('FATURA', aiPrompts.FATURA)} disabled={isValidating['FATURA'] || isSavingPrompts}>
                          {isValidating['FATURA'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="retention">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Agente de Retenção</CardTitle>
                          <CardDescription>Focado em evitar cancelamentos e manter a satisfação.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('RETENCAO'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.RETENCAO}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, RETENCAO: e.target.value }))}
                        />
                        {validationErrors.RETENCAO?.length > 0 && (
                          <div className="p-3 rounded bg-red-50 text-red-600 text-xs border border-red-200 space-y-1">
                            <strong>Erros de Validação:</strong>
                            <ul className="list-disc pl-4">
                              {validationErrors.RETENCAO.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses.RETENCAO && (
                          <div className="p-3 rounded bg-green-50 text-green-700 text-xs border border-green-200">
                            <strong>Teste Sandbox:</strong> {testResponses.RETENCAO}
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('RETENCAO', aiPrompts.RETENCAO)} disabled={isValidating['RETENCAO'] || isSavingPrompts}>
                          {isValidating['RETENCAO'] || isSavingPrompts ? "Validando e Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="sales">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Agente de Vendas</CardTitle>
                          <CardDescription>Focado em novos cadastros e viabilidade técnica.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory('CADASTRO'); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
                          <Bot size={16} className="mr-2" /> Testar Agente
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <textarea 
                          className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-mono bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                          value={aiPrompts.CADASTRO}
                          onChange={(e) => setAiPrompts(prev => ({ ...prev, CADASTRO: e.target.value }))}
                        />
                        {validationErrors['CADASTRO']?.length > 0 && (
                          <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm space-y-2">
                            <p className="font-bold">Erros Encontrados (Corrija antes de salvar):</p>
                            <ul className="list-disc pl-5 space-y-1">
                              {validationErrors['CADASTRO'].map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                        {testResponses['CADASTRO'] && (
                          <div className="bg-green-50 text-green-800 p-4 rounded-xl text-sm">
                            <p className="font-bold">Validação aprovada. Teste Sandbox:</p>
                            <p className="mt-1 opacity-80">{testResponses['CADASTRO']}</p>
                          </div>
                        )}
                        <Button className="w-full" onClick={() => validateAndSave('CADASTRO', aiPrompts.CADASTRO)} disabled={isSavingPrompts || isValidating['CADASTRO']}>
                          {isSavingPrompts || isValidating['CADASTRO'] ? "Salvando..." : "Salvar Configuração"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                                                  <TabsContent value="personas" className="mt-6">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Personas da IA</CardTitle>
                          <CardDescription>Configure diferentes personalidades, tons de voz e ferramentas para a sua IA.</CardDescription>
                        </div>
                        <Button onClick={() => { 
                          setEditingPersonaId(null); 
                          setPersonaForm({ name: '', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false }); 
                          setPersonaWizardStep(1); 
                          setIsPersonaModalOpen(true); 
                        }} className="gap-2">
                          <Plus size={16} /> Nova Persona
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {loadingPersonas ? (
                          <div className="text-center py-6 text-zinc-500">Carregando personas...</div>
                        ) : personas.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {personas.map(persona => (
                              <div key={persona.id} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm relative group overflow-hidden">
                                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                    setEditingPersonaId(persona.id);
                                    setPersonaForm(persona);
                                    setPersonaWizardStep(1);
                                    setIsPersonaModalOpen(true);
                                  }}>
                                    <Edit2 size={12} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeletePersona(persona.id)}>
                                    <Trash2 size={12} />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-3 mb-3 pr-16">
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden border border-indigo-200 dark:border-indigo-800">
                                    {persona.avatar_url ? <img src={persona.avatar_url} alt={persona.name} className="w-full h-full object-cover"/> : persona.name.charAt(0)}
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-sm flex items-center gap-2">
                                      {persona.name}
                                      {persona.is_default && <Badge className="bg-emerald-100 text-emerald-700 border-none hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] px-1 py-0 h-4">Padrão</Badge>}
                                    </h3>
                                    <p className="text-[10px] text-zinc-500 capitalize">{persona.tone} • {persona.language_level} • {persona.temperature} temp</p>
                                  </div>
                                </div>
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-4 h-8">
                                  {persona.custom_instructions || "Sem instruções customizadas."}
                                </p>
                                <div className="flex justify-between items-center mt-auto border-t border-zinc-100 dark:border-zinc-800 pt-3">
                                  <div className="text-[10px] text-zinc-500">
                                    {persona.active_tools?.length || 0} ferramentas ativas
                                  </div>
                                  <Button variant="secondary" size="sm" className="h-7 text-xs px-3" onClick={() => handleTestPersona(persona.id)}>
                                    <Sparkles size={12} className="mr-1.5" /> Testar Persona
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-16 px-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700">
                            <Bot className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Nenhuma persona configurada</h3>
                            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Crie personas para definir como sua IA se comporta, o nível de linguagem que utiliza e quais ferramentas tem acesso.</p>
                            <Button onClick={() => { 
                              setEditingPersonaId(null); 
                              setPersonaForm({ name: '', tone: 'formal', language_level: 'simple', custom_instructions: '', active_tools: [], temperature: 0.7, is_default: false }); 
                              setPersonaWizardStep(1); 
                              setIsPersonaModalOpen(true); 
                            }} className="mt-4 gap-2">
                              <Plus size={16} /> Nova Persona
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  <TabsContent value="escalation" className="mt-6">
                    <EscalationRulesBuilder />
                  </TabsContent>
                  
                  <TabsContent value="ai_usage" className="mt-6">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Consumo de IA e Custos</CardTitle>
                        <CardDescription>Acompanhe o gasto de tokens e interações da Inteligência Artificial em tempo real.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {loadingAiUsage ? (
                          <div className="text-center py-6 text-zinc-500">Carregando métricas...</div>
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase">Tokens Input (Lidos)</h4>
                                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                  {aiUsageLogs.reduce((acc, log) => acc + (log.promptTokens || 0), 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase">Tokens Output (Enviados)</h4>
                                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                  {aiUsageLogs.reduce((acc, log) => acc + (log.completionTokens || 0), 0).toLocaleString()}
                                </span>
                              </div>
                              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 border border-zinc-100 dark:border-zinc-800">
                                <h4 className="text-xs font-bold text-zinc-500 uppercase">Total de Tokens</h4>
                                <span className="text-2xl font-bold">
                                  {aiUsageLogs.reduce((acc, log) => acc + (log.totalTokens || 0), 0).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                              <table className="w-full text-sm text-left">
                                <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                                  <tr>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs">Data/Hora</th>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs">Agente (Categoria)</th>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs">Ticket ID</th>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs text-right">Prompt</th>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs text-right">Completion</th>
                                    <th className="px-4 py-3 font-medium text-zinc-500 uppercase text-xs text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {aiUsageLogs.length > 0 ? aiUsageLogs.map(log => (
                                    <tr key={log.id} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                                        {log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleString('pt-BR') : 'N/A'}
                                      </td>
                                      <td className="px-4 py-3 font-medium">
                                        <Badge variant="outline" className="text-[10px]">{log.category}</Badge>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-xs">{log.ticketId?.slice(0, 8)}...</td>
                                      <td className="px-4 py-3 text-right text-indigo-600 dark:text-indigo-400">{log.promptTokens?.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">{log.completionTokens?.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-bold">{log.totalTokens?.toLocaleString()}</td>
                                    </tr>
                                  )) : (
                                    <tr>
                                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Nenhum uso registrado nas últimas interações.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* IA-14 — Atendimento multilíngue */}
                  <TabsContent value="multilingual" className="mt-6">
                    <MultilingualCard />
                  </TabsContent>

                  {/* ── IA-43: Ordem de fallback (read-only) ────────────── */}
                  <TabsContent value="providers" className="mt-6 space-y-4">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Ordem de fallback</CardTitle>
                        <CardDescription>
                          Ordem em que os providers LLM são tentados quando o primário falha.
                          {' '}
                          <span className="text-muted-foreground">
                            Definida pelo ambiente (PROVIDER_ORDER). Contate o administrador para alterar.
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ProviderFallbackOrderCard />
                      </CardContent>
                    </Card>
                  </TabsContent>
</div>
              </Tabs>

              {/* Persona Wizard Modal */}
              {isPersonaModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800">
                      <h2 className="text-lg font-bold">{editingPersonaId ? 'Editar Persona' : 'Nova Persona'}</h2>
                      <Button variant="ghost" size="icon" onClick={() => setIsPersonaModalOpen(false)}>×</Button>
                    </div>
                    
                    <div className="flex px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 text-xs">
                      <div className={cn("flex-1 text-center font-medium", personaWizardStep >= 1 ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400")}>1. Identidade</div>
                      <div className={cn("flex-1 text-center font-medium", personaWizardStep >= 2 ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400")}>2. Comportamento</div>
                      <div className={cn("flex-1 text-center font-medium", personaWizardStep >= 3 ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400")}>3. Ferramentas</div>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                      {personaWizardStep === 1 && (
                        <div className="space-y-4">
                          <div className="grid gap-2">
                            <Label>Nome da Persona</Label>
                            <Input placeholder="Ex: Maria - Assistente Técnica" value={personaForm.name} onChange={e => setPersonaForm({...personaForm, name: e.target.value})} />
                          </div>
                          <div className="grid gap-2">
                            <Label>URL do Avatar (Opcional)</Label>
                            <Input placeholder="https://..." value={personaForm.avatar_url || ''} onChange={e => setPersonaForm({...personaForm, avatar_url: e.target.value})} />
                          </div>
                          <div className="grid gap-2">
                            <Label>Tom de Voz</Label>
                            <select className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:focus:ring-zinc-300" 
                              value={personaForm.tone} onChange={e => setPersonaForm({...personaForm, tone: e.target.value})}>
                              <option value="formal">Formal</option>
                              <option value="friendly">Amigável (Friendly)</option>
                              <option value="playful">Descontraído (Playful)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {personaWizardStep === 2 && (
                        <div className="space-y-4">
                          <div className="grid gap-2">
                            <Label>Nível de Linguagem</Label>
                            <select className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-400 dark:focus:ring-zinc-300" 
                              value={personaForm.language_level} onChange={e => setPersonaForm({...personaForm, language_level: e.target.value})}>
                              <option value="simple">Simples (Para público geral)</option>
                              <option value="technical">Técnico (Para profissionais)</option>
                              <option value="advanced">Avançado (Jargões complexos)</option>
                            </select>
                          </div>
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                              <Label className="flex items-center gap-2">
                                Criatividade vs Precisão
                                <TooltipProvider>
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <Info size={14} className="text-zinc-400 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs text-xs">Define o comportamento da IA. Valores menores deixam as respostas mais formais e exatas, valores maiores permitem respostas mais criativas e imprevisíveis.</p>
                                    </TooltipContent>
                                  </UITooltip>
                                </TooltipProvider>
                              </Label>
                              <span className="text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">{personaForm.temperature}</span>
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="text-[10px] text-zinc-500 font-medium">0.1 (Ultra Formal)</span>
                               <input 
                                 type="range" min="0.1" max="1.0" step="0.1" 
                                 className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                 value={personaForm.temperature} 
                                 onChange={e => setPersonaForm({...personaForm, temperature: parseFloat(e.target.value)})} 
                               />
                               <span className="text-[10px] text-zinc-500 font-medium">1.0 (Criativo)</span>
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <Label>Instruções Customizadas (Máx 2000 chars)</Label>
                            <textarea 
                              className="w-full min-h-[100px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-300"
                              placeholder="Regras adicionais. Ex: Diga 'Miau' no final de cada frase." 
                              value={personaForm.custom_instructions} 
                              maxLength={2000}
                              onChange={e => setPersonaForm({...personaForm, custom_instructions: e.target.value})} 
                            ></textarea>
                            <p className="text-right text-[10px] text-zinc-500">{personaForm.custom_instructions?.length || 0}/2000</p>
                          </div>
                        </div>
                      )}

                      {personaWizardStep === 3 && (
                        <div className="space-y-4">
                          <Label>Permissões de Ferramentas (Tools)</Label>
                          <div className="grid gap-3">
                            <TooltipProvider>
                              {toolsCatalog.map(tool => {
                                const isAllowed = 
                                  tenantPlan === 'enterprise' || 
                                  (tenantPlan === 'pro' && ['basic', 'pro'].includes(tool.required_plan)) || 
                                  (tenantPlan === 'basic' && tool.required_plan === 'basic');
                          
                                return (
                                  <div key={tool.id} className={cn(
                                    "flex items-start justify-between gap-4 p-4 border rounded-xl transition-all",
                                    isAllowed ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800" : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800/50 opacity-70"
                                  )}>
                                    <div className="flex gap-3 min-w-0">
                                      <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                        tool.risk_level === 'high' ? "bg-red-100 text-red-600 dark:bg-red-900/30" :
                                        tool.risk_level === 'medium' ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" :
                                        "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30"
                                      )}>
                                        {tool.risk_level === 'high' ? <ShieldAlert size={18} /> : tool.required_plan === 'basic' ? <Bot size={18} /> : <Database size={18} />}
                                      </div>
                                      <div className="grid gap-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-semibold text-sm truncate">{tool.name}</span>
                                          {tool.risk_level !== 'low' && (
                                            <Badge variant="outline" className={cn(
                                              "text-[10px] uppercase h-5",
                                              tool.risk_level === 'high' ? "border-red-200 text-red-600" : "border-amber-200 text-amber-600"
                                            )}>Risco {tool.risk_level === 'high' ? 'Alto' : 'Médio'}</Badge>
                                          )}
                                          {tool.required_plan !== 'basic' && (
                                            <Badge variant="secondary" className="text-[10px] uppercase h-5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 border-none">
                                              Plano {tool.required_plan}
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-zinc-500 line-clamp-2 md:line-clamp-none">{tool.desc}</p>
                                      </div>
                                    </div>
                                    
                                    <div className="shrink-0 flex flex-col items-end gap-2">
                                      {!isAllowed ? (
                                        <UITooltip>
                                          <TooltipTrigger asChild>
                                            <div className="cursor-not-allowed">
                                              <Switch disabled checked={false} />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="text-xs">Requer plano {tool.required_plan}. Faça upgrade.</p>
                                          </TooltipContent>
                                        </UITooltip>
                                      ) : (
                                        <Switch 
                                          checked={personaForm.active_tools?.includes(tool.id)}
                                          onCheckedChange={(checked) => {
                                            const tools = personaForm.active_tools || [];
                                            if (checked) setPersonaForm({...personaForm, active_tools: [...tools, tool.id]});
                                            else setPersonaForm({...personaForm, active_tools: tools.filter((t: string) => t !== tool.id)});
                                          }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </TooltipProvider>
                          </div>
                          <div className="mt-6 flex items-center gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                             <input 
                                type="checkbox" id="is_default"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" 
                                checked={personaForm.is_default}
                                onChange={e => setPersonaForm({...personaForm, is_default: e.target.checked})}
                              />
                              <label htmlFor="is_default" className="text-sm font-medium cursor-pointer">Tornar esta a Persona padrão para todos os novos chats ativos</label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between bg-zinc-50 dark:bg-zinc-900/50">
                      <Button variant="outline" onClick={() => {
                        if (personaWizardStep > 1) setPersonaWizardStep(personaWizardStep - 1);
                        else setIsPersonaModalOpen(false);
                      }}>
                        {personaWizardStep > 1 ? 'Voltar' : 'Cancelar'}
                      </Button>
                      
                      <Button onClick={() => {
                        if (personaWizardStep < 3) setPersonaWizardStep(personaWizardStep + 1);
                        else handleSavePersona();
                      }} disabled={personaWizardStep === 1 && !personaForm.name}>
                        {personaWizardStep < 3 ? 'Próximo' : 'Salvar Persona'}
                      </Button>
                    </div>
                  </motion.div>
                </div>
              )}

              {/* Chat Sandbox Modal */}
              {isTestPersonaOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col h-[600px] max-h-[90vh]">
                    <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-indigo-500" />
                        <h2 className="text-sm font-bold">Sandbox da Persona</h2>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsTestPersonaOpen(false)}>×</Button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {testPersonaChat.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-sm italic">
                          Mande um oi para testar a personalidade da sua IA...
                        </div>
                      )}
                      {testPersonaChat.map((msg, i) => (
                        <div key={i} className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-sm", 
                          msg.role === 'user' ? "bg-indigo-600 text-white ml-auto rounded-tr-sm" : "bg-zinc-100 dark:bg-zinc-800 mr-auto rounded-tl-sm text-zinc-800 dark:text-zinc-200"
                        )}>
                          {msg.text}
                        </div>
                      ))}
                    </div>

                    <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex gap-2">
                       <Input 
                         value={testPersonaInput} 
                         onChange={e => setTestPersonaInput(e.target.value)} 
                         onKeyPress={e => {
                           if (e.key === 'Enter' && testPersonaInput.trim()) {
                             const userMsg = testPersonaInput;
                             setTestPersonaInput('');
                             setTestPersonaChat(prev => [...prev, {role: 'user', text: userMsg}]);
                             // Simulate AI reply since there's no specific route instructed for the sandbox chat
                             setTimeout(() => {
                               setTestPersonaChat(prev => [...prev, {role: 'assistant', text: "O recurso 'Testar Persona' chamará as integrações reais de IA simulando esta Persona (disponível no backend em breve)!"}]);
                             }, 1000);
                           }
                         }}
                         placeholder="Escreva algo para testar..." 
                         className="flex-1 bg-zinc-50 dark:bg-zinc-900 rounded-full h-10 border-zinc-200 dark:border-zinc-800"
                       />
                       <Button className="rounded-full h-10 px-6 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" onClick={() => {
                          if (testPersonaInput.trim()) {
                             const userMsg = testPersonaInput;
                             setTestPersonaInput('');
                             setTestPersonaChat(prev => [...prev, {role: 'user', text: userMsg}]);
                             setTimeout(() => {
                               setTestPersonaChat(prev => [...prev, {role: 'assistant', text: "O recurso 'Testar Persona' chamará as integrações reais de IA simulando esta Persona (disponível no backend em breve)!"}]);
                             }, 1000);
                           }
                       }}>
                         Enviar
                       </Button>
                    </div>
                  </motion.div>
                </div>
              )}
            </motion.div>

      {/* KB Dialog */}
      <Dialog open={isKBDialogOpen} onOpenChange={setIsKBDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingKB ? 'Editar Artigo' : 'Novo Artigo de Conhecimento'}</DialogTitle>
            <DialogDescription>Adicione informações que a IA usará para responder aos clientes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Título</label>
              <input className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={newKB.title} onChange={(e) => setNewKB({ ...newKB, title: e.target.value })} placeholder="Ex: Como configurar o roteador TP-Link" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Categoria</label>
              <select className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={newKB.category} onChange={(e) => setNewKB({ ...newKB, category: e.target.value })}>
                <option value="Geral">Geral</option>
                <option value="Suporte Técnico">Suporte Técnico</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Vendas">Vendas</option>
                <option value="Configuração">Configuração</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Conteúdo</label>
              <textarea className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none" value={newKB.content} onChange={(e) => setNewKB({ ...newKB, content: e.target.value })} placeholder="Descreva detalhadamente o procedimento..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags (separadas por vírgula)</label>
              <input className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={newKB.tags?.join(', ')} onChange={(e) => setNewKB({ ...newKB, tags: e.target.value.split(',').map((t: string) => t.trim()).filter((t: string) => t !== '') })} placeholder="wifi, roteador, configuração" />
            </div>
          </div>
          <DialogFooter>
            <button className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800 px-4 text-sm font-medium" onClick={() => setIsKBDialogOpen(false)}>Cancelar</button>
            <button className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-white" onClick={handleSaveKB}>Salvar Artigo</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Agent Dialog */}
      <Dialog open={isTestAgentOpen} onOpenChange={setIsTestAgentOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Teste Rápido: Agente {testAgentCategory || 'Orquestrador'}</DialogTitle>
            <DialogDescription>Envie uma mensagem para testar como a IA responde com os prompts atuais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <input className="flex h-10 flex-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm" value={testAgentMessage} onChange={(e) => setTestAgentMessage(e.target.value)} placeholder="Mensagem do cliente..." onKeyDown={(e) => { if (e.key === 'Enter') handleTestAgent(); }} />
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-white" onClick={handleTestAgent} disabled={isTestingAgent}>
                {isTestingAgent ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            {testAgentResponse && (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-primary"><Bot size={16} /> Resposta do Agente</div>
                <p className="text-sm whitespace-pre-wrap">{testAgentResponse.message || testAgentResponse.error}</p>
                {testAgentResponse.category && (
                  <div className="pt-3 border-t flex gap-2">
                    <span className="text-[10px] border rounded px-2 py-0.5">Roteou para: {testAgentResponse.category}</span>
                    <span className="text-[10px] border rounded px-2 py-0.5">{testAgentResponse.shouldEscalate ? 'Decidiu Escalar' : 'Retido na IA'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mining Dialog */}
      <Dialog open={isMiningDialogOpen} onOpenChange={setIsMiningDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="text-purple-500" /> Resumo com IA</DialogTitle>
            <DialogDescription>A IA varrerá os atendimentos recentes em busca de padrões para sugerir novos artigos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-purple-800 dark:text-purple-300">Extrairemos as dúvidas mais frequentes para transformar em novos artigos no RAG.</p>
            </div>
            {!miningResult ? (
              <div className="flex justify-end pt-4">
                <button className="inline-flex h-9 items-center gap-2 rounded-md bg-purple-600 hover:bg-purple-700 px-4 text-sm font-medium text-white" onClick={async () => {
                  setIsGeneratingArticle(true);
                  try {
                    const tx = (messages ?? []).slice(-50).map((m: any) => `[${m.senderType}]: ${m.text}`).join('\n');
                    const articles = await generateKBArticleFromTickets(tx);
                    if (articles) { setMiningResult(Array.isArray(articles) ? articles : [articles]); toast.success('Logs minerados!'); }
                    else toast.error('Nenhum padrão encontrado.');
                  } catch { toast.error('Erro ao minerar logs'); }
                  finally { setIsGeneratingArticle(false); }
                }} disabled={isGeneratingArticle}>
                  {isGeneratingArticle ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                  {isGeneratingArticle ? 'Analisando...' : 'Iniciar Mineração'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[300px] overflow-y-auto space-y-4">
                  {miningResult.map((res: any, idx: number) => (
                    <div key={idx} className="p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm">{res.title}</h4>
                        <span className="text-[10px] border rounded px-2 py-0.5">{res.category}</span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">{res.content?.substring(0, 150)}...</p>
                      <button className="w-full text-blue-600 text-sm" onClick={() => { setNewKB({ title: res.title, content: res.content, category: res.category, tags: [] }); setIsMiningDialogOpen(false); setIsKBDialogOpen(true); }}>
                        Usar como Novo Artigo Base
                      </button>
                    </div>
                  ))}
                </div>
                <button className="w-full border rounded-md h-9 text-sm" onClick={() => setMiningResult(null)}>Limpar Resultados</button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Import Dialog */}
      <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="text-blue-500" /> Leitura Inteligente de PDF</DialogTitle>
            <DialogDescription>Importe manuais ou documentação. A IA extrairá as informações para o RAG.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            {!pdfSummary ? (
              <>
                <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => document.getElementById('ai-pdf-upload')?.click()}>
                  <Upload className="mx-auto mb-4 text-zinc-400" size={32} />
                  <h3 className="font-medium mb-1">Selecione um PDF</h3>
                  <p className="text-xs text-zinc-500">Arraste ou clique para procurar (Até 10MB).</p>
                  <input id="ai-pdf-upload" type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                    if (!e.target.files?.[0]) return;
                    setIsProcessingPdf(true);
                    try {
                      const formData = new FormData();
                      formData.append('pdf', e.target.files[0]);
                      const res = await fetch('/api/rag/upload-pdf', { method: 'POST', body: formData });
                      if (!res.ok) throw new Error(await res.text());
                      const data = await res.json();
                      setPdfSummary(data.summary);
                      toast.success('PDF lido com sucesso pela IA!');
                    } catch { toast.error('Erro ao analisar o PDF.'); }
                    finally { setIsProcessingPdf(false); }
                  }} />
                </div>
                {isProcessingPdf && <div className="flex items-center justify-center gap-2 text-sm text-blue-600"><RefreshCw size={16} className="animate-spin" /> A IA está analisando...</div>}
              </>
            ) : (
              <div className="text-left space-y-4">
                <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-lg p-4">
                  <h4 className="font-bold text-sm mb-2">Resumo da Leitura Analítica</h4>
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-sans">{pdfSummary}</pre>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="text-sm px-4 py-2" onClick={() => setPdfSummary(null)}>Ler outro PDF</button>
                  <button className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-white" onClick={() => { setNewKB({ title: 'Resumo Extraído via PDF', content: pdfSummary, category: 'Geral', tags: ['pdf', 'documentação'] }); setIsPdfDialogOpen(false); setPdfSummary(null); setIsKBDialogOpen(true); }}>
                    Converter em Artigo
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
  </>);
}
