import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Copy, Bot, LayoutGrid, List as ListIcon, Filter, Clock, CheckCircle, User, Ticket } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { useAppStore } from '@/src/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/src/components/ui/dialog";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { GlowButton } from "@/src/components/ui/glow-button";

import { supabase } from '@/src/lib/supabase';
import { logAudit } from '@/src/lib/db';
import { useTenantDate } from '@/src/hooks/useTenantDate';

export function TicketsPage() {
  const { tickets, customers, setSelectedTicket, setIsTicketDetailOpen, userProfile } = useAppStore();
  const [isNewTicketDialogOpen, setIsNewTicketDialogOpen] = useState(false);
  const { formatDateOnly } = useTenantDate();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');

  const [departments, setDepartments] = useState<any[]>([]);

  // S99 — departamentos via Supabase (coluna department_id nos tickets)
  React.useEffect(() => {
    if (!userProfile?.tenantId) return;
    supabase
      .from('tickets')
      .select('department_id')
      .eq('tenant_id', userProfile.tenantId)
      .not('department_id', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map((r: any) => r.department_id))]
            .map((id) => ({ id, name: id }));
          setDepartments(unique);
        }
      });
  }, [userProfile?.tenantId]);

  const getSLAStatus = (ticket: any) => {
     if (ticket.status === 'resolved') return null;
     if (ticket.sla_breached) return 'red';
     if (!ticket.createdAt) return 'green';
     
     let limitMinutes = 15;
     if (ticket.departmentId) {
        const dept = departments.find(d => d.id === ticket.departmentId);
        if (dept && dept.sla_response_minutes) limitMinutes = dept.sla_response_minutes;
     }

     const created = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt);
     const elapsed = (Date.now() - created.getTime()) / 60000;
     
     if (elapsed > limitMinutes) return 'red';
     if (elapsed > limitMinutes * 0.75) return 'yellow';
     return 'green';
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const customerId = formData.get("customerId") as string;
    const subject = formData.get("subject") as string;
    const priority = formData.get("priority") as string;
    try {
      const { data: docRef, error } = await supabase.from("tickets").insert({
        customer_id: customerId,
        subject,
        priority,
        status: "open",
        ai_enabled: true,
        ai_attempts: 0,
      }).select().single();
      if (error) throw error;
      try { await logAudit("TICKET_CREATED", { ticketId: docRef.id, customerId, subject }); } catch {}
      setIsNewTicketDialogOpen(false);
      toast.success("Ticket criado com sucesso!");
    } catch {
      toast.error("Erro ao criar ticket.");
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchStatus = filterStatus === 'all' || t.status === filterStatus;
      const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
      const matchCustomer = filterCustomer === 'all' || t.customerId === filterCustomer;
      return matchStatus && matchPriority && matchCustomer;
    });
  }, [tickets, filterStatus, filterPriority, filterCustomer]);

  const metrics = useMemo(() => {
    const abertos = tickets.filter(t => t.status !== 'resolved').length;
    const resolvidosMes = tickets.filter(t => t.status === 'resolved').length; // Simplification for MVP
    return { abertos, resolvidosMes, tma: '2h 15m', fcr: '82%' };
  }, [tickets]);

  return (
    <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-6 flex flex-col h-full">
      {/* D-008 — hero da seção: eyebrow + título display + ações */}
      <header className="flex flex-col md:flex-row md:items-end justify-between shrink-0 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Ticket size={13} strokeWidth={1.75} />
            Suporte · <span className="font-mono text-foreground">{metrics.abertos}</span> em aberto
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
            Tickets
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex bg-secondary/60 p-1 rounded-full border border-border">
            <button
              onClick={() => setViewMode('kanban')}
              aria-label="Visão kanban"
              className={`px-3.5 py-1.5 rounded-full transition-colors duration-fast ${viewMode === 'kanban' ? 'bg-primary text-primary-foreground shadow-2' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutGrid size={15} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="Visão em lista"
              className={`px-3.5 py-1.5 rounded-full transition-colors duration-fast ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow-2' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <ListIcon size={15} strokeWidth={1.75} />
            </button>
          </div>
          {/* D-011 — glow CTA: a ação de criação da tela */}
          <GlowButton icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setIsNewTicketDialogOpen(true)}>
            Novo Ticket
          </GlowButton>
        </div>
      </header>

      {/* D-007 — métricas compactas com barra de accent à esquerda */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 shrink-0">
        {[
          { label: 'Tickets em aberto', value: metrics.abertos, icon: Ticket, bar: 'bg-astrum-fiber', tint: 'text-astrum-fiber' },
          { label: 'TMA (média)', value: metrics.tma, icon: Clock, bar: 'bg-astrum-amber', tint: 'text-astrum-amber' },
          { label: 'Resolvidos no mês', value: metrics.resolvidosMes, icon: CheckCircle, bar: 'bg-astrum-signal', tint: 'text-astrum-signal' },
          { label: 'FCR (1º contato)', value: metrics.fcr, icon: Bot, bar: 'bg-astrum-lemon', tint: 'text-astrum-lemon' },
        ].map(({ label, value, icon: Icon, bar, tint }) => (
          <Card key={label} className="relative overflow-hidden rounded-stable-xl border border-border bg-card shadow-1">
            <span aria-hidden className={`absolute left-0 top-4 bottom-4 w-0.5 rounded-full ${bar}`} />
            <CardContent className="p-3 md:p-4 flex flex-col justify-center">
              <p className="text-[10px] md:text-xs text-muted-foreground font-medium">{label}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Icon size={12} strokeWidth={1.75} className={tint} />
                <span className="text-base md:text-2xl font-semibold font-mono tabular-nums leading-none">{value}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FILTERS */}
      <div className="flex items-center gap-1.5 md:gap-2.5 bg-card p-1.5 md:p-2 rounded-stable-lg border border-border shrink-0 overflow-x-auto no-scrollbar">
        <Filter size={14} strokeWidth={1.75} className="text-muted-foreground shrink-0 ml-1" />

        <select
          className="h-8 text-[10px] md:text-xs rounded-stable-sm border border-border bg-input/60 outline-none focus:ring-2 focus:ring-ring px-1.5 md:px-2 shrink-0 font-medium"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">Status</option>
          <option value="open">Abertos</option>
          <option value="in-progress">Em Atendimento</option>
          <option value="escalated">Escalados</option>
          <option value="resolved">Resolvidos</option>
        </select>

        <select
          className="h-8 text-[10px] md:text-xs rounded-stable-sm border border-border bg-input/60 outline-none focus:ring-2 focus:ring-ring px-1.5 md:px-2 shrink-0 font-medium"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="all">Prioridade</option>
          <option value="low">Baixa</option>
          <option value="medium">Normal</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>

        <select
          className="h-8 text-[10px] md:text-xs rounded-stable-sm border border-border bg-input/60 outline-none focus:ring-2 focus:ring-ring px-1.5 md:px-2 shrink-0 font-medium"
          value={filterCustomer}
          onChange={(e) => setFilterCustomer(e.target.value)}
        >
          <option value="all">Cliente</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-x-auto overflow-y-auto md:overflow-y-hidden pb-4">
          <div className="flex flex-col md:flex-row gap-4 md:min-w-max md:h-[calc(100vh-320px)] h-auto">
            <TicketColumn title="Novos" status="open" tickets={filteredTickets.filter(t => t.status === 'open')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
            <TicketColumn title="Em Atendimento" status="in-progress" tickets={filteredTickets.filter(t => t.status === 'in-progress')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
            <TicketColumn title="Em Espera" status="snoozed" tickets={filteredTickets.filter(t => t.status === 'snoozed')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
            <TicketColumn title="Escalados (N3)" status="escalated" tickets={filteredTickets.filter(t => t.status === 'escalated')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
            <TicketColumn title="Resolvidos" status="resolved" tickets={filteredTickets.filter(t => t.status === 'resolved').slice(0, 50)} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden min-h-0">
          {/* D-008 — tabela densa: header discreta, hairlines, entidade com avatar, chips translúcidos */}
          <ScrollArea className="h-[calc(100vh-320px)] border border-border rounded-stable-xl bg-card shadow-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-card border-border sticky top-0 z-10 w-full hover:bg-card">
                  <TableHead className="w-[90px] text-xs">ID</TableHead>
                  <TableHead className="text-xs">Assunto</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Prioridade</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs">Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map(t => {
                  const customer = customers.find(c => c.id === t.customerId);
                  const prio = t.priority || 'medium';
                  const prioChip = prio === 'urgent' || prio === 'high'
                    ? 'bg-astrum-red/15 text-astrum-red'
                    : prio === 'low'
                    ? 'bg-astrum-slate/20 text-astrum-slate'
                    : 'bg-astrum-amber/15 text-astrum-amber';
                  const statusChip: Record<string, string> = {
                    'open': 'bg-astrum-fiber/15 text-astrum-fiber',
                    'in-progress': 'bg-astrum-amber/15 text-astrum-amber',
                    'escalated': 'bg-astrum-red/15 text-astrum-red',
                    'resolved': 'bg-astrum-signal/15 text-astrum-signal',
                    'snoozed': 'bg-astrum-slate/20 text-astrum-slate',
                  };
                  const statusLabel: Record<string, string> = {
                    'open': 'Aberto', 'in-progress': 'Em atendimento', 'escalated': 'Escalado',
                    'resolved': 'Resolvido', 'snoozed': 'Em espera',
                  };
                  return (
                    <TableRow key={t.id} onClick={() => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} className="cursor-pointer border-border hover:bg-foreground/[0.03] transition-colors duration-fast">
                      <TableCell className="font-mono text-xs text-muted-foreground">#{t.id.slice(0, 6)}</TableCell>
                      <TableCell className="font-medium max-w-xs truncate">{t.subject}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={customer?.avatar || customer?.photoUrl || customer?.avatarUrl || customer?.profilePicUrl} />
                            <AvatarFallback className="text-[9px] bg-secondary">{customer ? customer.name.charAt(0) : '?'}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">{customer?.name || 'Desconhecido'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5 items-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${prioChip}`}>
                            {prio === 'urgent' ? 'Urgente' : prio === 'high' ? 'Alta' : prio === 'low' ? 'Baixa' : 'Normal'}
                          </span>
                          {getSLAStatus(t) && (
                            <div className={`w-2 h-2 rounded-full ${getSLAStatus(t) === 'red' ? 'bg-astrum-red' : getSLAStatus(t) === 'yellow' ? 'bg-astrum-amber' : 'bg-astrum-signal'}`} title="SLA Status" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChip[t.status] || 'bg-astrum-slate/20 text-astrum-slate'}`}>
                          {statusLabel[t.status] || t.status || 'Aberto'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{t.category || 'Geral'}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {t.createdAt ? formatDateOnly(new Date(t.createdAt?.toDate ? t.createdAt.toDate() : t.createdAt)) : 'Recente'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredTickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-3">
                        <Ticket size={20} strokeWidth={1.5} className="opacity-50" />
                        <span className="text-sm">Nenhum ticket encontrado com os filtros atuais.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
      <Dialog open={isNewTicketDialogOpen} onOpenChange={setIsNewTicketDialogOpen}>
        <DialogContent className="sm:max-w-[500px] border border-border shadow-4 rounded-stable-xl p-0 overflow-hidden bg-popover">
          <div className="bg-secondary/40 p-6 border-b border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-semibold flex items-center gap-2">
                <Ticket size={22} strokeWidth={1.75} className="text-astrum-lemon" /> Abrir Novo Ticket
              </DialogTitle>
              <DialogDescription>
                Crie um novo chamado de suporte para um cliente.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Cliente</label>
              <select
                name="customerId"
                required
                className="w-full p-2.5 rounded-stable-lg border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione um cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Assunto</label>
              <Input
                name="subject"
                placeholder="Ex: Lentidão na conexão, Troca de roteador..."
                required
                className="rounded-stable-lg bg-input/60 border-border placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Prioridade</label>
              <select
                name="priority"
                className="w-full p-2.5 rounded-stable-lg border border-border bg-input/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setIsNewTicketDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="px-8">
                Criar Ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function TicketColumn({ title, status, tickets, customers, onTicketClick }: any) {
  const visibleTickets = tickets.slice(0, 20); // limiting initial paint
  const { formatDateOnly, formatDateTime } = useTenantDate();

  return (
    <div className="flex flex-col w-full md:w-80 md:min-w-[320px] bg-secondary/30 rounded-stable-xl border border-border p-3 md:h-full min-h-[min-content]">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary" className="bg-card border border-border rounded-md font-mono text-xs">{tickets.length}</Badge>
      </div>
      <ScrollArea className="flex-1 pr-2 -mr-2">
        <div className="space-y-3 pb-4">
          {visibleTickets.map((t: any) => {
            const customer = customers?.find((c: any) => c.id === t.customerId);
            return (
              <Card
                key={t.id}
                className={`border-none shadow-2 hover:scale-[1.02] transition-transform duration-base cursor-pointer group relative bg-card rounded-stable-xl overflow-hidden ticket-shape ${t.status === 'snoozed' ? 'opacity-80 grayscale-[0.3]' : ''}`}
                onClick={() => onTicketClick(t)}
              >
                <div className="absolute top-0 bottom-0 left-8 border-l border-dashed border-foreground/10" />
                <CardContent className="p-0 flex flex-row relative z-10">
                  {/* Left part of ticket: Status/Priority Color Strip */}
                  <div className="w-8 shrink-0 flex flex-col items-center justify-center p-2">
                     <span className={`w-2 h-16 rounded-full ${
                        t.priority === 'urgent' || t.priority === 'high' ? 'bg-astrum-red shadow-[0_0_12px] shadow-astrum-red/50' :
                        t.priority === 'low' ? 'bg-astrum-slate/50' :
                        'bg-astrum-amber'
                     }`} />
                  </div>
                  
                  <div className="flex-1 p-4 py-5 flex flex-col min-w-0 pr-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex gap-2 items-center">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                          t.priority === 'urgent' || t.priority === 'high' ? 'bg-astrum-red/15 text-astrum-red' :
                          t.priority === 'low' ? 'bg-astrum-slate/20 text-astrum-slate' :
                          'bg-astrum-amber/15 text-astrum-amber'
                        }`}>
                          {t.priority === 'urgent' ? 'Urgente' : t.priority === 'high' ? 'Alta' : t.priority === 'low' ? 'Baixa' : 'Normal'}
                        </span>
                        {t.category && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            • {t.category}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground bg-secondary/60 px-2 py-1 flex items-center justify-center rounded-md">#{t.id?.slice(0, 5)}</span>
                    </div>

                    <h4 className="font-semibold tracking-tight text-[15px] mb-2 leading-snug">{t.subject}</h4>

                    <div className="flex items-center gap-2 mb-4 bg-secondary/50 p-2 rounded-stable-sm">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={customer?.avatar || customer?.photoUrl || customer?.avatarUrl || customer?.profilePicUrl} />
                        <AvatarFallback className="text-[9px] bg-secondary">{customer ? customer.name.charAt(0) : 'A'}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium line-clamp-1">{customer ? customer.name : 'Anônimo'}</span>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-dashed border-foreground/10">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {t.aiEnabled !== false ? (
                          <div className="flex items-center gap-1 text-[9px] font-semibold text-astrum-lemon bg-astrum-lemon/10 px-1.5 py-0.5 rounded-full">
                            <Bot size={10} /> IA Ativa
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[9px] font-semibold text-astrum-fiber bg-astrum-fiber/15 px-1.5 py-0.5 rounded-full min-w-0 max-w-full">
                            <User size={10} className="shrink-0" />
                            <span className="truncate">{t.assignedOperatorName || 'Humano'}</span>
                          </div>
                        )}
                      </div>
                      <span className={`text-[9px] font-medium flex items-center gap-1 shrink-0 ml-2 ${t.status === 'snoozed' ? 'text-astrum-amber' : 'text-muted-foreground'}`}>
                        <Clock size={12} /> 
                        {t.status === 'snoozed' && t.snoozed_until ? (
                          t.snoozed_until?.toDate ? formatDateTime(t.snoozed_until.toDate()) : formatDateTime(new Date(t.snoozed_until))
                        ) : (
                          t.createdAt?.toDate ? formatDateOnly(t.createdAt.toDate()) : 'Hoje'
                        )}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
