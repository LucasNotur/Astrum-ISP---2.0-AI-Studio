import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle2,
  Mail,
  Download
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { toast } from 'sonner';

export function BillingPage() {
  const { invoices, customers, setConfirmDialog } = useAppStore();
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoicePeriodFilter, setInvoicePeriodFilter] = useState('all');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const { setIsCreateInvoiceDialogOpen, setSelectedInvoiceDetails } = useAppStore(); // Assuming you'll add these to the store later or pass as props

  const simulatePayment = async (id: string) => {
     try {
       await updateDoc(doc(db, 'billing_invoices', id), { status: 'paid' });
       toast.success("Fatura marcada como paga.");
     } catch (error) {
       toast.error("Erro ao atualizar fatura.");
     }
  };

  // --- Real-time Metrics Calculations ---
  const billingMetrics = useMemo(() => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    let totalPendingAllTime = 0;

    invoices.forEach(inv => {
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
    let filtered = invoices;
    
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


  return (
    <motion.div 
      key="billing"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Controle de faturas, MRR e inadimplência.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsCreateInvoiceDialogOpen?.(true)}>
          <Plus size={18} /> Nova Fatura
        </Button>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <Input 
              placeholder="Buscar por cliente ou ID da fatura..." 
              className="pl-10"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select 
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={invoiceStatusFilter}
            onChange={(e) => setInvoiceStatusFilter(e.target.value)}
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagas</option>
            <option value="overdue">Vencidas</option>
          </select>
          <select 
            className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            value={invoicePeriodFilter}
            onChange={(e) => setInvoicePeriodFilter(e.target.value)}
          >
            <option value="all">Todo o Período</option>
            <option value="this-month">Este Mês</option>
            <option value="last-month">Mês Passado</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="border-none shadow-sm dark:bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Inadimplência Acumulada</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">R$ {billingMetrics.totalPendingAllTime.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm dark:bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Contas a Receber (Mês Atual)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">R$ {billingMetrics.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm dark:bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Recebido (Mês Atual)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">R$ {billingMetrics.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm dark:bg-zinc-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Inadimplência (Mês Atual)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">R$ {billingMetrics.overdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-none shadow-sm">
          <CardHeader>
            <CardTitle>Previsão de Receita</CardTitle>
            <CardDescription>Comparativo entre receita realizada e projeção baseada em MRR.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueForecastData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `R$ ${val}`} />
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }} />
                <Legend />
                <Line type="monotone" dataKey="receita" name="Realizado" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="previsao" name="Projeção" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle>Saúde Financeira</CardTitle>
            <CardDescription className="text-primary-foreground/70">Resumo de performance de cobrança.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Eficiência de Cobrança</span>
                <span>{Math.round((billingMetrics.paid / (billingMetrics.paid + billingMetrics.overdue || 1)) * 100)}%</span>
              </div>
              <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-500" 
                  style={{ width: `${(billingMetrics.paid / (billingMetrics.paid + billingMetrics.overdue || 1)) * 100}%` }} 
                />
              </div>
            </div>
            <div className="pt-4 border-t border-white/10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-xs opacity-70">Crescimento MRR</p>
                  <p className="text-lg font-bold">+5.2%</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <p className="text-xs opacity-70">Risco de Inadimplência</p>
                  <p className="text-lg font-bold">Baixo</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {selectedInvoices.length > 0 && (
            <div className="p-4 bg-primary/5 dark:bg-primary/10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">{selectedInvoices.length} faturas selecionadas</span>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-2 border-green-200 text-green-700 hover:bg-green-50" onClick={() => {
                    setConfirmDialog?.({
                      isOpen: true,
                      title: 'Confirmar Pagamento em Massa',
                      message: `Deseja marcar as ${selectedInvoices.length} faturas selecionadas como pagas?`,
                      onConfirm: async () => {
                        try {
                          const promises = selectedInvoices.map(id => 
                            updateDoc(doc(db, 'billing_invoices', id), { status: 'paid' })
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
                    <CheckCircle2 size={14} /> Marcar como Pago
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-2 border-orange-200 text-orange-700 hover:bg-orange-50">
                    <Mail size={14} /> Enviar Lembrete
                  </Button>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedInvoices([])}>Cancelar</Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-6">
                  <input 
                    type="checkbox" 
                    className="rounded border-zinc-300 dark:border-zinc-700"
                    checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedInvoices(invoices.map(i => i.id));
                      else setSelectedInvoices([]);
                    }}
                  />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length > 0 ? filteredInvoices.map(i => {
                const customer = customers.find(c => c.id === i.customerId);
                return (
                  <TableRow 
                    key={i.id} 
                    className={cn("group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50", selectedInvoices.includes(i.id) && "bg-primary/5 dark:bg-primary/10")}
                    onClick={() => setSelectedInvoiceDetails?.(i)}
                  >
                    <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-300 dark:border-zinc-700"
                        checked={selectedInvoices.includes(i.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedInvoices(prev => [...prev, i.id]);
                          else setSelectedInvoices(prev => prev.filter(id => id !== i.id));
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{customer ? customer.name : i.customerId}</TableCell>
                    <TableCell>{i.dueDate?.seconds ? new Date(i.dueDate.seconds * 1000).toLocaleDateString('pt-BR') : (i.dueDate || 'n/a')}</TableCell>
                    <TableCell>R$ {i.amount?.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={
                        i.status === 'paid' ? 'default' : 
                        i.status === 'overdue' ? 'destructive' : 'secondary'
                      } className={i.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50' : ''}>
                        {i.status === 'paid' ? 'Pago' : i.status === 'overdue' ? 'Vencida' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {i.status !== 'paid' && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[10px] gap-1 border-green-200 text-green-700 hover:bg-green-50"
                            onClick={() => {
                              setConfirmDialog?.({
                                isOpen: true,
                                title: 'Confirmar Pagamento',
                                message: `Deseja marcar a fatura de R$ ${i.amount.toFixed(2)} do cliente ${customer?.name || 'Desconhecido'} como paga manualmente?`,
                                onConfirm: () => simulatePayment(i.id)
                              });
                            }}
                          >
                            <CheckCircle2 size={12} /> Pagar
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[10px] gap-1"
                          onClick={() => console.log('Export PDF', i.id)}
                        >
                          <Download size={12} /> PDF
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-[10px]"
                          onClick={() => setSelectedInvoiceDetails?.(i)}
                        >
                          Ver Fatura
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-zinc-500 dark:text-zinc-400">
                    Nenhuma fatura encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
