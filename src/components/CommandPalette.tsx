import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, MessageSquare, FileText, Wrench, LayoutDashboard,
  Map, BarChart2, Settings, Shield, Zap, Bot, Plus,
  Receipt, Phone, ArrowRight,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/src/components/ui/command';
import { useAppStore } from '@/src/store/useAppStore';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultKind = 'customer' | 'ticket' | 'invoice' | 'os' | 'nav' | 'action';

interface PaletteItem {
  id: string;
  kind: ResultKind;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
}

const NAV_ITEMS: { label: string; path: string; icon: React.ReactNode; shortcut?: string }[] = [
  { label: 'Dashboard',       path: '/dashboard',     icon: <LayoutDashboard size={16} />, shortcut: 'G D' },
  { label: 'Atendimento',     path: '/chat',          icon: <MessageSquare size={16} />,  shortcut: 'G A' },
  { label: 'Clientes',        path: '/customers',     icon: <Users size={16} />,           shortcut: 'G C' },
  { label: 'Cobrança',        path: '/billing',       icon: <Receipt size={16} /> },
  { label: 'CobrAI',          path: '/cobrai',        icon: <Zap size={16} /> },
  { label: 'OS / Serviços',   path: '/os',            icon: <Wrench size={16} /> },
  { label: 'Mapa de Rede',    path: '/map',           icon: <Map size={16} /> },
  { label: 'BI / Relatórios', path: '/bi',            icon: <BarChart2 size={16} /> },
  { label: 'IA / Config',     path: '/ai-config',     icon: <Bot size={16} /> },
  { label: 'Segurança',       path: '/security',      icon: <Shield size={16} /> },
  { label: 'Configurações',   path: '/settings',      icon: <Settings size={16} /> },
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matches(haystack: string, needle: string) {
  return normalize(haystack).includes(normalize(needle));
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { customers, tickets, invoices, serviceOrders, setSelectedTicket } = useAppStore();

  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const go = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange],
  );

  const customerItems = useMemo<PaletteItem[]>(() => {
    if (!query || query.length < 2) return [];
    return customers
      .filter(
        (c) =>
          matches(c.name || '', query) ||
          matches(c.phone || '', query) ||
          matches(c.email || '', query) ||
          matches(c.cpf || '', query),
      )
      .slice(0, 5)
      .map((c) => ({
        id: `customer-${c.id}`,
        kind: 'customer' as ResultKind,
        label: c.name || 'Cliente',
        sub: c.phone || c.email || '',
        icon: <Users size={16} className="text-astrum-fiber" />,
        onSelect: () => go('/customers'),
      }));
  }, [customers, query, go]);

  const ticketItems = useMemo<PaletteItem[]>(() => {
    if (!query || query.length < 2) return [];
    return tickets
      .filter(
        (t) =>
          matches(t.subject || '', query) ||
          matches(t.customerName || '', query) ||
          matches(t.description || '', query),
      )
      .slice(0, 5)
      .map((t) => ({
        id: `ticket-${t.id}`,
        kind: 'ticket' as ResultKind,
        label: t.subject || t.customerName || `Ticket`,
        sub: t.status === 'open' ? 'Aberto' : t.status === 'escalated' ? 'Escalado' : t.status,
        icon: <MessageSquare size={16} className="text-astrum-amber" />,
        onSelect: () => {
          setSelectedTicket(t);
          go('/chat');
        },
      }));
  }, [tickets, query, go, setSelectedTicket]);

  const invoiceItems = useMemo<PaletteItem[]>(() => {
    if (!query || query.length < 2) return [];
    return invoices
      .filter(
        (inv) =>
          matches(inv.customerName || inv.client || '', query) ||
          matches(String(inv.amount || inv.valor || ''), query),
      )
      .slice(0, 3)
      .map((inv) => ({
        id: `invoice-${inv.id}`,
        kind: 'invoice' as ResultKind,
        label: `Fatura — ${inv.customerName || inv.client || 'Cliente'}`,
        sub: inv.status === 'pending' ? 'Pendente' : inv.status === 'paid' ? 'Pago' : inv.status,
        icon: <Receipt size={16} className="text-astrum-orange" />,
        onSelect: () => go('/billing'),
      }));
  }, [invoices, query, go]);

  const osItems = useMemo<PaletteItem[]>(() => {
    if (!query || query.length < 2) return [];
    return (serviceOrders || [])
      .filter(
        (os: any) =>
          matches(os.title || os.description || '', query) ||
          matches(os.customerName || '', query),
      )
      .slice(0, 3)
      .map((os: any) => ({
        id: `os-${os.id}`,
        kind: 'os' as ResultKind,
        label: os.title || os.description || 'OS',
        sub: os.status,
        icon: <Wrench size={16} className="text-astrum-slate" />,
        onSelect: () => go('/os'),
      }));
  }, [serviceOrders, query, go]);

  const navItems = useMemo<PaletteItem[]>(() => {
    const filtered = query
      ? NAV_ITEMS.filter((n) => matches(n.label, query))
      : NAV_ITEMS;
    return filtered.map((n) => ({
      id: `nav-${n.path}`,
      kind: 'nav' as ResultKind,
      label: n.label,
      icon: n.icon,
      shortcut: n.shortcut,
      onSelect: () => go(n.path),
    }));
  }, [query, go]);

  const actionItems = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: 'action-new-customer',
        kind: 'action',
        label: 'Novo cliente',
        icon: <Plus size={16} className="text-astrum-signal" />,
        onSelect: () => go('/customers'),
      },
      {
        id: 'action-new-os',
        kind: 'action',
        label: 'Nova OS',
        icon: <Plus size={16} className="text-astrum-signal" />,
        onSelect: () => go('/os'),
      },
      {
        id: 'action-new-ticket',
        kind: 'action',
        label: 'Novo atendimento',
        icon: <Plus size={16} className="text-astrum-signal" />,
        onSelect: () => go('/chat'),
      },
      {
        id: 'action-call',
        kind: 'action',
        label: 'Ligar para cliente...',
        icon: <Phone size={16} className="text-astrum-slate" />,
        onSelect: () => go('/customers'),
      },
    ];
    if (!query) return actions;
    return actions.filter((a) => matches(a.label, query));
  }, [query, go]);

  const hasResults =
    customerItems.length + ticketItems.length + invoiceItems.length +
    osItems.length + navItems.length + actionItems.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Busca global">
      <CommandInput
        placeholder="Buscar clientes, tickets, OS, faturas..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length >= 2 && !hasResults && (
          <CommandEmpty>Nenhum resultado para "{query}".</CommandEmpty>
        )}

        {/* Resultados de dados */}
        {customerItems.length > 0 && (
          <CommandGroup heading="Clientes">
            {customerItems.map((item) => (
              <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                {item.icon}
                <span>{item.label}</span>
                {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                <ArrowRight size={12} className="ml-auto text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {ticketItems.length > 0 && (
          <>
            {customerItems.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Tickets / Atendimentos">
              {ticketItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="ml-auto text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {invoiceItems.length > 0 && (
          <>
            {(customerItems.length > 0 || ticketItems.length > 0) && <CommandSeparator />}
            <CommandGroup heading="Faturas">
              {invoiceItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="ml-auto text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {osItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ordens de Serviço">
              {osItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="ml-auto text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Ações rápidas */}
        {actionItems.length > 0 && (
          <>
            {(customerItems.length + ticketItems.length + invoiceItems.length + osItems.length > 0) && (
              <CommandSeparator />
            )}
            <CommandGroup heading="Ações rápidas">
              {actionItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Navegação */}
        {navItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navegar para">
              {navItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
