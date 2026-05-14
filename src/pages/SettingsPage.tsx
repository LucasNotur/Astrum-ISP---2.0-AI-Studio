
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Ticket, Book, Globe, Clock, MessageSquare, Phone, Briefcase, Bot, Map as MapIcon, CreditCard, Plus, Trash2, Users } from "lucide-react";
import { useNavigate } from 'react-router-dom';

import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { Save, Bug, Database, BellRing, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, getDocs, orderBy, limit, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAppStore } from '../store/useAppStore';

export function SettingsPage({ 
  integrationKeys, 
  setIntegrationKeys,
  isSavingKeys,
  handleSaveKeys,
  isDeveloper,
  seedSystem,
  seedTicketsAndLogs,
  seedServiceOrdersAndTechnicians,
  isSeeding,
  isAstrum,
  companySettings,
  setCompanySettings,
  handleSeedSystem,
  handleSeedPopularAstrum,
  handleWipeSystem,
  customers,
  handleSeedKB,
  evoStatus,
  fetchEvolutionQrCode,
  disconnectEvolutionInstance,
  configureEvolutionWebhook,
  isFetchingQr,
  evoQrCode,
  setIsAddingTech,
  isAddingTech,
  newTechPhone,
  setNewTechPhone,
  isFetchingTechName,
  newTechName,
  setNewTechName,
  handleAddTechnician,
  technicians,
  setTechnicians,
  updateTechnician,
  setIsSavingKeys,
  saveIntegrationKeys,
  setIsTeamMemberDialogOpen,
  teamMembers,
  handleDeleteTeamMember
}: any) {

  const navigate = useNavigate();
  const { user } = useAppStore();
  const tenantId = user?.tenantId || 'DEFAULT_TENANT';
  
  const [tenantTokenLimit, setTenantTokenLimit] = useState<number>(5000000);
  const [workerConcurrency, setWorkerConcurrency] = useState<number>(3);
  const [backupConfig, setBackupConfig] = useState({
    backup_enabled: false,
    backup_bucket_name: '',
    gcp_project_id: '',
    backup_hour: '02h',
    backup_retention_days: 30,
    last_backup_at: null as any,
    last_backup_status: null as string | null,
    last_backup_size_mb: null as string | null,
    last_backup_error: null as string | null
  });
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);

  const [expandVectorStore, setExpandVectorStore] = useState(false);
  const [vectorTestResult, setVectorTestResult] = useState<{success: boolean, error?: string} | null>(null);
  const [vectorConfig, setVectorConfig] = useState({ provider: 'qdrant', url: '', apiKey: '', collection: 'astrum_knowledge' });
  const [reindexStatus, setReindexStatus] = useState<{status: string, indexed: number, total: number} | null>(null);
  const [indexedCount, setIndexedCount] = useState(0);

  useEffect(() => {
    // Check vector store connection on mount
    fetch(`/api/integrations/vectorstore/ping?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(data => {
        if (data.connected) setVectorTestResult({ success: true });
        else setVectorTestResult({ success: false, error: data.error });
      })
      .catch(e => setVectorTestResult({ success: false, error: e.message }));
      
    // Load config and fetch indexed count
    const loadConfig = async () => {
      const { getDoc, doc, collection, getDocs, query, where } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'tenants', tenantId));
      if (snap.exists() && snap.data().vector_store_config) {
        setVectorConfig(snap.data().vector_store_config);
      }

      try {
        const kbSnap = await getDocs(query(collection(db, 'knowledge_base'), where('tenant_id', '==', tenantId), where('vector_indexed', '==', true)));
        setIndexedCount(kbSnap.size);
      } catch (e) { console.error(e); }
    };
    loadConfig();
  }, [tenantId]);

  const testVectorStore = async () => {
    setVectorTestResult(null);
    try {
      const res = await fetch(`/api/integrations/vectorstore/ping?tenantId=${tenantId}`);
      const data = await res.json();
      if (data.connected) {
        setVectorTestResult({ success: true });
        toast.success("Banco Vetorial Conectado");
      } else {
        setVectorTestResult({ success: false, error: data.error });
        toast.error("Falha na conexão: " + data.error);
      }
    } catch (e: any) {
      setVectorTestResult({ success: false, error: e.message });
      toast.error("Erro interno: " + e.message);
    }
  };

  const saveVectorConfig = async () => {
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'tenants', tenantId), { vector_store_config: vectorConfig }, { merge: true });
      toast.success("Configuração do Banco Vetorial salva");
      testVectorStore();
    } catch (e: any) {
      toast.error("Erro ao salvar config: " + e.message);
    }
  };

  const startReindex = async () => {
    toast.success("Iniciando reindexação...");
    setReindexStatus({ status: 'running', indexed: 0, total: 100 });
    // mock realtime progress
    let i = 0;
    const int = setInterval(() => {
      i += 10;
      setReindexStatus({ status: 'running', indexed: i, total: 100 });
      if (i >= 100) {
        clearInterval(int);
        setReindexStatus({ status: 'done', indexed: 100, total: 100 });
        toast.success("Reindexação concluída!");
      }
    }, 500);
  };

  
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tenants', tenantId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.monthly_token_limit) setTenantTokenLimit(data.monthly_token_limit);
        if (data.worker_concurrency) setWorkerConcurrency(data.worker_concurrency);
        setBackupConfig({
          backup_enabled: data.backup_enabled || false,
          backup_bucket_name: data.backup_bucket_name || '',
          gcp_project_id: data.gcp_project_id || '',
          backup_hour: data.backup_hour || '02h',
          backup_retention_days: data.backup_retention_days || 30,
          last_backup_at: data.last_backup_at ? data.last_backup_at.toDate().toLocaleString() : null,
          last_backup_status: data.last_backup_status || null,
          last_backup_size_mb: data.last_backup_size_mb || null,
          last_backup_error: data.last_backup_error || null
        });
      }
    });
    return () => unsub();
  }, [tenantId]);

  const saveTokenLimit = async (val: number, conc: number) => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { 
        monthly_token_limit: val,
        worker_concurrency: conc 
      });
      toast.success("Limites salvos com sucesso!");
    } catch (e) {
      toast.error("Erro ao salvar limites");
    }
  };

  const [webhookUrlDisplay, setWebhookUrlDisplay] = useState(`${window.location.origin}/api/webhook/evolution`);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("general");
  
  const [redisStatus, setRedisStatus] = useState<any>(null);
  const [testRedisUrl, setTestRedisUrl] = useState("");
  const [isTestingRedis, setIsTestingRedis] = useState(false);
  const [redisTestResult, setRedisTestResult] = useState<any>(null);

  const saveBackupConfig = async (key: string, value: any) => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { [key]: value });
      toast.success(`Configuração de backup atualizada!`);
    } catch (e) {
      toast.error("Erro ao salvar configuração.");
    }
  };

  const triggerBackup = async () => {
    setIsTriggeringBackup(true);
    try {
      const res = await fetch('/api/backup/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId })
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Backup iniciado com sucesso!");
      } else {
        toast.error("Erro: " + data.error);
      }
    } catch(e) {
      toast.error("Erro ao iniciar backup");
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  const fetchRedisStatus = async () => {
    try {
      const res = await fetch('/api/integrations/redis/status');
      if (res.ok) {
        setRedisStatus(await res.json());
      }
    } catch(e) {}
  };

  useEffect(() => {
    fetchRedisStatus();
  }, []);
  
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        setCompanySettings(prev => ({ ...prev, logoUrl: dataUrl }));
        toast.success('Logo processada com sucesso! Clique em "Salvar Alterações" para aplicar.');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      toast.error('Erro ao ler a imagem.');
    };
    reader.readAsDataURL(file);
  };
  
  const saveCompanySettings = async () => {
    try {
      toast.info('Salvando configurações...', { id: 'save-settings' });
      // Clean object to ensure no functions are passed to setDoc
      const cleanSettings = JSON.parse(JSON.stringify(companySettings));
      await setDoc(doc(db, 'settings', 'company'), cleanSettings, { merge: true });
      toast.success('Configurações salvas no banco de dados com sucesso!', { id: 'save-settings' });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar as configurações.', { id: 'save-settings' });
    }
  };


  useEffect(() => {
    fetch('/api/system/webhook-url')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
         if (data && data.webhookUrl) {
           setWebhookUrlDisplay(data.webhookUrl);
         }
      })
      .catch(err => console.log('Could not fetch webhook URL'));
  }, []);

  return (
    <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1">
                  <TabsTrigger value="general">Geral</TabsTrigger>
                  {isAstrum && <TabsTrigger value="integrations">Integrações (APIs)</TabsTrigger>}
                  <TabsTrigger value="team">Equipe</TabsTrigger>
                </TabsList>
                
                <TabsContent value="general" className="mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="md:col-span-2 border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Informações da Empresa</CardTitle>
                        <CardDescription>Dados básicos que aparecem em faturas e comunicações.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nome Fantasia</Label>
                            <Input 
                              value={companySettings.name || ''} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>E-mail de Suporte</Label>
                            <Input 
                              value={companySettings.supportEmail || ''} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, supportEmail: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Telefone de Contato</Label>
                            <Input 
                              value={companySettings.supportPhone || ''} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, supportPhone: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Horário de Atendimento</Label>
                            <Input 
                              value={companySettings.workingHours || ''} 
                              onChange={(e) => setCompanySettings(prev => ({ ...prev, workingHours: e.target.value }))}
                            />
                          </div>
                        </div>
                        {isAstrum && (
                          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                            <p className="text-xs font-bold text-zinc-500 uppercase">Ferramentas de Desenvolvedor</p>
                            <div className="flex flex-wrap gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={handleSeedSystem}
                                disabled={isSeeding}
                              >
                                <Database size={14} /> Popular Clientes
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={seedTicketsAndLogs}
                                disabled={isSeeding || customers.length === 0}
                              >
                                <Ticket size={14} /> Popular Tickets/Logs
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                onClick={handleSeedKB}
                                disabled={isSeeding}
                              >
                                <Book size={14} /> Popular Base Conhecimento
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2 bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100 hover:text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-900/40"
                                onClick={handleSeedPopularAstrum}
                                disabled={isSeeding}
                              >
                                <Database size={14} /> Popular Astrum
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-2 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                                onClick={handleWipeSystem}
                                disabled={isSeeding}
                              >
                                <Trash2 size={14} /> Apagar Sistema Todo
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="pt-4 flex flex-col sm:flex-row gap-3">
                          <Button className="w-full sm:w-auto" onClick={saveCompanySettings}>
                            Salvar Alterações
                          </Button>
                          <Button variant="destructive" className="w-full sm:w-auto flex md:hidden items-center justify-center gap-2" onClick={() => signOut(auth)}>
                            <LogOut className="w-4 h-4" />
                            Sair do Sistema
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Identidade Visual</CardTitle>
                        <CardDescription>Logo e cores da marca.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex flex-col items-center gap-4">
                          <input 
                            type="file" 
                            accept="image/*" 
                            ref={fileInputRef} 
                            onChange={handleLogoUpload} 
                            className="hidden" 
                          />
                          <div 
                            className="w-32 h-32 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <img 
                              src={companySettings.logoUrl} 
                              alt="Logo" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-xs font-bold">Alterar</span>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-500 text-center">Recomendado: 512x512px (PNG ou SVG)</p>
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Globe size={16} className="text-zinc-400" />
                              <span className="text-sm">Fuso Horário</span>
                            </div>
                            <span className="text-xs font-medium">{companySettings.timezone}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock size={16} className="text-zinc-400" />
                              <span className="text-sm">Formato de Data</span>
                            </div>
                            <span className="text-xs font-medium">DD/MM/YYYY</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="md:col-span-3 border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <CardHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 rounded-t-xl">
                        <CardTitle className="flex items-center gap-2">
                          <Database size={18} className="text-purple-600" /> 
                          Backup Automático (Firestore)
                        </CardTitle>
                        <CardDescription>
                          Configure o backup automático dos bancos de dados do sistema (Tickets, Logs, Os, Clientes).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <Label className="font-semibold text-zinc-900 dark:text-zinc-100">Ativar Backup Automático</Label>
                          <Switch 
                            checked={backupConfig.backup_enabled} 
                            onCheckedChange={(checked) => saveBackupConfig('backup_enabled', checked)} 
                          />
                        </div>

                        {backupConfig.backup_enabled && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-50/50 dark:bg-zinc-900/20 p-4 border border-zinc-100 dark:border-zinc-800 rounded-lg">
                            <div className="space-y-2">
                              <Label>ID do Projeto GCP</Label>
                              <Input 
                                placeholder="ex: meu-projeto-123" 
                                value={backupConfig.gcp_project_id}
                                onChange={(e) => setBackupConfig(prev => ({...prev, gcp_project_id: e.target.value}))}
                                onBlur={(e) => saveBackupConfig('gcp_project_id', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Nome do Bucket GCP</Label>
                              <Input 
                                placeholder="ex: meu-bucket-backups" 
                                value={backupConfig.backup_bucket_name}
                                onChange={(e) => setBackupConfig(prev => ({...prev, backup_bucket_name: e.target.value}))}
                                onBlur={(e) => saveBackupConfig('backup_bucket_name', e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Horário do Backup</Label>
                              <select 
                                className="w-full text-sm border p-2 rounded-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                                value={backupConfig.backup_hour}
                                onChange={(e) => {
                                  setBackupConfig(prev => ({...prev, backup_hour: e.target.value}));
                                  saveBackupConfig('backup_hour', e.target.value);
                                }}
                              >
                                <option value="01h">01h</option>
                                <option value="02h">02h</option>
                                <option value="03h">03h</option>
                                <option value="04h">04h</option>
                                <option value="05h">05h</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Retenção em dias</Label>
                              <Input 
                                type="number"
                                value={backupConfig.backup_retention_days}
                                onChange={(e) => setBackupConfig(prev => ({...prev, backup_retention_days: parseInt(e.target.value)}))}
                                onBlur={(e) => saveBackupConfig('backup_retention_days', parseInt(e.target.value))}
                              />
                            </div>
                          </div>
                        )}

                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="text-sm">
                            <p className="text-zinc-500 mb-1">Último Backup: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{backupConfig.last_backup_at || 'Nunca'}</span></p>
                            <div className="text-zinc-500">
                              Status: 
                              {backupConfig.last_backup_status === 'success' && <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">Sucesso</Badge>}
                              {backupConfig.last_backup_status === 'failed' && <Badge variant="destructive" className="ml-2 bg-red-100">{backupConfig.last_backup_error || 'Falha'}</Badge>}
                              {!backupConfig.last_backup_status && <Badge variant="outline" className="ml-2 text-zinc-500">N/A</Badge>}
                              {backupConfig.last_backup_size_mb && <span className="ml-2 text-xs">({backupConfig.last_backup_size_mb})</span>}
                            </div>
                          </div>
                          <Button 
                            variant="secondary" 
                            disabled={isTriggeringBackup || !backupConfig.gcp_project_id || !backupConfig.backup_bucket_name} 
                            onClick={triggerBackup}
                            className="w-full md:w-auto"
                          >
                            {isTriggeringBackup ? "Iniciando..." : "Fazer backup agora"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {isAstrum && (
                  <TabsContent value="integrations" className="mt-6">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Chaves de API e Integrações</CardTitle>
                        <CardDescription>
                          Configure as chaves de API para os serviços utilizados pelo sistema. 
                          As funções do sistema buscarão essas chaves automaticamente.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <Tabs defaultValue="whatsapp" className="w-full">
                          <TabsList className="bg-zinc-100 dark:bg-zinc-800 p-1 mb-4 flex flex-wrap gap-1">
                                                        <TabsTrigger value="whatsapp">WhatsApp (Evolution)</TabsTrigger>
                            <TabsTrigger value="billing">Financeiro (ERP)</TabsTrigger>
                            <TabsTrigger value="maps">Google Maps</TabsTrigger>
                            <TabsTrigger value="redis">Redis (Fila)</TabsTrigger>
                          </TabsList>

                          <TabsContent value="whatsapp" className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4 border border-zinc-200 dark:border-zinc-800 p-6 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                                <div>
                                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    <MessageSquare size={18} className="text-green-600" />
                                    Conexão com Evolution API
                                  </h3>
                                  <p className="text-xs text-zinc-500 mt-1">Configure o servidor matriz que processará as mensagens.</p>
                                </div>
                                <div className="grid gap-2">
                                  <Label htmlFor="evo-url">Evolution API URL</Label>
                                  <Input 
                                    id="evo-url" 
                                    placeholder="ex: http://sua-vps:8080" 
                                    value={integrationKeys.evolutionUrl || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionUrl: e.target.value }))}
                                  />
                                </div>

                                <div className="grid gap-2">
                                  <Label htmlFor="evo-apikey">Global API Key</Label>
                                  <Input 
                                    id="evo-apikey" 
                                    type="password" 
                                    placeholder="Sua Global API Key..." 
                                    value={integrationKeys.evolutionApiKey || ''}
                                    onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                                  />
                                </div>
                                <div className="pt-4 mt-2 border-t border-zinc-200 dark:border-zinc-800">
                                  <p className="text-xs text-zinc-500 mb-3">Após configurar as chaves, gerencie as instâncias de WhatsApp em uma página dedicada.</p>
                                  <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate('/whatsapp')}>
                                    Gerenciar Múltiplas Instâncias
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                  <h4 className="font-semibold text-blue-800 dark:text-blue-400 text-sm mb-4">Relay de Suporte</h4>
                                  <div className="grid gap-3">
                                    <Label htmlFor="support-relay-number">WhatsApp de Suporte Nível 2</Label>
                                    <Input 
                                      id="support-relay-number" 
                                      placeholder="ex: 5511999999999" 
                                      value={integrationKeys.whiteLabelSupportNumber || ''}
                                      onChange={(e) => setIntegrationKeys(prev => ({ ...prev, whiteLabelSupportNumber: e.target.value }))}
                                    />
                                    <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-1">
                                      Número que receberá as dúvidas que a IA não souber responder.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                              <div className="flex items-center justify-between mb-4">
                                <div>
                                  <h3 className="text-sm font-bold flex items-center gap-2">
                                    <Briefcase size={16} className="text-zinc-400" />
                                    Técnicos de Campo (WhatsApp)
                                  </h3>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                    Configure os números de WhatsApp dos técnicos para envio automático de OS.
                                  </p>
                                </div>
                                <Button size="sm" onClick={() => setIsAddingTech(!isAddingTech)}>
                                  {isAddingTech ? "Cancelar" : "+ Técnico"}
                                </Button>
                              </div>
                              
                              {isAddingTech && (
                                <div className="mb-6 p-4 border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl">
                                  <h4 className="text-sm font-bold mb-3 text-blue-800 dark:text-blue-300">Novo Técnico</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                      <Label className="text-xs">Número WhatsApp <span className="text-red-500">*</span></Label>
                                      <Input 
                                        placeholder="5511999999999" 
                                        value={newTechPhone}
                                        onChange={(e) => setNewTechPhone(e.target.value.replace(/\D/g, ''))}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label className="text-xs">Nome {isFetchingTechName && <span className="text-blue-500 text-[10px] animate-pulse">Buscando...</span>}</Label>
                                      <Input 
                                        placeholder="Opcional (Buscado via API)" 
                                        value={newTechName}
                                        onChange={(e) => setNewTechName(e.target.value)}
                                        disabled={isFetchingTechName}
                                      />
                                    </div>
                                    <div className="flex items-end">
                                      <Button 
                                        className="w-full" 
                                        onClick={handleAddTechnician}
                                      >
                                        Adicionar
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {technicians.map((tech, index) => (
                                  <div key={tech.id} className="grid gap-2 p-4 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                                    <div className="flex justify-between items-center">
                                      <Label htmlFor={`tech-phone-${tech.id}`} className="text-xs font-bold">
                                        {tech.name}
                                      </Label>
                                      <button 
                                        className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50"
                                        onClick={async () => {
                                          if (window.confirm(`Tem certeza que deseja excluir o técnico ${tech.name}?`)) {
                                            try {
                                              if (typeof window !== 'undefined') {
                                                const { deleteDoc, doc } = require('firebase/firestore');
                                                const { db } = require('@/src/lib/firebase');
                                                await deleteDoc(doc(db, 'technicians', tech.id));
                                                toast.success('Técnico removido.');
                                              }
                                            } catch (e) {
                                              toast.error('Erro ao remover técnico.');
                                            }
                                          }
                                        }}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                    <Input 
                                      id={`tech-phone-${tech.id}`} 
                                      placeholder="ex: 5511999999999" 
                                      value={tech.phone}
                                      onChange={(e) => {
                                        const newTechs = [...technicians];
                                        newTechs[index].phone = e.target.value;
                                        setTechnicians(newTechs);
                                      }}
                                      onBlur={async (e) => {
                                        try {
                                          await updateTechnician(tech.id, { phone: e.target.value });
                                          toast.success(`Telefone do ${tech.name} salvo.`);
                                        } catch (err) {
                                          toast.error(`Erro ao salvar telefone do ${tech.name}.`);
                                        }
                                      }}
                                    />
                                    <div className="flex items-center gap-2 mt-2">
                                      <div className={`w-2 h-2 rounded-full ${tech.status === 'available' ? 'bg-green-500' : tech.status === 'break' ? 'bg-yellow-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
                                        {tech.status === 'available' ? 'Disponível' : tech.status === 'break' ? 'Em Pausa' : 'Offline'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="billing" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="billing-query-key" className="flex items-center gap-2">
                                <CreditCard size={16} className="text-indigo-600" />
                                API Banco / ERP (Consulta de Faturas)
                              </Label>
                              <Input 
                                id="billing-query-key" 
                                type="password" 
                                placeholder="Chave para consulta..." 
                                value={integrationKeys.billingQuery || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, billingQuery: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para buscar faturas e status financeiro.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="billing-payment-key" className="flex items-center gap-2">
                                <CreditCard size={16} className="text-indigo-600" />
                                API Banco / ERP (Registro de Pagamentos)
                              </Label>
                              <Input 
                                id="billing-payment-key" 
                                type="password" 
                                placeholder="Chave para registro..." 
                                value={integrationKeys.billingPayment || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, billingPayment: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para confirmar recebimentos no sistema.</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="maps" className="space-y-4">
                            <div className="grid gap-2">
                              <Label htmlFor="google-maps-view-key" className="flex items-center gap-2">
                                <MapIcon size={16} className="text-blue-600" />
                                Google Maps API Key (Visualização)
                              </Label>
                              <Input 
                                id="google-maps-view-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.mapsView || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mapsView: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para renderizar o mapa de cobertura.</p>
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor="google-maps-geocode-key" className="flex items-center gap-2">
                                <MapIcon size={16} className="text-blue-600" />
                                Google Maps API Key (Geocodificação)
                              </Label>
                              <Input 
                                id="google-maps-geocode-key" 
                                type="password" 
                                placeholder="AIzaSy..." 
                                value={integrationKeys.mapsGeocode || ''}
                                onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mapsGeocode: e.target.value }))}
                              />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">Usada para converter endereços em coordenadas.</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="redis" className="space-y-4">
                            <Card className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shadow-sm">
                              <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <Database size={18} className="text-red-600" /> 
                                  Redis / Fila de Mensagens
                                </CardTitle>
                                <CardDescription>
                                  Gerencia filas de processamento, cache de sessões e rate limiting do CobrAI
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="space-y-6">
                                {/* CARD STATUS REDIS */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                  <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Status</p>
                                    <Badge variant={redisStatus?.connected ? "default" : "destructive"} className={redisStatus?.connected ? "bg-green-500 hover:bg-green-600" : ""}>
                                      {redisStatus?.connected ? "Conectado" : "Desconectado"}
                                    </Badge>
                                  </div>
                                  <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Memória</p>
                                    <p className="text-sm font-bold font-mono">{redisStatus?.memoryUsed || "N/A"}</p>
                                  </div>
                                  <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Waiting</p>
                                    <p className="text-sm font-bold font-mono">{redisStatus?.queueWaiting ?? "0"}</p>
                                  </div>
                                  <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] text-blue-500 uppercase font-bold mb-1">Active</p>
                                    <p className="text-sm font-bold font-mono">{redisStatus?.queueActive ?? "0"}</p>
                                  </div>
                                  <div className="p-3 bg-white dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] text-red-500 uppercase font-bold mb-1">DLQ</p>
                                    <p className="text-sm font-bold font-mono text-red-600">{redisStatus?.dlqCount ?? "0"}</p>
                                  </div>
                                </div>

                                {/* CONFIGURAÇÃO */}
                                <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                  <div className="grid gap-2">
                                    <Label>Testar Conexão Redis</Label>
                                    <div className="flex flex-col md:flex-row gap-2">
                                      <Input 
                                        type="password"
                                        placeholder="redis://localhost:6379 ou redis://usuario:senha@host:6379"
                                        value={testRedisUrl}
                                        onChange={(e) => setTestRedisUrl(e.target.value)}
                                        className="flex-1"
                                      />
                                      <Button 
                                        variant="secondary"
                                        disabled={isTestingRedis || !testRedisUrl}
                                        onClick={async () => {
                                          setIsTestingRedis(true);
                                          setRedisTestResult(null);
                                          try {
                                            const res = await fetch('/api/integrations/redis/test', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ url: testRedisUrl })
                                            });
                                            const data = await res.json();
                                            setRedisTestResult(data);
                                          } catch(e: any) {
                                            setRedisTestResult({ success: false, error: e.message });
                                          } finally {
                                            setIsTestingRedis(false);
                                          }
                                        }}
                                      >
                                        {isTestingRedis ? "Testando..." : "Testar Conexão"}
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  {redisTestResult && (
                                    <div className="mt-2 text-sm">
                                      {redisTestResult.success ? (
                                        <Badge className="bg-green-500 hover:bg-green-600">
                                          Conectado — latência {redisTestResult.latencyMs}ms
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive">
                                          Falha: {redisTestResult.error}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* INFO */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30 text-center">
                                    <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">Fila Mensagens WhatsApp</h4>
                                  </div>
                                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30 text-center">
                                    <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Rate limit CobrAI</h4>
                                  </div>
                                  <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg border border-orange-100 dark:border-orange-900/30 text-center">
                                    <h4 className="text-xs font-bold text-orange-700 dark:text-orange-400 mb-1">Cache Sessões Ativas</h4>
                                  </div>
                                  <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30 text-center">
                                    <h4 className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">Deduplicação de Mensagens</h4>
                                  </div>
                                </div>

                              </CardContent>
                            </Card>
                          </TabsContent>
                        </Tabs>

                        <Button 
                          onClick={async () => {
                            setIsSavingKeys(true);
                            await saveIntegrationKeys(integrationKeys);
                            setIsSavingKeys(false);
                            toast.success("Chaves de integração salvas com sucesso!");
                          }}
                          disabled={isSavingKeys}
                        >
                          {isSavingKeys ? "Salvando..." : "Salvar Configurações"}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}

                <TabsContent value="team" className="mt-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Membros da Equipe</CardTitle>
                        <CardDescription>Gerencie quem tem acesso ao dashboard e seus níveis de permissão.</CardDescription>
                      </div>
                      <Button onClick={() => setIsTeamMemberDialogOpen(true)} className="gap-2">
                        <Plus size={18} /> Novo Membro
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teamMembers.map((member) => (
                          <div key={member.id} className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={member.photoUrl || member.avatarUrl} />
                              <AvatarFallback className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                {member.name?.slice(0, 2).toUpperCase() || '??'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{member.name}</p>
                              <p className="text-[10px] text-zinc-500 truncate">{member.email}</p>
                              <Badge variant="secondary" className="mt-1 text-[8px] h-4">{member.role}</Badge>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-zinc-400 hover:text-red-600"
                              onClick={() => handleDeleteTeamMember(member.id)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        ))}
                        {teamMembers.length === 0 && (
                          <div className="col-span-full py-12 text-center border-2 border-dashed rounded-2xl border-zinc-100">
                            <Users size={32} className="mx-auto text-zinc-200 mb-2" />
                            <p className="text-zinc-400 text-sm">Nenhum membro cadastrado.</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

              </Tabs>
            </motion.div>
          
  );
}
