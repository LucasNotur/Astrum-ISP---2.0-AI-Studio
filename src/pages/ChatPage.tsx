import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  Plus
} from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { toast } from "sonner";
import { useAppStore } from '@/src/store/useAppStore';
import { updateTicketStatus, toggleTicketAI } from '@/src/lib/db';
import { cn } from '@/src/lib/utils';
import { summarizeTicketHistory as summarizeTicket, getAIResponse as askAiAgent, AGENT_CATEGORIES } from '@/src/lib/gemini';
import { addDoc, collection, serverTimestamp, doc, updateDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { uploadAttachment as uploadToStorage } from '@/src/lib/storage';

export function ChatPage() {
  const { 
    tickets, 
    customers, 
    invoices,
    selectedTicket, 
    setSelectedTicket,
    messages,
    setMessages,
    isConfiguringAI,
    settings
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ file: File, type: string } | null>(null);
  const [isSummarizingTicket, setIsSummarizingTicket] = useState(false);
  const [ticketSummary, setTicketSummary] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  React.useEffect(() => {
    setTicketSummary(null);
  }, [selectedTicket?.id]);

  const handleToggleAI = async (ticketId: string, currentState: boolean) => {
    try {
      if (currentState) {
        toast.info("A IA foi pausada neste ticket e não responderá mais automaticamente.");
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

  const handleSummarizeTicket = async () => {
    if (!selectedTicket || messages.length === 0) return;
    setIsSummarizingTicket(true);
    setTicketSummary(null);
    try {
      const formattedMessages = messages.map(m => `${m.senderType === 'human' ? 'Cliente' : m.senderType === 'ai' ? 'IA' : 'Sistema'}: ${m.text}`).join('\n');
      const text = await summarizeTicket(formattedMessages);
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
    
    // Simulate incoming human message
    const msgRef = await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
      text: testMessage,
      senderType: 'human',
      createdAt: serverTimestamp()
    });

    const newMsg = {
      id: msgRef.id,
      text: testMessage,
      senderType: 'human',
      createdAt: new Date()
    };
    
    setMessages([...messages, newMsg]);
    setIsAiThinking(true);

    try {
      console.log("Chamando askAiAgent...");
      const response = await askAiAgent([...messages, newMsg]);
      console.log("Resposta recebida:", response);
      
      const aiMsgRef = await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        text: response.text,
        senderType: 'ai',
        category: response.category,
        createdAt: serverTimestamp()
      });
      
      setMessages(prev => [...prev, {
        id: aiMsgRef.id,
        text: response.text,
        senderType: 'ai',
        category: response.category,
        createdAt: new Date()
      }]);
    } catch (error) {
       console.error("Error in AI chat block:", error);
       toast.error("A IA encontrou um erro e não pôde responder.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const updateTicketStatusLocal = async (ticketId: string, status: string) => {
    try {
      if (status === 'resolved') {
        await updateTicketStatus(ticketId, status);
      }
      toast.success(`Ticket ${status === 'resolved' ? 'resolvido' : 'atualizado'}!`);
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status, resolvedAt: status === 'resolved' ? new Date() : null });
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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedTicket) return;

    const messageText = newMessage;
    setNewMessage("");
    setIsAiThinking(true);
    let attachmentData = null;

    if (selectedFile) {
        try {
          const url = await uploadToStorage(selectedFile.file, `tickets/${selectedTicket.id}/${Date.now()}_${selectedFile.file.name}`);
          attachmentData = {
              url,
              type: selectedFile.type,
              name: selectedFile.file.name
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
      const msgRef = await addDoc(collection(db, 'tickets', selectedTicket.id, 'messages'), {
        text: messageText,
        senderType: 'ai', // Assuming agent sending in this UI context
        attachment: attachmentData,
        createdAt: serverTimestamp()
      });

      setMessages([...messages, {
        id: msgRef.id,
        text: messageText,
        senderType: 'ai',
        attachment: attachmentData,
        createdAt: new Date()
      }]);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Erro ao enviar mensagem.");
    } finally {
        setIsAiThinking(false);
    }
  };


  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex h-[calc(100vh-120px)] gap-6"
    >
      {/* Chat List */}
      <Card className="w-80 border-none shadow-sm overflow-hidden flex flex-col">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-lg">Suporte Humano</CardTitle>
          <CardDescription>Aguardando intervenção.</CardDescription>
        </CardHeader>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {tickets.filter(t => t.status === 'escalated').map(t => (
              <button 
                key={t.id}
                onClick={() => setSelectedTicket(t)}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                  selectedTicket?.id === t.id && "bg-zinc-100 dark:bg-zinc-800"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm truncate">{t.subject}</span>
                  <Badge variant="outline" className="text-[10px] h-4">Escalado</Badge>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">ID: {t.id?.slice(0, 8)}</p>
              </button>
            ))}
            {tickets.filter(t => t.status === 'escalated').length === 0 && (
              <div className="text-center py-10 text-zinc-400 text-sm italic">
                Nenhum ticket escalado no momento.
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat Window */}
      <Card className="flex-1 border-none shadow-sm overflow-hidden flex flex-col">
        {selectedTicket ? (
          <>
            <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <CardTitle className="text-lg">{selectedTicket.subject}</CardTitle>
                  <CardDescription>Cliente: {selectedTicket.customerId}</CardDescription>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                  <Bot size={14} className={selectedTicket.aiEnabled !== false ? "text-purple-600" : "text-zinc-400"} />
                  <span className="text-[10px] font-bold uppercase">IA {selectedTicket.aiEnabled !== false ? "Ativa" : "Pausada"}</span>
                  <button 
                    onClick={() => handleToggleAI(selectedTicket.id, selectedTicket.aiEnabled !== false)}
                    className="ml-2 text-[10px] text-primary hover:underline"
                  >
                    {selectedTicket.aiEnabled !== false ? "Pausar" : "Ativar"}
                  </button>
                </div>
              </div>
              {selectedTicket.status === 'resolved' ? (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/30 px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle2 size={16} />
                  <span className="font-medium">
                    Resolvido {selectedTicket.resolvedAt?.seconds ? `em ${new Date(selectedTicket.resolvedAt.seconds * 1000).toLocaleDateString('pt-BR')} às ${new Date(selectedTicket.resolvedAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 text-purple-600 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-400"
                    onClick={handleSummarizeTicket}
                    disabled={isSummarizingTicket || messages.length === 0}
                  >
                    {isSummarizingTicket ? (
                      <div className="h-4 w-4 rounded-full border-2 border-purple-600 border-t-transparent animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    Resumir Ticket
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => simulateAiChat(selectedTicket.id, "Olá, minha internet está lenta.")}
                  >
                    <User size={14} /> Simular Cliente
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => updateTicketStatusLocal(selectedTicket.id, 'resolved')}>
                    Finalizar Ticket
                  </Button>
                </div>
              )}
            </CardHeader>
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
                  <div key={m.id || i} className={cn(
                    "flex gap-3 max-w-[80%]",
                    m.senderType === 'human' ? "ml-auto flex-row-reverse" : m.senderType === 'system' ? "mx-auto w-full max-w-full justify-center" : ""
                  )}>
                    {m.senderType !== 'system' && (
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className={cn(
                          m.senderType === 'ai' ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" : 
                          m.senderType === 'human' ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "bg-zinc-100 dark:bg-zinc-800"
                        )}>
                          {m.senderType === 'ai' ? <Bot size={14} /> : m.senderType === 'human' ? <User size={14} /> : 'C'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={cn("flex flex-col gap-1", m.senderType === 'system' ? "w-full text-center items-center" : "")}>
                      {m.senderType === 'ai' && m.category && (
                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tight ml-1">
                          Agente {AGENT_CATEGORIES[m.category as keyof typeof AGENT_CATEGORIES] || m.category}
                        </span>
                      )}
                      <div className={cn("flex items-end gap-2", m.senderType === 'system' ? "justify-center w-full" : "")}>
                        <div className={cn(
                          "p-3 rounded-2xl text-sm space-y-2",
                          m.senderType === 'human' ? "bg-primary text-primary-foreground rounded-tr-none" : 
                          m.senderType === 'system' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-900/50 text-xs w-full max-w-md rounded-2xl text-center" :
                          "bg-zinc-100 dark:bg-zinc-800 rounded-tl-none"
                        )}>
                          {m.attachment && (
                            <div className="rounded-lg overflow-hidden border border-zinc-200/20">
                              {m.attachment.type.startsWith('image/') ? (
                                <img src={m.attachment.url} alt="Anexo" className="max-w-full h-auto" />
                              ) : m.attachment.type.startsWith('audio/') ? (
                                <audio controls className="w-full h-8" src={m.attachment.url} />
                              ) : (
                                <div className="p-2 flex items-center gap-2 bg-zinc-800/10">
                                  <Paperclip size={14} />
                                  <span className="text-xs truncate">Arquivo Anexo</span>
                                </div>
                              )}
                            </div>
                          )}
                          {m.text && <p>{m.text}</p>}
                        </div>
                        {m.senderType === 'ai' && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 10 }}
                            className="shrink-0"
                          >
                            <CheckCircle2 size={14} className="text-green-500 mb-1" />
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
              </div>
            </ScrollArea>
            <div className="p-4 border-t space-y-4">
              {/* Quick Actions (Astrum Logic) */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() => setNewMessage("Olá! Verifiquei aqui e sua fatura já está disponível. Posso te enviar o código PIX?")}
                >
                  <DollarSign size={12} /> Enviar Fatura
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() => setNewMessage("Vou realizar um reset remoto no seu sinal agora. Por favor, aguarde 2 minutos e teste novamente.")}
                >
                  <TrendingUp size={12} /> Reset de Sinal
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() => setNewMessage("Para resolver seu problema, precisamos agendar uma visita técnica. Qual o melhor horário para você?")}
                >
                  <Briefcase size={12} /> Agendar Visita
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-[10px] h-7 px-3 rounded-full gap-1 shrink-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() => setNewMessage("Temos uma oferta especial para você: Upgrade para 500 Mega por apenas R$10 a mais no seu plano atual. Aceita?")}
                >
                  <Plus size={12} /> Oferta Upgrade
                </Button>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    {selectedFile.type.startsWith('image/') ? <ImageIcon size={16} /> : <Paperclip size={16} />}
                    <span className="text-xs font-medium truncate max-w-[200px]">{selectedFile.file.name}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>Remover</Button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange}
                  accept="image/*,audio/*"
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={18} />
                </Button>
                <Input 
                  placeholder="Digite sua mensagem..." 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <Button type="submit" size="icon">
                  <Send size={18} />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-400">
            <MessageSquare size={48} className="mb-4 opacity-20" />
            <p>Selecione um ticket para iniciar o atendimento.</p>
          </div>
        )}
      </Card>

      {/* Customer Context Sidebar */}
      {selectedTicket && (
        <Card className="w-80 border-none shadow-sm overflow-hidden flex flex-col shrink-0 dark:bg-zinc-900">
          <CardHeader className="p-4 border-b dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <CardTitle className="text-sm">Contexto do Cliente</CardTitle>
            <CardDescription className="text-xs">Histórico e faturas recentes</CardDescription>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-6">
              {/* Customer Info Summary */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Dados do Cliente</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 dark:text-zinc-400">ID:</span>
                    <span className="font-mono text-xs">{selectedTicket.customerId?.slice(0, 8)}</span>
                  </div>
                  {customers.find(c => c.id === selectedTicket.customerId) && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 dark:text-zinc-400">Nome:</span>
                        <span className="font-medium">{customers.find(c => c.id === selectedTicket.customerId)?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500 dark:text-zinc-400">Status:</span>
                        <Badge variant={customers.find(c => c.id === selectedTicket.customerId)?.status === 'active' ? 'default' : 'destructive'} className="text-[10px]">
                          {customers.find(c => c.id === selectedTicket.customerId)?.status.toUpperCase()}
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Recent Invoices */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">Faturas Recentes</h4>
                <div className="space-y-3">
                  {invoices
                    .filter(i => i.customerId === selectedTicket.customerId)
                    .sort((a, b) => (b.dueDate?.seconds || 0) - (a.dueDate?.seconds || 0))
                    .slice(0, 5)
                    .map(inv => (
                      <div key={inv.id} className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm">R$ {inv.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <Badge variant={
                            inv.status === 'paid' ? 'default' : 
                            inv.status === 'overdue' ? 'destructive' : 'outline'
                          } className={cn(
                            "text-[10px]",
                            inv.status === 'paid' ? "bg-green-500 hover:bg-green-600" : ""
                          )}>
                            {inv.status === 'paid' ? 'PAGO' : inv.status === 'overdue' ? 'VENCIDA' : 'PENDENTE'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                          <span>Venc: {inv.dueDate?.seconds ? new Date(inv.dueDate.seconds * 1000).toLocaleDateString('pt-BR') : 'N/A'}</span>
                          <span className="font-mono text-[10px]">#{inv.id?.slice(0, 6)}</span>
                        </div>
                      </div>
                    ))}
                  {invoices.filter(i => i.customerId === selectedTicket.customerId).length === 0 && (
                    <div className="text-center py-4 text-zinc-400 text-xs italic border border-dashed rounded-lg">
                      Nenhuma fatura encontrada.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </Card>
      )}
    </motion.div>
  );
}
