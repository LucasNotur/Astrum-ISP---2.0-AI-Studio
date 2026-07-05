import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/src/lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { toast } from 'sonner';
import { ShieldCheck, Search, Trash2, Download, AlertCircle, Lock, Eye } from 'lucide-react';

interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  ip_address: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_SEVERITY: Record<string, 'default' | 'secondary' | 'destructive'> = {
  login: 'default',
  logout: 'secondary',
  permission_denied: 'destructive',
  token_revoked: 'destructive',
  data_export: 'secondary',
  customer_expunge: 'destructive',
  admin_action: 'secondary',
};

function severityBadge(action: string) {
  const variant = ACTION_SEVERITY[action] ?? 'secondary';
  return <Badge variant={variant} className="text-[10px]">{action}</Badge>;
}

export function SecurityPage() {
  const { user } = useAppStore();
  const tenantId: string = user?.tenantId ?? 'default';

  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [expungeEmail, setExpungeEmail] = useState('');
  const [expunging, setExpunging] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'default') return;
    loadAuditLogs();
  }, [tenantId]);

  async function loadAuditLogs() {
    setLoading(true);
    let q = supabase
      .from('audit_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    const { data } = await q;
    if (data) setAuditLogs(data as AuditEntry[]);
    setLoading(false);
  }

  function exportCsv() {
    const rows = filtered.map(e => [
      e.created_at,
      e.action,
      e.resource ?? '',
      e.resource_id ?? '',
      e.user_id ?? '',
      e.ip_address ?? '',
      JSON.stringify(e.metadata ?? {}),
    ]);
    const header = ['created_at', 'action', 'resource', 'resource_id', 'user_id', 'ip_address', 'metadata'];
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `audit_log_${tenantId.slice(0, 8)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function expungeCustomer() {
    if (!expungeEmail.trim()) { toast.error('Informe o e-mail do cliente'); return; }
    if (!confirm(`Deseja APAGAR PERMANENTEMENTE os dados do cliente "${expungeEmail}"? Esta ação é irreversível (LGPD Art. 18).`)) return;

    setExpunging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/lgpd/expunge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenantId, email: expungeEmail }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Dados de "${expungeEmail}" removidos conforme LGPD.`);
      setExpungeEmail('');
      loadAuditLogs();
    } catch (e: any) {
      toast.error(`Erro ao expurgar: ${e.message}`);
    } finally {
      setExpunging(false);
    }
  }

  const filtered = auditLogs.filter(e => {
    const matchAction = !filterAction || e.action.toLowerCase().includes(filterAction.toLowerCase());
    const matchUser = !filterUser || (e.user_id ?? '').toLowerCase().includes(filterUser.toLowerCase());
    return matchAction && matchUser;
  });

  const criticalCount = auditLogs.filter(e => ACTION_SEVERITY[e.action] === 'destructive').length;
  const loginCount = auditLogs.filter(e => e.action === 'login').length;
  const deniedCount = auditLogs.filter(e => e.action === 'permission_denied').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck size={22} /> Segurança & LGPD</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Log de auditoria imutável, gestão de acessos e direitos do titular (LGPD Art. 18).
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><Lock size={14} /> Logins registrados</div>
            <div className="text-2xl font-bold">{loginCount}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><AlertCircle size={14} /> Acessos negados</div>
            <div className={`text-2xl font-bold ${deniedCount > 0 ? 'text-red-500' : 'text-zinc-700'}`}>{deniedCount}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-zinc-500 text-xs mb-1"><Eye size={14} /> Eventos críticos</div>
            <div className={`text-2xl font-bold ${criticalCount > 0 ? 'text-orange-500' : 'text-zinc-700'}`}>{criticalCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Log de Auditoria</TabsTrigger>
          <TabsTrigger value="lgpd">LGPD — Direitos do Titular</TabsTrigger>
        </TabsList>

        {/* ── Audit Log ── */}
        <TabsContent value="audit" className="mt-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Auditoria de Segurança</CardTitle>
                  <CardDescription className="text-xs">Log imutável de todas as ações críticas. {auditLogs.length} registros.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download size={12} className="mr-1" /> Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-400" />
                  <Input
                    placeholder="Filtrar por ação..."
                    value={filterAction}
                    onChange={e => setFilterAction(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-400" />
                  <Input
                    placeholder="Filtrar por user ID..."
                    value={filterUser}
                    onChange={e => setFilterUser(e.target.value)}
                    className="pl-7 h-8 text-xs"
                  />
                </div>
              </div>

              <ScrollArea className="h-[450px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data/Hora</TableHead>
                      <TableHead className="text-xs">Ação</TableHead>
                      <TableHead className="text-xs">Recurso</TableHead>
                      <TableHead className="text-xs">User ID</TableHead>
                      <TableHead className="text-xs">IP</TableHead>
                      <TableHead className="text-xs">Detalhes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-xs text-zinc-400">Carregando…</TableCell></TableRow>
                    ) : filtered.slice(0, 200).map(e => (
                      <TableRow key={e.id} className={ACTION_SEVERITY[e.action] === 'destructive' ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>{severityBadge(e.action)}</TableCell>
                        <TableCell className="text-xs">{e.resource ?? '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{e.user_id ? e.user_id.slice(0, 8) + '…' : '—'}</TableCell>
                        <TableCell className="text-xs">{e.ip_address ?? '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate text-zinc-500">
                          {e.metadata ? JSON.stringify(e.metadata).slice(0, 60) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-xs text-zinc-400">
                          Nenhum registro encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LGPD ── */}
        <TabsContent value="lgpd" className="mt-4 space-y-4">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Direitos do Titular (LGPD Art. 18)</CardTitle>
              <CardDescription className="text-xs">
                Permita que titulares exerçam seus direitos de acesso, retificação e exclusão de dados pessoais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 border rounded-md">
                  <p className="font-semibold text-xs mb-1">Art. 18 I — Confirmação</p>
                  <p className="text-zinc-500 text-xs">Confirmar existência de tratamento de dados. Use a busca no log acima.</p>
                </div>
                <div className="p-3 border rounded-md">
                  <p className="font-semibold text-xs mb-1">Art. 18 II — Acesso</p>
                  <p className="text-zinc-500 text-xs">O cliente pode solicitar exportação dos próprios dados via /api/lgpd/export.</p>
                </div>
                <div className="p-3 border rounded-md border-red-200 dark:border-red-800">
                  <p className="font-semibold text-xs mb-1 text-red-600">Art. 18 VI — Exclusão</p>
                  <p className="text-zinc-500 text-xs">Remoção permanente. Use com cuidado — dados não recuperáveis.</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-red-600">
                  <Trash2 size={14} /> Expurgo de Dados (Esquecimento)
                </p>
                <p className="text-xs text-zinc-500 mb-3">
                  Remove permanentemente todos os dados pessoais do cliente do banco de dados, conforme LGPD Art. 18 VI.
                  Esta ação é auditada e irreversível.
                </p>
                <div className="flex gap-2 max-w-md">
                  <Input
                    placeholder="E-mail do cliente a expurgar"
                    value={expungeEmail}
                    onChange={e => setExpungeEmail(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={expungeCustomer}
                    disabled={expunging || !expungeEmail.trim()}
                  >
                    {expunging ? 'Expurgando…' : 'Expurgar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
