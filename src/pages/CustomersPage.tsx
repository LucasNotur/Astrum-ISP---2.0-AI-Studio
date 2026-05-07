
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
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { 
  Users, Plus, Search, Filter, MoreVertical, Edit2, ShieldAlert, Zap, X, MapPin, Phone, Mail, Building, Bell, Copy, CheckCircle2, Eye, Upload, Download
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/src/components/ui/dropdown-menu";
import { toast } from "sonner";
import { createCustomer, updateCustomer as updateCustomerDb } from '@/src/lib/db';
import { cn } from "@/src/lib/utils";

export function CustomersPage() {
  const { customers, setCustomers, tickets, invoices, auditLogs, currentUserRole, setSelectedCustomerDetails, setIsDetailsDialogOpen, setConfirmDialog } = useAppStore();
  const isOwner = currentUserRole === 'owner' || currentUserRole === 'admin';

  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('all');
  const [customerPlanFilter, setCustomerPlanFilter] = useState('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  
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
      
      const matchesStatus = customerStatusFilter === 'all' || c.status === customerStatusFilter;
      
      const matchesPlan = customerPlanFilter === 'all' || 
        (customerPlanFilter === 'Premium' && c.plan === 'Premium') ||
        (customerPlanFilter === 'Fibra' && c.plan?.includes('Fibra')) ||
        (customerPlanFilter === 'Radio' && c.plan?.includes('Rádio'));
        
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [customers, customerSearch, customerStatusFilter, customerPlanFilter]);

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
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" accept=".csv" className="hidden" ref={customerFileInputRef} onChange={handleImportCustomers} />
                  <TooltipProvider delayDuration={0}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" className="gap-2" onClick={() => customerFileInputRef.current?.click()}>
                          <Upload size={18} /> <span className="hidden md:inline">Importar CSV</span>
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
                        <Button variant="outline" className="gap-2" onClick={exportCustomersToCSV}>
                          <Download size={18} /> <span className="hidden md:inline">Exportar CSV</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Baixar planilha de clientes
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                  {isOwner && (
                    <Button className="gap-2" onClick={() => {
                      setNewCustomer({ name: '', email: '', plan: '', mrr: 0, status: 'active', tags: [] });
                      setNewTagInput('');
                      setFormErrors({});
                      setIsCreateDialogOpen(true);
                    }}>
                      <Plus size={18} /> Novo Cliente
                    </Button>
                  )}
                </div>
              </header>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                      <div className="relative w-full md:w-72 shrink-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                        <Input 
                          placeholder="Buscar por nome, email, telefone, endereço ou tag..." 
                          className="pl-10" 
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
                            onClick={() => {
                              toast.success(`Notificação enviada para ${selectedCustomers.length} clientes!`);
                              setSelectedCustomers([]);
                            }}
                          >
                            <Bell size={12} /> Notificar
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
                      <select 
                        className="flex h-10 w-full md:w-[140px] items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm ring-offset-white dark:ring-offset-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={customerStatusFilter}
                        onChange={(e) => setCustomerStatusFilter(e.target.value)}
                      >
                        <option value="all">Todos os Status</option>
                        <option value="active">Ativos</option>
                        <option value="inactive">Inativos</option>
                      </select>
                      <select 
                        className="flex h-10 w-full md:w-[160px] items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm ring-offset-white dark:ring-offset-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <input 
                            type="checkbox" 
                            className="rounded border-zinc-300"
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
                        <TableHead>Nome</TableHead>
                        <TableHead>Saúde</TableHead>
                        <TableHead>Risco Churn</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>MRR</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.length > 0 ? filteredCustomers.map(c => {
                        const customerTickets = tickets.filter(t => t.customerId === c.id);
                        const openTicketsCount = customerTickets.filter(t => t.status !== 'resolved').length;
                        const overdueInvoicesCount = invoices.filter(i => i.customerId === c.id && i.status === 'overdue').length;
                        const negativeAICount = auditLogs.filter(l => l.sentiment === 'NEGATIVO' && customerTickets.some(t => t.id === l.ticketId)).length;
                        
                        const riskScore = c.riskScore || 0; // Existing global risk logic if available
                        
                        let healthColor = "bg-emerald-500";
                        let healthLabel = "Saudável";
                        
                        if (overdueInvoicesCount > 0 || openTicketsCount > 2 || negativeAICount > 1) {
                          healthColor = "bg-rose-500";
                          healthLabel = "Crítico";
                        } else if (openTicketsCount > 0 || negativeAICount > 0) {
                          healthColor = "bg-amber-500";
                          healthLabel = "Atenção";
                        }

                        return (
                          <TableRow 
                            key={c.id} 
                            className={cn("group cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50", selectedCustomers.includes(c.id) && "bg-primary/5")}
                            onClick={() => handleViewDetails(c)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="rounded border-zinc-300"
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
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  {c.name}
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(c.email);
                                      toast.success("E-mail copiado!");
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50"
                                    title="Copiar E-mail"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                                {c.tags && c.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {c.tags.map((tag: string, idx: number) => (
                                      <div key={idx}>
                                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800">
                                          {tag}
                                        </Badge>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <UITooltip>
                                  <TooltipTrigger>
                                    <div className="flex items-center gap-2">
                                      <div className={cn("h-2.5 w-2.5 rounded-full animate-pulse", healthColor)} />
                                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">{healthLabel}</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="bg-zinc-900 border-zinc-800 text-zinc-100 p-3 shadow-lg max-w-[200px]">
                                    <div className="space-y-1.5">
                                      <p className="text-xs font-semibold mb-2">Composição da Saúde</p>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-zinc-400">Tickets Abertos:</span>
                                        <span className={openTicketsCount > 0 ? "text-amber-400 font-medium" : "text-emerald-400"}>{openTicketsCount}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-zinc-400">Faturas Vencidas:</span>
                                        <span className={overdueInvoicesCount > 0 ? "text-rose-400 font-medium" : "text-emerald-400"}>{overdueInvoicesCount}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-zinc-400">Interações Negativas IA:</span>
                                        <span className={negativeAICount > 0 ? "text-rose-400 font-medium" : "text-emerald-400"}>{negativeAICount}</span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </UITooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const riskLevel = riskScore > 70 ? 'Crítico' : riskScore > 30 ? 'Médio' : 'Baixo';
                                const riskColor = riskScore > 70 ? 'text-red-600 bg-red-50' : riskScore > 30 ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
                                return (
                                  <Badge variant="outline" className={cn("text-[10px] border-none", riskColor)}>
                                    {riskLevel} ({Math.min(riskScore, 100)}%)
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>{c.plan}</TableCell>
                            <TableCell>R$ {c.mrr?.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className={c.status === 'active' ? 'bg-green-500 hover:bg-green-600 flex items-center gap-1 w-fit' : 'bg-red-500 hover:bg-red-600 flex items-center gap-1 w-fit'}>
                                {c.status === 'active' ? (
                                  <>
                                    <CheckCircle2 size={12} />
                                    Ativo
                                  </>
                                ) : (
                                  <>
                                    <X size={12} />
                                    Inativo
                                  </>
                                )}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isOwner && (
                                  <Button variant="ghost" size="sm" className="h-8 px-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50" onClick={() => handleEditCustomer(c)}>
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
                          <TableCell colSpan={6} className="text-center py-10 text-zinc-500">
                            {customers.length === 0 ? "Nenhum cliente cadastrado." : "Nenhum cliente encontrado com os filtros atuais."}
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
                <DialogFooter>
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
    </>
  );
}
