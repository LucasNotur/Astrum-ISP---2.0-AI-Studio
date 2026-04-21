const fs = require('fs');

const appPath = 'src/App.tsx';
const dashboardPath = 'src/pages/DashboardPage.tsx';

let dashContent = fs.readFileSync(dashboardPath, 'utf8');

// We need to add the missing imports
const missingImports = `
import { cn } from "@/src/lib/utils";
import { CheckCircle2, TrendingDown, Smile } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { CardDescription } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/src/components/ui/tooltip";
`;

dashContent = dashContent.replace("import { StatCard } from \"@/src/components/ui/StatCard\";", "import { StatCard } from \"@/src/components/ui/StatCard\";" + missingImports);

// Need to update useAppStore extraction to include setters
dashContent = dashContent.replace("const loading = useAppStore(s => s.loading);", `
  const loading = useAppStore(s => s.loading);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setSelectedTicket = useAppStore(s => s.setSelectedTicket);
  const setIsTicketDetailOpen = useAppStore(s => s.setIsTicketDetailOpen);
`);

// Now the performance vars. Let's write them physically.
const perfVars = `
  const aiResolutionRate = useMemo(() => {
    const resolvedTickets = tickets.filter(t => t.status === 'resolved');
    if (resolvedTickets.length === 0) return 0;
    const aiHandled = resolvedTickets.filter(t => t.aiHandled).length;
    return (aiHandled / resolvedTickets.length) * 100;
  }, [tickets]);

  const aiResolutionTrend = "+2.5%";
  
  const avgResponseTime = useMemo(() => {
    if (auditLogs.length === 0) return 0;
    const total = auditLogs.reduce((acc, log) => acc + (log.responseTime || 0), 0);
    return total / auditLogs.length;
  }, [auditLogs]);

  const sentimentCounts = useMemo(() => {
    const counts = auditLogs.reduce((acc: any, log) => {
      if (log.sentiment) {
        acc[log.sentiment] = (acc[log.sentiment] || 0) + 1;
      }
      return acc;
    }, { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 });
    return counts;
  }, [auditLogs]);

  const sentimentStats = useMemo(() => {
    const logsWithSentiment = auditLogs.filter(l => l.sentiment);
    if (logsWithSentiment.length === 0) return { POSITIVO: 0, NEUTRO: 0, NEGATIVO: 0 };
    const total = logsWithSentiment.length;
    return {
      POSITIVO: Math.round(((sentimentCounts.POSITIVO || 0) / total) * 100),
      NEUTRO: Math.round(((sentimentCounts.NEUTRO || 0) / total) * 100),
      NEGATIVO: Math.round(((sentimentCounts.NEGATIVO || 0) / total) * 100),
    };
  }, [auditLogs, sentimentCounts]);

  const slaRiskTickets = useMemo(() => {
    const now = Date.now();
    return tickets.filter(t => {
      if (t.status === 'resolved') return false;
      const createdAt = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : now;
      const hoursOpen = (now - createdAt) / (1000 * 60 * 60);
      return hoursOpen > 4;
    }).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  }, [tickets]);

  const isDeveloper = currentUserRole === 'admin';
`;

dashContent = dashContent.replace('const isOwner = currentUserRole === \'owner\' || isAstrum;', 'const isOwner = currentUserRole === \'owner\' || isAstrum;\n' + perfVars);

// The DashboardPage uses `<Tooltip>` raw. But it says `<Tooltip>` needs provider. 
// Assuming Tooltip means generic Tooltip if it uses `<Tooltip content="..." >` wait.
// Let's replace `<Tooltip>` with `<RechartsTooltip>` where it's used inside Recharts!
// In Recharts it's `<Tooltip>` usually, but it was renamed to RechartsTooltip in DashboardPage because of conflict!
// Let's replace `<Tooltip ` with `<RechartsTooltip ` in Recharts contexts.
dashContent = dashContent.replace(/<Tooltip /g, "<RechartsTooltip ");
dashContent = dashContent.replace(/<\/Tooltip>/g, "</RechartsTooltip>");
// Wait, maybe there's a Tooltip from shadcn there. I will leave it as RechartsTooltip for now and see if there are errors. Dashboard shouldn't be using shadcn Tooltip unless wrapped in TooltipProvider.

fs.writeFileSync(dashboardPath, dashContent, 'utf8');
console.log('DashboardPage fixed');
