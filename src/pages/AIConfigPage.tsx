
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Bot, Sparkles, Plus, Edit2, Trash2, Download, Database, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkflowVisualizer } from '@/src/components/WorkflowVisualizer';
import { cn } from '@/src/lib/utils';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import autoTable from 'jspdf-autotable';

export function AIConfigPage({ 
  aiPrompts, 
  setAiPrompts,
  isSavingPrompts,
  handleSavePrompts,
  testAgentCategory,
  setTestAgentCategory,
  testAgentResponse,
  setTestAgentResponse,
  testAgentMessage,
  setTestAgentMessage,
  setIsTestAgentOpen,
  sentimentChartData,
  auditLogs,
  handleExportCSV,
  knowledgeBase,
  setEditingKB,
  setNewKB,
  setIsKBDialogOpen,
  setIsPdfDialogOpen,
  setIsMiningDialogOpen,
  isDeveloper,
  handleSeedKB,
  isSeeding,
  handleDeleteKB,
  integrationKeys,
  setIntegrationKeys,
}: any) {

  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [testResponses, setTestResponses] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState<Record<string, boolean>>({});

  const [tenantTokenLimit, setTenantTokenLimit] = useState(0);
  const [workerConcurrency, setWorkerConcurrency] = useState(1);
  const [expandVectorStore, setExpandVectorStore] = useState(false);
  const [vectorTestResult, setVectorTestResult] = useState<{success: boolean, error?: string} | null>(null);
  const [vectorConfig, setVectorConfig] = useState({ provider: 'qdrant', url: '', apiKey: '', collection: 'astrum_knowledge' });
  const [reindexStatus, setReindexStatus] = useState<{status: string, indexed: number, total: number} | null>(null);
  const [indexedCount, setIndexedCount] = useState(0);

  // Hardcode tenant_id for now as in SettingsPage or get from URL if we had it. "default" is assumed
  const tenantId = 'default';

  useEffect(() => {
    // Check vector store connection on mount
    fetch(`/api/integrations/vectorstore/ping?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.connected) setVectorTestResult({ success: true });
        else setVectorTestResult({ success: false, error: data.error });
      })
      .catch(e => setVectorTestResult({ success: false, error: e.message }));
      
    // Load config and fetch indexed count
    const loadConfig = async () => {
      const { getDoc, doc, collection, getDocs, query, where, onSnapshot } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'tenants', tenantId));
      if (snap.exists() && snap.data().vector_store_config) {
        setVectorConfig(snap.data().vector_store_config);
      }

      try {
        const kbSnap = await getDocs(query(collection(db, 'knowledge_base'), where('tenant_id', '==', tenantId), where('vector_indexed', '==', true)));
        setIndexedCount(kbSnap.size);
      } catch (e) { console.error(e); }

      const unsub = onSnapshot(doc(db, 'tenants', tenantId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.monthly_token_limit) setTenantTokenLimit(data.monthly_token_limit);
          if (data.worker_concurrency) setWorkerConcurrency(data.worker_concurrency);
        }
      });
    };
    loadConfig();
  }, []);

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

  const saveVectorConfig = async () => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'tenants', tenantId), { vector_store_config: vectorConfig }, { merge: true });
      toast.success("Configuração do Banco Vetorial salva");
      testVectorStore();
    } catch (e: any) {
      toast.error("Erro ao salvar config: " + e.message);
    }
  };

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

  const saveTokenLimit = async (limit: number, concurrency: number) => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'tenants', tenantId), { monthly_token_limit: limit, worker_concurrency: concurrency }, { merge: true });
      toast.success("Limites salvos");
    } catch (e: any) {
      toast.error("Erro ao salvar limites: " + e.message);
    }
  };

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

  useEffect(() => {
    const fetchAiUsage = async () => {
      setLoadingAiUsage(true);
      try {
        const q = query(collection(db, "ai_usage"), orderBy("createdAt", "desc"), limit(100));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAiUsageLogs(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAiUsage(false);
      }
    };
    fetchAiUsage();
  }, []);

  return (
    <motion.div 
              key="ai-config"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              
              
              <Tabs defaultValue="orchestrator" className="w-full">
                <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1 flex overflow-x-auto h-auto min-h-[40px] rounded-lg w-full justify-start md:justify-center shrink-0">
                  <TabsTrigger value="flow" className="whitespace-nowrap">Arquitetura de Fluxo</TabsTrigger>
                  <TabsTrigger value="models" className="whitespace-nowrap">Modelos de IA</TabsTrigger>
                  <TabsTrigger value="orchestrator" className="whitespace-nowrap">Orquestrador</TabsTrigger>
                  <TabsTrigger value="support" className="whitespace-nowrap">Suporte</TabsTrigger>
                  <TabsTrigger value="billing" className="whitespace-nowrap">Financeiro</TabsTrigger>
                  <TabsTrigger value="retention" className="whitespace-nowrap">Retenção</TabsTrigger>
                  <TabsTrigger value="sales" className="whitespace-nowrap">Vendas</TabsTrigger>
                  <TabsTrigger value="kb" className="whitespace-nowrap">Base de Conhecimento</TabsTrigger>
                  <TabsTrigger value="audit" className="whitespace-nowrap">Logs de Auditoria</TabsTrigger>
                  <TabsTrigger value="ai_usage" className="whitespace-nowrap">Custos & Uso de Tokens</TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                  <TabsContent value="flow">
                    <WorkflowVisualizer />
                  </TabsContent>
                  
                  <TabsContent value="audit">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                      <Card className="border-none shadow-sm md:col-span-1 dark:bg-zinc-900">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Distribuição de Sentimento</CardTitle>
                        </CardHeader>
                        <CardContent className="flex justify-center">
                          <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={sentimentChartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {sentimentChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => [`${value} interações`, 'Quantidade']}
                                  contentStyle={{ 
                                    borderRadius: '8px', 
                                    border: '1px solid hsl(var(--border))', 
                                    backgroundColor: 'hsl(var(--card))',
                                    color: 'hsl(var(--foreground))',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                                  }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
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
                  <TabsContent value="kb">
                    <Card className="border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle>Base de Conhecimento (RAG)</CardTitle>
                          <CardDescription>Artigos que a IA consulta para responder dúvidas técnicas e gerais.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => { setEditingKB(null); setNewKB({ title: '', content: '', category: 'Geral', tags: [] }); setIsKBDialogOpen(true); }}
                            className="gap-2"
                          >
                            <Plus size={16} /> Novo Artigo
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setIsPdfDialogOpen(true)}
                            className="gap-2 text-blue-600 border-blue-200 dark:border-blue-900/50"
                          >
                            <Upload size={16} /> Importar PDF
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setIsMiningDialogOpen(true)}
                            className="gap-2 text-purple-600 border-purple-200 dark:border-purple-900/50"
                          >
                            <Sparkles size={16} /> Mineração de Logs
                          </Button>
                          {isDeveloper && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={handleSeedKB}
                              disabled={isSeeding}
                              className="gap-2"
                            >
                              <Database size={16} /> {isSeeding ? "Populando..." : "Popular Testes"}
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {knowledgeBase.length > 0 ? knowledgeBase.map(article => (
                            <div key={article.id} className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group relative">
                              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingKB(article); setNewKB(article); setIsKBDialogOpen(true); }}>
                                  <Edit2 size={12} />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDeleteKB(article.id)}>
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                              <div className="flex items-center justify-between mb-2 pr-16">
                                <h4 className="font-bold text-sm">{article.title}</h4>
                                <Badge variant="secondary" className="text-[10px]">{article.category}</Badge>
                              </div>
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3">{article.content}</p>
                              <div className="flex flex-wrap gap-1">
                                {article.tags?.map((tag: string) => (
                                  <span key={tag} className="text-[9px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-0.5 rounded-full text-zinc-500 dark:text-zinc-400">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )) : (
                            <div className="col-span-full text-center py-20 text-zinc-400 italic border-2 border-dashed rounded-2xl">
                              Base de conhecimento vazia. Clique em "Novo Artigo" para começar.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="models" className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 mb-6 bg-zinc-50 dark:bg-zinc-800/50">
                              <div className="grid gap-2 border-r pr-4 border-zinc-200 dark:border-zinc-700 last:border-0 last:pr-0">
                                <Label className="text-emerald-600 font-semibold flex items-center gap-2 text-sm"><Bot size={16}/> OpenAI</Label>
                                <Input 
                                  type="password" 
                                  placeholder="sk-proj-..." 
                                  className="h-8 text-xs"
                                  value={integrationKeys.openaiGlobal || integrationKeys.openaiChat || ''}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiGlobal: e.target.value, openaiChat: e.target.value, openaiOrchestrator: e.target.value }))}
                                />
                              </div>
                              <div className="grid gap-2 border-r pr-4 border-zinc-200 dark:border-zinc-700 last:border-0 last:pr-0">
                                <Label className="text-purple-600 font-semibold flex items-center gap-2 text-sm"><Bot size={16}/> Gemini</Label>
                                <Input 
                                  type="password" 
                                  placeholder="AIzaSy..." 
                                  className="h-8 text-xs"
                                  value={integrationKeys.geminiGlobal || integrationKeys.geminiSummary || ''}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiGlobal: e.target.value, geminiSummary: e.target.value, geminiSmartReply: e.target.value, geminiKb: e.target.value }))}
                                />
                              </div>
                              <div className="grid gap-2 border-r pr-4 border-zinc-200 dark:border-zinc-700 last:border-0 last:pr-0">
                                <Label className="text-orange-600 font-semibold flex items-center gap-2 text-sm"><Bot size={16}/> Anthropic</Label>
                                <Input 
                                  type="password" 
                                  placeholder="sk-ant-..." 
                                  className="h-8 text-xs"
                                  value={integrationKeys.anthropicGlobal || ''}
                                  onChange={(e) => setIntegrationKeys(prev => ({ ...prev, anthropicGlobal: e.target.value }))}
                                />
                              </div>
                              <div className="grid gap-2 items-start cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/50 p-2 -m-2 rounded transition-colors" onClick={() => setExpandVectorStore(!expandVectorStore)}>
                                <div>
                                  <Label className="text-blue-600 font-semibold flex items-center gap-2 text-sm cursor-pointer"><Database size={16}/> Banco Vetorial</Label>
                                  <p className="text-[10px] text-zinc-500 mt-1">Qdrant · Pinecone · Weaviate</p>
                                </div>
                                <div className="mt-1">
                                  {vectorTestResult?.success ? (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-none hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">Conectado</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-zinc-500">Não conectado</Badge>
                                  )}
                                </div>
                              </div>
                            </div>

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
                                      <Input 
                                        type="password" 
                                        className="h-8 text-xs"
                                        placeholder={providerMode === 'custom' ? "Sua chave de API..." : "Usa a Global se vazio..."}
                                        value={integrationKeys[`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}`] || ''}
                                        onChange={(e) => setIntegrationKeys(prev => ({ ...prev, [`${providerMode}${feature.id.charAt(0).toUpperCase() + feature.id.slice(1)}`]: e.target.value }))}
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

                            <div className="grid gap-2">
                              <Label htmlFor="openai-whisper-key" className="flex items-center gap-2">
                                <Bot size={16} className="text-emerald-600" />
                                OpenAI API Key (Transcrição de Áudio - Exclusivo Whisper)
                              </Label>
                              <Input 
                                id="openai-whisper-key" 
                                type="password" 
                                placeholder="sk-proj-..." 
                                value={integrationKeys.openaiWhisper || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiWhisper: e.target.value }))}
                              />
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
                          <Button variant="outline" size="sm" onClick={() => { setTestAgentCategory(undefined); setTestAgentResponse(null); setTestAgentMessage(''); setIsTestAgentOpen(true); }}>
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
</div>
              </Tabs>
            </motion.div>
          
  );
}
