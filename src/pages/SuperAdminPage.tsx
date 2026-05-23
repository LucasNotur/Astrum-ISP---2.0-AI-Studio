import React, { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { StatCard } from "@/src/components/ui/StatCard";
import { Users, DollarSign, Activity, Settings, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { auth } from "../lib/firebase";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const SuperAdminPage = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      
      const metricsRes = await fetch("/api/super-admin/metrics", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      const tenantsRes = await fetch("/api/super-admin/tenants", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const tenantsData = await tenantsRes.json();
      if (Array.isArray(tenantsData)) {
         setTenants(tenantsData);
      }
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar dados do provedor.");
    } finally {
      setLoading(false);
    }
  };

  const suspendTenant = async (tenantId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`/api/super-admin/tenants/${tenantId}/suspend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      toast.success("Tenant suspenso com sucesso.");
      fetchData();
    } catch (error) {
      toast.error("Erro ao suspender tenant.");
    }
  };

  const reactivateTenant = async (tenantId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`/api/super-admin/tenants/${tenantId}/reactivate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      toast.success("Tenant reativado com sucesso.");
      fetchData();
    } catch (error) {
      toast.error("Erro ao reativar tenant.");
    }
  };

  if (loading) {
    return <div className="p-8">Carregando painel de super admin...</div>;
  }

  const mrrVariation = metrics?.mrr_variation || 0;
  const isMrrUp = mrrVariation >= 0;

  const currentChurn = metrics?.current_churn_rate || 0;
  const previousChurn = metrics?.previous_churn_rate || 0;
  const churnTrend = currentChurn < previousChurn ? 'down' : currentChurn > previousChurn ? 'up' : 'stable';

  const mrrHistory = metrics?.mrr_history || [];
  const topTenants = metrics?.top_tenants || [];

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Super Admin Dashboard</h1>
        <p className="text-zinc-500">Gestão global de Tenants, Faturamento e Métricas do Sistema.</p>
      </div>

      {/* SaaS SaaS Metrics Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          title="Churn Rate (Mês)" 
          value={`${(currentChurn * 100).toFixed(2)}%`} 
          icon={<Activity className="h-4 w-4 text-emerald-500" />} 
          description={
            <span className={`text-xs mt-1 ${churnTrend === 'down' ? 'text-emerald-500' : churnTrend === 'up' ? 'text-red-500' : 'text-zinc-500'}`}>
               Tendência: {churnTrend === 'down' ? 'Queda' : churnTrend === 'up' ? 'Aumento' : 'Estável'}
            </span>
          }
        />
        <StatCard title="Tenants Ativos" value={metrics?.active_tenants || 0} icon={<Users className="h-4 w-4 text-emerald-500" />} />
        <StatCard title="Total de Tenants" value={metrics?.total_tenants || 0} icon={<Settings className="h-4 w-4 text-blue-500" />} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
         {/* Gráfico MRR 12 Meses */}
         <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-4">MRR - Histórico (12 Meses)</h3>
            <div className="h-64">
               {mrrHistory.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={mrrHistory}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                     <XAxis dataKey="month" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis 
                        stroke="#6B7280" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `R$${value}`}
                     />
                     <Tooltip 
                        formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'MRR']}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     />
                     <Line 
                       type="monotone" 
                       dataKey="mrr" 
                       stroke="#10b981" 
                       strokeWidth={3} 
                       dot={{ r: 4, strokeWidth: 2 }} 
                       activeDot={{ r: 6 }} 
                     />
                   </LineChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex items-center justify-center text-zinc-500 bg-zinc-50/50 dark:bg-zinc-800/50 rounded-lg">
                   Dados insuficientes no histórico
                 </div>
               )}
            </div>
         </div>

         {/* Top 10 Tenants por MRR */}
         <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col">
            <h3 className="font-semibold text-lg mb-4">Top 10 Tenants (MRR)</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {topTenants.map((t: any, idx: number) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                      #{idx + 1}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium leading-none truncate max-w-[120px]" title={t.name}>{t.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-1 capitalize">{t.plan}</p>
                    </div>
                  </div>
                  <div className="font-semibold text-sm">R$ {t.mrr.toFixed(2)}</div>
                </div>
              ))}
              {topTenants.length === 0 && (
                <div className="text-zinc-500 text-center py-8">Nenhum ativo.</div>
              )}
            </div>
         </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="font-semibold text-lg">Todos os Tenants</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Faturamento</TableHead>
              <TableHead>Mensagens/mês</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map(tenant => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.id}</TableCell>
                <TableCell>{tenant.plan || 'N/A'}</TableCell>
                <TableCell>
                   <span className={`px-2 py-1 text-xs rounded-full ${
                     tenant.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                     tenant.status === 'suspended' ? 'bg-amber-100 text-amber-800' :
                     tenant.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                     'bg-zinc-100 text-zinc-800'
                   }`}>
                     {tenant.status || 'Desconhecido'}
                   </span>
                </TableCell>
                <TableCell>{tenant.billing_status || 'N/A'}</TableCell>
                <TableCell>{tenant.monthly_message_count || 0}</TableCell>
                <TableCell className="text-right space-x-2">
                  {tenant.status === 'suspended' ? (
                     <Button variant="outline" size="sm" onClick={() => reactivateTenant(tenant.id)}>Reativar</Button>
                  ) : (
                     <Button variant="destructive" size="sm" onClick={() => suspendTenant(tenant.id)}>Suspender</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-zinc-500">Nenhum tenant encontrado</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
