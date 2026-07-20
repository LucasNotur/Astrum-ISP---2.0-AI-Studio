import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, CheckCircle2, XCircle, RefreshCw, QrCode, MessageSquare, LogOut, Loader2, Save, Plus, Trash2, Activity, ShieldAlert, Play, Info } from "lucide-react";
import { GlowButton } from "@/src/components/ui/glow-button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/src/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from '@/src/components/ui/avatar';
import { cn } from '@/src/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/src/components/ui/dialog";
import { useAppStore } from '@/src/store/useAppStore';
import { supabase } from '@/src/lib/supabase';
import { saveIntegrationKeys } from '@/src/lib/db';

export function WhatsAppConnectionsPage() {
  const { user, companySettings, integrationKeys, setIntegrationKeys } = useAppStore();
  const [activeTab, setActiveTab] = useState('connections');
  const [connections, setConnections] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newConn, setNewConn] = useState({ instanceName: '', alias: '' });
  
  // Transient state for QR / Status per connection
  const [connStates, setConnStates] = useState<Record<string, { status: string, qrCode: string | null, isFetching: boolean }>>({});
  const [healthStats, setHealthStats] = useState<Record<string, any>>({});

  const fetchHealth = async (conn: any) => {
    try {
      const tId = companySettings?.tenant_id || user?.tenantId;
      if (!tId) return;
      const res = await fetch(`/api/whatsapp/health-stats?tenantId=${tId}&instanceId=${conn.instanceName}`);
      const data = await res.json();
      setHealthStats(prev => ({ ...prev, [conn.id]: data }));
    } catch (e) {
      console.error("Error fetching health", e);
    }
  };

  useEffect(() => {
    connections.forEach(conn => {
       fetchHealth(conn);
    });
    const interval = setInterval(() => {
       connections.forEach(conn => fetchHealth(conn));
    }, 30000);
    return () => clearInterval(interval);
  }, [connections, companySettings, user]);

  useEffect(() => {
    if (integrationKeys?.whatsappInstances) {
      try {
        setConnections(JSON.parse(integrationKeys.whatsappInstances));
      } catch (e) {
        setConnections([]);
      }
    } else if (integrationKeys?.evolutionInstance) {
      // Migrate old config
      setConnections([{
        id: crypto.randomUUID(),
        instanceName: integrationKeys.evolutionInstance,
        alias: integrationKeys.whatsappAlias || 'Atendimento Central',
        isDefault: true
      }]);
    }
  }, [integrationKeys]);

  const saveConnections = async (newConnections: any[]) => {
    const jsonStr = JSON.stringify(newConnections);
    setIntegrationKeys((prev: any) => ({ ...prev, whatsappInstances: jsonStr }));
    saveIntegrationKeys({ ...integrationKeys, whatsappInstances: jsonStr });
    
    const tId = companySettings?.tenant_id || user?.tenantId;
    if (tId && tId !== 'default') {
      const instanceNames = newConnections.map(c => c.instanceName);
      try {
        // S99 — salva instâncias na tabela tenant_evolution_instances (migration 022)
        await supabase.from('tenants').update({ evolution_instances: instanceNames }).eq('id', tId);
        for (const conn of newConnections) {
          await supabase.from('tenant_evolution_instances').upsert({
            tenant_id: tId,
            instance_name: conn.instanceName,
            label: conn.alias,
            phone_number: conn.phoneNumber || null,
            status: connStates[conn.id]?.status || 'disconnected',
            ai_enabled: true,
          }, { onConflict: 'tenant_id,instance_name' });
        }
      } catch(e) {
        console.warn("Could not update tenants evolution_instances", e);
      }
    }
  };

  const handleAddConnection = () => {
    if (!newConn.alias) {
      toast.error('Preencha o nome do usuário do WhatsApp.');
      return;
    }
    const generatedInstanceName = `astrum-${newConn.alias.replace(/\W+/g, '-').toLowerCase()}-${Date.now()}`;
    const newArr = [...connections, { id: crypto.randomUUID(), instanceName: generatedInstanceName, alias: newConn.alias, isDefault: connections.length === 0 }];
    setConnections(newArr);
    saveConnections(newArr);
    setIsAddOpen(false);
    setNewConn({ instanceName: '', alias: '' });
    toast.success('Usuário de WhatsApp adicionado!');
  };

  const handleRemoveConnection = async (id: string, instanceName: string) => {
    if (!window.confirm("Deseja realmente remover esta conexão? A instância continuará existindo na Evolution API.")) return;
    const newArr = connections.filter(c => c.id !== id);
    setConnections(newArr);
    saveConnections(newArr);
    const tId = companySettings?.tenant_id || user?.tenantId;
    if (tId && tId !== 'default' && instanceName) {
       try {
         await supabase.from('tenant_evolution_instances').delete().eq('tenant_id', tId).eq('instance_name', instanceName);
       } catch (e) {
         console.warn("Failed to delete instance doc", e);
       }
    }
  };

  const updateConnState = (id: string, newState: any) => {
    setConnStates(prev => ({ ...prev, [id]: { ...(prev[id] || { status: 'disconnected', qrCode: null, isFetching: false }), ...newState } }));
  };

  const fetchStatusAndQr = async (conn: any) => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionApiKey) {
      toast.error("Preencha a URL e Global API Key na página de Configurações primeiro.");
      return;
    }
    updateConnState(conn.id, { isFetching: true });
    try {
      // 1. Check connection state
      const stateRes = await fetch(`/api/evolution/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `/instance/connectionState/${conn.instanceName}`,
          method: 'GET',
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey
        })
      });
      const stateData = await stateRes.json();
      
      if (stateData?.instance?.state === 'open') {
        updateConnState(conn.id, { status: 'connected', qrCode: null });
        toast.success(`Instância ${conn.alias} conectada!`);
      } else {
        updateConnState(conn.id, { status: 'disconnected' });
        // 2. Fetch QR Code
        const qrRes = await fetch(`/api/evolution/proxy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: `/instance/connect/${conn.instanceName}`,
            method: 'GET',
            evolutionUrl: integrationKeys.evolutionUrl,
            evolutionApiKey: integrationKeys.evolutionApiKey
          })
        });
        const qrData = await qrRes.json();
        if (qrData?.base64) {
          updateConnState(conn.id, { qrCode: qrData.base64 });
          toast.info(`Escaneie o QR Code para ${conn.alias}.`);
        } else {
          toast.error(`Não foi possível gerar QR Code para ${conn.alias}. A instância existe na Evolution?`);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao conectar com a Evolution API.");
    } finally {
      updateConnState(conn.id, { isFetching: false });
    }
  };

  const disconnectInstance = async (conn: any) => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionApiKey) return;
    if (!window.confirm(`Deseja realmente desconectar o WhatsApp da instância ${conn.alias}?`)) return;
    
    updateConnState(conn.id, { isFetching: true });
    try {
      await fetch(`/api/evolution/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `/instance/logout/${conn.instanceName}`,
          method: 'DELETE',
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey
        })
      });
      updateConnState(conn.id, { status: 'disconnected', qrCode: null });
      toast.success("Instância desconectada com sucesso.");
    } catch (e) {
      toast.error("Erro ao desconectar instância.");
    } finally {
      updateConnState(conn.id, { isFetching: false });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-5xl mx-auto pb-10"
    >
      <Tabs defaultValue="connections" value={activeTab} onValueChange={setActiveTab}>
        {/* D-008 — hero da seção: eyebrow + título display + ações */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Phone size={13} strokeWidth={1.75} className="text-astrum-signal" />
              Canais · <span className="font-mono text-foreground">{connections.length}</span> conexões
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight leading-[1.1] mt-2">
              WhatsApp
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="bg-secondary/60 border border-border rounded-full p-1 gap-0.5">
               <TabsTrigger value="connections" className="rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">Conexões</TabsTrigger>
               <TabsTrigger value="templates" className="rounded-full px-3.5 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-2">Templates HSM</TabsTrigger>
            </TabsList>
            {/* D-011 — glow CTA: a ação de criação da tela */}
            {activeTab === 'connections' && (
              <GlowButton icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setIsAddOpen(true)}>
                Nova Conexão
              </GlowButton>
            )}
          </div>
        </div>

        <TabsContent value="connections" className="space-y-6">
           
           <div className="grid grid-cols-1 gap-6">
             {connections.length === 0 ? (
                <Card className="shadow-sm border-border bg-secondary/30">
                  <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 bg-secondary dark:bg-secondary rounded-full flex items-center justify-center mb-4">
                      <Phone size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">Nenhuma conexão configurada</h3>
                    <p className="text-muted-foreground max-w-md mx-auto mb-6">
                      Adicione uma conta de WhatsApp para gerar os QR Codes e vincular com a plataforma.
                    </p>
                    <Button onClick={() => setIsAddOpen(true)} variant="outline">
                      <Plus size={16} className="mr-2" /> Adicionar Primeira Conexão
                    </Button>
                  </CardContent>
                </Card>
             ) : (
               connections.map((conn) => {
                 const state = connStates[conn.id] || { status: 'disconnected', qrCode: null, isFetching: false };
                 const isConnected = state.status === 'connected';

                 return (
                   <Card key={conn.id} className="shadow-sm border-border relative overflow-hidden">
                     <CardHeader className="border-b border-border bg-secondary/30 pb-4">
                       <div className="flex justify-between items-center">
                         <div className="flex items-center gap-3">
                           <Avatar className="h-10 w-10 border border-border bg-white dark:bg-secondary">
                             <AvatarFallback className="bg-astrum-signal/15 text-astrum-signal font-bold">
                               {conn.alias ? conn.alias[0].toUpperCase() : 'W'}
                             </AvatarFallback>
                           </Avatar>
                           <div>
                             <CardTitle className="text-lg">{conn.alias}</CardTitle>
                             <CardDescription>Conta de WhatsApp associada</CardDescription>
                           </div>
                         </div>
                         <div className="flex items-center gap-3">
                           <Badge variant={isConnected ? "default" : "secondary"} className={cn(
                             isConnected ? "bg-astrum-signal/15 hover:bg-astrum-signal/25 text-astrum-signal" : "bg-astrum-red/15 hover:bg-astrum-red/25 text-astrum-red"
                           )}>
                             {isConnected ? <CheckCircle2 size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                             {isConnected ? "Conectado" : "Desconectado"}
                           </Badge>
                           <Button variant="ghost" size="icon" onClick={() => handleRemoveConnection(conn.id, conn.instanceName)} className="text-astrum-red hover:text-astrum-red hover:bg-astrum-red/10">
                             <Trash2 size={16} />
                           </Button>
                         </div>
                       </div>
                     </CardHeader>
                     <CardContent className="p-6">
                       <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-between">
                         
                         <div className="flex-1 space-y-4 w-full">
                           {isConnected ? (
                             <div className="flex items-center gap-4">
                               <Button variant="outline" size="sm" className="text-astrum-red hover:text-astrum-red hover:bg-astrum-red/10 border-astrum-red/30" onClick={() => disconnectInstance(conn)}>
                                 <LogOut size={14} className="mr-2" /> Desconectar
                               </Button>
                             </div>
                           ) : (
                             <div className="text-sm text-muted-foreground">
                               Clique em <strong>Obter QR Code</strong> e escaneie com o app do WhatsApp para conectar.
                             </div>
                           )}

                           {/* Saúde da Instância */}
                           <div className="mt-6 border-t border-border pt-6">
                             <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                               <Activity size={16} className="text-muted-foreground" />
                               <span>Saúde da Instância</span>
                             </h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                               <div className="bg-secondary/40 p-3 rounded-lg border border-border">
                                 <div className="text-xs text-muted-foreground mb-1">Risco de Ban</div>
                                 <div className="font-medium flex items-center gap-2">
                                   {healthStats[conn.id]?.ban_signals > 0 ? (
                                     <span className="text-astrum-red flex items-center gap-1"><ShieldAlert size={14} /> {healthStats[conn.id]?.ban_signals} sinais</span>
                                   ) : (
                                     <span className="text-astrum-signal">Normal</span>
                                   )}
                                 </div>
                               </div>
                               <div className="bg-secondary/40 p-3 rounded-lg border border-border">
                                 <div className="text-xs text-muted-foreground mb-1">Rate Limiter</div>
                                 <div className="font-medium">
                                   {healthStats[conn.id]?.is_paused ? <span className="text-astrum-red text-xs">Pausado (30m)</span> : <span className="text-astrum-signal text-xs">Liberado</span>}
                                 </div>
                               </div>
                               <div className="bg-secondary/40 p-3 rounded-lg border border-border">
                                 <div className="text-xs text-muted-foreground mb-1">Envios Diários</div>
                                 <div className="font-medium">{healthStats[conn.id]?.daily_messages_today || 0} msgs</div>
                               </div>
                               <div className="bg-secondary/40 p-3 rounded-lg border border-border">
                                 <div className="text-xs text-muted-foreground mb-1">Fila Global</div>
                                 <div className="font-medium">{healthStats[conn.id]?.messages_in_queue || 0} msgs</div>
                               </div>
                             </div>
                           </div>
                         </div>

                         {/* QR Code Area */}
                         <div className="w-full lg:w-72 flex flex-col items-center justify-center p-6 bg-secondary/40 dark:bg-card/30 rounded-2xl border border-border">
                           {isConnected ? (
                             <div className="text-center space-y-3">
                               <div className="w-20 h-20 bg-astrum-signal/15 text-astrum-signal rounded-full flex items-center justify-center mx-auto mb-2">
                                 <MessageSquare size={36} />
                               </div>
                               <h4 className="font-bold text-foreground">WhatsApp Conectado!</h4>
                               <Button variant="outline" size="sm" onClick={() => fetchStatusAndQr(conn)} disabled={state.isFetching} className="w-full mt-2">
                                 <RefreshCw size={14} className={cn("mr-2", state.isFetching && "animate-spin")} /> Verificar Status
                               </Button>
                             </div>
                           ) : state.qrCode ? (
                             <div className="text-center space-y-4">
                               <div className="bg-white p-3 rounded-2xl shadow-sm inline-block">
                                 <img 
                                   src={state.qrCode.startsWith('data:image') ? state.qrCode : `data:image/png;base64,${state.qrCode}`} 
                                   alt="WhatsApp QR Code" 
                                   className="w-48 h-48 rounded-xl"
                                 />
                               </div>
                               <Button variant="outline" size="sm" onClick={() => fetchStatusAndQr(conn)} disabled={state.isFetching} className="w-full">
                                 <RefreshCw size={14} className={cn("mr-2", state.isFetching && "animate-spin")} /> Atualizar QR Code
                               </Button>
                             </div>
                           ) : (
                             <div className="text-center space-y-4 py-4">
                               <div className="w-16 h-16 bg-astrum-fiber/15 text-astrum-fiber rounded-full flex items-center justify-center mx-auto mb-2">
                                 <QrCode size={28} />
                               </div>
                               <div>
                                 <h4 className="font-bold text-foreground text-sm mb-1">Pronto para Conectar?</h4>
                               </div>
                               <Button onClick={() => fetchStatusAndQr(conn)} disabled={state.isFetching} className="w-full shadow-sm bg-[#25D366] hover:bg-[#1EBE5D] text-white">
                                 {state.isFetching ? (
                                   <><Loader2 size={16} className="mr-2 animate-spin" /> Conectando...</>
                                 ) : (
                                   <><QrCode size={16} className="mr-2" /> Obter QR Code</>
                                 )}
                               </Button>
                             </div>
                           )}
                         </div>
                       </div>
                     </CardContent>
                   </Card>
                 );
               })
             )}
           </div>
        </TabsContent>

        <TabsContent value="templates">
          <WhatsAppTemplatesTab 
             tenantId={companySettings?.tenant_id || user?.tenantId} 
             connections={connections}
             integrationKeys={integrationKeys} 
          />
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mapear Novo WhatsApp</DialogTitle>
            <DialogDescription>
              Informe um nome para identificar este número de WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Usuário/Setor (Alias)</Label>
              <Input 
                placeholder="ex: WhatsApp do Renato / Suporte Avançado" 
                value={newConn.alias}
                onChange={e => setNewConn(p => ({ ...p, alias: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Como esta conexão será rotulada dentro do sistema Astrum.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddConnection}>Adicionar Conexão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}

function WhatsAppTemplatesTab({ tenantId, connections, integrationKeys }: any) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'MARKETING',
    language: 'pt_BR',
    header_type: 'none',
    header_content: '',
    body: '',
    footer: ''
  });
  
  const [testData, setTestData] = useState({
    phone: '',
    instanceName: connections[0]?.instanceName || '',
    vars: {} as Record<string, string>
  });
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    fetchTemplates();
  }, [tenantId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hsm-templates?tenantId=${tenantId}`);
      if (res.ok) {
        setTemplates(await res.json());
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao buscar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/hsm-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...formData })
      });
      if (res.ok) {
        toast.success("Template criado com sucesso!");
        setIsCreateOpen(false);
        setFormData({ name: '', category: 'MARKETING', language: 'pt_BR', header_type: 'none', header_content: '', body: '', footer: '' });
        fetchTemplates();
      } else {
        const error = await res.json();
        toast.error(`Erro: ${error.error}`);
      }
    } catch (e) {
      toast.error("Erro ao criar template");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este template?")) return;
    try {
      const res = await fetch(`/api/hsm-templates/${id}?tenantId=${tenantId}`, {
         method: 'DELETE'
      });
      if (res.ok) {
        toast.success("Excluído com sucesso");
        fetchTemplates();
      } else {
        toast.error("Não foi possível excluir");
      }
    } catch(e) {
      toast.error("Erro ao excluir template");
    }
  };

  const openTest = (template: any) => {
    setSelectedTemplate(template);
    setIsTestOpen(true);
    setTestData(prev => ({ 
      ...prev, 
      instanceName: connections[0]?.instanceName || prev.instanceName, 
      vars: {} 
    }));
  };

  const handleTest = async () => {
    if (!testData.phone || !testData.instanceName) {
       toast.error("Preencha número e conexão");
       return;
    }
    setTestLoading(true);
    try {
      let message = selectedTemplate.body;
      // replace variables
      Object.keys(testData.vars).forEach(key => {
         message = message.replace(`{{${key}}}`, testData.vars[key]);
      });

      if (selectedTemplate.header_type === 'text' && selectedTemplate.header_content) {
         message = `*${selectedTemplate.header_content}*\n\n${message}`;
      }
      if (selectedTemplate.footer) {
         message = `${message}\n\n_${selectedTemplate.footer}_`;
      }
      
      const res = await fetch(`/api/evolution/proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `/message/sendText/${testData.instanceName}`,
          method: 'POST',
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
          proxyBody: {
            number: testData.phone,
            options: { delay: 1200 },
            textMessage: { text: message }
          }
        })
      });

      if (res.ok) {
         toast.success("Mensagem de teste enviada com sucesso!");
         setIsTestOpen(false);
      } else {
         toast.error("Falha ao enviar mensagem de teste");
      }
    } catch (e) {
      toast.error("Erro ao enviar teste");
    } finally {
      setTestLoading(false);
    }
  };

  const getVarCount = (text: string) => {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return 0;
    const unique = new Set(matches);
    return unique.size;
  };
  const bodyVarCount = getVarCount(formData.body);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'APPROVED': return <Badge className="bg-astrum-signal/15 text-astrum-signal">Aprovado</Badge>;
      case 'REJECTED': 
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                 <Badge className="bg-astrum-red/15 text-astrum-red flex items-center gap-1 cursor-help"><XCircle size={12}/> Rejeitado</Badge>
              </TooltipTrigger>
              <TooltipContent>Violou as políticas de spam.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'PENDING': return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadgeColor = (cat: string) => {
     if (cat === 'MARKETING') return 'bg-astrum-orange/15 text-astrum-orange hover:bg-astrum-orange/25';
     if (cat === 'UTILITY') return 'bg-astrum-fiber/15 text-astrum-fiber hover:bg-astrum-fiber/25';
     if (cat === 'AUTHENTICATION') return 'bg-astrum-lemon/15 text-astrum-lemon hover:bg-astrum-lemon/25';
     return 'bg-secondary text-foreground/80';
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center bg-white dark:bg-card p-4 rounded-lg border border-border">
         <div>
            <h2 className="text-lg font-semibold text-foreground">Templates HSM (Mensagens Ativas)</h2>
            <p className="text-sm text-muted-foreground">Crie, teste e gerencie seus templates aprovados pela Meta para iniciação de conversas.</p>
         </div>
         <Button onClick={() => setIsCreateOpen(true)}>
            <Plus size={16} className="mr-2" /> Novo Template
         </Button>
       </div>

       <Card className="border border-border">
          <CardContent className="p-0 overflow-x-auto">
             <Table>
                <TableHeader>
                   <TableRow>
                     <TableHead>Nome</TableHead>
                     <TableHead>Categoria</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Idioma</TableHead>
                     <TableHead className="text-right">Ações</TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                   {loading ? (
                     <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="animate-spin mx-auto text-muted-foreground" size={24} /></TableCell></TableRow>
                   ) : templates.length === 0 ? (
                     <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum template criado</TableCell></TableRow>
                   ) : templates.map(t => (
                     <TableRow key={t.id}>
                       <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                       <TableCell><Badge variant="secondary" className={getCategoryBadgeColor(t.category)}>{t.category}</Badge></TableCell>
                       <TableCell>{getStatusBadge(t.status)}</TableCell>
                       <TableCell>{t.language}</TableCell>
                       <TableCell className="text-right space-x-2">
                          <Button variant="outline" size="sm" onClick={() => openTest(t)}><Play size={14} className="mr-1"/> Testar</Button>
                          {(t.status === 'PENDING' || t.status === 'REJECTED') && (
                             <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="text-astrum-red hover:text-astrum-red hover:bg-astrum-red/10">
                               <Trash2 size={16}/>
                             </Button>
                          )}
                       </TableCell>
                     </TableRow>
                   ))}
                </TableBody>
             </Table>
          </CardContent>
       </Card>

       <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>Novo Template HSM</DialogTitle>
             <DialogDescription>Crie um novo template de mensagem para iniciar conversas.</DialogDescription>
           </DialogHeader>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-4">
                 <div className="space-y-2">
                    <Label>Nome do Template</Label>
                    <Input 
                       placeholder="ex: promocao_verao_2024 (sem espaços)" 
                       value={formData.name} onChange={e => setFormData({...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')})}
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label>Categoria</Label>
                       <Select value={formData.category} onValueChange={v => setFormData({...formData, category: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="MARKETING">MARKETING</SelectItem>
                             <SelectItem value="UTILITY">UTILITY</SelectItem>
                             <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>
                    <div className="space-y-2">
                       <Label>Idioma</Label>
                       <Select value={formData.language} onValueChange={v => setFormData({...formData, language: v})}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="pt_BR">Português (BR)</SelectItem>
                             <SelectItem value="en_US">Inglês (US)</SelectItem>
                             <SelectItem value="es_ES">Espanhol</SelectItem>
                          </SelectContent>
                       </Select>
                    </div>
                 </div>

                 <div className="space-y-2">
                    <Label>Cabeçalho (Opcional)</Label>
                    <Select value={formData.header_type} onValueChange={v => setFormData({...formData, header_type: v})}>
                       <SelectTrigger><SelectValue/></SelectTrigger>
                       <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          <SelectItem value="text">Texto</SelectItem>
                          <SelectItem value="image">Imagem</SelectItem>
                          <SelectItem value="video">Vídeo</SelectItem>
                       </SelectContent>
                    </Select>
                    {formData.header_type === 'text' && (
                       <Input className="mt-2" placeholder="Texto do cabeçalho" value={formData.header_content} onChange={e => setFormData({...formData, header_content: e.target.value})} />
                    )}
                 </div>

                 <div className="space-y-2">
                    <Label className="flex justify-between">
                       Corpo da Mensagem
                       <span className="text-xs text-astrum-fiber bg-astrum-fiber/10 px-2 py-0.5 rounded-full">{bodyVarCount} Variáveis</span>
                    </Label>
                    <Textarea 
                       className="min-h-[120px]" 
                       placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado."
                       value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})}
                    />
                 </div>

                 <div className="space-y-2">
                    <Label>Rodapé (Opcional)</Label>
                    <Input placeholder="Texto do rodapé" value={formData.footer} onChange={e => setFormData({...formData, footer: e.target.value})} />
                 </div>
              </div>

              {/* Preview Area */}
              <div className="bg-secondary dark:bg-card border border-border rounded-xl flex items-center justify-center p-4">
                 <div className="w-full max-w-[300px] h-full rounded-3xl bg-[url('https://i.pinimg.com/originals/97/c0/07/97c00759d90d786d9b6096d274ad3e07.png')] bg-cover relative flex flex-col pt-12 pb-8 px-4 opacity-100 shadow-md border-4 border-border">
                    <div className="bg-[#E7FFDB] text-foreground text-sm p-3 rounded-lg rounded-tr-none shadow-sm mt-auto relative break-words">
                       {formData.header_type === 'text' && formData.header_content && <div className="font-bold mb-2 text-base">{formData.header_content}</div>}
                       {formData.header_type === 'image' && <div className="w-full h-24 bg-secondary rounded mb-2 flex items-center justify-center text-muted-foreground font-medium">[IMAGEM]</div>}
                       {formData.header_type === 'video' && <div className="w-full h-24 bg-secondary rounded mb-2 flex items-center justify-center text-muted-foreground font-medium">[VÍDEO]</div>}
                       <div className="whitespace-pre-wrap">{formData.body || <span className="text-muted-foreground">Corpo do template</span>}</div>
                       {formData.footer && <div className="text-[11px] text-muted-foreground mt-2 leading-none uppercase">{formData.footer}</div>}
                    </div>
                 </div>
              </div>
           </div>

           <DialogFooter>
             <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
             <Button onClick={handleCreate} disabled={!formData.name || !formData.body}>Submeter Template</Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       <Dialog open={isTestOpen} onOpenChange={setIsTestOpen}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Testar Template: {selectedTemplate?.name}</DialogTitle>
             <DialogDescription>
               Preencha as variáveis e envie um teste para o seu próprio número.
             </DialogDescription>
           </DialogHeader>
           <div className="space-y-4 pt-4">
              <div className="space-y-2">
                 <Label>Conexão de Origem (Remetente)</Label>
                 <Select value={testData.instanceName} onValueChange={v => setTestData({...testData, instanceName: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione um WhatsApp"/></SelectTrigger>
                    <SelectContent>
                       {connections?.map?.((c: any) => (
                         <SelectItem key={c.id} value={c.instanceName}>{c.alias} {c.status === 'connected' ? '(🟢)' : '(🔴)'}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
              </div>
              <div className="space-y-2">
                 <Label>Número Destino (com DDI)</Label>
                 <Input placeholder="5511999999999" value={testData.phone} onChange={e => setTestData({...testData, phone: e.target.value.replace(/\D/g, '')})} />
              </div>
              
              {selectedTemplate && getVarCount(selectedTemplate.body) > 0 && (
                 <div className="border-t pt-4 mt-2 space-y-3">
                    <Label className="font-semibold">Variáveis do Template</Label>
                    {Array.from({length: getVarCount(selectedTemplate.body)}, (_, i) => i + 1).map(num => (
                       <div key={num} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{`{{${num}}}`}</Label>
                          <Input 
                             placeholder={`Variável ${num}`}
                             value={testData.vars[num] || ''}
                             onChange={e => setTestData({...testData, vars: {...testData.vars, [num]: e.target.value}})}
                          />
                       </div>
                    ))}
                 </div>
              )}
           </div>
           
           <DialogFooter>
             <Button variant="outline" onClick={() => setIsTestOpen(false)}>Cancelar</Button>
             <Button onClick={handleTest} disabled={testLoading}>
               {testLoading ? <><Loader2 size={16} className="animate-spin mr-2"/>Enviando...</> : 'Enviar Teste'}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
    </div>
  );
}

