/**
 * U4-01 — Inbox do Operador (redesign completo)
 *
 * Layout 3 colunas:
 *   [Lista filtrada] | [Thread + Composer] | [Contexto do cliente]
 *
 * Coordena com P2-04 (inbox.routes.ts). Por ora usa store.tickets como fonte
 * primária; em S77 a lista migrará para GET /api/v2/conversations/inbox.
 */
import React, { useRef, useState, useMemo, useCallback } from "react";
import {
  MessageSquare, Send, Paperclip, Image as ImageIcon,
  Bot, Phone, RefreshCw, ArrowLeft, MoreVertical,
  CheckCircle2, Clock, Sparkles, Bell, Filter,
  Mail, Globe, Mic, X, Plus, Settings, Loader2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/src/lib/utils";
import { useAppStore } from "@/src/store/useAppStore";
import { updateTicketStatus, toggleTicketAI } from "@/src/lib/db";
import { supabase } from "@/src/lib/supabase";
import { uploadAttachment as uploadToStorage } from "@/src/lib/storage";
import { CustomerHistorySidebar } from "@/src/components/CustomerHistorySidebar";
import { MaskedSensitiveData } from "@/src/components/MaskedSensitiveData";
import { io as socketIoClient, Socket } from "socket.io-client";
import { KanbanBoard } from "@/src/components/KanbanBoard";
import {
  summarizeTicketHistory as summarizeTicket,
  getAIResponse as askAiAgent,
} from "@/src/lib/gemini";

// ─── Types ───────────────────────────────────────────────────────────────────

type Channel = "whatsapp" | "instagram" | "email" | "webchat" | "telephony" | "messenger";
type FilterTab = "todos" | "escalados" | "aguardando" | "resolvidos" | "pipeline";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHANNEL_META: Record<Channel, { label: string; color: string; bg: string }> = {
  whatsapp:  { label: "WA",  color: "text-emerald-700 dark:text-emerald-400",  bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  instagram: { label: "IG",  color: "text-fuchsia-700 dark:text-fuchsia-400",  bg: "bg-fuchsia-100 dark:bg-fuchsia-900/30" },
  messenger: { label: "FB",  color: "text-blue-700 dark:text-blue-400",         bg: "bg-blue-100 dark:bg-blue-900/30" },
  email:     { label: "✉",   color: "text-sky-700 dark:text-sky-400",           bg: "bg-sky-100 dark:bg-sky-900/30" },
  webchat:   { label: "WC",  color: "text-cyan-700 dark:text-cyan-400",         bg: "bg-cyan-100 dark:bg-cyan-900/30" },
  telephony: { label: "☎",   color: "text-orange-700 dark:text-orange-400",    bg: "bg-orange-100 dark:bg-orange-900/30" },
};

function ChannelBadge({ channel }: { channel: string }) {
  const meta = CHANNEL_META[channel as Channel] ?? CHANNEL_META.whatsapp;
  return (
    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-sm tracking-wide", meta.color, meta.bg)}>
      {meta.label}
    </span>
  );
}

function SlaChip({ color }: { color: "red" | "yellow" | "green" | null }) {
  if (!color) return null;
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full shrink-0 border border-background",
        color === "red"    && "bg-[--color-astrum-red]",
        color === "yellow" && "bg-[--color-astrum-amber]",
        color === "green"  && "bg-emerald-500",
      )}
      title={color === "red" ? "SLA vencido" : color === "yellow" ? "SLA em risco" : "SLA ok"}
    />
  );
}

function relativeTime(value: any): string {
  if (!value) return "";
  const ts = value?.toMillis?.() ?? (typeof value === "string" ? new Date(value).getTime() : Number(value));
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1)  return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function getSlaStatus(ticket: any, departments: any[]): "red" | "yellow" | "green" | null {
  if (ticket.status === "resolved") return null;
  if (ticket.sla_breached) return "red";
  if (!ticket.createdAt) return "green";
  let limitMinutes = 15;
  if (ticket.departmentId) {
    const dept = departments.find((d) => d.id === ticket.departmentId);
    if (dept?.sla_response_minutes) limitMinutes = dept.sla_response_minutes;
  }
  const created = ticket.createdAt?.toDate
    ? ticket.createdAt.toDate()
    : new Date(ticket.createdAt);
  const elapsed = (Date.now() - created.getTime()) / 60000;
  if (elapsed > limitMinutes)        return "red";
  if (elapsed > limitMinutes * 0.75) return "yellow";
  return "green";
}

function customerName(ticket: any, customers: any[]): string {
  return customers.find((c) => c.id === ticket.customerId)?.name
    ?? ticket.customerName
    ?? "Desconhecido";
}

function ticketLabel(ticket: any, customers: any[]): string {
  const name = customerName(ticket, customers);
  if (!ticket.subject || ticket.subject.toLowerCase().includes("atendimento"))
    return name;
  return ticket.subject;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useSocketTyping(
  socket: Socket | null,
  selectedTicket: any,
  customers: any[],
  tenantId: string,
) {
  const [typingStatus, setTypingStatus] = useState("");

  React.useEffect(() => {
    if (!socket || !selectedTicket || !tenantId) return;
    const phone = customers.find((c) => c.id === selectedTicket.customerId)?.phone;
    if (!phone) return;
    const remoteJid = `${phone}@s.whatsapp.net`;
    socket.emit("join_chat", { tenantId, remoteJid });
    return () => {
      socket.emit("leave_chat", { tenantId, remoteJid });
      setTypingStatus("");
    };
  }, [socket, selectedTicket?.id, tenantId, customers]);

  React.useEffect(() => {
    if (!socket) return;
    const handler = (data: { status: string }) => {
      setTypingStatus(
        data.status === "composing" ? "digitando..."
          : data.status === "recording" ? "gravando áudio..."
          : "",
      );
    };
    socket.on("typing_status", handler);
    return () => { socket.off("typing_status", handler); };
  }, [socket]);

  return typingStatus;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ChatPage() {
  const {
    tickets, customers, messages, setMessages,
    selectedTicket, setSelectedTicket,
    userProfile, isConfiguringAI, settings, integrationKeys,
    setSelectedCustomerDetails, setIsDetailsDialogOpen,
  } = useAppStore();

  const tenantId = userProfile?.tenantId ?? "";

  // ── Socket ──
  const [socket, setSocket] = useState<Socket | null>(null);
  React.useEffect(() => {
    let url = window.location.origin;
    if (url.includes("5173") || url.includes("localhost")) url = "http://localhost:3000";
    const s = socketIoClient(url);
    setSocket(s);
    return () => { s.close(); };
  }, []);
  const typingStatus = useSocketTyping(socket, selectedTicket, customers, tenantId);

  // ── Departments (SLA) ──
  const [departments, setDepartments] = useState<any[]>([]);
  React.useEffect(() => {
    if (!tenantId) return;
    supabase.from("tickets").select("department_id").eq("tenant_id", tenantId)
      .not("department_id", "is", null)
      .then(({ data }) => {
        if (data) {
          setDepartments(
            [...new Set(data.map((r: any) => r.department_id))].map((id) => ({ id, name: id })),
          );
        }
      });
  }, [tenantId]);

  // ── Config (closing reasons, forms) ──
  const [closingReasonsList, setClosingReasonsList] = useState<any[]>([]);
  const [tenantForms, setTenantForms] = useState<any[]>([]);
  React.useEffect(() => {
    if (!tenantId) return;
    supabase.from("tenants").select("closing_reasons,forms").eq("id", tenantId).maybeSingle()
      .then(({ data }) => {
        setClosingReasonsList(
          (data?.closing_reasons?.length ?? 0) > 0
            ? data!.closing_reasons
            : [
                { id: "1", name: "Dúvida Sanada" },
                { id: "2", name: "Problema Técnico Resolvido" },
                { id: "3", name: "Falta de Retorno do Cliente" },
                { id: "4", name: "Encaminhado para outro setor" },
              ],
        );
        setTenantForms(data?.forms ?? []);
      });
  }, [tenantId]);

  // ── Filter / List ──
  const [filterTab, setFilterTab] = useState<FilterTab>("todos");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTickets = useMemo(() => {
    let list = tickets.filter((t) => {
      if (t.status === "resolved") {
        const ts = t.resolvedAt instanceof Date
          ? t.resolvedAt.getTime()
          : t.resolvedAt?.toMillis?.() ?? t.createdAt?.toMillis?.() ?? 0;
        if (Date.now() - ts > 86_400_000) return false;
      }
      if (filterTab === "escalados")  return t.status === "escalated";
      if (filterTab === "aguardando") return t.status === "waiting" || t.status === "snoozed";
      if (filterTab === "resolvidos") return t.status === "resolved";
      return t.status !== "resolved" || true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        customerName(t, customers).toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => {
      if (a.status === "escalated" && b.status !== "escalated") return -1;
      if (b.status === "escalated" && a.status !== "escalated") return 1;
      return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    });
  }, [tickets, customers, filterTab, searchQuery]);

  const metrics = useMemo(() => ({
    total:     tickets.filter((t) => t.status !== "resolved").length,
    escalated: tickets.filter((t) => t.status === "escalated").length,
    waiting:   tickets.filter((t) => t.status === "waiting" || t.status === "snoozed").length,
  }), [tickets]);

  // ── Message state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ file: File; type: string } | null>(null);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isSummarizingTicket, setIsSummarizingTicket] = useState(false);
  const [ticketSummary, setTicketSummary] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  React.useEffect(() => {
    setTicketSummary(null);
  }, [selectedTicket?.id]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Dialog states ──
  const [isSnoozeOpen, setIsSnoozeOpen]       = useState(false);
  const [isClosingOpen, setIsClosingOpen]     = useState(false);
  const [closingReason, setClosingReason]     = useState("");
  const [snoozeForm, setSnoozeForm]           = useState({ date: "", time: "", reason: "" });
  const [isSnoozing, setIsSnoozing]           = useState(false);
  const [isVoipOpen, setIsVoipOpen]           = useState(false);
  const [voipNumber, setVoipNumber]           = useState("");
  const [isCalling, setIsCalling]             = useState(false);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [editCustomerData, setEditCustomerData]     = useState<any>({});
  const [isSavingCustomer, setIsSavingCustomer]     = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedTicket) return;

    const text = newMessage;
    setNewMessage("");
    setIsAiThinking(true);
    let attachment: { url: string; type: string; name: string } | null = null;

    if (selectedFile) {
      try {
        const tid = selectedTicket.tenant_id ?? selectedTicket.tenantId ?? "default";
        const url = await uploadToStorage(selectedFile.file, `tickets/${selectedTicket.id}`, tid);
        attachment = { url, type: selectedFile.type, name: selectedFile.file.name };
        setSelectedFile(null);
      } catch {
        toast.error("Erro ao fazer upload do arquivo.");
        setIsAiThinking(false);
        return;
      }
    }

    try {
      const { data: msgRef } = await supabase.from("messages").insert({
        ticket_id:   selectedTicket.id,
        body:        text,
        sender_type: "human",
        agent_id:    userProfile?.uid ?? null,
        agent_name:  userProfile?.name ?? "Agente",
        attachment:  attachment ?? null,
        is_internal: isInternalNote,
      }).select().single();

      if (!selectedTicket.human_responded && (selectedTicket.status === "escalated" || selectedTicket.shouldEscalate)) {
        fetch("/api/tickets/human-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: selectedTicket.id }),
        }).catch(console.error);
      }

      if (isInternalNote) {
        setIsInternalNote(false);
        setIsAiThinking(false);
        return;
      }

      const customer  = customers.find((c) => c.id === selectedTicket.customerId);
      const phone     = customer?.phone;
      const { evolutionUrl, evolutionInstance, evolutionApiKey } = integrationKeys;

      if (phone && evolutionUrl && evolutionInstance && evolutionApiKey) {
        const payload = attachment
          ? {
              number: phone,
              options: { delay: 1200, presence: "composing" },
              mediaMessage: {
                mediatype: attachment.type.startsWith("image/") ? "image" : "document",
                fileName: attachment.name,
                media: attachment.url,
                ...(text ? { caption: text } : {}),
              },
            }
          : {
              number: phone,
              options: { delay: 1200, presence: "composing" },
              textMessage: { text },
            };

        const res = await fetch("/api/evolution/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path:           attachment ? `/message/sendMedia/${evolutionInstance}` : `/message/sendText/${evolutionInstance}`,
            method:         "POST",
            evolutionUrl,
            evolutionApiKey,
            body:           payload,
          }),
        });
        const resData = await res.json();
        if (!res.ok) {
          toast.error("Erro ao enviar pelo WhatsApp.");
        } else {
          const evoId = resData?.key?.id ?? resData?.message?.key?.id;
          if (evoId && msgRef?.id) {
            await supabase.from("messages").update({ evo_msg_ids: [evoId] }).eq("id", msgRef.id);
          }
        }
      }
    } catch {
      toast.error("Erro ao enviar mensagem.");
    } finally {
      setIsAiThinking(false);
    }
  }, [newMessage, selectedFile, selectedTicket, isInternalNote, userProfile, customers, integrationKeys]);

  const handleToggleAI = async (ticketId: string, current: boolean) => {
    try {
      await toggleTicketAI(ticketId, !current);
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, aiEnabled: !current });
      }
      toast.info(!current ? "IA reativada." : "IA pausada neste ticket.");
    } catch {
      toast.error("Erro ao alterar estado da IA.");
    }
  };

  const handleSnoozeConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket?.id || !snoozeForm.date || !snoozeForm.time) {
      toast.error("Informe a data e horário.");
      return;
    }
    const until = new Date(`${snoozeForm.date}T${snoozeForm.time}`);
    if (isNaN(until.getTime())) { toast.error("Data/Hora inválida"); return; }
    setIsSnoozing(true);
    try {
      await supabase.from("tickets").update({
        status:        "snoozed",
        snoozed_until: until.toISOString(),
        snooze_reason: snoozeForm.reason,
        snoozed_by:    userProfile?.id ?? "Operador",
      }).eq("id", selectedTicket.id);
      toast.success("Ticket adiado.");
      setIsSnoozeOpen(false);
      setSelectedTicket(null);
    } catch {
      toast.error("Erro ao adiar ticket.");
    } finally {
      setIsSnoozing(false);
    }
  };

  const confirmClosing = async () => {
    if (!closingReason) { toast.error("Selecione o motivo de encerramento."); return; }
    if (!selectedTicket) return;
    try {
      await supabase.from("tickets").update({ closing_reason: closingReason }).eq("id", selectedTicket.id);
      await updateTicketStatus(selectedTicket.id, "resolved");
      toast.success("Ticket encerrado!");
      setIsClosingOpen(false);
      setSelectedTicket(null);
    } catch {
      toast.error("Erro ao encerrar ticket.");
    }
  };

  const handleInitiateCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !voipNumber) return;
    setIsCalling(true);
    try {
      const res = await fetch("/api/voip/initiate-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId:     tenantId,
          ticketId:     selectedTicket.id,
          toNumber:     voipNumber,
          operatorId:   userProfile?.id,
          operatorName: userProfile?.name,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Ligação iniciada!");
      setIsVoipOpen(false);
    } catch (err: any) {
      toast.error("Erro ao iniciar chamada: " + err.message);
    } finally {
      setIsCalling(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomerData.id) return;
    setIsSavingCustomer(true);
    try {
      await supabase.from("customers").update({
        ...editCustomerData,
        status:   editCustomerData.status ?? "active",
        tenantId: tenantId,
      }).eq("id", editCustomerData.id);
      toast.success("Perfil atualizado!");
      setIsEditCustomerOpen(false);
    } catch {
      toast.error("Erro ao atualizar perfil.");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedTicket || !messages.length) return;
    setIsSummarizingTicket(true);
    setTicketSummary(null);
    try {
      const formatted = messages.map((m: any) =>
        `${m.senderType === "customer" ? "Cliente" : m.senderType === "human" ? "Atendente" : "IA"}: ${m.text}`,
      ).join("\n");
      const customer = customers.find((c) => c.id === selectedTicket.customerId);
      const text = await summarizeTicket(formatted, customer ? { name: customer.name, cpf: customer.document, address: customer.address, phone: customer.phone } : undefined);
      setTicketSummary(text);
    } catch {
      toast.error("Erro ao resumir.");
    } finally {
      setIsSummarizingTicket(false);
    }
  };

  const handleFetchHistory = async () => {
    if (!selectedTicket) return;
    setIsSyncing(true);
    const tid = toast.loading("Puxando histórico...");
    try {
      const res  = await fetch("/api/evolution/fetch-history", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ticketId: selectedTicket.id, customerId: selectedTicket.customerId }),
      });
      const data = await res.json();
      data.success
        ? toast.success(`${data.imported} mensagens importadas.`, { id: tid })
        : toast.error(`Erro: ${data.error}`, { id: tid });
    } catch {
      toast.error("Erro ao puxar histórico.", { id: tid });
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────

  if (filterTab === "pipeline") {
    return (
      <div className="flex flex-col h-[calc(100dvh-60px)] md:h-[calc(100dvh-120px)] -m-4 md:m-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-lg font-semibold font-display">Atendimentos</h1>
          <FilterTabs value={filterTab} onChange={setFilterTab} metrics={metrics} />
        </div>
        <div className="flex-1 overflow-hidden">
          <KanbanBoard
            tickets={tickets.filter((t) => t.status !== "resolved")}
            customers={customers}
            onTicketClick={setSelectedTicket}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-60px)] md:h-[calc(100dvh-120px)] -m-4 md:m-0 overflow-hidden">

      {/* ── Top strip: metrics + filters ── */}
      <div className="flex flex-col shrink-0 border-b border-border bg-background">
        {/* Metrics row */}
        <div className="hidden md:flex items-center gap-6 px-4 py-2 text-xs text-muted-foreground border-b border-border/50">
          <span>
            <span className="font-mono font-bold text-foreground tabular-nums">{metrics.total}</span>{" "}
            abertos
          </span>
          {metrics.escalated > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[--color-astrum-red]" />
              <span className="font-mono font-bold text-[--color-astrum-red] tabular-nums">{metrics.escalated}</span>{" "}
              escalados
            </span>
          )}
          {metrics.waiting > 0 && (
            <span>
              <span className="font-mono font-bold tabular-nums">{metrics.waiting}</span>{" "}
              aguardando
            </span>
          )}
        </div>
        {/* Filter tabs + search */}
        <div className="flex items-center gap-2 px-4 py-2">
          <FilterTabs value={filterTab} onChange={setFilterTab} metrics={metrics} />
          <div className="ml-auto relative hidden sm:block">
            <Input
              placeholder="Buscar…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs w-44 pl-3"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3-column body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: conversation list ── */}
        <aside
          className={cn(
            "w-full md:w-[280px] lg:w-[300px] flex-col border-r border-border bg-background shrink-0",
            selectedTicket ? "hidden md:flex" : "flex",
          )}
        >
          <ScrollArea className="flex-1">
            <div className="py-1">
              {filteredTickets.map((t) => {
                const sla     = getSlaStatus(t, departments);
                const channel = (t.channel ?? t.source ?? "whatsapp") as Channel;
                const label   = ticketLabel(t, customers);
                const isSelected = selectedTicket?.id === t.id;

                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className={cn(
                      "w-full text-left flex gap-2.5 px-3 py-2.5 border-l-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted",
                      isSelected
                        ? "border-l-[--color-astrum-fiber] bg-muted"
                        : sla === "red"
                          ? "border-l-[--color-astrum-red]"
                          : "border-l-transparent",
                    )}
                  >
                    {/* Avatar */}
                    <Avatar className="w-9 h-9 shrink-0 mt-0.5">
                      <AvatarImage
                        src={
                          customers.find((c) => c.id === t.customerId)?.avatar
                          ?? customers.find((c) => c.id === t.customerId)?.photoUrl
                        }
                      />
                      <AvatarFallback className="text-xs font-bold bg-muted text-muted-foreground">
                        {label[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-sm font-medium truncate">{label}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                          {relativeTime(t.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ChannelBadge channel={channel} />
                        {t.status === "escalated" && (
                          <span className="text-[9px] font-bold text-[--color-astrum-red] bg-red-50 dark:bg-red-950/30 px-1 py-0.5 rounded">
                            ESCALADO
                          </span>
                        )}
                        {t.priority === "urgent" && (
                          <span className="text-[9px] font-bold text-[--color-astrum-orange] bg-orange-50 dark:bg-orange-950/30 px-1 py-0.5 rounded">
                            URGENTE
                          </span>
                        )}
                        <span className="flex-1 text-[11px] text-muted-foreground truncate">
                          {(() => {
                            const phone = customers.find((c) => c.id === t.customerId)?.phone;
                            return phone
                              ? <MaskedSensitiveData value={phone} type="phone" />
                              : null;
                          })()}
                        </span>
                        <SlaChip color={sla} />
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredTickets.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <MessageSquare size={32} className="opacity-20" />
                  <p className="text-sm">Nenhuma conversa.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* ── Center: thread ── */}
        <main
          className={cn(
            "flex-1 flex flex-col bg-background min-w-0",
            !selectedTicket && "hidden md:flex",
            selectedTicket && "flex fixed inset-0 z-[100] md:relative md:inset-auto md:z-auto",
          )}
        >
          {selectedTicket ? (
            <>
              {/* Thread header */}
              <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-background z-10 pt-[max(env(safe-area-inset-top),10px)]">
                {/* Back (mobile) */}
                <button
                  className="md:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground"
                  onClick={() => setSelectedTicket(null)}
                >
                  <ArrowLeft size={20} />
                </button>

                {/* Customer info */}
                <button
                  className="flex items-center gap-2 flex-1 min-w-0 rounded-lg px-2 py-1 hover:bg-muted transition-colors text-left"
                  onClick={() => {
                    const c = customers.find((c) => c.id === selectedTicket.customerId);
                    if (c) { setSelectedCustomerDetails(c); setIsDetailsDialogOpen(true); }
                  }}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={customers.find((c) => c.id === selectedTicket.customerId)?.avatar} />
                    <AvatarFallback className="text-xs font-bold bg-muted text-muted-foreground">
                      {customerName(selectedTicket, customers)[0]?.toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {customerName(selectedTicket, customers)}
                      </span>
                      {typingStatus && (
                        <span className="text-xs text-[--color-astrum-fiber] italic animate-pulse">
                          {typingStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ChannelBadge channel={selectedTicket.channel ?? selectedTicket.source ?? "whatsapp"} />
                      <span className="text-[11px] text-muted-foreground">
                        {selectedTicket.status === "escalated" ? "Escalado" : selectedTicket.status === "open" ? "Aberto" : selectedTicket.status}
                      </span>
                      <SlaChip color={getSlaStatus(selectedTicket, departments)} />
                    </div>
                  </div>
                </button>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={handleSummarize}
                          disabled={isSummarizingTicket}
                        >
                          {isSummarizingTicket ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Resumir com IA</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={handleFetchHistory}
                          disabled={isSyncing}
                        >
                          {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Sincronizar histórico</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-950"
                    onClick={() => { setClosingReason(""); setIsClosingOpen(true); }}
                  >
                    <CheckCircle2 size={13} /> Encerrar
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleToggleAI(selectedTicket.id, selectedTicket.aiEnabled)}>
                        <Bot size={14} className="mr-2" />
                        {selectedTicket.aiEnabled ? "Pausar IA" : "Reativar IA"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setIsSnoozeOpen(true)}>
                        <Clock size={14} className="mr-2" /> Adiar (Snooze)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        const c = customers.find((c) => c.id === selectedTicket.customerId);
                        if (c) { setEditCustomerData({ ...c }); setIsEditCustomerOpen(true); }
                      }}>
                        <Settings size={14} className="mr-2" /> Editar cliente
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => { setVoipNumber(""); setIsVoipOpen(true); }}>
                        <Phone size={14} className="mr-2" /> Ligar (VoIP)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>

              {/* IA summary banner */}
              {ticketSummary && (
                <div className="mx-3 mt-2 p-2.5 rounded-lg bg-muted border border-border text-xs leading-relaxed relative shrink-0">
                  <button
                    onClick={() => setTicketSummary(null)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                  <span className="font-semibold text-[--color-astrum-fiber] mr-1">Resumo IA:</span>
                  {ticketSummary}
                </div>
              )}

              {/* Message thread */}
              <ScrollArea className="flex-1 px-3">
                <div className="py-4 space-y-3">
                  {messages.map((m: any, i: number) => (
                    <MessageBubble key={m.id ?? i} message={m} />
                  ))}
                  {isAiThinking && (
                    <div className="flex gap-2 items-center text-xs text-muted-foreground">
                      <Loader2 size={12} className="animate-spin text-[--color-astrum-fiber]" />
                      IA respondendo…
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Composer */}
              <div className="shrink-0 border-t border-border">
                {/* Quick chips */}
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 overflow-x-auto scrollbar-none">
                  <button
                    onClick={() => setIsInternalNote((v) => !v)}
                    className={cn(
                      "text-[10px] font-medium px-2 py-1 rounded-full border shrink-0 transition-colors",
                      isInternalNote
                        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {isInternalNote ? "• Nota Interna" : "Nota Interna"}
                  </button>
                  {tenantForms.length > 0 && (
                    <select
                      className="text-[10px] h-7 px-2 rounded-full border border-border bg-background text-muted-foreground cursor-pointer"
                      onChange={(e) => {
                        const form = tenantForms.find((f) => f.id === e.target.value);
                        if (form) {
                          setNewMessage(`Por favor, preencha:\n\n${form.fields.map((f: any) => `- ${f.label}: `).join("\n")}`);
                          e.target.value = "";
                        }
                      }}
                    >
                      <option value="" disabled selected>📝 Formulário</option>
                      {tenantForms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* File preview */}
                {selectedFile && (
                  <div className="mx-3 mb-1 flex items-center justify-between p-2 bg-muted rounded-lg border border-border text-xs">
                    <span className="truncate max-w-[200px] font-medium">{selectedFile.file.name}</span>
                    <button onClick={() => setSelectedFile(null)} className="text-muted-foreground hover:text-foreground ml-2">
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* Input */}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2 px-3 pb-3">
                  <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setSelectedFile({ file: f, type: f.type });
                  }} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Paperclip size={18} />
                  </button>
                  <Input
                    placeholder={isInternalNote ? "Nota interna (não enviada ao cliente)…" : "Mensagem…"}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e as any);
                      }
                    }}
                    className={cn(
                      "flex-1 h-9 text-sm border-0 shadow-none focus-visible:ring-0 bg-muted rounded-full px-4",
                      isInternalNote && "bg-amber-50 dark:bg-amber-950/20",
                    )}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!newMessage.trim() && !selectedFile}
                    className="h-9 w-9 rounded-full bg-[--color-astrum-fiber] hover:opacity-90 text-white shrink-0"
                  >
                    <Send size={16} className="translate-x-0.5" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <MessageSquare size={40} className="opacity-15" />
              <p className="text-sm">Selecione uma conversa.</p>
            </div>
          )}
        </main>

        {/* ── Right: customer context ── */}
        <aside className="hidden xl:flex w-[280px] border-l border-border flex-col bg-background shrink-0">
          {selectedTicket ? (
            <CustomerHistorySidebar
              customerId={selectedTicket.customerId}
              tenantId={tenantId}
              onEditCustomer={(c: any) => { setEditCustomerData({ ...c }); setIsEditCustomerOpen(true); }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-xs">Selecione uma conversa.</p>
            </div>
          )}
        </aside>
      </div>

      {/* ── Dialogs ── */}

      {/* Snooze */}
      <Dialog open={isSnoozeOpen} onOpenChange={setIsSnoozeOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Adiar Atendimento</DialogTitle>
            <DialogDescription>O ticket reabrirá automaticamente na data e hora selecionadas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSnoozeConfirm} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={snoozeForm.date} required onChange={(e) => setSnoozeForm((v) => ({ ...v, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Hora</Label>
                <Input type="time" value={snoozeForm.time} required onChange={(e) => setSnoozeForm((v) => ({ ...v, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Input placeholder="Ex: Aguardando cliente enviar foto" value={snoozeForm.reason} required onChange={(e) => setSnoozeForm((v) => ({ ...v, reason: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsSnoozeOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSnoozing}>{isSnoozing ? "Salvando…" : "Confirmar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Closing / Tabulação */}
      <Dialog open={isClosingOpen} onOpenChange={setIsClosingOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Encerrar Atendimento</DialogTitle>
            <DialogDescription>Selecione o motivo de encerramento (tabulação).</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <Label>Motivo</Label>
            <Select value={closingReason} onValueChange={setClosingReason}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {closingReasonsList.map((r: any) => (
                  <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClosingOpen(false)}>Cancelar</Button>
            <Button onClick={confirmClosing} className="bg-emerald-600 hover:bg-emerald-700 text-white">Encerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VoIP */}
      <Dialog open={isVoipOpen} onOpenChange={setIsVoipOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Ligar (VoIP)</DialogTitle>
            <DialogDescription>O sistema fará uma ponte entre seu ramal e o cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInitiateCall} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Número do cliente</Label>
              <Input value={voipNumber} onChange={(e) => setVoipNumber(e.target.value)} placeholder="+5521999999999" required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsVoipOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isCalling} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isCalling ? "Iniciando…" : <><Phone size={14} className="mr-1.5" />Ligar</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit customer */}
      <Dialog open={isEditCustomerOpen} onOpenChange={setIsEditCustomerOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-3">
            {(["name","email","phone","document","plan"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="capitalize">{field === "phone" ? "Telefone / WhatsApp" : field === "document" ? "CPF / CNPJ" : field}</Label>
                <Input
                  value={editCustomerData[field] ?? ""}
                  onChange={(e) => setEditCustomerData((v: any) => ({ ...v, [field]: e.target.value }))}
                />
              </div>
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditCustomerOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSavingCustomer}>{isSavingCustomer ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterTabs({
  value, onChange, metrics,
}: {
  value: FilterTab;
  onChange: (v: FilterTab) => void;
  metrics: { total: number; escalated: number; waiting: number };
}) {
  const tabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: "todos",     label: "Todos",     count: metrics.total },
    { id: "escalados", label: "Escalados", count: metrics.escalated },
    { id: "aguardando",label: "Aguardando",count: metrics.waiting },
    { id: "resolvidos",label: "Resolvidos" },
    { id: "pipeline",  label: "Pipeline" },
  ];

  return (
    <div className="flex items-center gap-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "text-xs px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1",
            value === t.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={cn(
              "text-[9px] font-mono font-bold px-1 rounded",
              value === t.id
                ? "bg-background/20 text-background"
                : t.id === "escalados"
                  ? "text-[--color-astrum-red]"
                  : "text-muted-foreground",
            )}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message: m }: { message: any }) {
  const isHuman    = m.senderType === "human";
  const isCustomer = m.senderType === "customer";
  const isAi       = m.senderType === "ai";
  const isInternal = m.is_internal || m.isInternal;

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[82%]",
        isHuman ? "ml-auto flex-row-reverse" : "",
        isInternal && "opacity-80",
      )}
    >
      <Avatar className="w-7 h-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn(
          "text-[10px] font-bold",
          isHuman    ? "bg-muted text-muted-foreground" : "",
          isCustomer ? "bg-zinc-200 dark:bg-zinc-700 text-foreground" : "",
          isAi       ? "bg-[--color-astrum-fiber]/15 text-[--color-astrum-fiber]" : "",
        )}>
          {isHuman ? "AT" : isAi ? <Bot size={12} /> : "CL"}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-0.5">
        {isInternal && (
          <span className="text-[9px] uppercase font-bold tracking-wide text-amber-600 dark:text-amber-400">
            Nota Interna
          </span>
        )}
        <div className={cn(
          "px-3 py-2 rounded-2xl text-sm leading-relaxed",
          isHuman
            ? "bg-[--color-astrum-fiber] text-white rounded-tr-sm"
            : isInternal
              ? "bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-tl-sm"
              : isAi
                ? "bg-muted border border-border rounded-tl-sm"
                : "bg-card border border-border rounded-tl-sm",
        )}>
          {m.attachment?.url ? (
            m.attachment.type?.startsWith("image/")
              ? <img src={m.attachment.url} alt="anexo" className="rounded-lg max-w-[220px]" />
              : <a href={m.attachment.url} target="_blank" rel="noreferrer" className="underline text-xs">{m.attachment.name}</a>
          ) : (
            <span className="whitespace-pre-wrap">{m.text || m.body || m.content}</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono px-1">
          {relativeTime(m.createdAt)}
        </span>
      </div>
    </div>
  );
}
