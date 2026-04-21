const fs = require('fs');

const appPath = 'src/App.tsx';
const compPath = 'src/pages/SettingsPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

const startIdx = content.indexOf("{activeTab === 'settings' && (");
const endIdx = content.indexOf("{activeTab === 'inventory' && (");

if (startIdx === -1 || endIdx === -1) {
    console.error("Bounds not found");
    process.exit(1);
}

const jsxBlock = content.slice(startIdx, endIdx);

const cleanJSX = jsxBlock
    .replace("{activeTab === 'settings' && (", "")
    .trim()
    .replace(/}\)$/, "");

const newComponent = `
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Save, Bug, Database, BellRing } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage({ 
  integrationKeys, 
  setIntegrationKeys,
  isSavingKeys,
  handleSaveKeys,
  isDeveloper,
  seedSystem,
  seedTicketsAndLogs,
  seedServiceOrdersAndTechnicians,
  isSeeding
}: any) {
  return (
    ${cleanJSX}
  );
}
`;

fs.writeFileSync(compPath, newComponent, 'utf8');

const newAppContent = content.slice(0, startIdx) + 
   `{activeTab === 'settings' && <SettingsPage 
      integrationKeys={integrationKeys}
      setIntegrationKeys={setIntegrationKeys}
      isSavingKeys={isSavingKeys}
      handleSaveKeys={handleSaveKeys}
      isDeveloper={isDeveloper}
      seedSystem={seedSystem}
      seedTicketsAndLogs={seedTicketsAndLogs}
      seedServiceOrdersAndTechnicians={seedServiceOrdersAndTechnicians}
      isSeeding={isSeeding}
  />}\n\n          ` + 
   content.slice(endIdx);

let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { SettingsPage }")) {
   finalAppContent = finalAppContent.replace("import { TeamPage } from './pages/TeamPage';", "import { TeamPage } from './pages/TeamPage';\nimport { SettingsPage } from './pages/SettingsPage';");
}
fs.writeFileSync(appPath, finalAppContent, 'utf8');
console.log("Settings Extracted Successfully!");
