import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { supabase } from "@/src/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { cn } from "@/src/lib/utils";
import { toast } from "sonner";
import { Sparkles, FileText, Send, CheckCircle2, Zap, DollarSign, Clock } from "lucide-react";

const KANBAN_COLUMNS = [
  { id: "lead", title: "Lead" },
  { id: "qualificado", title: "Qualificado" },
  { id: "proposta", title: "Proposta" },
  { id: "fechado", title: "Fechado" },
];

export function KanbanBoard({ tickets, customers, onTicketClick }: any) {
  // Only use tickets that have a pipeline_stage, or default to "lead"
  const [boardData, setBoardData] = useState<any>({});

  useEffect(() => {
    const newData: any = {
      lead: [],
      qualificado: [],
      proposta: [],
      fechado: [],
    };
    
    // We only show open/progress tickets, maybe escalated
    const activeTickets = tickets.filter((t: any) => t.status !== "resolved");

    activeTickets.forEach((t: any) => {
      const stage = t.pipeline_stage || "lead";
      if (newData[stage]) {
        newData[stage].push(t);
      } else {
        newData.lead.push(t);
      }
    });

    setBoardData(newData);
  }, [tickets]);

  const onDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId !== destination.droppableId) {
      // Optmistic update
      const sourceColumn = [...boardData[source.droppableId]];
      const destColumn = [...boardData[destination.droppableId]];
      
      const [removed] = sourceColumn.splice(source.index, 1);
      destColumn.splice(destination.index, 0, removed);

      setBoardData({
        ...boardData,
        [source.droppableId]: sourceColumn,
        [destination.droppableId]: destColumn,
      });

      try {
        await supabase.from("tickets").update({
          pipeline_stage: destination.droppableId
        }).eq("id", draggableId);

        // Automações de Funil Simuladas/Aprimoradas
        if (destination.droppableId === 'qualificado') {
            toast("Automação IA: Qualificação", {
               description: "Analisando perfil e viabilidade técnica no endereço...",
               icon: <Sparkles className="text-indigo-500" />
            });
            setTimeout(() => {
               toast.success("Viabilidade Confirmada!", {
                   description: "O endereço possui cobertura FTTH (CTO mais próxima: 150m).",
                   icon: <CheckCircle2 className="text-green-500" />
               });
            }, 2500);
        } else if (destination.droppableId === 'proposta') {
            toast("Automação: Gerando Proposta", {
               description: "Criando contrato PDF com os planos selecionados...",
               icon: <FileText className="text-blue-500" />
            });
            setTimeout(() => {
               toast.success("Proposta enviada!", {
                   description: "O cliente recebeu o link de assinatura no WhatsApp.",
                   icon: <Send className="text-green-500" />
               });
            }, 3000);
        } else if (destination.droppableId === 'fechado') {
            toast.success("Negócio Fechado! 🎉", {
               description: "Sincronizando cliente com o ERP (IXC/HubSoft) e gerando OS...",
               icon: <Zap className="text-amber-500" />
            });
            setTimeout(() => {
               toast.success("Provisionamento Automático Concluído", {
                   description: "Ordem de Instalação criada. Carnê gerado no Asaas.",
                   icon: <CheckCircle2 className="text-green-500" />
               });
            }, 3500);
        }

      } catch (err) {
        console.error("Failed to update pipeline stage", err);
        toast.error("Erro ao mover card no funil.");
      }
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full w-full gap-4 p-4 overflow-x-auto bg-zinc-50 dark:bg-[#09090b]">
        {KANBAN_COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col flex-1 min-w-[280px] bg-zinc-100/50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 hidden-scrollbar">
            <div className="p-3 border-b flex items-center justify-between font-semibold text-sm">
              <span>{col.title}</span>
              <span className="bg-zinc-200 dark:bg-zinc-800 text-xs px-2 py-0.5 rounded-full">
                {boardData[col.id]?.length || 0}
              </span>
            </div>
            <Droppable droppableId={col.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex-1 p-2 space-y-2 overflow-y-auto"
                >
                  {boardData[col.id]?.map((ticket: any, index: number) => {
                    const customer = customers.find((c: any) => c.id === ticket.customerId);
                    // Add some simulated visual data for sales kanban
                    const simValue = ticket.id.length * 10; 
                    const prob = col.id === 'lead' ? '10%' : col.id === 'qualificado' ? '40%' : col.id === 'proposta' ? '80%' : '100%';

                    return (
                      <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => onTicketClick(ticket)}
                            className="bg-white dark:bg-[#16171a] p-3.5 rounded-lg shadow-sm border border-zinc-200/50 dark:border-white/5 cursor-pointer hover:shadow-md transition-all group flex flex-col gap-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-7 h-7 border border-zinc-100 dark:border-zinc-800">
                                      <AvatarImage src={customer?.avatarUrl || customer?.profilePicUrl} />
                                      <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-medium">
                                          {(customer?.name || ticket.customerName || "A")[0].toUpperCase()}
                                      </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <h4 className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate w-36">
                                        {customer?.name || ticket.customerName || "Cliente Web"}
                                    </h4>
                                    <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1">
                                      <Clock size={10} /> Há {Math.floor(Math.random() * 5) + 1} horas
                                    </div>
                                  </div>
                                </div>
                                {ticket.is_vip && <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">VIP</span>}
                            </div>
                            
                            <div className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                                {ticket.subject}
                            </div>
                            
                            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-green-600 dark:text-green-500">
                                   <DollarSign size={12} /> {simValue},00 <span className="text-zinc-400 font-normal">/mês</span>
                                </div>
                                <div className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400 font-medium tracking-wide">
                                   {prob}
                                </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
