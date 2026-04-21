const fs = require('fs');

const appPath = 'src/App.tsx';
const kbPath = 'src/pages/KnowledgeBasePage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

const startKB = content.indexOf("{activeTab === 'kb' && (");
const endKB = content.indexOf("{activeTab === 'ai-config' && (");

if (startKB === -1 || endKB === -1) {
    console.error("KB bounds not found");
    process.exit(1);
}

const kbJSX = content.slice(startKB, endKB);

const cleanKBJSX = kbJSX
    .replace("{activeTab === 'kb' && (", "")
    .trim()
    .replace(/}\)$/, "");

// We need to pass state props to KnowledgeBasePage or import from store.
// In the original, knowledgeBase, handleGenerateAIArticle, handleSeedKB were used.
const newKBComponent = `
import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Search, Sparkles, Plus } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { handleGenerateAIArticle } from '@/src/App';

export function KnowledgeBasePage({ knowledgeBase, handleGenerateAIArticle, handleSeedKB }: any) {
  return (
    ${cleanKBJSX}
  );
}
`;

if (!fs.existsSync('src/pages')) {
    fs.mkdirSync('src/pages', { recursive: true });
}

fs.writeFileSync(kbPath, newKBComponent, 'utf8');

// Now update App.tsx to remove the extracted code
const newAppContent = content.slice(0, startKB) + 
   `{activeTab === 'kb' && <KnowledgeBasePage knowledgeBase={knowledgeBase} handleGenerateAIArticle={handleGenerateAIArticle} handleSeedKB={handleSeedKB} />}\n\n          ` + 
   content.slice(endKB);

let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { KnowledgeBasePage }")) {
   finalAppContent = finalAppContent.replace("import { BillingPage } from './pages/BillingPage';", "import { BillingPage } from './pages/BillingPage';\nimport { KnowledgeBasePage } from './pages/KnowledgeBasePage';");
}

fs.writeFileSync(appPath, finalAppContent, 'utf8');
console.log("KB Extracted Successfully!");
