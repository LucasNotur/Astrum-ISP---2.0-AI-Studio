
import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Bot, Sparkles, Plus, Edit2, Trash2, Download, Database, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkflowVisualizer } from '@/src/components/WorkflowVisualizer';
import { cn } from '@/src/lib/utils';
import { jsPDF } from 'jspdf';
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
  handleDeleteKB
}: any) {

  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [testResponses, setTestResponses] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState<Record<string, boolean>>({});

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
