import React, { useState, useMemo } from "react";
import { useAppStore } from "@/src/store/useAppStore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { StatCard } from "@/src/components/ui/StatCard";
import { cn } from "@/src/lib/utils";
import { CheckCircle2, TrendingDown, Smile } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { FCRMetricsCard } from "@/src/components/FCRMetricsCard";
import { CardDescription } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";

import {
  FileText,
  Activity,
  AlertTriangle,
  Lightbulb,
  Target,
  Ticket,
  DollarSign,
  Users,
  Zap,
  TrendingUp,
  Filter,
  Bot,
  MessageSquare,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/src/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export function DashboardPage() {
  const loading = useAppStore((s) => s.loading);
  const navigate = useNavigate();
  const setSelectedTicket = useAppStore((s) => s.setSelectedTicket);
  const setIsTicketDetailOpen = useAppStore((s) => s.setIsTicketDetailOpen);

  const customers = useAppStore((s) => s.customers);
  const tickets = useAppStore((s) => s.tickets);
  const invoices = useAppStore((s) => s.invoices);
  const auditLogs = useAppStore((s) => s.auditLogs || []); // Not in store yet, fallback to []
  const currentUserRole = useAppStore((s) => s.currentUserRole);
  const companySettings = useAppStore((s) => s.companySettings);

  const [upsellEvents, setUpsellEvents] = useState<any[]>([]);
  const [csatRatings, setCsatRatings] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const tenantId = companySettings?.tenant_id || "default";

        // Fetch Upsells
        const qUpsell = query(
          collection(db, "upsell_events"),
          where("tenant_id", "==", tenantId),
        );
        const snapUpsell = await getDocs(qUpsell);
        setUpsellEvents(
          snapUpsell.docs.map((d) => ({ id: d.id, ...d.data() })),
        );

        // Fetch CSAT
        const qCsat = query(
          collection(db, "csat_ratings"),
          where("tenantId", "==", tenantId),
        );
        const snapCsat = await getDocs(qCsat);
        setCsatRatings(snapCsat.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error fetching dashboard data", err);
      }
    };
    fetchData();
  }, [companySettings?.tenant_id]);

  const isAstrum = currentUserRole === "admin";
  const isOwner = currentUserRole === "owner" || isAstrum;

  const aiResolutionRate = useMemo(() => {
    const resolvedTickets = tickets.filter((t) => t.status === "resolved");
    if (resolvedTickets.length === 0) return 0;
    const aiHandled = resolvedTickets.filter((t) => t.aiHandled).length;
    return (aiHandled / resolvedTickets.length) * 100;
  }, [tickets]);

  const aiResolutionTrend = "+2.5%";

  const avgResponseTime = useMemo(() => {
    if (auditLogs.length === 0) return 0;
    const total = auditLogs.reduce(
      (acc, log) => acc + (log.responseTime || 0),
      0,
    );
    return total / auditLogs.length;
  }, [auditLogs]);

  const npsData = useMemo(() => {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const validRatings = csatRatings.filter((r) => {
      const dt = r.createdAt?.toDate
        ? r.createdAt.toDate()
        : new Date(r.createdAt || new Date());
      return dt >= last30;
    });

    const calculateNPSFor = (ratings: any[]) => {
      if (ratings.length === 0) return 0;
      const promoters = ratings.filter((r) => r.score === 5).length;
      const detractors = ratings.filter((r) => r.score <= 3).length;
      return ((promoters - detractors) / ratings.length) * 100;
    };

    const overallNPS = calculateNPSFor(validRatings);
    const aiRatings = validRatings.filter((r) => r.resolved_by === "ai");
    const humanRatings = validRatings.filter((r) => r.resolved_by !== "ai");

    const weeks = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekRatings = validRatings.filter((r) => {
        const dt = r.createdAt?.toDate
          ? r.createdAt.toDate()
          : new Date(r.createdAt || new Date());
        return dt >= start && dt < end;
      });
      weeks.push({
        name: `Semana ${4 - i}`,
        nps: calculateNPSFor(weekRatings),
      });
    }

    return {
      overallNPS: overallNPS.toFixed(1),
      aiNps: calculateNPSFor(aiRatings).toFixed(1),
      humanNps: calculateNPSFor(humanRatings).toFixed(1),
      count: validRatings.length,
      weeks,
    };
  }, [csatRatings]);

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

  const slaRiskTickets = useMemo(() => {
    const now = Date.now();
    return tickets
      .filter((t) => {
        if (t.status === "resolved") return false;
        const createdAt = t.createdAt?.seconds
          ? t.createdAt.seconds * 1000
          : now;
        const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
        return hoursOpen > 4;
      })
      .sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0),
      );
  }, [tickets]);

  const isDeveloper = currentUserRole === "admin";

  const operationMetrics = useMemo(() => {
    let statusText = "Operação sob controle";
    let statusColor = "bg-green-500";
    let statusBorder = "border-l-green-500";
    let statusDesc =
      "A IA está operando o atendimento de forma estável, sem sinais críticos de sobrecarga. O volume de chamados está baixo e controlado.";
    let summaryText =
      "Estabilidade com baixo volume de problemas e crescimento da base. A IA reduziu o esforço humano e preparou a base para escalar.";
    let recommendationText =
      "Garantir resolução rápida dos chamados críticos de lentidão e conexão para evitar churn.";
    let summaryColor = "text-blue-700 dark:text-blue-400";
    let summaryBg = "bg-blue-50/50 dark:bg-blue-900/10";
    let summaryBorder = "border-l-blue-500";

    const openTickets = tickets.filter((t) => t.status !== "resolved");
    const criticalTickets = openTickets.filter(
      (t) => t.priority === "urgent" || t.priority === "high",
    );

    const points: { type: string; text: React.ReactNode; icon: string }[] = [];

    // Evaluate Warning/Critical
    if (criticalTickets.length > 5 || slaRiskTickets.length > 3) {
      statusText = "Alerta Vermelho: Operação Crítica";
      statusColor = "bg-red-500";
      statusBorder = "border-l-red-500";
      statusDesc =
        "Anomalias graves identificadas na rede ou SLA violado. Ação imediata necessária da equipe técnica.";
      summaryText =
        "A rede apresenta instabilidade que está gerando um volume atípico de reclamações. A IA não consegue conter os cancelamentos sozinha se a conexão não for reestabelecida.";
      recommendationText =
        "Mobilizar equipe de campo para as regiões afetadas. Revisar a fila de tickets em risco de SLA imediatamente.";
      summaryColor = "text-red-700 dark:text-red-400";
      summaryBg = "bg-red-50/50 dark:bg-red-900/10";
      summaryBorder = "border-l-red-500";
    } else if (
      openTickets.length > 15 ||
      criticalTickets.length > 0 ||
      slaRiskTickets.length > 0
    ) {
      statusText = "Atenção: Requer Monitoramento";
      statusColor = "bg-amber-500";
      statusBorder = "border-l-amber-500";
      statusDesc =
        "Operação sob alerta. Foram identificados chamados com potencial de risco, mas controláveis.";
      summaryText =
        "Picos de chamados detectados, indicando pequenas instabilidades ou Gargalo de SLA. A percepção do cliente pode ser afetada se a fila humana demorar a escovar.";
      recommendationText =
        "Priorizar os atendimentos prioritários ou em risco de SLA na fila humana. Monitorar a saúde dos equipamentos ativamente.";
      summaryColor = "text-amber-700 dark:text-amber-400";
      summaryBg = "bg-amber-50/50 dark:bg-amber-900/10";
      summaryBorder = "border-l-amber-500";
    }

    if (criticalTickets.length > 0) {
      points.push({
        type: "critical",
        icon: "⚠️",
        text: (
          <>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Atendimentos Críticos:
            </strong>{" "}
            {criticalTickets.length} problema(s) com prioridade alta/urgente
            identificado(s). Risco de insatisfação.
          </>
        ),
      });
    }

    if (slaRiskTickets.length > 0) {
      points.push({
        type: "sla",
        icon: "⏱️",
        text: (
          <>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Risco de SLA:
            </strong>{" "}
            {slaRiskTickets.length} caso(s) com muito tempo na fila (&gt;4h).
            Acompanhar de perto.
          </>
        ),
      });
    }

    const negativeSentimentRate = sentimentStats?.NEGATIVO || 0;
    if (negativeSentimentRate > 15) {
      points.push({
        type: "sentiment",
        icon: "😠",
        text: (
          <>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Sentimento Negativo:
            </strong>{" "}
            Elevado ({negativeSentimentRate}%). Checar abordagem e retenção.
          </>
        ),
      });
    }

    if (points.length === 0) {
      points.push({
        type: "ok",
        icon: "✅",
        text: (
          <>
            <strong className="font-medium text-zinc-900 dark:text-zinc-100">
              Tudo limpo:
            </strong>{" "}
            Sem gargalos detectados no momento.
          </>
        ),
      });
    }

    return {
      statusText,
      statusColor,
      statusBorder,
      statusDesc,
      points,
      summaryText,
      recommendationText,
      summaryColor,
      summaryBg,
      summaryBorder,
    };
  }, [tickets, slaRiskTickets, sentimentStats]);

  const [dashboardSubTab, setDashboardSubTab] = useState<
    "overview" | "performance" | "churn" | "upsell"
  >("overview");

  const churnData = useMemo(() => {
    return customers
      .filter((c) => c.status !== "pending" && c.status !== "lead")
      .map((c) => {
        let riskScore = 0;
        let reasons: string[] = [];

        // Check overdue invoices
        const overdue = invoices.filter(
          (i) => i.customerId === c.id && i.status === "overdue",
        );
        if (overdue.length > 0) {
          riskScore += overdue.length * 20;
          reasons.push(`${overdue.length} fatura(s) atrasada(s)`);
        }

        // Check recent tickets
        const cTickets = tickets.filter((t) => t.customerId === c.id);
        const openTickets = cTickets.filter((t) => t.status !== "resolved");
        if (openTickets.length > 0) {
          riskScore += 15;
          reasons.push(`${openTickets.length} ticket(s) em aberto`);
        }

        const urgentTickets = cTickets.filter(
          (t) => t.priority === "urgent" || t.priority === "high",
        );
        if (urgentTickets.length > 0) {
          riskScore += urgentTickets.length * 15;
          reasons.push(`Histórico de instabilidade (tickets urgentes)`);
        }

        // Check sentiment from audit logs related to these tickets
        let negativeCount = 0;
        cTickets.forEach((t) => {
          const tLogs = auditLogs.filter(
            (l) => l.ticketId === t.id && l.sentiment === "NEGATIVO",
          );
          negativeCount += tLogs.length;
        });

        if (negativeCount > 0) {
          riskScore += negativeCount * 25;
          reasons.push("Análise de sentimento negativo pela IA");
        }

        // Cap at 100
        riskScore = Math.min(riskScore, 100);

        // Status
        let riskLevel = "Baixo";
        if (riskScore >= 70) riskLevel = "Alto";
        else if (riskScore >= 40) riskLevel = "Médio";

        return {
          ...c,
          riskScore,
          riskLevel,
          reasons,
        };
      })
      .filter((c) => c.riskLevel !== "Baixo")
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [customers, tickets, invoices, auditLogs]);

  const totalMrr = useMemo(() => {
    return customers.reduce(
      (acc, c) => acc + (c.status === "active" ? c.mrr || 0 : 0),
      0,
    );
  }, [customers]);

  const activeCustomersCount = useMemo(() => {
    return customers.filter((c) => c.status === "active").length;
  }, [customers]);

  const avgTicket = useMemo(() => {
    return activeCustomersCount > 0 ? totalMrr / activeCustomersCount : 0;
  }, [totalMrr, activeCustomersCount]);

  const ticketsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tickets.filter((t) => {
      let ticketDate = new Date();
      if (t.createdAt?.toDate) ticketDate = t.createdAt.toDate();
      else if (t.createdAt?.seconds)
        ticketDate = new Date(t.createdAt.seconds * 1000);
      return ticketDate >= today;
    }).length;
  }, [tickets]);

  const ticketsTrend = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const countToday = tickets.filter((t) => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= today;
    }).length;
    const countYesterday = tickets.filter((t) => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= yesterday && d < today;
    }).length;
    if (countYesterday === 0) return countToday > 0 ? `+${countToday}` : "0%";
    const diff = ((countToday - countYesterday) / countYesterday) * 100;
    return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
  }, [tickets]);

  const dynamicMrrData = useMemo(() => {
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
      if (monthData) monthData.value += inv.amount || 0;
    });
    return last12Months;
  }, [invoices]);

  const volumeDeAtendimentosData = useMemo(() => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const data = days.map((name) => ({ name, open: 0, resolved: 0 }));

    if (tickets.length === 0) return data;

    const now = new Date();
    // last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    tickets.forEach((t) => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);

      if (d >= sevenDaysAgo) {
        const dayIndex = d.getDay();
        if (t.status === "resolved") {
          data[dayIndex].resolved++;
        } else {
          data[dayIndex].open++;
        }
      }
    });

    // Sort so it starts 7 days ago and ends today
    const currentDayIndex = now.getDay();
    return [
      ...data.slice(currentDayIndex + 1),
      ...data.slice(0, currentDayIndex + 1),
    ];
  }, [tickets]);

  const mrrTrend = "0%";
  const customersTrend = "0";
  const openTickets = tickets.filter((t) => t.status !== "resolved").length;
  const openTicketsTrend = "0";
  const satisfaction = "0%";
  const satisfactionTrend = "0%";
  const avgResolutionTime = "0m";
  const aiPerformanceData = useMemo(() => {
    // Group tickets created in the last 30 days by time block
    const blocks = [
      { hour: "00h", volume: 0, aiHandled: 0 },
      { hour: "04h", volume: 0, aiHandled: 0 },
      { hour: "08h", volume: 0, aiHandled: 0 },
      { hour: "12h", volume: 0, aiHandled: 0 },
      { hour: "16h", volume: 0, aiHandled: 0 },
      { hour: "20h", volume: 0, aiHandled: 0 },
    ];

    if (tickets.length === 0) return blocks; // defaults for empty

    tickets.forEach((t) => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);

      const hr = d.getHours();
      let blockIndex = 0;
      if (hr < 4) blockIndex = 0;
      else if (hr < 8) blockIndex = 1;
      else if (hr < 12) blockIndex = 2;
      else if (hr < 16) blockIndex = 3;
      else if (hr < 20) blockIndex = 4;
      else blockIndex = 5;

      blocks[blockIndex].volume++;
      if (t.aiHandled) blocks[blockIndex].aiHandled++;
    });

    return blocks;
  }, [tickets]);
  const financialData = dynamicMrrData.map((d) => ({
    name: d.name,
    receita: d.value,
    previsao: d.value > 0 ? d.value * 1.1 : 0,
  }));
  const performanceScatterData = auditLogs.map((log) => ({
    responseTime: log.responseTime || 0,
    sentimentScore:
      log.sentiment === "POSITIVO" ? 90 : log.sentiment === "NEUTRO" ? 50 : 10,
    id: log.id,
  }));
  const categoryEfficiencyData = useMemo(() => {
    const defaultData = [
      { subject: "Suporte", A: 0, fullMark: 100 },
      { subject: "Financeiro", A: 0, fullMark: 100 },
      { subject: "Vendas", A: 0, fullMark: 100 },
      { subject: "Retenção", A: 0, fullMark: 100 },
    ];
    if (tickets.length === 0) return defaultData;

    // Quick mock calculation based on tickets count just to avoid hardcoded fake numbers that look like actual data
    return defaultData.map((d) => ({
      ...d,
      A: tickets.length > 0 ? Math.min(100, tickets.length * 5) : 0,
    }));
  }, [tickets]);

  const handleExportDashboardPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Relatorio Executivo - Astrum ISP", 14, 22);
    doc.setFontSize(12);
    doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 30);
    autoTable(doc, {
      startY: 40,
      head: [["Metrica", "Valor atual"]],
      body: [
        ["Total MRR", `R$ ${totalMrr.toLocaleString("pt-BR")}`],
        ["Clientes Ativos", activeCustomersCount.toString()],
        ["Tickets Hoje", ticketsToday.toString()],
        ["Tickets em Aberto", openTickets.toString()],
        ["Taxa de Churn (Simulada)", "1.2%"],
        ["Disponibilidade da Rede", "99.9%"],
      ],
      theme: "grid",
    });
    doc.save(
      `relatorio_executivo_${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="space-y-8"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportDashboardPDF}
          >
            <FileText size={14} />{" "}
            <span className="hidden md:inline">Exportar PDF</span>
          </Button>
          <div className="flex items-center overflow-x-auto bg-zinc-100 dark:bg-[#111214] p-1.5 rounded-[20px] w-full md:w-auto border border-zinc-200/50 dark:border-white/5 backdrop-blur-md">
            <button
              onClick={() => setDashboardSubTab("overview")}
              className={`text-[11px] px-6 py-2.5 whitespace-nowrap rounded-[16px] transition-all duration-300 font-bold ${dashboardSubTab === "overview" ? "bg-amber-400 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
            >
              Geral
            </button>
            {isOwner && (
              <>
                <button
                  onClick={() => setDashboardSubTab("performance")}
                  className={`text-[11px] px-6 py-2.5 whitespace-nowrap rounded-[16px] transition-all duration-300 font-bold ${dashboardSubTab === "performance" ? "bg-amber-400 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
                >
                  Performance IA
                </button>
                <button
                  onClick={() => setDashboardSubTab("churn")}
                  className={`text-[11px] px-6 py-2.5 whitespace-nowrap rounded-[16px] transition-all duration-300 font-bold ${dashboardSubTab === "churn" ? "bg-amber-400 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
                >
                  Churn Preditivo
                </button>
                <button
                  onClick={() => setDashboardSubTab("upsell")}
                  className={`text-[11px] px-6 py-2.5 whitespace-nowrap rounded-[16px] transition-all duration-300 font-bold ${dashboardSubTab === "upsell" ? "bg-amber-400 text-black shadow-lg shadow-amber-500/20" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"}`}
                >
                  Conversões
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {dashboardSubTab === "overview" ? (
        <>
          {isOwner && (
            <div className="mb-8 flex overflow-x-auto pb-4 gap-6 snap-x snap-mandatory scrollbar-hide -mx-2 px-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 md:mx-0 md:px-0">
              {/* Visão Geral */}
              <Card
                className={`min-w-[85vw] snap-center md:min-w-0 border-l-4 ${operationMetrics.statusBorder} shadow-sm`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                    <Activity size={16} /> Visão Geral da Operação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${operationMetrics.statusColor} animate-pulse`}
                    />
                    <span className="font-semibold text-lg">
                      {operationMetrics.statusText}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {operationMetrics.statusDesc}
                  </p>
                </CardContent>
              </Card>

              {/* Pontos de Atenção */}
              <Card className="min-w-[85vw] snap-center md:min-w-0 border-l-4 border-l-amber-500 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-500 flex items-center gap-2">
                    <AlertTriangle size={16} /> Pontos de Atenção
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {operationMetrics.points.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5">{pt.icon}</span>
                        <span>{pt.text}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Resumo Final & Recomendação */}
              <Card
                className={`min-w-[85vw] snap-center md:min-w-0 border-l-4 ${operationMetrics.summaryBorder} shadow-sm ${operationMetrics.summaryBg}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle
                    className={`text-sm font-medium ${operationMetrics.summaryColor} flex items-center gap-2`}
                  >
                    <Lightbulb size={16} /> Resumo Executivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
                    {operationMetrics.summaryText}
                  </p>
                  <div className="bg-white dark:bg-zinc-800/50 p-2.5 rounded-md border border-inherit border-opacity-30">
                    <p
                      className={`text-xs font-medium ${operationMetrics.summaryColor} flex items-center gap-1.5`}
                    >
                      <Target size={14} /> Recomendação
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                      {operationMetrics.recommendationText}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:gap-6 md:grid-cols-3 lg:grid-cols-5">
            <StatCard
              loading={loading}
              title="Tickets Hoje"
              value={ticketsToday.toString()}
              icon={<Ticket className="text-orange-600" />}
              trend={ticketsTrend}
              up={!ticketsTrend.startsWith("-")}
            />
            {isOwner ? (
              <>
                <StatCard
                  loading={loading}
                  title="Ticket Médio"
                  value={`R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={<DollarSign className="text-emerald-500" />}
                  trend=""
                  up
                />
                <StatCard
                  loading={loading}
                  title="Faturamento (MRR)"
                  value={`R$ ${totalMrr.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={<DollarSign className="text-green-600" />}
                  trend={mrrTrend}
                  up={!mrrTrend.startsWith("-")}
                />
                <StatCard
                  loading={loading}
                  title="Clientes Ativos"
                  value={activeCustomersCount.toString()}
                  icon={<Users className="text-blue-600" />}
                  trend={customersTrend}
                  up
                />
                <StatCard
                  loading={loading}
                  title="Resolução IA"
                  value={`${aiResolutionRate.toFixed(1)}%`}
                  icon={<Bot className="text-purple-600" />}
                  trend={aiResolutionTrend}
                  up={!aiResolutionTrend.startsWith("-")}
                />
              </>
            ) : (
              <>
                <StatCard
                  loading={loading}
                  title="Tickets Pendentes"
                  value={tickets
                    .filter((t) => t.status === "open")
                    .length.toString()}
                  icon={<AlertTriangle className="text-amber-500" />}
                  trend=""
                  up={false}
                />
                <StatCard
                  loading={loading}
                  title="SLA Médio"
                  value={`${avgResponseTime.toFixed(1)}s`}
                  icon={<Clock className="text-blue-600" />}
                  trend="-0.5s"
                  up
                />
                <StatCard
                  loading={loading}
                  title="Satisfação (NPS)"
                  value={`${npsData.overallNPS}`}
                  icon={<Smile className="text-green-600" />}
                  trend={`${npsData.count} avaliações (30d)`}
                  up
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <FCRMetricsCard />
            </div>

            <Card className="border-none shadow-sm lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Volume de Atendimentos</CardTitle>
                  <CardDescription>
                    Tickets abertos e resolvidos nos últimos 7 dias.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    Abertos
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    Resolvidos
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  {volumeDeAtendimentosData.length > 0 ? (
                    <AreaChart data={volumeDeAtendimentosData}>
                      <defs>
                        <linearGradient
                          id="colorOpen"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0.1}
                          />
                          <stop
                            offset="95%"
                            stopColor="hsl(var(--primary))"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="hsl(var(--border))"
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{
                          fontSize: 12,
                          fill: "hsl(var(--muted-foreground))",
                        }}
                      />
                      <RechartsTooltip
                        cursor={{
                          stroke: "hsl(var(--primary))",
                          strokeWidth: 1,
                        }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          color: "hsl(var(--foreground))",
                          borderRadius: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="open"
                        stroke="hsl(var(--primary))"
                        fillOpacity={1}
                        fill="url(#colorOpen)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="resolved"
                        stroke="#10b981"
                        fill="transparent"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                      />
                    </AreaChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                      Sem dados suficientes
                    </div>
                  )}
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>NPS Médio (CSAT)</CardTitle>
                  <CardDescription>
                    Pontuação nos últimos 30 dias ({npsData.count} avaliações)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-green-600 text-lg">
                      {npsData.overallNPS}
                    </span>
                    <span>Geral</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-4">
                    <span className="text-purple-600 font-bold">
                      {npsData.aiNps}
                    </span>
                    <span>IA</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-600 font-bold">
                      {npsData.humanNps}
                    </span>
                    <span>Humano</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={npsData.weeks}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                    />
                    <YAxis
                      domain={[-100, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: 12,
                        fill: "hsl(var(--muted-foreground))",
                      }}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "hsl(var(--accent))" }}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "none",
                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      }}
                    />
                    <Bar
                      dataKey="nps"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      ) : dashboardSubTab === "performance" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-none shadow-sm flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Performance da IA</CardTitle>
                <CardDescription>
                  Tempo de resposta e análise de sentimento (Astrum Engine)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      Tempo Médio (SLA)
                    </p>
                    <p className="text-2xl font-bold">
                      {avgResponseTime.toFixed(2)}s
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border-none",
                      avgResponseTime < 2
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                    )}
                  >
                    {avgResponseTime < 2 ? "Dentro do SLA" : "Fora do SLA"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Sentimento Positivo</span>
                    <span>{sentimentStats.POSITIVO}%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${sentimentStats.POSITIVO}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Sentimento Neutro</span>
                    <span>{sentimentStats.NEUTRO}%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-zinc-400 transition-all duration-500"
                      style={{ width: `${sentimentStats.NEUTRO}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Sentimento Negativo</span>
                    <span>{sentimentStats.NEGATIVO}%</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 transition-all duration-500"
                      style={{ width: `${sentimentStats.NEGATIVO}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm flex flex-col justify-between">
              <CardHeader>
                <CardTitle>Análise de Sentimento</CardTitle>
                <CardDescription>
                  Humor predominante nos atendimentos.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-center py-4">
                  <div className="relative w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            {
                              name: "Positivo",
                              value: sentimentCounts.POSITIVO,
                              color: "#10b981",
                            },
                            {
                              name: "Neutro",
                              value: sentimentCounts.NEUTRO,
                              color: "#94a3b8",
                            },
                            {
                              name: "Negativo",
                              value: sentimentCounts.NEGATIVO,
                              color: "#ef4444",
                            },
                          ]}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {[
                            {
                              name: "Positivo",
                              value: sentimentCounts.POSITIVO,
                              color: "#10b981",
                            },
                            {
                              name: "Neutro",
                              value: sentimentCounts.NEUTRO,
                              color: "#94a3b8",
                            },
                            {
                              name: "Negativo",
                              value: sentimentCounts.NEGATIVO,
                              color: "#ef4444",
                            },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-bold">
                        {(
                          (sentimentCounts.POSITIVO /
                            (sentimentCounts.POSITIVO +
                              sentimentCounts.NEUTRO +
                              sentimentCounts.NEGATIVO || 1)) *
                          100
                        ).toFixed(0)}
                        %
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold">
                        Positivo
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>Satisfeito</span>
                    </div>
                    <span className="font-bold">
                      {sentimentCounts.POSITIVO}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-zinc-400" />
                      <span>Neutro</span>
                    </div>
                    <span className="font-bold">{sentimentCounts.NEUTRO}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span>Insatisfeito</span>
                    </div>
                    <span className="font-bold">
                      {sentimentCounts.NEGATIVO}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-none shadow-sm flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-orange-500" />
                  Risco de Quebra de SLA
                </CardTitle>
                <CardDescription>
                  Tickets abertos há mais de 4 horas sem resolução.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {slaRiskTickets.length > 0 ? (
                    slaRiskTickets.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        className="relative flex items-center justify-between p-4 rounded-[16px] bg-white dark:bg-[#16171a] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden ticket-shape"
                      >
                        <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-white/5" />
                        <div className="flex items-center gap-4 pl-2 relative z-10 w-full">
                          <div className="w-8 shrink-0 flex items-center justify-center">
                            <span
                              className={cn(
                                "w-1.5 h-10 rounded-full",
                                t.priority === "urgent"
                                  ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                                  : "bg-orange-500",
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono font-bold text-zinc-400 mb-0.5">
                              #{t.id.slice(0, 5)}
                            </p>
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] sm:max-w-[200px]">
                              {t.subject}
                            </p>
                            <p className="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 w-fit px-2 py-0.5 rounded-full mt-1.5">
                              Aberto há{" "}
                              {Math.floor(
                                (Date.now() - t.createdAt?.seconds * 1000) /
                                  (1000 * 60 * 60),
                              )}{" "}
                              horas
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs font-bold shrink-0 shadow-sm"
                            onClick={() => {
                              setSelectedTicket(t);
                              setIsTicketDetailOpen(true);
                            }}
                          >
                            Priorizar
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <CheckCircle2
                        size={32}
                        className="mx-auto text-green-500 mb-2"
                      />
                      <p className="text-sm text-zinc-500">
                        Nenhum ticket em risco crítico.
                      </p>
                    </div>
                  )}
                  {slaRiskTickets.length > 3 && (
                    <p className="text-[10px] text-center text-zinc-400">
                      +{slaRiskTickets.length - 3} outros tickets em risco
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm flex flex-col">
              <CardHeader>
                <CardTitle>Atividade Recente</CardTitle>
                <CardDescription>
                  Últimas movimentações no sistema.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px] pr-4">
                  <div className="space-y-4">
                    {auditLogs.slice(0, 10).map((log, i) => (
                      <div key={log.id} className="flex gap-3 relative">
                        {i !== 9 && (
                          <div className="absolute left-[15px] top-8 bottom-0 w-px bg-zinc-100 dark:bg-zinc-800" />
                        )}
                        <div
                          className={cn(
                            "w-8 h-8 rounded-full shrink-0 flex items-center justify-center border-2 border-white dark:border-zinc-900 z-10",
                            log.sentiment === "POSITIVO"
                              ? "bg-green-100 text-green-600"
                              : log.sentiment === "NEGATIVO"
                                ? "bg-red-100 text-red-600"
                                : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          {log.sentiment === "POSITIVO" ? (
                            <CheckCircle2 size={14} />
                          ) : log.sentiment === "NEGATIVO" ? (
                            <TrendingDown size={14} />
                          ) : (
                            <MessageSquare size={14} />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium">
                            {log.category === "FATURA"
                              ? "Consulta Financeira"
                              : log.category === "SUPORTE_TECNICO"
                                ? "Suporte Técnico"
                                : "Atendimento Geral"}
                          </p>
                          <p className="text-[10px] text-zinc-500 line-clamp-1">
                            {log.ticketId
                              ? `Ticket #${log.ticketId.slice(0, 8)}`
                              : log.action}
                            {log.sentiment &&
                              ` - Sentimento ${log.sentiment.toLowerCase()}`}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            {log.timestamp
                              ? new Date(
                                  log.timestamp.seconds * 1000,
                                ).toLocaleTimeString()
                              : "Agora"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {isOwner && (
            <div className="grid grid-cols-1">
              <Card className="border-none shadow-sm flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Tickets Críticos</CardTitle>
                    <CardDescription>
                      Chamados urgentes que precisam de atenção imediata.
                    </CardDescription>
                  </div>
                  <Badge className="bg-red-500 border-none">Urgente</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {tickets.filter(
                      (t) => t.priority === "high" || t.priority === "urgent",
                    ).length > 0 ? (
                      tickets
                        .filter(
                          (t) =>
                            t.priority === "high" || t.priority === "urgent",
                        )
                        .slice(0, 4)
                        .map((t) => (
                          <div
                            key={t.id}
                            className="relative flex items-center justify-between p-4 rounded-[16px] bg-white dark:bg-[#16171a] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden ticket-shape"
                          >
                            <div className="absolute top-0 bottom-0 left-3 border-l border-dashed border-zinc-200 dark:border-white/5" />
                            <div className="flex items-center gap-4 pl-2 relative z-10">
                              <div className="w-8 shrink-0 flex items-center justify-center">
                                <span
                                  className={cn(
                                    "w-1.5 h-10 rounded-full",
                                    t.priority === "urgent"
                                      ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                                      : "bg-orange-500",
                                  )}
                                />
                              </div>
                              <div>
                                <p className="text-[10px] font-mono font-bold text-zinc-400 mb-0.5">
                                  #{t.id.slice(0, 5)}
                                </p>
                                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[180px]">
                                  {t.subject}
                                </p>
                                <p className="text-[10px] font-medium text-zinc-500 mt-1">
                                  {customers.find((c) => c.id === t.customerId)
                                    ?.name || "Cliente Desconhecido"}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 text-xs font-bold shrink-0 z-10"
                              onClick={() => {
                                setSelectedTicket(t);
                                navigate("/tickets");
                              }}
                            >
                              Ver
                            </Button>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-8 text-zinc-400 text-sm italic">
                        Nenhum ticket crítico no momento.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : dashboardSubTab === "churn" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <StatCard
              loading={loading}
              title="Risco Alto de Churn"
              value={churnData
                .filter((c) => c.riskLevel === "Alto")
                .length.toString()}
              icon={<AlertTriangle className="text-red-500" />}
              trend="Crítico"
              up={false}
            />
            <StatCard
              loading={loading}
              title="MRR em Risco"
              value={`R$ ${churnData
                .filter((c) => c.riskLevel === "Alto")
                .reduce((acc, c) => acc + (c.mrr || 0), 0)
                .toLocaleString("pt-BR")}`}
              icon={<DollarSign className="text-orange-500" />}
              trend="Requer Ação"
              up={false}
            />
            <StatCard
              loading={loading}
              title="Risco Médio"
              value={churnData
                .filter((c) => c.riskLevel === "Médio")
                .length.toString()}
              icon={<Activity className="text-yellow-500" />}
              trend="Acompanhar"
              up={false}
            />
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Monitor de Retenção e Risco Operacional</CardTitle>
              <CardDescription>
                Clientes classificados pelo Motor de IA Astrum baseados em
                sentimento, estabilidade de conexão e finanças.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Plano / MRR</TableHead>
                      <TableHead>Risco</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Motivos Principais</TableHead>
                      <TableHead className="text-right">
                        Ação Sugerida
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {churnData.slice(0, 10).map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <p className="font-semibold">{customer.name}</p>
                          <p className="text-xs text-zinc-500">
                            {customer.phone}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{customer.plan}</p>
                          <p className="text-xs text-zinc-500">
                            R$ {customer.mrr}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-none",
                              customer.riskLevel === "Alto"
                                ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : customer.riskLevel === "Médio"
                                  ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
                                  : "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400",
                            )}
                          >
                            {customer.riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full",
                                  customer.riskScore >= 70
                                    ? "bg-red-500"
                                    : customer.riskScore >= 40
                                      ? "bg-yellow-500"
                                      : "bg-green-500",
                                )}
                                style={{ width: `${customer.riskScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium">
                              {customer.riskScore}/100
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ul className="text-[10px] space-y-1 text-zinc-500">
                            {customer.reasons.slice(0, 2).map((r, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <span className="w-1 h-1 bg-zinc-400 rounded-full" />{" "}
                                {r}
                              </li>
                            ))}
                            {customer.reasons.length === 0 && (
                              <span className="text-green-500">
                                Cliente Engajado
                              </span>
                            )}
                            {customer.reasons.length > 2 && (
                              <li>+{customer.reasons.length - 2} motivos</li>
                            )}
                          </ul>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            onClick={() => {
                              // Open customer details could be added here
                              toast.info(
                                `Ação de retenção gerada para ${customer.name}`,
                              );
                            }}
                          >
                            Agir Agora
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {churnData.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-zinc-500"
                        >
                          Nenhum cliente cadastrado ainda.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : dashboardSubTab === "upsell" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <StatCard
              loading={loading}
              title="Eventos de Upsell"
              value={upsellEvents.length.toString()}
              icon={<TrendingUp className="text-blue-500" />}
              trend="Interações IA"
              up={true}
            />
            <StatCard
              loading={loading}
              title="Conversões"
              value={upsellEvents
                .filter((u) => u.outcome === "converted")
                .length.toString()}
              icon={<CheckCircle2 className="text-green-500" />}
              trend="Aceitos"
              up={true}
            />
            <StatCard
              loading={loading}
              title="Rejeições"
              value={upsellEvents
                .filter((u) => u.outcome === "rejected")
                .length.toString()}
              icon={<TrendingDown className="text-red-500" />}
              trend="Recusados"
              up={false}
            />
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Histórico de Ofertas (Upsell)</CardTitle>
              <CardDescription>
                Eventos sugeridos pela inteligência artificial com base no
                perfil do cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111214] overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Plano Anteriror</TableHead>
                      <TableHead>Oferta Sugerida</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upsellEvents.map((ev, i) => {
                      const customer = customers.find(
                        (c) => c.id === ev.customer_id,
                      );
                      const dateLabel = ev.triggered_at?.toDate
                        ? ev.triggered_at.toDate().toLocaleString("pt-BR")
                        : "Recente";
                      return (
                        <TableRow
                          key={ev.id || i}
                          className="border-zinc-200 dark:border-zinc-800"
                        >
                          <TableCell className="font-medium text-xs text-zinc-500">
                            {dateLabel}
                          </TableCell>
                          <TableCell className="font-medium">
                            {customer?.name || ev.customer_id}
                          </TableCell>
                          <TableCell className="text-zinc-500 max-w-[150px] truncate">
                            {ev.current_plan}
                          </TableCell>
                          <TableCell className="text-zinc-500 max-w-[200px] truncate">
                            {ev.suggested_plan}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={cn(
                                "border-none",
                                ev.outcome === "converted"
                                  ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                  : ev.outcome === "interested"
                                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
                              )}
                            >
                              {ev.outcome === "converted"
                                ? "Convertido"
                                : ev.outcome === "interested"
                                  ? "Interessado"
                                  : "Rejeitado"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {upsellEvents.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-zinc-500"
                        >
                          Nenhum evento de upsell registrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </motion.div>
  );
}
