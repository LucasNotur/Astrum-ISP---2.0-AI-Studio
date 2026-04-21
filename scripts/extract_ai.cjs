const fs = require('fs');

const appPath = 'src/App.tsx';
const compPath = 'src/pages/AIConfigPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

const startIdx = content.indexOf("{activeTab === 'ai-config' && (");
const endIdx = content.indexOf("{activeTab === 'team' && (");

if (startIdx === -1 || endIdx === -1) {
    console.error("Bounds not found");
    process.exit(1);
}

const jsxBlock = content.slice(startIdx, endIdx);

const cleanJSX = jsxBlock
    .replace("{activeTab === 'ai-config' && (", "")
    .trim()
    .replace(/}\)$/, "");

const newComponent = `
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { Bot, Sparkles, Plus, Edit2, Trash2, Download, Database, Upload } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkflowVisualizer } from '@/src/components/WorkflowVisualizer';
import { cn } from '@/src/lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function AIConfigPage({ 
  aiPrompts, 
  setAiPrompts,
  isSavingPrompts,
  handleSavePrompts,
  testAgentCategory,
  setTestAgentCategory,
  testAgentResponse,
  setTestAgentResponse,
  testAgentMessage,
  setTestAgentMessage,
  setIsTestAgentOpen,
  sentimentChartData,
  auditLogs,
  handleExportCSV,
  knowledgeBase,
  setEditingKB,
  setNewKB,
  setIsKBDialogOpen,
  setIsPdfDialogOpen,
  setIsMiningDialogOpen,
  isDeveloper,
  handleSeedKB,
  isSeeding,
  handleDeleteKB
}: any) {
  return (
    ${cleanJSX}
  );
}
`;

fs.writeFileSync(compPath, newComponent, 'utf8');

const newAppContent = content.slice(0, startIdx) + 
   `{activeTab === 'ai-config' && <AIConfigPage 
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
  />}\n\n          ` + 
   content.slice(endIdx);

let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { AIConfigPage }")) {
   finalAppContent = finalAppContent.replace("import { KnowledgeBasePage } from './pages/KnowledgeBasePage';", "import { KnowledgeBasePage } from './pages/KnowledgeBasePage';\nimport { AIConfigPage } from './pages/AIConfigPage';");
}
fs.writeFileSync(appPath, finalAppContent, 'utf8');
console.log("AI Config Extracted Successfully!");
