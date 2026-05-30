import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Ticket, Book, Globe, Clock, MessageSquare, Phone, Briefcase, Bot, Map as MapIcon, CreditCard, Plus, Trash2, Users } from "lucide-react";
import { useNavigate } from 'react-router-dom';

import { cn } from '@/src/lib/utils';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { Save, Bug, Database, BellRing, LogOut, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, getDocs, orderBy, limit, doc, setDoc, deleteDoc, updateDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { signOut, multiFactor, TotpMultiFactorGenerator, TotpSecret } from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import { useAppStore } from '../store/useAppStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";


const AVAILABLE_MENUS = [
  { id: 'dashboard', label: 'Dashboard', group: 'Operação Diária' },
  { id: 'customers', label: 'Clientes', group: 'Atendimento' },
  { id: 'tickets', label: 'Tickets (Suporte)', group: 'Atendimento' },
  { id: 'chat', label: 'Chat', group: 'Atendimento' },
  { id: 'os', label: 'CRM Técnico / OS', group: 'Atendimento' },
  { id: 'billing', label: 'Financeiro', group: 'Infra & Gestão' },
  { id: 'inventory', label: 'Estoque', group: 'Infra & Gestão' },
  { id: 'map', label: 'Mapa de Cobertura', group: 'Infra & Gestão' },
  { id: 'team', label: 'Equipe', group: 'Infra & Gestão' },
  { id: 'ai-config', label: 'Núcleo IA', group: 'Inteligência & Automação' },
  { id: 'cobrai', label: 'CobrAI', group: 'Inteligência & Automação' },
  { id: 'kb', label: 'Base de Conhecimento', group: 'Inteligência & Automação' },
  { id: 'bi', label: 'Business Intelligence', group: 'Relatórios e Monitoria' },
  { id: 'quality-monitor', label: 'Monitor de Qualidade', group: 'Relatórios e Monitoria' },
  { id: 'observability', label: 'Logs e Auditoria IA', group: 'Relatórios e Monitoria' },
  { id: 'monitoring', label: 'Monitoramento (Falhas)', group: 'Relatórios e Monitoria' },
  { id: 'whatsapp', label: 'Conexões WhatsApp', group: 'Configurações Globais' },
  { id: 'settings', label: 'Configurações Gerais', group: 'Configurações Globais' }
];

const ROLES = [
  { id: 'admin', label: 'Desenvolvedor' },
  { id: 'owner', label: 'Provedor (Admin)' },
  { id: 'support', label: 'Suporte' },
  { id: 'tecnico', label: 'Técnico' }
];

const DEFAULT_PERMISSIONS = {
  admin: ['dashboard', 'customers', 'tickets', 'chat', 'os', 'billing', 'inventory', 'map', 'team', 'ai-config', 'cobrai', 'kb', 'bi', 'quality-monitor', 'observability', 'monitoring', 'whatsapp', 'settings'],
  owner: ['dashboard', 'customers', 'tickets', 'chat', 'os', 'billing', 'inventory', 'map', 'team', 'ai-config', 'cobrai', 'kb', 'bi', 'quality-monitor', 'observability', 'monitoring', 'whatsapp', 'settings'],
  support: ['dashboard', 'customers', 'tickets', 'chat', 'kb'],
  tecnico: ['dashboard', 'os', 'kb', 'map']
};

export function SettingsPage(props: any) {
  const {
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
  } = props;

  const navigate = useNavigate();
  const { user, rolePermissions } = useAppStore();
  const tenantId = user?.tenantId || 'DEFAULT_TENANT';

  const [editingRolePermissions, setEditingRolePermissions] = useState<Record<string, Record<string, any>>>({});

  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [totpUrl, setTotpUrl] = useState<string | null>(null);
  const [totpPin, setTotpPin] = useState('');
  const [isEnrollingMfa, setIsEnrollingMfa] = useState(false);
  const [mfaError, setMfaError] = useState('');
  
  useEffect(() => {
    if (rolePermissions && Object.keys(rolePermissions).length > 0) {
      setEditingRolePermissions(rolePermissions);
    } else if (companySettings?.rolePermissions) {
      // Convert old format to new format
      const converted: Record<string, Record<string, any>> = {};
      Object.keys(companySettings.rolePermissions).forEach(role => {
         const perms = companySettings.rolePermissions[role];
         converted[role] = {};
         if (Array.isArray(perms)) {
            perms.forEach((p: string) => converted[role][p] = ['read', 'manage']);
         }
      });
      setEditingRolePermissions(converted);
    } else {
      // Convert default format
      const converted: Record<string, Record<string, any>> = {};
      Object.keys(DEFAULT_PERMISSIONS).forEach(role => {
         const perms = (DEFAULT_PERMISSIONS as any)[role];
         converted[role] = {};
         if (Array.isArray(perms)) {
            perms.forEach((p: string) => converted[role][p] = ['read', 'manage']);
         }
      });
      setEditingRolePermissions(converted);
    }
  }, [rolePermissions, companySettings?.rolePermissions]);

  const togglePermission = (role: string, menuId: string) => {
    setEditingRolePermissions(prev => {
      const rolePerms = { ...(prev[role] || {}) };
      
      const hasPerm = rolePerms[menuId] && (rolePerms[menuId] === '*' || (Array.isArray(rolePerms[menuId]) && rolePerms[menuId].length > 0));
      
      if (hasPerm) {
         delete rolePerms[menuId];
      } else {
         rolePerms[menuId] = ['read', 'manage'];
      }
      
      return { ...prev, [role]: rolePerms };
    });
  };

  const startMfaEnrollment = async () => {
    setIsEnrollingMfa(true);
    setMfaError('');
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Usuário não autenticado');
      
      const multiFactorSession = await multiFactor(currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession);
      const url = secret.generateQrCodeUrl(currentUser.email || 'user', 'Astrum AI');
      
      setTotpSecret(secret);
      setTotpUrl(url);
    } catch (e: any) {
      setMfaError(e.message || 'Erro ao iniciar MFA');
      setIsEnrollingMfa(false);
    }
  };

  const confirmMfaEnrollment = async () => {
    if (!totpSecret || !totpPin) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Usuário não autenticado');
      
      const totpAssertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, totpPin);
      await multiFactor(currentUser).enroll(totpAssertion, 'Autenticador');
      
      toast.success('MFA ativado com sucesso!');
      setIsEnrollingMfa(false);
      setTotpSecret(null);
      setTotpUrl(null);
      setTotpPin('');
    } catch (e: any) {
       toast.error(e.message || 'Código inválido');
    }
  };

  const savePermissions = async () => {
    if (!tenantId || tenantId === 'DEFAULT_TENANT') {
      toast.error('Tenant não identificado.');
      return;
    }
    
    try {
      toast.info('Salvando permissões...', { id: 'save-perms' });
      
      // Save granular format in role_permissions collection
      const promises = Object.keys(editingRolePermissions).map(async (role) => {
         const perms = editingRolePermissions[role];
         // Search by tenant_id and role_name
         const q = query(collection(db, "role_permissions"), orderBy('role_name'));
         // Just to be safe, query using where. But we don't have composite index maybe?
         // Let's just use doc ID like `tenant_id_role_name`
         const docId = `${tenantId}_${role}`;
         await setDoc(doc(db, 'role_permissions', docId), {
            tenant_id: tenantId,
            role_name: role,
            permissions: perms,
            updatedAt: new Date()
         }, { merge: true });
      });
      
      await Promise.all(promises);
      
      toast.success('Permissões salvas com sucesso!', { id: 'save-perms' });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar as permissões.', { id: 'save-perms' });
    }
  };
  
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

  const [ssoDomain, setSsoDomain] = useState<string>('');
  const [isSavingSso, setIsSavingSso] = useState(false);

  const [customDomain, setCustomDomain] = useState<string>('');
  const [domainStatus, setDomainStatus] = useState<'none'|'pending'|'verified'|'error'>('none');
  const [isVerifyingDomain, setIsVerifyingDomain] = useState(false);

  const verifyDomain = async () => {
    setIsVerifyingDomain(true);
    try {
        const res = await fetch(`/api/domains/verify?domain=${customDomain}`);
        const data = await res.json();
        if (data.status === 'verified') {
           setDomainStatus('verified');
           toast.success("Domínio verificado com sucesso!");
        } else {
           setDomainStatus('error');
           toast.error(data.error || "Erro ao verificar domínio. Verifique as configurações de DNS.");
        }
    } catch(e: any) {
        setDomainStatus('error');
        toast.error("Erro na verificação de DNS.");
    } finally {
        setIsVerifyingDomain(false);
    }
  };

  const saveSsoConfig = async () => {
    if (!tenantId || tenantId === 'DEFAULT_TENANT') {
      toast.error('Tenant não identificado.');
      return;
    }
    
    setIsSavingSso(true);
    try {
      const docRef = doc(db, 'tenants', tenantId);
      await setDoc(docRef, { sso_config: { domain: ssoDomain.trim() } }, { merge: true });
      toast.success('Configurações de SSO salvas com sucesso!');
    } catch (e: any) {
      toast.error('Erro ao salvar as configurações: ' + e.message);
    } finally {
      setIsSavingSso(false);
    }
  };

  const [departments, setDepartments] = useState<any[]>([]);
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);

  const [deptForm, setDeptForm] = useState({ name: '', sla_response_minutes: 15, sla_resolution_hours: 24, required_skills: [] as string[], color: '#3b82f6', routing_mode: 'load_balanced' });

  const [themeConfig, setThemeConfig] = useState({
    primary_color: '#3b82f6',
    secondary_color: '#10b981',
    font_family: 'Inter',
    logo_url: '',
    login_background_url: ''
  });

  const [isSavingTheme, setIsSavingTheme] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'DEFAULT_TENANT') return;
    const unsub = onSnapshot(doc(db, "tenants", tenantId, "settings", "theme"), (snap) => {
       if (snap.exists()) {
           setThemeConfig(prev => ({ ...prev, ...snap.data() }));
       }
    });
    return () => unsub();
  }, [tenantId]);

  const saveThemeConfig = async () => {
     setIsSavingTheme(true);
     try {
        await setDoc(doc(db, "tenants", tenantId, "settings", "theme"), themeConfig, { merge: true });
        toast.success("Tema salvo com sucesso!");
     } catch(e) {
        toast.error("Erro ao salvar tema.");
     } finally {
        setIsSavingTheme(false);
     }
  };

  useEffect(() => {
    if (!tenantId || tenantId === 'DEFAULT_TENANT') return;
    const unsub = onSnapshot(collection(db, "tenants", tenantId, "departments"), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsub(); };
  }, [tenantId]);

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
      if (snap.exists()) {
        const d = snap.data();
        if (d.vector_store_config) {
          setVectorConfig(d.vector_store_config);
        }
        if (d.sso_config?.domain) {
          setSsoDomain(d.sso_config.domain);
        }
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
  const [holidays, setHolidays] = useState<any[]>([]);
  const [isFetchingHolidays, setIsFetchingHolidays] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', type: 'municipal' });

  useEffect(() => {
     if (!tenantId || tenantId === 'DEFAULT_TENANT') return;
     const unsub = onSnapshot(collection(db, "holidays", tenantId, "dates"), (snap) => {
        const list = snap.docs.map(doc => doc.data());
        list.sort((a,b) => a.date.localeCompare(b.date));
        setHolidays(list);
     });
     return () => unsub();
  }, [tenantId]);

  const handleFetchHolidays = async () => {
      setIsFetchingHolidays(true);
      try {
         const res = await fetch("/api/settings/holidays/fetch-national", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenantId })
         });
         const data = await res.json();
         if (res.ok) {
            toast.success(`Foram carregados ${data.count} feriados nacionais!`);
         } else {
            toast.error(data.error || "Erro ao carregar feriados");
         }
      } catch (e) {
         toast.error("Erro ao carregar feriados");
      } finally {
         setIsFetchingHolidays(false);
      }
  };

  const handleAddHoliday = async () => {
      if (!newHoliday.date || !newHoliday.name) {
          toast.error("Preencha data e nome do feriado.");
          return;
      }
      try {
          const ref = doc(db, "holidays", tenantId, "dates", newHoliday.date);
          await setDoc(ref, newHoliday, { merge: true });
          toast.success("Feriado adicionado!");
          setNewHoliday({ date: '', name: '', type: 'municipal' });
      } catch(e) {
          toast.error("Erro ao adicionar");
      }
  };

  const handleDeleteHoliday = async (date: string) => {
      try {
          await deleteDoc(doc(db, "holidays", tenantId, "dates", date));
          toast.success("Feriado removido");
      } catch(e) {
          toast.error("Erro ao remover");
      }
  };


  
  const [redisStatus, setRedisStatus] = useState<any>(null);
  const [testRedisUrl, setTestRedisUrl] = useState("");
  const [isTestingRedis, setIsTestingRedis] = useState(false);
  const [redisTestResult, setRedisTestResult] = useState<any>(null);

  const [ixcCredentials, setIxcCredentials] = useState({ url: '', token: '', integrationKey: '' });
  const [isTestingIXC, setIsTestingIXC] = useState(false);
  const [voalleCredentials, setVoalleCredentials] = useState({ url: '', clientId: '', clientSecret: '' });
  const [isTestingVoalle, setIsTestingVoalle] = useState(false);
  const [hubsoftCredentials, setHubsoftCredentials] = useState({ url: '', token: '' });
  const [isTestingHubsoft, setIsTestingHubsoft] = useState(false);
  const [sgpCredentials, setSgpCredentials] = useState({ url: '', token: '' });
  const [isTestingSgp, setIsTestingSgp] = useState(false);
  const [rbxCredentials, setRbxCredentials] = useState({ url: '', token: '' });
  const [isTestingRbx, setIsTestingRbx] = useState(false);
  
  const fetchIXCCredentials = async () => {
    try {
      const res = await fetch(`/api/integrations/ixc?tenantId=${tenantId}`);
      if (res.ok) {
        setIxcCredentials(await res.json());
      }
    } catch(e) {}
  };

  const fetchVoalleCredentials = async () => {
    try {
      const res = await fetch(`/api/integrations/voalle?tenantId=${tenantId}`);
      if (res.ok) {
        setVoalleCredentials(await res.json());
      }
    } catch(e) {}
  };

  const fetchHubsoftCredentials = async () => {
    try {
      const res = await fetch(`/api/integrations/hubsoft?tenantId=${tenantId}`);
      if (res.ok) {
        setHubsoftCredentials(await res.json());
      }
    } catch(e) {}
  };

  const fetchSgpCredentials = async () => {
    try {
      const res = await fetch(`/api/integrations/sgp?tenantId=${tenantId}`);
      if (res.ok) {
        setSgpCredentials(await res.json());
      }
    } catch(e) {}
  };

  const fetchRbxCredentials = async () => {
    try {
      const res = await fetch(`/api/integrations/rbx?tenantId=${tenantId}`);
      if (res.ok) {
        setRbxCredentials(await res.json());
      }
    } catch(e) {}
  };

  useEffect(() => {
    fetchIXCCredentials();
    fetchVoalleCredentials();
    fetchHubsoftCredentials();
    fetchSgpCredentials();
    fetchRbxCredentials();
  }, [tenantId]);

  const saveVoalleCredentials = async () => {
    try {
      toast.info('Salvando credenciais Voalle...');
      const res = await fetch('/api/integrations/voalle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...voalleCredentials, tenantId })
      });
      if (res.ok) {
        toast.success('Credenciais Voalle salvas com sucesso!');
        fetchVoalleCredentials();
      } else {
        toast.error('Falha ao salvar credenciais Voalle.');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais Voalle.');
    }
  };

  const testVoalleConnection = async () => {
    setIsTestingVoalle(true);
    try {
      const res = await fetch('/api/integrations/voalle/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...voalleCredentials, tenantId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Conexão bem sucedida.`);
      } else {
        toast.error(`Falha no teste: ${data.error}`);
      }
    } catch(e: any) {
      toast.error(`Erro ao testar: ${e.message}`);
    } finally {
      setIsTestingVoalle(false);
    }
  };

  const saveHubsoftCredentials = async () => {
    try {
      toast.info('Salvando credenciais HubSoft...');
      const res = await fetch('/api/integrations/hubsoft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...hubsoftCredentials, tenantId })
      });
      if (res.ok) {
        toast.success('Credenciais HubSoft salvas com sucesso!');
        fetchHubsoftCredentials();
      } else {
        toast.error('Falha ao salvar credenciais HubSoft.');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais HubSoft.');
    }
  };

  const testHubsoftConnection = async () => {
    setIsTestingHubsoft(true);
    try {
      const res = await fetch('/api/integrations/hubsoft/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...hubsoftCredentials, tenantId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Conexão bem sucedida. Clientes listados ou autenticação validada.`);
      } else {
        toast.error(`Falha no teste: ${data.error}`);
      }
    } catch(e: any) {
      toast.error(`Erro ao testar: ${e.message}`);
    } finally {
      setIsTestingHubsoft(false);
    }
  };

  const saveSgpCredentials = async () => {
    try {
      toast.info('Salvando credenciais SGP...');
      const res = await fetch('/api/integrations/sgp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sgpCredentials, tenantId })
      });
      if (res.ok) {
        toast.success('Credenciais SGP salvas com sucesso!');
        fetchSgpCredentials();
      } else {
        toast.error('Falha ao salvar credenciais SGP.');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais SGP.');
    }
  };

  const testSgpConnection = async () => {
    setIsTestingSgp(true);
    try {
      const res = await fetch('/api/integrations/sgp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sgpCredentials, tenantId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Conexão bem sucedida.`);
      } else {
        toast.error(`Falha no teste: ${data.error}`);
      }
    } catch(e: any) {
      toast.error(`Erro ao testar: ${e.message}`);
    } finally {
      setIsTestingSgp(false);
    }
  };

  const saveRbxCredentials = async () => {
    try {
      toast.info('Salvando credenciais RBX...');
      const res = await fetch('/api/integrations/rbx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rbxCredentials, tenantId })
      });
      if (res.ok) {
        toast.success('Credenciais RBX salvas com sucesso!');
        fetchRbxCredentials();
      } else {
        toast.error('Falha ao salvar credenciais RBX.');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais RBX.');
    }
  };

  const testRbxConnection = async () => {
    setIsTestingRbx(true);
    try {
      const res = await fetch('/api/integrations/rbx/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rbxCredentials, tenantId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Conexão bem sucedida.`);
      } else {
        toast.error(`Falha no teste: ${data.error}`);
      }
    } catch(e: any) {
      toast.error(`Erro ao testar: ${e.message}`);
    } finally {
      setIsTestingRbx(false);
    }
  };

  const saveIXCCredentials = async () => {
    try {
      toast.info('Salvando credenciais IXC...');
      const res = await fetch('/api/integrations/ixc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ixcCredentials, tenantId })
      });
      if (res.ok) {
        toast.success('Credenciais IXC salvas com sucesso!');
        fetchIXCCredentials(); // reload to get masked version
      } else {
        toast.error('Falha ao salvar credenciais IXC.');
      }
    } catch (e) {
      toast.error('Erro ao salvar credenciais IXC.');
    }
  };

  const testIXCConnection = async () => {
    setIsTestingIXC(true);
    try {
      const res = await fetch('/api/integrations/ixc/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ixcCredentials, tenantId })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Conexão IXC bem sucedida! Clientes encontados: ${data.count}`);
      } else {
        toast.error(`Falha: ${data.error}`);
      }
    } catch(e: any) {
      toast.error(`Erro ao testar IXC: ${e.message}`);
    } finally {
      setIsTestingIXC(false);
    }
  };

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

  const handleSaveDepartment = async () => {
    if (!deptForm.name) return toast.error("Nome do departamento é obrigatório");
    try {
      if (editingDeptId && editingDeptId !== 'new') {
        const res = await fetch(`/api/departments/${editingDeptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify(deptForm)
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Departamento atualizado");
      } else {
        const res = await fetch(`/api/departments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
          body: JSON.stringify(deptForm)
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Departamento criado");
      }
      setEditingDeptId(null);
    } catch (e: any) {
      toast.error("Erro ao salvar departamento: " + e.message);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir?")) return;
    try {
      const res = await fetch(`/api/departments/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` }
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Departamento removido");
    } catch (e: any) {
      toast.error("Erro ao remover departamento: " + e.message);
    }
  };

  const [selectedIntegrationMenu, setSelectedIntegrationMenu] = useState<string | null>(null);

  const renderMarketplace = () => {
    const integrations = [
      { id: 'ixc', name: 'IXC Provedor', category: 'ERP', desc: 'Sincronização de clientes e financeiro.', status: ixcCredentials.url ? 'Conectado' : 'Disponível', logo: '🌐' },
      { id: 'mkauth', name: 'MK-Auth', category: 'ERP', desc: 'Integração completa com MK-Auth.', status: integrationKeys.mkAuthUrl ? 'Conectado' : 'Disponível', logo: '☁️' },
      { id: 'voalle', name: 'Voalle', category: 'ERP', desc: 'Gestão de assinantes e contratos.', status: voalleCredentials.url ? 'Conectado' : 'Disponível', logo: '📦' },
      { id: 'radiusnet', name: 'RadiusNet', category: 'ERP', desc: 'Gestão para provedores de internet.', status: integrationKeys.radiusNetUrl ? 'Conectado' : 'Disponível', logo: '📡' },
      { id: 'hubsoft', name: 'HubSoft', category: 'ERP', desc: 'Integração com ERP HubSoft.', status: hubsoftCredentials.url ? 'Conectado' : 'Disponível', logo: '🔌' },
      { id: 'sgp', name: 'SGP', category: 'ERP', desc: 'Integração de billing SGP.', status: sgpCredentials.url ? 'Conectado' : 'Disponível', logo: '🏢' },
      { id: 'rbx', name: 'RBX', category: 'ERP', desc: 'Integração com Softwares RBX.', status: rbxCredentials.url ? 'Conectado' : 'Disponível', logo: '🔗' },
      { id: 'rdstation', name: 'RD Station', category: 'CRM', desc: 'Integração do funil de vendas com RD Station CRM.', status: integrationKeys.rdStationToken ? 'Conectado' : 'Disponível', logo: '🎯' },
      { id: 'pipedrive', name: 'Pipedrive', category: 'CRM', desc: 'Sincronização do funil de Vendas Pipedrive.', status: integrationKeys.pipedriveToken ? 'Conectado' : 'Disponível', logo: '📈' },
      { id: 'hubspotcrm', name: 'HubSpot', category: 'CRM', desc: 'Integração de funil e pipeline HubSpot CRM.', status: integrationKeys.hubspotToken ? 'Conectado' : 'Disponível', logo: '🧡' },
      { id: 'asaas', name: 'Asaas', category: 'Pagamentos', desc: 'Geração de boletos e Pix Asaas.', status: integrationKeys.asaasToken ? 'Conectado' : 'Disponível', logo: '💸' },
      { id: 'gerencianet', name: 'Gerencianet', category: 'Pagamentos', desc: 'Emissão de cobranças (Efí).', status: integrationKeys.gerencianetClientId ? 'Conectado' : 'Disponível', logo: '💳' },
      { id: 'openai', name: 'OpenAI', category: 'IA', desc: 'Modelos GPT-4 e processamento de linguagem.', status: integrationKeys.openaiApiKey ? 'Conectado' : 'Disponível', logo: '🧠' },
      { id: 'gemini', name: 'Google Gemini', category: 'IA', desc: 'Integração nativa com IA Gemini.', status: integrationKeys.geminiApiKey ? 'Conectado' : 'Disponível', logo: '✨' },
      { id: 'anthropic', name: 'Anthropic Claude', category: 'IA', desc: 'Integração com Claude 3.', status: integrationKeys.anthropicApiKey ? 'Conectado' : 'Disponível', logo: '🤖' },
      { id: 'qdrant', name: 'Qdrant (Vector DB)', category: 'IA', desc: 'Banco de dados vetorial para Retrieval.', status: vectorConfig?.url ? 'Conectado' : 'Disponível', logo: '📊' },
      { id: 'evolution', name: 'Evolution API', category: 'Comunicação', desc: 'Gateway para comunicação WhatsApp.', status: integrationKeys.evolutionUrl ? 'Conectado' : 'Disponível', logo: '💬' },
      { id: 'instagram', name: 'Instagram', category: 'Comunicação', desc: 'Integração com Instagram Direct.', status: integrationKeys.instagramToken ? 'Conectado' : 'Disponível', logo: '📸' },
      { id: 'facebook', name: 'Facebook', category: 'Comunicação', desc: 'Integração com Messenger.', status: integrationKeys.facebookToken ? 'Conectado' : 'Disponível', logo: '👍' }
    ];

    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'Conectado': return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-[10px] font-medium border border-green-200 dark:border-green-800 uppercase tracking-wider">{status}</span>;
        case 'Requer upgrade': return <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-[10px] font-medium border border-amber-200 dark:border-amber-800 uppercase tracking-wider">{status}</span>;
        default: return <span className="px-2 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 rounded-full text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 uppercase tracking-wider">{status}</span>;
      }
    };

    const getCategoryColor = (cat: string) => {
      switch (cat) {
        case 'ERP': return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 md:border md:border-blue-100 dark:border-blue-900/30';
        case 'Pagamentos': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 md:border md:border-emerald-100 dark:border-emerald-900/30';
        case 'IA': return 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 md:border md:border-purple-100 dark:border-purple-900/30';
        case 'Comunicação': return 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 md:border md:border-pink-100 dark:border-pink-900/30';
        default: return 'bg-gray-100 text-gray-700';
      }
    };

    const handleConnectClick = (item: any) => {
      if (item.status === 'Requer upgrade') {
         toast.info("Esta integração requer um plano superior. Contate o suporte.");
         return;
      }
      setSelectedIntegrationMenu(item.id);
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {integrations.map((item) => (
           <div key={item.id} className="relative flex flex-col group border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
             
             <div className="flex justify-between items-start mb-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-2xl shadow-inner group-hover:scale-110 transition-transform">
                 {item.logo}
               </div>
               {getStatusBadge(item.status)}
             </div>

             <div className="mb-1 uppercase tracking-wider text-[10px] font-bold">
               <span className={`px-2 py-0.5 rounded-sm ${getCategoryColor(item.category)}`}>
                 {item.category}
               </span>
             </div>
             
             <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base mb-1">{item.name}</h3>
             
             <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-6 flex-grow leading-relaxed">
               {item.desc}
             </p>

             <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
               <Button 
                 variant={item.status === 'Conectado' ? 'outline' : 'default'}
                 className="w-full text-xs font-medium h-9 rounded-lg"
                 onClick={() => handleConnectClick(item)}
               >
                 {item.status === 'Conectado' ? 'Configurar' : 'Conectar'}
               </Button>
             </div>
           </div>
        ))}

        {/* --- DIALOG COMPONENT --- */}
        <Dialog open={selectedIntegrationMenu !== null} onOpenChange={(val) => !val && setSelectedIntegrationMenu(null)}>
           <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                 <DialogTitle>Configurar Integração</DialogTitle>
                 <DialogDescription>
                    Configure as credenciais e conexões da integração selecionada.
                 </DialogDescription>
              </DialogHeader>

              {/* Render specific forms here */}
              {selectedIntegrationMenu === 'mkauth' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>MK-Auth URL</Label>
                        <Input 
                           placeholder="https://sua-url-mkauth.com.br" 
                           value={integrationKeys.mkAuthUrl || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mkAuthUrl: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client ID (API)</Label>
                        <Input 
                           type="password" 
                           placeholder="Insira o Client ID..." 
                           value={integrationKeys.mkAuthClientId || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mkAuthClientId: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client Secret (API)</Label>
                        <Input 
                           type="password" 
                           placeholder="Insira o Client Secret..." 
                           value={integrationKeys.mkAuthClientSecret || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, mkAuthClientSecret: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações MK-Auth salvas com sucesso!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar MK-Auth</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'ixc' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>IXC URL (Ex: https://ixc.seudominio.com.br)</Label>
                        <Input 
                          placeholder="https://sua-url-ixc.com.br" 
                          value={ixcCredentials.url}
                          onChange={(e) => setIxcCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token de Acesso (API Key IXC)</Label>
                        <Input 
                          type="password" 
                          placeholder="Insira o seu token IXC..." 
                          value={ixcCredentials.token}
                          onChange={(e) => setIxcCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveIXCCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testIXCConnection} disabled={isTestingIXC}>
                          {isTestingIXC ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'voalle' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Voalle ERP URL</Label>
                        <Input 
                          placeholder="https://sua-url-voalle.com.br" 
                          value={voalleCredentials.url}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client ID (OAUTH2)</Label>
                        <Input 
                          type="password" 
                          placeholder="Client ID..." 
                          value={voalleCredentials.clientId}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client Secret (OAUTH2)</Label>
                        <Input 
                          type="password" 
                          placeholder="Client Secret..." 
                          value={voalleCredentials.clientSecret}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveVoalleCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testVoalleConnection} disabled={isTestingVoalle}>
                          {isTestingVoalle ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'hubsoft' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>HubSoft ERP URL</Label>
                        <Input 
                          placeholder="https://sua-url-hubsoft.com.br" 
                          value={hubsoftCredentials.url}
                          onChange={(e) => setHubsoftCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token HubSoft</Label>
                        <Input 
                          type="password" 
                          placeholder="Token da API HubSoft..." 
                          value={hubsoftCredentials.token}
                          onChange={(e) => setHubsoftCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveHubsoftCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testHubsoftConnection} disabled={isTestingHubsoft}>
                          {isTestingHubsoft ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'sgp' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>SGP URL</Label>
                        <Input 
                          placeholder="https://sua-url-sgp.com.br" 
                          value={sgpCredentials.url}
                          onChange={(e) => setSgpCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token SGP</Label>
                        <Input 
                          type="password" 
                          placeholder="Token Bearer SGP..." 
                          value={sgpCredentials.token}
                          onChange={(e) => setSgpCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveSgpCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testSgpConnection} disabled={isTestingSgp}>
                          {isTestingSgp ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'rbx' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>RBX URL</Label>
                        <Input 
                          placeholder="https://sua-url-rbx.com.br" 
                          value={rbxCredentials.url}
                          onChange={(e) => setRbxCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token Basic Auth (usuario:senha)</Label>
                        <Input 
                          type="password" 
                          placeholder="usuario:senha ou token base64" 
                          value={rbxCredentials.token}
                          onChange={(e) => setRbxCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveRbxCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testRbxConnection} disabled={isTestingRbx}>
                          {isTestingRbx ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'rdstation' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>RD Station Access Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Cole o Access Token do RD Station CRM..." 
                           value={integrationKeys.rdStationToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, rdStationToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações RD Station salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">
                           Salvar RD Station
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'pipedrive' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Pipedrive API Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Cole o API Token de Integração do Pipedrive..." 
                           value={integrationKeys.pipedriveToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, pipedriveToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações Pipedrive salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">
                           Salvar Pipedrive
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'hubspotcrm' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>HubSpot Private App Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Cole token de acesso do App Privado..." 
                           value={integrationKeys.hubspotToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, hubspotToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações HubSpot salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">
                           Salvar HubSpot
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'evolution' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Evolution API URL</Label>
                        <Input 
                           placeholder="ex: http://sua-vps:8080" 
                           value={integrationKeys.evolutionUrl || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionUrl: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Global API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="Sua Global API Key..." 
                           value={integrationKeys.evolutionApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">
                           {isSavingKeys ? "Salvando..." : "Salvar Configurações"}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'radiusnet' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>RadiusNet URL</Label>
                        <Input 
                           placeholder="https://sua-url.radius.net.br" 
                           value={integrationKeys.radiusNetUrl || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, radiusNetUrl: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>API Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Token do RadiusNet..." 
                           value={integrationKeys.radiusNetToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, radiusNetToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar RadiusNet</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'asaas' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Asaas API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="Chave de API do Asaas..." 
                           value={integrationKeys.asaasToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, asaasToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Asaas</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'gerencianet' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Client ID (Efí)</Label>
                        <Input 
                           type="password" 
                           placeholder="Client ID..." 
                           value={integrationKeys.gerencianetClientId || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, gerencianetClientId: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client Secret (Efí)</Label>
                        <Input 
                           type="password" 
                           placeholder="Client Secret..." 
                           value={integrationKeys.gerencianetClientSecret || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, gerencianetClientSecret: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Gerencianet</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'openai' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>OpenAI API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="sk-..." 
                           value={integrationKeys.openaiApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar OpenAI</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'gemini' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Google Gemini API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="AIzaSy..." 
                           value={integrationKeys.geminiApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Gemini</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'anthropic' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Anthropic API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="sk-ant-..." 
                           value={integrationKeys.anthropicApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, anthropicApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Anthropic</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'qdrant' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Qdrant URL</Label>
                        <Input 
                           placeholder="https://sua-instancia.qdrant.tech" 
                           value={integrationKeys.qdrantUrl || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, qdrantUrl: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Qdrant API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="Sua API Key do Qdrant..." 
                           value={integrationKeys.qdrantApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, qdrantApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Qdrant</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'instagram' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Instagram Access Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Token de acesso longo do Instagram..." 
                           value={integrationKeys.instagramToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, instagramToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Instagram</Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'facebook' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Facebook Page Token</Label>
                        <Input 
                           type="password" 
                           placeholder="Token de acesso da Página do Facebook..." 
                           value={integrationKeys.facebookToken || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, facebookToken: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">Salvar Facebook</Button>
                      </div>
                  </div>
              )}
           </DialogContent>
        </Dialog>
      </div>
    );
  };


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
                  <TabsTrigger value="billing">Assinatura / Faturamento</TabsTrigger>
                  {isAstrum && <TabsTrigger value="integrations">Integrações (APIs)</TabsTrigger>}
                  <TabsTrigger value="team">Equipe</TabsTrigger>
                  <TabsTrigger value="departments">Departamentos</TabsTrigger>
                  <TabsTrigger value="holidays">Feriados</TabsTrigger>
                  <TabsTrigger value="theme">Personalização (Tema)</TabsTrigger>
                  <TabsTrigger value="security">Segurança (MFA)</TabsTrigger>
                  <TabsTrigger value="sso">SSO (Google)</TabsTrigger>
                  <TabsTrigger value="custom_domain">Domínio Customizado</TabsTrigger>
                  {isAstrum && <TabsTrigger value="permissions">Perfis e Permissões</TabsTrigger>}
                  <TabsTrigger value="advanced">Avançado / Developer</TabsTrigger>
                </TabsList>
                
                <TabsContent value="billing" className="mt-6">
                  <div className="grid grid-cols-1 gap-6 max-w-4xl">
                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-xl">Sua Assinatura Atual</CardTitle>
                        <CardDescription>Gerencie seu plano e método de pagamento da plataforma.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-800/50 flex-col sm:flex-row gap-4">
                          <div>
                            <h4 className="font-semibold text-lg uppercase">Plano Pro</h4>
                            <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                              Status: <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-normal">Ativa</Badge>
                            </div>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                              Próxima renovação: 15/11/2026
                            </p>
                          </div>
                          <div className="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0">
                            <p className="text-2xl font-bold">R$ 299,00</p>
                            <p className="text-xs text-zinc-500">/mês</p>
                          </div>
                        </div>
                        
                        <div className="pt-4 border-t dark:border-zinc-800">
                           <h4 className="font-medium text-sm mb-4">Método de Pagamento</h4>
                           <div className="flex items-center justify-between p-4 border rounded-lg">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-8 bg-zinc-200 dark:bg-zinc-700 rounded flex items-center justify-center shrink-0">
                                   <CreditCard size={20} className="text-zinc-500" />
                                </div>
                                <div>
                                   <p className="text-sm font-medium">Cartão de Crédito</p>
                                   <p className="text-xs text-zinc-500">**** **** **** 1234</p>
                                </div>
                              </div>
                              <Button variant="outline" size="sm">Atualizar</Button>
                           </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

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
                        <div className="pt-4 flex flex-col sm:flex-row gap-3">
                          <Button className="w-full sm:w-auto" onClick={saveCompanySettings}>
                            Salvar Alterações
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="mt-6">
                  <div className="grid grid-cols-1 gap-6">
                    <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
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

                    {isAstrum && (
                      <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                        <CardHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 rounded-t-xl">
                          <CardTitle className="uppercase text-xs text-zinc-500">Ferramentas de Desenvolvedor</CardTitle>
                          <CardDescription>
                            Ações perigosas para popular ou redefinir a base de dados em ambiente de teste.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
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
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>

                {isAstrum && (

                  <TabsContent value="integrations" className="mt-6">
                    <Card className="border-none shadow-sm">
                      <CardHeader>
                        <CardTitle>Marketplace de Integrações</CardTitle>
                        <CardDescription>
                          Conecte ferramentas externas para turbinar os recursos do Astrum.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                         {renderMarketplace()}
                      </CardContent>
                    </Card>
                  </TabsContent>

                )}

                <TabsContent value="departments" className="mt-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Departamentos</CardTitle>
                        <CardDescription>Configure os departamentos e SLAs (Acordos de Nível de Serviço).</CardDescription>
                      </div>
                      <Button onClick={() => {
                        setEditingDeptId('new');
                        setDeptForm({ name: '', sla_response_minutes: 15, sla_resolution_hours: 24, required_skills: [], color: '#3b82f6', routing_mode: 'manual' });
                      }} className="gap-2">
                        <Plus size={16} /> Novo Departamento
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Dialog open={editingDeptId !== null} onOpenChange={(val) => !val && setEditingDeptId(null)}>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{editingDeptId === 'new' ? 'Novo Departamento' : 'Editar Departamento'}</DialogTitle>
                            <DialogDescription>Configure os detalhes do departamento.</DialogDescription>
                          </DialogHeader>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Nome do Departamento</Label>
                              <Input value={deptForm.name} onChange={e => setDeptForm({...deptForm, name: e.target.value})} placeholder="Ex: Suporte N1" />
                            </div>
                            <div>
                              <Label>Cor Identificadora</Label>
                              <div className="flex gap-2 items-center mt-2">
                                <input type="color" value={deptForm.color} onChange={e => setDeptForm({...deptForm, color: e.target.value})} className="h-8 w-8 rounded cursor-pointer" />
                                <span className="text-xs text-zinc-500 uppercase">{deptForm.color}</span>
                              </div>
                            </div>
                            <div>
                              <Label>SLA de Resposta (Minutos)</Label>
                              <Input type="number" value={deptForm.sla_response_minutes} onChange={e => setDeptForm({...deptForm, sla_response_minutes: Number(e.target.value)})} />
                            </div>
                            <div>
                              <Label>SLA de Resolução (Horas)</Label>
                              <Input type="number" value={deptForm.sla_resolution_hours} onChange={e => setDeptForm({...deptForm, sla_resolution_hours: Number(e.target.value)})} />
                            </div>
                            <div className="md:col-span-2">
                              <Label>Modo de Roteamento</Label>
                              <Select value={deptForm.routing_mode || 'load_balanced'} onValueChange={(v) => setDeptForm({...deptForm, routing_mode: v})}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="load_balanced">Balanceado por Carga (Menos chats -&gt; Maior prioridade)</SelectItem>
                                  <SelectItem value="round_robin">Round Robin (Distribuição circular igualitária)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-2">
                              <Label>Habilidades Necessárias (Skills separadas por vírgula)</Label>
                              <Input 
                                value={deptForm.required_skills.join(", ")} 
                                onChange={e => setDeptForm({...deptForm, required_skills: e.target.value.split(",").map(s => s.trim()).filter(Boolean)})} 
                                placeholder="operação-ixc, rede-ftth, fibra" 
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setEditingDeptId(null)}>Cancelar</Button>
                            <Button onClick={handleSaveDepartment}>Salvar Departamento</Button>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                            <tr>
                              <th className="px-4 py-3 font-medium">Nome</th>
                              <th className="px-4 py-3 font-medium">SLA Resposta</th>
                              <th className="px-4 py-3 font-medium">SLA Resolução</th>
                              <th className="px-4 py-3 font-medium">Skills</th>
                              <th className="px-4 py-3 font-medium text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {departments.map((dept: any) => (
                              <tr key={dept.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50">
                                <td className="px-4 py-3 font-medium flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color || '#3b82f6' }}></span>
                                  {dept.name}
                                </td>
                                <td className="px-4 py-3">{dept.sla_response_minutes} min</td>
                                <td className="px-4 py-3">{dept.sla_resolution_hours} h</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    {dept.required_skills?.map((skill: string) => (
                                      <Badge key={skill} variant="secondary" className="text-[10px]">{skill}</Badge>
                                    ))}
                                    {(!dept.required_skills || dept.required_skills.length === 0) && (
                                       <span className="text-xs text-zinc-400">Nenhuma</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right space-x-2">
                                  <Button variant="ghost" size="sm" onClick={() => {
                                    setDeptForm({
                                      name: dept.name,
                                      sla_response_minutes: dept.sla_response_minutes || 15,
                                      sla_resolution_hours: dept.sla_resolution_hours || 24,
                                      required_skills: dept.required_skills || [],
                                      color: dept.color || '#3b82f6',
                                      routing_mode: dept.routing_mode || 'load_balanced'
                                    });
                                    setEditingDeptId(dept.id);
                                  }}>Editar</Button>
                                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteDepartment(dept.id)}>
                                    <Trash2 size={16} />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {departments.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">Nenhum departamento configurado.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

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
                {isAstrum && (<TabsContent value="permissions" className="mt-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <CardTitle>Perfis e Permissões de Acesso</CardTitle>
                        <CardDescription>Gerencie quais menus cada perfil pode visualizar e acessar.</CardDescription>
                      </div>
                      <Button onClick={savePermissions} className="gap-2">
                        <Save size={18} /> Salvar Permissões
                      </Button>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                          <tr>
                            <th className="px-4 py-3 min-w-[200px]">Menu / Módulo</th>
                            {ROLES.map(role => (
                              <th key={role.id} className="px-4 py-3 text-center">{role.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {Array.from(new Set(AVAILABLE_MENUS.map(m => m.group))).map((group) => (
                            <React.Fragment key={group}>
                              <tr className="bg-zinc-50/50 dark:bg-zinc-900/50">
                                <td colSpan={ROLES.length + 1} className="px-4 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">{group}</td>
                              </tr>
                              {AVAILABLE_MENUS.filter(m => m.group === group).map(menu => (
                                <tr key={menu.id} className="bg-white dark:bg-zinc-950">
                                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    {menu.label}
                                  </td>
                                  {ROLES.map(role => {
                                    const rolePerms = editingRolePermissions[role.id] || {};
                                    const hasPerm = rolePerms[menu.id] && (rolePerms[menu.id] === '*' || (Array.isArray(rolePerms[menu.id]) && rolePerms[menu.id].length > 0));
                                    return (
                                      <td key={role.id} className="px-4 py-3 text-center">
                                        <Switch 
                                          checked={!!hasPerm}
                                          onCheckedChange={() => togglePermission(role.id, menu.id)}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </TabsContent>)}

                <TabsContent value="security" className="mt-6">
                  <Card className="border-none shadow-sm">
                    <CardHeader>
                      <CardTitle>Segurança da Conta</CardTitle>
                      <CardDescription>
                        Configure métodos de autenticação e proteção da sua conta.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex flex-col space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold">Autenticação de Dois Fatores (2FA)</h3>
                            <p className="text-xs text-zinc-500">Adicione uma camada extra de segurança utilizando o Google Authenticator ou similar.</p>
                          </div>
                          {!totpSecret && (
                             <Button onClick={startMfaEnrollment} disabled={isEnrollingMfa}>
                               Ativar 2FA
                             </Button>
                          )}
                        </div>

                        {totpSecret && totpUrl && (
                           <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-md flex flex-col items-center gap-4">
                             <p className="text-sm">Escaneie o QR Code abaixo com seu aplicativo de autenticação (ex: Google Authenticator)</p>
                             <div className="bg-white p-2 rounded-md">
                                <QRCodeSVG value={totpUrl} size={200} />
                             </div>
                             <div className="w-full max-w-sm space-y-2 mt-2">
                                <Label>Código de 6 dígitos</Label>
                                <Input 
                                  value={totpPin} 
                                  onChange={(e) => setTotpPin(e.target.value)} 
                                  placeholder="123456" 
                                  maxLength={6} 
                                />
                             </div>
                             {mfaError && <p className="text-xs text-red-500">{mfaError}</p>}
                             <div className="flex gap-2 w-full max-w-sm">
                               <Button variant="outline" className="flex-1" onClick={() => {
                                 setTotpSecret(null);
                                 setTotpUrl(null);
                                 setIsEnrollingMfa(false);
                               }}>
                                 Cancelar
                               </Button>
                               <Button className="flex-1" onClick={confirmMfaEnrollment} disabled={totpPin.length < 6}>
                                 Verificar e Ativar
                               </Button>
                             </div>
                           </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="sso" className="mt-6">
                  <Card className="border-none shadow-sm h-full">
                    <CardHeader className="border-b dark:border-zinc-800 pb-4">
                      <CardTitle className="text-xl">SSO Google Workspace</CardTitle>
                      <CardDescription>
                        Configure o domínio do Google Workspace para redirecionamento e permissão automática na sua organização (SSO via Google).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      <div className="space-y-4 max-w-lg">
                        <div>
                          <Label className="text-sm font-medium">Domínio Google Workspace (Ex: suaempresa.com.br)</Label>
                          <Input
                            placeholder="suaempresa.com.br"
                            value={ssoDomain}
                            onChange={(e) => setSsoDomain(e.target.value)}
                            className="mt-1"
                          />
                          <p className="text-xs text-zinc-500 mt-2">
                            Ao configurar este domínio, qualquer acesso pelo Google utilizando este domínio será automaticamente validado e garantido na sua organização.
                          </p>
                        </div>
                        <Button
                          onClick={saveSsoConfig}
                          disabled={isSavingSso}
                          className="w-full sm:w-auto"
                        >
                          {isSavingSso ? 'Salvando...' : 'Salvar Configurações SSO'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="custom_domain" className="mt-6">
                  <Card className="border-none shadow-sm h-full">
                    <CardHeader className="border-b dark:border-zinc-800 pb-4">
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Globe className="text-blue-500" />
                        Domínio Customizado
                      </CardTitle>
                      <CardDescription>
                        Configure um domínio personalizado para acessar a plataforma.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      <div className="space-y-4">
                        <div>
                          <Label>Seu Domínio</Label>
                          <div className="flex gap-4 mt-1">
                            <Input
                              placeholder="ex: painel.minhaempresa.com.br"
                              value={customDomain}
                              onChange={(e) => setCustomDomain(e.target.value)}
                              className="max-w-md"
                            />
                            <Button variant="secondary" onClick={verifyDomain} disabled={!customDomain || isVerifyingDomain}>
                              {isVerifyingDomain ? 'Verificando...' : 'Verificar DNS'}
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          Status:
                          {domainStatus === 'none' && <Badge variant="outline">Não verificado</Badge>}
                          {domainStatus === 'pending' && <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">Pendente</Badge>}
                          {domainStatus === 'verified' && <Badge variant="secondary" className="bg-green-100 text-green-700">Verificado</Badge>}
                          {domainStatus === 'error' && <Badge variant="destructive">Erro na verificação</Badge>}
                        </div>

                        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 mt-6">
                          <h4 className="font-medium text-sm mb-2">Instruções de Configuração no DNS</h4>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                            Crie um registro do tipo <strong>CNAME</strong> no painel de controle do seu domínio com os seguintes dados:
                          </p>
                          <div className="grid grid-cols-2 max-w-sm gap-2 text-sm bg-white dark:bg-zinc-950 p-3 rounded border dark:border-zinc-800">
                            <div className="font-medium text-zinc-500">Tipo</div>
                            <div>CNAME</div>
                            <div className="font-medium text-zinc-500">Nome / Host</div>
                            <div>painel (ou outro subdomínio)</div>
                            <div className="font-medium text-zinc-500">Destino / Valor</div>
                            <div>app.astrum.ai</div>
                          </div>
                          <p className="text-xs text-zinc-500 mt-4">
                            A propagação do DNS pode levar ferramentas até 48 horas, mas normalmente ocorre em alguns minutos.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="holidays" className="mt-6">
                  <Card className="border-none shadow-sm h-full">
                    <CardHeader className="border-b dark:border-zinc-800 pb-4">
                      <CardTitle className="text-xl">Feriados e Datas Comemorativas</CardTitle>
                      <CardDescription>
                        Feriados são dias em que regras de SLA podem pausar e a equipe técnica tem plantão.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl">
                         <div>
                            <h4 className="font-medium text-sm text-zinc-900 dark:text-zinc-100">Feriados Nacionais</h4>
                            <p className="text-xs text-zinc-500">Busque automaticamente feriados nacionais via BrasilAPI.</p>
                         </div>
                         <Button variant="secondary" onClick={handleFetchHolidays} disabled={isFetchingHolidays}>
                            {isFetchingHolidays ? "Buscando..." : "Sincronizar"}
                         </Button>
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">Adicionar Feriado Municipal / Personalizado</h4>
                        <div className="flex gap-4">
                           <div className="w-48">
                              <Label>Data</Label>
                              <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} className="mt-1" />
                           </div>
                           <div className="flex-1">
                              <Label>Nome do Feriado</Label>
                              <Input type="text" placeholder="Ex: Aniversário da Cidade" value={newHoliday.name} onChange={e => setNewHoliday({...newHoliday, name: e.target.value})} className="mt-1" />
                           </div>
                           <div className="flex items-end">
                              <Button onClick={handleAddHoliday}>Adicionar</Button>
                           </div>
                        </div>
                      </div>

                      <div className="space-y-4 mt-8">
                         <h4 className="font-medium text-sm">Feriados Cadastrados ({holidays.length})</h4>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {holidays.map(h => (
                               <div key={h.date} className="flex flex-col border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg bg-zinc-50/50 dark:bg-zinc-900/50 relative group">
                                  <div className="flex items-center justify-between mb-1">
                                     <span className="font-semibold text-sm">{h.date}</span>
                                     <Badge variant={h.type === 'national' ? 'default' : 'secondary'} className="text-[10px]">
                                        {h.type === 'national' ? 'Nacional' : 'Local'}
                                     </Badge>
                                  </div>
                                  <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate" title={h.name}>{h.name}</span>
                                  {h.type !== 'national' && (
                                     <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => handleDeleteHoliday(h.date)}>
                                          <Trash2 size={12} />
                                       </Button>
                                     </div>
                                  )}
                               </div>
                            ))}
                            {holidays.length === 0 && (
                               <div className="col-span-1 md:col-span-3 text-center py-8 text-zinc-500 text-sm">
                                  Nenhum feriado cadastrado. Sincronize os nacionais ou adicione manualmente.
                               </div>
                            )}
                         </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="theme" className="mt-6">
                  <div className="grid grid-cols-1 gap-6">
                    <Card className="border-none shadow-sm h-full">
                      <CardHeader className="border-b dark:border-zinc-800 pb-4">
                        <CardTitle className="text-xl">Personalização da Identidade Visual</CardTitle>
                        <CardDescription>Estilize o sistema com as cores e logo do seu provedor.</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Cor Primária</Label>
                              <div className="flex items-center gap-2 mt-2">
                                <input 
                                  type="color" 
                                  value={themeConfig.primary_color} 
                                  onChange={(e) => {
                                     setThemeConfig({...themeConfig, primary_color: e.target.value});
                                     document.documentElement.style.setProperty('--primary-color', e.target.value);
                                  }} 
                                  className="w-10 h-10 p-0 border-0 rounded cursor-pointer"
                                />
                                <Input 
                                  value={themeConfig.primary_color} 
                                  onChange={(e) => {
                                     setThemeConfig({...themeConfig, primary_color: e.target.value});
                                     document.documentElement.style.setProperty('--primary-color', e.target.value);
                                  }} 
                                  className="w-24"
                                />
                              </div>
                            </div>
                            <div>
                              <Label>Cor Secundária</Label>
                              <div className="flex items-center gap-2 mt-2">
                                <input 
                                  type="color" 
                                  value={themeConfig.secondary_color} 
                                  onChange={(e) => {
                                     setThemeConfig({...themeConfig, secondary_color: e.target.value});
                                     document.documentElement.style.setProperty('--secondary-color', e.target.value);
                                  }}
                                  className="w-10 h-10 p-0 border-0 rounded cursor-pointer"
                                />
                                <Input 
                                  value={themeConfig.secondary_color} 
                                  onChange={(e) => {
                                     setThemeConfig({...themeConfig, secondary_color: e.target.value});
                                     document.documentElement.style.setProperty('--secondary-color', e.target.value);
                                  }}
                                  className="w-24"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <Label>Família de Fonte</Label>
                            <Input 
                              value={themeConfig.font_family} 
                              onChange={(e) => {
                                 setThemeConfig({...themeConfig, font_family: e.target.value});
                                 document.documentElement.style.setProperty('--font-family', e.target.value);
                              }} 
                              placeholder="Ex: Inter, sans-serif" 
                              className="mt-2"
                            />
                          </div>

                          <div>
                            <Label>Logomarca (Upload)</Label>
                            <div className="flex flex-col gap-4 mt-2">
                              <input 
                                type="file" 
                                accept="image/*" 
                                ref={fileInputRef} 
                                onChange={handleLogoUpload} 
                                className="hidden" 
                              />
                              <div 
                                className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center overflow-hidden relative group cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <img 
                                  src={companySettings.logoUrl || themeConfig.logo_url} 
                                  alt="Logo" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <span className="text-white text-[10px] uppercase font-bold text-center p-1">Alterar</span>
                                </div>
                              </div>
                              <p className="text-xs text-zinc-500">Recomendado: 512x512px (PNG ou SVG). Aplicada após salvar na aba Geral também.</p>
                            </div>
                          </div>

                          <div>
                            <Label>URL do Fundo do Login (opcional)</Label>
                            <Input 
                              value={themeConfig.login_background_url} 
                              onChange={(e) => setThemeConfig({...themeConfig, login_background_url: e.target.value})} 
                              placeholder="https://..." 
                              className="mt-2"
                            />
                          </div>

                          <Button onClick={saveThemeConfig}>
                            {isSavingTheme ? "Salvando..." : "Salvar Tema"}
                          </Button>
                        </div>

                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden p-6 relative" style={{ fontFamily: themeConfig.font_family }}>
                          <div className="absolute inset-0 bg-white dark:bg-zinc-950 -z-10" />
                          <h3 className="font-semibold mb-4 text-lg text-zinc-900 dark:text-zinc-100">Live Preview</h3>
                          <div className="space-y-4">
                             <div className="w-full h-32 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${themeConfig.login_background_url || 'https://picsum.photos/seed/bg/400/200'})` }}>
                                <div className="w-full h-full bg-black/40 flex items-center justify-center rounded-lg">
                                   {(themeConfig.logo_url || companySettings.logoUrl) ? (
                                      <img src={companySettings.logoUrl || themeConfig.logo_url} className="h-12 drop-shadow-md" alt="Logo preview" />
                                   ) : (
                                      <span className="text-white font-bold text-xl drop-shadow-md">Seu App</span>
                                   )}
                                </div>
                             </div>
                             
                             <div className="flex gap-2">
                                <Button style={{ backgroundColor: themeConfig.primary_color, color: 'white' }}>Ação Primária</Button>
                                <Button variant="outline" style={{ borderColor: themeConfig.secondary_color, color: themeConfig.secondary_color }}>Ação Secundária</Button>
                             </div>
                             
                             <div className="p-4 rounded border-l-4" style={{ backgroundColor: themeConfig.primary_color + '10', borderColor: themeConfig.primary_color }}>
                                <p className="text-sm font-medium" style={{ color: themeConfig.primary_color }}>Alerta do Sistema Importante</p>
                                <p className="text-xs text-zinc-500 mt-1">Este componente assume a cor primária.</p>
                             </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm h-full">
                      <CardHeader className="border-b dark:border-zinc-800 pb-4">
                        <CardTitle className="text-xl">Opções Regionais</CardTitle>
                        <CardDescription>Configurações de fuso horário e máscara de data.</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6">
                        <div className="max-w-md space-y-4">
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Globe size={16} className="text-zinc-400" /> Fuso Horário
                            </Label>
                            <select
                              value={companySettings.timezone}
                              onChange={(e) => setCompanySettings({ ...companySettings, timezone: e.target.value })}
                              className="w-full text-sm border p-2 rounded-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                            >
                              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                              <option value="America/Manaus">America/Manaus</option>
                              <option value="America/Bogota">America/Bogota</option>
                              <option value="America/New_York">America/New_York</option>
                              <option value="UTC">UTC</option>
                            </select>
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                              <Clock size={16} className="text-zinc-400" /> Formato de Data (Padrão)
                            </Label>
                            <Input value="DD/MM/YYYY" disabled className="bg-zinc-100 dark:bg-zinc-900 text-zinc-500" />
                          </div>
                          
                          <div className="pt-4">
                            <Button className="w-full sm:w-auto" onClick={saveCompanySettings}>
                              Salvar Alterações Regionais
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

              </Tabs>
            </motion.div>
          
  );
}
