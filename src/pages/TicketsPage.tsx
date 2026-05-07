import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Copy, Bot, LayoutGrid, List as ListIcon, Filter, Clock, CheckCircle, User } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useAppStore } from '@/src/store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";

export function TicketsPage({ onNewTicketClick }: { onNewTicketClick: () => void }) {
  const { tickets, customers, setSelectedTicket, setIsTicketDetailOpen } = useAppStore();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');

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
      <header className="flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-4">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
            <Button variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('kanban')} className="px-3">
              <LayoutGrid size={16} />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="px-3">
              <ListIcon size={16} />
            </Button>
          </div>
          <Button className="gap-2" onClick={onNewTicketClick}>
            <Plus size={18} /> Novo Ticket
          </Button>
        </div>
      </header>

      {/* METRICS PANEL */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs md:text-sm text-zinc-500 font-medium">Tickets em Aberto</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.abertos}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs md:text-sm text-zinc-500 font-medium">TMA (Média)</p>
            <div className="flex items-center gap-2 mt-1">
              <Clock size={16} className="text-blue-500 hidden md:block" />
              <span className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.tma}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs md:text-sm text-zinc-500 font-medium">Resolvidos no Mês</p>
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle size={16} className="text-green-500 hidden md:block" />
              <span className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.resolvidosMes}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-zinc-200/50 dark:border-zinc-800">
          <CardContent className="p-4 flex flex-col justify-center">
            <p className="text-xs md:text-sm text-zinc-500 font-medium">FCR (1º Contato)</p>
            <div className="flex items-center gap-2 mt-1">
              <Bot size={16} className="text-purple-500 hidden md:block" />
              <span className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-50">{metrics.fcr}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap items-center gap-2 md:gap-4 bg-white dark:bg-zinc-900 p-2 md:px-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800 shadow-sm shrink-0">
        <Filter size={16} className="text-zinc-400 hidden md:block" />
        <span className="text-sm font-medium text-zinc-500 hidden md:inline">Filtros:</span>
        
        <select 
          className="w-[140px] md:w-[180px] h-8 text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 rounded outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 px-2"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">Todos Status</option>
          <option value="open">Abertos</option>
          <option value="in-progress">Em Atendimento</option>
          <option value="escalated">Escalados</option>
          <option value="resolved">Resolvidos</option>
        </select>

        <select 
          className="w-[140px] md:w-[180px] h-8 text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 rounded outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 px-2"
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="all">Todas Prioridades</option>
          <option value="low">Baixa</option>
          <option value="medium">Normal</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>

        <select 
          className="w-[140px] md:w-[180px] h-8 text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 rounded outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 px-2"
          value={filterCustomer}
          onChange={(e) => setFilterCustomer(e.target.value)}
        >
          <option value="all">Todos Clientes</option>
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
            <TicketColumn title="Escalados (N3)" status="escalated" tickets={filteredTickets.filter(t => t.status === 'escalated')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
            <TicketColumn title="Resolvidos" status="resolved" tickets={filteredTickets.filter(t => t.status === 'resolved').slice(0, 50)} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden min-h-0">
          <ScrollArea className="h-[calc(100vh-320px)] border rounded-xl bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-zinc-800 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 sticky top-0 z-10 w-full">
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map(t => {
                  const customer = customers.find(c => c.id === t.customerId);
                  return (
                    <TableRow key={t.id} onClick={() => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800">
                      <TableCell className="font-mono text-xs text-zinc-500">#{t.id.slice(0, 6)}</TableCell>
                      <TableCell className="font-medium max-w-xs truncate">{t.subject}</TableCell>
                      <TableCell>{customer?.name || 'Desconhecido'}</TableCell>
                      <TableCell>
                        <Badge variant={t.priority === 'urgent' || t.priority === 'high' ? 'destructive' : 'outline'} className="text-[10px]">
                          {t.priority?.toUpperCase() || 'NORMAL'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {t.status?.toUpperCase() || 'OPEN'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-zinc-500">{t.category || 'Geral'}</span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Recente'}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredTickets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-zinc-500">Nenhum ticket encontrado com os filtros atuais.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}
    </motion.div>
  );
}

function TicketColumn({ title, status, tickets, customers, onTicketClick }: any) {
  const visibleTickets = tickets.slice(0, 20); // limiting initial paint

  return (
    <div className="flex flex-col w-full md:w-80 md:min-w-[320px] bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 p-3 md:h-full min-h-[min-content]">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-bold text-sm text-zinc-700 dark:text-zinc-300">{title}</h3>
        <Badge variant="secondary" className="bg-white dark:bg-zinc-800">{tickets.length}</Badge>
      </div>
      <ScrollArea className="flex-1 pr-2 -mr-2">
        <div className="space-y-3 pb-4">
          {visibleTickets.map((t: any) => {
            const customer = customers?.find((c: any) => c.id === t.customerId);
            return (
              <Card 
                key={t.id} 
                className="border-none shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] transition-all duration-300 cursor-pointer group relative bg-white dark:bg-[#16171a] rounded-[16px] overflow-hidden ticket-shape"
                onClick={() => onTicketClick(t)}
              >
                <div className="absolute top-0 bottom-0 left-8 border-l border-dashed border-zinc-200 dark:border-white/5" />
                <CardContent className="p-0 flex flex-row relative z-10">
                  {/* Left part of ticket: Status/Priority Color Strip */}
                  <div className="w-8 shrink-0 flex flex-col items-center justify-center p-2">
                     <span className={`w-2 h-16 rounded-full ${
                        t.priority === 'urgent' || t.priority === 'high' ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]' : 
                        t.priority === 'low' ? 'bg-zinc-300 dark:bg-zinc-700' : 
                        'bg-amber-500'
                     }`} />
                  </div>
                  
                  <div className="flex-1 p-4 py-5 flex flex-col min-w-0 pr-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex gap-2 items-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300">
                          {t.priority?.toUpperCase() || 'NORMAL'}
                        </span>
                        {t.category && (
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                            • {t.category}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-50 dark:bg-white/5 px-2 py-1 flex items-center justify-center rounded">#{t.id?.slice(0, 5)}</span>
                    </div>
                    
                    <h4 className="font-bold tracking-tight text-[15px] mb-2 text-zinc-900 dark:text-zinc-100 leading-snug">{t.subject}</h4>
                    
                    <div className="flex items-center gap-2 mb-4 bg-zinc-50 dark:bg-[#111214] p-2 rounded-lg">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">{customer ? customer.name.charAt(0) : 'A'}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 line-clamp-1">{customer ? customer.name : 'Anônimo'}</span>
                    </div>
                    
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-dashed border-zinc-200 dark:border-white/10">
                      <div className="flex -space-x-1.5 opacity-80">
                        {t.aiHandled && (
                          <Avatar className="h-6 w-6 border-2 border-white dark:border-[#16171a]">
                            <AvatarFallback className="text-[8px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"><Bot size={12} /></AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 flex items-center gap-1 uppercase tracking-wider">
                        <Clock size={12} /> {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Hoje'}
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
