import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Sparkles,
  User,
  Bot,
  Copy,
  Paperclip,
  Image as ImageIcon,
  Send,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Briefcase,
  Plus,
  RefreshCw,
  ArrowLeft,
  Edit2,
  MoreVertical,
  Clock,
  Phone,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import { toast } from "sonner";
import { useAppStore } from "@/src/store/useAppStore";
import { updateTicketStatus, toggleTicketAI } from "@/src/lib/db";
import { cn } from "@/src/lib/utils";
import {
  summarizeTicketHistory as summarizeTicket,
  getAIResponse as askAiAgent,
  AGENT_CATEGORIES,
} from "@/src/lib/gemini";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  updateDoc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/src/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Label } from "@/src/components/ui/label";
import { db } from "@/src/lib/firebase";
import { uploadAttachment as uploadToStorage } from "@/src/lib/storage";
import { CustomerHistorySidebar } from "@/src/components/CustomerHistorySidebar";
import { MaskedSensitiveData } from "@/src/components/MaskedSensitiveData";
import { io as socketIoClient, Socket } from "socket.io-client";
import { KanbanBoard } from "@/src/components/KanbanBoard";

export function ChatPage() {
  const {
    tickets,
    customers,
    invoices,
    selectedTicket,
    setSelectedTicket,
    messages,
    setMessages,
    userProfile,
    isConfiguringAI,
    settings,
    integrationKeys,
    setSelectedCustomerDetails,
    setIsDetailsDialogOpen,
  } = useAppStore();

  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editingCustomerData, setEditingCustomerData] = useState<any>({});
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Voip states
  const [isVoipModalOpen, setIsVoipModalOpen] = useState(false);
  const [voipDialNumber, setVoipDialNumber] = useState("");
  const [isCalling, setIsCalling] = useState(false);

  const handleEditCustomerClick = (customer: any) => {
    setEditingCustomerData({ ...customer });
    setIsEditingCustomer(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCustomer(true);
    try {
      if (editingCustomerData.id) {
        const tenantId = userProfile?.tenantId || "";
        const payload = {
          ...editingCustomerData,
          status: editingCustomerData.status || "active",
          tenantId,
        };

        // Optimistic UI updates
        await updateDoc(doc(db, "customers", editingCustomerData.id), payload);

        // Try calling the new backend API for ERP bidirecional sync
        fetch(`/api/customers/${editingCustomerData.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch((err) => console.error("ERP sync failed:", err));

        toast.success("Perfil atualizado com sucesso!");
        setIsEditingCustomer(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar o perfil");
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [typingStatus, setTypingStatus] = useState<string>("");

  React.useEffect(() => {
    let appUrl = window.location.origin;
    if (appUrl.includes("5173") || appUrl.includes("localhost")) {
      appUrl = "http://localhost:3000";
    }
    const newSocket = socketIoClient(appUrl);
    setSocket(newSocket);

    newSocket.on("typing_status", (data: { status: string }) => {
       if (data.status === "composing" || data.status === "recording") {
           setTypingStatus(data.status === "recording" ? "gravando áudio..." : "digitando...");
       } else {
           setTypingStatus("");
       }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  React.useEffect(() => {
    const tenantId = userProfile?.tenantId;
    if (socket && selectedTicket && tenantId) {
      let customerPhone = customers.find(c => c.id === selectedTicket.customerId)?.phone;
      if (customerPhone) {
          const remoteJid = `${customerPhone}@s.whatsapp.net`;
          socket.emit("join_chat", { tenantId, remoteJid });
          return () => {
              socket.emit("leave_chat", { tenantId, remoteJid });
              setTypingStatus("");
          };
      }
    }
  }, [socket, selectedTicket?.id, userProfile?.tenantId, customers]);

  const [departments, setDepartments] = useState<any[]>([]);

  React.useEffect(() => {
    if (!userProfile?.tenantId) return;
    import("firebase/firestore").then(({ onSnapshot, collection }) => {
      onSnapshot(
        collection(db, "tenants", userProfile.tenantId, "departments"),
        (snap) => {
          setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        },
      );
    });
  }, [userProfile?.tenantId]);

  const getSLAStatus = (ticket: any) => {
    if (ticket.status === "resolved") return null; // No SLA indicator for resolved
    if (ticket.sla_breached) return "red";
    if (!ticket.createdAt) return "green";

    let limitMinutes = 15;
    if (ticket.departmentId) {
      const dept = departments.find((d) => d.id === ticket.departmentId);
      if (dept && dept.sla_response_minutes)
        limitMinutes = dept.sla_response_minutes;
    }

    const created = ticket.createdAt?.toDate
      ? ticket.createdAt.toDate()
      : new Date(ticket.createdAt);
    const elapsed = (Date.now() - created.getTime()) / 60000;

    if (elapsed > limitMinutes) return "red";
    if (elapsed > limitMinutes * 0.75) return "yellow";
    return "green";
  };
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    type: string;
  } | null>(null);
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [isSummarizingTicket, setIsSummarizingTicket] = useState(false);
  const [ticketSummary, setTicketSummary] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);

  const [isSnoozeDialogOpen, setIsSnoozeDialogOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingReason, setClosingReason] = useState("");
  const [closingReasonsList, setClosingReasonsList] = useState<any[]>([]);
  const [tenantForms, setTenantForms] = useState<any[]>([]);

  const [snoozeForm, setSnoozeForm] = useState({
    date: "",
    time: "",
    reason: "",
  });
  const [isSnoozing, setIsSnoozing] = useState(false);

  const handleSnoozeConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket?.id) return;
    if (!snoozeForm.date || !snoozeForm.time) {
      toast.error("Informe a data e horário.");
      return;
    }

    setIsSnoozing(true);
    try {
      const snoozedUntilStr = `${snoozeForm.date}T${snoozeForm.time}`;
      const snoozedUntilDate = new Date(snoozedUntilStr);

      if (isNaN(snoozedUntilDate.getTime())) {
        toast.error("Data/Hora inválida");
        return;
      }

      await updateDoc(doc(db, "tickets", selectedTicket.id), {
        status: "snoozed",
        snoozed_until: snoozedUntilDate,
        snooze_reason: snoozeForm.reason,
        snoozed_by: userProfile?.id || "Operador",
      });

      toast.success("Ticket colocado em espera (Snooze).");
      setIsSnoozeDialogOpen(false);
      setSelectedTicket(null); // Optional: close the chat
    } catch (err: any) {
      toast.error("Erro ao adiar ticket: " + err.message);
    } finally {
      setIsSnoozing(false);
    }
  };

  React.useEffect(() => {
    setTicketSummary(null);
  }, [selectedTicket?.id]);

  const handleToggleAI = async (ticketId: string, currentState: boolean) => {
    try {
      if (currentState) {
        toast.info(
          "A IA foi pausada neste ticket e não responderá mais automaticamente.",
        );
      } else {
        toast.success("A IA foi reativada para este ticket.");
      }
      await toggleTicketAI(ticketId, !currentState);
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, aiEnabled: !currentState });
      }
    } catch (error) {
      console.error("Error toggling AI:", error);
      toast.error("Erro ao alterar estado da IA.");
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncHistory = async () => {
    if (!selectedTicket) return;
    const customer = customers.find(
      (c: any) => c.id === selectedTicket.customerId,
    );
    const customerPhone =
      customer?.phone ||
      customer?.whatsapp ||
      (typeof customer === "object" ? (customer as any).phone : null);

    if (
      !customerPhone ||
      !integrationKeys?.evolutionUrl ||
      !integrationKeys?.evolutionInstance ||
      !integrationKeys?.evolutionApiKey
    ) {
      toast.error("Integração com Evolution ou número do cliente ausente.");
      return;
    }

    setIsSyncing(true);
    toast.loading("Puxando histórico do WhatsApp...", { id: "sync" });
    try {
      const response = await fetch(`/api/evolution/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/chat/findMessages/${integrationKeys.evolutionInstance}`,
          method: "POST",
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
          body: {
            where: {
              "key.remoteJid": `${customerPhone}@s.whatsapp.net`,
            },
          },
        }),
      });
      const data = await response.json();

      let validData = data;
      if (!response.ok || data.error) {
        // Fallback just in case Evolution needs a different body structure
        const fbResponse = await fetch(`/api/evolution/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `/chat/findMessages/${integrationKeys.evolutionInstance}`,
            method: "POST",
            evolutionUrl: integrationKeys.evolutionUrl,
            evolutionApiKey: integrationKeys.evolutionApiKey,
            body: {
              remoteJid: `${customerPhone}@s.whatsapp.net`,
            },
          }),
        });
        const fbData = await fbResponse.json();
        if (!fbResponse.ok || fbData.error)
          throw new Error(fbData.error || data.error);
        validData = fbData;
      }

      // Check if data is array
      const messagesObj =
        validData?.messages?.records || validData?.records || validData || [];
      const msgsArray = Array.isArray(messagesObj)
        ? messagesObj
        : Array.isArray(validData?.messages)
          ? validData.messages
          : Object.values(messagesObj);

      if (!Array.isArray(msgsArray) || msgsArray.length === 0) {
        toast.success("Nenhuma mensagem nova encontrada no histórico.", {
          id: "sync",
        });
        setIsSyncing(false);
        return;
      }

      toast.loading(
        `Encontradas ${msgsArray.length} mensagens. Sincronizando...`,
        { id: "sync" },
      );

      // Save them to firestore
      let added = 0;
      // evolution messages usually have .messageTimestamp and .key.fromMe
      // Let's sort them ascending to insert properly
      const sorted = [...msgsArray].sort(
        (a, b) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0),
      );

      for (const m of sorted) {
        if (!m.message) continue;
        const text =
          m.message.conversation || m.message.extendedTextMessage?.text || "";
        if (!text) continue;

        // We avoid duplicates by checking if we already have it
        const existing = messages.find(
          (existingMsg: any) =>
            existingMsg.text === text &&
            Math.abs(
              (existingMsg.createdAt?.toMillis?.() || Date.now()) -
                (m.messageTimestamp || 0) * 1000,
            ) < 90000,
        );
        if (existing) continue;

        const isFromMe =
          m.key?.fromMe === true ||
          m.key?.fromMe === "true" ||
          m.fromMe === true ||
          String(m.fromMe) === "true";
        await addDoc(collection(db, "tickets", selectedTicket.id, "messages"), {
          ticketId: selectedTicket.id,
          text: text,
          senderType: isFromMe ? "human" : "customer",
          status: "sent",
          createdAt: new Date((m.messageTimestamp || 0) * 1000),
        });
        added++;

        // Little buffer to insert cleanly
        await new Promise((r) => setTimeout(r, 100));
      }

      if (added > 0) {
        toast.success(`${added} novas mensagens sincronizadas!`, {
          id: "sync",
        });
      } else {
        toast.success("Histórico já estava atualizado.", { id: "sync" });
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao puxar histórico da Evolution API.", { id: "sync" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSummarizeTicket = async () => {
    if (!selectedTicket || messages.length === 0) return;
    setIsSummarizingTicket(true);
    setTicketSummary(null);
    try {
      const formattedMessages = messages
        .map(
          (m) =>
            `${m.senderType === "customer" ? "Cliente" : m.senderType === "human" ? "Atendente" : m.senderType === "ai" ? "IA" : "Sistema"}: ${m.text}`,
        )
        .join("\n");

      let customerData;
      if (selectedTicket.customerId) {
        const customer = customers.find(
          (c) => c.id === selectedTicket.customerId,
        );
        if (customer) {
          customerData = {
            name: customer.name,
            cpf: customer.document,
            address: customer.address,
            phone: customer.phone,
          };
        }
      }

      const text = await summarizeTicket(formattedMessages, customerData);
      setTicketSummary(text);
      toast.success("Resumo gerado com sucesso!");
    } catch (error) {
      console.error("Error summarizing ticket:", error);
      toast.error("Erro ao gerar resumo.");
    } finally {
      setIsSummarizingTicket(false);
    }
  };

  const simulateAiChat = async (ticketId: string, testMessage: string) => {
    if (isConfiguringAI || !settings?.aiApiKey) {
      toast.error("Configure sua chave da OpenAI e Asssistant ID primeiro!");
      return;
    }

    // Simulate incoming customer message
    const msgRef = await addDoc(
      collection(db, "tickets", ticketId, "messages"),
      {
        text: testMessage,
        senderType: "customer",
        createdAt: serverTimestamp(),
      },
    );

    const newMsg = {
      id: msgRef.id,
      text: testMessage,
      senderType: "customer",
      createdAt: new Date(),
    };

    setMessages([...messages, newMsg]);
    setIsAiThinking(true);

    let customerData;
    if (selectedTicket.customerId) {
      const customer = customers.find(
        (c) => c.id === selectedTicket.customerId,
      );
      if (customer) {
        customerData = {
          name: customer.name,
          cpf: customer.document,
          address: customer.address,
          phone: customer.phone,
        };
      }
    }

    try {
      console.log("Chamando askAiAgent...");
      const response = await askAiAgent(
        [...messages, newMsg],
        undefined,
        customerData,
      );
      console.log("Resposta recebida:", response);

      const aiMsgRef = await addDoc(
        collection(db, "tickets", ticketId, "messages"),
        {
          text: response.text,
          senderType: "ai",
          category: response.category,
          createdAt: serverTimestamp(),
        },
      );

      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgRef.id,
          text: response.text,
          senderType: "ai",
          category: response.category,
          createdAt: new Date(),
        },
      ]);
    } catch (error) {
      console.error("Error in AI chat block:", error);
      toast.error("A IA encontrou um erro e não pôde responder.");
    } finally {
      setIsAiThinking(false);
    }
  };

  React.useEffect(() => {
    if (!tenantId) return;
    const crQuery = query(collection(db, "tenants", tenantId, "closing_reasons"));
    const unsubCr = onSnapshot(crQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClosingReasonsList(data.length > 0 ? data : [
        { id: "1", name: "Dúvida Sanada" },
        { id: "2", name: "Problema Técnico Resolvido" },
        { id: "3", name: "Falta de Retorno do Cliente" },
        { id: "4", name: "Encaminhado para outro setor" }
      ]);
    });
    
    const formsQuery = query(collection(db, "tenants", tenantId, "forms"));
    const unsubForms = onSnapshot(formsQuery, (snap) => {
       setTenantForms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubCr(); unsubForms(); };
  }, [tenantId]);

  const updateTicketStatusLocal = async (ticketId: string, status: string) => {
    try {
      if (status === "resolved") {
        setClosingReason("");
        setIsClosingModalOpen(true);
        return;
      }
      toast.success(
        `Ticket ${status === "resolved" ? "resolvido" : "atualizado"}!`,
      );
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({
          ...selectedTicket,
          status,
          resolvedAt: status === "resolved" ? new Date() : null,
        });
      }
    } catch (error) {
      console.error("Error updating ticket status:", error);
      toast.error("Erro ao atualizar ticket.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile({ file, type: file.type });
    }
  };

  const confirmClosing = async () => {
    if (!closingReason) {
       toast.error("Por favor, selecione o motivo do encerramento.");
       return;
    }
    if (!selectedTicket) return;
    try {
      await updateDoc(doc(db, "tickets", selectedTicket.id), {
         closing_reason: closingReason
      });
      await updateTicketStatus(selectedTicket.id, "resolved");
      toast.success("Ticket resolvido com sucesso!");
      setIsClosingModalOpen(false);
      setSelectedTicket(null); // Return to list
    } catch (e) {
      toast.error("Erro ao encerrar ticket.");
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedTicket) return;

    const messageText = newMessage;
    setNewMessage("");
    setIsAiThinking(true);
    let attachmentData = null;

    if (selectedFile) {
      try {
        const currentTenant =
          selectedTicket.tenant_id || selectedTicket.tenantId || "default";
        const url = await uploadToStorage(
          selectedFile.file,
          `tickets/${selectedTicket.id}`,
          currentTenant,
        );
        attachmentData = {
          url,
          type: selectedFile.type,
          name: selectedFile.file.name,
        };
        setSelectedFile(null);
      } catch (error) {
        console.error("File upload error:", error);
        toast.error("Erro ao fazer upload do arquivo.");
        setIsAiThinking(false);
        return;
      }
    }

    try {
      const msgRef = await addDoc(
        collection(db, "tickets", selectedTicket.id, "messages"),
        {
          ticketId: selectedTicket.id,
          text: messageText,
          senderType: "human", // Human agent sending from panel
          agentId: userProfile?.uid || null,
          agentName: userProfile?.name || "Agente (Desconhecido)",
          attachment: attachmentData,
          createdAt: serverTimestamp(),
          isInternal: isInternalNote
        },
      );

      if (
        !selectedTicket.human_responded &&
        (selectedTicket.status === "escalated" || selectedTicket.shouldEscalate)
      ) {
        fetch("/api/tickets/human-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: selectedTicket.id }),
        }).catch(console.error);
      }

      if (isInternalNote) {
         // Não envia a mensagem pro WhatsApp, limpa o state
         setIsInternalNote(false);
         setIsAiThinking(false);
         return;
      }

      // Send via Evolution API to the customer's WhatsApp
      const customer = customers.find(
        (c) => c.id === selectedTicket.customerId,
      );
      const customerPhone = customer?.phone;

      if (
        customerPhone &&
        integrationKeys.evolutionUrl &&
        integrationKeys.evolutionInstance &&
        integrationKeys.evolutionApiKey
      ) {
        try {
          let payload;
          if (attachmentData) {
            payload = {
              number: `${customerPhone}`,
              options: {
                delay: 1200,
                presence: "composing",
              },
              mediaMessage: {
                mediatype: attachmentData.type.startsWith("image/")
                  ? "image"
                  : "document",
                fileName: attachmentData.name,
                media: attachmentData.url,
              },
            };
            if (messageText) {
              payload.mediaMessage.caption = messageText;
            }
          } else {
            payload = {
              number: `${customerPhone}`,
              options: {
                delay: 1200,
                presence: "composing",
              },
              textMessage: {
                text: messageText,
              },
            };
          }

          const response = await fetch(`/api/evolution/proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: attachmentData
                ? `/message/sendMedia/${integrationKeys.evolutionInstance}`
                : `/message/sendText/${integrationKeys.evolutionInstance}`,
              method: "POST",
              evolutionUrl: integrationKeys.evolutionUrl,
              evolutionApiKey: integrationKeys.evolutionApiKey,
              body: payload,
            }),
          });
          const resData = await response.json();
          if (!response.ok) {
            console.error("Evolution API route error:", resData);
            toast.error("Erro ao enviar mensagem pelo WhatsApp.");
          } else if (resData?.key?.id || resData?.message?.key?.id) {
            const evoId = resData?.key?.id || resData?.message?.key?.id;
            await updateDoc(msgRef, { evoMsgIds: [evoId] });
          }
        } catch (evoErr) {
          console.error("Evolution local error:", evoErr);
        }
      }

      // Add locally for instant feedback (since we don't have setMessages listener attached in the same way, or to avoid visual delay)
      // Actually we pulled setMessages from useAppStore which is updated by App.tsx. App.tsx already registers onSnapshot.
      // So we don't necessarily NEED to do anything here to add it locally, as onSnapshot will fire. However, the store's setMessages replaces the array so it's fine if we optimistically add or we can just let onSnapshot do it.
      // We will remove the optimistic update to avoid duplicates if onSnapshot does it. Wait, the optimistic update doesn't have a true firebase Timestamp yet so it might get duplicated if the IDs don't match.
      // I'll leave it out, but I'll update it optimistically just to be safe by checking if it already got added. Actually, replacing the array is fine.
      /*
      setMessages([...messages, {
        id: msgRef.id,
        text: messageText,
        senderType: 'human',
        attachment: attachmentData,
        createdAt: new Date()
      }]);
      */
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Erro ao enviar mensagem.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const [isPullingHistory, setIsPullingHistory] = useState(false);

  const handleFetchOldMessages = async () => {
    if (!selectedTicket || !selectedTicket.customerId) return;
    setIsPullingHistory(true);
    const tid = toast.loading("Puxando histórico do Evolution...");
    try {
      const res = await fetch("/api/evolution/fetch-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          customerId: selectedTicket.customerId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Histórico puxado com sucesso! ${data.imported} mensagens importadas.`,
          { id: tid },
        );
      } else {
        toast.error(`Erro: ${data.error}`, { id: tid });
      }
    } catch (e: any) {
      toast.error(`Erro de conexão ao puxar histórico.`, { id: tid });
    } finally {
      setIsPullingHistory(false);
    }
  };

  const visibleTickets = tickets.filter((t) => {
    if (t.status === "resolved") {
      const resolvedTime =
        t.resolvedAt instanceof Date
          ? t.resolvedAt.getTime()
          : t.resolvedAt?.toMillis?.() || t.createdAt?.toMillis?.() || 0;

      if (Date.now() - resolvedTime > 24 * 60 * 60 * 1000) {
        return false;
      }
    }
    return true;
  });

  const [viewMode, setViewMode] = useState<"lista" | "pipeline">("lista");

  const handleInitiateCall = async (e: React.FormEvent) => {
    e.preventDefault();
//... (no changes inside handleInitiateCall)
    if (!selectedTicket || !voipDialNumber) return;
    setIsCalling(true);
    try {
       const res = await fetch("/api/voip/initiate-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
             tenantId: userProfile?.tenantId || "default",
             ticketId: selectedTicket.id,
             toNumber: voipDialNumber,
             operatorId: userProfile?.id,
             operatorName: userProfile?.name
          })
       });
       if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Erro ao iniciar ligação");
       }
       toast.success("Ligação iniciada! Verifique seu ramal ou softphone.");
       setIsVoipModalOpen(false);
    } catch (err: any) {
       toast.error("Erro ao iniciar chamada: " + err.message);
    } finally {
       setIsCalling(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-60px)] md:h-[calc(100dvh-120px)] -m-4 md:m-0 gap-4">
      <div className="flex items-center justify-between px-4 md:px-0">
        <h1 className="text-2xl font-bold tracking-tight">Atendimentos</h1>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button 
            onClick={() => { setViewMode("lista"); setSelectedTicket(null); }}
            className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", viewMode === "lista" ? "bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
          >
            Lista
          </button>
          <button 
            onClick={() => { setViewMode("pipeline"); setSelectedTicket(null); }}
            className={cn("px-3 py-1.5 text-sm font-medium rounded-md transition-colors", viewMode === "pipeline" ? "bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
          >
            Pipeline
          </button>
        </div>
      </div>
      
      {viewMode === "pipeline" ? (
         <div className="flex-1 overflow-hidden">
            <KanbanBoard tickets={visibleTickets} customers={customers} onTicketClick={setSelectedTicket} />
         </div>
      ) : (
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col md:flex-row flex-1 gap-0 md:gap-5"
      >
        {/* Chat List */}
        <div
          className={cn(
            "w-full md:w-[340px] lg:w-[360px] xl:w-[420px] bg-white dark:bg-[#09090b] md:bg-card md:border md:shadow-sm overflow-hidden shrink-0 md:rounded-[24px] flex flex-col",
            selectedTicket ? "hidden md:flex" : "flex flex-1",
          )}
        >
        <ScrollArea className="flex-1">
          <div className="p-1 md:p-2 space-y-0.5 md:space-y-1">
            {visibleTickets
              .sort((a, b) => {
                // Sort 'escalated' first, then 'open', then others
                if (a.status === "escalated" && b.status !== "escalated")
                  return -1;
                if (b.status === "escalated" && a.status !== "escalated")
                  return 1;
                return (
                  (b.createdAt?.toMillis?.() || 0) -
                  (a.createdAt?.toMillis?.() || 0)
                );
              })
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={cn(
                    "w-full text-left p-4 md:p-3 rounded-none md:rounded-xl transition-all cursor-pointer flex gap-3 items-center hover:bg-zinc-100 dark:hover:bg-zinc-800/50 border-b md:border-none border-zinc-100 dark:border-zinc-800/50 last:border-none",
                    selectedTicket?.id === t.id &&
                      "bg-zinc-100 dark:bg-zinc-800",
                  )}
                >
                  <Avatar className="w-12 h-12 shrink-0 border border-indigo-100 dark:border-purple-900/30">
                    <AvatarImage
                      src={
                        customers.find((c) => c.id === t.customerId)?.avatar ||
                        customers.find((c) => c.id === t.customerId)
                          ?.photoUrl ||
                        customers.find((c) => c.id === t.customerId)
                          ?.avatarUrl ||
                        customers.find((c) => c.id === t.customerId)
                          ?.profilePicUrl
                      }
                    />
                    <AvatarFallback className="bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-indigo-600 dark:text-purple-400 text-lg font-bold">
                      {(customers.find((c) => c.id === t.customerId)?.name ||
                        t.customerName ||
                        "A")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-sm truncate pr-2 dark:text-zinc-50">
                        {(() => {
                          const cName =
                            customers.find((c) => c.id === t.customerId)
                              ?.name || t.customerName;
                          if (
                            !t.subject ||
                            t.subject
                              .toLowerCase()
                              .includes("atendimento via") ||
                            t.subject.toLowerCase().includes("atendimento de")
                          ) {
                            return cName ? cName : "Desconhecido";
                          }
                          return t.subject;
                        })()}
                      </span>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {t.status === "escalated"
                          ? "Escalado"
                          : t.status === "open"
                            ? "Aberto"
                            : t.status === "resolved"
                              ? "Resolvido"
                              : "Progresso"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate pr-2 flex items-center">
                        {(() => {
                          const cPhone = customers.find(
                            (c) => c.id === t.customerId,
                          )?.phone;
                          return cPhone ? (
                            <MaskedSensitiveData value={cPhone} type="phone" />
                          ) : (
                            `Cliente ID: ${t.customerId?.slice(0, 8)}`
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.priority === "urgent" && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded uppercase font-bold">
                            Urgente
                          </span>
                        )}
                        {getSLAStatus(t) && (
                          <div
                            className={cn(
                              "w-2.5 h-2.5 rounded-full shrink-0 shadow-sm border border-white dark:border-zinc-900",
                              getSLAStatus(t) === "red"
                                ? "bg-red-500"
                                : getSLAStatus(t) === "yellow"
                                  ? "bg-amber-400"
                                  : "bg-emerald-500",
                            )}
                            title={`SLA Status: ${getSLAStatus(t)}`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            {visibleTickets.length === 0 && (
              <div className="text-center py-10 text-zinc-400 text-sm italic">
                Nenhum ticket encontrado.
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Window */}
      <div
        className={cn(
          "flex-1 bg-white dark:bg-[#09090b] md:bg-card md:border md:shadow-sm overflow-hidden flex-col md:rounded-[24px]",
          selectedTicket
            ? "flex fixed inset-0 z-[100] md:relative md:inset-auto md:z-auto"
            : "hidden md:flex",
        )}
      >
        {selectedTicket ? (
          <>
            <header className="relative p-2 md:p-4 border-b flex flex-row items-center justify-between gap-2 shrink-0 bg-white dark:bg-[#09090b] z-10 w-full pt-[max(env(safe-area-inset-top),_8px)]">
              <div className="flex items-center gap-1 md:gap-4 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className="md:hidden shrink-0 -ml-1 text-zinc-600 dark:text-zinc-300 p-2 cursor-pointer z-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedTicket(null);
                    }}
                  >
                    <ArrowLeft size={24} />
                  </div>
                  <button
                    className="flex flex-row items-center gap-2 md:gap-3 text-left outline-none p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors max-w-full"
                    onClick={() => {
                      const c = customers.find(
                        (c) => c.id === selectedTicket.customerId,
                      );
                      if (c) {
                        setSelectedCustomerDetails(c);
                        setIsDetailsDialogOpen(true);
                      }
                    }}
                  >
                    <Avatar className="w-9 h-9 md:w-10 md:h-10 shrink-0 border border-indigo-200/50 shadow-sm">
                      <AvatarImage
                        src={
                          customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          )?.avatar ||
                          customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          )?.photoUrl ||
                          customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          )?.avatarUrl ||
                          customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          )?.profilePicUrl
                        }
                      />
                      <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-base md:text-lg font-bold">
                        {(customers.find(
                          (c) => c.id === selectedTicket.customerId,
                        )?.name ||
                          selectedTicket.customerName ||
                          "A")[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="text-sm md:text-base font-bold leading-tight truncate flex items-center gap-2">
                        {(() => {
                          const c = customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          );
                          const cName = c?.name || selectedTicket.customerName;
                          const isGenericSubject =
                            !selectedTicket.subject ||
                            selectedTicket.subject
                              .toLowerCase()
                              .includes("atendimento via") ||
                            selectedTicket.subject
                              .toLowerCase()
                              .includes("atendimento de");
                          return isGenericSubject
                            ? cName
                              ? cName
                              : "Desconhecido"
                            : selectedTicket.subject;
                        })()}
                        {typingStatus && (
                            <span className="text-xs font-normal text-indigo-500 italic animate-pulse">
                              {typingStatus}
                            </span>
                        )}
                      </div>
                      <div className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate flex items-center">
                        {(() => {
                          const cPhone = customers.find(
                            (c) => c.id === selectedTicket.customerId,
                          )?.phone;
                          return cPhone ? (
                            <MaskedSensitiveData value={cPhone} type="phone" />
                          ) : (
                            selectedTicket.customerId
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                {selectedTicket.aiEnabled !== false ? (
                  <Button
                    size="icon"
                    variant="default"
                    className="h-8 w-8 md:h-9 md:w-auto md:px-3 text-xs gap-1 md:gap-2 rounded-full font-semibold shadow-sm bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={() => handleToggleAI(selectedTicket.id, true)}
                    title="IA Ativa"
                  >
                    <Bot size={16} className="text-white" />{" "}
                    <span className="hidden md:inline">IA Ativa</span>
                  </Button>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 md:h-9 md:w-auto md:px-3 text-xs gap-1 md:gap-2 rounded-full font-semibold border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      onClick={() => {
                         const cPhone = customers.find(c => c.id === selectedTicket.customerId)?.phone;
                         setVoipDialNumber(cPhone || "");
                         setIsVoipModalOpen(true);
                      }}
                      title="Iniciar Ligação"
                    >
                      <Phone size={16} className="text-emerald-600 dark:text-emerald-500" />
                      <span className="hidden md:inline">Ligar</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 md:h-9 md:w-auto md:px-3 text-xs gap-1 md:gap-2 rounded-full font-semibold border-zinc-300 dark:border-zinc-700 text-zinc-500"
                      onClick={() => handleToggleAI(selectedTicket.id, false)}
                      title="IA Pausada"
                    >
                      <Bot size={16} className="text-zinc-400" />{" "}
                      <span className="hidden md:inline">IA Pausada</span>
                    </Button>
                  </>
                )}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsChatMenuOpen(!isChatMenuOpen)}
                  >
                    <MoreVertical size={18} />
                  </Button>
                  {isChatMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsChatMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg z-50">
                        <button
                          className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => {
                            setIsChatMenuOpen(false);
                            handleSyncHistory();
                          }}
                          disabled={isSyncing}
                        >
                          <RefreshCw
                            size={14}
                            className={cn(
                              "mr-2",
                              isSyncing ? "animate-spin" : "",
                            )}
                          />
                          Sincronizar
                        </button>
                        {selectedTicket.status !== "resolved" && (
                          <>
                            <button
                              className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => {
                                setIsChatMenuOpen(false);
                                handleSummarizeTicket();
                              }}
                              disabled={
                                isSummarizingTicket || messages.length === 0
                              }
                            >
                              {isSummarizingTicket ? (
                                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin mr-2" />
                              ) : (
                                <Sparkles size={14} className="mr-2" />
                              )}
                              Resumir Conversa
                            </button>
                            <button
                              className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground text-amber-600 focus:text-amber-600 disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => {
                                setIsChatMenuOpen(false);
                                setIsSnoozeDialogOpen(true);
                              }}
                            >
                              <Clock size={14} className="mr-2" />
                              Adiar Atendimento (Snooze)
                            </button>
                            <div className="-mx-1 my-1 h-px bg-muted" />
                            <button
                              className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground text-green-600 focus:text-green-600 disabled:pointer-events-none disabled:opacity-50"
                              onClick={() => {
                                setIsChatMenuOpen(false);
                                updateTicketStatusLocal(
                                  selectedTicket.id,
                                  "resolved",
                                );
                              }}
                            >
                              <CheckCircle2 size={14} className="mr-2" />
                              Finalizar Atendimento
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {ticketSummary && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2 text-purple-800 dark:text-purple-300">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} />
                        <h4 className="font-bold text-sm">Resumo da IA</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                        onClick={() => {
                          navigator.clipboard.writeText(ticketSummary);
                          toast.success("Resumo copiado!");
                        }}
                      >
                        <Copy size={12} />
                      </Button>
                    </div>
                    <p className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-wrap leading-relaxed">
                      {ticketSummary}
                    </p>
                  </motion.div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={m.id || i}
                    className={cn(
                      "flex gap-3 max-w-[95%] md:max-w-[80%]",
                      ["human", "ai"].includes(m.senderType || "")
                        ? "ml-auto flex-row-reverse"
                        : m.senderType === "system"
                          ? "mx-auto w-full max-w-full justify-center"
                          : "",
                    )}
                  >
                    {m.senderType !== "system" && (
                      <Avatar className="h-8 w-8 shrink-0">
                        {m.senderType === "customer" && (
                          <AvatarImage
                            src={
                              customers.find(
                                (c) => c.id === selectedTicket.customerId,
                              )?.avatar ||
                              customers.find(
                                (c) => c.id === selectedTicket.customerId,
                              )?.photoUrl ||
                              customers.find(
                                (c) => c.id === selectedTicket.customerId,
                              )?.avatarUrl ||
                              customers.find(
                                (c) => c.id === selectedTicket.customerId,
                              )?.profilePicUrl
                            }
                          />
                        )}
                        <AvatarFallback
                          className={cn(
                            m.senderType === "ai"
                              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                              : m.senderType === "human"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                : "bg-zinc-100 dark:bg-zinc-800",
                          )}
                        >
                          {m.senderType === "ai" ? (
                            <Bot size={14} />
                          ) : m.senderType === "human" ? (
                            <User size={14} />
                          ) : (
                            "C"
                          )}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "flex flex-col gap-1",
                        m.senderType === "system"
                          ? "w-full text-center items-center"
                          : "",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-end gap-2",
                          m.senderType === "system"
                            ? "justify-center w-full"
                            : "",
                        )}
                      >
                        <div
                          className={cn(
                            "px-4 py-3 rounded-[20px] text-[15px] leading-relaxed max-w-[85%]",
                            m.isInternal 
                              ? "bg-yellow-200 text-yellow-900 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-700/50 rounded-tr-sm shadow-sm"
                              : ["human", "ai"].includes(m.senderType || "")
                                ? "bg-amber-500 text-black rounded-tr-sm shadow-sm"
                                : m.senderType === "system"
                                  ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-900/50 text-xs w-full max-w-md rounded-2xl text-center"
                                  : "bg-zinc-100 dark:bg-zinc-800 rounded-tl-sm text-zinc-800 dark:text-zinc-100 shadow-sm",
                          )}
                        >
                          {m.isInternal && <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mb-1">[INTERNO] Sussurro</div>}
                          {/* Agent Name Indicator for AI/Human */}
                          {["ai", "human"].includes(m.senderType || "") && (
                            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1 flex items-center gap-1">
                              {m.senderType === "ai" ? (
                                <>
                                  <Bot size={10} />
                                  Agente{" "}
                                  {m.category
                                    ? AGENT_CATEGORIES[
                                        m.category as keyof typeof AGENT_CATEGORIES
                                      ]?.name || m.category
                                    : "IA"}
                                </>
                              ) : (
                                <>
                                  <User size={10} />
                                  {m.agentName || "Atendente"}
                                </>
                              )}
                            </div>
                          )}

                          {m.attachment && (
                            <div className="rounded-lg overflow-hidden border border-zinc-200/20">
                              {m.attachment.type.startsWith("image/") ? (
                                <img
                                  src={m.attachment.url}
                                  alt="Anexo"
                                  className="max-w-full h-auto"
                                />
                              ) : m.attachment.type.startsWith("audio/") ? (
                                <audio
                                  controls
                                  className="w-full h-8"
                                  src={m.attachment.url}
                                />
                              ) : (
                                <div className="p-2 flex items-center gap-2 bg-zinc-800/10">
                                  <Paperclip size={14} />
                                  <span className="text-xs truncate">
                                    Arquivo Anexo
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {m.location_lat && m.location_lng && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-zinc-200/20 max-w-sm">
                              <iframe
                                width="100%"
                                height="200"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://maps.google.com/maps?q=${m.location_lat},${m.location_lng}&z=15&output=embed`}
                                allowFullScreen
                              ></iframe>
                            </div>
                          )}
                          {m.text && (
                            <p className="whitespace-pre-wrap">
                                {m.text.split(/(@\w+)/g).map((part: string, i: number) => 
                                    part.startsWith('@') ? <span key={i} className="font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1 rounded">{part}</span> : part
                                )}
                            </p>
                          )}
                        </div>
                        {m.senderType === "ai" && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              delay: 0.3,
                              type: "spring",
                              stiffness: 200,
                              damping: 10,
                            }}
                            className="shrink-0"
                          >
                            <CheckCircle2
                              size={14}
                              className="text-green-500 mb-1"
                            />
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isAiThinking && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-purple-100 text-purple-700">
                        <Bot size={14} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded-2xl rounded-tl-none text-sm italic text-zinc-500 dark:text-zinc-400">
                      IA está digitando...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex flex-col border-t bg-white dark:bg-[#111214] pb-[max(env(safe-area-inset-bottom),_8px)]">
              {/* Quick Actions (Astrum Logic) */}
              <div className="flex gap-2 overflow-x-auto p-3 no-scrollbar shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() =>
                    setNewMessage(
                      "Olá! Verifiquei aqui e sua fatura já está disponível. Posso te enviar o código PIX?",
                    )
                  }
                >
                  <DollarSign size={12} /> Enviar Fatura
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() =>
                    setNewMessage(
                      "Vou realizar um reset remoto no seu sinal agora. Por favor, aguarde 2 minutos e teste novamente.",
                    )
                  }
                >
                  <TrendingUp size={12} /> Reset de Sinal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() =>
                    setNewMessage(
                      "Para resolver seu problema, precisamos agendar uma visita técnica. Qual o melhor horário para você?",
                    )
                  }
                >
                  <Briefcase size={12} /> Agendar Visita
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() =>
                    setNewMessage(
                      "Temos uma oferta especial para você: Upgrade para 500 Mega por apenas R$10 a mais no seu plano atual. Aceita?",
                    )
                  }
                >
                  <Plus size={12} /> Oferta Upgrade
                </Button>
                
                {tenantForms.length > 0 && (
                   <select 
                     className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 bg-transparent outline-none cursor-pointer"
                     onChange={(e) => {
                        const form = tenantForms.find(f => f.id === e.target.value);
                        if (form) {
                           const fieldsText = form.fields.map((f: any) => `- ${f.label}: `).join('\n');
                           setNewMessage(`Por favor, preencha o formulário abaixo:\n\n${fieldsText}`);
                           e.target.value = "";
                        }
                     }}
                   >
                     <option value="" disabled selected>📝 Enviar Formulário</option>
                     {tenantForms.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                     ))}
                   </select>
                )}
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between mx-4 mb-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-800 shrink-0">
                  <div className="flex items-center gap-2">
                    {selectedFile.type.startsWith("image/") ? (
                      <ImageIcon size={16} />
                    ) : (
                      <Paperclip size={16} />
                    )}
                    <span className="text-xs font-medium truncate max-w-[200px]">
                      {selectedFile.file.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                  >
                    Remover
                  </Button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="px-3 pb-3 shrink-0 flex flex-col gap-2">
                <div className="flex items-center px-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-500 font-medium cursor-pointer">
                        <input type="checkbox" checked={isInternalNote} onChange={(e) => setIsInternalNote(e.target.checked)} className="rounded border-zinc-300 text-amber-500 focus:ring-amber-500" />
                        Nota Interna (Sussurro)
                    </label>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  accept="image/*,audio/*"
                />
                <div className="flex items-center gap-2 bg-zinc-100/80 dark:bg-zinc-800/80 p-1.5 rounded-[24px] border border-transparent focus-within:bg-white dark:focus-within:bg-[#16171a] focus-within:shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:focus-within:shadow-[0_4px_16px_rgba(255,255,255,0.02)] focus-within:border-zinc-200 dark:focus-within:border-white/10 transition-all">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-10 w-10 rounded-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip size={20} />
                  </Button>
                  <Input
                    placeholder="Mensagem"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="border-none shadow-none focus-visible:ring-0 bg-transparent px-2 h-10 w-full text-[15px] placeholder:text-zinc-500"
                    spellCheck={true}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="shrink-0 h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-black shadow-sm transition-colors"
                    disabled={!newMessage.trim() && !selectedFile}
                  >
                    <Send size={18} className="translate-x-0.5" />
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p>Selecione um ticket para iniciar o atendimento.</p>
          </div>
        )}
      </div>

      {/* Customer Context Sidebar */}
      <CustomerHistorySidebar
        customerId={selectedTicket?.customerId}
        tenantId={userProfile?.tenantId}
        onEditCustomer={handleEditCustomerClick}
      />

      <Dialog open={isEditingCustomer} onOpenChange={setIsEditingCustomer}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize as informações do cliente
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={editingCustomerData.name || ""}
                onChange={(e) =>
                  setEditingCustomerData({
                    ...editingCustomerData,
                    name: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editingCustomerData.email || ""}
                onChange={(e) =>
                  setEditingCustomerData({
                    ...editingCustomerData,
                    email: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone / WhatsApp</Label>
              <Input
                value={editingCustomerData.phone || ""}
                onChange={(e) =>
                  setEditingCustomerData({
                    ...editingCustomerData,
                    phone: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Documento / CPF</Label>
              <Input
                value={editingCustomerData.document || ""}
                onChange={(e) =>
                  setEditingCustomerData({
                    ...editingCustomerData,
                    document: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Input
                value={editingCustomerData.plan || ""}
                onChange={(e) =>
                  setEditingCustomerData({
                    ...editingCustomerData,
                    plan: e.target.value,
                  })
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditingCustomer(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingCustomer}>
                {isSavingCustomer ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVoipModalOpen} onOpenChange={setIsVoipModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Iniciar Ligação VoIP</DialogTitle>
            <DialogDescription>
              O sistema fará uma ponte entre seu ramal (softphone configurado) e o cliente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInitiateCall} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Número do Cliente (SIP/PSTN)</Label>
              <Input
                value={voipDialNumber}
                onChange={(e) => setVoipDialNumber(e.target.value)}
                placeholder="+5521999999999"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsVoipModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isCalling} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {isCalling ? "Iniciando..." : 
                  <>
                     <Phone className="mr-2 h-4 w-4" />
                     Ligar
                  </>
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isClosingModalOpen} onOpenChange={setIsClosingModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Finalizar Atendimento (Tabulação)</DialogTitle>
            <DialogDescription>
              Selecione o motivo de encerramento para este atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
               <Label>Motivo (Tabulação)</Label>
               <Select value={closingReason} onValueChange={setClosingReason}>
                 <SelectTrigger>
                    <SelectValue placeholder="Selecione um motivo..." />
                 </SelectTrigger>
                 <SelectContent>
                    {closingReasonsList.map((r: any) => (
                       <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                    ))}
                 </SelectContent>
               </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClosingModalOpen(false)}>Cancelar</Button>
            <Button onClick={confirmClosing} className="bg-green-600 hover:bg-green-700 text-white">Encerrar Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSnoozeDialogOpen} onOpenChange={setIsSnoozeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adiar Atendimento (Snooze)</DialogTitle>
            <DialogDescription>
              O ticket ficará pausado e reabrirá automaticamente na data e hora
              selecionadas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSnoozeConfirm} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={snoozeForm.date}
                  onChange={(e) =>
                    setSnoozeForm({ ...snoozeForm, date: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={snoozeForm.time}
                  onChange={(e) =>
                    setSnoozeForm({ ...snoozeForm, time: e.target.value })
                  }
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                placeholder="Ex: Aguardando cliente enviar foto do modem"
                value={snoozeForm.reason}
                onChange={(e) =>
                  setSnoozeForm({ ...snoozeForm, reason: e.target.value })
                }
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSnoozeDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSnoozing}>
                {isSnoozing ? "Salvando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
    )}
    </div>
  );
}
