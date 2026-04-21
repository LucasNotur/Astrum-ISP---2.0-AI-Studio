const fs = require('fs');

// TEAM PAGE
let teamContent = fs.readFileSync('src/pages/TeamPage.tsx', 'utf8');
const teamImports = `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { cn } from "@/src/lib/utils";
import { Star } from "lucide-react";
`;
teamContent = teamContent.replace("import { motion } from 'framer-motion';", "import { motion } from 'framer-motion';\n" + teamImports);
const teamPropsOld = "{ teamMembers, handleDeleteTeamMember, setIsTeamMemberDialogOpen, teamPerformanceData }: any";
const teamPropsNew = "{ teamMembers, handleDeleteTeamMember, setIsTeamMemberDialogOpen, teamPerformanceData, setSelectedTeamMember }: any";
teamContent = teamContent.replace(teamPropsOld, teamPropsNew);
fs.writeFileSync('src/pages/TeamPage.tsx', teamContent, 'utf8');


// SETTINGS PAGE
let settingsContent = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');
const settingsImports = `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Ticket, Book, Globe, Clock, MessageSquare, Phone, Briefcase, Bot, Map as MapIcon, CreditCard, Plus, Trash2, Users } from "lucide-react";
`;
settingsContent = settingsContent.replace("import { motion } from 'framer-motion';", "import { motion } from 'framer-motion';\n" + settingsImports);
// Fix the Map element collision with MapIcon
settingsContent = settingsContent.replace(/<Map /g, "<MapIcon ");

// Add the missing props
const settingsPropsOld = "{ integrationKeys, setIntegrationKeys, isSavingKeys, handleSaveKeys, isDeveloper, seedSystem, seedTicketsAndLogs, seedServiceOrdersAndTechnicians, isSeeding }: any";
const settingsPropsNew = "{ integrationKeys, setIntegrationKeys, isSavingKeys, handleSaveKeys, isDeveloper, seedSystem, seedTicketsAndLogs, seedServiceOrdersAndTechnicians, isSeeding, isAstrum, companySettings, setCompanySettings, handleSeedSystem, customers, handleSeedKB, evoStatus, fetchEvolutionQrCode, isFetchingQr, evoQrCode, setIsAddingTech, isAddingTech, newTechPhone, setNewTechPhone, isFetchingTechName, newTechName, setNewTechName, handleAddTechnician, technicians, setTechnicians, updateTechnician, setIsSavingKeys, saveIntegrationKeys, setIsTeamMemberDialogOpen, teamMembers, handleDeleteTeamMember }: any";
settingsContent = settingsContent.replace(settingsPropsOld, settingsPropsNew);
fs.writeFileSync('src/pages/SettingsPage.tsx', settingsContent, 'utf8');

console.log("Done injecting props");
