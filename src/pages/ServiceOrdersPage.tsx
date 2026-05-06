import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Bot, Smartphone, Briefcase, User, MapPin, Package, CheckCircle2, Camera, Calendar, MessageSquare, ArrowRight, X, Clock, PlayCircle, ListTodo } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
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

export function ServiceOrdersPage() {
  const { technicians, serviceOrders, customers, currentUserRole, userProfile, integrationKeys } = useAppStore();
  
  // Dialogs
  const [isFinishDialogOpen, setIsFinishDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isWhatsappDialogOpen, setIsWhatsappDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedOS, setSelectedOS] = useState<any>(null);
  const [selectedCalendarOS, setSelectedCalendarOS] = useState<any>(null);
  const [selectedHistoryTech, setSelectedHistoryTech] = useState<any>(null);
  const [selectedHistoryOS, setSelectedHistoryOS] = useState<any>(null);
  const [expandedBoardOS, setExpandedBoardOS] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [whatsappSimulationLog, setWhatsappSimulationLog] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

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
        os.status === 'em_andamento'
      )
    );

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
    
    // Attempt to find customer phone
    let customerPhone = '';
    const customer = customers.find(c => c.id === os.customerId);
    if (customer && customer.phone) {
      customerPhone = customer.phone.replace(/\D/g, '');
    } else {
      const phoneInput = window.prompt("Número do cliente não encontrado. Digite o número (com DDD):");
      if (!phoneInput) return;
      customerPhone = phoneInput.replace(/\D/g, '');
    }
    
    if (customerPhone.length < 10) {
      toast.error("Número inválido.");
      return;
    }
    if (!customerPhone.startsWith('55')) {
      customerPhone = '55' + customerPhone;
    }
    
    const msg = `Olá, *${os.customerName}*! 🔔\n\nSua ordem de serviço de *${os.type}* está com status: *${os.status.replace('_', ' ')}*.\nO técnico responsável é: *${os.assignedTo || 'A Definir'}*.\n\nQualquer dúvida, estamos à disposição!`;

    const loadingToast = toast.loading("Enviando notificação via Evolution API...");

    try {
      const res = await fetch(`/api/evolution/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: `/message/sendText/${integrationKeys.evolutionInstance}`,
          method: 'POST',
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
          body: {
            number: customerPhone,
            options: {
              delay: 1200,
              presence: "composing",
            },
            textMessage: {
              text: msg
            }
          }
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
    } catch (error) {
      console.error("Evolution API Error:", error);
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
      <header className="flex flex-col md:flex-row md:items-center justify-between shrink-0 mb-2 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Operações e Serviços em Campo</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Acompanhamento e despacho de instalações, manutenções e atividades em campo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setIsWhatsappDialogOpen(true)}>
            <Smartphone size={16} className="text-green-600" />
            <span className="hidden md:inline">Simulador WhatsApp Técnico</span>
          </Button>
          <Button className="gap-2 shrink-0 self-start md:self-auto" onClick={() => { setSelectedCustomer(null); setIsScheduleDialogOpen(true); }}>
            <Plus size={16} /> Nova O.S.
          </Button>
        </div>
      </header>

      <Tabs defaultValue={currentUserRole === 'tecnico' ? "calendar" : "board"} className="flex flex-col flex-1 h-full overflow-hidden">
        <TabsList className="w-fit mb-4 flex overflow-x-auto min-h-[40px] px-1 pb-1">
          <TabsTrigger value="board" className="gap-2 whitespace-nowrap">
            <Briefcase size={16} /> Quadro Geral (CRM)
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 whitespace-nowrap">
            <Calendar size={16} /> Minha Agenda (Técnicos)
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 whitespace-nowrap">
            <User size={16} /> Histórico dos Técnicos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="flex-1 overflow-x-auto pb-4 mt-0 data-[state=active]:flex">
          <div className="flex gap-4 min-w-max h-[calc(100vh-230px)]">
          {pipelines.map(column => (
            <div key={column.id} className="flex flex-col w-[340px] bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-3 shadow-sm h-full overflow-hidden">
              <div className="mb-4 px-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-[15px] flex items-center gap-2">
                    {column.id === 'new_tasks' && <User size={16} className="text-blue-500" />}
                    {column.id === 'scheduled' && <Calendar size={16} className="text-orange-500" />}
                    {column.id === 'today' && <Smartphone size={16} className="text-green-500" />}
                    {column.id === 'completed' && <CheckCircle2 size={16} className="text-purple-500" />}
                    {column.title}
                  </h3>
                  <Badge variant="secondary" className="bg-white dark:bg-zinc-800">{column.data.length}</Badge>
                </div>
                <p className="text-[11px] text-zinc-500">{column.desc}</p>
              </div>

              <ScrollArea className="flex-1 pr-2 -mr-2">
                 <div className="space-y-3 pb-6">
                    {column.data.map(item => (
                       <Card key={item.id} className="border-none shadow-sm shadow-zinc-200/50 dark:shadow-none hover:shadow-md transition-all group overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200/50 dark:border-zinc-800 ring-1 ring-zinc-200 dark:ring-zinc-800">
                           <CardContent className="p-4 relative">
                               <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 ${
                                    item.status === 'pendente' && !item.scheduledDate ? 'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/20 dark:border-zinc-800' :
                                    item.status === 'pendente' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' :
                                    item.status === 'em_deslocamento' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' :
                                    item.status === 'em_andamento' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' :
                                    'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800'
                                 }`}>
                                   {item.status.replace('_', ' ').toUpperCase()} {item.scheduledDate ? `• ${item.scheduledDate}` : ''}
                                 </Badge>
                                 <span className="text-[10px] text-zinc-400 font-mono">#{item.id.slice(0, 5)}</span>
                               </div>
                               
                               <div className="cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <h4 className="font-bold text-sm mb-1">{item.customerName}</h4>
                                 <p className="text-[11px] text-zinc-500 mb-1 line-clamp-1 flex items-center gap-1">
                                   <MapPin size={10}/> {item.address}
                                 </p>
                                 {item.description && expandedBoardOS !== item.id && (
                                   <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mb-2 line-clamp-2">
                                     {item.description}
                                   </p>
                                 )}
                               </div>
                               
                               <div className="flex items-center gap-2 mb-3 bg-zinc-50 dark:bg-zinc-800/50 p-1.5 rounded-md cursor-pointer" onClick={() => setExpandedBoardOS(expandedBoardOS === item.id ? null : item.id)}>
                                 <User size={12} className="text-zinc-400"/>
                                 <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">Téc: {item.assignedTo || 'A Definir'}</span>
                               </div>

                               {expandedBoardOS === item.id && (
                                 <div className="mt-2 mb-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3 animate-in slide-in-from-top-2 fade-in">
                                    {item.description && (
                                      <div>
                                        <h5 className="text-[10px] uppercase font-bold text-zinc-400 mb-1">Descrição Detalhada</h5>
                                        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 p-2 rounded-md whitespace-pre-wrap">{item.description}</p>
                                      </div>
                                    )}
                                    {item.aiSummary && (
                                      <div>
                                        <h5 className="text-[10px] uppercase font-bold text-blue-500 mb-1 flex items-center gap-1"><Bot size={10}/> Resumo IA</h5>
                                        <p className="text-[11px] text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md">{item.aiSummary}</p>
                                      </div>
                                    )}
                                    {item.materials && item.materials.length > 0 && (
                                      <div>
                                        <h5 className="text-[10px] uppercase font-bold text-zinc-400 mb-1 flex items-center gap-1"><Package size={10}/> Materiais Previstos</h5>
                                        <div className="flex flex-wrap gap-1">
                                          {item.materials.map((m: any, i: number) => (
                                            <Badge key={i} variant="secondary" className="text-[9px] px-1.5 bg-zinc-100 dark:bg-zinc-800">{m}</Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div className="flex flex-col gap-2 pt-2">
                                       <Button variant="outline" size="sm" className="w-full text-[11px] h-7 gap-1" onClick={(e) => { e.stopPropagation(); setSelectedHistoryOS(item); setIsHistoryDialogOpen(true); }}>
                                         <Calendar size={12} /> Ver Histórico de Status
                                       </Button>
                                       <Button variant="outline" size="sm" className="w-full text-[11px] h-7 gap-1" asChild>
                                         <a href={`https://www.google.com/maps/dir/?api=1&destination=${item.lat && item.lng ? `${item.lat},${item.lng}` : encodeURIComponent(item.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                           <MapPin size={12} /> Ver Rota no Mapa
                                         </a>
                                       </Button>
                                       <Button variant="secondary" size="sm" className="w-full text-[11px] h-7 gap-1 hover:bg-green-100 hover:text-green-700 transition-colors" onClick={(e) => { e.stopPropagation(); handleNotifyCustomer(item); }}>
                                         <MessageSquare size={12} /> Avisar Cliente (WhatsApp)
                                       </Button>
                                    </div>
                                 </div>
                               )}

                               {column.id === 'new_tasks' && (
                                 <Button 
                                    variant="secondary" 
                                    className="w-full text-[11px] h-8 gap-1 bg-zinc-100 dark:bg-zinc-800" 
                                    onClick={(e) => { e.stopPropagation(); setSelectedCustomer({name: item.customerName, address: item.address, id: item.customerId}); setIsScheduleDialogOpen(true); }}
                                  >
                                    Agendar para Técnico <ArrowRight size={12} />
                                 </Button>
                               )}

                               {column.id === 'scheduled' && (
                                 <Button 
                                    className="w-full text-[11px] h-8 gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white" 
                                    onClick={(e) => { e.stopPropagation(); dispatchToWhatsApp(item); }}
                                 >
                                   <MessageSquare size={13} fill="currentColor"/> Enviar para Hoje (WhatsApp)
                                 </Button>
                               )}

                               {column.id === 'today' && (
                                 <div className="flex flex-col gap-2">
                                   <div className="text-[10px] text-green-600 dark:text-green-500 flex justify-center items-center gap-1 bg-green-50 dark:bg-green-900/20 py-1 rounded">
                                     <CheckCircle2 size={10} /> Em Campo / Rota Ativa
                                   </div>
                                   <Button 
                                      variant="default"
                                      className="w-full text-[11px] h-8 bg-blue-600 hover:bg-blue-700" 
                                      onClick={(e) => { e.stopPropagation(); setSelectedOS(item); setIsFinishDialogOpen(true); }}
                                   >
                                     <CheckCircle2 size={13} className="mr-1"/> Registrar Conclusão
                                   </Button>
                                 </div>
                               )}
                               
                               {column.id === 'completed' && (
                                 <div className="text-[11px] text-purple-600 flex items-center justify-center gap-1 bg-purple-50 dark:bg-purple-900/20 py-1.5 rounded-md font-medium">
                                    <CheckCircle2 size={13} /> Concluído & Sincronizado
                                 </div>
                               )}
                            </CardContent>
                       </Card>
                    ))}
                    {column.data.length === 0 && (
                       <div className="text-center p-6 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 text-xs mt-4">
                          Nenhum registro.
                       </div>
                    )}
                 </div>
              </ScrollArea>
            </div>
          ))}
        </div>
        </TabsContent>

        {/* -- CALENDAR VIEW CONTENT -- */}
        <TabsContent value="calendar" className="flex-1 overflow-y-auto mt-0 pb-10">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">Agenda do Técnico</h3>
                <p className="text-zinc-500">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>
              <Badge variant="outline" className="mt-2 md:mt-0 w-fit bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                {serviceOrders.filter(os => os.scheduledDate === selectedDate || (os.status === 'em_deslocamento' || os.status === 'em_andamento')).length} tarefas na data selecionada
              </Badge>
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
                    className={`flex flex-col items-center justify-center min-w-[64px] h-[72px] rounded-2xl border transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-500 text-white shadow-md' 
                        : isToday
                        ? 'border-blue-200 bg-blue-50/50 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-blue-100' : 'text-zinc-400'}`}>
                      {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                    </span>
                    <span className="text-lg font-bold mt-0.5">
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
                    <Card key={os.id} className={`border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all overflow-hidden bg-white dark:bg-zinc-900 ${isExpanded ? 'ring-2 ring-blue-500 shadow-md' : 'hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                      {/* HEADER COMPACT (ALWAYS VISIBLE) */}
                      <div 
                        className="p-4 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer"
                        onClick={() => setSelectedCalendarOS(isExpanded ? null : os)}
                      >
                        {/* Time indicator */}
                        <div className="flex flex-row md:flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-800/50 p-2 md:p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 min-w-[80px] shrink-0 text-center">
                          <Clock size={16} className="text-zinc-400 md:mb-1 mr-2 md:mr-0" />
                          <span className="font-bold text-sm text-zinc-700 dark:text-zinc-200">{os.scheduledTime || 'ASAP'}</span>
                        </div>
                        
                        {/* Summary Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="uppercase text-[10px]" variant="secondary">{os.type}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${
                              os.status === 'concluida' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 
                              os.status === 'em_andamento' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' : 
                              os.status === 'em_deslocamento' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800' : 
                              'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                            }`}>
                              {os.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100 mb-0.5">{os.customerName}</h4>
                          <p className="text-sm text-zinc-500 flex items-center gap-1.5 line-clamp-1"><MapPin size={14}/> {os.address}</p>
                        </div>

                        {/* Status Icon Indicator */}
                        <div className="shrink-0 flex items-center justify-end">
                           <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isExpanded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'}`}>
                              <ArrowRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                           </div>
                        </div>
                      </div>

                      {/* EXPANDED CONTENT DETAILS */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 fade-in">
                          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 flex flex-col md:flex-row gap-6">
                             
                             <div className="flex-1 space-y-4">
                               {/* Description */}
                               <div>
                                 <h5 className="text-xs uppercase font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5"><ListTodo size={14} /> Detalhes da Tarefa</h5>
                                 <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/30 p-3 rounded-lg whitespace-pre-wrap border border-zinc-100 dark:border-zinc-800/50">
                                   {os.description || 'Nenhuma descrição fornecida para esta tarefa.'}
                                 </p>
                               </div>

                               {/* AI Summary */}
                               {os.aiSummary && (
                                 <div>
                                    <h5 className="text-xs uppercase font-bold text-blue-500 mb-1.5 flex items-center gap-1.5"><Bot size={14} /> Resumo Gerado por IA</h5>
                                    <p className="text-sm text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                      {os.aiSummary}
                                    </p>
                                 </div>
                               )}
                               
                               {/* Materials */}
                               {(os.materials && os.materials.length > 0) ? (
                                 <div>
                                   <h5 className="text-xs uppercase font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5"><Package size={14}/> Materiais Previstos</h5>
                                   <div className="flex flex-wrap gap-2">
                                     {os.materials.map((m: any, idx: number) => (
                                       <Badge key={idx} variant="secondary" className="px-2.5 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                                         {m}
                                       </Badge>
                                     ))}
                                   </div>
                                 </div>
                               ) : (
                                  <div>
                                    <h5 className="text-xs uppercase font-bold text-zinc-400 mb-1.5 flex items-center gap-1.5"><Package size={14}/> Materiais Previstos</h5>
                                    <p className="text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800 border-dashed inline-block">Nenhum material associado a esta ordem.</p>
                                  </div>
                               )}
                               
                               {/* Actions */}
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                  {os.status === 'pendente' && (
                                     <Button className="w-full font-semibold bg-blue-600 hover:bg-blue-700" onClick={(e) => { e.stopPropagation(); handleStartOS(os); }}>
                                       <PlayCircle size={16} className="mr-2" /> Iniciar Serviço Agora
                                     </Button>
                                  )}
                                  {(os.status === 'em_andamento' || os.status === 'em_deslocamento') && (
                                     <Button variant="default" className="w-full font-semibold bg-green-600 hover:bg-green-700" onClick={(e) => { e.stopPropagation(); setSelectedOS(os); setIsFinishDialogOpen(true); }}>
                                       <CheckCircle2 size={16} className="mr-2" /> Finalizar O.S.
                                     </Button>
                                  )}
                                  
                                  <Button variant="outline" className="w-full font-medium" onClick={(e) => { e.stopPropagation(); setSelectedHistoryOS(os); setIsHistoryDialogOpen(true); }}>
                                    <Calendar size={16} className="mr-2" /> Ver Histórico de Status
                                  </Button>
                               </div>
                             </div>
                             
                             {/* Side panel Map integration */}
                             <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
                               <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden relative flex flex-col h-40 border border-zinc-200 dark:border-zinc-700">
                                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}></div>
                                  <div className="flex-1 flex items-center justify-center relative z-10 p-4">
                                     <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center absolute animate-ping"></div>
                                     <MapPin size={28} className="text-blue-500 absolute drop-shadow-md" />
                                  </div>
                               </div>
                               <Button variant="outline" className="w-full gap-2 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 font-medium" asChild>
                                 <a href={`https://www.google.com/maps/dir/?api=1&destination=${os.lat && os.lng ? `${os.lat},${os.lng}` : encodeURIComponent(os.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                   <MapPin size={16} /> Abrir Rota no Mapa
                                 </a>
                               </Button>
                               <Button variant="secondary" className="w-full gap-2 text-xs" onClick={(e) => { e.stopPropagation(); handleNotifyCustomer(os); }}>
                                 <MessageSquare size={14} /> Avisar Cliente (WhatsApp)
                               </Button>
                             </div>

                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
                
              {serviceOrders.filter(os => os.scheduledDate === selectedDate || ((selectedDate === new Date().toISOString().split('T')[0]) && (os.status === 'em_deslocamento' || os.status === 'em_andamento'))).length === 0 && (
                 <div className="text-center py-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50">
                   <CheckCircle2 size={48} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
                   <h4 className="font-bold text-lg mb-1">Tudo limpo por aqui!</h4>
                   <p className="text-zinc-500 text-sm">Nenhuma tarefa agendada para esta data até o momento.</p>
                 </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 overflow-hidden mt-0 data-[state=active]:flex">
           <div className="w-full flex gap-6 h-[calc(100vh-230px)]">
             {/* Tech List */}
             <div className="w-1/4 min-w-[280px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-sm">
                 <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <h3 className="font-bold mb-1">Técnicos</h3>
                    <p className="text-xs text-zinc-500">Selecione para ver o histórico</p>
                 </div>
                 <ScrollArea className="flex-1 p-4">
                    <div className="space-y-2">
                       {technicians.map((tech: any) => (
                         <div 
                           key={tech.name} 
                           className={`p-3 rounded-xl border cursor-pointer hover:border-blue-500 transition-colors ${selectedHistoryTech?.name === tech.name ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}
                           onClick={() => setSelectedHistoryTech(tech)}
                         >
                            <h4 className="font-semibold text-sm">{tech.name}</h4>
                            <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
                               {tech.status === 'available' ? '🟢 Disponível' : tech.status === 'busy' ? '🟡 Em serviço' : '⚪ Offline'}
                            </p>
                         </div>
                       ))}
                    </div>
                 </ScrollArea>
             </div>
             
             {/* History details */}
             <div className="flex-1 bg-zinc-50/50 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col relative overflow-hidden">
                {selectedHistoryTech ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-4 shrink-0 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        Histórico: {selectedHistoryTech.name}
                      </h2>
                      <Badge variant="outline">{serviceOrders.filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada')).length} Registros</Badge>
                    </div>
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-4 pb-4">
                         {serviceOrders.filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada')).length === 0 ? (
                           <div className="text-center py-12 text-zinc-500 italic">Nenhuma O.S. concluída ou cancelada encontrada para este técnico.</div>
                         ) : (
                           serviceOrders
                             .filter(os => os.assignedTo === selectedHistoryTech.name && (os.status === 'concluida' || os.status === 'cancelada'))
                             .sort((a,b) => (b.completedAt || b.scheduledDate || '').localeCompare(a.completedAt || a.scheduledDate || ''))
                             .map((os: any) => (
                               <div key={os.id} className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 shadow-sm flex flex-col gap-2 relative">
                                 <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                       <Badge className="uppercase" variant="outline">{os.type}</Badge>
                                       <Badge variant={os.status === 'concluida' ? 'default' : 'destructive'} className={os.status === 'concluida' ? 'bg-green-500 hover:bg-green-600' : ''}>
                                         {os.status === 'concluida' ? 'Concluída' : 'Cancelada'}
                                       </Badge>
                                    </div>
                                    <span className="text-xs text-zinc-500 font-medium whitespace-nowrap">Data: {os.completedAt ? new Date(os.completedAt).toLocaleDateString() : os.scheduledDate || 'N/A'}</span>
                                 </div>
                                 <div className="mt-1">
                                    <h4 className="font-semibold text-sm mb-1">{os.customerName}</h4>
                                    <p className="text-xs text-zinc-500 flex items-center gap-1"><MapPin size={12}/> {os.address}</p>
                                 </div>
                                 {(os.description || os.aiSummary) && (
                                   <div className="mt-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-md border border-zinc-100 dark:border-zinc-800">
                                     <p className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">{os.description || os.aiSummary}</p>
                                   </div>
                                 )}
                               </div>
                             ))
                         )}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="flex-1 w-full border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl flex items-center justify-center bg-white/50 dark:bg-zinc-800/20">
                     <div className="text-center">
                       <User size={48} className="mx-auto text-zinc-300 dark:text-zinc-600 mb-3" />
                       <p className="text-zinc-500 font-medium">Selecione um técnico para visualizar o histórico de O.S.</p>
                     </div>
                  </div>
                )}
             </div>
           </div>
        </TabsContent>
      </Tabs>

      {/* SCHEDULE DIALOG */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Gerar Nova Tarefa / OS</DialogTitle>
            <DialogDescription>
              Criar Ordem de Serviço (Instalação, Manutenção, etc).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateOSAndSchedule} className="space-y-4 pt-2">
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
              <Button type="submit" disabled={isSubmitting}>Criar Ordem de Serviço</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* WHATSAPP SIMULATOR DIALOG */}
      <Dialog open={isWhatsappDialogOpen} onOpenChange={setIsWhatsappDialogOpen}>
        <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col p-0 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
          <DialogTitle className="sr-only">Simulador do Telefone do Técnico</DialogTitle>
          <div className="bg-[#075E54] dark:bg-zinc-900 text-white p-4 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-3">
                <Smartphone size={20} />
                <div>
                   <h3 className="font-bold text-sm">Simulador do Telefone do Técnico</h3>
                   <p className="text-[10px] text-green-100">Painel de Testes do MVP</p>
                </div>
             </div>
             <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setIsWhatsappDialogOpen(false)}>
                <X size={20} />
             </Button>
          </div>
          
          <div className="flex flex-1 overflow-hidden">
             {/* Tech Status Sidebar */}
             <div className="w-1/3 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-4 overflow-y-auto">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Técnicos Base</h4>
                <div className="space-y-3">
                  {technicians.map(tech => (
                     <div key={tech.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-sm font-medium">{tech.name}</span>
                           <div className={`w-2 h-2 rounded-full ${tech.status === 'available' ? 'bg-green-500' : 'bg-red-500'}`} />
                        </div>
                        <div className="flex gap-2">
                           <Button size="sm" variant={tech.status === 'available' ? 'default' : 'outline'} className="h-6 text-[10px] flex-1 px-1" onClick={() => updateTechnician(tech.id, { status: 'available' })}>Ficar Online</Button>
                           <Button size="sm" variant={tech.status === 'offline' ? 'secondary' : 'outline'} className="h-6 text-[10px] flex-1 px-1" onClick={() => updateTechnician(tech.id, { status: 'offline' })}>Sair</Button>
                        </div>
                     </div>
                  ))}
                </div>
             </div>

             {/* Chat Mock Area */}
             <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-zinc-950 relative" style={{ backgroundImage: 'url("https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-solid-color-dark.jpg")', backgroundSize: 'cover', backgroundBlendMode: 'soft-light' }}>
                <ScrollArea className="flex-1 p-4">
                   <div className="space-y-4">
                      {whatsappSimulationLog.length === 0 ? (
                         <div className="text-center mt-20 p-4 bg-yellow-100/80 text-yellow-800 rounded-lg text-sm max-w-sm mx-auto shadow-sm">
                            As mensagens enviadas pelo sistema para os técnicos aparecerão aqui. Envie uma OS (Aguardando Despacho) para ver a magia acontecer.
                         </div>
                      ) : (
                         [...whatsappSimulationLog].reverse().map(log => (
                            <div key={log.id} className="flex flex-col">
                               <span className="text-[10px] text-center text-zinc-500 mb-2 bg-white/50 dark:bg-black/30 rounded-full px-2 py-0.5 mx-auto">{log.tech} • {log.time}</span>
                               <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg rounded-tl-none shadow-sm max-w-[85%] self-start whitespace-pre-wrap text-[13px] border border-zinc-100 dark:border-zinc-700 relative">
                                  {log.text}
                               </div>
                            </div>
                         ))
                      )}
                   </div>
                </ScrollArea>
                <div className="p-3 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
                   <Input placeholder="Técnico respondendo (Simulado)..." disabled className="bg-white dark:bg-zinc-800" />
                   <Button disabled size="icon"><MessageSquare size={16} /></Button>
                </div>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* FINISH OS DIALOG */}
      <Dialog open={isFinishDialogOpen} onOpenChange={setIsFinishDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Concluir Ordem de Serviço</DialogTitle>
            <DialogDescription>
              {selectedOS?.customerName} • Triagem via WhatsApp concluída.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFinishOS} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>MAC Address / Serial ONU *</Label>
              <Input required placeholder="Ex: 00:1A:2B:3C:4D:5E" value={finishData.macAddress} onChange={e => setFinishData({...finishData, macAddress: e.target.value})} />
              <p className="text-[10px] text-zinc-500 leading-tight mt-1">
                Ao preencher, o ERP "Pai" será acionado (via API no backend final) para provisionar este MAC.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cabo Usado (M)</Label>
                <Input type="number" placeholder="Ex: 45" value={finishData.cableUsed} onChange={e => setFinishData({...finishData, cableUsed: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Sinal (dBm) *</Label>
                <Input required placeholder="-19.5" value={finishData.signal} onChange={e => setFinishData({...finishData, signal: e.target.value})} />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsFinishDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSubmitting ? 'Salvando...' : 'Autenticar & Finalizar'}
              </Button>
            </DialogFooter>
          </form>
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
            <div className="space-y-4 pt-2 pb-4">
              {selectedHistoryOS && selectedHistoryOS.statusHistory && selectedHistoryOS.statusHistory.length > 0 ? (
                selectedHistoryOS.statusHistory
                  .slice()
                  .reverse()
                  .slice(0, 5) // Show only the last 5 updates
                  .map((historyItem: any, index: number) => (
                  <div key={index} className="flex gap-3 relative before:absolute before:left-2 before:top-6 before:bottom-[-16px] before:w-px before:bg-zinc-200 dark:before:bg-zinc-800 last:before:hidden">
                    <div className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 border border-blue-500 flex items-center justify-center shrink-0 mt-1 relative z-10">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold capitalize text-zinc-900 dark:text-zinc-100">{historyItem.status.replace('_', ' ')}</p>
                      <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><User size={10}/> {historyItem.technician || 'Sistema'}</p>
                      <p className="text-[10px] text-zinc-400 mt-1">{new Date(historyItem.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-zinc-500">
                  <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum histórico registrado para esta O.S.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
