import React, { useState, useEffect, useRef, useMemo } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { applyTheme } from "./lib/themeManager";
import {
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAppStore, canAccess } from "./store/useAppStore";
import {
  LayoutDashboard,
  Users,
  Ticket,
  MessageSquare,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Search,
  Plus,
  Minus,
  Send,
  Bot,
  User,
  LogOut,
  Map,
  Settings,
  ShieldCheck,
  CreditCard,
  Briefcase,
  Paperclip,
  Image,
  Mic,
  Database,
  Download,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Edit2,
  Eye,
  Copy,
  X,
  Sparkles,
  Moon,
  Sun,
  Book,
  Star,
  Wifi,
  Layers,
  Mail,
  Globe,
  Package,
  Box,
  BellRing,
  ShieldAlert,
  Smile,
  RefreshCw,
  Activity,
  Ticket as TicketIcon,
  Lightbulb,
  Target,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Toaster } from "@/src/components/ui/sonner";
import { toast } from "sonner";
import { WorkflowVisualizer } from "./components/WorkflowVisualizer";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Skeleton } from "./components/Skeleton";
import { cn } from "./lib/utils";
// FZ-4: autenticação e dados 100% Supabase (Firestore removido).
import { supabase } from "./lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Label } from "@/src/components/ui/label";
import {
  getCustomers,
  getTickets,
  getMessages,
  sendMessage,
  updateTicketStatus,
  createTicket,
  updateCustomer,
  createCustomer,
  createInvoice,
  toggleTicketAI,
  incrementAiAttempts,
  getInvoices,
  getNetworkCTOs,
  logAudit,
  getAuditLogs,
  notifyTeam,
  seedKnowledgeBase,
  seedSystem,
  getIntegrationKeys,
  saveIntegrationKeys,
  getSystemPrompts,
  saveSystemPrompts,
  createKBArticle,
  updateKBArticle,
  deleteKBArticle,
  getInventory,
  updateInventoryItem,
  createInventoryItem,
  deleteInventoryItem,
  seedInventory,
  getServiceOrders,
  getTechnicians,
  updateServiceOrder,
  updateTechnician,
  createServiceOrder,
  createTechnician,
  seedServiceOrdersAndTechnicians,
} from "./lib/db";
// S99 — Supabase real-time subscriptions (substituem os onSnapshot do Firestore)
import {
  getCustomers as sbGetCustomers,
  getTickets as sbGetTickets,
  getInvoices as sbGetInvoices,
  getNetworkCTOs as sbGetNetworkCTOs,
  getAuditLogs as sbGetAuditLogs,
  getInventory as sbGetInventory,
  getServiceOrders as sbGetServiceOrders,
  getTechnicians as sbGetTechnicians,
  getTeamMembers as sbGetTeamMembers,
  getKnowledgeBase as sbGetKnowledgeBase,
  getNotifications as sbGetNotifications,
  getRolePermissions as sbGetRolePermissions,
  getTenantSettings as sbGetTenantSettings,
  getIntegrationKeys as sbGetIntegrationKeys,
  upsertTenantOperator,
} from "./lib/supabaseDb";
import { seedPopularAstrum, wipeSystemData } from "./lib/seedAstrum";
import { uploadAttachment } from "./lib/storage";
import {
  getAIResponse,
  AGENT_CATEGORIES,
  SYSTEM_PROMPTS,
  summarizeTicketHistory,
  summarizeCustomerHistory,
  getSmartReplies,
  generateKBArticleFromTickets,
} from "./lib/gemini";
import { UpgradePrompt } from "./components/UpgradePrompt";
import { AppLayout } from "./components/layout/AppLayout";
import { StatCard } from "./components/ui/StatCard";
import { TicketsPage } from "./pages/TicketsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { AIConfigPage } from "./pages/AIConfigPage";
import { TeamPage } from "./pages/TeamPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SignupPage } from "./pages/SignupPage";

import { mainRoutes } from './routes/main.routes';

import {
  Bell,
  Check,
  AlertTriangle,
  Info,
  MoreVertical,
  Trash2,
  Filter,
  LayoutGrid,
  List as ListIcon,
  MapPin,
  Clock,
  Calendar,
  FileText,
  AlertCircle,
  History,
  Zap,
  BookOpen,
  Smartphone,
} from "lucide-react";

// --- App Component ---
import { WhatsAppConnectionsPage } from "./pages/WhatsAppPage";
import { MaskedSensitiveData } from "./components/MaskedSensitiveData";

import WebchatPage from "./pages/WebchatPage";
import OperatorMobilePage from "./pages/OperatorMobilePage";

const queryClient = new QueryClient();

export default function App() {
  const routerLocation = useLocation();
  if (routerLocation.pathname.startsWith('/webchat') || routerLocation.pathname.startsWith('/operador-mobile')) {
      return (
          <Routes>
             <Route path="/webchat" element={<WebchatPage />} />
             <Route path="/operador-mobile" element={<OperatorMobilePage />} />
          </Routes>
      );
  }

  if (routerLocation.pathname === '/register') {
      return (
          <Routes>
              <Route path="/register" element={<SignupPage />} />
          </Routes>
      );
  }

  const { theme, setTheme } = useTheme();
  const setAuditLogs = useAppStore((s) => s.setAuditLogs);
  const auditLogs = useAppStore((s) => s.auditLogs);
  const {
    user,
    setUser,
    userProfile,
    setUserProfile,
    currentUserRole,
    setCurrentUserRole,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    customers,
    setCustomers,
    tickets,
    setTickets,
    invoices,
    setInvoices,
    serviceOrders,
    setServiceOrders,
    technicians,
    setTechnicians,
    integrationKeys,
    setIntegrationKeys,
    companySettings,
    setCompanySettings,
    loading,
    setLoading,
    messages,
    setMessages,
  } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.substring(1) || "dashboard";
  const isDeveloper =
    user?.email?.toLowerCase() === "lucaspferraz123@gmail.com" ||
    user?.email?.toLowerCase() === "noturcursos1@gmail.com";
  const customerFileInputRef = useRef<HTMLInputElement>(null);
  const inventoryFileInputRef = useRef<HTMLInputElement>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");
  const [customerPlanFilter, setCustomerPlanFilter] = useState("all");
  const { selectedTicket, setSelectedTicket } = useAppStore();
  const [isSummarizingTicket, setIsSummarizingTicket] = useState(false);
  const [ticketSummary, setTicketSummary] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [messageBuffer, setMessageBuffer] = useState<string[]>([]);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null);
  const [evoStatus, setEvoStatus] = useState<string>("checking");
  const [isFetchingQr, setIsFetchingQr] = useState(false);

  const [newTechPhone, setNewTechPhone] = useState("");
  const [newTechName, setNewTechName] = useState("");
  const [isAddingTech, setIsAddingTech] = useState(false);
  const [isFetchingTechName, setIsFetchingTechName] = useState(false);

  const fetchEvolutionProfileName = async (phone: string) => {
    if (
      !integrationKeys.evolutionUrl ||
      !integrationKeys.evolutionInstance ||
      !integrationKeys.evolutionApiKey
    ) {
      return null;
    }
    setIsFetchingTechName(true);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      return `Técnico ${phone.slice(-4)}`;
    } catch (err) {
      return null;
    } finally {
      setIsFetchingTechName(false);
    }
  };

  const handleAddTechnician = async () => {
    if (!newTechPhone) {
      toast.error("Informe o número do WhatsApp.");
      return;
    }

    let finalName = newTechName;
    if (!finalName) {
      const fetchedName = await fetchEvolutionProfileName(newTechPhone);
      if (fetchedName) {
        finalName = fetchedName;
        setNewTechName(fetchedName);
        toast.success("Nome encontrado no WhatsApp!");
      } else {
        toast.error("Não foi possível buscar. Preencha o nome.");
        return;
      }
    }

    try {
      await createTechnician({
        name: finalName,
        phone: newTechPhone,
        status: "offline",
        currentTask: null,
      });
      toast.success("Técnico adicionado com sucesso.");
      setNewTechPhone("");
      setNewTechName("");
      setIsAddingTech(false);
    } catch (e) {
      toast.error("Erro ao adicionar técnico.");
    }
  };

  const configureEvolutionWebhook = async () => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionApiKey) {
      toast.error(
        "Preencha a URL e Global API Key primeiro para configurar o webhook.",
      );
      return;
    }

    let instancesToUpdate = [];
    if (integrationKeys.whatsappInstances) {
      try {
        const arr = JSON.parse(integrationKeys.whatsappInstances);
        instancesToUpdate = arr.map((a: any) => a.instanceName);
      } catch (e) {}
    }
    if (instancesToUpdate.length === 0 && integrationKeys.evolutionInstance) {
      instancesToUpdate.push(integrationKeys.evolutionInstance);
    }

    if (instancesToUpdate.length === 0) {
      toast.error("Nenhuma conexão de WhatsApp encontrada.");
      return;
    }

    let webhookUrl =
      integrationKeys.evolutionWebhookUrl ||
      `${window.location.origin}/api/webhook/evolution`;
    if (!integrationKeys.evolutionWebhookUrl) {
      try {
        const sysRes = await fetch("/api/system/webhook-url");
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          if (sysData.webhookUrl) {
            webhookUrl = sysData.webhookUrl;
          }
        }
      } catch (err) {
        console.error("Could not fetch proxy webhook url, using fallback", err);
      }
    }

    setIsFetchingQr(true);
    try {
      for (const instance of instancesToUpdate) {
        const payloads = [
          {
            path: `/webhook/set/${instance}`,
            body: {
              webhook: {
                enabled: true,
                url: webhookUrl,
                byEvents: false,
                base64: true,
                events: ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"],
              },
            },
          },
          {
            path: `/webhook/set/${instance}`,
            body: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              events: ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"],
            },
          },
          {
            path: `/webhook/set/${instance}`,
            body: {
              enabled: true,
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: true,
              events: ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"],
            },
          },
          {
            path: `/webhook/find/${instance}`,
          },
        ];

        let success = false;
        for (const pd of payloads) {
          try {
            const res = await fetch("/api/evolution/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: pd.path,
                method: pd.body ? "POST" : "GET",
                body: pd.body,
                evolutionUrl: integrationKeys.evolutionUrl,
                evolutionApiKey: integrationKeys.evolutionApiKey,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (
                data?.webhook?.url === webhookUrl ||
                data?.url === webhookUrl ||
                data?.webhook === webhookUrl ||
                data?.id
              ) {
                success = true;
                break;
              }
            }
          } catch (e) {
            console.error("Evolution Proxy Error", e);
          }
        }
      }

      toast.success("Webhook configurado em todas as instâncias ativas.");
    } catch (error) {
      toast.error("Erro ao configurar Webhook. Verifique a URL e Chave.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  const disconnectEvolutionInstance = async () => {
    if (
      !integrationKeys.evolutionUrl ||
      !integrationKeys.evolutionInstance ||
      !integrationKeys.evolutionApiKey
    ) {
      return;
    }
    try {
      if (
        !window.confirm(
          "Deseja realmente desconectar o WhatsApp desta instância?",
        )
      )
        return;
      setIsFetchingQr(true);
      await fetch(`/api/evolution/proxy`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/instance/logout/${integrationKeys.evolutionInstance}`,
          method: "DELETE",
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
        }),
      });
      setEvoStatus("disconnected");
      setEvoQrCode(null);
      toast.success("Instância desconectada com sucesso.");
    } catch (e) {
      toast.error("Erro ao desconectar instância.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  const fetchEvolutionQrCode = async () => {
    if (
      !integrationKeys.evolutionUrl ||
      !integrationKeys.evolutionInstance ||
      !integrationKeys.evolutionApiKey
    ) {
      toast.error("Preencha a URL, Instância e Global API Key primeiro.");
      return;
    }
    setIsFetchingQr(true);
    try {
      // 1. Check connection state
      const stateRes = await fetch(`/api/evolution/proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/instance/connectionState/${integrationKeys.evolutionInstance}`,
          method: "GET",
          evolutionUrl: integrationKeys.evolutionUrl,
          evolutionApiKey: integrationKeys.evolutionApiKey,
        }),
      });
      const stateData = await stateRes.json();

      if (stateData?.instance?.state === "open") {
        setEvoStatus("connected");
        setEvoQrCode(null);
        toast.success("Instância já está conectada!");
      } else {
        setEvoStatus("disconnected");
        // 2. Fetch QR Code
        const qrRes = await fetch(`/api/evolution/proxy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: `/instance/connect/${integrationKeys.evolutionInstance}`,
            method: "GET",
            evolutionUrl: integrationKeys.evolutionUrl,
            evolutionApiKey: integrationKeys.evolutionApiKey,
          }),
        });
        const qrData = await qrRes.json();
        if (qrData?.base64) {
          setEvoQrCode(qrData.base64);
          toast.info("Escaneie o QR Code com seu WhatsApp.");
        } else {
          toast.error(
            "Não foi possível gerar o QR Code. Verifique se a instância existe.",
          );
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(
        "Erro ao conectar com a Evolution API. Verifique a URL e a Chave.",
      );
    } finally {
      setIsFetchingQr(false);
    }
  };
  const [aiPrompts, setAiPrompts] =
    useState<Record<string, string>>(SYSTEM_PROMPTS);
  const [isSavingPrompts, setIsSavingPrompts] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([
    {
      id: "1",
      title: "Ticket Crítico",
      message: "Cliente reclamando de queda total no Centro.",
      type: "critical",
      time: "5m atrás",
      read: false,
    },
    {
      id: "2",
      title: "Estoque Baixo",
      message: "Roteadores TP-Link abaixo do estoque mínimo.",
      type: "warning",
      time: "1h atrás",
      read: false,
    },
    {
      id: "3",
      title: "Novo Pagamento",
      message: "Fatura de R$ 129,90 confirmada via PIX.",
      type: "success",
      time: "2h atrás",
      read: true,
    },
  ]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Test Agent State
  const [isTestAgentOpen, setIsTestAgentOpen] = useState(false);
  const [testAgentCategory, setTestAgentCategory] = useState<
    string | undefined
  >(undefined);
  const [testAgentMessage, setTestAgentMessage] = useState("");
  const [testAgentResponse, setTestAgentResponse] = useState<any>(null);
  const [isTestingAgent, setIsTestingAgent] = useState(false);

  const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastAiResponseTime, setLastAiResponseTime] = useState<number | null>(
    null,
  );
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    base64: string;
    type: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState<any>({
    name: "",
    email: "",
    phone: "",
    address: "",
    plan: "",
    mrr: 0,
    status: "active",
    tags: [],
  });
  const [newTagInput, setNewTagInput] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const {
    selectedCustomerDetails,
    setSelectedCustomerDetails,
    isDetailsDialogOpen,
    setIsDetailsDialogOpen,
  } = useAppStore();
  const [ctos, setCtos] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isTeamMemberDialogOpen, setIsTeamMemberDialogOpen] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<any>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);

  const [isSeeding, setIsSeeding] = useState(false);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [isKBDialogOpen, setIsKBDialogOpen] = useState(false);
  const [isMiningDialogOpen, setIsMiningDialogOpen] = useState(false);
  const [miningResult, setMiningResult] = useState<any>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [needsMfaEnrollment, setNeedsMfaEnrollment] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [pdfSummary, setPdfSummary] = useState<string | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const { isTicketDetailOpen, setIsTicketDetailOpen } = useAppStore();
  const [isCustomerDetailOpen, setIsCustomerDetailOpen] = useState(false);
  const { isCTODetailOpen, setIsCTODetailOpen, selectedCTO, setSelectedCTO } =
    useAppStore();
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticsResult, setDiagnosticsResult] = useState<any>(null);
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<any[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [newTeamMember, setNewTeamMember] = useState({
    name: "",
    email: "",
    role: "support",
  });
  const [editingKB, setEditingKB] = useState<any>(null);
  const [newKB, setNewKB] = useState<any>({
    title: "",
    content: "",
    category: "Geral",
    tags: [],
  });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingSmartReplies, setIsGeneratingSmartReplies] =
    useState(false);
  const [dashboardSubTab, setDashboardSubTab] = useState<
    "overview" | "performance"
  >("overview");
  const handleDeleteTeamMember = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Remover Colaborador",
      message:
        "Tem certeza que deseja remover este colaborador? Esta ação não pode ser desfeita.",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("team_members").delete().eq("id", id);
          if (error) throw error;
          toast.success("Colaborador removido com sucesso!");
        } catch (error: any) {
          toast.error("Erro ao remover colaborador: " + error.message);
        }
      },
    });
  };

  const seedTicketsAndLogs = async () => {
    setIsSeeding(true);
    try {
      // Seed some tickets
      for (let i = 0; i < 20; i++) {
        const customer =
          customers[Math.floor(Math.random() * customers.length)];
        if (!customer) continue;

        const { data: ticketRef, error: seedTicketErr } = await supabase
          .from("tickets")
          .insert({
            customer_id: customer.id,
            subject: `Problema de conexão #${i}`,
            status: Math.random() > 0.5 ? "resolved" : "open",
            priority: ["low", "medium", "high", "urgent"][
              Math.floor(Math.random() * 4)
            ],
          })
          .select()
          .single();
        if (seedTicketErr || !ticketRef) continue;

        // Seed some messages
        await supabase.from("messages").insert({
          ticket_id: ticketRef.id,
          sender_type: "customer",
          body: "Minha internet está caindo muito hoje.",
        });

        // Seed some audit logs
        await logAudit("TICKET_CREATED", {
          ticketId: ticketRef.id,
          customerId: customer.id,
        });
        if (Math.random() > 0.5) {
          await logAudit("TICKET_RESOLVED", {
            ticketId: ticketRef.id,
            sentiment: ["POSITIVO", "NEUTRO", "NEGATIVO"][
              Math.floor(Math.random() * 3)
            ],
            category: ["SUPORTE_TECNICO", "FATURA", "RETENCAO"][
              Math.floor(Math.random() * 3)
            ],
            responseTime: Math.floor(Math.random() * 120) + 10,
          });
        }
      }
      toast.success("Tickets e Logs de auditoria gerados com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar dados de teste.");
    } finally {
      setIsSeeding(false);
    }
  };

  const [inventory, setInventory] = useState<any[]>([
    {
      id: "1",
      name: "ONU Huawei HG8245H",
      category: "ONU",
      stock: 45,
      minStock: 10,
      unit: "un",
      price: 180,
    },
    {
      id: "2",
      name: "Roteador TP-Link Archer C6",
      category: "Roteador",
      stock: 12,
      minStock: 15,
      unit: "un",
      price: 220,
    },
    {
      id: "3",
      name: "Cabo Drop Flat (km)",
      category: "Cabo",
      stock: 4.5,
      minStock: 2,
      unit: "km",
      price: 450,
    },
    {
      id: "4",
      name: "Conector Fast SC/APC",
      category: "Acessório",
      stock: 500,
      minStock: 100,
      unit: "un",
      price: 1.5,
    },
  ]);

  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
  const [isNewTicketDialogOpen, setIsNewTicketDialogOpen] = useState(false);
  const [isInventoryDialogOpen, setIsInventoryDialogOpen] = useState(false);
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [newItem, setNewItem] = useState({
    name: "",
    category: "ONU",
    stock: 0,
    minStock: 5,
    unit: "un",
    price: 0,
  });

  const handleAdjustInventory = async (id: string, amount: number) => {
    const item = inventory.find((i) => i.id === id);
    if (!item) return;

    const newStock = item.stock + amount;
    try {
      await updateInventoryItem(id, { stock: newStock });
      await logAction("INVENTORY_ADJUSTED", {
        itemId: id,
        itemName: item.name,
        oldStock: item.stock,
        newStock,
      });
      toast.success("Estoque atualizado com sucesso!");
      setIsInventoryDialogOpen(false);
    } catch (error) {
      toast.error("Erro ao atualizar estoque.");
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name) {
      toast.error("O nome do item é obrigatório.");
      return;
    }
    try {
      const id = await createInventoryItem(newItem);
      await logAction("INVENTORY_ITEM_CREATED", {
        itemId: id,
        itemName: newItem.name,
      });
      setIsNewItemDialogOpen(false);
      setNewItem({
        name: "",
        category: "ONU",
        stock: 0,
        minStock: 5,
        unit: "un",
        price: 0,
      });
      toast.success("Item adicionado ao estoque!");
    } catch (error) {
      toast.error("Erro ao adicionar item.");
    }
  };

  const handleDeleteItem = async (id: string) => {
    const item = inventory.find((i) => i.id === id);
    setConfirmDialog({
      isOpen: true,
      title: "Remover Item do Estoque",
      message: `Tem certeza que deseja remover o item "${item?.name}" do estoque? Esta ação não pode ser desfeita.`,
      onConfirm: async () => {
        try {
          await deleteInventoryItem(id);
          await logAction("INVENTORY_ITEM_DELETED", {
            itemId: id,
            itemName: item?.name,
          });
          toast.success("Item removido do estoque.");
        } catch (error) {
          toast.error("Erro ao remover item.");
        }
      },
    });
  };

  const handleAddMember = async () => {
    if (!newTeamMember.name || !newTeamMember.email) {
      toast.error("Nome e e-mail são obrigatórios.");
      return;
    }
    try {
      const { error } = await supabase.from("team_members").insert({
        ...newTeamMember,
        status: "Ativo",
      });
      if (error) throw error;
      setIsTeamMemberDialogOpen(false);
      setNewTeamMember({ name: "", email: "", role: "Suporte Técnico" });
      toast.success("Membro adicionado à equipe!");
    } catch (error) {
      toast.error("Erro ao adicionar membro.");
    }
  };

  const handleDeleteMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    toast.success("Membro removido da equipe.");
  };

  const inventoryCategoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    inventory.forEach((item) => {
      categories[item.category] = (categories[item.category] || 0) + item.stock;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [inventory]);

  // Monitor inventory for low stock alerts
  useEffect(() => {
    inventory.forEach((item) => {
      if (item.stock <= item.minStock) {
        const alreadyNotified = notifications.some(
          (n) => n.type === "warning" && n.message.includes(item.name),
        );
        if (!alreadyNotified) {
          const newNotification = {
            id: Math.random().toString(36).substr(2, 9),
            title: "Estoque Baixo",
            message: `O item ${item.name} atingiu o nível crítico (${item.stock} ${item.unit}).`,
            type: "warning",
            time: "Agora",
            read: false,
          };
          setNotifications((prev) => [newNotification, ...prev]);
          toast.warning(`Alerta de Estoque: ${item.name} está baixo!`);
        }
      }
    });
  }, [inventory, notifications]);

  // Ask for notification permissions on load
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const rolePermissions = useAppStore((s) => s.rolePermissions);

  // Use canAccess from store
  const checkAccess = (tab: string) => {
    return canAccess(
      currentUserRole,
      tab,
      rolePermissions && Object.keys(rolePermissions).length > 0
        ? rolePermissions
        : companySettings?.rolePermissions,
    );
  };

  const isAstrum = currentUserRole === "admin";
  const isOwner = currentUserRole === "owner" || isAstrum;
  const isSupport = currentUserRole === "support" || isOwner;

  // --- Real-time Metrics Calculations ---
  const totalMrr = useMemo(() => {
    return customers.reduce(
      (acc, c) => acc + (c.status === "active" ? c.mrr || 0 : 0),
      0,
    );
  }, [customers]);

  const activeCustomersCount = useMemo(() => {
    return customers.filter((c) => c.status === "active").length;
  }, [customers]);

  const performanceScatterData = useMemo(() => {
    return auditLogs.map((log) => ({
      responseTime: log.responseTime || 0,
      sentimentScore:
        log.sentiment === "POSITIVO"
          ? 90
          : log.sentiment === "NEUTRO"
            ? 50
            : 10,
      id: log.id,
    }));
  }, [auditLogs]);

  const categoryEfficiencyData = useMemo(() => {
    const categories = [
      { id: "SUPORTE_TECNICO", label: "Suporte" },
      { id: "FATURA", label: "Financeiro" },
      { id: "Vendas", label: "Vendas" },
      { id: "RETENCAO", label: "Retenção" },
    ];
    return categories.map((cat) => {
      const catLogs = auditLogs.filter((l) => l.category === cat.id);
      const efficiency =
        catLogs.length > 0
          ? (catLogs.filter((l) => l.slaCompliant).length / catLogs.length) *
            100
          : Math.random() * 40 + 60; // Fallback for demo
      return { subject: cat.label, A: efficiency, fullMark: 100 };
    });
  }, [auditLogs]);

  const ticketsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tickets.filter((t) => {
      let ticketDate;
      if (t.createdAt?.toDate) {
        ticketDate = t.createdAt.toDate();
      } else if (t.createdAt?.seconds) {
        ticketDate = new Date(t.createdAt.seconds * 1000);
      } else {
        ticketDate = new Date();
      }
      return ticketDate >= today;
    }).length;
  }, [tickets]);

  const aiResolutionRate = useMemo(() => {
    const resolvedTickets = tickets.filter((t) => t.status === "resolved");
    if (resolvedTickets.length === 0) return 0;
    const aiHandled = resolvedTickets.filter((t) => t.aiHandled).length;
    return (aiHandled / resolvedTickets.length) * 100;
  }, [tickets]);

  const aiResolutionTrend = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const ticketsLast30 = tickets.filter((t) => {
      let d;
      if (t.createdAt?.toDate) {
        d = t.createdAt.toDate();
      } else if (t.createdAt?.seconds) {
        d = new Date(t.createdAt.seconds * 1000);
      } else {
        d = new Date();
      }
      return d >= thirtyDaysAgo;
    });

    const ticketsPrev30 = tickets.filter((t) => {
      let d;
      if (t.createdAt?.toDate) {
        d = t.createdAt.toDate();
      } else if (t.createdAt?.seconds) {
        d = new Date(t.createdAt.seconds * 1000);
      } else {
        d = new Date();
      }
      return d >= sixtyDaysAgo && d < thirtyDaysAgo;
    });

    const getRate = (list: any[]) => {
      const resolved = list.filter((t) => t.status === "resolved");
      if (resolved.length === 0) return 0;
      return (
        (resolved.filter((t) => t.aiHandled).length / resolved.length) * 100
      );
    };

    const rateLast30 = getRate(ticketsLast30);
    const ratePrev30 = getRate(ticketsPrev30);

    if (ratePrev30 === 0)
      return rateLast30 > 0 ? `+${rateLast30.toFixed(1)}%` : "0%";
    const diff = rateLast30 - ratePrev30;
    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  }, [tickets]);

  const avgResponseTime = useMemo(() => {
    if (auditLogs.length === 0) return 0;
    const total = auditLogs.reduce(
      (acc, log) => acc + (log.responseTime || 0),
      0,
    );
    return total / auditLogs.length;
  }, [auditLogs]);

  const sentimentCounts = useMemo(() => {
    const counts = auditLogs.reduce(
      (acc: any, log) => {
        if (log.sentiment) {
          acc[log.sentiment] = (acc[log.sentiment] || 0) + 1;
        }
        return acc;
      },
      { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 },
    );
    return counts;
  }, [auditLogs]);

  const sentimentStats = useMemo(() => {
    const logsWithSentiment = auditLogs.filter((l) => l.sentiment);
    if (logsWithSentiment.length === 0)
      return { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 };
    const total = logsWithSentiment.length;
    return {
      POSITIVO: Math.round(((sentimentCounts.POSITIVO || 0) / total) * 100),
      NEUTRO: Math.round(((sentimentCounts.NEUTRO || 0) / total) * 100),
      NEGATIVO: Math.round(((sentimentCounts.NEGATIVO || 0) / total) * 100),
    };
  }, [auditLogs, sentimentCounts]);

  const sentimentChartData = useMemo(() => {
    if (auditLogs.length === 0)
      return [{ name: "Sem Dados", value: 1, color: "#f4f4f5" }];
    return [
      { name: "Positivo", value: sentimentCounts.POSITIVO, color: "#22c55e" },
      { name: "Neutro", value: sentimentCounts.NEUTRO, color: "#a1a1aa" },
      { name: "Negativo", value: sentimentCounts.NEGATIVO, color: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [sentimentCounts, auditLogs]);

  const categoryChartData = useMemo(() => {
    const counts = auditLogs.reduce((acc: any, log) => {
      if (log.category) {
        acc[log.category] = (acc[log.category] || 0) + 1;
      }
      return acc;
    }, {});

    const data = Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => (b.value as number) - (a.value as number))
      .slice(0, 5);

    return data.length > 0 ? data : [{ name: "Sem Dados", value: 1 }];
  }, [auditLogs]);

  const slaRiskTickets = useMemo(() => {
    const now = Date.now();
    return tickets
      .filter((t) => {
        if (t.status === "resolved") return false;
        const createdAt = t.createdAt?.seconds
          ? t.createdAt.seconds * 1000
          : now;
        const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
        return hoursOpen > 4; // Risk if open more than 4 hours
      })
      .sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
      );
  }, [tickets]);

  const filteredSearchTickets = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return tickets
      .filter(
        (t) =>
          t.id.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [searchQuery, tickets]);

  const filteredSearchCustomers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [searchQuery, customers]);

  const filteredSearchCtos = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return ctos.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 3);
  }, [searchQuery, ctos]);

  const filteredSearchKB = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return knowledgeBase
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q),
      )
      .slice(0, 3);
  }, [searchQuery, knowledgeBase]);

  const teamPerformanceData = useMemo(() => {
    return teamMembers.map((member) => ({
      name: member.name,
      tickets: Math.floor(Math.random() * 50) + 10,
      rating: (Math.random() * 1.5 + 3.5).toFixed(1),
      responseTime: (Math.random() * 5 + 2).toFixed(1),
    }));
  }, [teamMembers]);

  const handleGenerateAIArticle = async () => {
    const resolvedTickets = tickets.filter((t) => t.status === "resolved");
    if (resolvedTickets.length < 3) {
      toast.error(
        "Não há tickets resolvidos suficientes para gerar um artigo útil.",
        {
          description:
            "Resolva pelo menos 3 tickets para que a IA possa analisar padrões.",
        },
      );
      return;
    }

    toast.info("IA está analisando tickets para gerar um novo artigo...", {
      description: "Isso pode levar alguns segundos.",
    });

    try {
      const ticketsText = resolvedTickets
        .slice(0, 15)
        .map((t) => `- ${t.subject}`)
        .join("\n");
      const article = await generateKBArticleFromTickets(ticketsText);

      if (article) {
        await createKBArticle(article);
        toast.success(
          "Novo artigo gerado pela IA e adicionado à Base de Conhecimento!",
          {
            description: article.title,
          },
        );
      } else {
        toast.error("Não foi possível gerar o artigo no momento.");
      }
    } catch (error) {
      console.error("KB Generation Error:", error);
      toast.error("Erro ao gerar artigo com IA.");
    }
  };

  const runCustomerDiagnostics = async (customerId: string) => {
    toast.info("Iniciando diagnósticos remotos...", {
      description: "Verificando sinal, latência e autenticação PPPoE.",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = {
      id: Math.random().toString(36).substr(2, 9),
      customerId,
      timestamp: new Date(),
      signal: `-${Math.floor(Math.random() * 10 + 18)} dBm`,
      latency: `${Math.floor(Math.random() * 15 + 5)}ms`,
      status: Math.random() > 0.1 ? "online" : "offline",
      uptime: "12d 4h 32m",
    };

    setDiagnosticsHistory((prev) => [result, ...prev]);
    toast.success("Diagnóstico concluído com sucesso!");
    return result;
  };

  const handleSimulatePayment = async (invoiceId: string) => {
    try {
      const { error } = await supabase.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
      if (error) throw error;
      await logAction("INVOICE_PAID", { invoiceId });
      toast.success("Pagamento simulado com sucesso!");
    } catch (error) {
      console.error("Payment Simulation Error:", error);
      toast.error("Erro ao simular pagamento.");
    }
  };

  const mrrTrend = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    let currentMonthTotal = 0;
    let prevMonthTotal = 0;

    invoices.forEach((inv) => {
      if (inv.status !== "paid") return;
      let date;
      if (inv.dueDate?.toDate) {
        date = inv.dueDate.toDate();
      } else if (inv.dueDate?.seconds) {
        date = new Date(inv.dueDate.seconds * 1000);
      } else {
        date = null;
      }
      if (!date) return;

      if (
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      ) {
        currentMonthTotal += inv.amount || 0;
      } else if (
        date.getMonth() === prevMonth &&
        date.getFullYear() === prevYear
      ) {
        prevMonthTotal += inv.amount || 0;
      }
    });

    if (prevMonthTotal === 0) return "+0%";
    const diff = ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100;
    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  }, [invoices]);

  const customersTrend = useMemo(() => {
    const now = new Date();
    const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = customers.filter((c) => {
      let createdAt;
      if (c.createdAt?.toDate) {
        createdAt = c.createdAt.toDate();
      } else if (c.createdAt?.seconds) {
        createdAt = new Date(c.createdAt.seconds * 1000);
      } else {
        createdAt = new Date();
      }
      return createdAt >= firstDayCurrentMonth;
    }).length;
    return `+${newThisMonth}`;
  }, [customers]);

  const ticketsTrend = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const countToday = tickets.filter((t) => {
      let d;
      if (t.createdAt?.toDate) {
        d = t.createdAt.toDate();
      } else if (t.createdAt?.seconds) {
        d = new Date(t.createdAt.seconds * 1000);
      } else {
        d = new Date();
      }
      return d >= today;
    }).length;

    const countYesterday = tickets.filter((t) => {
      let d;
      if (t.createdAt?.toDate) {
        d = t.createdAt.toDate();
      } else if (t.createdAt?.seconds) {
        d = new Date(t.createdAt.seconds * 1000);
      } else {
        d = new Date();
      }
      return d >= yesterday && d < today;
    }).length;

    if (countYesterday === 0) return countToday > 0 ? `+${countToday}` : "0%";
    const diff = ((countToday - countYesterday) / countYesterday) * 100;
    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  }, [tickets]);

  const dynamicMrrData = useMemo(() => {
    // Group invoices by month for the last 12 months
    const months = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      last12Months.push({
        name: months[d.getMonth()],
        monthIndex: d.getMonth(),
        year: d.getFullYear(),
        value: 0,
      });
    }

    invoices.forEach((inv) => {
      if (inv.status !== "paid") return;
      const date = inv.dueDate?.seconds
        ? new Date(inv.dueDate.seconds * 1000)
        : null;
      if (!date) return;

      const monthData = last12Months.find(
        (m) =>
          m.monthIndex === date.getMonth() && m.year === date.getFullYear(),
      );
      if (monthData) {
        monthData.value += inv.amount || 0;
      }
    });

    return last12Months;
  }, [invoices]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }

      // Tab Shortcuts (Alt + Number)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            navigate("/");
            break;
          case "2":
            e.preventDefault();
            navigate("/");
            break;
          case "3":
            e.preventDefault();
            navigate("/");
            break;
          case "4":
            e.preventDefault();
            navigate("/");
            break;
          case "5":
            e.preventDefault();
            navigate("/");
            break;
          case "6":
            e.preventDefault();
            navigate("/");
            break;
          case "7":
            e.preventDefault();
            navigate("/");
            break;
          case "8":
            e.preventDefault();
            navigate("/");
            break;
          case "9":
            e.preventDefault();
            navigate("/");
            break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    // --- Auth v2 (S77): sessão via Supabase ---
    let mounted = true;
    const applySession = async (session: any) => {
      const su = session?.user ?? null;
      if (!su) { if (mounted) { setUser(null); setLoading(false); } return; }
      const appUser: any = {
        uid: su.id,
        email: su.email,
        displayName: su.user_metadata?.name || (su.email ? su.email.split('@')[0] : 'Usuário'),
      };
      if (!mounted) return;
      setUser(appUser);
      const superEmails = ['lucaspferraz123@gmail.com', 'noturcursos1@gmail.com'];
      try {
        const { data } = await supabase
          .from('users')
          .select('role, tenant_id, name, email')
          .eq('id', appUser.uid)
          .maybeSingle();
        if (data) {
          const isSuperEmail = superEmails.includes((appUser.email || '').toLowerCase());
          const dbRole = ((data as any).role || 'support').toLowerCase();
          const mapped = isSuperEmail || dbRole === 'super_admin' || dbRole === 'admin' || dbRole === 'owner'
            ? 'admin'
            : (dbRole === 'tecnico' ? 'tecnico' : 'support');
          setCurrentUserRole(mapped as any);
          setUserProfile({ ...(data as any), role: mapped, tenantId: (data as any).tenant_id });
        } else if (superEmails.includes((appUser.email || '').toLowerCase())) {
          setCurrentUserRole('admin');
          setUserProfile({ email: appUser.email, role: 'admin', name: appUser.displayName, tenantId: null });
        } else {
          setCurrentUserRole('support');
          setUserProfile({ email: appUser.email, role: 'support', tenantId: null });
        }
      } catch {
        if (superEmails.includes((appUser.email || '').toLowerCase())) {
          setCurrentUserRole('admin');
          setUserProfile({ email: appUser.email, role: 'admin', name: appUser.displayName, tenantId: null });
        } else {
          setCurrentUserRole('support');
        }
      }
      setNeedsMfaEnrollment(false);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }: any) => applySession(data.session));
    const { data: authSub } = supabase.auth.onAuthStateChange((_e: any, session: any) => applySession(session));


    return () => { mounted = false; authSub?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!userProfile?.tenantId) return;
    // S99 — lê configurações de tema do tenant no Supabase
    const unsub = sbGetTenantSettings(userProfile.tenantId, (settings) => {
      if (settings?.theme) applyTheme(settings.theme);
    });
    return () => unsub();
  }, [userProfile?.tenantId]);

  useEffect(() => {
    if (selectedTicket && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.senderType === "client") {
        generateSmartReplies(lastMessage.text);
      } else {
        setSmartReplies([]);
      }
    }
  }, [selectedTicket, messages]);

  const generateSmartReplies = async (text: string) => {
    setIsGeneratingSmartReplies(true);
    try {
      const replies = await getSmartReplies(text);
      setSmartReplies(replies);
    } catch (error) {
      console.error("Error generating smart replies:", error);
    } finally {
      setIsGeneratingSmartReplies(false);
    }
  };

  // S99 — Data loading via Supabase real-time (substituiu onSnapshot do Firestore)
  useEffect(() => {
    if (!user) return;
    const tid = companySettings?.tenant_id || userProfile?.tenantId || "default";

    const unsubCustomers    = sbGetCustomers(setCustomers, tid);
    const unsubTickets      = sbGetTickets(setTickets, tid);
    const unsubInvoices     = sbGetInvoices(setInvoices, tid);
    const unsubCtos         = sbGetNetworkCTOs(setCtos, tid);
    const unsubKB           = sbGetKnowledgeBase(setKnowledgeBase, tid);
    const unsubAudit        = sbGetAuditLogs(setAuditLogs, tid);
    const unsubInventory    = sbGetInventory(setInventory, tid);
    const unsubServiceOrders = sbGetServiceOrders(setServiceOrders, tid);
    const unsubTechnicians  = sbGetTechnicians(setTechnicians, tid);
    const unsubTeam         = sbGetTeamMembers(setTeamMembers, tid);
    const unsubNotifications = sbGetNotifications(setNotifications, tid);
    const unsubRoles        = sbGetRolePermissions((rolesData) => {
      useAppStore.getState().setRolePermissions(rolesData);
    });

    // Integration keys e system prompts (async one-shot)
    sbGetIntegrationKeys(tid).then((keys) => setIntegrationKeys(keys || {}));
    getSystemPrompts(tid).then((prompts) => {
      if (prompts) setAiPrompts((prev) => ({ ...prev, ...prompts }));
    });

    return () => {
      unsubCustomers();
      unsubTickets();
      unsubInvoices();
      unsubCtos();
      unsubKB();
      unsubAudit();
      unsubInventory();
      unsubServiceOrders();
      unsubTechnicians();
      unsubTeam();
      unsubNotifications();
      unsubRoles();
    };
  }, [user, companySettings?.tenant_id, userProfile?.tenantId]);

  const handleSeedKB = async () => {
    setIsSeeding(true);
    try {
      await seedKnowledgeBase();
      toast.success("Base de conhecimento populada com sucesso!");
    } catch (error) {
      toast.error("Erro ao popular base de conhecimento.");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedSystem = async () => {
    setIsSeeding(true);
    try {
      await seedSystem();
      await seedInventory();
      await seedServiceOrdersAndTechnicians();
      toast.success(
        "Sistema populado com 100 clientes, estoque, OS e dados de teste!",
      );
    } catch (error) {
      toast.error("Erro ao popular sistema.");
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSeedPopularAstrum = async () => {
    setIsSeeding(true);
    let currentToastId: string | number | undefined;
    try {
      currentToastId = toast.loading("Iniciando Popular Astrum...");
      await seedPopularAstrum((msg: string) => {
        toast.loading(msg, { id: currentToastId });
      });
      toast.success(
        "Astrum populado com 30 dias de operação (1500 clientes) e histórico!",
        { id: currentToastId },
      );
    } catch (error) {
      console.error(error);
      toast.error("Erro ao popular o Astrum.", { id: currentToastId });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleWipeSystem = async () => {
    if (
      !window.confirm(
        "Você tem certeza? ISSO APAGARÁ TODOS OS DADOS (Clientes, Tickets, etc).",
      )
    )
      return;
    setIsSeeding(true);
    let currentToastId: string | number | undefined;
    try {
      currentToastId = toast.loading("Iniciando Limpeza Total...");
      await wipeSystemData((msg: string) => {
        toast.loading(msg, { id: currentToastId });
      });
      toast.success("Sistema resetado para VAZIO!", { id: currentToastId });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao apagar os dados.", { id: currentToastId });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleTestAgent = async () => {
    if (!testAgentMessage.trim()) return;
    setIsTestingAgent(true);
    setTestAgentResponse(null);
    try {
      const res = await getAIResponse(
        [{ role: "user", parts: [{ text: testAgentMessage }] }],
        testAgentCategory,
      );
      setTestAgentResponse(res);
    } catch (err: any) {
      setTestAgentResponse({ error: err.message || "Erro ao testar agente" });
    } finally {
      setIsTestingAgent(false);
    }
  };

  const handleSavePrompts = async () => {
    setIsSavingPrompts(true);
    try {
      await saveSystemPrompts(
        aiPrompts,
        companySettings?.tenant_id || "default",
      );
      toast.success("Núcleo IA atualizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar prompts.");
    } finally {
      setIsSavingPrompts(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch (err) {
      console.error(err);
    }
  };

  const clearNotifications = async () => {
    try {
      const ids = notifications.map((n) => n.id);
      if (ids.length > 0) {
        await supabase.from("notifications").delete().in("id", ids);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportInvoicePDF = (invoice: any) => {
    const customer = customers.find((c) => c.id === invoice.customerId);
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("Astrum - FATURA", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Data de Emissão: ${new Date().toLocaleDateString("pt-BR")}`,
      105,
      28,
      { align: "center" },
    );

    // Customer Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("DADOS DO CLIENTE", 20, 45);
    doc.line(20, 47, 190, 47);

    doc.setFontSize(10);
    doc.text(`Nome: ${customer?.name || "N/A"}`, 20, 55);
    doc.text(`Email: ${customer?.email || "N/A"}`, 20, 62);
    doc.text(`Endereço: ${customer?.address || "N/A"}`, 20, 69);
    doc.text(`Plano: ${customer?.plan || "N/A"}`, 20, 76);

    // Invoice Info
    doc.setFontSize(12);
    doc.text("DETALHES DA FATURA", 20, 95);
    doc.line(20, 97, 190, 97);

    autoTable(doc, {
      startY: 105,
      head: [["Descrição", "Vencimento", "Status", "Valor"]],
      body: [
        [
          `Mensalidade Internet - ${customer?.plan || "Plano"}`,
          invoice.dueDate?.seconds
            ? new Date(invoice.dueDate.seconds * 1000).toLocaleDateString(
                "pt-BR",
              )
            : invoice.dueDate,
          invoice.status.toUpperCase(),
          `R$ ${invoice.amount.toFixed(2)}`,
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: [40, 40, 40] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.text(`TOTAL: R$ ${invoice.amount.toFixed(2)}`, 190, finalY, {
      align: "right",
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Astrum - Soluções em Conectividade", 105, 280, {
      align: "center",
    });
    doc.text(
      "Este documento é uma representação digital de fatura.",
      105,
      285,
      { align: "center" },
    );

    doc.save(
      `fatura_${customer?.name.replace(/\s+/g, "_")}_${invoice.id?.slice(0, 5) || "INV"}.pdf`,
    );
    toast.success("PDF gerado com sucesso!");
  };

  const handleRunDiagnostics = async (
    targetId?: string,
    type: "cto" | "customer" = "cto",
  ) => {
    const id =
      targetId ||
      (type === "cto" ? selectedCTO?.id : selectedCustomerDetails?.id);
    if (!id) return;

    setIsDiagnosing(true);
    setDiagnosticsResult(null);

    // Simulate network latency and processing
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const isCto = type === "cto";
    const target = isCto
      ? ctos.find((c) => c.id === id)
      : customers.find((c) => c.id === id);

    const results = {
      id: Math.random().toString(36).substr(2, 9),
      targetId: id,
      targetType: type,
      timestamp: new Date(),
      status: "success",
      metrics: {
        avgSignal: -19.5 - Math.random() * 5,
        packetLoss: Math.random() * 0.5,
        latency: 15 + Math.random() * 10,
        activeOnus: isCto ? Math.floor((target?.usedPorts || 10) * 0.95) : 1,
        alerts: [] as string[],
      },
    };

    if (results.metrics.avgSignal < -25)
      results.metrics.alerts.push("Sinal baixo detectado.");
    if (results.metrics.packetLoss > 0.3)
      results.metrics.alerts.push("Perda de pacotes detectada.");
    if (!isCto && results.metrics.avgSignal < -27)
      results.metrics.alerts.push(
        "Possível problema no conector ou fibra dobrada.",
      );

    setDiagnosticsResult(results);
    setDiagnosticsHistory((prev) => [results, ...prev].slice(0, 5));
    setIsDiagnosing(false);
    toast.success(`Diagnóstico de ${isCto ? "CTO" : "Cliente"} concluído!`);
    return results;
  };

  const handleGenerateInvoice = async () => {
    if (!selectedCustomerDetails) return;

    try {
      const amount =
        selectedCustomerDetails.plan === "1 Giga"
          ? 199.9
          : selectedCustomerDetails.plan === "500 Mega"
            ? 129.9
            : 99.9;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5);

      const { error } = await supabase.from("invoices").insert({
        customer_id: selectedCustomerDetails.id,
        customer_name: selectedCustomerDetails.name,
        amount,
        status: "pending",
        due_date: dueDate.toISOString(),
      });
      if (error) throw error;

      toast.success("Fatura gerada com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar fatura.");
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamMember.name || !newTeamMember.email) return;

    try {
      const activeTenant = userProfile?.tenantId || "DEFAULT_TENANT";
      const { data: memberRow, error } = await supabase.from("team_members").insert({
        ...newTeamMember,
        tenant_id: activeTenant,
      }).select().single();
      if (error) throw error;
      if (newTeamMember.role === "Atendente" || newTeamMember.role === "support") {
        await upsertTenantOperator(activeTenant, memberRow.id, {
          name: newTeamMember.name,
          email: newTeamMember.email,
          status: "online",
          skills: ["SAC_GERAL"],
          max_concurrent_chats: 5,
          current_chat_count: 0
        });
      }
      setIsTeamMemberDialogOpen(false);
      setNewTeamMember({ name: "", email: "", role: "Atendente" });
      toast.success("Membro da equipe adicionado!");
    } catch (error) {
      toast.error("Erro ao adicionar membro.");
    }
  };

  const handleSaveKB = async () => {
    if (!newKB.title || !newKB.content) {
      toast.error("Título e conteúdo são obrigatórios.");
      return;
    }

    try {
      if (editingKB) {
        await updateKBArticle(editingKB.id, newKB);
        toast.success("Artigo atualizado!");
      } else {
        await createKBArticle(newKB);
        toast.success("Artigo criado!");
      }
      setIsKBDialogOpen(false);
      setEditingKB(null);
      setNewKB({ title: "", content: "", category: "Geral", tags: [] });
    } catch (error) {
      toast.error("Erro ao salvar artigo.");
    }
  };

  const handleDeleteKB = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este artigo?")) return;
    try {
      await deleteKBArticle(id);
      toast.success("Artigo excluído!");
    } catch (error) {
      toast.error("Erro ao excluir artigo.");
    }
  };

  const handleExportCSV = () => {
    if (auditLogs.length === 0) {
      toast.error("Nenhum dado para exportar.");
      return;
    }

    const headers = [
      "Data/Hora",
      "Ticket ID",
      "Categoria",
      "Sentimento",
      "Tempo de Resposta (s)",
      "SLA Cumprido",
      "Crítico",
    ];
    const csvRows = [headers.join(",")];

    for (const log of auditLogs) {
      const date = log.timestamp
        ? new Date(log.timestamp.seconds * 1000).toLocaleString("pt-BR")
        : "N/A";
      const row = [
        `"${date}"`,
        `"${log.ticketId}"`,
        `"${log.category}"`,
        `"${log.sentiment}"`,
        `${log.responseTime.toFixed(1)}`,
        `"${log.slaCompliant ? "Sim" : "Não"}"`,
        `"${log.isCritical ? "Sim" : "Não"}"`,
      ];
      csvRows.push(row.join(","));
    }

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `auditoria_ia_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exportação concluída!");
  };

  const handleSaveTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamMember) return;

    try {
      const activeTenant = userProfile?.tenantId || "DEFAULT_TENANT";
      if (selectedTeamMember.id) {
        const { error } = await supabase.from("team_members").update({
          name: selectedTeamMember.name,
          email: selectedTeamMember.email,
          role: selectedTeamMember.role,
          status: selectedTeamMember.status,
          tenant_id: activeTenant
        }).eq("id", selectedTeamMember.id);
        if (error) throw error;
        if (selectedTeamMember.role === "support") {
          await upsertTenantOperator(activeTenant, selectedTeamMember.id, {
            name: selectedTeamMember.name,
            email: selectedTeamMember.email,
            status: selectedTeamMember.status === "active" ? "online" : "offline",
            skills: selectedTeamMember.skills || ["SAC_GERAL"],
            max_concurrent_chats: selectedTeamMember.max_concurrent_chats || 5,
            current_chat_count: 0
          });
        }
        toast.success("Colaborador atualizado com sucesso!");
      } else {
        const { data: memberRow, error } = await supabase.from("team_members").insert({
          name: selectedTeamMember.name,
          email: selectedTeamMember.email,
          role: selectedTeamMember.role,
          status: selectedTeamMember.status,
          tenant_id: activeTenant
        }).select().single();
        if (error) throw error;
        if (selectedTeamMember.role === "support") {
          await upsertTenantOperator(activeTenant, memberRow.id, {
            name: selectedTeamMember.name,
            email: selectedTeamMember.email,
            status: selectedTeamMember.status === "active" ? "online" : "offline",
            skills: ["SAC_GERAL"],
            max_concurrent_chats: 5,
            current_chat_count: 0
          });
        }
        toast.success("Colaborador adicionado com sucesso!");
      }
      setIsTeamMemberDialogOpen(false);
    } catch (error: any) {
      toast.error("Erro ao salvar colaborador: " + error.message);
    }
  };

  useEffect(() => {
    if (selectedTicket) {
      setTicketSummary(null); // Reset summary when changing tickets
      const unsubMessages = getMessages(selectedTicket.id, setMessages);
      return () => unsubMessages();
    }
  }, [selectedTicket]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Informe e-mail e senha.");
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) {
        toast.error("Erro ao fazer login: " + error.message);
        return;
      }
      toast.success("Bem-vindo ao Astrum!");
    } catch (error: any) {
      toast.error("Erro ao fazer login: " + (error?.message ?? "falha desconhecida"));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentUserRole("" as any);
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer({ ...customer });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (customer: any) => {
    setSelectedCustomerDetails(customer);
    setIsDetailsDialogOpen(true);
  };

  const validateCustomerForm = (customer: any) => {
    const errors: Record<string, string> = {};
    if (!customer.name || customer.name.trim().length < 3) {
      errors.name = "O nome deve ter pelo menos 3 caracteres.";
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customer.email || !emailRegex.test(customer.email)) {
      errors.email = "Insira um email válido.";
    }
    if (!customer.plan || customer.plan.trim() === "") {
      errors.plan = "O plano é obrigatório.";
    }
    if (
      customer.mrr === undefined ||
      customer.mrr === null ||
      isNaN(customer.mrr) ||
      customer.mrr < 0
    ) {
      errors.mrr = "O MRR deve ser um valor numérico positivo.";
    }
    if (
      !customer.status ||
      !["active", "inactive", "pending"].includes(customer.status)
    ) {
      errors.status = "Status inválido.";
    }
    return errors;
  };

  const logAction = async (action: string, details: any) => {
    try {
      await logAudit(action, details);
    } catch (error) {
      console.error("Erro ao logar ação:", error);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const customerId = formData.get("customerId") as string;
    const subject = formData.get("subject") as string;
    const priority = formData.get("priority") as string;

    try {
      const { data: docRef, error } = await supabase.from("tickets").insert({
        customer_id: customerId,
        subject,
        priority,
        status: "open",
        ai_enabled: true,
        ai_attempts: 0,
      }).select().single();
      if (error) throw error;

      await logAction("TICKET_CREATED", {
        ticketId: docRef.id,
        customerId,
        subject,
      });
      setIsNewTicketDialogOpen(false);
      toast.success("Ticket criado com sucesso!");
    } catch (error) {
      toast.error("Erro ao criar ticket.");
    }
  };

  const handleToggleAI = async (ticketId: string, currentEnabled: boolean) => {
    const newState = !currentEnabled;
    await toggleTicketAI(ticketId, newState);
    const logMsg = newState
      ? `[AUDITORIA DO SISTEMA]: O Atendente Humano (${user?.email || "Equipe"}) REATIVOU a IA para este ticket. Data: ${new Date().toLocaleString("pt-BR")}`
      : `[AUDITORIA DO SISTEMA]: O Atendente Humano (${user?.email || "Equipe"}) PAUSOU a IA manualmente. Data: ${new Date().toLocaleString("pt-BR")}`;

    await sendMessage(ticketId, logMsg, "system");
    toast.success(`IA ${newState ? "ativada" : "pausada"} com sucesso.`);
  };

  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedFile({
        file,
        base64: (reader.result as string).split(",")[1],
        type: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSummarizeTicket = async () => {
    if (!selectedTicket || messages.length === 0) {
      toast.error("Não há mensagens suficientes para resumir.");
      return;
    }

    setIsSummarizingTicket(true);
    setTicketSummary(null);

    try {
      const historyText = messages
        .map((m) => {
          const sender =
            m.senderType === "human"
              ? "Atendente"
              : m.senderType === "ai"
                ? "IA"
                : "Cliente";
          return `[${sender}]: ${m.text}`;
        })
        .join("\n");

      let customerData;
      if (selectedTicket.customerId) {
        const customer = customers.find(
          (c) => c.id === selectedTicket.customerId,
        );
        if (customer) {
          customerData = {
            name: customer.name,
            cpf: customer.document,
            address: customer.address,
            phone: customer.phone,
          };
        }
      }

      const summary = await summarizeTicketHistory(historyText, customerData);
      setTicketSummary(summary);
      toast.success("Resumo gerado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar resumo do ticket.");
    } finally {
      setIsSummarizingTicket(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedTicket) return;

    if (selectedFile) {
      toast.info("Fazendo upload do anexo...", { id: "upload" });
    }

    const text = newMessage;

    let attachmentData = undefined;
    if (selectedFile) {
      try {
        const url = await uploadAttachment(
          selectedFile.file,
          `tickets/${selectedTicket.id}`,
          companySettings?.tenant_id || "default",
        );
        attachmentData = {
          url,
          type: selectedFile.type,
          base64: selectedFile.base64,
        };
        toast.success("Anexo enviado!", { id: "upload" });
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Erro ao enviar anexo.", { id: "upload" });
      }
    }

    setNewMessage("");
    setSelectedFile(null);

    // Add human message to DB
    const msgRefId = await sendMessage(
      selectedTicket.id,
      text,
      "human",
      undefined,
      attachmentData,
    );

    // Enviar mensagem real para o cliente se integração existir
    const customer = customers.find(c => c.id === selectedTicket.customerId);
    const customerPhone = customer?.phone || selectedTicket.customerId?.replace("@s.whatsapp.net", "");
    if (customerPhone && integrationKeys.evolutionUrl && integrationKeys.evolutionApiKey && integrationKeys.evolutionInstance) {
      try {
        let payload: any;
        if (attachmentData) {
            payload = {
              number: `${customerPhone}`,
              options: { delay: 1200, presence: "composing" },
              mediaMessage: {
                mediatype: attachmentData.type.startsWith("image/") ? "image" : "document",
                fileName: attachmentData.name || "anexo",
                media: attachmentData.url,
              },
            };
            if (text) payload.mediaMessage.caption = text;
        } else {
            payload = {
              number: `${customerPhone}`,
              options: { delay: 1200, presence: "composing" },
              textMessage: { text: text },
            };
        }

        const evoResponse = await fetch(`/api/evolution/proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: attachmentData
                ? `/message/sendMedia/${integrationKeys.evolutionInstance}`
                : `/message/sendText/${integrationKeys.evolutionInstance}`,
              method: "POST",
              evolutionUrl: integrationKeys.evolutionUrl,
              evolutionApiKey: integrationKeys.evolutionApiKey,
              body: payload,
            }),
        });
        const resData = await evoResponse.json();
        if (!evoResponse.ok) {
           console.error("Erro Evolution envio:", resData);
           toast.error("Erro ao enviar mensagem pelo WhatsApp.");
        } else if (msgRefId && (resData?.key?.id || resData?.message?.key?.id)) {
           const evoId = resData?.key?.id || resData?.message?.key?.id;
           await supabase.from("messages").update({ evo_msg_ids: [evoId] }).eq("id", (msgRefId as any).id ?? msgRefId);
        }
      } catch (err) {
         console.error("Falha requisição Evolution:", err);
      }
    }

    // If a human agent replies, we should assume they took over the ticket.
    // Disable AI for this ticket so it doesn't interfere.
    if (selectedTicket.aiEnabled !== false) {
      // Mark ticket as answered by human
      await supabase.from("tickets").update({ human_responded: true }).eq("id", selectedTicket.id);
      await toggleTicketAI(selectedTicket.id, false);
      await sendMessage(
        selectedTicket.id,
        `[AUDITORIA DO SISTEMA]: O Atendente Humano (${user?.email || "Equipe"}) interveio e pausou a IA para este ticket. Data: ${new Date().toLocaleString("pt-BR")}`,
        "system",
      );
      toast.info(
        "Atendimento humano iniciado. IA desativada para este ticket.",
      );
    }
  };

  const simulateAiChat = async (ticketId: string, userText: string) => {
    setIsAiThinking(true);
    const startTime = Date.now();

    // Add user message
    await sendMessage(ticketId, userText, "customer");

    // Increment AI attempts
    await incrementAiAttempts(ticketId);
    const currentTicket = tickets.find((t) => t.id === ticketId);
    const customer = customers.find((c) => c.id === currentTicket?.customerId);
    const currentAttempts = (currentTicket?.aiAttempts || 0) + 1;

    // Remove mensagens velhas para a IA não herdar escalamentos passados
    // Mantém as 10 últimas mensagens apenas
    const recentMessages = messages.slice(-10);

    // Get AI response
    const history = recentMessages.map((m) => ({
      role: m.senderType === "customer" ? "user" : "model",
      parts: [{ text: m.text }],
    }));

    // Injeta Memória Implícita (Substitui o Redis sem gastar DB)
    if (customer && history.length > 0) {
      const implicitMemory = `[MEMÓRIA DO SISTEMA INVISÍVEL AO CLIENTE: O usuário falando com você se chama ${customer.name}. O protocolo de atendimento (Ticket ID) para esta conversa é #${ticketId.slice(0, 8)}. O plano contratado é ${customer.plan} (Status: ${customer.status}). OBSERVAÇÃO CRÍTICA: Você DEVE informar e saudar o cliente enviando o número do protocolo de atendimento (Ticket ID) caso seja a primeira resposta, ou informá-lo prontamente caso ele pergunte.]\n\n`;
      if (history[0].role === "user") {
        history[0].parts[0].text = implicitMemory + history[0].parts[0].text;
      }
    }

    history.push({ role: "user", parts: [{ text: userText }] });

    try {
      const sessionState = currentTicket?.session_state || {
        active_flow: "IDLE",
        step: "inicial",
        lead_stage: "LEAD",
        agent: "Orquestrador",
      };
      const aiRes = await getAIResponse(
        history as any,
        undefined,
        customer as any,
        ticketId,
        sessionState,
      );
      const endTime = Date.now();
      const responseTime = (endTime - startTime) / 1000;
      setLastAiResponseTime(responseTime);

      await sendMessage(ticketId, aiRes.message, "ai", aiRes.category);

      // Update session state
      if (aiRes.session_state_update) {
        try {
          const { updateTicketSessionState } = await import("@/src/lib/db");
          await updateTicketSessionState(ticketId, aiRes.session_state_update);
        } catch (e) {
          console.error("Failed to update session state", e);
        }
      }

      const shouldEscalate = aiRes.shouldEscalate || currentAttempts >= 3;

      if (shouldEscalate) {
        if (currentTicket?.session_state) {
          try {
            const { updateTicketSessionState } = await import("@/src/lib/db");
            await updateTicketSessionState(ticketId, {
              lead_stage: "LEAD",
              step: "erro_parcial",
            });
          } catch (e) {}
        }
        await updateTicketStatus(ticketId, "escalated");
        await toggleTicketAI(ticketId, false);
        await notifyTeam(
          "CRITICAL_ESCALATION",
          `Ticket ${ticketId} escalado (Tentativas: ${currentAttempts}): ${aiRes.message?.slice(0, 50) || ""}...`,
          ticketId,
        );

        // Log para auditoria de negócio (Alibi Provedora vs IA)
        await sendMessage(
          ticketId,
          `[AUDITORIA DO SISTEMA]: O atendimento foi transferido da IA para a Equipe Humana. Motivo: ${aiRes.shouldEscalate ? "Decisão de Segurança/Filtro Neural" : "Excesso de Tentativas"}. Data: ${new Date().toLocaleString("pt-BR")}`,
          "system",
        );

        toast.error(
          currentAttempts >= 3
            ? "Ticket escalado por excesso de tentativas."
            : "Ticket escalado automaticamente devido à criticidade.",
        );

        // Push notification do navegador
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("🧑‍💼 Novo Atendimento Humano (Urgente)", {
            body: `O Ticket #${ticketId.slice(0, 8)} de ${customer?.name} foi escalado e precisa da sua atenção agora.`,
            icon: "/vite.svg",
          });
        }
      }

      // SLA Alert Simulation
      const slaCompliant = responseTime <= 10;
      if (!slaCompliant) {
        await notifyTeam(
          "SLA_BREACH",
          `Violação de SLA no ticket ${ticketId}: ${responseTime.toFixed(1)}s`,
          ticketId,
        );
        toast.warning(
          `Alerta de SLA: Resposta demorou ${responseTime.toFixed(1)}s`,
          {
            description:
              "Notificação enviada ao grupo de supervisores (Simulado).",
          },
        );
      }

      // Log Audit
      await logAudit("AI_RESPONSE", {
        ticketId: ticketId,
        category: aiRes.category,
        sentiment: aiRes.sentiment,
        responseTime,
        slaCompliant,
        isCritical: aiRes.isCritical,
      });
    } catch (error) {
      console.error("Chat Error:", error);
      toast.error("Erro ao processar resposta da IA.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const exportCustomersToCSV = () => {
    if (customers.length === 0) return;

    const headers = [
      "ID",
      "Nome",
      "Email",
      "Plano",
      "MRR",
      "Status",
      "Data de Cadastro",
    ];
    const csvRows = [headers.join(",")];

    customers.forEach((c) => {
      const row = [
        c.id,
        `"${c.name || ""}"`,
        `"${c.email || ""}"`,
        `"${c.plan || ""}"`,
        c.mrr || 0,
        c.status || "",
        c.createdAt?.seconds
          ? new Date(c.createdAt.seconds * 1000).toLocaleDateString("pt-BR")
          : "",
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `clientes_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCustomers = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split("\n");
      if (lines.length < 2) {
        toast.error("O arquivo CSV está vazio ou inválido.");
        return;
      }

      setIsAiThinking(true);
      let importedCount = 0;
      try {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const values = line
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((v) => v.replace(/^"|"$/g, "").trim());

          if (values.length >= 2) {
            await supabase.from("customers").insert({
              name: values[0] || "Sem Nome",
              email: values[1] || "",
              phone: values[2] || "",
              address: values[3] || "",
              plan: values[4] || "Básico",
              mrr: parseFloat(values[5]) || 0,
              status:
                values[6]?.toLowerCase() === "inativo" ? "inactive" : "active",
              tags: [],
            });
            importedCount++;
          }
        }
        toast.success(`${importedCount} clientes importados com sucesso!`);
      } catch (error) {
        console.error("Erro ao importar clientes:", error);
        toast.error("Erro ao importar clientes.");
      } finally {
        setIsAiThinking(false);
        if (customerFileInputRef.current)
          customerFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleImportInventory = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split("\n");
      if (lines.length < 2) {
        toast.error("O arquivo CSV está vazio ou inválido.");
        return;
      }

      setIsAiThinking(true);
      let importedCount = 0;
      try {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const values = line
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((v) => v.replace(/^"|"$/g, "").trim());

          if (values.length >= 2) {
            await supabase.from("inventory").insert({
              name: values[0] || "Item sem nome",
              category: values[1] || "Geral",
              stock: parseInt(values[2]) || 0,
              min_stock: parseInt(values[3]) || 5,
              price: parseFloat(values[4]) || 0,
            });
            importedCount++;
          }
        }
        toast.success(`${importedCount} itens importados com sucesso!`);
      } catch (error) {
        console.error("Erro ao importar estoque:", error);
        toast.error("Erro ao importar estoque.");
      } finally {
        setIsAiThinking(false);
        if (inventoryFileInputRef.current)
          inventoryFileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const exportInventoryToCSV = () => {
    if (inventory.length === 0) return;

    const headers = [
      "ID",
      "Item",
      "Categoria",
      "Estoque",
      "Estoque Mínimo",
      "Preço Unitário",
      "Valor Total",
    ];
    const csvRows = [headers.join(",")];

    inventory.forEach((i) => {
      const row = [
        i.id,
        `"${i.name || ""}"`,
        `"${i.category || ""}"`,
        i.stock || 0,
        i.minStock || 0,
        i.price || 0,
        i.stock * i.price || 0,
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `estoque_export_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório de estoque exportado!");
  };

  const handleExportDashboardPDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.text("Astrum - RELATÓRIO EXECUTIVO", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 28, {
      align: "center",
    });

    doc.setFontSize(14);
    doc.text("Métricas Principais", 20, 45);
    doc.line(20, 47, 190, 47);

    const activeCustomers = customers.filter(
      (c) => c.status === "active",
    ).length;
    const totalMRR = customers
      .filter((c) => c.status === "active")
      .reduce((acc, c) => acc + (c.mrr || 0), 0);
    const openTickets = tickets.filter((t) => t.status !== "resolved").length;

    autoTable(doc, {
      startY: 55,
      head: [["Métrica", "Valor"]],
      body: [
        ["Total de Clientes Ativos", activeCustomers.toString()],
        ["Faturamento Mensal (MRR)", `R$ ${totalMRR.toLocaleString("pt-BR")}`],
        ["Tickets em Aberto", openTickets.toString()],
        ["Taxa de Churn (Simulada)", "1.2%"],
        ["Disponibilidade da Rede", "99.9%"],
      ],
      theme: "grid",
    });

    doc.save(
      `relatorio_executivo_${new Date().toISOString().split("T")[0]}.pdf`,
    );
    toast.success("Relatório executivo gerado!");
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
        {/* Sidebar Skeleton */}
        <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <div className="mt-auto pt-4">
            <div className="h-16 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <main className="flex-1 overflow-auto p-8 space-y-8">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 w-64 bg-zinc-100 dark:bg-zinc-800/50 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse p-6 flex flex-col justify-between"
              >
                <div className="flex justify-between items-center">
                  <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
                  <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800/50 rounded-full" />
                </div>
                <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse" />
            <div className="h-96 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans transition-colors duration-300">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-2xl bg-white dark:bg-zinc-900 p-10 shadow-xl border border-zinc-100 dark:border-zinc-800"
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot size={32} />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Astrum
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Gestão Inteligente para Provedores
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="Seu e-mail de trabalho"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="py-6 text-lg"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Sua senha"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="py-6 text-lg"
              />
            </div>
            <Button
              type="submit"
              className="w-full py-6 text-lg"
              size="lg"
            >
              Entrar
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
    <AppLayout
      clearNotifications={clearNotifications}
      handleMarkNotificationRead={handleMarkNotificationRead}
    >
      {/* FZ-4: enrollment de MFA agora é 100% Supabase na SettingsPage (S101) */}
      <UpgradePrompt />
      <Toaster position="top-right" />

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-orange-500" size={20} />
              {confirmDialog.title}
            </DialogTitle>
            <DialogDescription className="pt-2 text-base">
              {confirmDialog.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() =>
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
              }
            >
              Cancelar
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence mode="wait">
        {!checkAccess(activeTab) ? (
          <motion.div
            key="unauthorized"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6"
          >
            <div className="w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
              <ShieldAlert size={48} />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                Acesso Restrito
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                Seu perfil de <strong>{currentUserRole.toUpperCase()}</strong>{" "}
                não possui permissão para acessar esta área.
              </p>
            </div>
            <Button onClick={() => navigate("/")} className="gap-2">
              <LayoutDashboard size={18} /> Voltar para o início
            </Button>
          </motion.div>
        ) : (
          <Routes>
            {mainRoutes(currentUserRole)}
            <Route
              path="/tickets"
              element={
                <TicketsPage
                  onNewTicketClick={() => setIsNewTicketDialogOpen(true)}
                />
              }
            />

            <Route
              path="/whatsapp"
              element={
                <WhatsAppConnectionsPage
                  integrationKeys={integrationKeys}
                  setIntegrationKeys={setIntegrationKeys}
                  handleSaveKeys={saveIntegrationKeys}
                  configureEvolutionWebhook={configureEvolutionWebhook}
                />
              }
            />

            <Route
              path="/kb"
              element={
                <KnowledgeBasePage
                  knowledgeBase={knowledgeBase}
                  handleGenerateAIArticle={handleGenerateAIArticle}
                  handleSeedKB={handleSeedKB}
                />
              }
            />

            <Route
              path="/ai-config"
              element={
                <AIConfigPage
                  aiPrompts={aiPrompts}
                  setAiPrompts={setAiPrompts}
                  isSavingPrompts={isSavingPrompts}
                  handleSavePrompts={handleSavePrompts}
                  testAgentCategory={testAgentCategory}
                  setTestAgentCategory={setTestAgentCategory}
                  testAgentResponse={testAgentResponse}
                  setTestAgentResponse={setTestAgentResponse}
                  testAgentMessage={testAgentMessage}
                  setTestAgentMessage={setTestAgentMessage}
                  setIsTestAgentOpen={setIsTestAgentOpen}
                  sentimentChartData={sentimentChartData}
                  auditLogs={auditLogs}
                  handleExportCSV={handleExportCSV}
                  knowledgeBase={knowledgeBase}
                  setEditingKB={setEditingKB}
                  setNewKB={setNewKB}
                  setIsKBDialogOpen={setIsKBDialogOpen}
                  setIsPdfDialogOpen={setIsPdfDialogOpen}
                  setIsMiningDialogOpen={setIsMiningDialogOpen}
                  isDeveloper={isDeveloper}
                  handleSeedKB={handleSeedKB}
                  isSeeding={isSeeding}
                  handleDeleteKB={handleDeleteKB}
                  integrationKeys={integrationKeys}
                  setIntegrationKeys={setIntegrationKeys}
                />
              }
            />

            <Route
              path="/team"
              element={
                <TeamPage
                  teamMembers={teamMembers}
                  setSelectedTeamMember={setSelectedTeamMember}
                  handleDeleteTeamMember={handleDeleteTeamMember}
                  setIsTeamMemberDialogOpen={setIsTeamMemberDialogOpen}
                  teamPerformanceData={teamPerformanceData}
                  integrationKeys={integrationKeys}
                  setEvoStatus={setEvoStatus}
                  evoStatus={evoStatus}
                  isFetchingQr={isFetchingQr}
                  evoQrCode={evoQrCode}
                  fetchEvolutionQrCode={fetchEvolutionQrCode}
                  newTechPhone={newTechPhone}
                  setNewTechPhone={setNewTechPhone}
                  newTechName={newTechName}
                  setNewTechName={setNewTechName}
                  isFetchingTechName={isFetchingTechName}
                  isAddingTech={isAddingTech}
                  setIsAddingTech={setIsAddingTech}
                  handleAddTechnician={handleAddTechnician}
                  tenantId={userProfile?.tenantId || "DEFAULT_TENANT"}
                />
              }
            />

            <Route
              path="/settings"
              element={
                <SettingsPage
                  integrationKeys={integrationKeys}
                  setIntegrationKeys={setIntegrationKeys}
                  isSavingKeys={isSavingKeys}
                  handleSaveKeys={saveIntegrationKeys}
                  isDeveloper={isDeveloper}
                  seedSystem={seedSystem}
                  seedTicketsAndLogs={seedTicketsAndLogs}
                  seedServiceOrdersAndTechnicians={
                    seedServiceOrdersAndTechnicians
                  }
                  isSeeding={isSeeding}
                  isAstrum={isAstrum}
                  companySettings={companySettings}
                  setCompanySettings={setCompanySettings}
                  handleSeedSystem={handleSeedSystem}
                  handleSeedPopularAstrum={handleSeedPopularAstrum}
                  handleWipeSystem={handleWipeSystem}
                  customers={customers}
                  handleSeedKB={handleSeedKB}
                  evoStatus={evoStatus}
                  fetchEvolutionQrCode={fetchEvolutionQrCode}
                  disconnectEvolutionInstance={disconnectEvolutionInstance}
                  configureEvolutionWebhook={configureEvolutionWebhook}
                  isFetchingQr={isFetchingQr}
                  evoQrCode={evoQrCode}
                  setIsAddingTech={setIsAddingTech}
                  isAddingTech={isAddingTech}
                  newTechPhone={newTechPhone}
                  setNewTechPhone={setNewTechPhone}
                  isFetchingTechName={isFetchingTechName}
                  newTechName={newTechName}
                  setNewTechName={setNewTechName}
                  handleAddTechnician={handleAddTechnician}
                  technicians={technicians}
                  setTechnicians={setTechnicians}
                  updateTechnician={updateTechnician}
                  setIsSavingKeys={setIsSavingKeys}
                  saveIntegrationKeys={saveIntegrationKeys}
                  setIsTeamMemberDialogOpen={setIsTeamMemberDialogOpen}
                  teamMembers={teamMembers}
                  handleDeleteTeamMember={handleDeleteTeamMember}
                />
              }
            />


            <Route
              path="/inventory"
              element={
                <motion.div
                  key="inventory"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  <header className="flex items-center justify-between">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight">
                        Estoque
                      </h1>
                      <p className="text-zinc-500 dark:text-zinc-400">
                        Gerencie equipamentos e insumos da rede.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        ref={inventoryFileInputRef}
                        onChange={handleImportInventory}
                      />
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => inventoryFileInputRef.current?.click()}
                        >
                          <Upload size={18} /> Importar CSV
                        </Button>
                        <span className="text-[10px] text-zinc-400">
                          Formato: Nome, Categoria, Qtd, Min, Preço
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={exportInventoryToCSV}
                      >
                        <Download size={18} /> Exportar CSV
                      </Button>
                      <Button
                        className="gap-2"
                        onClick={() => setIsNewItemDialogOpen(true)}
                      >
                        <Plus size={18} /> Novo Item
                      </Button>
                    </div>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">
                          Total em Estoque
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {inventory.reduce((acc, item) => acc + item.stock, 0)}{" "}
                          itens
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">
                          Valor Total
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-primary">
                          R${" "}
                          {inventory
                            .reduce(
                              (acc, item) => acc + item.stock * item.price,
                              0,
                            )
                            .toLocaleString("pt-BR")}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">
                          Itens Críticos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-red-500">
                          {
                            inventory.filter((i) => i.stock <= i.minStock)
                              .length
                          }
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-500">
                          Categorias
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {new Set(inventory.map((i) => i.category)).size}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-lg font-bold">
                          Distribuição por Categoria
                        </CardTitle>
                        <CardDescription>
                          Volume de itens em estoque por tipo de equipamento.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={inventoryCategoryData}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#3f3f46"
                              opacity={0.1}
                            />
                            <XAxis
                              dataKey="name"
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#18181b",
                                border: "none",
                                borderRadius: "8px",
                                color: "#fff",
                              }}
                              itemStyle={{ color: "#fff" }}
                            />
                            <Bar
                              dataKey="value"
                              fill="#3b82f6"
                              radius={[4, 4, 0, 0]}
                              barSize={40}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm dark:bg-zinc-900">
                      <CardHeader>
                        <CardTitle className="text-lg font-bold">
                          Resumo Financeiro
                        </CardTitle>
                        <CardDescription>
                          Valor investido em ativos.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">Valor em ONU</span>
                            <span className="font-medium">
                              R${" "}
                              {inventory
                                .filter((i) => i.category === "ONU")
                                .reduce((acc, i) => acc + i.stock * i.price, 0)
                                .toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-500 h-full"
                              style={{
                                width: `${(inventory.filter((i) => i.category === "ONU").reduce((acc, i) => acc + i.stock * i.price, 0) / (inventory.reduce((acc, i) => acc + i.stock * i.price, 0) || 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">
                              Valor em Roteadores
                            </span>
                            <span className="font-medium">
                              R${" "}
                              {inventory
                                .filter((i) => i.category === "Roteador")
                                .reduce((acc, i) => acc + i.stock * i.price, 0)
                                .toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-purple-500 h-full"
                              style={{
                                width: `${(inventory.filter((i) => i.category === "Roteador").reduce((acc, i) => acc + i.stock * i.price, 0) / (inventory.reduce((acc, i) => acc + i.stock * i.price, 0) || 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">Outros</span>
                            <span className="font-medium">
                              R${" "}
                              {inventory
                                .filter(
                                  (i) =>
                                    i.category !== "ONU" &&
                                    i.category !== "Roteador",
                                )
                                .reduce((acc, i) => acc + i.stock * i.price, 0)
                                .toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-zinc-400 h-full"
                              style={{
                                width: `${(inventory.filter((i) => i.category !== "ONU" && i.category !== "Roteador").reduce((acc, i) => acc + i.stock * i.price, 0) / (inventory.reduce((acc, i) => acc + i.stock * i.price, 0) || 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border-none shadow-sm">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="pl-6">Equipamento</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Qtd. Atual</TableHead>
                            <TableHead>Mínimo</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="pr-6 text-right">
                              Ações
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="pl-6 font-medium">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                    <Box size={16} className="text-zinc-500" />
                                  </div>
                                  {item.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.category}</Badge>
                              </TableCell>
                              <TableCell className="font-mono">
                                {item.stock} {item.unit}
                              </TableCell>
                              <TableCell className="font-mono text-zinc-500">
                                {item.minStock} {item.unit}
                              </TableCell>
                              <TableCell>
                                {item.stock <= item.minStock ? (
                                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-none">
                                    Crítico
                                  </Badge>
                                ) : (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-none">
                                    Normal
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="pr-6 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedInventoryItem(item);
                                      setAdjustmentAmount(0);
                                      setIsInventoryDialogOpen(true);
                                    }}
                                  >
                                    Ajustar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-zinc-400 hover:text-red-600"
                                    onClick={() => handleDeleteItem(item.id)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </motion.div>
              }
            />
          </Routes>
        )}
      </AnimatePresence>

      {/* Command Palette Dialog */}
      <Dialog
        open={isCommandPaletteOpen}
        onOpenChange={setIsCommandPaletteOpen}
      >
        <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 shadow-2xl">
          <DialogTitle className="sr-only">Busca Geral</DialogTitle>
          <div className="flex items-center border-b border-zinc-100 dark:border-zinc-800 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Busque por nome, email, telefone, endereço, tickets ou CTOs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <ScrollArea className="max-h-[300px] overflow-y-auto p-2">
            {!searchQuery.trim() && (
              <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Comece a digitar para pesquisar...
              </div>
            )}
            {searchQuery.trim() &&
              filteredSearchCustomers.length === 0 &&
              filteredSearchTickets.length === 0 &&
              filteredSearchCtos.length === 0 && (
                <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Nenhum resultado encontrado.
                </div>
              )}

            {filteredSearchCustomers.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Clientes
                </div>
                {filteredSearchCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    onClick={() => {
                      setSelectedCustomerDetails(customer);
                      setIsDetailsDialogOpen(true);
                      setIsCommandPaletteOpen(false);
                    }}
                  >
                    <User size={14} className="text-zinc-400" />
                    <span className="font-medium">{customer.name}</span>
                    <span className="text-zinc-400 text-xs ml-auto">
                      {customer.email}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {filteredSearchTickets.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Tickets
                </div>
                {filteredSearchTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    onClick={() => {
                      navigate("/");
                      setSelectedTicket(ticket);
                      setIsTicketDetailOpen(true);
                      setIsCommandPaletteOpen(false);
                    }}
                  >
                    <Ticket size={14} className="text-zinc-400" />
                    <span className="font-medium truncate max-w-[200px]">
                      {ticket.subject}
                    </span>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {ticket.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {filteredSearchCtos.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  CTOs (Rede)
                </div>
                {filteredSearchCtos.map((cto) => (
                  <div
                    key={cto.id}
                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    onClick={() => {
                      navigate("/");
                      setIsCommandPaletteOpen(false);
                    }}
                  >
                    <Database size={14} className="text-zinc-400" />
                    <span className="font-medium">{cto.name}</span>
                    <span className="text-zinc-400 text-xs ml-auto">
                      Portas: {cto.usedPorts}/{cto.totalPorts}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {filteredSearchKB.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Base de Conhecimento
                </div>
                {filteredSearchKB.map((article) => (
                  <div
                    key={article.id}
                    className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    onClick={() => {
                      navigate("/");
                      setIsCommandPaletteOpen(false);
                    }}
                  >
                    <Book size={14} className="text-zinc-400" />
                    <span className="font-medium truncate max-w-[200px]">
                      {article.title}
                    </span>
                    <Badge variant="outline" className="text-[9px] ml-auto">
                      {article.category}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Team Member Dialog */}
      <Dialog
        open={isTeamMemberDialogOpen}
        onOpenChange={setIsTeamMemberDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedTeamMember?.id
                ? "Editar Colaborador"
                : "Novo Colaborador"}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do colaborador abaixo.
            </DialogDescription>
          </DialogHeader>
          {selectedTeamMember && (
            <form onSubmit={handleSaveTeamMember} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  required
                  value={selectedTeamMember.name || ""}
                  onChange={(e) =>
                    setSelectedTeamMember({
                      ...selectedTeamMember,
                      name: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  required
                  value={selectedTeamMember.email || ""}
                  onChange={(e) =>
                    setSelectedTeamMember({
                      ...selectedTeamMember,
                      email: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <select
                  className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
                  value={selectedTeamMember.role || "support"}
                  onChange={(e) =>
                    setSelectedTeamMember({
                      ...selectedTeamMember,
                      role: e.target.value,
                    })
                  }
                >
                  <option value="admin">Administrador</option>
                  <option value="support">Suporte Técnico</option>
                  <option value="tecnico">Técnico de Campo</option>
                  <option value="billing">Financeiro</option>
                  <option value="sales">Vendas</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  className="w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
                  value={selectedTeamMember.status || "active"}
                  onChange={(e) =>
                    setSelectedTeamMember({
                      ...selectedTeamMember,
                      status: e.target.value,
                    })
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsTeamMemberDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* New Ticket Dialog */}
      <Dialog
        open={isNewTicketDialogOpen}
        onOpenChange={setIsNewTicketDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px] border-none shadow-2xl rounded-3xl p-0 overflow-hidden bg-white dark:bg-zinc-950">
          <div className="bg-primary/5 dark:bg-primary/10 p-6 border-b border-zinc-100 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Ticket className="text-primary" /> Abrir Novo Ticket
              </DialogTitle>
              <DialogDescription>
                Crie um novo chamado de suporte para um cliente.
              </DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cliente</label>
              <select
                name="customerId"
                required
                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="">Selecione um cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assunto</label>
              <Input
                name="subject"
                placeholder="Ex: Lentidão na conexão, Troca de roteador..."
                required
                className="rounded-xl border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridade</label>
              <select
                name="priority"
                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsNewTicketDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl px-8">
                Criar Ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
            <DialogDescription>
              Informações completas, histórico de tickets e faturas.
            </DialogDescription>
          </DialogHeader>
          {selectedCustomerDetails && (
            <div className="space-y-6 py-4">
              {/* AI Customer Summary */}
              <div className="p-4 rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <Bot size={18} />
                    <h4 className="text-sm font-bold">Resumo</h4>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs font-semibold gap-1.5 border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700 bg-white rounded-md shadow-sm"
                    onClick={async () => {
                      const customerTickets = tickets.filter(
                        (t) => t.customerId === selectedCustomerDetails.id,
                      );
                      // Tenta juntar tanto o assunto quanto o resumo de IA que já existe dos tickets para o histórico
                      const historyText = customerTickets
                        .map(
                          (t) =>
                            `- Problema Relatado: ${t.subject}\n  Status do problema: ${t.status}\n  Detalhes/Ações: ${t.aiSummary || t.description || "Nenhum detalhe adicional."}`,
                        )
                        .join("\n\n");

                      const summaryPromise = summarizeCustomerHistory(
                        historyText || "Sem histórico de problemas no sistema.",
                        {
                          name: selectedCustomerDetails.name,
                          cpf: selectedCustomerDetails.document,
                          address: selectedCustomerDetails.address,
                          phone: selectedCustomerDetails.phone,
                        },
                      );

                      toast.promise(summaryPromise, {
                        loading: "Atualizando resumo...",
                        success: (summary) => {
                          (window as any)._lastAiSummary = summary;
                          setIsDetailsDialogOpen(false);
                          setTimeout(() => setIsDetailsDialogOpen(true), 10);
                          return "Resumo atualizado!";
                        },
                        error: "Erro ao gerar resumo.",
                      });
                    }}
                  >
                    <Sparkles size={14} /> Atualizar Resumo
                  </Button>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed italic">
                  {(window as any)._lastAiSummary ||
                    "Clique em 'Atualizar Resumo' para extrair informações importantes e gerar um resumo inteligente da situação deste cliente baseado no seu histórico e tickets recentes."}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Dados Pessoais
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 space-y-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Nome Completo
                        </p>
                        <p className="text-sm font-medium">
                          {selectedCustomerDetails.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Documento (CPF/CNPJ)
                        </p>
                        <div className="text-sm font-medium">
                          {selectedCustomerDetails.document ? (
                            <MaskedSensitiveData
                              value={selectedCustomerDetails.document}
                              type="cpf"
                            />
                          ) : (
                            "Não informado"
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          E-mail
                        </p>
                        <div className="text-sm font-medium">
                          {selectedCustomerDetails.email ? (
                            <MaskedSensitiveData
                              value={selectedCustomerDetails.email}
                              type="email"
                            />
                          ) : (
                            "Não informado"
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Telefone
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium flex-1">
                            {selectedCustomerDetails.phone ? (
                              <MaskedSensitiveData
                                value={selectedCustomerDetails.phone}
                                type="phone"
                              />
                            ) : (
                              "Não informado"
                            )}
                          </div>
                          {selectedCustomerDetails.phone && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100 hover:text-green-800"
                              onClick={() =>
                                window.open(
                                  `https://wa.me/${selectedCustomerDetails.phone.replace(/\D/g, "")}`,
                                  "_blank",
                                )
                              }
                            >
                              <Phone size={10} /> WhatsApp
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Credenciais PPPoE
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Usuário
                        </p>
                        <p className="text-sm font-medium font-mono">
                          {selectedCustomerDetails.pppoeLogin ||
                            "Não configurado"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Senha
                        </p>
                        <p className="text-sm font-medium font-mono">
                          {selectedCustomerDetails.pppoePassword
                            ? "********"
                            : "Não configurada"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Plano & Status
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          Plano Atual
                        </p>
                        <p className="text-sm font-bold text-primary">
                          {selectedCustomerDetails.plan}
                        </p>
                      </div>
                      <Badge
                        variant={
                          selectedCustomerDetails.status === "active"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {selectedCustomerDetails.status === "active"
                          ? "Ativo"
                          : "Inativo"}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Tags
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 min-h-[48px] flex flex-wrap gap-2 items-center">
                      {selectedCustomerDetails.tags &&
                      selectedCustomerDetails.tags.length > 0 ? (
                        selectedCustomerDetails.tags.map(
                          (tag: string, idx: number) => (
                            <div key={idx}>
                              <Badge variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            </div>
                          ),
                        )
                      ) : (
                        <p className="text-xs text-zinc-400">
                          Nenhuma tag adicionada.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Endereço de Instalação
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 h-full flex flex-col justify-between gap-3">
                      <p className="text-sm text-zinc-600 leading-relaxed">
                        {selectedCustomerDetails.address ||
                          "Endereço não cadastrado."}
                      </p>
                      <div className="flex items-center gap-4 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase">
                            Lat
                          </p>
                          <p className="text-xs font-mono text-zinc-600">
                            {selectedCustomerDetails.latitude || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-400 uppercase">
                            Lng
                          </p>
                          <p className="text-xs font-mono text-zinc-600">
                            {selectedCustomerDetails.longitude || "N/A"}
                          </p>
                        </div>
                        {selectedCustomerDetails.latitude &&
                          selectedCustomerDetails.longitude && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 ml-auto gap-1 text-[10px]"
                              onClick={() =>
                                window.open(
                                  `https://www.google.com/maps/search/?api=1&query=${selectedCustomerDetails.latitude},${selectedCustomerDetails.longitude}`,
                                  "_blank",
                                )
                              }
                            >
                              <MapPin size={10} /> Maps
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Resumo Financeiro
                    </p>
                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 space-y-3">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase">
                          MRR (Faturamento Mensal)
                        </p>
                        <p className="text-xl font-bold text-green-600">
                          R$ {selectedCustomerDetails.mrr?.toFixed(2)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 text-xs"
                        onClick={handleGenerateInvoice}
                      >
                        <Plus size={14} /> Gerar Nova Fatura
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                        onClick={() =>
                          handleRunDiagnostics(
                            selectedCustomerDetails.id,
                            "customer",
                          )
                        }
                        disabled={isDiagnosing}
                      >
                        {isDiagnosing ? (
                          <div className="h-3 w-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                        ) : (
                          <Activity size={14} />
                        )}
                        {isDiagnosing
                          ? "Diagnosticando..."
                          : "Diagnóstico de Rede"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnostic Result for Customer */}
              {diagnosticsResult &&
                diagnosticsResult.targetId === selectedCustomerDetails.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl bg-zinc-900 text-white space-y-4 shadow-xl border border-zinc-800"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Resultado do Diagnóstico Remoto
                      </h4>
                      <span className="text-[10px] text-zinc-500">
                        {diagnosticsResult.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase">
                          Sinal ONU
                        </p>
                        <p
                          className={cn(
                            "text-lg font-mono font-bold",
                            diagnosticsResult.metrics.avgSignal < -25
                              ? "text-red-400"
                              : "text-green-400",
                          )}
                        >
                          {diagnosticsResult.metrics.avgSignal.toFixed(1)} dBm
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase">
                          Latência
                        </p>
                        <p className="text-lg font-mono font-bold text-blue-400">
                          {diagnosticsResult.metrics.latency.toFixed(0)}ms
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase">
                          Perda
                        </p>
                        <p className="text-lg font-mono font-bold">
                          {diagnosticsResult.metrics.packetLoss.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    {diagnosticsResult.metrics.alerts.length > 0 && (
                      <div className="pt-2 border-t border-zinc-800">
                        <div className="flex items-center gap-2 text-orange-400 mb-1">
                          <AlertTriangle size={12} />
                          <p className="text-[10px] font-bold uppercase">
                            Alertas Detectados
                          </p>
                        </div>
                        {diagnosticsResult.metrics.alerts.map(
                          (alert: string, i: number) => (
                            <p key={i} className="text-[10px] text-zinc-400">
                              • {alert}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

              {/* 5 Faturas Mais Recentes */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  5 Faturas Mais Recentes
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {invoices.filter(
                    (i) => i.customerId === selectedCustomerDetails.id,
                  ).length > 0 ? (
                    invoices
                      .filter(
                        (i) => i.customerId === selectedCustomerDetails.id,
                      )
                      .sort(
                        (a, b) =>
                          (b.dueDate?.seconds || 0) - (a.dueDate?.seconds || 0),
                      )
                      .slice(0, 5)
                      .map((i) => (
                        <div
                          key={i.id}
                          className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex flex-col justify-between gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                              R$ {i.amount?.toFixed(2)}
                            </p>
                            <Badge
                              className={cn(
                                "text-[9px] uppercase font-bold border-none px-1.5 py-0",
                                i.status === "paid"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : i.status === "overdue"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                              )}
                            >
                              {i.status === "paid"
                                ? "PAGO"
                                : i.status === "overdue"
                                  ? "VENCIDA"
                                  : "PENDENTE"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                            <CreditCard size={10} />
                            <span>
                              Venc:{" "}
                              {i.dueDate
                                ? new Date(
                                    i.dueDate.seconds * 1000,
                                  ).toLocaleDateString("pt-BR")
                                : "n/a"}
                            </span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="col-span-full text-center py-6 border border-dashed rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                      <p className="text-zinc-500 dark:text-zinc-400 text-xs italic">
                        Nenhuma fatura encontrada para este cliente.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <Tabs defaultValue="tickets_history" className="w-full">
                <TabsList className="w-full bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                  <TabsTrigger
                    value="tickets_history"
                    className="flex-1 rounded-lg"
                  >
                    Tickets
                  </TabsTrigger>
                  {isDeveloper && (
                    <TabsTrigger
                      value="diagnostics"
                      className="flex-1 rounded-lg"
                    >
                      Diagnóstico
                    </TabsTrigger>
                  )}
                  <TabsTrigger
                    value="billing_history"
                    className="flex-1 rounded-lg"
                  >
                    Faturas
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="flex-1 rounded-lg">
                    Histórico
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="diagnostics" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold">Status da Conexão</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-2"
                        onClick={() =>
                          handleRunDiagnostics(
                            selectedCustomerDetails.id,
                            "customer",
                          )
                        }
                        disabled={isDiagnosing}
                      >
                        <Activity size={14} /> Iniciar Teste
                      </Button>
                    </div>

                    {diagnosticsResult &&
                    diagnosticsResult.targetId ===
                      selectedCustomerDetails.id ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">
                            Sinal Óptico
                          </p>
                          <p
                            className={cn(
                              "text-xl font-mono font-bold",
                              diagnosticsResult.metrics.avgSignal < -25
                                ? "text-red-500"
                                : "text-green-500",
                            )}
                          >
                            {diagnosticsResult.metrics.avgSignal.toFixed(1)} dBm
                          </p>
                        </Card>
                        <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">
                            Latência
                          </p>
                          <p className="text-xl font-mono font-bold text-blue-500">
                            {diagnosticsResult.metrics.latency.toFixed(0)} ms
                          </p>
                        </Card>
                        <Card className="p-4 border-none bg-zinc-50 dark:bg-zinc-900/50">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">
                            Uptime ONU
                          </p>
                          <p className="text-xl font-mono font-bold text-zinc-700 dark:text-zinc-300">
                            12d 04h
                          </p>
                        </Card>
                      </div>
                    ) : (
                      <div className="py-12 text-center border-2 border-dashed rounded-2xl border-zinc-100 dark:border-zinc-800">
                        <Activity
                          size={32}
                          className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2"
                        />
                        <p className="text-zinc-400 text-sm italic">
                          Nenhum diagnóstico recente. Inicie um teste para
                          verificar o sinal.
                        </p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="tickets_history" className="mt-4">
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-3">
                      {tickets.filter(
                        (t) => t.customerId === selectedCustomerDetails.id,
                      ).length > 0 ? (
                        tickets
                          .filter(
                            (t) => t.customerId === selectedCustomerDetails.id,
                          )
                          .sort(
                            (a, b) =>
                              (b.createdAt?.seconds || 0) -
                              (a.createdAt?.seconds || 0),
                          )
                          .map((t) => (
                            <div
                              key={t.id}
                              className="relative p-4 rounded-[16px] bg-white dark:bg-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] flex items-center justify-between ticket-shape overflow-hidden hover:scale-[1.01] transition-all cursor-pointer"
                            >
                              <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-zinc-700/50" />
                              <div className="space-y-1 relative z-10 pl-2">
                                <p className="text-sm font-bold dark:text-zinc-50">
                                  {t.subject}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                                  <span className="flex items-center gap-1">
                                    <Ticket size={10} /> {t.id?.slice(0, 8)}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    Criado:{" "}
                                    {t.createdAt
                                      ? new Date(
                                          t.createdAt.seconds * 1000,
                                        ).toLocaleDateString("pt-BR")
                                      : "n/a"}
                                  </span>
                                  {t.status === "resolved" && t.resolvedAt && (
                                    <>
                                      <span>•</span>
                                      <span className="text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                        <CheckCircle2 size={10} />
                                        Resolvido{t.aiHandled ? " pela IA" : ""}
                                        :{" "}
                                        {new Date(
                                          t.resolvedAt.seconds * 1000,
                                        ).toLocaleDateString("pt-BR")}{" "}
                                        às{" "}
                                        {new Date(
                                          t.resolvedAt.seconds * 1000,
                                        ).toLocaleTimeString("pt-BR", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] uppercase font-bold",
                                  t.status === "open"
                                    ? "text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400"
                                    : t.status === "resolved"
                                      ? "text-green-600 border-green-200 bg-green-50 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
                                      : "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400",
                                )}
                              >
                                {t.status}
                              </Badge>
                            </div>
                          ))
                      ) : (
                        <div className="text-center py-12 border-2 border-dashed rounded-2xl border-zinc-100">
                          <Ticket
                            size={32}
                            className="mx-auto text-zinc-200 mb-2"
                          />
                          <p className="text-zinc-400 text-sm italic">
                            Nenhum ticket encontrado para este cliente.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="billing_history" className="mt-4">
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-3">
                      {invoices.filter((i) => {
                        if (
                          selectedCustomerDetails.status === "lead" ||
                          selectedCustomerDetails.status === "pending"
                        )
                          return false;
                        if (i.customerId !== selectedCustomerDetails.id)
                          return false;
                        return true;
                      }).length > 0 ? (
                        invoices
                          .filter((i) => {
                            if (
                              selectedCustomerDetails.status === "lead" ||
                              selectedCustomerDetails.status === "pending"
                            )
                              return false;
                            if (i.customerId !== selectedCustomerDetails.id)
                              return false;
                            return true;
                          })
                          .sort(
                            (a, b) =>
                              (b.dueDate?.seconds || 0) -
                              (a.dueDate?.seconds || 0),
                          )
                          .map((i) => (
                            <div
                              key={i.id}
                              className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-between hover:border-primary/20 transition-colors"
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                                  R$ {i.amount?.toFixed(2)}
                                </p>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                                  <span className="flex items-center gap-1">
                                    <CreditCard size={10} /> Vencimento:{" "}
                                    {i.dueDate
                                      ? new Date(
                                          i.dueDate.seconds * 1000,
                                        ).toLocaleDateString("pt-BR")
                                      : "n/a"}
                                  </span>
                                </div>
                              </div>
                              <Badge
                                className={cn(
                                  "text-[10px] uppercase font-bold border-none",
                                  i.status === "paid"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : i.status === "overdue"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                                )}
                              >
                                {i.status === "paid"
                                  ? "PAGO"
                                  : i.status === "overdue"
                                    ? "VENCIDO"
                                    : "PENDENTE"}
                              </Badge>
                            </div>
                          ))
                      ) : (
                        <div className="text-center py-12 border-2 border-dashed rounded-2xl border-zinc-100 dark:border-zinc-800">
                          <CreditCard
                            size={32}
                            className="mx-auto text-zinc-200 dark:text-zinc-800 mb-2"
                          />
                          <p className="text-zinc-400 text-sm italic">
                            Nenhuma fatura encontrada com os filtros
                            selecionados.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4">
                  <ScrollArea className="h-[300px] pr-4">
                    <div className="relative pl-6 space-y-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-zinc-100 dark:before:bg-zinc-800">
                      {(() => {
                        const timelineEvents = [
                          ...tickets
                            .filter(
                              (t) =>
                                t.customerId === selectedCustomerDetails.id,
                            )
                            .map((t) => ({
                              date: t.createdAt?.seconds
                                ? new Date(t.createdAt.seconds * 1000)
                                : new Date(),
                              title: `Ticket Aberto: ${t.subject}`,
                              type: "ticket",
                              icon: (
                                <Ticket size={12} className="text-orange-500" />
                              ),
                            })),
                          ...invoices
                            .filter(
                              (i) =>
                                i.customerId === selectedCustomerDetails.id,
                            )
                            .map((i) => ({
                              date: i.dueDate?.seconds
                                ? new Date(i.dueDate.seconds * 1000)
                                : new Date(),
                              title: `Fatura Gerada: R$ ${i.amount?.toFixed(2)}`,
                              type: "billing",
                              icon: (
                                <CreditCard
                                  size={12}
                                  className="text-blue-500"
                                />
                              ),
                            })),
                          ...(selectedCustomerDetails.createdAt?.seconds
                            ? [
                                {
                                  date: new Date(
                                    selectedCustomerDetails.createdAt.seconds *
                                      1000,
                                  ),
                                  title: "Cliente Cadastrado no Sistema",
                                  type: "system",
                                  icon: (
                                    <User
                                      size={12}
                                      className="text-green-500"
                                    />
                                  ),
                                },
                              ]
                            : []),
                        ].sort((a, b) => b.date.getTime() - a.date.getTime());

                        return timelineEvents.map((event, idx) => (
                          <div key={idx} className="relative">
                            <div className="absolute -left-[25px] top-1 h-4 w-4 rounded-full bg-white dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 flex items-center justify-center z-10">
                              {event.icon}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {event.title}
                              </p>
                              <p className="text-[10px] text-zinc-500">
                                {event.date.toLocaleDateString("pt-BR")} às{" "}
                                {event.date.toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="network" className="mt-4">
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <Wifi
                              size={20}
                              className="text-green-600 dark:text-green-400"
                            />
                          </div>
                          <div>
                            <p className="text-sm font-bold">
                              Status da Conexão
                            </p>
                            <p className="text-xs text-green-600 font-medium">
                              Online (Ativo)
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-2"
                          onClick={() =>
                            runCustomerDiagnostics(selectedCustomerDetails.id)
                          }
                        >
                          <RefreshCw size={14} /> Testar Conexão
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                          <p className="text-[10px] text-zinc-400 uppercase mb-1">
                            Sinal (RX)
                          </p>
                          <p className="text-sm font-mono font-bold text-green-600">
                            {diagnosticsHistory.find(
                              (d) =>
                                d.customerId === selectedCustomerDetails.id,
                            )?.signal || "-19.4 dBm"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                          <p className="text-[10px] text-zinc-400 uppercase mb-1">
                            Uptime
                          </p>
                          <p className="text-sm font-mono font-bold">
                            {diagnosticsHistory.find(
                              (d) =>
                                d.customerId === selectedCustomerDetails.id,
                            )?.uptime || "14d 06h 22m"}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <p className="text-[10px] text-zinc-400 uppercase mb-2">
                          CTO de Atendimento
                        </p>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-2">
                            <Database size={14} className="text-blue-500" />
                            <span className="text-xs font-medium">
                              {ctos[0]?.name || "CTO-01-CENTRO"}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] text-primary"
                            onClick={() => {
                              setIsDetailsDialogOpen(false);
                              navigate("/");
                            }}
                          >
                            Ver no Mapa
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-bold text-zinc-500 uppercase">
                        Histórico de Diagnósticos
                      </p>
                      <div className="space-y-2">
                        {diagnosticsHistory.filter(
                          (d) => d.customerId === selectedCustomerDetails.id,
                        ).length > 0 ? (
                          diagnosticsHistory
                            .filter(
                              (d) =>
                                d.customerId === selectedCustomerDetails.id,
                            )
                            .map((diag) => (
                              <div
                                key={diag.id}
                                className="flex items-center justify-between p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                              >
                                <div className="flex items-center gap-3">
                                  <Clock size={14} className="text-zinc-400" />
                                  <span>
                                    {diag.timestamp instanceof Date
                                      ? diag.timestamp.toLocaleString("pt-BR")
                                      : new Date(diag.timestamp).toLocaleString(
                                          "pt-BR",
                                        )}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="font-mono text-zinc-500">
                                    {diag.signal}
                                  </span>
                                  <span className="font-mono text-zinc-500">
                                    {diag.latency}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="h-5 text-[10px]"
                                  >
                                    {diag.status}
                                  </Badge>
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="text-xs text-zinc-400 italic py-4 text-center">
                            Nenhum diagnóstico recente.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}

      {/* Create Customer Dialog */}

      {/* Team Member Dialog */}
      <Dialog
        open={isTeamMemberDialogOpen}
        onOpenChange={setIsTeamMemberDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar Membro da Equipe</DialogTitle>
            <DialogDescription>
              Convide um novo colega para gerenciar o Astrum.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTeamMember} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-name">Nome Completo</Label>
              <Input
                id="member-name"
                placeholder="Ex: João Silva"
                value={newTeamMember.name}
                onChange={(e) =>
                  setNewTeamMember((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-email">E-mail Corporativo</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="joao@astrum.com"
                value={newTeamMember.email}
                onChange={(e) =>
                  setNewTeamMember((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Cargo / Permissão</Label>
              <select
                id="member-role"
                className="flex h-10 w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm ring-offset-white dark:ring-offset-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-300 focus:ring-offset-2"
                value={newTeamMember.role}
                onChange={(e) =>
                  setNewTeamMember((prev) => ({
                    ...prev,
                    role: e.target.value,
                  }))
                }
              >
                <option value="support">Colaborador (Suporte)</option>
                <option value="tecnico">Técnico de Campo</option>
                <option value="owner">Dono / Gerente</option>
                {isAstrum && (
                  <option value="admin">Administrador (Astrum)</option>
                )}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTeamMemberDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Adicionar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* KB Dialog */}
      <Dialog open={isKBDialogOpen} onOpenChange={setIsKBDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingKB ? "Editar Artigo" : "Novo Artigo de Conhecimento"}
            </DialogTitle>
            <DialogDescription>
              Adicione informações que a IA usará para responder aos clientes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kb-title">Título</Label>
              <Input
                id="kb-title"
                value={newKB.title}
                onChange={(e) => setNewKB({ ...newKB, title: e.target.value })}
                placeholder="Ex: Como configurar o roteador TP-Link"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-category">Categoria</Label>
              <select
                id="kb-category"
                className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm ring-offset-white dark:ring-offset-zinc-950 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:focus:ring-zinc-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={newKB.category}
                onChange={(e) =>
                  setNewKB({ ...newKB, category: e.target.value })
                }
              >
                <option value="Geral">Geral</option>
                <option value="Suporte Técnico">Suporte Técnico</option>
                <option value="Financeiro">Financeiro</option>
                <option value="Vendas">Vendas</option>
                <option value="Configuração">Configuração</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kb-content">Conteúdo</Label>
              <textarea
                id="kb-content"
                className="w-full h-48 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm bg-zinc-50 dark:bg-zinc-900/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={newKB.content}
                onChange={(e) =>
                  setNewKB({ ...newKB, content: e.target.value })
                }
                placeholder="Descreva detalhadamente o procedimento ou informação..."
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input
                value={newKB.tags?.join(", ")}
                onChange={(e) =>
                  setNewKB({
                    ...newKB,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter((t) => t !== ""),
                  })
                }
                placeholder="wifi, roteador, configuração"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsKBDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveKB}>Salvar Artigo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket Detail Modal */}
      <Dialog open={isTicketDetailOpen} onOpenChange={setIsTicketDetailOpen}>
        <DialogContent className="sm:max-w-[900px] h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogTitle className="sr-only">Detalhes do Ticket</DialogTitle>
          {selectedTicket && (
            <div className="flex flex-col h-full">
              <DialogHeader className="p-6 border-b shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">
                      {selectedTicket.subject}
                    </DialogTitle>
                    <DialogDescription>
                      Ticket #{selectedTicket.id?.slice(0, 8)} - Cliente:{" "}
                      {selectedTicket.customerId}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedTicket.aiEnabled !== false ? (
                        <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50 flex gap-1">
                           <Bot size={12} /> IA Ativa
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="flex gap-1">
                           <User size={12} /> {selectedTicket.assignedOperatorName || 'Humano'}
                        </Badge>
                    )}
                    <Badge
                      variant={
                        selectedTicket.priority === "high" ||
                        selectedTicket.priority === "urgent"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {selectedTicket.priority.toUpperCase()}
                    </Badge>
                    <Badge variant="secondary">
                      {selectedTicket.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 flex overflow-hidden">
                {/* Chat Area */}
                <div className="flex-1 flex flex-col border-r dark:border-zinc-800">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((m, i) => (
                        <div
                          key={m.id || i}
                          className={cn(
                            "flex gap-3 max-w-[85%]",
                            m.senderType === "human"
                              ? "ml-auto flex-row-reverse"
                              : "",
                          )}
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback
                              className={cn(
                                "text-[10px]",
                                m.senderType === "human"
                                  ? "bg-zinc-100"
                                  : m.senderType === "ai"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-blue-100 text-blue-700",
                              )}
                            >
                              {m.senderType === "human" ? (
                                "AT"
                              ) : m.senderType === "ai" ? (
                                <Bot size={14} />
                              ) : (
                                "CL"
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              "space-y-1",
                              m.senderType === "human" ? "items-end" : "",
                            )}
                          >
                            <div
                              className={cn(
                                "p-3 rounded-2xl text-sm shadow-sm",
                                m.senderType === "human"
                                  ? "bg-primary text-primary-foreground rounded-tr-none"
                                  : m.senderType === "ai"
                                    ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none"
                                    : "bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-tl-none",
                              )}
                            >
                              {m.text}
                              {m.attachment && (
                                <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5">
                                  <img
                                    src={m.attachment.url}
                                    alt="Attachment"
                                    className="max-w-full rounded-lg"
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-400 px-1">
                              {m.timestamp?.toDate
                                ? m.timestamp.toDate().toLocaleTimeString()
                                : "Agora"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {isAiThinking && (
                        <div className="flex gap-3">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-purple-100 text-purple-700">
                              <Bot size={14} />
                            </AvatarFallback>
                          </Avatar>
                          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 p-3 rounded-2xl rounded-tl-none shadow-sm">
                            <div className="flex gap-1">
                              <span
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                                style={{ animationDelay: "300ms" }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                    {smartReplies.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {smartReplies.map((reply, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            className="text-[10px] h-7 bg-white dark:bg-zinc-900 border-primary/20 hover:border-primary/50 text-primary"
                            onClick={() => setNewMessage(reply)}
                          >
                            {reply}
                          </Button>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input
                        placeholder="Digite sua resposta..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="flex-1 bg-white dark:bg-zinc-900"
                      />
                      <Button type="submit" size="icon">
                        <Send size={18} />
                      </Button>
                    </form>
                  </div>
                </div>

                {/* Sidebar Info */}
                <div className="w-64 p-4 bg-zinc-50 dark:bg-zinc-900/50 space-y-6 overflow-y-auto">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-zinc-400 mb-3">
                      Ações Rápidas
                    </h4>
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
                        onClick={() => {
                          toast.success(
                            "Comando enviado via WhatsApp para o ERP/Suporte Pai (Reativação solicitada).",
                          );
                        }}
                      >
                        <Smartphone size={14} /> Acionar ERP Pai (WhatsApp)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={handleSummarizeTicket}
                        disabled={isSummarizingTicket}
                      >
                        <Sparkles size={14} /> Resumir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={() =>
                          handleToggleAI(
                            selectedTicket.id,
                            selectedTicket.aiEnabled !== false,
                          )
                        }
                      >
                        <Bot size={14} />{" "}
                        {selectedTicket.aiEnabled !== false
                          ? "Pausar IA"
                          : "Ativar IA"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 text-green-600"
                        onClick={() => {
                          updateTicketStatus(selectedTicket.id, "resolved");
                          setIsTicketDetailOpen(false);
                        }}
                      >
                        <CheckCircle2 size={14} /> Resolver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300 dark:border-amber-900/30 dark:hover:bg-amber-900/20"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/upsell/convert", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                tenantId:
                                  companySettings?.tenant_id || "default",
                                customerId: selectedTicket.customerId,
                                currentPlan:
                                  customers.find(
                                    (c) => c.id === selectedTicket.customerId,
                                  )?.plan || "Unknown",
                                suggestedPlan:
                                  "Plano Superior (Aceito via Operador)",
                                outcome: "converted",
                              }),
                            });
                            if (!res.ok) throw new Error("Falha ao registrar");
                            toast.success(
                              "Upsell convertido com sucesso! Dashboard atualizado.",
                            );
                          } catch (err: any) {
                            toast.error("Erro ao registrar: " + err.message);
                          }
                        }}
                      >
                        <TrendingUp size={14} /> Registrar Upsell Feito
                      </Button>
                      {isOwner && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:border-red-900/30 dark:hover:bg-red-900/20"
                          onClick={async () => {
                            setConfirmDialog({
                              isOpen: true,
                              title: "Excluir Ticket",
                              message:
                                "Tem certeza que deseja excluir este ticket aberto? Esta ação não pode ser desfeita.",
                              onConfirm: async () => {
                                try {
                                  const { deleteTicket } =
                                    await import("@/src/lib/db");
                                  await deleteTicket(selectedTicket.id);
                                  toast.success("Ticket excluído com sucesso!");
                                  setIsTicketDetailOpen(false);
                                } catch (err) {
                                  toast.error("Erro ao excluir ticket.");
                                }
                              },
                            });
                          }}
                        >
                          <Trash2 size={14} /> Excluir Ticket
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase text-zinc-400 mb-3">
                      Cliente
                    </h4>
                    {customers.find(
                      (c) => c.id === selectedTicket.customerId,
                    ) ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.avatar ||
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.photoUrl ||
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.avatarUrl ||
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.profilePicUrl
                              }
                            />
                            <AvatarFallback>
                              {customers
                                .find((c) => c.id === selectedTicket.customerId)
                                ?.name?.slice(0, 2)
                                .toUpperCase() || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="overflow-hidden">
                            <p className="text-sm font-bold truncate">
                              {
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.name
                              }
                            </p>
                            <p className="text-[10px] text-zinc-500 truncate">
                              {
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.email
                              }
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-zinc-400">Plano</p>
                            <p className="font-bold">
                              {
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.plan
                              }
                            </p>
                          </div>
                          <div className="p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-zinc-400">Status</p>
                            <Badge
                              variant="outline"
                              className="h-4 px-1 text-[8px]"
                            >
                              {
                                customers.find(
                                  (c) => c.id === selectedTicket.customerId,
                                )?.status
                              }
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-500 italic">
                        Dados do cliente não encontrados.
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-xs font-bold uppercase text-zinc-400 mb-3">
                      Atendimento Atual
                    </h4>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      {selectedTicket.aiEnabled !== false ? (
                        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                          <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                            <Bot size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold">Agente de IA</p>
                            <p className="text-[9px] text-zinc-500">
                              Respondendo no Automático
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <User size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold">Equipe Humana</p>
                            <p className="text-[9px] text-zinc-500">
                              Aguardando Resposta Manual
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CTO Detail Modal */}
      <Dialog open={isCTODetailOpen} onOpenChange={setIsCTODetailOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Detalhes da CTO</DialogTitle>
            <DialogDescription>
              Informações técnicas e ocupação da caixa de terminação óptica.
            </DialogDescription>
          </DialogHeader>
          {selectedCTO && (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Database size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{selectedCTO.name}</h3>
                    <p className="text-xs text-zinc-500">
                      {selectedCTO.latitude.toFixed(4)},{" "}
                      {selectedCTO.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    "border-none",
                    selectedCTO.usedPorts >= selectedCTO.totalPorts
                      ? "bg-red-500"
                      : "bg-green-500",
                  )}
                >
                  {selectedCTO.usedPorts >= selectedCTO.totalPorts
                    ? "LOTADA"
                    : "DISPONÍVEL"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-1">
                  <p className="text-xs text-zinc-400 uppercase">
                    Portas Totais
                  </p>
                  <p className="text-2xl font-bold">{selectedCTO.totalPorts}</p>
                </div>
                <div className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-1">
                  <p className="text-xs text-zinc-400 uppercase">
                    Portas Livres
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {selectedCTO.totalPorts - selectedCTO.usedPorts}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Ocupação</span>
                  <span>
                    {Math.round(
                      (selectedCTO.usedPorts / selectedCTO.totalPorts) * 100,
                    )}
                    %
                  </span>
                </div>
                <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      selectedCTO.usedPorts / selectedCTO.totalPorts >= 0.9
                        ? "bg-red-500"
                        : selectedCTO.usedPorts / selectedCTO.totalPorts >= 0.7
                          ? "bg-orange-500"
                          : "bg-blue-500",
                    )}
                    style={{
                      width: `${(selectedCTO.usedPorts / selectedCTO.totalPorts) * 100}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ações
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => handleRunDiagnostics(selectedCTO.id, "cto")}
                    disabled={isDiagnosing}
                  >
                    {isDiagnosing ? (
                      <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    ) : (
                      <ShieldCheck size={14} />
                    )}
                    {isDiagnosing ? "Diagnosticando..." : "Diagnóstico"}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 text-red-600 border-red-100 hover:bg-red-50"
                  >
                    <TrendingDown size={14} /> Reportar Falha
                  </Button>
                </div>
              </div>

              {diagnosticsResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-zinc-900 text-white space-y-4 shadow-xl border border-zinc-800"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                      Relatório Técnico
                    </h4>
                    <span className="text-[10px] text-zinc-500">
                      {diagnosticsResult.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase">
                        Sinal Médio (dBm)
                      </p>
                      <p
                        className={cn(
                          "text-lg font-mono font-bold",
                          diagnosticsResult.metrics.avgSignal < -25
                            ? "text-red-400"
                            : "text-green-400",
                        )}
                      >
                        {diagnosticsResult.metrics.avgSignal.toFixed(1)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase">
                        Latência (ms)
                      </p>
                      <p className="text-lg font-mono font-bold text-blue-400">
                        {diagnosticsResult.metrics.latency.toFixed(0)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase">
                        Perda de Pacotes
                      </p>
                      <p className="text-lg font-mono font-bold">
                        {diagnosticsResult.metrics.packetLoss.toFixed(2)}%
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] text-zinc-500 uppercase">
                        ONUs Ativas
                      </p>
                      <p className="text-lg font-mono font-bold">
                        {diagnosticsResult.metrics.activeOnus}
                      </p>
                    </div>
                  </div>
                  {diagnosticsResult.metrics.alerts.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 text-orange-400 mb-1">
                        <TrendingDown size={12} />
                        <p className="text-[10px] font-bold uppercase">
                          Alertas
                        </p>
                      </div>
                      {diagnosticsResult.metrics.alerts.map(
                        (alert: string, i: number) => (
                          <p key={i} className="text-[10px] text-zinc-400">
                            • {alert}
                          </p>
                        ),
                      )}
                    </div>
                  )}

                  {diagnosticsHistory.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-zinc-800">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                        Histórico
                      </h4>
                      <div className="space-y-1">
                        {diagnosticsHistory.slice(1, 4).map((hist, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-[10px] p-2 rounded bg-zinc-900/50"
                          >
                            <span className="text-zinc-500">
                              {hist.timestamp.toLocaleTimeString()}
                            </span>
                            <div className="flex gap-3">
                              <span
                                className={
                                  hist.metrics.avgSignal < -25
                                    ? "text-red-500"
                                    : "text-green-500"
                                }
                              >
                                {hist.metrics.avgSignal.toFixed(1)} dBm
                              </span>
                              <span className="text-zinc-400">
                                {hist.metrics.latency.toFixed(0)}ms
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* New Team Member Dialog */}
      <Dialog
        open={isTeamMemberDialogOpen}
        onOpenChange={setIsTeamMemberDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Novo Membro na Equipe</DialogTitle>
            <DialogDescription>
              Convide um novo colaborador para acessar o dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="member-name">Nome Completo</Label>
              <Input
                id="member-name"
                placeholder="Ex: João Silva"
                value={newTeamMember.name}
                onChange={(e) =>
                  setNewTeamMember({ ...newTeamMember, name: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-email">E-mail Corporativo</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="joao@astrum.com.br"
                value={newTeamMember.email}
                onChange={(e) =>
                  setNewTeamMember({ ...newTeamMember, email: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="member-role">Perfil de Acesso</Label>
              <select
                id="member-role"
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                value={newTeamMember.role}
                onChange={(e) =>
                  setNewTeamMember({ ...newTeamMember, role: e.target.value })
                }
              >
                <option value="admin">Administrador</option>
                <option value="support">Suporte Técnico</option>
                <option value="tecnico">Técnico de Campo</option>
                <option value="billing">Financeiro</option>
                <option value="sales">Vendas</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsTeamMemberDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAddMember}>Adicionar à Equipe</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Inventory Item Dialog */}
      <Dialog open={isNewItemDialogOpen} onOpenChange={setIsNewItemDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Novo Item no Estoque</DialogTitle>
            <DialogDescription>
              Cadastre um novo equipamento ou insumo no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Equipamento</Label>
              <Input
                id="name"
                placeholder="Ex: ONU Huawei HG8245H"
                value={newItem.name}
                onChange={(e) =>
                  setNewItem({ ...newItem, name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <select
                  id="category"
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300"
                  value={newItem.category}
                  onChange={(e) =>
                    setNewItem({ ...newItem, category: e.target.value })
                  }
                >
                  <option value="ONU">ONU</option>
                  <option value="Roteador">Roteador</option>
                  <option value="Cabo">Cabo</option>
                  <option value="Acessório">Acessório</option>
                  <option value="Ferramenta">Ferramenta</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">Unidade</Label>
                <Input
                  id="unit"
                  placeholder="Ex: un, km, m"
                  value={newItem.unit}
                  onChange={(e) =>
                    setNewItem({ ...newItem, unit: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="stock">Qtd. Inicial</Label>
                <Input
                  id="stock"
                  type="number"
                  value={newItem.stock}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      stock: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="minStock">Qtd. Mínima</Label>
                <Input
                  id="minStock"
                  type="number"
                  value={newItem.minStock}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      minStock: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Preço Unit.</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="R$"
                  value={newItem.price}
                  onChange={(e) =>
                    setNewItem({
                      ...newItem,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsNewItemDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleAddItem}>Cadastrar Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Adjustment Dialog */}
      <Dialog
        open={isInventoryDialogOpen}
        onOpenChange={setIsInventoryDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ajustar Estoque</DialogTitle>
            <DialogDescription>
              Ajuste a quantidade em estoque para: {selectedInventoryItem?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
              <span className="text-sm text-zinc-500">Quantidade Atual:</span>
              <span className="font-mono font-bold">
                {selectedInventoryItem?.stock} {selectedInventoryItem?.unit}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Quantidade a Adicionar/Remover</Label>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setAdjustmentAmount((prev) => prev - 1)}
                >
                  <TrendingDown size={16} />
                </Button>
                <Input
                  type="number"
                  className="text-center font-mono"
                  value={adjustmentAmount}
                  onChange={(e) =>
                    setAdjustmentAmount(parseInt(e.target.value) || 0)
                  }
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setAdjustmentAmount((prev) => prev + 1)}
                >
                  <TrendingUp size={16} />
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500 text-center">
                Use valores negativos para remover do estoque.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 border border-zinc-100 dark:border-zinc-800 rounded-lg">
              <span className="text-sm font-medium">Novo Total:</span>
              <span
                className={cn(
                  "font-mono font-bold",
                  selectedInventoryItem &&
                    selectedInventoryItem.stock + adjustmentAmount <=
                      selectedInventoryItem.minStock
                    ? "text-red-500"
                    : "text-green-500",
                )}
              >
                {selectedInventoryItem
                  ? selectedInventoryItem.stock + adjustmentAmount
                  : 0}{" "}
                {selectedInventoryItem?.unit}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsInventoryDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                handleAdjustInventory(
                  selectedInventoryItem?.id,
                  adjustmentAmount,
                )
              }
            >
              Confirmar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Test Agent Dialog */}
      <Dialog open={isTestAgentOpen} onOpenChange={setIsTestAgentOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Teste Rápido: Agente {testAgentCategory || "Orquestrador"}
            </DialogTitle>
            <DialogDescription>
              Envie uma mensagem para testar como a IA responde com os prompts
              atuais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                value={testAgentMessage}
                onChange={(e) => setTestAgentMessage(e.target.value)}
                placeholder="Mensagem do cliente..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTestAgent();
                }}
              />
              <Button onClick={handleTestAgent} disabled={isTestingAgent}>
                {isTestingAgent ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </Button>
            </div>

            {testAgentResponse && (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-primary">
                  <Bot size={16} /> Resposta do Agente
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {testAgentResponse.message || testAgentResponse.error}
                </p>

                {testAgentResponse.category && (
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      Roteou para: {testAgentResponse.category}
                    </Badge>
                    <Badge
                      variant={
                        testAgentResponse.shouldEscalate
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {testAgentResponse.shouldEscalate
                        ? "Decidiu Escalar"
                        : "Retido na IA"}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mining Dialog */}
      <Dialog open={isMiningDialogOpen} onOpenChange={setIsMiningDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-purple-500" /> Resumo com IA
            </DialogTitle>
            <DialogDescription>
              A IA varrerá os atendimentos recentes em busca de padrões para
              sugerir novos artigos para a Base de Conhecimento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-purple-800 dark:text-purple-300">
                Esta ferramenta requer o uso da API para processar conversas.
                Extrairemos as dúvidas mais frequentes que exigem intervenção
                humana para transformar em novos artigos no RAG.
              </p>
            </div>

            {!miningResult ? (
              <div className="flex justify-end pt-4">
                <Button
                  onClick={async () => {
                    setIsGeneratingArticle(true);
                    try {
                      const tx = messages
                        .slice(-50)
                        .map((m) => `[${m.senderType}]: ${m.text}`)
                        .join("\n");
                      const articles = await generateKBArticleFromTickets(tx);
                      if (articles) {
                        setMiningResult(
                          Array.isArray(articles) ? articles : [articles],
                        );
                        toast.success("Logs minerados com sucesso!");
                      } else {
                        toast.error("Nenhum padrão encontrado para artigo.");
                      }
                    } catch (e) {
                      toast.error("Erro ao minerar logs");
                    } finally {
                      setIsGeneratingArticle(false);
                    }
                  }}
                  disabled={isGeneratingArticle}
                  className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
                >
                  {isGeneratingArticle ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Zap size={16} />
                  )}
                  {isGeneratingArticle ? "Analisando..." : "Iniciar Mineração"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4">
                  {miningResult.map((res: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm">{res.title}</h4>
                        <Badge variant="outline">{res.category}</Badge>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
                        {res.content.substring(0, 150)}...
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-blue-600"
                        onClick={() => {
                          setNewKB({
                            title: res.title,
                            content: res.content,
                            category: res.category,
                            tags: [],
                          });
                          setIsMiningDialogOpen(false);
                          setIsKBDialogOpen(true);
                        }}
                      >
                        Usar como Novo Artigo Base
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setMiningResult(null)}
                >
                  Limpar Resultados
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF Import Dialog */}
      <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="text-blue-500" /> Leitura Inteligente de PDF
            </DialogTitle>
            <DialogDescription>
              Importe manuais, contratos ou documentação. A IA lerá o arquivo e
              extrairá as informações para o RAG.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            {!pdfSummary ? (
              <>
                <div
                  className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  onClick={() =>
                    document.getElementById("dialog-pdf-upload")?.click()
                  }
                >
                  <Upload className="mx-auto mb-4 text-zinc-400" size={32} />
                  <h3 className="font-medium mb-1">Selecione um PDF</h3>
                  <p className="text-xs text-zinc-500">
                    Arraste ou clique para procurar (Até 10MB).
                  </p>
                  <input
                    id="dialog-pdf-upload"
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={async (e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setIsProcessingPdf(true);

                        try {
                          const formData = new FormData();
                          formData.append("pdf", file);

                          const res = await fetch("/api/rag/upload-pdf", {
                            method: "POST",
                            body: formData,
                          });

                          if (!res.ok) {
                            throw new Error(await res.text());
                          }

                          const data = await res.json();
                          setPdfSummary(data.summary);
                          toast.success("PDF lido com sucesso pela IA!");
                        } catch (error) {
                          console.error("PDF Parsing Error:", error);
                          toast.error("Erro ao analisar o PDF.");
                        } finally {
                          setIsProcessingPdf(false);
                        }
                      }
                    }}
                  />
                </div>
                {isProcessingPdf && (
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium mt-4">
                    <RefreshCw size={16} className="animate-spin" /> A IA está
                    analisando o arquivo...
                  </div>
                )}
              </>
            ) : (
              <div className="text-left space-y-4">
                <div className="bg-zinc-50 dark:bg-zinc-900 border rounded-lg p-4">
                  <h4 className="font-bold text-sm mb-2 text-zinc-700 dark:text-zinc-300">
                    Resumo da Leitura Analítica
                  </h4>
                  <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-sans">
                    {pdfSummary}
                  </pre>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPdfSummary(null)}>
                    Ler outro PDF
                  </Button>
                  <Button
                    onClick={() => {
                      setNewKB({
                        title: "Resumo Extraído via PDF",
                        content: pdfSummary,
                        category: "Geral",
                        tags: ["pdf", "documentação"],
                      });
                      setIsPdfDialogOpen(false);
                      setPdfSummary(null);
                      setIsKBDialogOpen(true);
                    }}
                  >
                    Converter em Artigo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
    </QueryClientProvider>
  );
}
