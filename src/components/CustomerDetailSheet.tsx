import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, Mail, MapPin, Wifi, CreditCard, MessageSquare, Wrench, Calendar, Clock, ExternalLink, ChevronRight, Copy, Check, Tag, StickyNote } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Avatar, AvatarFallback } from '@/src/components/ui/avatar';
import { ScrollArea } from '@/src/components/ui/scroll-area';
import { Skeleton } from '@/src/components/Skeleton';
import { useAppStore } from '@/src/store/useAppStore';
import { apiGet, apiPost } from '@/src/lib/apiClient';
import { Textarea } from '@/src/components/ui/textarea';
import { toast } from 'sonner';

interface CustomerDetailSheetProps {
  open: boolean;
  onClose: () => void;
  customerId?: string;
}

type TimelineEvent = {
  id: string;
  type: 'ticket' | 'invoice' | 'os' | 'reflection';
  title: string;
  description?: string;
  status?: string;
  date: Date;
  icon: React.ReactNode;
  color: string;
};

type TabKey = 'overview' | 'timeline' | 'finance';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  inactive: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  suspended: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
  pending: 'Pendente',
};

function PinnedField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const statusColors: Record<string, string> = {
    open: 'text-amber-500',
    closed: 'text-emerald-500',
    resolved: 'text-emerald-500',
    paid: 'text-emerald-500',
    pending: 'text-amber-500',
    overdue: 'text-red-500',
    escalated: 'text-red-500',
    in_progress: 'text-blue-500',
  };

  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center">
        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', event.color)}>
          {event.icon}
        </div>
        <div className="w-px flex-1 bg-border/50 group-last:bg-transparent" />
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium truncate">{event.title}</p>
          {event.status && (
            <Badge variant="outline" className={cn('text-[10px] shrink-0', statusColors[event.status])}>
              {event.status}
            </Badge>
          )}
        </div>
        {event.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {event.date.toLocaleDateString('pt-BR')} · {event.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

export function CustomerDetailSheet({ open, onClose, customerId }: CustomerDetailSheetProps) {
  const { tickets, invoices, serviceOrders } = useAppStore();
  const [tab, setTab] = useState<TabKey>('overview');
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reflections, setReflections] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !customerId) {
      setCustomer(null);
      setReflections([]);
      return;
    }
    setLoading(true);
    setTab('overview');

    const load = async () => {
      try {
        setCustomer(await apiGet<any>(`/api/v2/customers/${customerId}`));
      } catch {
        setCustomer(null);
      }
      // RESOLVIDO (2026-08-27, migration 120): customer_notes é tabela nova,
      // não reaproveita ai_reflections (conceito diferente — ver PLANO_ACAO_100_OPERACIONAL.md).
      try {
        setReflections(await apiGet<any[]>(`/api/v2/customers/${customerId}/notes`));
      } catch {
        setReflections([]);
      }
      setLoading(false);
    };
    load();
  }, [open, customerId]);

  const addNote = async () => {
    if (!newNote.trim() || !customerId) return;
    setIsSavingNote(true);
    try {
      const created = await apiPost<any>(`/api/v2/customers/${customerId}/notes`, { body: newNote.trim() });
      setReflections((prev) => [created, ...prev]);
      setNewNote('');
      toast.success('Nota adicionada.');
    } catch {
      toast.error('Erro ao salvar a nota.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const customerTickets = useMemo(
    () => tickets.filter((t) => t.customerId === customerId || t.customer_id === customerId),
    [tickets, customerId],
  );
  const customerInvoices = useMemo(
    () => invoices.filter((inv) => inv.customerId === customerId || inv.customer_id === customerId),
    [invoices, customerId],
  );
  const customerOS = useMemo(
    () => (serviceOrders || []).filter((os: any) => os.customerId === customerId || os.customer_id === customerId),
    [serviceOrders, customerId],
  );

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    for (const t of customerTickets) {
      events.push({
        id: `t-${t.id}`,
        type: 'ticket',
        title: t.subject || 'Atendimento',
        description: t.aiSummary || t.description,
        status: t.status,
        date: new Date(t.createdAt || t.created_at || Date.now()),
        icon: <MessageSquare size={14} />,
        color: 'bg-blue-500/10 text-blue-500',
      });
    }

    for (const inv of customerInvoices) {
      events.push({
        id: `inv-${inv.id}`,
        type: 'invoice',
        title: `Fatura R$ ${(inv.amount || inv.valor || 0).toFixed(2)}`,
        description: inv.description,
        status: inv.status,
        date: new Date(inv.createdAt || inv.created_at || inv.due_date || Date.now()),
        icon: <CreditCard size={14} />,
        color: 'bg-emerald-500/10 text-emerald-500',
      });
    }

    for (const os of customerOS) {
      events.push({
        id: `os-${os.id}`,
        type: 'os',
        title: os.title || os.description || 'Ordem de serviço',
        status: os.status,
        date: new Date(os.createdAt || os.created_at || Date.now()),
        icon: <Wrench size={14} />,
        color: 'bg-orange-500/10 text-orange-500',
      });
    }

    for (const r of reflections) {
      events.push({
        id: `ref-${r.id}`,
        type: 'reflection',
        title: 'Nota',
        description: r.body,
        date: new Date(r.created_at || Date.now()),
        icon: <StickyNote size={14} />,
        color: 'bg-purple-500/10 text-purple-500',
      });
    }

    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return events;
  }, [customerTickets, customerInvoices, customerOS, reflections]);

  const mrr = useMemo(() => {
    const paid = customerInvoices.filter((i) => i.status === 'paid');
    if (!paid.length) return null;
    const total = paid.reduce((sum, i) => sum + (i.amount || i.valor || 0), 0);
    return total / paid.length;
  }, [customerInvoices]);

  const overdue = customerInvoices.filter((i) => i.status === 'overdue' || i.status === 'pending');
  const totalOverdue = overdue.reduce((s, i) => s + (i.amount || i.valor || 0), 0);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Visão geral' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'finance', label: 'Financeiro' },
  ];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label={customer?.name || 'Detalhes do cliente'}
            className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-[90vw] flex-col border-l border-border bg-card shadow-2xl"
          >
            {loading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
                <div className="space-y-3 mt-6">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ) : !customer ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Cliente não encontrado.
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="shrink-0 p-5 pb-3 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {(customer.name || '?').substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold truncate">{customer.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className={cn('text-[10px] border', STATUS_COLORS[customer.status] || STATUS_COLORS.inactive)}>
                            {STATUS_LABELS[customer.status] || customer.status}
                          </Badge>
                          {customer.plan && (
                            <span className="text-xs text-muted-foreground">{customer.plan}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <X size={16} />
                    </button>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {customer.phone && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}`, '_blank')}
                      >
                        <Phone size={12} /> WhatsApp
                      </Button>
                    )}
                    {customer.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => window.open(`mailto:${customer.email}`)}
                      >
                        <Mail size={12} /> Email
                      </Button>
                    )}
                    {customer.address && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`, '_blank')}
                      >
                        <MapPin size={12} /> Mapa
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="shrink-0 flex border-b border-border">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={cn(
                        'flex-1 py-2.5 text-xs font-medium transition-colors relative',
                        tab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t.label}
                      {tab === t.key && (
                        <motion.div
                          layoutId="detail-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        />
                      )}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <ScrollArea className="flex-1">
                  <div className="p-5">
                    {tab === 'overview' && (
                      <div className="space-y-5">
                        {/* Pinned fields */}
                        <div className="rounded-xl border border-border p-4">
                          <PinnedField label="Plano" value={<span className="text-primary font-semibold">{customer.plan || '—'}</span>} />
                          <PinnedField
                            label="MRR estimado"
                            value={mrr ? `R$ ${mrr.toFixed(2)}` : '—'}
                            mono
                          />
                          <PinnedField
                            label="Cliente desde"
                            value={customer.created_at
                              ? new Date(customer.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                              : '—'}
                          />
                          <PinnedField
                            label="Tickets abertos"
                            value={
                              <span className={customerTickets.filter((t) => t.status === 'open' || t.status === 'escalated').length > 0 ? 'text-amber-500 font-semibold' : ''}>
                                {customerTickets.filter((t) => t.status === 'open' || t.status === 'escalated').length}
                              </span>
                            }
                          />
                          <PinnedField
                            label="PPPoE"
                            value={
                              customer.pppoeLogin ? (
                                <span className="flex items-center gap-1.5">
                                  <Wifi size={12} className="text-emerald-500" />
                                  <span className="font-mono text-xs">{customer.pppoeLogin}</span>
                                  <CopyButton value={customer.pppoeLogin} />
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )
                            }
                          />
                        </div>

                        {/* Contact info */}
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contato</h3>
                          <div className="space-y-1.5">
                            {customer.phone && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone size={14} className="text-muted-foreground shrink-0" />
                                <span className="font-mono text-xs">{customer.phone}</span>
                                <CopyButton value={customer.phone} />
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-2 text-sm">
                                <Mail size={14} className="text-muted-foreground shrink-0" />
                                <span className="text-xs truncate">{customer.email}</span>
                                <CopyButton value={customer.email} />
                              </div>
                            )}
                            {customer.address && (
                              <div className="flex items-start gap-2 text-sm">
                                <MapPin size={14} className="text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-xs">{customer.address}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tags */}
                        {customer.tags && customer.tags.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</h3>
                            <div className="flex flex-wrap gap-1.5">
                              {customer.tags.map((tag: string, i: number) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  <Tag size={10} className="mr-1" />{tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recent timeline (last 5) */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atividade recente</h3>
                            {timeline.length > 5 && (
                              <button onClick={() => setTab('timeline')} className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                                Ver tudo <ChevronRight size={10} />
                              </button>
                            )}
                          </div>
                          {timeline.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma atividade registrada.</p>
                          ) : (
                            <div className="space-y-0">
                              {timeline.slice(0, 5).map((ev) => (
                                <TimelineItem key={ev.id} event={ev} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {tab === 'timeline' && (
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <Textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Adicionar uma nota sobre este cliente…"
                            className="min-h-[60px] text-sm"
                          />
                          <Button size="sm" onClick={addNote} disabled={!newNote.trim() || isSavingNote} className="self-end">
                            Salvar
                          </Button>
                        </div>
                        <div className="space-y-0">
                          {timeline.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum evento registrado.</p>
                          ) : (
                            timeline.map((ev) => <TimelineItem key={ev.id} event={ev} />)
                          )}
                        </div>
                      </div>
                    )}

                    {tab === 'finance' && (
                      <div className="space-y-5">
                        {/* Finance summary */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-border p-4 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">MRR</p>
                            <p className="text-lg font-bold font-mono text-primary mt-1">
                              {mrr ? `R$ ${mrr.toFixed(0)}` : '—'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border p-4 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Em aberto</p>
                            <p className={cn('text-lg font-bold font-mono mt-1', totalOverdue > 0 ? 'text-red-500' : 'text-emerald-500')}>
                              R$ {totalOverdue.toFixed(0)}
                            </p>
                          </div>
                        </div>

                        {/* Invoice list */}
                        <div className="space-y-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faturas</h3>
                          {customerInvoices.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma fatura encontrada.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {customerInvoices
                                .sort((a, b) => new Date(b.created_at || b.due_date || 0).getTime() - new Date(a.created_at || a.due_date || 0).getTime())
                                .map((inv) => {
                                  const isPaid = inv.status === 'paid';
                                  const isOverdue = inv.status === 'overdue';
                                  return (
                                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={cn('w-2 h-2 rounded-full shrink-0', isPaid ? 'bg-emerald-500' : isOverdue ? 'bg-red-500' : 'bg-amber-500')} />
                                        <div className="min-w-0">
                                          <p className="text-sm font-mono font-medium">R$ {(inv.amount || inv.valor || 0).toFixed(2)}</p>
                                          <p className="text-[10px] text-muted-foreground">
                                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('pt-BR') : '—'}
                                          </p>
                                        </div>
                                      </div>
                                      <Badge variant="outline" className={cn('text-[10px]', isPaid ? 'text-emerald-500' : isOverdue ? 'text-red-500' : 'text-amber-500')}>
                                        {isPaid ? 'Pago' : isOverdue ? 'Vencida' : inv.status === 'pending' ? 'Pendente' : inv.status}
                                      </Badge>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
