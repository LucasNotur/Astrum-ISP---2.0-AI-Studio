import React, { useState, useEffect } from 'react';
import { supabase } from "../lib/supabase";
import { ChevronRight, ChevronLeft, User, FileText, Wrench, HardDrive, Edit2, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

export function CustomerHistorySidebar({ customerId, tenantId, onEditCustomer }: { customerId?: string, tenantId?: string, onEditCustomer: (c: any) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  
  const [customer, setCustomer] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [serviceOrders, setServiceOrders] = useState<any[]>([]);
  
  useEffect(() => {
    if (customerId) {
       setIsOpen(true);
    }
  }, [customerId]);
  
  // Realtime updates
  useEffect(() => {
    if (!isOpen || !customerId || !tenantId) {
      if (!customerId || !tenantId) {
        setCustomer(null);
        setTickets([]);
        setServiceOrders([]);
      }
      return;
    }

    // FZ-4: leitura via Supabase (uma carga + realtime no ticket do cliente)
    const load = async () => {
      const [custRes, ticketsRes, osRes] = await Promise.all([
        supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
        supabase.from("tickets").select("*").eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase.from("service_orders").select("*").eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);
      if (custRes.data) setCustomer(custRes.data);
      if (ticketsRes.data) setTickets(ticketsRes.data);
      if (osRes.data) setServiceOrders(osRes.data);
    };
    load();

    const ch = supabase.channel(`customer-history:${customerId}:${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `customer_id=eq.${customerId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders", filter: `customer_id=eq.${customerId}` }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [customerId, tenantId, isOpen]);

  if (!isOpen) {
    return (
      <div className="h-full border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#111214] flex flex-col items-center py-4 w-[60px] shrink-0 transition-all duration-300 relative z-20 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] hidden lg:flex">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <ChevronLeft size={20} />
        </Button>
      </div>
    );
  }

  if (!customerId) {
      return (
         <div className="w-[340px] xl:w-[400px] h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111214] shrink-0 transition-all duration-300 flex-col items-center justify-center text-zinc-400 hidden lg:flex">
            <Button variant="ghost" size="icon" className="absolute top-4 right-4" onClick={() => setIsOpen(false)}>
              <ChevronRight size={20} />
            </Button>
            <User size={48} className="mb-4 opacity-20" />
            <p>Selecione um cliente para ver o histórico.</p>
         </div>
      );
  }

  return (
    <div className="hidden lg:flex flex-col w-[340px] xl:w-[400px] h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111214] shrink-0 transition-all duration-300 relative shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-20">
      <div className="absolute top-4 right-4 z-20">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <ChevronRight size={18} />
        </Button>
      </div>

      <div className="p-6 pb-4 pt-12 flex flex-col items-center border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900/50 dark:to-[#111214] relative overflow-hidden">
         <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-transparent blur-3xl opacity-50 z-0 pointer-events-none"></div>
         <div className="absolute top-4 left-4 z-10">
            {customer && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-black dark:hover:text-white" onClick={() => onEditCustomer(customer)}>
                    <Edit2 size={16} />
                </Button>
            )}
         </div>
        
        <Avatar className="w-20 h-20 shadow-sm border-2 border-white dark:border-zinc-800 mb-3 relative z-10">
          <AvatarImage src={customer?.avatarUrl || customer?.photoUrl} />
          <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 text-2xl font-bold">
            {customer?.name ? customer.name.charAt(0).toUpperCase() : 'C'}
          </AvatarFallback>
        </Avatar>
        <h2 className="text-lg font-bold text-center tracking-tight leading-tight relative z-10">{customer?.name || 'Carregando...'}</h2>
        
        <div className="flex items-center gap-2 mt-2 relative z-10">
           <Badge variant={customer?.status === 'active' ? 'outline' : 'secondary'} className={cn("text-[10px]", customer?.status === 'active' && "text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400")}>
              {customer?.status?.toUpperCase() || 'NORMAL'}
           </Badge>
           {customer?.plan && <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400">{customer.plan}</Badge>}
        </div>
      </div>

      <ScrollArea className="flex-1 relative z-10">
        <div className="p-5 space-y-8">
          
          {/* Informações Cadastrais */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <User size={14} /> Dados Cadastrais
            </h3>
            <div className="bg-zinc-50 dark:bg-white/5 rounded-xl p-4 space-y-3 border border-zinc-100 dark:border-white/10 text-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Telefone Principal</span>
                  <span className="font-mono flex items-center gap-2 mt-1">{customer?.phone || '-'}</span>
                </div>
                {customer?.email && (
                    <div className="flex flex-col">
                      <span className="text-[10px] text-zinc-500 uppercase font-semibold">E-mail</span>
                      <span className="truncate mt-1">{customer.email}</span>
                    </div>
                )}
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold">Documento / CPF</span>
                  <span className="font-mono flex items-center gap-2 mt-1">{customer?.document || customer?.cpf || '-'}</span>
                </div>
            </div>
          </div>
          
          {/* Hardware Registrado */}
          {customer?.hardware && customer.hardware.length > 0 && (
             <div className="space-y-3">
               <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                 <HardDrive size={14} /> Equipamentos Registrados
               </h3>
               <div className="bg-zinc-50 dark:bg-white/5 rounded-xl p-3 border border-zinc-100 dark:border-white/10 text-sm">
                  {customer.hardware.map((hw: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-800 last:border-0 last:pb-0">
                         <div>
                            <p className="font-medium">{hw.model}</p>
                            <p className="text-xs text-zinc-500 font-mono">MAC: {hw.mac}</p>
                         </div>
                         <Badge variant="outline" className="text-[10px]">{hw.status}</Badge>
                      </div>
                  ))}
               </div>
             </div>
          )}

          {/* Histórico de Tickets */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <FileText size={14} /> Últimos Atendimentos
            </h3>
            {tickets.length > 0 ? (
                <div className="space-y-2">
                    {tickets.map(t => (
                        <div key={t.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer">
                            <div className="flex justify-between items-start mb-2">
                               <p className="text-sm font-medium line-clamp-1 pr-2">{t.subject || 'Atendimento'}</p>
                               <span className="text-[10px] font-mono text-zinc-400">#{t.id.slice(0, 5)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <Badge variant="secondary" className="text-[9px] uppercase px-1.5 py-0">
                                   {t.status === 'resolved' ? 'Resolvido' : t.status === 'open' ? 'Aberto' : t.status === 'escalated' ? 'Escalado' : t.status}
                                </Badge>
                                <span className="text-xs text-zinc-500">
                                   {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('pt-BR') : new Date(t.createdAt).toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                            {t.npsScore && (
                                <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-500 p-1.5 rounded flex items-center justify-between">
                                    <span>NPS Atribuído</span>
                                    <span className="font-bold">{t.npsScore} / 10</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-6 text-sm text-zinc-500 bg-zinc-50 dark:bg-white/5 rounded-xl border border-dashed border-zinc-200 dark:border-white/10">
                    Nenhum atendimento anterior
                </div>
            )}
          </div>

          {/* Ordens de Serviço */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Wrench size={14} /> Ordens de Serviço (O.S.)
            </h3>
            {serviceOrders.length > 0 ? (
                <div className="space-y-2">
                    {serviceOrders.map(os => (
                        <div key={os.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 relative overflow-hidden">
                            <div className={cn("absolute left-0 top-0 bottom-0 w-1", os.status === 'completed' || os.status === 'finalized' ? 'bg-green-500' : os.status === 'cancelled' ? 'bg-red-500' : 'bg-blue-500')} />
                            <div className="pl-2">
                                <div className="flex justify-between items-start mb-1">
                                    <p className="text-sm font-medium">{os.description || os.type || 'Visita Técnica'}</p>
                                    <span className="text-[10px] font-mono text-zinc-400">{os.id.slice(0, 6)}</span>
                                </div>
                                <div className="text-xs text-zinc-500 flex items-center gap-1 mb-2">
                                    <Calendar size={12} />
                                    {os.date?.toDate ? os.date.toDate().toLocaleDateString('pt-BR') : (os.date ? new Date(os.date).toLocaleDateString('pt-BR') : 'Data não informada')}
                                </div>
                                {(os.technicianName || os.technician) && (
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                        <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                                            {(os.technicianName || os.technician).charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                            {os.technicianName || os.technician}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-6 text-sm text-zinc-500 bg-zinc-50 dark:bg-white/5 rounded-xl border border-dashed border-zinc-200 dark:border-white/10">
                    Nenhuma ordem de serviço.
                </div>
            )}
          </div>
          
        </div>
      </ScrollArea>
    </div>
  );
}
