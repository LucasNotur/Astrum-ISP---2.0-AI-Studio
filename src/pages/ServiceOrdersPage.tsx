import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bot, Smartphone, Briefcase, User, MapPin, Package, CheckCircle2, Camera, Calendar, MessageSquare, ArrowRight, X, Clock, PlayCircle, ListTodo } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { GlowButton } from '@/src/components/ui/glow-button';
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { toast } from "sonner";
import { useAppStore } from '@/src/store/useAppStore';
import { updateServiceOrder, updateTechnician, createServiceOrder, updateCustomer } from '@/src/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

const osStatusLabel: Record<string, string> = {
  pendente: 'Pendente', agendada: 'Agendada', em_deslocamento: 'Em deslocamento',
  em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada',
};

export function ServiceOrdersPage() {
  const { technicians, serviceOrders, customers, currentUserRole, userProfile, integrationKeys } = useAppStore();
  
  // Dialogs
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isWhatsappDialogOpen, setIsWhatsappDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isPhoneDialogOpen, setIsPhoneDialogOpen] = useState(false);
  const [pendingNotifyOS, setPendingNotifyOS] = useState<any>(null);
  const [pendingPhone, setPendingPhone] = useState('');
  const [selectedOS, setSelectedOS] = useState<any>(null);
  const [selectedCalendarOS, setSelectedCalendarOS] = useState<any>(null);
  const [selectedHistoryTech, setSelectedHistoryTech] = useState<any>(null);
  const [selectedHistoryOS, setSelectedHistoryOS] = useState<any>(null);
  const [expandedBoardOS, setExpandedBoardOS] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [whatsappSimulationLog, setWhatsappSimulationLog] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);

  const fetchIncidents = async () => {
    try {
      const res = await fetch('/api/incidents/active?tenantId=default');
      if (!res.ok) {
        setActiveIncidents([]);
        return;
      }
      const data = await res.json();
      setActiveIncidents(Array.isArray(data) ? data : []);
    } catch(e) {
      console.error(e);
      setActiveIncidents([]);
    }
  };

  React.useEffect(() => {
    fetchIncidents();
  }, []);

  const handleResolveIncident = async (id: string) => {
    try {
      const toastId = toast.loading("Resolvendo...");
      await fetch(`/api/incidents/${id}/resolve`, { method: 'PUT' });
      toast.success("Incidente resolvido", { id: toastId });
      fetchIncidents();
    } catch(e) {
      toast.error("Erro ao resolver");
    }
  };

  // Forms
  const [finishData, setFinishData] = useState({ macAddress: '', cableUsed: '', signal: '' });
  const [scheduleData, setScheduleData] = useState({ date: '', time: '', type: 'instalacao', techId: 'any', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate Pipelines
  const pipelines = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Agendamentos (Futuros ou Sem Despacho - para dias seguintes)
    const scheduledOS = serviceOrders.filter(os => 
      os.status === 'pendente' && (!os.scheduledDate || os.scheduledDate > todayStr)
    );

    // 2. Tarefas de Hoje (Agendado para hoje ou em execução)
    const todayTasks = serviceOrders.filter(os => 
      os.status !== 'concluida' && (
        (os.status === 'pendente' && os.scheduledDate && os.scheduledDate <= todayStr) ||
        os.status === 'em_deslocamento' || 
        os.status === 'em_andamento' ||
        os.status === 'agendada' // Also include 'agendada'
      )
    ).sort((a, b) => {
      // Ordenação padrão: por route_sequence (se existir), depois horário
      if (a.route_sequence && !b.route_sequence) return -1;
      if (!a.route_sequence && b.route_sequence) return 1;
      if (a.route_sequence && b.route_sequence) return a.route_sequence - b.route_sequence;
      const timeA = a.scheduledTime || '23:59';
      const timeB = b.scheduledTime || '23:59';
      return timeA.localeCompare(timeB);
    });

    // 3. Concluídas Recentes
    const completedOS = serviceOrders.filter(os => os.status === 'concluida').slice(0, 15);

    return [
      { id: 'scheduled', title: 'Agendados', desc: 'Futuro e Sem data', data: scheduledOS },
      { id: 'today', title: 'Tarefas de Hoje', desc: 'Em campo / Deslocamento', data: todayTasks },
      { id: 'completed', title: 'Concluídas Recentes', desc: 'Registro da Semana', data: completedOS }
    ];
  }, [serviceOrders]);

  const checkTechAvailability = (techName: string, date: string, time: string) => {
    const proposedStart = new Date(`${date}T${time}:00`).getTime();
    const TASK_DURATION_MS = 90 * 60 * 1000;
    const proposedEnd = proposedStart + TASK_DURATION_MS;
    
    const workStart = new Date(`${date}T08:00:00`).getTime();
    const workEnd = new Date(`${date}T18:00:00`).getTime();
    const lunchStart = new Date(`${date}T12:00:00`).getTime();
    const lunchEnd = new Date(`${date}T13:00:00`).getTime();

    if (proposedStart < workStart || proposedEnd > workEnd) {
        return { available: false, reason: "A tarefa (1h30m) excede o horário comercial (08:00 às 18:00)." };
    }

    if (proposedStart < lunchEnd && proposedEnd > lunchStart) {
        return { available: false, reason: "A tarefa sobrepõe o horário de almoço (12:00 às 13:00)." };
    }

    const techOS = serviceOrders.filter(os => 
        os.assignedTo === techName &&
        os.scheduledDate === date &&
        os.status !== 'concluida' &&
        os.status !== 'cancelada'
    );

    for (const existingOS of techOS) {
        if (existingOS.scheduledTime) {
            const existingStart = new Date(`${date}T${existingOS.scheduledTime}:00`).getTime();
            const existingEnd = existingStart + TASK_DURATION_MS;
            
            if (proposedStart < existingEnd && proposedEnd > existingStart) {
                return { available: false, reason: `Conflito com outra O.S. agendada para ${existingOS.scheduledTime} (duração média 1h30m).` };
            }
        }
    }

    return { available: true, reason: "" };
  };

  const handleCreateOSAndSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Schedule Validation
    if (scheduleData.techId !== 'any') {
       const selectedTech = technicians.find(t => t.id === scheduleData.techId);
       if (selectedTech) {
         const availability = checkTechAvailability(selectedTech.name, scheduleData.date, scheduleData.time);
         if (!availability.available) {
             toast.error(availability.reason);
             return;
         }
       }
    }

    setIsSubmitting(true);
    
    try {
      let selectedTechName = 'A Definir';
      
      if (scheduleData.techId !== 'any') {
         selectedTechName = technicians.find(t => t.id === scheduleData.techId)?.name || 'A Definir';
      } else {
         // Auto-Assign Smart Logic
         for (const t of technicians) {
             const availability = checkTechAvailability(t.name, scheduleData.date, scheduleData.time);
             if (availability.available) {
                 selectedTechName = t.name;
                 break;
             }
         }
         
         if (selectedTechName === 'A Definir') {
             toast.error("Nenhum técnico disponível neste horário (conflito de agenda ou turno).");
             setIsSubmitting(false);
             return;
         }
      }

      await createServiceOrder({
        customerId: selectedCustomer?.id || 'S/N',
        customerName: selectedCustomer?.name || 'Nova Solicitação Avulsa',
        address: selectedCustomer?.address || 'Rodovia KM 20 - Poste 4',
        type: scheduleData.type,
        status: 'pendente',
        scheduledDate: scheduleData.date,
        scheduledTime: scheduleData.time,
        assignedTo: selectedTechName,
        aiSummary: `Triagem sistêmica: ${scheduleData.type === 'instalacao' ? 'Nova Instalação' : 'Averiguação Física'}. Enviado do App.`,
        cto: 'A avaliar',
        port: 'A avaliar',
        description: scheduleData.description,
        materials: scheduleData.type === 'instalacao' ? ['ONU Wi-Fi', 'Drop 1FO', 'Fixadores', 'Conectores APC'] : ['Cabo Drop', 'Conectores']
      });

      toast.success("Ordem de Serviço criada e lançada no CRM do Técnico.");
      setIsScheduleDialogOpen(false);
    } catch (err) {
      toast.error("Erro ao criar OS.");
    } finally {
      setIsSubmitting(false);
      setSelectedCustomer(null);
    }
  };

  const handleFinishOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOS) return;
    setIsSubmitting(true);
    try {
      await updateServiceOrder(selectedOS.id, {
        status: 'concluida',
        executionDetails: finishData,
        completedAt: new Date().toISOString(),
        updaterName: selectedOS.assignedTo || 'Sistema'
      });
      
      // Update customer to active when OS is done
      if (selectedOS.customerId && selectedOS.type === 'instalacao') {
         await updateCustomer(selectedOS.customerId, { status: 'active' });
      }

      toast.success("Instalação concluída! Cliente agora está ATIVO e equipamento provisionado.");
      
      // Log whatsapp msg
      if(selectedOS.assignedTo !== 'A Definir') {
        const msg = `✅ [Sistema]: Parabéns, instalação do cliente ${selectedOS.customerName} finalizada com sinal ${finishData.signal}dBm. Equipamento provisionado via White-Label.`;
        addWhatsAppSimulation(selectedOS.assignedTo, msg);
      }

      setIsFinishDialogOpen(false);
      setFinishData({ macAddress: '', cableUsed: '', signal: '' });
    } catch (err) {
      toast.error("Erro ao concluir OS.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const dispatchToWhatsApp = async (os: any) => {
    const tech = technicians.find(t => t.name === os.assignedTo && t.status === 'available');
    if (!tech && os.assignedTo !== 'A Definir') {
       toast.error(`O técnico ${os.assignedTo} não está online/disponível no momento.`);
       return;
    }
    
    let techName = os.assignedTo;
    if (techName === 'A Definir') {
       const availableTechs = technicians.filter(t => t.status === 'available');
       if (availableTechs.length === 0) {
         toast.error("Nenhum técnico online para receber a OS.");
         return;
       }

       const dateToCheck = os.scheduledDate || new Date().toISOString().split('T')[0];
       const timeToCheck = os.scheduledTime || `${new Date().getHours().toString().padStart(2, '0')}:00`;
       
       let foundTech = null;
       for (const t of availableTechs) {
           const avail = checkTechAvailability(t.name, dateToCheck, timeToCheck);
           if (avail.available) {
               foundTech = t.name;
               break;
           }
       }
       
       if (!foundTech) {
           toast.error("Técnicos online estão com conflito de agenda ou em horário de almoço.");
           return;
       }
       techName = foundTech;
       await updateServiceOrder(os.id, {
         assignedTo: techName
       });
       toast.info(`OS atribuída automaticamente para ${techName}.`);
    }

    try {
      await updateServiceOrder(os.id, { 
        status: 'em_deslocamento',
        updaterName: techName 
      });
      
      const whatsappMsg = `🔔 *NOVA ORDEM DE SERVIÇO*\n\n*Cliente:* ${os.customerName}\n*Endereço:* ${os.address}\n*Tipo:* ${os.type}\n*Agendado para:* ${os.scheduledDate || 'Hoje'} às ${os.scheduledTime || 'ASAP'}\n\n*Resumo:* ${os.aiSummary}\n\n📍 Clique para Rota no Maps: https://www.google.com/maps/dir/?api=1&destination=${os.lat && os.lng ? `${os.lat},${os.lng}` : encodeURIComponent(os.address)}\n\n_Botão p/ Iniciar Deslocamento (Simulado)_`;
      
      addWhatsAppSimulation(techName, whatsappMsg);
      toast.success(`Mensagem com os detalhes enviada para o WhatsApp do ${techName}.`);
      setIsWhatsappDialogOpen(true);
    } catch (e) {
      toast.error("Erro ao despachar no WhatsApp.");
    }
  };

  const addWhatsAppSimulation = (techName: string, text: string) => {
     setWhatsappSimulationLog(prev => [{
       id: Math.random(),
       tech: techName,
       text,
       time: new Date().toLocaleTimeString(),
       isTech: false
     }, ...prev]);
  };

  const handleStartOS = async (os: any) => {
    try {
      await updateServiceOrder(os.id, {
         status: 'em_andamento',
         startedAt: new Date().toISOString(),
         updaterName: os.assignedTo || 'Sistema'
      });
      toast.success("Serviço iniciado! O tempo está contando.");
    } catch(err) {
      toast.error("Erro ao iniciar serviço.");
    }
  };

  const handleNotifyCustomer = async (os: any) => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionInstance || !integrationKeys.evolutionApiKey) {
      toast.error("Integração com Evolution API não configurada em Configurações > Integrações.");
      return;
    }
    const customer = customers.find(c => c.id === os.customerId);
    if (customer?.phone) {
      await doNotifyCustomer(os, customer.phone);
    } else {
      setPendingNotifyOS(os);
      setPendingPhone('');
      setIsPhoneDialogOpen(true);
    }
  };

  const doNotifyCustomer = async (os: any, rawPhone: string) => {
    let customerPhone = rawPhone.replace(/\D/g, '');
    if (customerPhone.length < 10) { toast.error("Número inválido."); return; }
    if (!customerPhone.startsWith('55')) customerPhone = '55' + customerPhone;

    const msg = `Olá, *${os.customerName}*! 🔔\n\nSua ordem de serviço de *${os.type}* está com status: *${os.status.replace('_', ' ')}*.\nO técnico responsável é: *${os.assignedTo || 'A Definir'}*.\n\nQualquer dúvida, estamos à disposição!`;
    const loadingToast = toast.loading("Enviando notificação via Evolution API...");
    try {
      const res = await fetch(`/api/evolution/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `/message/sendText/${integrationKeys.evolutionInstance}`,
          method: 'POST',
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
          body: { number: customerPhone, options: { delay: 1200, presence: "composing" }, textMessage: { text: msg } }
        })
      });
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Notificação enviada ao cliente via WhatsApp (Evolution API)!");
        addWhatsAppSimulation('Você para Cliente', msg);
        setIsWhatsappDialogOpen(true);
      } else {
        const data = await res.json();
        toast.error(`Falha Evolution API: ${data?.message || 'Erro desconhecido'}`);
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Erro ao conectar com Evolution API.");
    }
  };

  return (
    <motion.div 
      key="os-funnel"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-4 h-full flex flex-col"
    >
      {/* D-008 — hero da seção: eyebrow + título display + ações */}
      <header className="flex flex-col md:flex-row md:items-end justify-between shrink-0 mb-2 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Briefcase size={13} strokeWidth={1.75} />
            Campo · <span className="font-mono text-foreground">{serviceOrders.filter(os => os.status !== 'concluida' && os.status !== 'cancelada').length}</span> OS em aberto
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
            Ordens de Serviço
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Button variant="outline" className="gap-2 rounded-full" onClick={() => setIsWhatsappDialogOpen(true)}>
            <Smartphone size={16} strokeWidth={1.75} className="text-astrum-signal" />
            <span className="hidden md:inline">Simulador WhatsApp</span>
          </Button>
          {/* D-011 — glow CTA: a ação de criação da tela */}
          <GlowButton icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => { setSelectedCustomer(null); setIsScheduleDialogOpen(true); }}>
            Nova OS
          </GlowButton>
        </div>
      </header>

      <Tabs defaultValue={currentUserRole === 'tecnico' ? "calendar" : "board"} className="flex flex-col flex-1 h-full overflow-hidden">
        <TabsList className="w-fit mb-4 flex overflow-x-auto min-h-[44px] bg-secondary/60 border border-border rounded-full p-1 gap-0.5">
          <TabsTrigger value="board" className="gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">
            <Briefcase size={15} strokeWidth={1.75} /> Quadro (CRM)
          </TabsTrigger>
          <TabsTrigger value="scheduler" className="gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">
            <Calendar size={15} strokeWidth={1.75} /> Despacho
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">
            <Calendar size={15} strokeWidth={1.75} /> Minha agenda
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">
            <User size={15} strokeWidth={1.75} /> Histórico
          </TabsTrigger>
          <TabsTrigger value="incidents" className="gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">
            <Bot size={15} strokeWidth={1.75} /> Incidentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden pb-4 mt-0 data-[state=active]:flex">
          <div className="flex flex-col md:flex-row gap-4 md:min-w-max md:h-[calc(100vh-230px)] pt-2">
          {pipelines.map(column => (
            <div key={column.id} className="flex flex-col w-full md:w-[340px] bg-secondary/30 rounded-stable-xl border border-border p-3 md:h-full md:overflow-hidden min-h-[min-content] md:min-h-0">
              <div className="mb-4 px-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    {column.id === 'new_tasks' && <User size={15} strokeWidth={1.75} className="text-astrum-fiber" />}
                    {column.id === 'scheduled' && <Calendar size={15} strokeWidth={1.75} className="text-astrum-amber" />}
                    {column.id === 'today' && <Smartphone size={15} strokeWidth={1.75} className="text-astrum-signal" />}
                    {column.id === 'completed' && <CheckCircle2 size={15} strokeWidth={1.75} className="text-astrum-slate" />}
                    {column.title}
                  </h3>
                  <Badge variant="secondary" className="bg-card border border-border rounded-md font-mono text-xs">{column.data.length}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{column.desc}</p>
              </div>
              <ScrollArea className="flex-1 -mx-2 px-2 scrollbar-hide">
                <div className="space-y-4 pb-10">
                  {column.data.map(item => (
                       <Card key={item.id} className="border-none shadow-2 hover:scale-[1.02] transition-transform duration-base cursor-pointer group relative bg-card rounded-stable-xl overflow-hidden ticket-shape">
                           <div className="absolute top-0 bottom-0 left-6 border-l border-dashed border-foreground/10" />
                           <CardContent className="p-4 pl-8 relative z-10">
                               <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <div className="flex flex-col items-start gap-1">
                                   <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      item.status === 'pendente' && !item.scheduledDate ? 'bg-astrum-slate/20 text-astrum-slate' :
                                      item.status === 'pendente' ? 'bg-astrum-amber/15 text-astrum-amber' :
                                      item.status === 'em_deslocamento' ? 'bg-astrum-fiber/15 text-astrum-fiber' :
                                      item.status === 'em_andamento' ? 'bg-astrum-lemon/15 text-astrum-lemon' :
                                      item.status === 'agendada' ? 'bg-astrum-signal/15 text-astrum-signal' :
                                      'bg-astrum-signal/15 text-astrum-signal'
                                   }`}>
                                     {(osStatusLabel[item.status] || item.status.replace('_', ' '))} {item.scheduledDate ? `· ${item.scheduledDate}` : ''}
                                   </span>
                                   {item.route_sequence && (
                                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium bg-secondary/60 text-muted-foreground border border-border">
                                         <MapPin size={8} /> Rota #{item.route_sequence} {item.route_region && `(CEP ${item.route_region})`}
                                      </span>
                                   )}
                                 </div>
                                 <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-2 py-1 rounded-md">#{item.id.slice(0, 5)}</span>
                               </div>

                               <div className="cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <h4 className="font-semibold tracking-tight text-sm mb-1">{item.customerName}</h4>
                                 <p className="text-[11px] text-muted-foreground mb-1 line-clamp-1 flex items-center gap-1">
                                   <MapPin size={10}/> {item.address}
                                 </p>
                                 {item.description && expandedBoardOS !== item.id && (
                                   <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">
                                     {item.description}
                                   </p>
                                 )}
                               </div>

                               <div className="flex items-center gap-2 mb-3 bg-secondary/50 p-1.5 rounded-stable-sm cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <User size={12} className="text-muted-foreground"/>
                                 <span className="text-[11px] font-medium">Téc: {item.assignedTo || 'A Definir'}</span>
                               </div>

                               {expandedBoardOS === item.id && (
                                 <div className="mt-2 mb-3 pt-3 border-t border-foreground/10 space-y-3 animate-in slide-in-from-top-2 fade-in">
                                    {(item.status === 'pendente' && (!item.assignedTo || item.assignedTo === 'A Definir')) && (
                                      <div>
                                        <h5 className="text-[10px] font-semibold text-muted-foreground mb-1">Despacho manual</h5>
                                        <div className="flex gap-2">
                                          <Select onValueChange={async (val) => {
                                             toast.success(`OS Atribuída a ${val}`);
                                             await updateServiceOrder(item.id, {
                                                assignedTo: val,
                                                assigned_at: new Date().toISOString(),
                                                status: 'agendada'
                                             });
                                          }}>
                                            <SelectTrigger className="h-8 text-xs bg-input/60 border-border rounded-stable-sm flex-1">
                                              <SelectValue placeholder="Selecionar Técnico..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {technicians?.filter(t => t.active !== false).map(t => (
                                                <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    )}
                                    {item.description && (
                                      <div>
                                        <h5 className="text-[10px] font-semibold text-muted-foreground mb-1">Descrição detalhada</h5>
                                        <p className="text-[11px] bg-secondary/50 p-2 rounded-stable-sm whitespace-pre-wrap">{item.description}</p>
                                      </div>
                                    )}
                                    {item.aiSummary && (
                                      <div>
                                        <h5 className="text-[10px] font-semibold text-astrum-lemon mb-1 flex items-center gap-1"><Bot size={10}/> Resumo IA</h5>
                                        <p className="text-[11px] bg-astrum-lemon/10 p-2 rounded-stable-sm">{item.aiSummary}</p>
                                      </div>
                                    )}
                                    {item.materials && item.materials.length > 0 && (
                                      <div>
                                        <h5 className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Package size={10}/> Materiais previstos</h5>
                                        <div className="flex flex-wrap gap-1">
                                          {item.materials.map((m: any, i: number) => (
                                            <span key={i} className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium bg-secondary/60 text-muted-foreground">{m}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex flex-col gap-2 pt-2">
                                       {/* D-003 — CTA principal branco invertido, pill */}
                                       {(item.status === 'pendente' || item.status === 'em_deslocamento' || item.status === 'em_andamento') && (
                                          <Button
                                            className="w-full h-12 text-sm font-semibold rounded-full shadow-2"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (item.status === 'pendente') {
                                                // mock transition
                                                toast.success('Iniciando deslocamento...');
                                              } else {
                                                setSelectedOS(item);
                                                setIsFinishDialogOpen(true);
                                              }
                                            }}
                                          >
                                            {item.status === 'pendente' ? (
                                              <><MapPin size={16} strokeWidth={1.75} className="mr-2" /> Iniciar deslocamento</>
                                            ) : (
                                              <><CheckCircle2 size={16} strokeWidth={1.75} className="mr-2" /> Finalizar OS</>
                                            )}
                                          </Button>
                                       )}

                                       <div className="grid grid-cols-2 gap-2 mt-2">
                                         <Button variant="outline" size="sm" className="w-full text-[11px] h-8 gap-1 rounded-full bg-secondary/50 border-border" onClick={(e) => { e.stopPropagation(); setSelectedHistoryOS(item); setIsHistoryDialogOpen(true); }}>
                                           <Calendar size={12} strokeWidth={1.75} /> Histórico
                                         </Button>
                                         <Button variant="outline" size="sm" className="w-full text-[11px] h-8 gap-1 rounded-full bg-secondary/50 border-border" asChild>
                                           <a href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat && item.lng ? `${item.lat},${item.lng}` : encodeURIComponent(item.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                             <MapPin size={12} strokeWidth={1.75} /> Rota
                                           </a>
                                         </Button>
                                       </div>
                                       <Button variant="secondary" size="sm" className="w-full text-[11px] h-8 gap-1 rounded-full hover:bg-astrum-signal/10 hover:text-astrum-signal transition-colors duration-fast mt-1" onClick={(e) => { e.stopPropagation(); handleNotifyCustomer(item); }}>
                                         <MessageSquare size={12} strokeWidth={1.75} /> Avisar cliente
                                       </Button>
                                    </div>
                                 </div>
                               )}

                               {column.id === 'completed' && (
                                 <div className="text-[11px] text-astrum-signal flex items-center justify-center gap-1 bg-astrum-signal/10 py-1.5 rounded-stable-sm font-medium">
                                    <CheckCircle2 size={13} strokeWidth={1.75} /> Concluído e sincronizado
                                 </div>
                               )}
                            </CardContent>
                       </Card>
                    ))}
                    {column.data.length === 0 && (
                       <div className="text-center p-6 border border-dashed border-border rounded-stable-lg text-muted-foreground text-xs mt-4">
                          Nenhum registro.
                       </div>
                    )}
                 </div>
              </ScrollArea>
            </div>
          ))}
        </div>
        </TabsContent>

        {/* -- SCHEDULER MATRIX VIEW CONTENT -- */}
        <TabsContent value="scheduler" className="flex-1 overflow-hidden mt-0 flex flex-col h-full pb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 shrink-0">
             <div>
                <p className="text-xs text-muted-foreground">Operação · matriz técnico × horário</p>
                <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Painel de despacho</h3>
             </div>

             {/* Date Selector Mini */}
             <div className="flex items-center gap-1 bg-secondary/60 border border-border p-1 rounded-full mt-2 md:mt-0">
                <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => {
                   const d = new Date(selectedDate);
                   d.setDate(d.getDate() - 1);
                   setSelectedDate(d.toISOString().split('T')[0]);
                }}>&lt;</Button>
                <div className="text-sm font-mono font-semibold w-24 text-center">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
                <Button variant="ghost" size="sm" className="h-8 rounded-full" onClick={() => {
                   const d = new Date(selectedDate);
                   d.setDate(d.getDate() + 1);
                   setSelectedDate(d.toISOString().split('T')[0]);
                }}>&gt;</Button>

                <Button variant="outline" size="sm" className="ml-1 h-8 text-xs rounded-full" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>
                   Hoje
                </Button>
             </div>
          </div>

          <div className="flex-1 bg-card border border-border rounded-stable-xl overflow-hidden shadow-1 flex flex-col h-full relative">
            <ScrollArea className="flex-1 relative">
               <div className="min-w-max pb-10">
                 {/* Header Row (Technicians) */}
                 <div className="flex border-b border-border sticky top-0 bg-secondary/40 backdrop-blur z-20">
                    <div className="w-20 shrink-0 border-r border-border p-3 flex flex-col justify-end text-[10px] font-medium text-muted-foreground text-right">
                       Horário
                    </div>
                    {technicians.filter(t => t.active !== false).map(tech => (
                       <div key={tech.id} className="w-64 shrink-0 border-r border-border p-3 flex flex-col gap-1 items-center justify-center">
                          <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center text-muted-foreground mb-1">
                            <User size={14} strokeWidth={1.75} />
                          </div>
                          <span className="font-semibold text-xs truncate max-w-full">{tech.name}</span>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${tech.status === 'available' ? 'bg-astrum-signal/15 text-astrum-signal' : 'bg-astrum-slate/20 text-astrum-slate'}`}>
                            {tech.status === 'available' ? 'Online' : 'Offline'}
                          </span>
                       </div>
                    ))}
                 </div>

                 {/* Matrix Body */}
                 <div className="relative">
                    {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(hour => (
                       <div key={hour} className="flex border-b border-border/60 group relative">
                          <div className="w-20 shrink-0 border-r border-border bg-secondary/40 p-2 text-xs font-mono font-medium text-muted-foreground text-right flex items-center justify-end sticky left-0 z-10 transition-colors duration-fast group-hover:bg-secondary/70">
                             {hour}
                          </div>
                          
                          {technicians.filter(t => t.active !== false).map(tech => {
                             // Find OS for this technician at this specific hour block (matching HH: prefix)
                             const hourPrefix = hour.split(':')[0];
                             const cellOrders = serviceOrders.filter(os => 
                                os.assignedTo === tech.name && 
                                os.scheduledDate === selectedDate && 
                                os.scheduledTime?.startsWith(hourPrefix) &&
                                os.status !== 'cancelada'
                             );

                             return (
                               <div key={`${tech.id}-${hour}`} className="w-64 shrink-0 border-r border-border/60 p-2 min-h-[90px] hover:bg-foreground/[0.03] transition-colors duration-fast relative cursor-pointer" onClick={() => { setScheduleData(prev => ({...prev, date: selectedDate, time: hour, techId: tech.id})); setIsScheduleDialogOpen(true); }}>
                                  <div className="flex flex-col gap-2">
                                     {cellOrders.length === 0 && (
                                       <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-fast">
                                          <div className="bg-primary text-primary-foreground text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2"><Plus size={12}/> Agendar</div>
                                       </div>
                                     )}
                                     {cellOrders.map(os => (
                                        <div key={os.id} onClick={(e) => { e.stopPropagation(); setSelectedCalendarOS(os); }} className={`relative z-10 rounded-stable-sm border p-2 text-left cursor-pointer transition-transform duration-fast hover:scale-[1.02] ${
                                           os.status === 'concluida' ? 'bg-astrum-signal/10 border-astrum-signal/30' :
                                           os.status === 'em_andamento' ? 'bg-astrum-lemon/10 border-astrum-lemon/30' :
                                           os.status === 'em_deslocamento' ? 'bg-astrum-fiber/10 border-astrum-fiber/30' :
                                           'bg-astrum-amber/10 border-astrum-amber/30'
                                        }`}>
                                           <div className={`text-[9px] font-semibold mb-1 font-mono ${
                                              os.status === 'concluida' ? 'text-astrum-signal' :
                                              os.status === 'em_andamento' ? 'text-astrum-lemon' :
                                              os.status === 'em_deslocamento' ? 'text-astrum-fiber' :
                                              'text-astrum-amber'
                                           }`}>
                                             {os.scheduledTime} · {osStatusLabel[os.status] || os.status.replace('_', ' ')}
                                           </div>
                                           <div className="text-[11px] font-semibold truncate">{os.customerName}</div>
                                           <div className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5 mt-0.5"><MapPin size={9}/> {os.address}</div>
                                        </div>
                                     ))}
                                  </div>
                               </div>
                             );
                          })}
                       </div>
                    ))}
                 </div>
               </div>
            </ScrollArea>
            
            {/* Legend Footer */}
            <div className="bg-secondary/40 border-t border-border p-2 flex items-center gap-4 px-4 overflow-x-auto text-[10px] shrink-0 font-medium text-muted-foreground">
               <span className="font-semibold mr-2">Legenda:</span>
               <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-astrum-amber"></div> Pendente</div>
               <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-astrum-fiber"></div> Deslocamento</div>
               <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-astrum-lemon"></div> Em andamento</div>
               <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-astrum-signal"></div> Concluída</div>
            </div>
          </div>
        </TabsContent>

        {/* -- CALENDAR VIEW CONTENT -- */}
        <TabsContent value="calendar" className="flex-1 overflow-y-auto mt-0 pb-10">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Campo · {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">Agenda do técnico</h3>
              </div>
              <span className="mt-2 md:mt-0 w-fit inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-secondary/60 border border-border text-muted-foreground">
                <span className="font-mono text-foreground mr-1">{serviceOrders.filter(os => os.scheduledDate === selectedDate || (os.status === 'em_deslocamento' || os.status === 'em_andamento')).length}</span> tarefas na data
              </span>
            </div>

            {/* Date Selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-hide">
              {Array.from({ length: 14 }).map((_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - 3 + i);
                const dateStr = date.toISOString().split('T')[0];
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === new Date().toISOString().split('T')[0];

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center justify-center min-w-[64px] h-[72px] rounded-stable-xl border transition-colors duration-fast ${
                      isSelected
                        ? 'border-transparent bg-primary text-primary-foreground shadow-2'
                        : isToday
                        ? 'border-astrum-lemon/40 bg-astrum-lemon/10 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                    }`}
                  >
                    <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-lg font-semibold font-mono mt-0.5">
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              {serviceOrders
                .filter(os => os.scheduledDate === selectedDate || 
                              ((selectedDate === new Date().toISOString().split('T')[0]) && (os.status === 'em_deslocamento' || os.status === 'em_andamento')))
                .sort((a,b) => (a.scheduledTime || '23:59').localeCompare(b.scheduledTime || '23:59'))
                .map((os, i) => {
                  const isExpanded = selectedCalendarOS?.id === os.id;
                  
                  return (
                    /* D-012 — spotlight P&B: a OS expandida vira card branco puro sobre o fundo escuro */
                    <Card key={os.id} className={`transition-colors duration-base overflow-hidden ticket-shape relative ${isExpanded ? 'border-none bg-primary text-primary-foreground shadow-2' : 'border border-border bg-card shadow-1 hover:bg-secondary/30'}`}>
                      <div className={`absolute top-0 bottom-0 left-[120px] md:left-[108px] border-l border-dashed z-0 ${isExpanded ? 'border-primary-foreground/10' : 'border-foreground/10'}`} />
                      {/* HEADER COMPACT (ALWAYS VISIBLE) */}
                      <div
                        className="p-4 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer relative z-10"
                        onClick={() => setSelectedCalendarOS(isExpanded ? null : os)}
                      >
                        {/* Time indicator */}
                        <div className={`flex flex-row md:flex-col items-center justify-center p-2 md:p-3 rounded-stable-lg border min-w-[80px] shrink-0 text-center ${isExpanded ? 'bg-primary-foreground/5 border-primary-foreground/10' : 'bg-secondary/50 border-border'}`}>
                          <Clock size={16} strokeWidth={1.75} className={`md:mb-1 mr-2 md:mr-0 ${isExpanded ? 'text-primary-foreground/50' : 'text-muted-foreground'}`} />
                          <span className="font-semibold font-mono text-sm">{os.scheduledTime || 'ASAP'}</span>
                        </div>

                        {/* Summary Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${isExpanded ? 'bg-primary-foreground/10' : 'bg-secondary/60 text-muted-foreground'}`}>{os.type}</span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              os.status === 'concluida' ? 'bg-astrum-signal/15 text-astrum-signal' :
                              os.status === 'em_andamento' ? (isExpanded ? 'bg-astrum-amber/15 text-astrum-amber' : 'bg-astrum-lemon/15 text-astrum-lemon') :
                              os.status === 'em_deslocamento' ? 'bg-astrum-fiber/15 text-astrum-fiber' :
                              'bg-astrum-amber/15 text-astrum-amber'
                            }`}>
                              {osStatusLabel[os.status] || os.status.replace('_', ' ')}
                            </span>
                          </div>
                          <h4 className="font-semibold text-base mb-0.5">{os.customerName}</h4>
                          <p className={`text-sm flex items-center gap-1.5 line-clamp-1 ${isExpanded ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}><MapPin size={14} strokeWidth={1.75}/> {os.address}</p>
                        </div>

                        {/* Status Icon Indicator */}
                        <div className="shrink-0 flex items-center justify-end">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isExpanded ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                              <ArrowRight className={`w-4 h-4 transition-transform duration-base ${isExpanded ? 'rotate-90' : ''}`} />
                           </div>
                        </div>
                      </div>

                      {/* EXPANDED CONTENT DETAILS */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 fade-in relative z-10">
                          <div className="border-t border-primary-foreground/10 pt-4 flex flex-col md:flex-row gap-6">

                             <div className="flex-1 space-y-4">
                               {/* Description — chave-valor sóbrio sobre o spotlight */}
                               <div>
                                 <h5 className="text-xs font-semibold text-primary-foreground/50 mb-1.5 flex items-center gap-1.5"><ListTodo size={14} strokeWidth={1.75} /> Detalhes da tarefa</h5>
                                 <p className="text-sm bg-primary-foreground/5 p-3 rounded-stable-lg whitespace-pre-wrap border border-primary-foreground/10">
                                   {os.description || 'Nenhuma descrição fornecida para esta tarefa.'}
                                 </p>
                               </div>

                               {/* AI Summary */}
                               {os.aiSummary && (
                                 <div>
                                    <h5 className="text-xs font-semibold text-astrum-fiber mb-1.5 flex items-center gap-1.5"><Bot size={14} strokeWidth={1.75} /> Resumo gerado por IA</h5>
                                    <p className="text-sm bg-astrum-fiber/10 p-3 rounded-stable-lg border border-astrum-fiber/20">
                                      {os.aiSummary}
                                    </p>
                                 </div>
                               )}

                               {/* Materials */}
                               {(os.materials && os.materials.length > 0) ? (
                                 <div>
                                   <h5 className="text-xs font-semibold text-primary-foreground/50 mb-1.5 flex items-center gap-1.5"><Package size={14} strokeWidth={1.75}/> Materiais previstos</h5>
                                   <div className="flex flex-wrap gap-2">
                                     {os.materials.map((m: any, idx: number) => (
                                       <span key={idx} className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-primary-foreground/5 border border-primary-foreground/10">
                                         {m}
                                       </span>
                                     ))}
                                   </div>
                                 </div>
                               ) : (
                                  <div>
                                    <h5 className="text-xs font-semibold text-primary-foreground/50 mb-1.5 flex items-center gap-1.5"><Package size={14} strokeWidth={1.75}/> Materiais previstos</h5>
                                    <p className="text-xs text-primary-foreground/60 bg-primary-foreground/5 p-2 rounded-stable-lg border border-primary-foreground/10 border-dashed inline-block">Nenhum material associado a esta ordem.</p>
                                  </div>
                               )}

                               {/* Actions — CTA invertido dentro do spotlight (pill escuro sobre branco) */}
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                  {os.status === 'pendente' && (
                                     <Button className="w-full font-semibold rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={(e) => { e.stopPropagation(); handleStartOS(os); }}>
                                       <PlayCircle size={16} strokeWidth={1.75} className="mr-2" /> Iniciar serviço agora
                                     </Button>
                                  )}
                                  {(os.status === 'em_andamento' || os.status === 'em_deslocamento') && (
                                     <Button className="w-full font-semibold rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={(e) => { e.stopPropagation(); setSelectedOS(os); setIsFinishDialogOpen(true); }}>
                                       <CheckCircle2 size={16} strokeWidth={1.75} className="mr-2" /> Finalizar OS
                                     </Button>
                                  )}

                                  <Button variant="outline" className="w-full font-medium rounded-full border-primary-foreground/15 bg-transparent text-primary-foreground hover:bg-primary-foreground/5 hover:text-primary-foreground" onClick={(e) => { e.stopPropagation(); setSelectedHistoryOS(os); setIsHistoryDialogOpen(true); }}>
                                    <Calendar size={16} strokeWidth={1.75} className="mr-2" /> Histórico de status
                                  </Button>
                               </div>
                             </div>

                             {/* Side panel Map integration */}
                             <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
                               <div className="bg-primary-foreground/5 rounded-stable-lg overflow-hidden relative flex flex-col h-40 border border-primary-foreground/10">
                                  <div className="absolute inset-0 opacity-10 pointer-events-none bg-[size:24px_24px] bg-[radial-gradient(circle,currentColor_1px,transparent_1px)]"></div>
                                  <div className="flex-1 flex items-center justify-center relative z-10 p-4">
                                     <div className="w-16 h-16 bg-astrum-fiber/20 rounded-full flex items-center justify-center absolute animate-ping motion-reduce:animate-none"></div>
                                     <MapPin size={28} strokeWidth={1.75} className="text-astrum-fiber absolute drop-shadow-md" />
                                  </div>
                               </div>
                               <Button variant="outline" className="w-full gap-2 rounded-full border-primary-foreground/15 bg-transparent text-primary-foreground hover:bg-primary-foreground/5 hover:text-primary-foreground font-medium" asChild>
                                 <a href={`https://www.google.com/maps/dir/?api=1&destination=${os.lat && os.lng ? `${os.lat},${os.lng}` : encodeURIComponent(os.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                   <MapPin size={16} strokeWidth={1.75} /> Abrir rota no mapa
                                 </a>
                               </Button>
                               <Button variant="outline" className="w-full gap-2 text-xs rounded-full border-primary-foreground/15 bg-transparent text-primary-foreground hover:bg-astrum-signal/10 hover:text-astrum-signal" onClick={(e) => { e.stopPropagation(); handleNotifyCustomer(os); }}>
                                 <MessageSquare size={14} strokeWidth={1.75} /> Avisar cliente (WhatsApp)
                               </Button>
                             </div>

                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
                
              {serviceOrders.filter(os => os.scheduledDate === selectedDate || ((selectedDate === new Date().toISOString().split('T')[0]) && (os.status === 'em_deslocamento' || os.status === 'em_andamento'))).length === 0 && (
                 <div className="text-center py-12 border border-dashed border-border rounded-stable-xl bg-secondary/30">
                   <CheckCircle2 size={40} strokeWidth={1.5} className="mx-auto text-astrum-signal/50 mb-4" />
                   <h4 className="font-display font-medium text-lg mb-1">Tudo limpo por aqui</h4>
                   <p className="text-muted-foreground text-sm mb-4">Nenhuma tarefa agendada para esta data até o momento.</p>
                   <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setSelectedCustomer(null); setScheduleData(prev => ({...prev, date: selectedDate})); setIsScheduleDialogOpen(true); }}>
                     <Plus size={14} strokeWidth={1.75} className="mr-1" /> Agendar OS nesta data
                   </Button>
                 </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-0 data-[state=active]:flex overflow-y-auto">
           <div className="w-full flex flex-col md:flex-row gap-4 md:gap-6 h-auto md:h-[calc(100vh-230px)]">
             {/* Tech List */}
             <div className="w-full md:w-1/4 md:min-w-[280px] bg-card border border-border rounded-stable-xl flex flex-col overflow-hidden shadow-1 shrink-0">
                 <div className="p-4 border-b border-border bg-secondary/40">
                    <h3 className="font-semibold mb-1">Técnicos</h3>
                    <p className="text-xs text-muted-foreground">Selecione para ver o histórico</p>
                 </div>
                 <ScrollArea className="flex-1 p-4">
                    <div className="space-y-2">
                       {technicians.map((tech: any) => {
                         const osToday = serviceOrders.filter(os => os.assignedTo === tech.name && os.scheduledDate === new Date().toISOString().split('T')[0]).length;
                         return (
                         <div
                           key={tech.name}
                           className={`p-3 rounded-stable-lg border cursor-pointer transition-colors duration-fast ${selectedHistoryTech?.name === tech.name ? 'border-transparent bg-primary text-primary-foreground shadow-2' : 'border-border bg-card hover:bg-secondary/50'}`}
                           onClick={() => setSelectedHistoryTech(tech)}
                         >
                            <h4 className="font-semibold text-sm">{tech.name}</h4>
                            <p className={`text-[10px] flex items-center gap-1.5 mt-1 ${selectedHistoryTech?.name === tech.name ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                               <span className={`w-1.5 h-1.5 rounded-full ${tech.status === 'available' ? 'bg-astrum-signal' : tech.status === 'busy' ? 'bg-astrum-amber' : 'bg-astrum-slate'}`} />
                               {tech.status === 'available' ? 'Online' : tech.status === 'busy' ? 'Em serviço' : 'Offline'}
                               <span className="mx-0.5">·</span>
                               <Briefcase size={10} strokeWidth={1.75} /> <span className="font-mono">{osToday}</span> OS hoje
                            </p>
                            {tech.coverage_regions && tech.coverage_regions.length > 0 && (
                               <p className={`text-[10px] mt-1 flex items-center gap-1 ${selectedHistoryTech?.name === tech.name ? 'text-primary-foreground/50' : 'text-muted-foreground/70'}`}>
                                 <MapPin size={10} strokeWidth={1.75} /> {tech.coverage_regions.join(', ')}
                               </p>
                            )}
                         </div>
                       )})}
                    </div>
                 </ScrollArea>
             </div>
             
             {/* History details */}
             <div className="flex-1 bg-secondary/30 border border-border rounded-stable-xl p-6 flex flex-col relative overflow-hidden">
                {selectedHistoryTech ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-4 shrink-0 border-b border-border pb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Histórico de OS</p>
                        <h2 className="font-display text-xl font-medium tracking-tight mt-0.5">{selectedHistoryTech.name}</h2>
                      </div>
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-card border border-border text-muted-foreground">
                        <span className="font-mono text-foreground mr-1">{serviceOrders.filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada')).length}</span> registros
                      </span>
                    </div>
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-3 pb-4">
                         {serviceOrders.filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada')).length === 0 ? (
                           <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma OS concluída ou cancelada encontrada para este técnico.</div>
                         ) : (
                           serviceOrders
                             .filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada'))
                             .sort((a,b) => (b.completedAt || b.scheduledDate || '').localeCompare(a.completedAt || a.scheduledDate || ''))
                             .map((os: any) => (
                               <div key={os.id} className="bg-card border border-border rounded-stable-lg p-4 shadow-1 flex flex-col gap-2 relative">
                                 <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                       <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-secondary/60 text-muted-foreground">{os.type}</span>
                                       <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${os.status === 'concluida' ? 'bg-astrum-signal/15 text-astrum-signal' : 'bg-astrum-red/15 text-astrum-red'}`}>
                                         {os.status === 'concluida' ? 'Concluída' : 'Cancelada'}
                                       </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{os.completedAt ? new Date(os.completedAt).toLocaleDateString('pt-BR') : os.scheduledDate || 'N/A'}</span>
                                 </div>
                                 <div className="mt-1">
                                    <h4 className="font-semibold text-sm mb-1">{os.customerName}</h4>
                                    <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={12} strokeWidth={1.75}/> {os.address}</p>
                                 </div>
                                 {(os.description || os.aiSummary) && (
                                   <div className="mt-2 bg-secondary/50 p-3 rounded-stable-sm">
                                     <p className="text-xs whitespace-pre-wrap">{os.description || os.aiSummary}</p>
                                   </div>
                                 )}
                               </div>
                             ))
                         )}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="flex-1 w-full border border-dashed border-border rounded-stable-lg flex items-center justify-center bg-card/40">
                     <div className="text-center">
                       <User size={40} strokeWidth={1.5} className="mx-auto text-muted-foreground/40 mb-3" />
                       <p className="text-muted-foreground font-medium text-sm">Selecione um técnico para visualizar o histórico de OS.</p>
                     </div>
                  </div>
                )}
             </div>
           </div>
        </TabsContent>
        <TabsContent value="incidents" className="flex-1 mt-0 data-[state=active]:flex overflow-y-auto w-full">
           <div className="flex-1 w-full bg-secondary/30 rounded-stable-xl border border-border p-4 md:p-6">
              <div className="flex items-center justify-between mb-6">
                 <div>
                    <p className="text-xs text-muted-foreground">Rede · detecção automática por IA</p>
                    <h2 className="font-display text-xl font-medium tracking-tight mt-0.5 flex items-center gap-2">
                       <Bot size={18} strokeWidth={1.75} className="text-astrum-red" />
                       Incidentes de rede (macro)
                    </h2>
                 </div>
                 <Button variant="outline" size="sm" className="rounded-full" onClick={fetchIncidents}>Atualizar</Button>
              </div>

              {activeIncidents.length === 0 ? (
                 <div className="w-full border border-dashed border-border rounded-stable-lg flex items-center justify-center bg-card/40 py-20">
                    <div className="text-center">
                       <CheckCircle2 size={40} strokeWidth={1.5} className="mx-auto text-astrum-signal/50 mb-3" />
                       <p className="text-muted-foreground font-medium text-sm">Nenhum incidente ativo no momento.</p>
                    </div>
                 </div>
              ) : (
                 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {activeIncidents.map((incident: any) => {
                       const createdAtDate = new Date(incident.createdAt);
                       const diffMs = Date.now() - createdAtDate.getTime();
                       const diffMins = Math.floor(diffMs / 60000);
                       const hours = Math.floor(diffMins / 60);
                       const mins = diffMins % 60;

                       return (
                          <Card key={incident.id} className="border border-astrum-red/30 bg-astrum-red/5 shadow-1 rounded-stable-xl relative overflow-hidden">
                             <span aria-hidden className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-astrum-red" />
                             <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold font-mono bg-astrum-red/15 text-astrum-red">
                                     CTO-{incident.ctoId}
                                  </span>
                                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                     <Clock size={12} strokeWidth={1.75} /> <span className="font-mono">{hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}</span> atrás
                                  </span>
                                </div>
                             </CardHeader>
                             <CardContent className="p-4 pt-2">
                                <div className="mb-4">
                                   <p className="text-sm font-medium">
                                      <span className="font-mono">{incident.affectedClients?.length || 0}</span> clientes impactados.
                                   </p>
                                </div>
                                <Button
                                   variant="destructive"
                                   className="w-full rounded-full"
                                   onClick={() => handleResolveIncident(incident.id)}
                                >
                                   Marcar como resolvido
                                </Button>
                             </CardContent>
                          </Card>
                       );
                    })}
                 </div>
              )}
           </div>
        </TabsContent>
      </Tabs>

      {/* SCHEDULE DIALOG */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[460px] border border-border shadow-4 rounded-stable-xl p-0 overflow-hidden bg-popover">
          <div className="bg-secondary/40 p-6 border-b border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-semibold flex items-center gap-2">
                <Briefcase size={22} strokeWidth={1.75} className="text-astrum-lemon" /> Nova Ordem de Serviço
              </DialogTitle>
              <DialogDescription>
                Instalação, manutenção ou reparo — direto para o CRM do técnico.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleCreateOSAndSchedule} className="space-y-4 p-6">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select 
                value={selectedCustomer?.id || 'avulso'} 
                onValueChange={val => {
                  if (val === 'avulso') {
                    setSelectedCustomer(null);
                  } else {
                    const cust = customers.find(c => c.id === val);
                    if (cust) setSelectedCustomer({ name: cust.name, address: cust.address, id: cust.id });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="avulso">-- Outro / Avulso --</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(!selectedCustomer || selectedCustomer.id === 'S/N') && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <Label>Nome do Cliente / Local *</Label>
                <Input 
                  required 
                  placeholder="Ex: João Silva ou Rodovia KM 12" 
                  value={selectedCustomer?.name || ''} 
                  onChange={e => setSelectedCustomer({ name: e.target.value, address: 'Não informado', id: 'S/N' })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Agendamento</Label>
                <Input type="date" required value={scheduleData.date} onChange={e => setScheduleData({...scheduleData, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Horário Ideal</Label>
                <Input type="time" required value={scheduleData.time} onChange={e => setScheduleData({...scheduleData, time: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Tarefa</Label>
              <Select value={scheduleData.type} onValueChange={val => setScheduleData({...scheduleData, type: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instalacao">Instalação</SelectItem>
                  <SelectItem value="manutencao">Manutenção / Suporte</SelectItem>
                  <SelectItem value="reparo">Reparo / Rompimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Técnico (Opcional - Prévio)</Label>
              <Select value={scheduleData.techId} onValueChange={val => setScheduleData({...scheduleData, techId: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">A Definir (Automático dps)</SelectItem>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição da Tarefa / Detalhes</Label>
              <Textarea 
                placeholder="Insira detalhes adicionais sobre a ordem de serviço..."
                value={scheduleData.description}
                onChange={e => setScheduleData({...scheduleData, description: e.target.value})}
                className="min-h-[100px]"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsScheduleDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="px-8" disabled={isSubmitting}>Criar OS</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WHATSAPP SIMULATOR DIALOG */}
      <Dialog open={isWhatsappDialogOpen} onOpenChange={setIsWhatsappDialogOpen}>
        <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col p-0 overflow-hidden bg-popover border border-border shadow-4 rounded-stable-xl">
          <DialogTitle className="sr-only">Simulador do Telefone do Técnico</DialogTitle>
          <div className="bg-astrum-signal/15 border-b border-border p-4 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
                <Smartphone size={20} strokeWidth={1.75} className="text-astrum-signal" />
                <div>
                   <h3 className="font-semibold text-sm">Simulador do telefone do técnico</h3>
                   <p className="text-[10px] text-muted-foreground">Painel de testes do MVP</p>
                </div>
             </div>
             <Button variant="ghost" size="icon" aria-label="Fechar simulador" onClick={() => setIsWhatsappDialogOpen(false)}>
                <X size={20} strokeWidth={1.75} />
             </Button>
          </div>

          <div className="flex flex-1 overflow-hidden">
             {/* Tech Status Sidebar */}
             <div className="w-1/3 bg-card border-r border-border p-4 overflow-y-auto">
                <h4 className="text-xs font-semibold text-muted-foreground mb-4">Técnicos base</h4>
                <div className="space-y-3">
                  {technicians.map(tech => (
                     <div key={tech.id} className="p-3 bg-secondary/40 border border-border rounded-stable-lg">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-sm font-medium">{tech.name}</span>
                           <div className={`w-2 h-2 rounded-full ${tech.status === 'available' ? 'bg-astrum-signal' : 'bg-astrum-red'}`} />
                        </div>
                        <div className="flex gap-2">
                           <Button size="sm" variant={tech.status === 'available' ? 'default' : 'outline'} className="h-6 text-[10px] flex-1 px-1 rounded-full" onClick={() => updateTechnician(tech.id, { status: 'available' })}>Ficar online</Button>
                           <Button size="sm" variant={tech.status === 'offline' ? 'secondary' : 'outline'} className="h-6 text-[10px] flex-1 px-1 rounded-full" onClick={() => updateTechnician(tech.id, { status: 'offline' })}>Sair</Button>
                        </div>
                     </div>
                  ))}
                </div>
             </div>

             {/* Chat Mock Area */}
             <div className="flex-1 flex flex-col bg-secondary/30 relative">
                <ScrollArea className="flex-1 p-4">
                   <div className="space-y-4">
                      {whatsappSimulationLog.length === 0 ? (
                         <div className="text-center mt-20 p-4 bg-astrum-amber/10 text-astrum-amber rounded-stable-lg text-sm max-w-sm mx-auto">
                            As mensagens enviadas pelo sistema para os técnicos aparecerão aqui. Envie uma OS (Aguardando Despacho) para ver a magia acontecer.
                         </div>
                      ) : (
                         [...whatsappSimulationLog].reverse().map(log => (
                            <div key={log.id} className="flex flex-col">
                               <span className="text-[10px] text-center text-muted-foreground mb-2 bg-card/70 border border-border rounded-full px-2 py-0.5 mx-auto">{log.tech} · {log.time}</span>
                               <div className="bg-card p-3 rounded-stable-lg rounded-tl-none shadow-1 max-w-[85%] self-start whitespace-pre-wrap text-[13px] border border-border relative">
                                  {log.text}
                               </div>
                            </div>
                         ))
                      )}
                   </div>
                </ScrollArea>
                <div className="p-3 bg-card border-t border-border flex gap-2">
                   <Input placeholder="Técnico respondendo (Simulado)..." disabled className="bg-input/60 border-border rounded-stable-lg" />
                   <Button disabled size="icon" aria-label="Enviar mensagem simulada"><MessageSquare size={16} strokeWidth={1.75} /></Button>
                </div>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* FINISH OS DIALOG */}
      <Dialog open={isFinishDialogOpen} onOpenChange={setIsFinishDialogOpen}>
        <DialogContent className="sm:max-w-[440px] border border-border shadow-4 rounded-stable-xl p-0 overflow-hidden bg-popover">
          <div className="bg-secondary/40 p-6 border-b border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-semibold flex items-center gap-2">
                <CheckCircle2 size={22} strokeWidth={1.75} className="text-astrum-signal" /> Concluir OS
              </DialogTitle>
              <DialogDescription>
                {selectedOS?.customerName} · triagem via WhatsApp concluída.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleFinishOS} className="space-y-4 p-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">MAC Address / Serial ONU *</Label>
              <Input required placeholder="Ex: 00:1A:2B:3C:4D:5E" className="rounded-stable-lg bg-input/60 border-border font-mono placeholder:font-sans placeholder:text-muted-foreground/60" value={finishData.macAddress} onChange={e => setFinishData({...finishData, macAddress: e.target.value})} />
              <p className="text-[10px] text-muted-foreground leading-tight mt-1">
                Ao preencher, o ERP "Pai" será acionado (via API no backend final) para provisionar este MAC.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Cabo usado (m)</Label>
                <Input type="number" placeholder="Ex: 45" className="rounded-stable-lg bg-input/60 border-border font-mono placeholder:font-sans placeholder:text-muted-foreground/60" value={finishData.cableUsed} onChange={e => setFinishData({...finishData, cableUsed: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Sinal (dBm) *</Label>
                <Input required placeholder="-19.5" className="rounded-stable-lg bg-input/60 border-border font-mono placeholder:font-sans placeholder:text-muted-foreground/60" value={finishData.signal} onChange={e => setFinishData({...finishData, signal: e.target.value})} />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsFinishDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="px-8">
                {isSubmitting ? 'Salvando...' : 'Autenticar e finalizar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* PHONE DIALOG — substitui window.prompt para notificação de cliente */}
      <Dialog open={isPhoneDialogOpen} onOpenChange={setIsPhoneDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Número do Cliente</DialogTitle>
            <DialogDescription>
              Número não encontrado no cadastro. Digite com DDD.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Ex: 11999998888"
              value={pendingPhone}
              onChange={(e) => setPendingPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingPhone.trim()) {
                  setIsPhoneDialogOpen(false);
                  if (pendingNotifyOS) doNotifyCustomer(pendingNotifyOS, pendingPhone);
                  setPendingNotifyOS(null);
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setIsPhoneDialogOpen(false); setPendingNotifyOS(null); }}>Cancelar</Button>
            <Button
              disabled={!pendingPhone.trim()}
              onClick={() => {
                setIsPhoneDialogOpen(false);
                if (pendingNotifyOS) doNotifyCustomer(pendingNotifyOS, pendingPhone);
                setPendingNotifyOS(null);
              }}
            >Enviar Notificação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HISTORY DIALOG */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Histórico de Status da OS</DialogTitle>
            <DialogDescription>
              {selectedHistoryOS ? `Ordem #${selectedHistoryOS.id.slice(0, 5)} - ${selectedHistoryOS.customerName}` : 'Carregando...'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            {/* D-012 — timeline numerada com conector vertical */}
            <div className="space-y-5 pt-2 pb-4">
              {selectedHistoryOS && selectedHistoryOS.statusHistory && selectedHistoryOS.statusHistory.length > 0 ? (
                selectedHistoryOS.statusHistory
                  .slice()
                  .reverse()
                  .slice(0, 5) // Show only the last 5 updates
                  .map((historyItem: any, index: number) => (
                  <div key={index} className="flex gap-3 relative before:absolute before:left-3 before:top-7 before:bottom-[-20px] before:w-px before:bg-border last:before:hidden">
                    <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5 relative z-10">
                      <span className="text-[10px] font-mono font-semibold">{index + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{osStatusLabel[historyItem.status] || historyItem.status.replace('_', ' ')}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><User size={10} strokeWidth={1.75}/> {historyItem.technician || 'Sistema'}</p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono mt-1">{new Date(historyItem.timestamp).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Calendar size={28} strokeWidth={1.5} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum histórico registrado para esta OS.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
