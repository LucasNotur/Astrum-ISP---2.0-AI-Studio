import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Copy, Bot } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useAppStore } from '@/src/store/useAppStore';
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { toast } from "sonner";

export function TicketsPage({ onNewTicketClick }: { onNewTicketClick: () => void }) {
  const { tickets, customers, setSelectedTicket, setIsTicketDetailOpen } = useAppStore();

  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-6"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM & Tickets</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerenciamento de suporte e tarefas.</p>
        </div>
        <Button className="gap-2" onClick={onNewTicketClick}>
          <Plus size={18} /> Novo Ticket
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TicketColumn title="Abertos" status="open" tickets={tickets.filter(t => t.status === 'open')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
        <TicketColumn title="Em Atendimento" status="in-progress" tickets={tickets.filter(t => t.status === 'in-progress')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
        <TicketColumn title="Escalados" status="escalated" tickets={tickets.filter(t => t.status === 'escalated')} customers={customers} onTicketClick={(t: any) => { setSelectedTicket(t); setIsTicketDetailOpen(true); }} />
      </div>
    </motion.div>
  );
}

function TicketColumn({ title, status, tickets, customers, onTicketClick }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</h3>
        <Badge variant="secondary">{tickets.length}</Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-250px)]">
        <div className="space-y-3 pr-4">
          {tickets.map((t: any) => {
            const customer = customers?.find((c: any) => c.id === t.customerId);
            return (
              <Card 
                key={t.id} 
                className="border-none shadow-sm hover:ring-1 ring-zinc-200 dark:ring-zinc-800 transition-all cursor-pointer group relative dark:bg-zinc-900"
                onClick={() => onTicketClick(t)}
              >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm p-1 rounded-md shadow-sm">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(t.id);
                      toast.success("ID copiado!");
                    }}
                    className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    title="Copiar ID"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={t.priority === 'high' || t.priority === 'urgent' ? 'destructive' : 'outline'} className="text-[10px]">
                      {t.priority.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-zinc-400">#{t.id?.slice(0, 6)}</span>
                  </div>
                  <h4 className="font-medium text-sm mb-1 dark:text-zinc-50">{t.subject}</h4>
                  
                  <TooltipProvider>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 cursor-help w-fit">Cliente: {customer ? customer.name : t.customerId}</p>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-white dark:bg-zinc-900 p-3 shadow-lg border border-zinc-100 dark:border-zinc-800 rounded-xl">
                        {customer ? (
                          <div className="space-y-1.5">
                            <p className="font-bold text-sm text-zinc-900 dark:text-zinc-50">{customer.name}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <span className="text-zinc-500 dark:text-zinc-400">Plano:</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-50">{customer.plan}</span>
                              <span className="text-zinc-500 dark:text-zinc-400">MRR:</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-50">R$ {customer.mrr}</span>
                              <span className="text-zinc-500 dark:text-zinc-400">Status:</span>
                              <Badge variant="outline" className="text-[9px] w-fit">{customer.status}</Badge>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">Detalhes não encontrados</p>
                        )}
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>

                  <div className="flex items-center justify-between">
                    <div className="flex -space-x-2">
                      <Avatar className="h-6 w-6 border-2 border-white dark:border-zinc-900">
                        <AvatarFallback className="text-[8px] bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50">C</AvatarFallback>
                      </Avatar>
                      {t.aiHandled && (
                        <Avatar className="h-6 w-6 border-2 border-white dark:border-zinc-900">
                          <AvatarFallback className="text-[8px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"><Bot size={10} /></AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : 'Recent'}
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
