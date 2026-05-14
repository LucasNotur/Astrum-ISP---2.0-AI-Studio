import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, CheckCircle2, XCircle, RefreshCw, QrCode, MessageSquare, LogOut, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from '@/src/components/ui/avatar';
import { cn } from '@/src/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/src/components/ui/dialog";

export function WhatsAppConnectionsPage({
  integrationKeys,
  setIntegrationKeys,
  handleSaveKeys
}: any) {
  const [connections, setConnections] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newConn, setNewConn] = useState({ instanceName: '', alias: '' });
  
  // Transient state for QR / Status per connection
  const [connStates, setConnStates] = useState<Record<string, { status: string, qrCode: string | null, isFetching: boolean }>>({});

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

  const saveConnections = (newConnections: any[]) => {
    const jsonStr = JSON.stringify(newConnections);
    setIntegrationKeys((prev: any) => ({ ...prev, whatsappInstances: jsonStr }));
    if (handleSaveKeys) {
      handleSaveKeys({ ...integrationKeys, whatsappInstances: jsonStr });
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

  const handleRemoveConnection = (id: string) => {
    if (!window.confirm("Deseja realmente remover esta conexão? A instância continuará existindo na Evolution API.")) return;
    const newArr = connections.filter(c => c.id !== id);
    setConnections(newArr);
    saveConnections(newArr);
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <Phone className="text-green-500" size={28} />
            Conexões WhatsApp
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Gerencie múltiplos números de WhatsApp conectados ao sistema.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus size={16} className="mr-2" /> Nova Conexão
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {connections.length === 0 ? (
           <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
             <CardContent className="flex flex-col items-center justify-center p-12 text-center">
               <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                 <Phone size={24} className="text-zinc-400" />
               </div>
               <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Nenhuma conexão configurada</h3>
               <p className="text-zinc-500 max-w-md mx-auto mb-6">
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
              <Card key={conn.id} className="shadow-sm border-zinc-200 dark:border-zinc-800 relative overflow-hidden">
                <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 pb-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                        <AvatarFallback className="bg-green-100 text-green-700 font-bold dark:bg-green-900/30 dark:text-green-500">
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
                        isConnected ? "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {isConnected ? <CheckCircle2 size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                        {isConnected ? "Conectado" : "Desconectado"}
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveConnection(conn.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start justify-between">
                    
                    <div className="flex-1 space-y-4">
                      {isConnected ? (
                        <div className="flex items-center gap-4">
                          <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/30" onClick={() => disconnectInstance(conn)}>
                            <LogOut size={14} className="mr-2" /> Desconectar
                          </Button>
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-500 dark:text-zinc-400">
                          Clique em <strong>Obter QR Code</strong> e escaneie com o app do WhatsApp para conectar.
                        </div>
                      )}
                    </div>

                    {/* QR Code Area */}
                    <div className="w-full lg:w-72 flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                      {isConnected ? (
                        <div className="text-center space-y-3">
                          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                            <MessageSquare size={36} />
                          </div>
                          <h4 className="font-bold text-zinc-800 dark:text-zinc-200">WhatsApp Conectado!</h4>
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
                          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <QrCode size={28} />
                          </div>
                          <div>
                            <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-sm mb-1">Pronto para Conectar?</h4>
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
              <p className="text-xs text-zinc-500">Como esta conexão será rotulada dentro do sistema Astrum.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddConnection} className="bg-indigo-600 hover:bg-indigo-700">Adicionar Conexão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
