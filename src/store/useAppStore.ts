import { create } from 'zustand';

interface AppState {
  // Auth & User
  user: any;
  userProfile: any;
  currentUserRole: 'admin' | 'owner' | 'support' | 'tecnico';
  setUser: (user: any) => void;
  setUserProfile: (profile: any) => void;
  setCurrentUserRole: (role: 'admin' | 'owner' | 'support' | 'tecnico') => void;

  // Layout & UI
  activeTab: string;
  isSidebarCollapsed: boolean;
  setActiveTab: (tab: string) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;

  // Data Collections
  customers: any[];
  setCustomers: (customers: any[]) => void;
  
  ctos: any[];
  setCtos: (ctos: any[]) => void;
  
  auditLogs: any[];
  setAuditLogs: (logs: any[]) => void;
  
  tickets: any[];
  setTickets: (tickets: any[]) => void;
  
  invoices: any[];
  setInvoices: (invoices: any[]) => void;
  
  serviceOrders: any[];
  setServiceOrders: (orders: any[]) => void;
  
  technicians: any[];
  setTechnicians: (techs: any[]) => void;
  
  integrationKeys: Record<string, string>;
  setIntegrationKeys: (keys: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  
  companySettings: any;
  setCompanySettings: (settings: any) => void;

  // Notifications
  notifications: any[];
  setNotifications: (updater: any[] | ((prev: any[]) => any[])) => void;
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;

  // General Loading
  loading: boolean;
  setLoading: (loading: boolean) => void;

  messages: any[];
  setMessages: (updater: any[] | ((prev: any[]) => any[])) => void;
  isConfiguringAI: boolean;
  setIsConfiguringAI: (isConfiguringAI: boolean) => void;
  settings?: any;

  // View Modals
  selectedTicket: any;
  selectedCTO: any;
  setSelectedCTO: (cto: any) => void;
  isCTODetailOpen: boolean;
  setIsCTODetailOpen: (open: boolean) => void;
  setSelectedTicket: (ticket: any) => void;
  isTicketDetailOpen: boolean;
  setIsTicketDetailOpen: (open: boolean) => void;

  isDetailsDialogOpen: boolean;
  setIsDetailsDialogOpen: (isDetailsDialogOpen: boolean) => void;
  selectedCustomerDetails: any;
  setSelectedCustomerDetails: (customer: any) => void;
  confirmDialog: { isOpen: boolean; title: string; message: string; onConfirm: () => void; };
  setConfirmDialog: (dialog: any) => void;
  isCreateInvoiceDialogOpen: boolean;
  setIsCreateInvoiceDialogOpen: (open: boolean) => void;
  selectedInvoiceDetails: any;
  setSelectedInvoiceDetails: (details: any) => void;
}

const defaultRolePermissions: Record<string, string[]> = {
  admin: ['dashboard', 'customers', 'tickets', 'os', 'chat', 'map', 'kb', 'billing', 'team', 'ai-config', 'whatsapp', 'settings', 'inventory', 'observability', 'monitoring', 'cobrai', 'quality-monitor'],
  owner: ['dashboard', 'customers', 'tickets', 'chat', 'billing', 'team', 'os', 'ai-config', 'settings', 'whatsapp', 'inventory', 'map', 'observability', 'monitoring', 'cobrai', 'quality-monitor'],
  support: ['dashboard', 'customers', 'tickets', 'chat', 'ai-config'],
  tecnico: ['os']
};

export const canAccess = (role: 'admin' | 'owner' | 'support' | 'tecnico' | string, tab: string, customPermissions?: Record<string, string[]>) => {
  const permissions = customPermissions && Object.keys(customPermissions).length > 0 ? customPermissions : defaultRolePermissions;
  return permissions[role]?.includes(tab) || false;
};

export const useAppStore = create<AppState>((set) => ({
  // Auth & User
  user: null,
  userProfile: null,
  currentUserRole: 'support',
  setUser: (user) => set({ user }),
  setUserProfile: (userProfile) => set({ userProfile }),
  setCurrentUserRole: (currentUserRole) => set({ currentUserRole }),

  // Layout & UI
  activeTab: 'dashboard',
  isSidebarCollapsed: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  setIsSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),

  // Data Collections
  customers: [],
  setCustomers: (customers) => set({ customers }),
  
  ctos: [],
  setCtos: (ctos) => set({ ctos }),
  
  auditLogs: [],
  setAuditLogs: (auditLogs) => set({ auditLogs }),
  
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  
  invoices: [],
  setInvoices: (invoices) => set({ invoices }),
  
  serviceOrders: [],
  setServiceOrders: (serviceOrders) => set({ serviceOrders }),
  
  technicians: [],
  setTechnicians: (technicians) => set({ technicians }),
  
  integrationKeys: {},
  setIntegrationKeys: (updater) => set((state) => ({
    integrationKeys: typeof updater === 'function' ? updater(state.integrationKeys) : updater
  })),
  
  companySettings: {
    name: 'Astrum Soluções',
    logoUrl: 'https://picsum.photos/seed/isp/200/200',
    supportEmail: 'suporte@astrum.com.br',
    supportPhone: '(11) 99999-9999',
    workingHours: '08:00 - 20:00',
    timezone: 'America/Sao_Paulo'
  },
  setCompanySettings: (updater) => set((state) => ({
    companySettings: typeof updater === 'function' ? updater(state.companySettings) : updater
  })),

  // Notifications
  notifications: [],
  setNotifications: (updater) => set((state) => ({
    notifications: typeof updater === 'function' ? updater(state.notifications) : updater
  })),
  isNotificationsOpen: false,
  setIsNotificationsOpen: (isNotificationsOpen) => set({ isNotificationsOpen }),

  // General Loading
  loading: true,
  setLoading: (loading) => set({ loading }),
  
  messages: [],
  setMessages: (updater) => set((state) => ({
    messages: typeof updater === 'function' ? updater(state.messages) : updater
  })),
  
  isConfiguringAI: false,
  setIsConfiguringAI: (isConfiguringAI) => set({ isConfiguringAI }),

  // View Modals
  selectedTicket: null,
  setSelectedTicket: (selectedTicket) => set({ selectedTicket }),
  selectedCTO: null,
  setSelectedCTO: (selectedCTO) => set({ selectedCTO }),
  isCTODetailOpen: false,
  setIsCTODetailOpen: (isCTODetailOpen) => set({ isCTODetailOpen }),
  isTicketDetailOpen: false,
  setIsTicketDetailOpen: (isTicketDetailOpen) => set({ isTicketDetailOpen }),
  
  selectedCustomerDetails: null,
  isDetailsDialogOpen: false,
  setSelectedCustomerDetails: (selectedCustomerDetails) => set({ selectedCustomerDetails }),
  setIsDetailsDialogOpen: (isDetailsDialogOpen) => set({ isDetailsDialogOpen }),
  confirmDialog: { isOpen: false, title: '', message: '', onConfirm: () => {} },
  setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
  isCreateInvoiceDialogOpen: false,
  setIsCreateInvoiceDialogOpen: (isCreateInvoiceDialogOpen) => set({ isCreateInvoiceDialogOpen }),
  selectedInvoiceDetails: null,
  setSelectedInvoiceDetails: (selectedInvoiceDetails) => set({ selectedInvoiceDetails }),
}));
