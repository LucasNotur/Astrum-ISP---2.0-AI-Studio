import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, apiPost } from '@/src/lib/apiClient';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2, Link2, ChevronDown, ChevronUp } from 'lucide-react';

interface ErpProvider {
  id: string;
  label: string;
  icon: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}

const ERP_PROVIDERS: ErpProvider[] = [
  {
    id: 'ixc', label: 'IXC Provedor', icon: '🔗',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://ixc.seudominio.com.br' },
      { key: 'token', label: 'Token de API', placeholder: 'seu-token-ixc', type: 'password' },
      { key: 'integrationKey', label: 'Chave de Integração', placeholder: 'chave-ixc' },
    ],
  },
  {
    id: 'mkauth', label: 'MKAuth', icon: '🔑',
    fields: [
      { key: 'url', label: 'URL do servidor', placeholder: 'https://mk.seudominio.com.br' },
      { key: 'user', label: 'Usuário', placeholder: 'admin' },
      { key: 'password', label: 'Senha', placeholder: '••••••••', type: 'password' },
    ],
  },
  {
    id: 'sgp', label: 'SGP', icon: '🌐',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://sgp.seudominio.com.br' },
      { key: 'token', label: 'Token', placeholder: 'seu-token-sgp', type: 'password' },
    ],
  },
  {
    id: 'voalle', label: 'Voalle', icon: '⚡',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://voalle.seudominio.com.br' },
      { key: 'clientId', label: 'Client ID', placeholder: 'client-id' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: '••••••••', type: 'password' },
    ],
  },
  {
    id: 'hubsoft', label: 'HubSoft', icon: '🏢',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://hubsoft.seudominio.com.br' },
      { key: 'token', label: 'Token', placeholder: 'seu-token-hubsoft', type: 'password' },
    ],
  },
  {
    id: 'radiusnet', label: 'RadiusNet', icon: '📡',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://radiusnet.seudominio.com.br' },
      { key: 'user', label: 'Usuário', placeholder: 'admin' },
      { key: 'password', label: 'Senha', placeholder: '••••••••', type: 'password' },
    ],
  },
  {
    id: 'rbx', label: 'RBX', icon: '🔒',
    fields: [
      { key: 'url', label: 'URL da API', placeholder: 'https://rbx.seudominio.com.br' },
      { key: 'token', label: 'Token', placeholder: 'seu-token-rbx', type: 'password' },
    ],
  },
];

interface CredRow { provider: string; active: boolean }

export function ERPIntegrationsPage() {
  const { user } = useAppStore();
  const tenantId: string = user?.tenantId ?? 'default';

  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || tenantId === 'default') return;
    loadConnectedStatus();
  }, [tenantId]);

  async function loadConnectedStatus() {
    // F1-D2 — antes ia direto ao Supabase anônimo (bloqueado pela migration 092).
    // Reaproveita a rota do wizard de credenciais ERP (P0-01, `erp-admin.routes.ts`),
    // já em uso por SettingsPage.tsx.
    try {
      const { credentials } = await apiGet<{ credentials: CredRow[] }>('/api/v2/erp/credentials');
      const map: Record<string, boolean> = {};
      (credentials ?? []).forEach(r => { map[r.provider] = r.active; });
      setConnected(map);
    } catch {}
  }

  const setField = (provider: string, key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [provider]: { ...(prev[provider] ?? {}), [key]: value } }));
  };

  const saveProvider = async (providerId: string) => {
    setSaving(providerId);
    try {
      // erp-admin.routes.ts nunca devolve a credencial cifrada de volta (POST-only,
      // sem endpoint de leitura do segredo) — os campos ficam sempre em branco no
      // formulário, mesmo padrão já usado pelas credenciais ERP de SettingsPage.tsx.
      await apiPost('/api/v2/erp/credentials', {
        provider: providerId,
        credentials: fieldValues[providerId] ?? {},
        active: true,
      });
      toast.success(`Credenciais ${ERP_PROVIDERS.find(p => p.id === providerId)?.label} salvas`);
      await loadConnectedStatus();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(null);
    }
  };

  const testProvider = async (providerId: string) => {
    setTesting(providerId);
    try {
      // Testa a credencial JÁ SALVA (cifrada no servidor) — salve antes de testar.
      await apiPost(`/api/v2/erp/credentials/${providerId}/test`, {});
      toast.success(`Conexão com ${ERP_PROVIDERS.find(p => p.id === providerId)?.label} OK`);
      setConnected(prev => ({ ...prev, [providerId]: true }));
    } catch (e: any) {
      toast.error(`Falha: ${e.message}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold">Integrações ERP</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure a integração com o sistema de gestão do seu provedor. As credenciais são cifradas em repouso.
        </p>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        {ERP_PROVIDERS.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-900 rounded-full border text-xs shadow-sm">
            <span>{p.icon}</span>
            <span className="font-medium">{p.label}</span>
            {connected[p.id]
              ? <CheckCircle size={12} className="text-green-500" />
              : <XCircle size={12} className="text-zinc-300" />
            }
          </div>
        ))}
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        {ERP_PROVIDERS.map(provider => {
          const isConnected = connected[provider.id] === true;
          const isOpen = expanded === provider.id;
          const vals = fieldValues[provider.id] ?? {};

          return (
            <Card key={provider.id} className="border-none shadow-sm">
              <CardHeader
                className="pb-0 cursor-pointer select-none"
                onClick={() => setExpanded(isOpen ? null : provider.id)}
              >
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{provider.icon}</span>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{provider.label}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {isConnected ? 'Conectado e ativo' : 'Não configurado'}
                      </CardDescription>
                    </div>
                    <Badge variant={isConnected ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                      {isConnected ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isConnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={e => { e.stopPropagation(); testProvider(provider.id); }}
                        disabled={testing === provider.id}
                      >
                        {testing === provider.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                        Testar
                      </Button>
                    )}
                    {isOpen ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {provider.fields.map(f => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs">{f.label}</Label>
                        <Input
                          type={f.type ?? 'text'}
                          placeholder={f.placeholder}
                          value={vals[f.key] ?? ''}
                          onChange={e => setField(provider.id, f.key, e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveProvider(provider.id)}
                      disabled={saving === provider.id}
                    >
                      {saving === provider.id ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                      Salvar credenciais
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testProvider(provider.id)}
                      disabled={testing === provider.id}
                    >
                      {testing === provider.id ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                      Testar conexão
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
