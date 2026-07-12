import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/src/store/useAppStore";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { toast } from "sonner";
import {
  MessageSquare,
  ArrowLeft,
  Send,
  User,
  MoreVertical,
  Bot,
  BellRing,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import { updateTicketStatus, toggleTicketAI } from "@/src/lib/db";
import { cn } from "@/src/lib/utils";

export default function OperatorMobilePage() {
  const { tickets, customers, messages, userProfile } = useAppStore();

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const tenantId = userProfile?.tenantId || "DEFAULT_TENANT";

  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  }, []);

  const activeTickets = tickets
    .filter((t) => t.status === "open")
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    );

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
  const currentChatMsgs = selectedTicketId ? messages[selectedTicketId] || [] : [];
  const customer = selectedTicket
    ? customers.find((c) => c.id === selectedTicket.customer_id)
    : null;

  useEffect(() => {
    if (selectedTicketId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentChatMsgs, selectedTicketId]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedTicketId) return;
    try {
      await supabase
        .from("messages")
        .insert({ ticket_id: selectedTicketId, body: inputText, sender_type: "human" });
      setInputText("");
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    }
  };

  const handleToggleAgent = async () => {
    if (!selectedTicket) return;
    try {
      await toggleTicketAI(selectedTicket.id, !selectedTicket.ai_enabled);
      toast.success(
        selectedTicket.ai_enabled ? "IA desligada neste ticket" : "IA ligada neste ticket"
      );
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  const handleFinish = async () => {
    if (!selectedTicket) return;
    try {
      await updateTicketStatus(selectedTicket.id, "closed");
      setSelectedTicketId(null);
      toast.success("Atendimento finalizado");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  // List panel — visible on mobile when no ticket selected; always visible on md+
  const listPanel = (
    <div
      className={cn(
        "flex flex-col h-full bg-zinc-50 dark:bg-zinc-950",
        "w-full md:w-80 lg:w-96 shrink-0",
        "border-r border-zinc-200 dark:border-zinc-800",
        selectedTicketId ? "hidden md:flex" : "flex"
      )}
    >
      <header className="px-5 pt-6 pb-4 bg-indigo-600 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Atendimentos</h1>
            <p className="text-indigo-200 text-xs mt-0.5">
              {activeTickets.length} chats ativos
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-indigo-500 rounded-full"
            onClick={() => Notification.requestPermission()}
          >
            <BellRing size={20} className="text-white" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1 px-3 py-3">
        <div className="space-y-2">
          {activeTickets.map((ticket) => {
            const cust = customers.find((c) => c.id === ticket.customer_id);
            const msgs = messages[ticket.id] || [];
            const lastMsg = msgs[msgs.length - 1];

            return (
              <motion.div
                whileTap={{ scale: 0.98 }}
                key={ticket.id}
                onClick={() => setSelectedTicketId(ticket.id)}
                className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 flex items-start gap-3 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
              >
                <Avatar className="h-10 w-10 border-2 border-zinc-50 dark:border-zinc-950 shrink-0 relative">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 font-bold text-sm">
                    {cust?.name?.charAt(0) || "U"}
                  </AvatarFallback>
                  {ticket.ai_enabled && (
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-zinc-900 rounded-full p-0.5">
                      <Bot size={10} className="text-indigo-500" />
                    </div>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate pr-2 text-sm">
                      {cust?.name || "Usuário"}
                    </h3>
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                      {ticket.updated_at?.toDate
                        ? ticket.updated_at
                            .toDate()
                            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "Agora"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                    {lastMsg?.content || "Sem mensagens."}
                  </p>
                </div>
              </motion.div>
            );
          })}

          {activeTickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <MessageSquare size={40} className="mb-3 opacity-40" />
              <p className="text-sm">Nenhum chat ativo</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  // Chat panel — visible on mobile only when ticket selected; always visible on md+
  const chatPanel = (
    <div
      className={cn(
        "flex flex-col flex-1 h-full bg-zinc-50 dark:bg-zinc-950",
        selectedTicketId ? "flex" : "hidden md:flex"
      )}
    >
      {selectedTicket ? (
        <>
          <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setSelectedTicketId(null)}
              >
                <ArrowLeft size={18} />
              </Button>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-indigo-100 text-indigo-700">
                  {customer?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm leading-none">
                  {customer?.name || "Usuário"}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5 flex items-center gap-1">
                  {selectedTicket.ai_enabled ? (
                    <>
                      <Bot size={10} className="text-indigo-500" /> Bot Ativo
                    </>
                  ) : (
                    <>
                      <User size={10} className="text-zinc-500" /> Operador Humano
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleToggleAgent}>
                <Bot
                  size={16}
                  className={selectedTicket.ai_enabled ? "text-indigo-500" : "text-zinc-400"}
                />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleFinish}>
                <MoreVertical size={16} className="text-zinc-500" />
              </Button>
            </div>
          </header>

          <ScrollArea
            className="flex-1 p-4"
            style={{
              backgroundImage: "radial-gradient(#e5e7eb 1px, transparent 1px)",
              backgroundSize: "16px 16px",
            }}
          >
            <div className="flex flex-col gap-3 pb-4">
              {currentChatMsgs.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id || i}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    msg.role === "user"
                      ? "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-100 mr-auto rounded-tl-sm"
                      : "bg-indigo-600 text-white ml-auto rounded-tr-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-[10px] opacity-60 mt-1 block text-right">
                    {msg.created_at?.toDate
                      ? msg.created_at
                          .toDate()
                          .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 shrink-0">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Digite sua mensagem..."
              className="flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border-none h-10 px-4 focus-visible:ring-indigo-500"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <Button
              size="icon"
              className="rounded-full bg-indigo-600 hover:bg-indigo-700 h-10 w-10 shrink-0"
              onClick={handleSend}
            >
              <Send size={16} />
            </Button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
          <MessageSquare size={48} className="mb-3 opacity-20" />
          <p className="text-sm">Selecione um atendimento</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-zinc-50 dark:bg-zinc-950 font-sans overflow-hidden text-sm">
      {listPanel}
      {chatPanel}
    </div>
  );
}
