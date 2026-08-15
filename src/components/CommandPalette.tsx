import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Users, MessageSquare, FileText, Wrench, LayoutDashboard,
  Map as MapIcon, BarChart2, Settings, Shield, Zap, Bot, Plus,
  Receipt, Phone, ArrowRight, Sun, Moon, Download,
  AlertTriangle, BookOpen, Brain, PanelLeftClose, PanelLeft,
  Ticket, CreditCard, Package, Route, ShoppingBag,
  Activity, Clock, Sparkles, Search, Hash, Command,
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
import { toast } from 'sonner';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResultKind = 'customer' | 'ticket' | 'invoice' | 'os' | 'nav' | 'action' | 'recent';

interface PaletteItem {
  id: string;
  kind: ResultKind;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
  keywords?: string;
}

const STORAGE_KEY = 'astrum:cmd-recents';
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  const recents = loadRecents().filter((r) => r !== id);
  recents.unshift(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matches(haystack: string, needle: string) {
  return normalize(haystack).includes(normalize(needle));
}

const NAV_ITEMS: { label: string; path: string; icon: React.ReactNode; shortcut?: string; keywords?: string }[] = [
  { label: 'Home',               path: '/home',           icon: <LayoutDashboard size={16} />, shortcut: 'Alt+1',  keywords: 'inicio dashboard' },
  { label: 'Dashboard',          path: '/dashboard',      icon: <LayoutDashboard size={16} />, shortcut: 'G D',    keywords: 'painel metricas' },
  { label: 'Atendimento',        path: '/chat',           icon: <MessageSquare size={16} />,   shortcut: 'Alt+4',  keywords: 'chat conversa whatsapp' },
  { label: 'Clientes',           path: '/customers',      icon: <Users size={16} />,           shortcut: 'Alt+2',  keywords: 'assinantes usuarios' },
  { label: 'Vendas',             path: '/sales',          icon: <ShoppingBag size={16} />,     keywords: 'pipeline oportunidade' },
  { label: 'Tickets (Suporte)',  path: '/tickets',        icon: <Ticket size={16} />,          shortcut: 'Alt+3',  keywords: 'chamado suporte' },
  { label: 'Financeiro',         path: '/billing',        icon: <CreditCard size={16} />,      shortcut: 'Alt+6',  keywords: 'cobrança fatura pagamento' },
  { label: 'CobrAI',             path: '/cobrai',         icon: <Zap size={16} />,             keywords: 'cobranca automatica inadimplencia' },
  { label: 'CRM Técnico / OS',   path: '/os',             icon: <Wrench size={16} />,          shortcut: 'Alt+O',  keywords: 'ordem servico tecnico' },
  { label: 'Mapa de Cobertura',  path: '/map',            icon: <MapIcon size={16} />,          shortcut: 'Alt+5',  keywords: 'rede mapa cto fibra' },
  { label: 'Operações de Campo', path: '/campo',          icon: <Route size={16} />,           keywords: 'campo tecnico rota' },
  { label: 'BI / Relatórios',    path: '/bi',             icon: <BarChart2 size={16} />,       keywords: 'relatorio grafico business intelligence' },
  { label: 'Estoque',            path: '/inventory',      icon: <Package size={16} />,         keywords: 'material equipamento' },
  { label: 'Base de Conhecimento', path: '/kb',           icon: <BookOpen size={16} />,        keywords: 'kb artigo documentacao' },
  { label: 'IA / Config',        path: '/ai-config',      icon: <Bot size={16} />,             keywords: 'inteligencia artificial configuracao' },
  { label: 'Inteligência',       path: '/intelligence',   icon: <Brain size={16} />,           keywords: 'hub ia modelos' },
  { label: 'Equipe',             path: '/team',           icon: <Shield size={16} />,          shortcut: 'Alt+7',  keywords: 'time usuario permissao' },
  { label: 'Segurança',          path: '/security',       icon: <Shield size={16} />,          keywords: 'auditoria log seguranca' },
  { label: 'Configurações',      path: '/settings',       icon: <Settings size={16} />,        keywords: 'config preferencias empresa' },
  { label: 'Saúde da Rede',      path: '/health',         icon: <Activity size={16} />,        keywords: 'health monitoramento uptime' },
  { label: 'Observabilidade IA', path: '/observability',  icon: <Sparkles size={16} />,        keywords: 'custos tokens ia observabilidade' },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const {
    customers, tickets, invoices, serviceOrders,
    setSelectedTicket, isSidebarCollapsed, setIsSidebarCollapsed,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecents(loadRecents());
    } else {
      setQuery('');
    }
  }, [open]);

  const go = useCallback(
    (path: string) => {
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange],
  );

  const exec = useCallback(
    (id: string, fn: () => void) => {
      pushRecent(id);
      onOpenChange(false);
      fn();
    },
    [onOpenChange],
  );

  // --- Data search items (only when query >= 2 chars) ---
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
        onSelect: () => exec(`customer-${c.id}`, () => go('/customers')),
      }));
  }, [customers, query, go, exec]);

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
        label: t.subject || t.customerName || 'Ticket',
        sub: t.status === 'open' ? 'Aberto' : t.status === 'escalated' ? 'Escalado' : t.status,
        icon: <MessageSquare size={16} className="text-astrum-amber" />,
        onSelect: () =>
          exec(`ticket-${t.id}`, () => {
            setSelectedTicket(t);
            go('/chat');
          }),
      }));
  }, [tickets, query, go, exec, setSelectedTicket]);

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
        onSelect: () => exec(`invoice-${inv.id}`, () => go('/billing')),
      }));
  }, [invoices, query, go, exec]);

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
        onSelect: () => exec(`os-${os.id}`, () => go('/os')),
      }));
  }, [serviceOrders, query, go, exec]);

  // --- Navigation items ---
  const navItems = useMemo<PaletteItem[]>(() => {
    const filtered = query
      ? NAV_ITEMS.filter((n) => matches(n.label, query) || matches(n.keywords || '', query))
      : NAV_ITEMS;
    return filtered.map((n) => ({
      id: `nav-${n.path}`,
      kind: 'nav' as ResultKind,
      label: n.label,
      icon: n.icon,
      shortcut: n.shortcut,
      keywords: n.keywords,
      onSelect: () => exec(`nav-${n.path}`, () => go(n.path)),
    }));
  }, [query, go, exec]);

  // --- Action items (the big G-02 expansion) ---
  const actionItems = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      // Criar
      {
        id: 'action-new-customer',
        kind: 'action',
        label: 'Novo cliente',
        icon: <Plus size={16} className="text-emerald-500" />,
        shortcut: 'C',
        keywords: 'criar adicionar cliente assinante',
        onSelect: () => exec('action-new-customer', () => go('/customers')),
      },
      {
        id: 'action-new-ticket',
        kind: 'action',
        label: 'Novo atendimento',
        icon: <Plus size={16} className="text-emerald-500" />,
        shortcut: 'T',
        keywords: 'criar ticket chamado conversa',
        onSelect: () => exec('action-new-ticket', () => go('/chat')),
      },
      {
        id: 'action-new-os',
        kind: 'action',
        label: 'Nova OS',
        icon: <Plus size={16} className="text-emerald-500" />,
        shortcut: 'O',
        keywords: 'criar ordem servico tecnica',
        onSelect: () => exec('action-new-os', () => go('/os')),
      },
      {
        id: 'action-new-invoice',
        kind: 'action',
        label: 'Nova fatura',
        icon: <Plus size={16} className="text-emerald-500" />,
        keywords: 'criar cobranca fatura boleto',
        onSelect: () => exec('action-new-invoice', () => go('/billing')),
      },
      {
        id: 'action-new-sale',
        kind: 'action',
        label: 'Nova venda',
        icon: <Plus size={16} className="text-emerald-500" />,
        keywords: 'criar venda oportunidade lead',
        onSelect: () => exec('action-new-sale', () => go('/sales')),
      },
      // Operações
      {
        id: 'action-call',
        kind: 'action',
        label: 'Ligar para cliente...',
        icon: <Phone size={16} className="text-blue-500" />,
        keywords: 'telefone ligar chamar',
        onSelect: () => exec('action-call', () => go('/customers')),
      },
      {
        id: 'action-export',
        kind: 'action',
        label: 'Exportar relatório',
        icon: <Download size={16} className="text-blue-500" />,
        keywords: 'exportar csv excel relatorio download',
        onSelect: () =>
          exec('action-export', () => {
            go('/bi');
            toast.info('Selecione o relatório para exportar');
          }),
      },
      {
        id: 'action-incident',
        kind: 'action',
        label: 'Abrir incidente de rede',
        icon: <AlertTriangle size={16} className="text-red-500" />,
        keywords: 'incidente rede queda problema cto',
        onSelect: () =>
          exec('action-incident', () => {
            go('/intelligence/incidents');
            toast.info('Use o formulário para registrar o incidente');
          }),
      },
      // IA & Automação
      {
        id: 'action-kb-scan',
        kind: 'action',
        label: 'Rodar scan de KB',
        icon: <BookOpen size={16} className="text-purple-500" />,
        keywords: 'knowledge base scan artigo documentacao atualizar',
        onSelect: () =>
          exec('action-kb-scan', () => {
            go('/kb');
            toast.info('Scan da base de conhecimento iniciado');
          }),
      },
      {
        id: 'action-reflections',
        kind: 'action',
        label: 'Ver reflexões da IA',
        icon: <Brain size={16} className="text-purple-500" />,
        keywords: 'reflexao ia insight analise cerebro',
        onSelect: () => exec('action-reflections', () => go('/intelligence/reflections')),
      },
      {
        id: 'action-genesis',
        kind: 'action',
        label: 'Análise WhatsApp Engine',
        icon: <Zap size={16} className="text-indigo-500" />,
        keywords: 'genesis whatsapp analise perfil retro contatos',
        onSelect: () => exec('action-genesis', () => go('/intelligence/genesis')),
      },
      {
        id: 'action-kb-curation',
        kind: 'action',
        label: 'Curadoria de artigos IA',
        icon: <BookOpen size={16} className="text-amber-500" />,
        keywords: 'curadoria rascunho draft kb artigo aprovar',
        onSelect: () => exec('action-kb-curation', () => go('/kb')),
      },
      {
        id: 'action-churn',
        kind: 'action',
        label: 'Ver risco de churn',
        icon: <Activity size={16} className="text-orange-500" />,
        keywords: 'churn cancelamento risco perda',
        onSelect: () => exec('action-churn', () => go('/intelligence/churn')),
      },
      // Sistema
      {
        id: 'action-theme',
        kind: 'action',
        label: theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro',
        icon: theme === 'dark'
          ? <Sun size={16} className="text-yellow-500" />
          : <Moon size={16} className="text-indigo-400" />,
        keywords: 'tema escuro claro dark light mode',
        onSelect: () =>
          exec('action-theme', () => {
            setTheme(theme === 'dark' ? 'light' : 'dark');
            toast.success(theme === 'dark' ? 'Modo claro ativado' : 'Modo escuro ativado');
          }),
      },
      {
        id: 'action-sidebar',
        kind: 'action',
        label: isSidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar',
        icon: isSidebarCollapsed
          ? <PanelLeft size={16} className="text-zinc-500" />
          : <PanelLeftClose size={16} className="text-zinc-500" />,
        keywords: 'sidebar menu lateral expandir recolher',
        onSelect: () =>
          exec('action-sidebar', () => setIsSidebarCollapsed(!isSidebarCollapsed)),
      },
    ];

    if (!query) return actions;
    return actions.filter(
      (a) => matches(a.label, query) || matches(a.keywords || '', query),
    );
  }, [query, go, exec, theme, setTheme, isSidebarCollapsed, setIsSidebarCollapsed]);

  // --- Recent items ---
  const allActionAndNavIds = useMemo(() => {
    const map = new Map<string, PaletteItem>();
    for (const item of [...NAV_ITEMS.map((n) => ({
      id: `nav-${n.path}`,
      kind: 'nav' as ResultKind,
      label: n.label,
      icon: n.icon,
      shortcut: n.shortcut,
      onSelect: () => exec(`nav-${n.path}`, () => go(n.path)),
    })), ...actionItems]) {
      map.set(item.id, item);
    }
    return map;
  }, [actionItems, go, exec]);

  const recentItems = useMemo<PaletteItem[]>(() => {
    if (query) return [];
    return recents
      .map((id) => allActionAndNavIds.get(id))
      .filter((item): item is PaletteItem => !!item)
      .map((item) => ({ ...item, kind: 'recent' as ResultKind }));
  }, [query, recents, allActionAndNavIds]);

  const hasDataResults =
    customerItems.length + ticketItems.length + invoiceItems.length + osItems.length > 0;

  const hasResults =
    hasDataResults || navItems.length + actionItems.length + recentItems.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Busca global">
      <CommandInput
        placeholder="Buscar ou executar comando..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length >= 2 && !hasResults && (
          <CommandEmpty>Nenhum resultado para "{query}".</CommandEmpty>
        )}

        {/* Recentes (só sem query) */}
        {recentItems.length > 0 && (
          <CommandGroup heading="Recentes">
            {recentItems.map((item) => (
              <CommandItem key={`recent-${item.id}`} onSelect={item.onSelect} value={`recent-${item.id}`}>
                <Clock size={14} className="text-muted-foreground" />
                {item.icon}
                <span>{item.label}</span>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Resultados de dados (busca) */}
        {customerItems.length > 0 && (
          <>
            {recentItems.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Clientes">
              {customerItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {ticketItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tickets / Atendimentos">
              {ticketItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {invoiceItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Faturas">
              {invoiceItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id}>
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="text-muted-foreground" />
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
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.sub && <span className="text-xs text-muted-foreground">{item.sub}</span>}
                  <ArrowRight size={12} className="text-muted-foreground" />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Ações rápidas */}
        {actionItems.length > 0 && (
          <>
            {(hasDataResults || recentItems.length > 0) && <CommandSeparator />}
            <CommandGroup heading="Ações">
              {actionItems.map((item) => (
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id} keywords={item.keywords ? [item.keywords] : undefined}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
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
                <CommandItem key={item.id} onSelect={item.onSelect} value={item.id} keywords={item.keywords ? [item.keywords] : undefined}>
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer com dica */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">↵</kbd> executar</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">esc</kbd> fechar</span>
        </div>
        <span className="flex items-center gap-1">
          <Command size={10} />
          <span>K para abrir</span>
        </span>
      </div>
    </CommandDialog>
  );
}
