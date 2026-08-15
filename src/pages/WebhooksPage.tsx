import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/src/lib/supabase';
import { apiGet, apiPost, apiDelete } from '@/src/lib/apiClient';
import { useAppStore } from '../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { toast } from 'sonner';
import { Webhook, RefreshCw, Plus, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Delivery {
  id: string;
  event_type: string;
  status: string;
  sent_at: string;
  endpoint_url: string | null;
  payload: any;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string;
  enabled: boolean;
  event_types: string[];
}

const AVAILABLE_EVENTS = [
  'ticket.created', 'ticket.closed', 'ticket.escalated',
  'customer.created', 'customer.updated',
  'invoice.generated', 'invoice.paid', 'invoice.overdue',
  'cobrai.executed', 'cobrai.paused',
  'whatsapp.message_received', 'whatsapp.connected', 'whatsapp.disconnected',
];

const statusIcon = (s: string) => {
  if (s === 'sent' || s === 'success') return <CheckCircle size={12} className="text-green-500" />;
  if (s === 'failed' || s === 'error') return <XCircle size={12} className="text-red-500" />;
  return <Clock size={12} className="text-yellow-500" />;
};

export function WebhooksPage() {
  const { user } = useAppStore();
  const tenantId: string = user?.tenantId ?? 'default';

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [svixAppId, setSvixAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [addingEndpoint, setAddingEndpoint] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!tenantId || tenantId === 'default') return;
    load();
  }, [tenantId]);

  async function load() {
    setLoading(true);
    const [deliveriesRes, tenantRes] = await Promise.all([
      supabase
        .from('webhook_deliveries')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sent_at', { ascending: false })
        .limit(100),
      supabase
        .from('tenants')
        .select('svix_app_id')
        .eq('id', tenantId)
        .maybeSingle(),
    ]);

    if (deliveriesRes.data) setDeliveries(deliveriesRes.data as Delivery[]);
    if (tenantRes.data?.svix_app_id) setSvixAppId(tenantRes.data.svix_app_id);

    // Load endpoints from Svix API
    if (tenantRes.data?.svix_app_id) {
      try {
        // Fase 1: /api/webhooks/endpoints (404 — não montado) → /api/v2/webhooks/endpoints
        // (Fastify). Tenant vem do JWT (apiClient injeta o Bearer); dropado o ?tenantId.
        setEndpoints(await apiGet('/api/v2/webhooks/endpoints'));
      } catch {}
    }
    setLoading(false);
  }

  async function addEndpoint() {
    if (!newUrl) { toast.error('URL é obrigatória'); return; }
    setAddingEndpoint(true);
    try {
      // Fase 1: /api/webhooks → /api/v2/webhooks (Fastify). Contrato correto é
      // { url, eventTypes } (camelCase) — antes mandava { tenantId, description, event_types },
      // shape que o backend não aceita (por isso nunca funcionou). Tenant vem do JWT; a URL
      // passa por guard anti-SSRF no servidor. (description não é suportado pelo backend.)
      await apiPost('/api/v2/webhooks/endpoints', { url: newUrl, eventTypes: selectedEvents });
      toast.success('Endpoint adicionado');
      setNewUrl(''); setNewDesc(''); setSelectedEvents([]); setShowAddForm(false);
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setAddingEndpoint(false);
    }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm('Remover este endpoint?')) return;
    try {
      // Fase 1: /api/webhooks → /api/v2/webhooks (Fastify). Tenant do JWT.
      await apiDelete(`/api/v2/webhooks/endpoints/${id}`);
      toast.success('Endpoint removido');
      setEndpoints(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  }

  async function retryDelivery(deliveryId: string) {
    try {
      // Fase 1: repontado para /api/v2. ⚠️ GAP CONHECIDO: o Fastify ainda NÃO tem
      // POST /api/v2/webhooks/deliveries/:id/retry (só existem endpoints + portal).
      // Task aberta para criá-lo; até lá esta ação retorna 404 (comportamento honesto:
      // já falhava antes, pois /api/webhooks/deliveries também não existia).
      await apiPost(`/api/v2/webhooks/deliveries/${deliveryId}/retry`);
      toast.success('Reenvio agendado');
      load();
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    }
  }

  const toggleEvent = (ev: string) =>
    setSelectedEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);

  const sentCount = deliveries.filter(d => d.status === 'sent' || d.status === 'success').length;
  const failedCount = deliveries.filter(d => d.status === 'failed' || d.status === 'error').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook size={22} /> Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Endpoints configurados via Svix. Receba notificações de eventos em tempo real.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Svix App ID</div>
            <div className="font-mono text-xs truncate">{svixAppId ?? 'Não configurado'}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Entregas bem-sucedidas</div>
            <div className="text-2xl font-bold text-green-600">{sentCount}</div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="pt-4">
            <div className="text-xs text-zinc-500 mb-1">Falhas</div>
            <div className="text-2xl font-bold text-red-500">{failedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Endpoints */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Endpoints configurados</CardTitle>
              <CardDescription className="text-xs">URLs que recebem eventos deste tenant via Svix.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAddForm(v => !v)}>
              <Plus size={14} className="mr-1" /> Adicionar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showAddForm && (
            <div className="border rounded-md p-4 space-y-3 bg-zinc-50 dark:bg-zinc-900">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">URL do endpoint</Label>
                  <Input placeholder="https://meuservidor.com/webhook" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição (opcional)</Label>
                  <Input placeholder="CRM interno" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="h-8" />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-2 block">Eventos (deixe vazio para receber todos)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_EVENTS.map(ev => (
                    <button
                      key={ev}
                      onClick={() => toggleEvent(ev)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        selectedEvents.includes(ev)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-zinc-300 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addEndpoint} disabled={addingEndpoint}>
                  {addingEndpoint ? 'Adicionando…' : 'Confirmar'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {endpoints.length === 0 && !showAddForm && (
            <div className="text-center text-zinc-400 text-sm py-8">
              Nenhum endpoint configurado. Clique em "Adicionar" para criar.
            </div>
          )}

          {endpoints.map(ep => (
            <div key={ep.id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-md">
              <div>
                <p className="text-sm font-medium truncate max-w-[400px]">{ep.url}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{ep.description || 'Sem descrição'}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {(ep.event_types?.length ? ep.event_types : ['all events']).map(ev => (
                    <Badge key={ev} variant="outline" className="text-[9px] py-0">{ev}</Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={ep.enabled ? 'default' : 'secondary'} className="text-[10px]">
                  {ep.enabled ? 'Ativo' : 'Inativo'}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteEndpoint(ep.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Delivery log */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Log de entregas (últimas 100)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Evento</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">Enviado em</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs font-mono">{d.event_type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {statusIcon(d.status)}
                        <span className="text-xs">{d.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">{d.endpoint_url ?? '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(d.sent_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {(d.status === 'failed' || d.status === 'error') && (
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => retryDelivery(d.id)}>
                          <RefreshCw size={10} className="mr-1" /> Reenviar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {deliveries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-zinc-400 py-8">
                      Nenhuma entrega registrada ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </motion.div>
  );
}
