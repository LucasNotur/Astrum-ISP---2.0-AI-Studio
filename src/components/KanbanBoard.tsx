import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { cn } from "@/src/lib/utils";

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
        await updateDoc(doc(db, "tickets", draggableId), {
          pipeline_stage: destination.droppableId
        });
      } catch (err) {
        console.error("Failed to update pipeline stage", err);
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
                    return (
                      <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => onTicketClick(ticket)}
                            className="bg-white dark:bg-[#16171a] p-3 rounded-lg shadow-sm border border-zinc-200/50 dark:border-white/5 cursor-pointer hover:shadow transition-all"
                          >
                            <div className="flex items-center gap-2 mb-2">
                                <Avatar className="w-6 h-6">
                                    <AvatarImage src={customer?.avatarUrl || customer?.profilePicUrl} />
                                    <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-600">
                                        {(customer?.name || ticket.customerName || "A")[0].toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-[13px] font-medium truncate flex-1">
                                    {customer?.name || ticket.customerName || ticket.subject || "Sem nome"}
                                </span>
                            </div>
                            <div className="text-xs text-zinc-500 truncate mb-2">
                                {ticket.subject}
                            </div>
                            {ticket.is_vip && <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">VIP</span>}
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
