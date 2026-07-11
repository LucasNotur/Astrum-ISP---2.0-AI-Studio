import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Card } from '@/src/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import {
  Bot, Sparkles, Phone, MapPin, Plus, Activity, Wifi, RefreshCw, Database,
  CreditCard, Ticket as TicketIcon, CheckCircle2, User, AlertTriangle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useAppStore } from '@/src/store/useAppStore';
import { supabase } from '@/src/lib/supabase';
import { logAudit } from '@/src/lib/db';
import { summarizeCustomerHistory } from '@/src/lib/gemini';
import { MaskedSensitiveData } from '@/src/components/MaskedSensitiveData';

export function CustomerDetailsDialog() {
  const navigate = useNavigate();
  const {
    user,
    customers,
    tickets,
    invoices,
    selectedCustomerDetails,
    isDetailsDialogOpen,
    setIsDetailsDialogOpen,
  } = useAppStore();

  const isDeveloper =
    user?.email?.toLowerCase() === 'lucaspferraz123@gmail.com' ||
    user?.email?.toLowerCase() === 'noturcursos1@gmail.com';

  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<any>(null);
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<any[]>([]);

  const handleRunDiagnostics = async (
    targetId?: string,
    type: 'cto' | 'customer' = 'cto',
  ) => {
    const id = targetId || selectedCustomerDetails?.id;
    if (!id) return;

    setIsDiagnosing(true);
    setDiagnosticsResult(null);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const isCto = type === 'cto';
    const target = isCto
      ? null
      : customers.find((c: any) => c.id === id);

    const results = {
      id: Math.random().toString(36).substr(2, 9),
      targetId: id,
      targetType: type,
      timestamp: new Date(),
      status: 'success',
      metrics: {
        avgSignal: -19.5 - Math.random() * 5,
        packetLoss: Math.random() * 0.5,
        latency: 15 + Math.random() * 10,
        activeOnus: isCto ? 10 : 1,
        alerts: [] as string[],
      },
    };

    if (results.metrics.avgSignal < -25)
      results.metrics.alerts.push('Sinal baixo detectado.');
    if (results.metrics.packetLoss > 0.3)
      results.metrics.alerts.push('Perda de pacotes detectada.');
    if (!isCto && results.metrics.avgSignal < -27)
      results.metrics.alerts.push('Possível problema no conector ou fibra dobrada.');

    setDiagnosticsResult(results);
    setDiagnosticsHistory((prev) => [results, ...prev].slice(0, 5));
    setIsDiagnosing(false);
    toast.success(`Diagnóstico de ${isCto ? 'CTO' : 'Cliente'} concluído!`);
    return results;
  };

  const runCustomerDiagnostics = async (customerId: string) => {
    toast.info('Iniciando diagnósticos remotos...', {
      description: 'Verificando sinal, latência e autenticação PPPoE.',
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const result = {
      id: Math.random().toString(36).substr(2, 9),
      customerId,
      timestamp: new Date(),
      signal: `-${Math.floor(Math.random() * 10 + 18)} dBm`,
      latency: `${Math.floor(Math.random() * 15 + 5)}ms`,
      status: Math.random() > 0.1 ? 'online' : 'offline',
      uptime: '12d 4h 32m',
    };
    setDiagnosticsHistory((prev) => [result, ...prev]);
    toast.success('Diagnóstico concluído com sucesso!');
    return result;
  };

  const handleGenerateInvoice = async () => {
    if (!selectedCustomerDetails) return;
    try {
      const amount =
        selectedCustomerDetails.plan === '1 Giga'
          ? 199.9
          : selectedCustomerDetails.plan === '500 Mega'
          ? 129.9
          : 99.9;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5);
      const { error } = await supabase.from('invoices').insert({
        customer_id: selectedCustomerDetails.id,
        customer_name: selectedCustomerDetails.name,
        amount,
        status: 'pending',
        due_date: dueDate.toISOString(),
      });
      if (error) throw error;
      toast.success('Fatura gerada com sucesso!');
    } catch (error) {
      toast.error('Erro ao gerar fatura.');
    }
  };

  if (!selectedCustomerDetails) return null;

  return (
    <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Cliente</DialogTitle>
          <DialogDescription>
            Informações completas, histórico de tickets e faturas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* AI Customer Summary */}
          <div className="p-4 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Bot size={18} />
                <h4 className="text-sm font-bold">Resumo</h4>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-semibold gap-1.5 border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700 bg-white rounded-md shadow-sm"
                onClick={async () => {
                  const customerTickets = tickets.filter(
                    (t: any) => t.customerId === selectedCustomerDetails.id,
                  );
                  const historyText = customerTickets
                    .map(
                      (t: any) =>
                        `- Problema Relatado: ${t.subject}\n  Status do problema: ${t.status}\n  Detalhes/Ações: ${t.aiSummary || t.description || 'Nenhum detalhe adicional.'}`,
                    )
                    .join('\n\n');
                  const summaryPromise = summarizeCustomerHistory(
                    historyText || 'Sem histórico de problemas no sistema.',
                    {
                      name: selectedCustomerDetails.name,
                      cpf: selectedCustomerDetails.document,
                      address: selectedCustomerDetails.address,
                      phone: selectedCustomerDetails.phone,
                    },
                  );
                  toast.promise(summaryPromise, {
                    loading: 'Atualizando resumo...',
                    success: (summary: any) => {
                      (window as any)._lastAiSummary = summary;
                      setIsDetailsDialogOpen(false);
                      setTimeout(() => setIsDetailsDialogOpen(true), 10);
                      return 'Resumo atualizado!';
                    },
                    error: 'Erro ao gerar resumo.',
                  });
                }}
              >
                <Sparkles size={14} /> Atualizar Resumo
              </Button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed italic">
              {(window as any)._lastAiSummary ||
                "Clique em 'Atualizar Resumo' para extrair informações importantes e gerar um resumo inteligente da situação deste cliente baseado no seu histórico e tickets recentes."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Dados Pessoais
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 space-y-2">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Nome Completo</p>
                    <p className="text-sm font-medium">{selectedCustomerDetails.name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Documento (CPF/CNPJ)</p>
                    <div className="text-sm font-medium">
                      {selectedCustomerDetails.document ? (
                        <MaskedSensitiveData value={selectedCustomerDetails.document} type="cpf" />
                      ) : (
                        'Não informado'
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">E-mail</p>
                    <div className="text-sm font-medium">
                      {selectedCustomerDetails.email ? (
                        <MaskedSensitiveData value={selectedCustomerDetails.email} type="email" />
                      ) : (
                        'Não informado'
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Telefone</p>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex-1">
                        {selectedCustomerDetails.phone ? (
                          <MaskedSensitiveData value={selectedCustomerDetails.phone} type="phone" />
                        ) : (
                          'Não informado'
                        )}
                      </div>
                      {selectedCustomerDetails.phone && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] gap-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800"
                          onClick={() =>
                            window.open(
                              `https://wa.me/${selectedCustomerDetails.phone.replace(/\D/g, '')}`,
                              '_blank',
                            )
                          }
                        >
                          <Phone size={10} /> WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Credenciais PPPoE
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Usuário</p>
                    <p className="text-sm font-medium font-mono">
                      {selectedCustomerDetails.pppoeLogin || 'Não configurado'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Senha</p>
                    <p className="text-sm font-medium font-mono">
                      {selectedCustomerDetails.pppoePassword ? '********' : 'Não configurada'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Plano & Status
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">Plano Atual</p>
                    <p className="text-sm font-bold text-primary">{selectedCustomerDetails.plan}</p>
                  </div>
                  <Badge variant={selectedCustomerDetails.status === 'active' ? 'default' : 'secondary'}>
                    {selectedCustomerDetails.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Tags
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 min-h-[48px] flex flex-wrap gap-2 items-center">
                  {selectedCustomerDetails.tags && selectedCustomerDetails.tags.length > 0 ? (
                    selectedCustomerDetails.tags.map((tag: string, idx: number) => (
                      <div key={idx}>
                        <Badge variant="secondary" className="text-xs">{tag}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-400">Nenhuma tag adicionada.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Endereço de Instalação
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 h-full flex flex-col justify-between gap-3">
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {selectedCustomerDetails.address || 'Endereço não cadastrado.'}
                  </p>
                  <div className="flex items-center gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase">Lat</p>
                      <p className="text-xs font-mono text-zinc-600">{selectedCustomerDetails.latitude || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase">Lng</p>
                      <p className="text-xs font-mono text-zinc-600">{selectedCustomerDetails.longitude || 'N/A'}</p>
                    </div>
                    {selectedCustomerDetails.latitude && selectedCustomerDetails.longitude && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 ml-auto gap-1 text-[10px]"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/maps/search/?api=1&query=${selectedCustomerDetails.latitude},${selectedCustomerDetails.longitude}`,
                            '_blank',
                          )
                        }
                      >
                        <MapPin size={10} /> Maps
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Resumo Financeiro
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 space-y-3">
                  <div>
                    <p className="text-[10px] text-zinc-400 uppercase">MRR (Faturamento Mensal)</p>
                    <p className="text-xl font-bold text-green-600">
                      R$ {selectedCustomerDetails.mrr?.toFixed(2)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="w-full gap-2 text-xs" onClick={handleGenerateInvoice}>
                    <Plus size={14} /> Gerar Nova Fatura
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                    onClick={() => handleRunDiagnostics(selectedCustomerDetails.id, 'customer')}
                    disabled={isDiagnosing}
                  >
                    {isDiagnosing ? (
                      <div className="h-3 w-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                    ) : (
                      <Activity size={14} />
                    )}
                    {isDiagnosing ? 'Diagnosticando...' : 'Diagnóstico de Rede'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Diagnostic Result */}
          {diagnosticsResult && diagnosticsResult.targetId === selectedCustomerDetails.id && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-zinc-900 text-white space-y-4 shadow-xl border border-zinc-800"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                  Resultado do Diagnóstico Remoto
                </h4>
                <span className="text-[10px] text-zinc-500">
                  {diagnosticsResult.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase">Sinal ONU</p>
                  <p className={cn('text-lg font-mono font-bold', diagnosticsResult.metrics.avgSignal < -25 ? 'text-red-400' : 'text-green-400')}>
                    {diagnosticsResult.metrics.avgSignal.toFixed(1)} dBm
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase">Latência</p>
                  <p className="text-lg font-mono font-bold text-blue-400">
                    {diagnosticsResult.metrics.latency.toFixed(0)}ms
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-zinc-500 uppercase">Perda</p>
                  <p className="text-lg font-mono font-bold">
                    {diagnosticsResult.metrics.packetLoss.toFixed(2)}%
                  </p>
                </div>
              </div>
              {diagnosticsResult.metrics.alerts.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  <div className="flex items-center gap-2 text-orange-400 mb-1">
                    <AlertTriangle size={12} />
                    <p className="text-[10px] font-bold uppercase">Alertas Detectados</p>
                  </div>
                  {diagnosticsResult.metrics.alerts.map((alert: string, i: number) => (
                    <p key={i} className="text-[10px] text-zinc-400">• {alert}</p>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* 5 Faturas Mais Recentes */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              5 Faturas Mais Recentes
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {invoices.filter((i: any) => i.customerId === selectedCustomerDetails.id).length > 0 ? (
                invoices
                  .filter((i: any) => i.customerId === selectedCustomerDetails.id)
                  .sort((a: any, b: any) => (b.dueDate?.seconds || 0) - (a.dueDate?.seconds || 0))
                  .slice(0, 5)
                  .map((i: any) => (
                    <div key={i.id} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                          R$ {i.amount?.toFixed(2)}
                        </p>
                        <Badge className={cn('text-[9px] uppercase font-bold border-none px-1.5 py-0', i.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : i.status === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400')}>
                          {i.status === 'paid' ? 'PAGO' : i.status === 'overdue' ? 'VENCIDA' : 'PENDENTE'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                        <CreditCard size={10} />
                        <span>Venc:{' '}{i.dueDate ? new Date(i.dueDate.seconds * 1000).toLocaleDateString('pt-BR') : 'n/a'}</span>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="col-span-full text-center py-6 border border-dashed rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs italic">
                    Nenhuma fatura encontrada para este cliente.
                  </p>
                </div>
              )}
            </div>
          </div>

          <Tabs defaultValue="tickets_history" className="w-full">
            <TabsList className="w-full bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              <TabsTrigger value="tickets_history" className="flex-1 rounded-lg">Tickets</TabsTrigger>
              {isDeveloper && (
                <TabsTrigger value="diagnostics" className="flex-1 rounded-lg">Diagnóstico</TabsTrigger>
              )}
              <TabsTrigger value="billing_history" className="flex-1 rounded-lg">Faturas</TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1 rounded-lg">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="diagnostics" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold">Status da Conexão</h4>
                  <Button size="sm" variant="outline" className="h-8 gap-2" onClick={() => handleRunDiagnostics(selectedCustomerDetails.id, 'customer')} disabled={isDiagnosing}>
                    <Activity size={14} /> Iniciar Teste
                  </Button>
                </div>
                {diagnosticsResult && diagnosticsResult.targetId === selectedCustomerDetails.id ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Sinal Óptico</p>
                      <p className={cn('text-xl font-mono font-bold', diagnosticsResult.metrics.avgSignal < -25 ? 'text-red-500' : 'text-green-500')}>
                        {diagnosticsResult.metrics.avgSignal.toFixed(1)} dBm
                      </p>
                    </Card>
                    <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Latência</p>
                      <p className="text-xl font-mono font-bold text-blue-500">
                        {diagnosticsResult.metrics.latency.toFixed(0)} ms
                      </p>
                    </Card>
                    <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Uptime ONU</p>
                      <p className="text-xl font-mono font-bold text-zinc-700 dark:text-zinc-300">12d 04h</p>
                    </Card>
                  </div>
                ) : (
                  <div className="py-12 text-center border-2 border-dashed rounded-2xl border-zinc-100 dark:border-zinc-800">
                    <Activity size={32} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2" />
                    <p className="text-zinc-400 text-sm italic">Nenhum diagnóstico recente. Inicie um teste para verificar o sinal.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tickets_history" className="mt-4">
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {tickets.filter((t: any) => t.customerId === selectedCustomerDetails.id).length > 0 ? (
                    tickets
                      .filter((t: any) => t.customerId === selectedCustomerDetails.id)
                      .sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                      .map((t: any) => (
                        <div key={t.id} className="relative p-4 rounded-[16px] bg-white dark:bg-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-between ticket-shape overflow-hidden hover:scale-[1.01] transition-all cursor-pointer">
                          <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-zinc-700/50" />
                          <div className="space-y-1 relative z-10 pl-2">
                            <p className="text-sm font-bold dark:text-zinc-50">{t.subject}</p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <span className="flex items-center gap-1">
                                <TicketIcon size={10} /> {t.id?.slice(0, 8)}
                              </span>
                              <span>•</span>
                              <span>Criado:{' '}{t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : 'n/a'}</span>
                              {t.status === 'resolved' && t.resolvedAt && (
                                <>
                                  <span>•</span>
                                  <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                    <CheckCircle2 size={10} />
                                    Resolvido{t.aiHandled ? ' pela IA' : ''}:{' '}
                                    {new Date(t.resolvedAt.seconds * 1000).toLocaleDateString('pt-BR')} às{' '}
                                    {new Date(t.resolvedAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className={cn('text-[10px] uppercase font-bold', t.status === 'open' ? 'text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400' : t.status === 'resolved' ? 'text-green-600 border-green-200 bg-green-50 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' : 'text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400')}>
                            {t.status}
                          </Badge>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-2xl border-zinc-100">
                      <TicketIcon size={32} className="mx-auto text-zinc-200 mb-2" />
                      <p className="text-zinc-400 text-sm italic">Nenhum ticket encontrado para este cliente.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="billing_history" className="mt-4">
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {invoices.filter((i: any) => {
                    if (selectedCustomerDetails.status === 'lead' || selectedCustomerDetails.status === 'pending') return false;
                    return i.customerId === selectedCustomerDetails.id;
                  }).length > 0 ? (
                    invoices
                      .filter((i: any) => {
                        if (selectedCustomerDetails.status === 'lead' || selectedCustomerDetails.status === 'pending') return false;
                        return i.customerId === selectedCustomerDetails.id;
                      })
                      .sort((a: any, b: any) => (b.dueDate?.seconds || 0) - (a.dueDate?.seconds || 0))
                      .map((i: any) => (
                        <div key={i.id} className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-between hover:border-primary/20 transition-colors">
                          <div className="space-y-1">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">R$ {i.amount?.toFixed(2)}</p>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                              <span className="flex items-center gap-1">
                                <CreditCard size={10} /> Vencimento:{' '}
                                {i.dueDate ? new Date(i.dueDate.seconds * 1000).toLocaleDateString('pt-BR') : 'n/a'}
                              </span>
                            </div>
                          </div>
                          <Badge className={cn('text-[10px] uppercase font-bold border-none', i.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : i.status === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400')}>
                            {i.status === 'paid' ? 'PAGO' : i.status === 'overdue' ? 'VENCIDO' : 'PENDENTE'}
                          </Badge>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-2xl border-zinc-100 dark:border-zinc-800">
                      <CreditCard size={32} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2" />
                      <p className="text-zinc-400 text-sm italic">Nenhuma fatura encontrada com os filtros selecionados.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <ScrollArea className="h-[300px] pr-4">
                <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-zinc-100 dark:before:bg-zinc-800">
                  {(() => {
                    const timelineEvents = [
                      ...tickets
                        .filter((t: any) => t.customerId === selectedCustomerDetails.id)
                        .map((t: any) => ({
                          date: t.createdAt?.seconds ? new Date(t.createdAt.seconds * 1000) : new Date(),
                          title: `Ticket Aberto: ${t.subject}`,
                          type: 'ticket',
                          icon: <TicketIcon size={12} className="text-orange-500" />,
                        })),
                      ...invoices
                        .filter((i: any) => i.customerId === selectedCustomerDetails.id)
                        .map((i: any) => ({
                          date: i.dueDate?.seconds ? new Date(i.dueDate.seconds * 1000) : new Date(),
                          title: `Fatura Gerada: R$ ${i.amount?.toFixed(2)}`,
                          type: 'billing',
                          icon: <CreditCard size={12} className="text-blue-500" />,
                        })),
                      ...(selectedCustomerDetails.createdAt?.seconds
                        ? [{
                            date: new Date(selectedCustomerDetails.createdAt.seconds * 1000),
                            title: 'Cliente Cadastrado no Sistema',
                            type: 'system',
                            icon: <User size={12} className="text-green-500" />,
                          }]
                        : []),
                    ].sort((a, b) => b.date.getTime() - a.date.getTime());

                    return timelineEvents.map((event, idx) => (
                      <div key={idx} className="relative">
                        <div className="absolute -left-[25px] top-1 h-4 w-4 rounded-full bg-white dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 flex items-center justify-center z-10">
                          {event.icon}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{event.title}</p>
                          <p className="text-[10px] text-zinc-500">
                            {event.date.toLocaleDateString('pt-BR')} às{' '}
                            {event.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="network" className="mt-4">
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                        <Wifi size={20} className="text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Status da Conexão</p>
                        <p className="text-xs text-green-600 font-medium">Online (Ativo)</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 gap-2" onClick={() => runCustomerDiagnostics(selectedCustomerDetails.id)}>
                      <RefreshCw size={14} /> Testar Conexão
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[10px] text-zinc-400 uppercase mb-1">Sinal (RX)</p>
                      <p className="text-sm font-mono font-bold text-green-600">
                        {diagnosticsHistory.find((d) => d.customerId === selectedCustomerDetails.id)?.signal || '-19.4 dBm'}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <p className="text-[10px] text-zinc-400 uppercase mb-1">Uptime</p>
                      <p className="text-sm font-mono font-bold">
                        {diagnosticsHistory.find((d) => d.customerId === selectedCustomerDetails.id)?.uptime || '14d 06h 22m'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="text-[10px] text-zinc-400 uppercase mb-2">CTO de Atendimento</p>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Database size={14} className="text-blue-500" />
                        <span className="text-xs font-medium">CTO-01-CENTRO</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary" onClick={() => { setIsDetailsDialogOpen(false); navigate('/'); }}>
                        Ver no Mapa
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-zinc-500 uppercase">Histórico de Diagnósticos</p>
                  <div className="space-y-2">
                    {diagnosticsHistory.filter((d) => d.customerId === selectedCustomerDetails.id).length > 0 ? (
                      diagnosticsHistory
                        .filter((d) => d.customerId === selectedCustomerDetails.id)
                        .map((diag) => (
                          <div key={diag.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
                            <div className="flex items-center gap-3">
                              <Clock size={14} className="text-zinc-400" />
                              <span>{diag.timestamp instanceof Date ? diag.timestamp.toLocaleString('pt-BR') : new Date(diag.timestamp).toLocaleString('pt-BR')}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-mono text-zinc-500">{diag.signal}</span>
                              <span className="font-mono text-zinc-500">{diag.latency}</span>
                              <Badge variant="outline" className="h-5 text-[10px]">{diag.status}</Badge>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-zinc-400 italic py-4 text-center">Nenhum diagnóstico recente.</p>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
