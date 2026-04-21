const fs = require('fs');

const appPath = 'src/App.tsx';
const compPath = 'src/pages/TeamPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

const startIdx = content.indexOf("{activeTab === 'team' && (");
const endIdx = content.indexOf("{activeTab === 'settings' && (");

if (startIdx === -1 || endIdx === -1) {
    console.error("Bounds not found");
    process.exit(1);
}

const jsxBlock = content.slice(startIdx, endIdx);

const cleanJSX = jsxBlock
    .replace("{activeTab === 'team' && (", "")
    .trim()
    .replace(/}\)$/, "");

const newComponent = `
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/src/components/ui/avatar";
import { Search, Plus, Mail, Activity, Phone, Trash2, Link2, ShieldAlert } from 'lucide-react';

export function TeamPage({ 
  teamMembers, 
  handleDeleteTeamMember, 
  setIsTeamMemberDialogOpen,
  teamPerformanceData,
  integrationKeys,
  setEvoStatus,
  evoStatus,
  isFetchingQr,
  evoQrCode,
  fetchEvolutionQrCode,
  newTechPhone,
  setNewTechPhone,
  newTechName,
  setNewTechName,
  isFetchingTechName,
  isAddingTech,
  setIsAddingTech,
  handleAddTechnician
}: any) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    ${cleanJSX}
  );
}
`;

fs.writeFileSync(compPath, newComponent, 'utf8');

const newAppContent = content.slice(0, startIdx) + 
   `{activeTab === 'team' && <TeamPage 
      teamMembers={teamMembers}
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
  />}\n\n          ` + 
   content.slice(endIdx);

let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { TeamPage }")) {
   finalAppContent = finalAppContent.replace("import { AIConfigPage } from './pages/AIConfigPage';", "import { AIConfigPage } from './pages/AIConfigPage';\nimport { TeamPage } from './pages/TeamPage';");
}
fs.writeFileSync(appPath, finalAppContent, 'utf8');
console.log("Team Extracted Successfully!");
