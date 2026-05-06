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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tickets & Suporte</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Atendimento ao cliente e resolução de problemas estruturado.</p>
        </div>
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
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max h-[calc(100vh-320px)]">
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
    <div className="flex flex-col w-80 min-w-[320px] bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 p-3 h-full">
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
                className="border-zinc-200/60 dark:border-zinc-800 shadow-sm hover:border-primary/50 transition-colors cursor-pointer group relative dark:bg-zinc-900"
                onClick={() => onTicketClick(t)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-2">
                      <Badge variant={t.priority === 'high' || t.priority === 'urgent' ? 'destructive' : t.priority === 'low' ? 'outline' : 'secondary'} className="text-[10px]">
                        {t.priority?.toUpperCase() || 'NORMAL'}
                      </Badge>
                      {t.category && (
                        <Badge variant="outline" className="text-[10px] text-zinc-500 border-zinc-200 dark:border-zinc-700">
                          {t.category}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 max-w-[80px] overflow-hidden whitespace-nowrap text-ellipsis" title={t.id}>#{t.id?.slice(0, 6)}</span>
                  </div>
                  <h4 className="font-medium text-sm mb-1 dark:text-zinc-50">{t.subject}</h4>
                  
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 truncate flex items-center gap-1">
                    <User size={12}/> {customer ? customer.name : 'Cliente Anônimo'}
                  </p>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex -space-x-2">
                      <Avatar className="h-6 w-6 border-2 border-white dark:border-zinc-900">
                        <AvatarFallback className="text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 text-xs">C</AvatarFallback>
                      </Avatar>
                      {t.aiHandled && (
                        <Avatar className="h-6 w-6 border-2 border-white dark:border-zinc-900">
                          <AvatarFallback className="text-[8px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"><Bot size={10} /></AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                      <Clock size={10}/> {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Recent'}
                    </span>
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
