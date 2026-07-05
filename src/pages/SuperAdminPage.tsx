import React, { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { StatCard } from "@/src/components/ui/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Switch } from "@/src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Users, DollarSign, Activity, Settings, TrendingUp, TrendingDown, Layers, GitBranch, FlaskConical, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from '@/src/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TenantRow {
  id: string;
  name?: string;
  plan?: string;
  status?: string;
  billing_status?: string;
  monthly_message_count?: number;
  atendimento_engine?: string | null;
}

interface ShadowRow {
  id: string;
  tenant_id: string;
  user_message: string;
  v2_response: string;
  legacy_response: string | null;
  latency_ms: number | null;
  created_at: string;
}

interface FlagRow {
  id: string;
  tenant_id: string;
  flag: string;
  enabled: boolean;
  tenant_name?: string;
}

export const SuperAdminPage = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [shadowRows, setShadowRows] = useState<ShadowRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [engineUpdating, setEngineUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await getToken();

      const [metricsRes, tenantsRes, shadowRes, flagsRes] = await Promise.all([
        fetch("/api/super-admin/metrics", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json()).catch(() => null),
        supabase.from('tenants').select('id,name,plan,status,billing_status,monthly_message_count,atendimento_engine').limit(100),
        supabase.from('shadow_results').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('tenant_feature_flags').select('*').order('created_at', { ascending: false }).limit(200),
      ]);

      if (metricsRes) setMetrics(metricsRes);
      if (tenantsRes.data) setTenants(tenantsRes.data);
      if (shadowRes.data) setShadowRows(shadowRes.data);
      if (flagsRes.data) setFlags(flagsRes.data);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar dados do provedor.");
    } finally {
      setLoading(false);
    }
  };

  const suspendTenant = async (tenantId: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/super-admin/tenants/${tenantId}/suspend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      });
      toast.success("Tenant suspenso com sucesso.");
      fetchData();
    } catch {
      toast.error("Erro ao suspender tenant.");
    }
  };

  const reactivateTenant = async (tenantId: string) => {
    try {
      const token = await getToken();
      await fetch(`/api/super-admin/tenants/${tenantId}/reactivate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      });
      toast.success("Tenant reativado com sucesso.");
      fetchData();
    } catch {
      toast.error("Erro ao reativar tenant.");
    }
  };

  const setTenantEngine = async (tenantId: string, engine: string | null) => {
    setEngineUpdating(tenantId);
    const { error } = await supabase
      .from('tenants')
      .update({ atendimento_engine: engine === 'env' ? null : engine })
      .eq('id', tenantId);
    setEngineUpdating(null);
    if (error) { toast.error('Erro ao atualizar engine'); return; }
    toast.success(`Engine atualizada para ${engine ?? 'padrão do env'}`);
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, atendimento_engine: engine === 'env' ? null : engine } : t));
  };

  const toggleFlag = async (tenantId: string, flag: string, enabled: boolean) => {
    const { error } = await supabase
      .from('tenant_feature_flags')
      .upsert({ tenant_id: tenantId, flag, enabled }, { onConflict: 'tenant_id,flag' });
    if (error) { toast.error('Erro ao alterar flag'); return; }
    setFlags(prev => {
      const existing = prev.find(f => f.tenant_id === tenantId && f.flag === flag);
      if (existing) return prev.map(f => f.tenant_id === tenantId && f.flag === flag ? { ...f, enabled } : f);
      return [...prev, { id: crypto.randomUUID(), tenant_id: tenantId, flag, enabled }];
    });
    toast.success(`Flag "${flag}" ${enabled ? 'ativada' : 'desativada'}`);
  };

  if (loading) {
    return <div className="p-8 text-zinc-500 text-sm">Carregando painel de super admin...</div>;
  }

  const mrrVariation = metrics?.mrr_variation || 0;
  const isMrrUp = mrrVariation >= 0;
  const currentChurn = metrics?.current_churn_rate || 0;
  const previousChurn = metrics?.previous_churn_rate || 0;
  const churnTrend = currentChurn < previousChurn ? 'down' : currentChurn > previousChurn ? 'up' : 'stable';
  const mrrHistory = metrics?.mrr_history || [];
  const topTenants = metrics?.top_tenants || [];

  const shadowAccuracy = shadowRows.length
    ? Math.round((shadowRows.filter(r => r.v2_response && r.legacy_response && r.v2_response !== r.legacy_response).length / shadowRows.length) * 100)
    : 0;

  const CORE_FLAGS = ['cobrai_v2', 'atendimento_v2', 'ai_budget_hard_stop', 'rag_enabled', 'webhook_svix'];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Central de Operações</h1>
        <p className="text-zinc-500 text-sm mt-1">Super admin — gestão de tenants, engines, flags e shadow mode.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="MRR Total"
          value={`R$ ${metrics?.total_mrr?.toFixed(2) || '0.00'}`}
          icon={<DollarSign className="h-4 w-4 text-zinc-500" />}
          description={
            <span className={`flex items-center text-xs mt-1 ${isMrrUp ? 'text-emerald-500' : 'text-red-500'}`}>
              {isMrrUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
              {isMrrUp ? '+' : ''}{mrrVariation.toFixed(2)}% vs mês anterior
            </span>
          }
        />
        <StatCard
          title="Churn Rate"
          value={`${(currentChurn * 100).toFixed(2)}%`}
          icon={<Activity className="h-4 w-4 text-emerald-500" />}
          description={
            <span className={`text-xs mt-1 ${churnTrend === 'down' ? 'text-emerald-500' : churnTrend === 'up' ? 'text-red-500' : 'text-zinc-500'}`}>
              {churnTrend === 'down' ? 'Queda' : churnTrend === 'up' ? 'Aumento' : 'Estável'}
            </span>
          }
        />
        <StatCard title="Tenants Ativos" value={metrics?.active_tenants || tenants.filter(t => t.status === 'active').length} icon={<Users className="h-4 w-4 text-emerald-500" />} />
        <StatCard title="Shadow Comparações" value={shadowRows.length} icon={<FlaskConical className="h-4 w-4 text-purple-500" />}
          description={<span className="text-xs text-purple-500">{shadowAccuracy}% com divergência v2 vs legado</span>}
        />
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants"><Users size={14} className="mr-1" /> Tenants</TabsTrigger>
          <TabsTrigger value="engines"><GitBranch size={14} className="mr-1" /> Engines</TabsTrigger>
          <TabsTrigger value="flags"><Layers size={14} className="mr-1" /> Feature Flags</TabsTrigger>
          <TabsTrigger value="shadow"><FlaskConical size={14} className="mr-1" /> Shadow Report</TabsTrigger>
          <TabsTrigger value="health"><ShieldCheck size={14} className="mr-1" /> Saúde ISPs</TabsTrigger>
        </TabsList>

        {/* ── Tenants ── */}
        <TabsContent value="tenants" className="mt-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Faturamento</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map(tenant => (
                      <TableRow key={tenant.id}>
                        <TableCell className="font-mono text-xs">{tenant.id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-sm">{tenant.name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{tenant.plan ?? 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={tenant.status === 'active' ? 'default' : 'destructive'} className="text-[10px]">
                            {tenant.status ?? 'desconhecido'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{tenant.billing_status ?? 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          {tenant.status === 'suspended' ? (
                            <Button variant="outline" size="sm" onClick={() => reactivateTenant(tenant.id)}>Reativar</Button>
                          ) : (
                            <Button variant="destructive" size="sm" onClick={() => suspendTenant(tenant.id)}>Suspender</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {tenants.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-4 text-zinc-400 text-sm">Nenhum tenant</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Engines ── */}
        <TabsContent value="engines" className="mt-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Engine de Atendimento por Tenant</CardTitle>
              <CardDescription className="text-xs">
                NULL = usa o default da env <code>ATENDIMENTO_ENGINE</code> (legado). Cutover canário: mude para "v2" ISP por ISP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Engine Atendimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-sm">{t.name ?? '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={t.atendimento_engine ?? 'env'}
                            onValueChange={v => setTenantEngine(t.id, v)}
                            disabled={engineUpdating === t.id}
                          >
                            <SelectTrigger className="h-7 text-xs w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="env">Padrão (env)</SelectItem>
                              <SelectItem value="legacy">legacy</SelectItem>
                              <SelectItem value="v2">v2</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* MRR history chart */}
          {mrrHistory.length > 0 && (
            <Card className="border-none shadow-sm mt-4">
              <CardHeader className="pb-2"><CardTitle className="text-sm">MRR — Histórico 12 Meses</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={mrrHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.06)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, 'MRR']} />
                    <Line type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Feature Flags ── */}
        <TabsContent value="flags" className="mt-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Feature Flags por Tenant</CardTitle>
              <CardDescription className="text-xs">Exceções ao baseline do plano. Liga/desliga funcionalidades por ISP.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      {CORE_FLAGS.map(f => (
                        <TableHead key={f} className="text-[10px] text-center whitespace-nowrap">{f}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map(t => {
                      const tenantFlags = flags.filter(f => f.tenant_id === t.id);
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs">{t.name ?? t.id.slice(0, 8) + '…'}</TableCell>
                          {CORE_FLAGS.map(flag => {
                            const row = tenantFlags.find(f => f.flag === flag);
                            return (
                              <TableCell key={flag} className="text-center">
                                <Switch
                                  checked={row?.enabled ?? false}
                                  onCheckedChange={v => toggleFlag(t.id, flag, v)}
                                  className="scale-75"
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Shadow Report ── */}
        <TabsContent value="shadow" className="mt-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Shadow Mode — Comparação v2 vs Legado</CardTitle>
              <CardDescription className="text-xs">
                Últimas {shadowRows.length} comparações. Motor v2 gera resposta em shadow sem enviar ao cliente.
                Taxa de divergência: <strong>{shadowAccuracy}%</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Mensagem do cliente</TableHead>
                      <TableHead className="text-xs">Resposta Legado</TableHead>
                      <TableHead className="text-xs">Resposta V2</TableHead>
                      <TableHead className="text-xs text-right">Latência</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shadowRows.map(r => (
                      <TableRow key={r.id} className={r.v2_response !== r.legacy_response ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{r.user_message}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-zinc-500">{r.legacy_response ?? '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{r.v2_response}</TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">{r.latency_ms ? `${r.latency_ms}ms` : '—'}</TableCell>
                      </TableRow>
                    ))}
                    {shadowRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-zinc-400 text-sm">
                          Nenhum dado de shadow mode. Ative o shadow com <code>ATENDIMENTO_ENGINE=shadow</code>.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Health ── */}
        <TabsContent value="health" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tenants.map(t => {
              const isActive = t.status === 'active';
              const engineLabel = t.atendimento_engine ?? 'env';
              return (
                <Card key={t.id} className={`border-none shadow-sm ${!isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold">{t.name ?? t.id.slice(0, 12) + '…'}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{t.plan ?? 'N/A'}</p>
                      </div>
                      <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px]">
                        {t.status ?? '?'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        engine: {engineLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        msgs: {t.monthly_message_count ?? 0}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {tenants.length === 0 && (
              <div className="col-span-3 text-center text-zinc-400 text-sm py-12">Nenhum tenant encontrado</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
