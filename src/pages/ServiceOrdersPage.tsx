import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Bot, Smartphone, Briefcase, User, Map, Activity, Package } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { toast } from "sonner";
import { useAppStore } from '@/src/store/useAppStore';
import { updateServiceOrder, updateTechnician } from '@/src/lib/db';

export function ServiceOrdersPage() {
  const { technicians, serviceOrders } = useAppStore();

  return (
    <motion.div 
      key="os"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Gerenciamento de técnicos de campo e instalações.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={async () => {
            const availableTechs = technicians.filter(t => t.status === 'available');
            if (availableTechs.length === 0) {
              toast.error("Nenhum técnico disponível no momento.");
            } else if (availableTechs.length === 1) {
              if (serviceOrders.length > 0) {
                try {
                  await updateServiceOrder(serviceOrders[0].id, {
                    assignedTo: availableTechs[0].name,
                    status: 'em_deslocamento'
                  });
                  toast.success(`OS atribuída automaticamente ao ${availableTechs[0].name}. Lembrete criado no Google Calendar.`);
                } catch (e) {
                  toast.error("Erro ao vincular OS.");
                }
              } else {
                toast.error("Nenhuma OS pendente.");
              }
            } else {
              toast.info(`Mensagem enviada para ${availableTechs.length} técnicos. Aguardando aceite ("Tarefa recebida").`);
            }
          }}>
            <Bot size={16} />
            Simular Despacho IA
          </Button>
          <Button className="gap-2">
            <Plus size={16} />
            Nova OS
          </Button>
        </div>
      </header>

      <Card className="border-none shadow-sm bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
            <Smartphone size={16} />
            Simulador de WhatsApp do Técnico (Dev)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {technicians.map((tech, index) => (
              <div key={tech.id} className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-blue-100 dark:border-blue-800/50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold">{tech.name}</span>
                  <div className={`w-2 h-2 rounded-full ${tech.status === 'available' ? 'bg-green-500' : tech.status === 'break' ? 'bg-yellow-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    size="sm" 
                    variant={tech.status === 'available' ? 'default' : 'outline'}
                    className="text-[10px] h-7"
                    onClick={async () => {
                      try {
                        await updateTechnician(tech.id, { status: 'available' });
                        toast.success(`${tech.name} iniciou o expediente.`);
                      } catch (e) {
                        toast.error("Erro ao atualizar status.");
                      }
                    }}
                  >
                    "Entrei"
                  </Button>
                  <Button 
                    size="sm" 
                    variant={tech.status === 'break' ? 'secondary' : 'outline'}
                    className="text-[10px] h-7"
                    onClick={async () => {
                      try {
                        await updateTechnician(tech.id, { status: 'break' });
                        toast.info(`${tech.name} entrou em pausa.`);
                      } catch (e) {
                        toast.error("Erro ao atualizar status.");
                      }
                    }}
                  >
                    "Pausa"
                  </Button>
                  <Button 
                    size="sm" 
                    variant={tech.status === 'offline' ? 'destructive' : 'outline'}
                    className="text-[10px] h-7"
                    onClick={async () => {
                      try {
                        await updateTechnician(tech.id, { status: 'offline' });
                        toast.error(`${tech.name} encerrou o expediente.`);
                      } catch (e) {
                        toast.error("Erro ao atualizar status.");
                      }
                    }}
                  >
                    "Saí"
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="text-[10px] h-7 w-full mt-1 border-primary text-primary hover:bg-primary/10"
                    onClick={async () => {
                      if (tech.status !== 'available') {
                        toast.error(`${tech.name} não está disponível para receber tarefas.`);
                        return;
                      }
                      if (serviceOrders.length > 0) {
                        try {
                          await updateServiceOrder(serviceOrders[0].id, {
                            assignedTo: tech.name,
                            status: 'em_deslocamento'
                          });
                          toast.success(`${tech.name} aceitou a tarefa! OS vinculada.`);
                        } catch (e) {
                          toast.error("Erro ao vincular OS.");
                        }
                      } else {
                        toast.error("Nenhuma OS pendente.");
                      }
                    }}
                  >
                    "Tarefa recebida"
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-none shadow-sm bg-zinc-50 dark:bg-zinc-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Fila de OS
                <Badge variant="secondary">{serviceOrders.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {serviceOrders.map(os => (
                <div key={os.id} className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800 shadow-sm cursor-pointer hover:border-primary/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={os.status === 'pendente' ? 'outline' : 'default'} className={
                      os.status === 'pendente' ? 'text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800' : 
                      os.status === 'em_deslocamento' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : ''
                    }>
                      {os.status === 'pendente' ? 'Pendente' : 'Em Deslocamento'}
                    </Badge>
                    <span className="text-[10px] text-zinc-400">{os.id}</span>
                  </div>
                  <p className="text-sm font-bold truncate">{os.customerName}</p>
                  <p className="text-xs text-zinc-500 truncate mb-2">{os.address}</p>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span className="flex items-center gap-1"><Briefcase size={12} /> {os.type === 'instalacao' ? 'Instalação' : 'Manutenção'}</span>
                    <span className="flex items-center gap-1"><User size={12} /> {os.assignedTo}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {serviceOrders.length > 0 ? (
            <Card className="border-none shadow-sm h-full">
              <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{serviceOrders[0].customerName}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Map size={14} /> {serviceOrders[0].address}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Map size={14} /> Abrir no Maps
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-1">Tipo de Serviço</p>
                    <p className="text-sm font-medium capitalize">{serviceOrders[0].type}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-1">Técnico Atribuído</p>
                    <p className="text-sm font-medium">{serviceOrders[0].assignedTo}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Bot size={16} className="text-primary" />
                    Resumo da Triagem (IA)
                  </h3>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {serviceOrders[0].aiSummary}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Activity size={16} className="text-zinc-400" />
                      Dados Técnicos
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                        <span className="text-zinc-500">CTO</span>
                        <span className="font-medium">{serviceOrders[0].cto}</span>
                      </div>
                      <div className="flex justify-between text-sm p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                        <span className="text-zinc-500">Porta</span>
                        <span className="font-medium">{serviceOrders[0].port}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <Package size={16} className="text-zinc-400" />
                      Materiais Necessários
                    </h3>
                    <ul className="space-y-2">
                      {serviceOrders[0].materials?.map((mat: string, idx: number) => (
                        <li key={idx} className="flex items-center gap-2 text-sm p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {mat}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                  <Button variant="outline">Reatribuir</Button>
                  <Button>Iniciar Deslocamento</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Briefcase size={48} className="mb-4 opacity-20" />
              <p>Nenhuma OS selecionada</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
