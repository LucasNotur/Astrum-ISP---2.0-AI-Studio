const fs = require('fs');

const appPath = 'src/App.tsx';
const dashboardPath = 'src/pages/DashboardPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

// We need to extract the dashboard JSX
// It starts with `{activeTab === 'dashboard' && (`
const startDash = content.indexOf("{activeTab === 'dashboard' && (");
// It ends right before `{activeTab === 'customers' && (`
const endDash = content.indexOf("{activeTab === 'customers' && (");

if (startDash === -1 || endDash === -1) {
    console.error("Dashboard bounds not found");
    process.exit(1);
}

const dashboardJSX = content.slice(startDash, endDash);

// The dashboard JSX has this wrapper:
//               {activeTab === 'dashboard' && (
//                 <motion.div ...>
// ...
//                 </motion.div>
//               )}
// We need to unwrap it, or just return the motion.div.

const cleanDashboardJSX = dashboardJSX
    .replace("{activeTab === 'dashboard' && (", "")
    .trim()
    .replace(/}\)$/, ""); // remove the closing )}

// Now we need the computations. 
// Let's copy them manually in the react component string to avoid parsing nightmares.

const newDashboardComponent = `
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { StatCard } from "@/src/components/ui/StatCard";
import { 
  FileText, Activity, AlertTriangle, Lightbulb, Target, 
  Ticket, DollarSign, Users, Zap, TrendingUp, Filter, Bot, MessageSquare, Clock 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  BarChart, Bar, ScatterChart, Scatter, ZAxis, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function DashboardPage() {
  const loading = useAppStore(s => s.loading);
  const customers = useAppStore(s => s.customers);
  const tickets = useAppStore(s => s.tickets);
  const invoices = useAppStore(s => s.invoices);
  const auditLogs = useAppStore(s => s.auditLogs || []); // Not in store yet, fallback to []
  const currentUserRole = useAppStore(s => s.currentUserRole);
  
  const isAstrum = currentUserRole === 'admin';
  const isOwner = currentUserRole === 'owner' || isAstrum;

  const [dashboardSubTab, setDashboardSubTab] = useState<'overview' | 'performance'>('overview');

  const totalMrr = useMemo(() => {
    return customers.reduce((acc, c) => acc + (c.status === 'active' ? (c.mrr || 0) : 0), 0);
  }, [customers]);

  const activeCustomersCount = useMemo(() => {
    return customers.filter(c => c.status === 'active').length;
  }, [customers]);

  const ticketsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tickets.filter(t => {
      let ticketDate = new Date();
      if (t.createdAt?.toDate) ticketDate = t.createdAt.toDate();
      else if (t.createdAt?.seconds) ticketDate = new Date(t.createdAt.seconds * 1000);
      return ticketDate >= today;
    }).length;
  }, [tickets]);

  const ticketsTrend = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const countToday = tickets.filter(t => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= today;
    }).length;
    const countYesterday = tickets.filter(t => {
      let d = new Date();
      if (t.createdAt?.toDate) d = t.createdAt.toDate();
      else if (t.createdAt?.seconds) d = new Date(t.createdAt.seconds * 1000);
      return d >= yesterday && d < today;
    }).length;
    if (countYesterday === 0) return countToday > 0 ? \`+\${countToday}\` : "0%";
    const diff = ((countToday - countYesterday) / countYesterday) * 100;
    return \`\${diff >= 0 ? '+' : ''}\${diff.toFixed(1)}%\`;
  }, [tickets]);

  const dynamicMrrData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      last12Months.push({ name: months[d.getMonth()], monthIndex: d.getMonth(), year: d.getFullYear(), value: 0 });
    }
    invoices.forEach(inv => {
      if (inv.status !== 'paid') return;
      const date = inv.dueDate?.seconds ? new Date(inv.dueDate.seconds * 1000) : null;
      if (!date) return;
      const monthData = last12Months.find(m => m.monthIndex === date.getMonth() && m.year === date.getFullYear());
      if (monthData) monthData.value += (inv.amount || 0);
    });
    return last12Months;
  }, [invoices]);

  const mrrTrend = "+5.2%";
  const customersTrend = "+12";
  const openTickets = tickets.filter(t => t.status !== 'resolved').length;
  const openTicketsTrend = "-2";
  const satisfaction = "98%";
  const satisfactionTrend = "+1.5%";
  const avgResolutionTime = "45m";
  const aiPerformanceData = [
    { hour: '00h', volume: 10, aiHandled: 9 },
    { hour: '04h', volume: 5, aiHandled: 5 },
    { hour: '08h', volume: 45, aiHandled: 38 },
    { hour: '12h', volume: 80, aiHandled: 65 },
    { hour: '16h', volume: 60, aiHandled: 50 },
    { hour: '20h', volume: 30, aiHandled: 28 },
  ];
  const financialData = dynamicMrrData.map(d => ({
      name: d.name,
      receita: d.value > 0 ? d.value : totalMrr * (0.9 + Math.random() * 0.2), // Mock if empty
      previsao: d.value > 0 ? d.value * 1.1 : totalMrr * (1.1 + Math.random() * 0.1)
  }));
  const performanceScatterData = auditLogs.map(log => ({
      responseTime: log.responseTime || 0,
      sentimentScore: log.sentiment === 'POSITIVO' ? 90 : log.sentiment === 'NEUTRO' ? 50 : 10,
      id: log.id
  }));
  const categoryEfficiencyData = [
      { subject: 'Suporte', A: 90, fullMark: 100 },
      { subject: 'Financeiro', A: 95, fullMark: 100 },
      { subject: 'Vendas', A: 85, fullMark: 100 },
      { subject: 'Retenção', A: 75, fullMark: 100 }
  ];

  const handleExportDashboardPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Relatorio Executivo - Astrum ISP', 14, 22);
    doc.setFontSize(12);
    doc.text(\`Gerado em: \${new Date().toLocaleDateString()}\`, 14, 30);
    autoTable(doc, {
      startY: 40,
      head: [['Metrica', 'Valor atual']],
      body: [
        ['Total MRR', \`R$ \${totalMrr.toLocaleString('pt-BR')}\`],
        ['Clientes Ativos', activeCustomersCount.toString()],
        ['Tickets Hoje', ticketsToday.toString()],
        ['Tickets em Aberto', openTickets.toString()],
        ['Taxa de Churn (Simulada)', '1.2%'],
        ['Disponibilidade da Rede', '99.9%']
      ],
      theme: 'grid'
    });
    doc.save(\`relatorio_executivo_\${new Date().toISOString().split('T')[0]}.pdf\`);
  };

  return (
    ${cleanDashboardJSX}
  );
}
`;

if (!fs.existsSync('src/pages')) {
    fs.mkdirSync('src/pages', { recursive: true });
}

fs.writeFileSync(dashboardPath, newDashboardComponent, 'utf8');

// Now update App.tsx to remove the extracted code
const newAppContent = content.slice(0, startDash) + 
   `{activeTab === 'dashboard' && <DashboardPage />}\n              ` + 
   content.slice(endDash);

// also add the import
let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { DashboardPage }")) {
   finalAppContent = finalAppContent.replace("import { StatCard }", "import { StatCard }\nimport { DashboardPage } from './pages/DashboardPage';");
}

fs.writeFileSync(appPath, finalAppContent, 'utf8');

console.log("Dashboard Extracted Successfully!");
