
import React, { useState, useMemo, useRef } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Card, CardContent, CardHeader } from "@/src/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/src/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import {
  Users, Plus, Search, Filter, MoreVertical, Edit2, ShieldAlert, Zap, X, MapPin, Phone, Mail, Building, Bell, Copy, CheckCircle2, Eye, Upload, Download, Clock, TrendingDown, MessageSquare, ChevronsUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/src/components/ui/dropdown-menu";
import { toast } from "sonner";
import { createCustomer, updateCustomer as updateCustomerDb } from '@/src/lib/db';
import { cn } from "@/src/lib/utils";

export function CustomersPage() {
  const { customers, setCustomers, tickets, invoices, auditLogs, currentUserRole, setSelectedCustomerDetails, setIsDetailsDialogOpen, setConfirmDialog, integrationKeys, companySettings, user } = useAppStore();
  const isOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  const tenantId = companySettings?.tenant_id || user?.tenantId || 'default';

  const connections = useMemo(() => {
    if (integrationKeys?.whatsappInstances) {
       try { return JSON.parse(integrationKeys.whatsappInstances); } catch(e) { return []; }
    }
    return [];
  }, [integrationKeys]);

  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [customerPlanFilter, setCustomerPlanFilter] = useState('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedTagsFilter, setSelectedTagsFilter] = useState<string[]>([]);
  const [churnFilter, setChurnFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    customers.forEach(c => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [customers]);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setCustomerSearch(customerSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearchInput]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [newCustomer, setNewCustomer] = useState<any>({ name: '', email: '', phone: '', document: '', address: '', plan: '', mrr: 0, status: 'active', tags: [], pppoeLogin: '', pppoePassword: '', latitude: '', longitude: '' });
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
  
  const [newTagInput, setNewTagInput] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [isNotificarOpen, setIsNotificarOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [selectedConn, setSelectedConn] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  React.useEffect(() => {
    if (isNotificarOpen && tenantId) {
       fetch(`/api/hsm-templates?tenantId=${tenantId}`)
         .then(res => res.json())
         .then(data => {
            if (Array.isArray(data)) setTemplates(data);
         })
         .catch(e => console.error("Error fetching templates", e));
       
       if (connections.length > 0) {
         setSelectedConn(connections[0].instanceName);
       }
    }
  }, [isNotificarOpen, tenantId, connections]);

  const handleSendHSM = async () => {
    if (!selectedTemplateId || !selectedConn) {
      toast.error('Selecione uma conexão e um template.');
      return;
    }
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    setIsSending(true);
    let successCount = 0;
    
    // We send sequence of messages (simulated or real if Evolution config exists)
    for (const custId of selectedCustomers) {
      const cust = customers.find(c => c.id === custId);
      if (!cust || !cust.phone) continue;
      
      let message = template.body;
      
      // Basic translation: if template has {{1}}, it might be user defined.
      // For now, let's just replace with the vars the user set.
      Object.keys(templateVars).forEach(key => {
         message = message.replace(`{{${key}}}`, templateVars[key]);
      });
      // also auto context
      message = message.replace('{{nome}}', cust.name);

      if (template.header_type === 'text' && template.header_content) {
         message = `*${template.header_content}*\n\n${message}`;
      }
      if (template.footer) {
         message = `${message}\n\n_${template.footer}_`;
      }

      try {
        const res = await fetch('/api/evolution/proxy', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             path: `/message/sendText/${selectedConn}`,
             method: 'POST',
             evolutionUrl: integrationKeys.evolutionUrl,
             evolutionApiKey: integrationKeys.evolutionApiKey,
             proxyBody: {
               number: cust.phone.replace(/\\D/g, ''),
               options: { delay: 1200 },
               textMessage: { text: message }
             }
           })
        });
        if (res.ok) successCount++;
      } catch (e) {}
    }
    
    setIsSending(false);
    setIsNotificarOpen(false);
    setSelectedCustomers([]);
    toast.success(`Notificação enviada para ${successCount} de ${selectedCustomers.length} clientes!`);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const searchTerms = customerSearch.toLowerCase().split(' ').filter(term => term.length > 0);
      
      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => 
        c.name?.toLowerCase().includes(term) || 
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.address?.toLowerCase().includes(term) ||
        c.tags?.some((t: string) => t.toLowerCase().includes(term))
      );
      
      const matchesStatus = customerStatusFilter === 'all' || 
        c.status === customerStatusFilter || 
        (customerStatusFilter === 'lead' && c.status === 'pending');
      
      const matchesPlan = customerPlanFilter === 'all' || 
        (customerPlanFilter === 'Premium' && c.plan === 'Premium') ||
        (customerPlanFilter === 'Fibra' && c.plan?.includes('Fibra')) ||
        (customerPlanFilter === 'Radio' && c.plan?.includes('Rádio'));
        
      const matchesTags = selectedTagsFilter.length === 0 || selectedTagsFilter.some(tag => c.tags?.includes(tag));

      const rs = c.riskScore ?? 0;
      const matchesChurn = churnFilter === 'all'
        || (churnFilter === 'high'   && rs > 70)
        || (churnFilter === 'medium' && rs > 30 && rs <= 70)
        || (churnFilter === 'low'    && rs <= 30);

      return matchesSearch && matchesStatus && matchesPlan && matchesTags && matchesChurn;
    });
  }, [customers, customerSearch, customerStatusFilter, customerPlanFilter, selectedTagsFilter, churnFilter]);

  // D-008 — ordenação por coluna
  const [sortKey, setSortKey] = useState<'name' | 'mrr' | 'risk' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (key: 'name' | 'mrr' | 'risk') => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else setSortKey(null);
  };
  const sortedCustomers = useMemo(() => {
    if (!sortKey) return filteredCustomers;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredCustomers].sort((a, b) => {
      if (sortKey === 'name') return dir * (a.name || '').localeCompare(b.name || '', 'pt-BR');
      if (sortKey === 'mrr') return dir * ((a.mrr ?? 0) - (b.mrr ?? 0));
      return dir * ((a.riskScore ?? 0) - (b.riskScore ?? 0));
    });
  }, [filteredCustomers, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: 'name' | 'mrr' | 'risk' }) =>
    sortKey !== col ? <ChevronsUpDown size={12} className="opacity-50" />
    : sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!newCustomer.name) errors.name = 'Nome é obrigatório';
    if (!newCustomer.email) {
      errors.email = 'Email é obrigatório';
    } else if (!emailRegex.test(newCustomer.email)) {
      errors.email = 'Formato de email inválido';
    }
    if (!newCustomer.plan) errors.plan = 'Plano é obrigatório';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      const id = await createCustomer(newCustomer);
      toast.success('Cliente criado com sucesso!');
      setIsCreateDialogOpen(false);
      setNewCustomer({ name: '', email: '', phone: '', address: '', plan: '', mrr: 0, status: 'active', tags: [] });
      setFormErrors({});
      // Refresh
      // removed local update
      setCustomers([...customers, newCustomer /* simplified for now as Firebase onSnapshot syncs AppStore normally */]);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar cliente.');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    
    const errors: Record<string, string> = {};
    if (!editingCustomer.name) errors.name = 'Nome é obrigatório';
    if (!editingCustomer.email) {
      errors.email = 'Email é obrigatório';
    } else if (!emailRegex.test(editingCustomer.email)) {
      errors.email = 'Formato de email inválido';
    }
    if (!editingCustomer.plan) errors.plan = 'Plano é obrigatório';
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsUpdatingCustomer(true);
    try {
      await updateCustomerDb(editingCustomer.id, editingCustomer);
      toast.success('Cliente atualizado com sucesso!');
      setIsEditDialogOpen(false);
      // removed local update
      setCustomers([...customers.filter((c:any) => c.id !== editingCustomer.id), editingCustomer]);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar cliente.');
    } finally {
      setIsUpdatingCustomer(false);
    }
  };


  const handleEditCustomer = (customer: any) => {
    setEditingCustomer({ ...customer });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (customer: any) => {
    setSelectedCustomerDetails(customer);
    setIsDetailsDialogOpen(true);
  };

  const exportCustomersToCSV = () => {
    if (customers.length === 0) return;

    const headers = ['ID', 'Nome', 'Email', 'Plano', 'MRR', 'Status'];
    const csvRows = [headers.join(',')];

    customers.forEach(c => {
      const row = [
        c.id,
        `"${c.name || ''}"`,
        `"${c.email || ''}"`,
        `"${c.plan || ''}"`,
        c.mrr || 0,
        c.status || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `clientes_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const customerFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCustomers = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      if (lines.length < 2) {
        toast.error("O arquivo CSV está vazio ou inválido.");
        return;
      }
      toast.info("Importando clientes...");
    };
    reader.readAsText(file);
    if (customerFileInputRef.current) customerFileInputRef.current.value = '';
  };


  return (
    <>
      <motion.div 
              key="customers"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              {/* D-008 — hero da seção: eyebrow + título display + ações */}
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users size={13} strokeWidth={1.75} />
                    Base de clientes · <span className="font-mono text-foreground">{customers.length}</span> cadastrados
                  </div>
                  <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
                    Clientes
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <input type="file" accept=".csv" className="hidden" ref={customerFileInputRef} onChange={handleImportCustomers} />
                  <TooltipProvider delayDuration={0}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2" onClick={() => customerFileInputRef.current?.click()}>
                          <Upload size={15} strokeWidth={1.75} /> <span className="hidden md:inline">Importar CSV</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Formato: Nome, Email, Tel, End, Plano, MRR, Status
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>

                  <TooltipProvider delayDuration={0}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportCustomersToCSV}>
                          <Download size={15} strokeWidth={1.75} /> <span className="hidden md:inline">Exportar CSV</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Baixar planilha de clientes
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                  {isOwner && (
                    <Button size="sm" className="gap-2" onClick={() => {
                      setNewCustomer({ name: '', email: '', plan: '', mrr: 0, status: 'active', tags: [] });
                      setNewTagInput('');
                      setFormErrors({});
                      setIsCreateDialogOpen(true);
                    }}>
                      <Plus size={15} strokeWidth={1.75} /> Novo Cliente
                    </Button>
                  )}
                </div>
              </header>

              {/* IA-38 — Distribuição de Risco de Churn */}
              {(() => {
                const high   = customers.filter(c => (c.riskScore ?? 0) > 70).length;
                const medium = customers.filter(c => (c.riskScore ?? 0) > 30 && (c.riskScore ?? 0) <= 70).length;
                const low    = customers.filter(c => (c.riskScore ?? 0) <= 30).length;
                const hasData = customers.some(c => (c.riskScore ?? 0) > 0);
                return (
                  <div className="flex flex-col sm:flex-row gap-3">
                    {[
                      { label: 'Alto Risco', count: high,   key: 'high'   as const, color: 'border-l-astrum-red',   active: 'ring-1 ring-astrum-red/40 bg-astrum-red/10' },
                      { label: 'Risco Médio', count: medium, key: 'medium' as const, color: 'border-l-astrum-amber', active: 'ring-1 ring-astrum-amber/40 bg-astrum-amber/10' },
                      { label: 'Baixo Risco', count: low,    key: 'low'    as const, color: 'border-l-astrum-signal', active: 'ring-1 ring-astrum-signal/40 bg-astrum-signal/10' },
                    ].map(({ label, count, key, color, active }) => (
                      <button
                        key={key}
                        onClick={() => setChurnFilter(churnFilter === key ? 'all' : key)}
                        className={cn(
                          'flex-1 text-left rounded-stable-xl border border-border border-l-4 px-4 py-3.5 transition-colors duration-fast shadow-1',
                          color,
                          churnFilter === key ? active : 'bg-card hover:bg-foreground/[0.03]'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground font-medium">{label}</p>
                          <TrendingDown size={13} strokeWidth={1.75} className="text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-semibold font-mono tabular-nums mt-1">{count}</p>
                        {!hasData && <p className="text-[10px] text-muted-foreground mt-1">IA-38 pendente</p>}
                      </button>
                    ))}

                    {/* IA-28 — hint de comunicação em massa */}
                    <button
                      onClick={() => {
                        if (filteredCustomers.length > 0) {
                          setSelectedCustomers(filteredCustomers.map(c => c.id));
                          setIsNotificarOpen(true);
                        }
                      }}
                      className="flex-1 text-left rounded-stable-xl border border-border border-l-4 border-l-astrum-fiber px-4 py-3.5 bg-card hover:bg-foreground/[0.03] transition-colors duration-fast shadow-1"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground font-medium">Campanha de Comunicação</p>
                        <MessageSquare size={13} strokeWidth={1.75} className="text-astrum-fiber" />
                      </div>
                      <p className="text-2xl font-semibold font-mono tabular-nums mt-1 text-astrum-fiber">{filteredCustomers.length}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">clientes visíveis · IA-28</p>
                    </button>
                  </div>
                );
              })()}

              <Card className="rounded-stable-xl border border-border bg-card shadow-1">
                <CardHeader>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                      <div className="relative w-full md:w-72 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} strokeWidth={1.75} />
                        <Input
                          placeholder="Buscar por nome, email, telefone, endereço ou tag..."
                          className="pl-10 h-10 rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
                          value={customerSearchInput}
                          onChange={(e) => setCustomerSearchInput(e.target.value)}
                        />
                      </div>
                      {selectedCustomers.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-2 bg-primary/10 p-1 rounded-lg border border-primary/20 shrink-0"
                        >
                          <span className="text-[10px] font-bold px-2 text-primary whitespace-nowrap">{selectedCustomers.length} selecionados</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] gap-1"
                            onClick={() => setIsNotificarOpen(true)}
                          >
                            <Bell size={12} /> Notificar ({selectedCustomers.length})
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] gap-1 text-red-600 hover:text-red-700"
                            onClick={() => setSelectedCustomers([])}
                          >
                            <X size={12} />
                          </Button>
                        </motion.div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      {allTags.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="h-10 w-full md:w-auto justify-between gap-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 border font-normal px-3">
                              <span className="truncate text-sm">
                                {selectedTagsFilter.length === 0 
                                  ? "Tags" 
                                  : `${selectedTagsFilter.length} tag${selectedTagsFilter.length > 1 ? 's' : ''}`}
                              </span>
                              <Filter size={14} className="text-zinc-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[200px]">
                            <DropdownMenuLabel>Filtrar por Tags</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <div className="max-h-[300px] overflow-y-auto">
                              {allTags.map((tag) => (
                                <DropdownMenuCheckboxItem
                                  key={tag}
                                  checked={selectedTagsFilter.includes(tag)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedTagsFilter([...selectedTagsFilter, tag]);
                                    } else {
                                      setSelectedTagsFilter(selectedTagsFilter.filter((t) => t !== tag));
                                    }
                                  }}
                                >
                                  {tag}
                                </DropdownMenuCheckboxItem>
                              ))}
                            </div>
                            {selectedTagsFilter.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="justify-center text-xs text-red-500 font-medium" 
                                  onSelect={(e) => { e.preventDefault(); setSelectedTagsFilter([]); }}
                                >
                                  Limpar Filtro
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <select
                        className="flex h-10 w-full md:w-[140px] items-center justify-between rounded-stable-lg border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        value={customerStatusFilter}
                        onChange={(e) => setCustomerStatusFilter(e.target.value)}
                      >
                        <option value="all">Todos os Status</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                        <option value="lead">Pendente (Não Cadas.)</option>
                      </select>
                      <select
                        className="flex h-10 w-full md:w-[160px] items-center justify-between rounded-stable-lg border border-border bg-input/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        value={customerPlanFilter}
                        onChange={(e) => setCustomerPlanFilter(e.target.value)}
                      >
                        <option value="all">Todos os Planos</option>
                        <option value="100 Mega">100 Mega</option>
                        <option value="300 Mega">300 Mega</option>
                        <option value="600 Mega">600 Mega</option>
                        <option value="1 Giga">1 Giga</option>
                      </select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      {/* D-008 — header row discreta com colunas ordenáveis */}
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-[40px]">
                          <input
                            type="checkbox"
                            className="rounded border-border accent-foreground"
                            checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCustomers(filteredCustomers.map(c => c.id));
                              } else {
                                setSelectedCustomers([]);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="w-[44px] text-xs text-muted-foreground">Nº</TableHead>
                        <TableHead>
                          <button onClick={() => toggleSort('name')} className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground transition-colors duration-fast">
                            Nome <SortIcon col="name" />
                          </button>
                        </TableHead>
                        <TableHead className="text-xs">Saúde</TableHead>
                        <TableHead>
                          <button onClick={() => toggleSort('risk')} className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground transition-colors duration-fast">
                            Risco Churn <SortIcon col="risk" />
                          </button>
                        </TableHead>
                        <TableHead className="text-xs">Plano</TableHead>
                        <TableHead>
                          <button onClick={() => toggleSort('mrr')} className="flex items-center gap-1.5 text-xs font-medium hover:text-foreground transition-colors duration-fast">
                            MRR <SortIcon col="mrr" />
                          </button>
                        </TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCustomers.length > 0 ? sortedCustomers.map((c, rowIndex) => {
                        const customerTickets = tickets.filter(t => t.customerId === c.id);
                        const openTicketsCount = customerTickets.filter(t => t.status !== 'resolved').length;
                        const overdueInvoicesCount = (c.status === 'lead' || c.status === 'pending') ? 0 : invoices.filter(i => i.customerId === c.id && i.status === 'overdue').length;
                        const negativeAICount = auditLogs.filter(l => l.sentiment === 'NEGATIVO' && customerTickets.some(t => t.id === l.ticketId)).length;
                        
                        const riskScore = c.riskScore || 0; // Existing global risk logic if available
                        
                        let healthColor = "bg-astrum-signal";
                        let healthLabel = "Saudável";

                        if (overdueInvoicesCount > 0 || openTicketsCount > 2 || negativeAICount > 1) {
                          healthColor = "bg-astrum-red";
                          healthLabel = "Crítico";
                        } else if (openTicketsCount > 0 || negativeAICount > 0) {
                          healthColor = "bg-astrum-amber";
                          healthLabel = "Atenção";
                        }

                        return (
                          <TableRow
                            key={c.id}
                            className={cn("group cursor-pointer border-border hover:bg-foreground/[0.03] transition-colors duration-fast", selectedCustomers.includes(c.id) && "bg-foreground/[0.05]")}
                            onClick={() => handleViewDetails(c)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-border accent-foreground"
                                checked={selectedCustomers.includes(c.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedCustomers(prev => [...prev, c.id]);
                                  } else {
                                    setSelectedCustomers(prev => prev.filter(id => id !== c.id));
                                  }
                                }}
                              />
                            </TableCell>
                            {/* D-008 — rank muted */}
                            <TableCell className="font-mono text-xs text-muted-foreground">#{rowIndex + 1}</TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 shrink-0">
                                  <AvatarImage src={c.avatar || c.photoUrl || c.avatarUrl || c.profilePicUrl} />
                                  <AvatarFallback className="text-xs bg-secondary">{c.name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate">{c.name}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(c.email);
                                      toast.success("E-mail copiado!");
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                                    title="Copiar E-mail"
                                  >
                                    <Copy size={13} strokeWidth={1.75} />
                                  </button>
                                </div>
                                {/* D-008 — entidade: nome forte + código/e-mail muted */}
                                {c.email && <span className="text-xs text-muted-foreground truncate">{c.email}</span>}
                                {c.tags && c.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {c.tags.map((tag: string, idx: number) => (
                                      <div key={idx}>
                                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-secondary/50 text-muted-foreground border-border rounded-md">
                                          {tag}
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger>
                                    <div className="flex items-center gap-2">
                                      <div className={cn("h-2.5 w-2.5 rounded-full animate-pulse", healthColor)} />
                                      <span className="text-[11px] font-medium text-muted-foreground">{healthLabel}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="bg-popover border-border text-popover-foreground p-3 shadow-3 max-w-[200px]">
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-semibold mb-2">Composição da Saúde</p>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-muted-foreground">Tickets Abertos:</span>
                                        <span className={cn("font-mono", openTicketsCount > 0 ? "text-astrum-amber font-medium" : "text-astrum-signal")}>{openTicketsCount}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-muted-foreground">Faturas Vencidas:</span>
                                        <span className={cn("font-mono", overdueInvoicesCount > 0 ? "text-astrum-red font-medium" : "text-astrum-signal")}>{overdueInvoicesCount}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-muted-foreground">Interações Negativas IA:</span>
                                        <span className={cn("font-mono", negativeAICount > 0 ? "text-astrum-red font-medium" : "text-astrum-signal")}>{negativeAICount}</span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>
                              {/* D-008 — delta/risco em chip translúcido */}
                              {(() => {
                                const riskLevel = riskScore > 70 ? 'Crítico' : riskScore > 30 ? 'Médio' : 'Baixo';
                                const riskColor = riskScore > 70
                                  ? 'text-astrum-red bg-astrum-red/15'
                                  : riskScore > 30
                                  ? 'text-astrum-amber bg-astrum-amber/15'
                                  : 'text-astrum-signal bg-astrum-signal/15';
                                return (
                                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", riskColor)}>
                                    {riskLevel} · <span className="font-mono ml-0.5">{Math.min(riskScore, 100)}%</span>
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.plan}</TableCell>
                            <TableCell className="font-mono tabular-nums text-sm">R$ {c.mrr?.toFixed(2)}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium w-fit",
                                c.status === 'active'
                                  ? 'bg-astrum-signal/15 text-astrum-signal'
                                  : (c.status === 'lead' || c.status === 'pending')
                                  ? 'bg-astrum-amber/15 text-astrum-amber'
                                  : 'bg-astrum-slate/20 text-astrum-slate'
                              )}>
                                {c.status === 'active' ? (
                                  <>
                                    <CheckCircle2 size={11} strokeWidth={2} />
                                    Ativo
                                  </>
                                ) : (c.status === 'lead' || c.status === 'pending') ? (
                                  <>
                                    <Clock size={11} strokeWidth={2} />
                                    Pendente
                                  </>
                                ) : (
                                  <>
                                    <X size={11} strokeWidth={2} />
                                    Inativo
                                  </>
                                )}
                              </span>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isOwner && (
                                  <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground" onClick={() => handleEditCustomer(c)}>
                                    <Edit2 size={14} className="mr-1" /> Editar
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-primary hover:text-primary" onClick={() => handleViewDetails(c)}>
                                  <Eye size={14} className="mr-1" /> Detalhes
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            <div className="flex flex-col items-center gap-3">
                              <Users size={20} strokeWidth={1.5} className="opacity-50" />
                              <span className="text-sm">{customers.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado com os filtros atuais."}</span>
                              {customers.length === 0 && isOwner && (
                                <Button size="sm" variant="outline" className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
                                  <Plus size={14} /> Cadastrar primeiro cliente
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Cliente</DialogTitle>
              <DialogDescription>
                Altere as informações do cliente abaixo.
              </DialogDescription>
            </DialogHeader>
            {editingCustomer && (
              <form onSubmit={handleUpdateCustomer} className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Nome</Label>
                  <div className="col-span-3">
                    <Input 
                      id="name" 
                      value={editingCustomer?.name || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      className={formErrors.name ? "border-red-500" : ""}
                    />
                    {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-document" className="text-right">CPF/CNPJ</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-document" 
                      value={editingCustomer.document || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, document: e.target.value })}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-pppoeLogin" className="text-right">PPPoE Login</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-pppoeLogin" 
                      value={editingCustomer.pppoeLogin || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, pppoeLogin: e.target.value })}
                      placeholder="cliente@provedor"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-pppoePassword" className="text-right">Senha PPPoE</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-pppoePassword" 
                      value={editingCustomer.pppoePassword || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, pppoePassword: e.target.value })}
                      placeholder="******"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-latitude" className="text-right">Latitude</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-latitude" 
                      value={editingCustomer.latitude || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, latitude: e.target.value })}
                      placeholder="-23.5505"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-longitude" className="text-right">Longitude</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-longitude" 
                      value={editingCustomer.longitude || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, longitude: e.target.value })}
                      placeholder="-46.6333"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="email" className="text-right">Email</Label>
                  <div className="col-span-3">
                    <Input 
                      id="email" 
                      type="email"
                      value={editingCustomer.email || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                      className={formErrors.email ? "border-red-500" : ""}
                    />
                    {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-phone" className="text-right">Telefone</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-phone" 
                      value={editingCustomer.phone || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-address" className="text-right">Endereço</Label>
                  <div className="col-span-3">
                    <Input 
                      id="edit-address" 
                      value={editingCustomer.address || ''} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                      placeholder="Rua, Número, Bairro, Cidade - UF, CEP"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="plan" className="text-right">Plano</Label>
                  <div className="col-span-3">
                  <select
                    id="plan"
                    value={editingCustomer.plan}
                    onChange={(e) => {
                      const plan = e.target.value;
                      let mrr = editingCustomer.mrr;
                      if (plan === '100 Mega') mrr = 62.99;
                      else if (plan === '300 Mega') mrr = 82.99;
                      else if (plan === '600 Mega') mrr = 99.99;
                      else if (plan === '1 Giga') mrr = 119.99;
                      setEditingCustomer({ ...editingCustomer, plan, mrr });
                    }}
                    className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300 ${formErrors.plan ? "border-red-500" : "border-zinc-200"}`}
                  >
                    <option value="" disabled>Selecione um plano</option>
                    <option value="100 Mega">100 Mega</option>
                    <option value="300 Mega">300 Mega</option>
                    <option value="600 Mega">600 Mega</option>
                    <option value="1 Giga">1 Giga</option>
                  </select>
                    {formErrors.plan && <p className="text-xs text-red-500 mt-1">{formErrors.plan}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="mrr" className="text-right">MRR</Label>
                  <div className="col-span-3">
                    <Input 
                      id="mrr" 
                      type="number"
                      step="0.01"
                      value={editingCustomer.mrr} 
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, mrr: parseFloat(e.target.value) })}
                      className={formErrors.mrr ? "border-red-500" : ""}
                    />
                    {formErrors.mrr && <p className="text-xs text-red-500 mt-1">{formErrors.mrr}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="status" className="text-right">Status</Label>
                  <div className="col-span-3">
                    <select 
                      id="status"
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        formErrors.status ? "border-red-500" : ""
                      )}
                      value={editingCustomer.status}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, status: e.target.value })}
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="pending">Pendente</option>
                    </select>
                    {formErrors.status && <p className="text-xs text-red-500 mt-1">{formErrors.status}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label className="text-right mt-2">Tags</Label>
                  <div className="col-span-3 space-y-2">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Adicionar tag..." 
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newTagInput.trim() && !editingCustomer.tags?.includes(newTagInput.trim())) {
                              setEditingCustomer({
                                ...editingCustomer,
                                tags: [...(editingCustomer.tags || []), newTagInput.trim()]
                              });
                              setNewTagInput('');
                            }
                          }
                        }}
                      />
                      <Button 
                        type="button" 
                        variant="secondary"
                        onClick={() => {
                          if (newTagInput.trim() && !editingCustomer.tags?.includes(newTagInput.trim())) {
                            setEditingCustomer({
                              ...editingCustomer,
                              tags: [...(editingCustomer.tags || []), newTagInput.trim()]
                            });
                            setNewTagInput('');
                          }
                        }}
                      >
                        Adicionar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editingCustomer.tags?.map((tag: string, idx: number) => (
                        <div key={idx}>
                          <Badge variant="secondary" className="flex items-center gap-1 pr-1">
                            {tag}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCustomer({
                                  ...editingCustomer,
                                  tags: editingCustomer.tags.filter((t: string) => t !== tag)
                                });
                              }}
                              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                              <X size={12} />
                            </button>
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex items-center sm:justify-between w-full">
                  {isOwner ? (
                    <Button 
                      type="button" 
                      variant="destructive" 
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: 'Excluir Cliente',
                          message: 'Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.',
                          onConfirm: async () => {
                            try {
                              const { deleteCustomer } = await import('@/src/lib/db');
                              await deleteCustomer(editingCustomer.id);
                              toast.success('Cliente excluído com sucesso!');
                              setIsEditDialogOpen(false);
                            } catch (err) {
                              toast.error('Erro ao excluir cliente.');
                            }
                          }
                        });
                      }}
                    >
                      Excluir
                    </Button>
                  ) : <div />}
                  <Button type="submit" disabled={isUpdatingCustomer}>
                    {isUpdatingCustomer ? 'Salvando...' : 'Salvar Alterações'}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
              <DialogDescription>
                Preencha as informações para cadastrar um novo cliente.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCustomer} className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-name" className="text-right">Nome</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-name" 
                    value={newCustomer.name} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    className={formErrors.name ? "border-red-500" : ""}
                  />
                  {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-document" className="text-right">CPF/CNPJ</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-document" 
                    value={newCustomer.document || ''} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, document: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-pppoeLogin" className="text-right">PPPoE Login</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-pppoeLogin" 
                    value={newCustomer.pppoeLogin || ''} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, pppoeLogin: e.target.value })}
                    placeholder="cliente@provedor"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-pppoePassword" className="text-right">Senha PPPoE</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-pppoePassword" 
                    value={newCustomer.pppoePassword || ''} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, pppoePassword: e.target.value })}
                    placeholder="******"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-latitude" className="text-right">Latitude</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-latitude" 
                    value={newCustomer.latitude || ''} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, latitude: e.target.value })}
                    placeholder="-23.5505"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-longitude" className="text-right">Longitude</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-longitude" 
                    value={newCustomer.longitude || ''} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, longitude: e.target.value })}
                    placeholder="-46.6333"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-email" className="text-right">Email</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-email" 
                    type="email"
                    value={newCustomer.email} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    className={formErrors.email ? "border-red-500" : ""}
                  />
                  {formErrors.email && <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-phone" className="text-right">Telefone</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-phone" 
                    value={newCustomer.phone} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                    placeholder="(11) 99999-9999"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-address" className="text-right">Endereço</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-address" 
                    value={newCustomer.address} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    placeholder="Rua, Número, Bairro, Cidade - UF, CEP"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-plan" className="text-right">Plano</Label>
                <div className="col-span-3">
                  <select
                    id="new-plan"
                    value={newCustomer.plan}
                    onChange={(e) => {
                      const plan = e.target.value;
                      let mrr = 0;
                      if (plan === '100 Mega') mrr = 62.99;
                      else if (plan === '300 Mega') mrr = 82.99;
                      else if (plan === '600 Mega') mrr = 99.99;
                      else if (plan === '1 Giga') mrr = 119.99;
                      setNewCustomer({ ...newCustomer, plan, mrr });
                    }}
                    className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:placeholder:text-zinc-400 dark:focus-visible:ring-zinc-300 ${formErrors.plan ? "border-red-500" : "border-zinc-200"}`}
                  >
                    <option value="" disabled>Selecione um plano</option>
                    <option value="100 Mega">100 Mega</option>
                    <option value="300 Mega">300 Mega</option>
                    <option value="600 Mega">600 Mega</option>
                    <option value="1 Giga">1 Giga</option>
                  </select>
                  {formErrors.plan && <p className="text-xs text-red-500 mt-1">{formErrors.plan}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-mrr" className="text-right">MRR</Label>
                <div className="col-span-3">
                  <Input 
                    id="new-mrr" 
                    type="number"
                    step="0.01"
                    value={newCustomer.mrr} 
                    onChange={(e) => setNewCustomer({ ...newCustomer, mrr: parseFloat(e.target.value) })}
                    className={formErrors.mrr ? "border-red-500" : ""}
                  />
                  {formErrors.mrr && <p className="text-xs text-red-500 mt-1">{formErrors.mrr}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-status" className="text-right">Status</Label>
                <div className="col-span-3">
                  <select 
                    id="new-status"
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      formErrors.status ? "border-red-500" : ""
                    )}
                    value={newCustomer.status}
                    onChange={(e) => setNewCustomer({ ...newCustomer, status: e.target.value })}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                    <option value="pending">Pendente</option>
                  </select>
                  {formErrors.status && <p className="text-xs text-red-500 mt-1">{formErrors.status}</p>}
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right mt-2">Tags</Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Adicionar tag..." 
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newTagInput.trim() && !newCustomer.tags?.includes(newTagInput.trim())) {
                            setNewCustomer({
                              ...newCustomer,
                              tags: [...(newCustomer.tags || []), newTagInput.trim()]
                            });
                            setNewTagInput('');
                          }
                        }
                      }}
                    />
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={() => {
                        if (newTagInput.trim() && !newCustomer.tags?.includes(newTagInput.trim())) {
                          setNewCustomer({
                            ...newCustomer,
                            tags: [...(newCustomer.tags || []), newTagInput.trim()]
                          });
                          setNewTagInput('');
                        }
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {newCustomer.tags?.map((tag: string, idx: number) => (
                      <div key={idx}>
                        <Badge variant="secondary" className="flex items-center gap-1 pr-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => {
                              setNewCustomer({
                                ...newCustomer,
                                tags: newCustomer.tags.filter((t: string) => t !== tag)
                              });
                            }}
                            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 rounded-full p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                          >
                            <X size={12} />
                          </button>
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Cadastrar Cliente</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isNotificarOpen} onOpenChange={setIsNotificarOpen}>
          <DialogContent className="sm:max-w-[500px]">
             <DialogHeader>
               <DialogTitle>Disparo de Notificação (Templates HSM)</DialogTitle>
               <DialogDescription>
                 Envie mensagens padronizadas e aprovadas pela Meta para iniciar ou reengajar conversas com os clientes selecionados.
               </DialogDescription>
             </DialogHeader>

             <div className="space-y-4 py-4">
                 <div className="space-y-2">
                    <Label>Conexão WhatsApp (Origem)</Label>
                    <select 
                       className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                       value={selectedConn}
                       onChange={(e) => setSelectedConn(e.target.value)}
                    >
                       {connections?.map((c: any) => (
                           <option key={c.id} value={c.instanceName}>{c.alias}</option>
                       ))}
                    </select>
                 </div>

                 <div className="space-y-2">
                    <Label>Template de Mensagem</Label>
                    <select 
                       className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                       value={selectedTemplateId}
                       onChange={(e) => {
                          setSelectedTemplateId(e.target.value);
                          setTemplateVars({});
                       }}
                    >
                       <option value="">Selecione um template aprovado</option>
                       {templates?.map((t: any) => (
                           <option key={t.id} value={t.id}>{t.name} (Meta Aprovado)</option>
                       ))}
                    </select>
                 </div>

                 {selectedTemplateId && templates.find(t => t.id === selectedTemplateId) && (() => {
                    const t = templates.find(temp => temp.id === selectedTemplateId);
                    const varMatches = t.body.match(/\{\{(\d+)\}\}/g);
                    const varCount = varMatches ? new Set(varMatches).size : 0;
                    
                    return (
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800 space-y-3">
                         <Label className="text-zinc-500 font-semibold text-xs uppercase">Pré-visualização da Mensagem</Label>
                         <p className="text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                           {(() => {
                              let msg = t.body;
                              Object.keys(templateVars).forEach(k => {
                                msg = msg.replace(`{{${k}}}`, `*[${templateVars[k]}]*`);
                              });
                              return msg;
                           })()}
                         </p>

                         {varCount > 0 && (
                            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                               <Label className="text-xs font-semibold text-zinc-500 uppercase">Variáveis do Template</Label>
                               {Array.from(new Set(varMatches)).map((vMsg: any) => {
                                  const num = vMsg.replace(/\D/g, '');
                                  return (
                                     <div key={num} className="flex flex-col gap-1.5">
                                        <Label className="text-xs text-zinc-600">Variável {vMsg}</Label>
                                        <Input 
                                           placeholder="Valor que o cliente verá"
                                           value={templateVars[num] || ''}
                                           onChange={e => setTemplateVars({...templateVars, [num]: e.target.value})}
                                        />
                                     </div>
                                  );
                               })}
                            </div>
                         )}
                      </div>
                    );
                 })()}

                 <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded text-xs">
                   O disparo será enviado para <strong>{selectedCustomers.length} clientes selecionados</strong>. 
                   Lembre-se que disparos ativos podem ter custo por conversa na sua conta Meta.
                 </div>
             </div>
             
             <DialogFooter>
                <Button variant="outline" onClick={() => setIsNotificarOpen(false)}>Cancelar</Button>
                <Button onClick={handleSendHSM} disabled={isSending}>
                   {isSending ? 'Enviando...' : `Disparar para ${selectedCustomers.length}`}
                </Button>
             </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  );
}
