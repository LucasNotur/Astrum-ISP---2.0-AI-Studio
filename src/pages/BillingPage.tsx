import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Download,
  CreditCard,
  FileText,
  Wallet,
  Clock,
  Filter,
  Receipt
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { GlowButton } from "@/src/components/ui/glow-button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { cn } from '@/src/lib/utils';
import { useAppStore } from '../store/useAppStore';
import { supabase } from '@/src/lib/supabase';
import { toast } from 'sonner';

import { RequireProvedorAdmin } from '../components/RequireProvedorAdmin';

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });

export function BillingPage() {
  const { invoices, customers, setConfirmDialog, user, currentUserRole } = useAppStore();
  const isProvedorAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';
  const [tab, setTab] = useState<'clients' | 'subscription'>('clients');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoicePeriodFilter, setInvoicePeriodFilter] = useState('all');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const { setIsCreateInvoiceDialogOpen, setSelectedInvoiceDetails } = useAppStore();

  const tenantId = user?.tenantId || 'default';
  const [ispSubscription, setIspSubscription] = useState<any>(null);
  const [ispInvoices, setIspInvoices] = useState<any[]>([]);
  const [ispLoading, setIspLoading] = useState(true);

  useEffect(() => {
    const fetchIspBilling = async () => {
      try {
        setIspLoading(true);
        const [subRes, invRes] = await Promise.all([
           fetch(`/api/billing/subscription/${tenantId}`),
           fetch(`/api/billing/invoices/${tenantId}`)
        ]);
        const subData = await subRes.json();
        const invData = await invRes.json();
        setIspSubscription(subData.subscription);
        setIspInvoices(invData.invoices || []);
      } catch (error) {
        console.error("Erro ao buscar dados de faturamento do ISP:", error);
      } finally {
        setIspLoading(false);
      }
    };
    if (tenantId && isProvedorAdmin) fetchIspBilling();
  }, [tenantId, isProvedorAdmin]);

  const simulatePayment = async (id: string) => {
     try {
       await supabase.from('invoices').update({ status: 'paid' }).eq('id', id);
       toast.success("Fatura marcada como paga.");
     } catch (error) {
       toast.error("Erro ao atualizar fatura.");
     }
  };

  // Filter out invoices for customers that are fully registered avoiding pending/leads
  const validInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const customer = customers.find(c => c.id === inv.customerId);
      return customer && customer.status !== 'pending' && customer.status !== 'lead';
    });
  }, [invoices, customers]);

  // --- Real-time Metrics Calculations ---
  const billingMetrics = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let paid = 0;
    let pending = 0;
    let overdue = 0;
    let totalPendingAllTime = 0;

    validInvoices.forEach(inv => {
      let dueDate: Date | null = null;
      if (inv.dueDate?.seconds) {
        dueDate = new Date(inv.dueDate.seconds * 1000);
      } else if (typeof inv.dueDate === 'string') {
        const parts = inv.dueDate.split('/');
        if (parts.length === 3) {
          dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
             dueDate = new Date(inv.dueDate);
        }
      }

      const isCurrentMonth = dueDate && dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;

      if (inv.status === 'paid') {
        if (isCurrentMonth) paid += inv.amount;
      } else if (inv.status === 'pending') {
        if (isCurrentMonth) pending += inv.amount;
        totalPendingAllTime += inv.amount;
      } else if (inv.status === 'overdue') {
        if (isCurrentMonth) overdue += inv.amount;
        totalPendingAllTime += inv.amount;
      }
    });

    return { paid, pending, overdue, totalPendingAllTime };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let filtered = validInvoices;

    if (invoiceSearch) {
      const lowerQuery = invoiceSearch.toLowerCase();
      filtered = filtered.filter(i => {
        const customer = customers.find(c => c.id === i.customerId);
        return (customer?.name?.toLowerCase().includes(lowerQuery) || i.id.toLowerCase().includes(lowerQuery));
      });
    }

    if (invoiceStatusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === invoiceStatusFilter);
    }

    if (invoicePeriodFilter !== 'all') {
       const today = new Date();
       const currentMonth = today.getMonth();
       const currentYear = today.getFullYear();

       filtered = filtered.filter(i => {
         let dueDate: Date | null = null;
         if (i.dueDate?.seconds) {
           dueDate = new Date(i.dueDate.seconds * 1000);
         } else if (typeof i.dueDate === 'string') {
             const parts = i.dueDate.split('/');
             if(parts.length === 3) {
                 dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
             } else {
                 dueDate = new Date(i.dueDate);
             }
         }

         if (!dueDate) return true;

         if (invoicePeriodFilter === 'this-month') {
             return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
         } else if (invoicePeriodFilter === 'last-month') {
             let lastMonth = currentMonth - 1;
             let year = currentYear;
             if (lastMonth < 0) {
                 lastMonth = 11;
                 year -= 1;
             }
             return dueDate.getMonth() === lastMonth && dueDate.getFullYear() === year;
         }
         return true;
       });
    }

    // Sort by due date (newest first) as default
    return filtered.sort((a, b) => {
        let dateA = 0; let dateB = 0;
        if(a.dueDate?.seconds) dateA = a.dueDate.seconds;
        if(b.dueDate?.seconds) dateB = b.dueDate.seconds;
        return dateB - dateA; // Descending
    });

  }, [invoices, customers, invoiceSearch, invoiceStatusFilter, invoicePeriodFilter]);

  // Generate generic revenue forecast data if no Real data
  const revenueForecastData = [
    { name: 'Jan', receita: 12000, previsao: 11000 },
    { name: 'Fev', receita: 14500, previsao: 13000 },
    { name: 'Mar', receita: 13800, previsao: 14000 },
    { name: 'Abr', receita: 16000, previsao: 15500 },
    { name: 'Mai', receita: 18200, previsao: 17000 },
    { name: 'Jun', receita: null, previsao: 19500 },
  ];

  const collectionEfficiency = Math.round((billingMetrics.paid / (billingMetrics.paid + billingMetrics.overdue || 1)) * 100);

  const invoiceStatusChip: Record<string, string> = {
    paid: 'bg-astrum-signal/15 text-astrum-signal',
    pending: 'bg-astrum-amber/15 text-astrum-amber',
    overdue: 'bg-astrum-red/15 text-astrum-red',
  };
  const invoiceStatusLabel: Record<string, string> = {
    paid: 'Paga', pending: 'Pendente', overdue: 'Vencida',
  };

  return (
    <motion.div
      key="billing"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* D-008 — hero da seção: eyebrow + título display + ações */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet size={13} strokeWidth={1.75} />
            Cobrança · <span className="font-mono text-foreground">R$ {brl(billingMetrics.totalPendingAllTime)}</span> em aberto
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
            Financeiro
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {isProvedorAdmin && (
            <div className="flex bg-secondary/60 p-1 rounded-full border border-border">
              <button
                onClick={() => setTab('clients')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-fast ${tab === 'clients' ? 'bg-primary text-primary-foreground shadow-2' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Cobranças
              </button>
              <button
                onClick={() => setTab('subscription')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-fast ${tab === 'subscription' ? 'bg-primary text-primary-foreground shadow-2' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Minha assinatura
              </button>
            </div>
          )}
          {/* D-011 — glow CTA: a ação de criação da tela */}
          {tab === 'clients' && (
            <GlowButton icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setIsCreateInvoiceDialogOpen?.(true)}>
              Nova Fatura
            </GlowButton>
          )}
        </div>
      </header>

      {tab === 'subscription' ? (
        <RequireProvedorAdmin>
          <div className="space-y-6">
            <Card className="rounded-stable-xl border border-border bg-card shadow-1">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-display text-xl font-medium tracking-tight">Sua assinatura atual</h3>
                  <p className="text-sm text-muted-foreground mt-1">Gerencie seu plano e método de pagamento.</p>
                </div>
                {ispLoading ? (
                   <div className="space-y-3" aria-label="Carregando assinatura">
                     <div className="h-20 rounded-stable-lg bg-secondary/60 animate-pulse" />
                     <div className="h-9 w-64 rounded-full bg-secondary/60 animate-pulse" />
                   </div>
                ) : ispSubscription ? (
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-stable-lg border border-border bg-secondary/40">
                     <div>
                       <h4 className="font-display font-semibold text-lg">Plano {String(ispSubscription.plan || '').toUpperCase()}</h4>
                       <div className="flex items-center gap-2 mt-1.5">
                         <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ispSubscription.status === 'ACTIVE' || ispSubscription.status === 'active' ? 'bg-astrum-signal/15 text-astrum-signal' : 'bg-astrum-slate/20 text-astrum-slate'}`}>
                           {ispSubscription.status === 'ACTIVE' || ispSubscription.status === 'active' ? 'Ativa' : 'Inativa'}
                         </span>
                         <span className="text-xs text-muted-foreground">
                           Próxima cobrança: <span className="font-mono text-foreground">{ispSubscription.next_billing_date ? new Date(ispSubscription.next_billing_date).toLocaleDateString('pt-BR') : 'N/D'}</span>
                         </span>
                       </div>
                     </div>
                     <div className="text-left sm:text-right">
                       <p className="font-mono text-2xl font-semibold tabular-nums">R$ {(ispSubscription.amount_cents / 100).toFixed(2).replace('.', ',')}</p>
                       <p className="text-xs text-muted-foreground">/mês</p>
                     </div>
                   </div>
                ) : (
                   <div className="py-10 text-center rounded-stable-lg border border-dashed border-border">
                     <Receipt size={20} strokeWidth={1.5} className="mx-auto text-muted-foreground/60" />
                     <p className="text-sm text-muted-foreground mt-3">Nenhuma assinatura ativa encontrada.</p>
                     <Button className="mt-4" variant="outline" onClick={() => console.log('Chamar upgradeFlow ou Support')}>Escolher plano</Button>
                   </div>
                )}

                {!ispLoading && (
                  <Button variant="secondary" className="gap-2"><CreditCard size={16} strokeWidth={1.75} /> Atualizar método de pagamento</Button>
                )}
              </CardContent>
            </Card>

            {/* D-008 — histórico em tabela densa */}
            <div>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Assinatura · {ispInvoices.length} lançamentos</p>
                  <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Histórico de faturas</h3>
                </div>
              </div>
              <div className="rounded-stable-xl border border-border bg-card shadow-1 overflow-hidden">
               {ispLoading ? (
                 <div className="p-4 space-y-2" aria-label="Carregando faturas">
                   {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-stable-sm bg-secondary/60 animate-pulse" />)}
                 </div>
               ) : (
                 <Table>
                   <TableHeader>
                     <TableRow className="border-border hover:bg-transparent">
                       <TableHead className="pl-6 text-xs">Vencimento</TableHead>
                       <TableHead className="text-xs">Valor</TableHead>
                       <TableHead className="text-xs">Status</TableHead>
                       <TableHead className="text-right pr-6 text-xs">Opções</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {ispInvoices.length > 0 ? ispInvoices.map((inv: any) => (
                       <TableRow key={inv.id} className="border-border hover:bg-foreground/[0.03] transition-colors duration-fast">
                         <TableCell className="pl-6 font-mono text-xs">
                           {inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : 'N/D'}
                         </TableCell>
                         <TableCell className="font-mono text-sm tabular-nums">R$ {inv.amount_cents ? (inv.amount_cents / 100).toFixed(2).replace('.', ',') : '0,00'}</TableCell>
                         <TableCell>
                           <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${inv.status === 'PAID' || inv.status === 'paid' ? 'bg-astrum-signal/15 text-astrum-signal' : 'bg-astrum-amber/15 text-astrum-amber'}`}>
                             {inv.status === 'PAID' || inv.status === 'paid' ? 'Paga' : 'Pendente'}
                           </span>
                         </TableCell>
                         <TableCell className="text-right pr-6">
                           {inv.invoice_url && (
                             <Button variant="ghost" size="sm" className="gap-2 text-astrum-fiber hover:text-astrum-fiber" onClick={() => window.open(inv.invoice_url, '_blank')}>
                               <FileText size={16} strokeWidth={1.75} /> Ver fatura
                             </Button>
                           )}
                         </TableCell>
                       </TableRow>
                     )) : (
                       <TableRow>
                         <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                           <div className="flex flex-col items-center gap-3">
                             <Receipt size={20} strokeWidth={1.5} className="opacity-50" />
                             <span className="text-sm">Nenhuma fatura encontrada.</span>
                           </div>
                         </TableCell>
                       </TableRow>
                     )}
                   </TableBody>
                 </Table>
               )}
              </div>
            </div>
          </div>
        </RequireProvedorAdmin>
      ) : (
        <div className="space-y-6">
          {/* D-007 — métricas compactas com barra de accent à esquerda */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
            {[
              { label: 'Recebido no mês', value: billingMetrics.paid, icon: CheckCircle2, bar: 'bg-astrum-signal', tint: 'text-astrum-signal' },
              { label: 'A receber no mês', value: billingMetrics.pending, icon: Clock, bar: 'bg-astrum-amber', tint: 'text-astrum-amber' },
              { label: 'Vencidas no mês', value: billingMetrics.overdue, icon: AlertTriangle, bar: 'bg-astrum-red', tint: 'text-astrum-red' },
              { label: 'Inadimplência acumulada', value: billingMetrics.totalPendingAllTime, icon: Wallet, bar: 'bg-astrum-orange', tint: 'text-astrum-orange' },
            ].map(({ label, value, icon: Icon, bar, tint }) => (
              <Card key={label} className="relative overflow-hidden rounded-stable-xl border border-border bg-card shadow-1">
                <span aria-hidden className={`absolute left-0 top-4 bottom-4 w-0.5 rounded-full ${bar}`} />
                <CardContent className="p-3 md:p-4 flex flex-col justify-center">
                  <p className="text-[10px] md:text-xs text-muted-foreground font-medium">{label}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <Icon size={12} strokeWidth={1.75} className={`${tint} self-center`} />
                    <span className="text-[10px] text-muted-foreground font-mono">R$</span>
                    <span className="text-base md:text-2xl font-semibold font-mono tabular-nums leading-none">{brl(value)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 rounded-stable-xl border border-border bg-card shadow-1">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground">Projeção · MRR</p>
                <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Previsão de receita</h3>
                <div className="h-[260px] mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueForecastData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `R$ ${val}`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius-stable-lg)', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="receita" name="Realizado" stroke="var(--color-astrum-signal)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-astrum-signal)', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="previsao" name="Projeção" stroke="var(--color-astrum-fiber)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* D-012 — spotlight P&B: o momento-herói da tela em card branco puro */}
            <Card className="rounded-stable-xl border-none bg-primary text-primary-foreground shadow-2">
              <CardContent className="p-6 flex flex-col h-full">
                <p className="text-xs text-primary-foreground/60">Performance de cobrança</p>
                <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Saúde financeira</h3>

                <div className="mt-6 space-y-2">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-primary-foreground/60">Eficiência de cobrança</span>
                    <span className="font-mono font-semibold tabular-nums">{collectionEfficiency}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-primary-foreground/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-foreground rounded-full transition-all duration-slow ease-productive"
                      style={{ width: `${collectionEfficiency}%` }}
                    />
                  </div>
                </div>

                {/* chave-valor com hairline (D-012) */}
                <div className="mt-6 flex-1 flex flex-col justify-end">
                  <div className="flex items-center justify-between py-3 border-t border-primary-foreground/10">
                    <span className="flex items-center gap-2 text-sm text-primary-foreground/60">
                      <TrendingUp size={15} strokeWidth={1.75} /> Crescimento MRR
                    </span>
                    <span className="font-mono font-semibold tabular-nums">+5.2%</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-t border-primary-foreground/10">
                    <span className="flex items-center gap-2 text-sm text-primary-foreground/60">
                      <AlertTriangle size={15} strokeWidth={1.75} /> Risco de inadimplência
                    </span>
                    <span className="font-semibold text-sm">Baixo</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FILTERS */}
          <div className="flex items-center gap-1.5 md:gap-2.5 bg-card p-1.5 md:p-2 rounded-stable-lg border border-border overflow-x-auto no-scrollbar">
            <Filter size={14} strokeWidth={1.75} className="text-muted-foreground shrink-0 ml-1" />
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} strokeWidth={1.75} />
              <Input
                placeholder="Buscar por cliente ou ID da fatura..."
                className="pl-9 h-8 text-xs rounded-stable-sm bg-input/60 border-border"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
              />
            </div>
            <select
              className="h-8 text-[10px] md:text-xs rounded-stable-sm border border-border bg-input/60 outline-none focus:ring-2 focus:ring-ring px-1.5 md:px-2 shrink-0 font-medium"
              value={invoiceStatusFilter}
              onChange={(e) => setInvoiceStatusFilter(e.target.value)}
            >
              <option value="all">Status</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagas</option>
              <option value="overdue">Vencidas</option>
            </select>
            <select
              className="h-8 text-[10px] md:text-xs rounded-stable-sm border border-border bg-input/60 outline-none focus:ring-2 focus:ring-ring px-1.5 md:px-2 shrink-0 font-medium"
              value={invoicePeriodFilter}
              onChange={(e) => setInvoicePeriodFilter(e.target.value)}
            >
              <option value="all">Período</option>
              <option value="this-month">Este mês</option>
              <option value="last-month">Mês passado</option>
            </select>
          </div>

          {/* D-008 — tabela densa de faturas */}
          <div>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs text-muted-foreground">Cobrança · {filteredInvoices.length} faturas</p>
                <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Faturas dos clientes</h3>
              </div>
            </div>
            <div className="rounded-stable-xl border border-border bg-card shadow-1 overflow-hidden">
              {selectedInvoices.length > 0 && (
                <div className="p-3 md:p-4 bg-secondary/40 border-b border-border flex items-center justify-between gap-3 animate-in slide-in-from-top duration-base">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-medium">
                      <span className="font-mono">{selectedInvoices.length}</span> selecionadas
                    </span>
                    <div className="h-4 w-px bg-border" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 gap-2 rounded-full text-xs border-astrum-signal/30 text-astrum-signal hover:bg-astrum-signal/10 hover:text-astrum-signal" onClick={() => {
                        setConfirmDialog?.({
                          isOpen: true,
                          title: 'Confirmar Pagamento em Massa',
                          message: `Deseja marcar as ${selectedInvoices.length} faturas selecionadas como pagas?`,
                          onConfirm: async () => {
                            try {
                              const promises = selectedInvoices.map(id =>
                                supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
                              );
                              await Promise.all(promises);
                              setSelectedInvoices([]);
                              toast.success(`${selectedInvoices.length} faturas marcadas como pagas.`);
                            } catch (error) {
                              toast.error("Erro ao atualizar faturas.");
                            }
                          }
                        });
                      }}>
                        <CheckCircle2 size={14} strokeWidth={1.75} /> Marcar como pago
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-2 rounded-full text-xs border-astrum-amber/30 text-astrum-amber hover:bg-astrum-amber/10 hover:text-astrum-amber">
                        <Mail size={14} strokeWidth={1.75} /> Enviar lembrete
                      </Button>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedInvoices([])}>Cancelar</Button>
                </div>
              )}
              <div className="overflow-x-auto w-full">
                <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-12 pl-6">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todas as faturas"
                        className="rounded accent-current border-border bg-input"
                        checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedInvoices(filteredInvoices.map(i => i.id));
                          else setSelectedInvoices([]);
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="pr-6 text-right text-xs">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.length > 0 ? filteredInvoices.map(i => {
                    const customer = customers.find(c => c.id === i.customerId);
                    return (
                      <TableRow
                        key={i.id}
                        className={cn("group cursor-pointer border-border hover:bg-foreground/[0.03] transition-colors duration-fast", selectedInvoices.includes(i.id) && "bg-astrum-lemon/[0.04]")}
                        onClick={() => setSelectedInvoiceDetails?.(i)}
                      >
                        <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar fatura de ${customer?.name || 'cliente'}`}
                            className="rounded accent-current border-border bg-input"
                            checked={selectedInvoices.includes(i.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedInvoices(prev => [...prev, i.id]);
                              else setSelectedInvoices(prev => prev.filter(id => id !== i.id));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={customer?.avatar || customer?.photoUrl || customer?.avatarUrl || customer?.profilePicUrl} />
                              <AvatarFallback className="text-[9px] bg-secondary">{customer ? customer.name.charAt(0) : '?'}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{customer ? customer.name : i.customerId}</p>
                              <p className="font-mono text-[10px] text-muted-foreground">#{i.id.slice(0, 6)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {i.dueDate?.seconds ? new Date(i.dueDate.seconds * 1000).toLocaleDateString('pt-BR') : (i.dueDate || 'n/a')}
                        </TableCell>
                        <TableCell className="font-mono text-sm tabular-nums">R$ {i.amount?.toFixed(2).replace('.', ',')}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${invoiceStatusChip[i.status] || 'bg-astrum-slate/20 text-astrum-slate'}`}>
                            {invoiceStatusLabel[i.status] || i.status}
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-fast">
                            {i.status !== 'paid' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-full text-[10px] gap-1 border-astrum-signal/30 text-astrum-signal hover:bg-astrum-signal/10 hover:text-astrum-signal"
                                onClick={() => {
                                  setConfirmDialog?.({
                                    isOpen: true,
                                    title: 'Confirmar Pagamento',
                                    message: `Deseja marcar a fatura de R$ ${i.amount.toFixed(2)} do cliente ${customer?.name || 'Desconhecido'} como paga manualmente?`,
                                    onConfirm: () => simulatePayment(i.id)
                                  });
                                }}
                              >
                                <CheckCircle2 size={12} strokeWidth={1.75} /> Pagar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => console.log('Export PDF', i.id)}
                            >
                              <Download size={12} strokeWidth={1.75} /> PDF
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px]"
                              onClick={() => setSelectedInvoiceDetails?.(i)}
                            >
                              Ver fatura
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        <div className="flex flex-col items-center gap-3">
                          <Receipt size={20} strokeWidth={1.5} className="opacity-50" />
                          <span className="text-sm">Nenhuma fatura encontrada com os filtros atuais.</span>
                          <Button variant="outline" size="sm" className="rounded-full" onClick={() => setIsCreateInvoiceDialogOpen?.(true)}>
                            <Plus size={14} strokeWidth={1.75} className="mr-1" /> Criar primeira fatura
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
