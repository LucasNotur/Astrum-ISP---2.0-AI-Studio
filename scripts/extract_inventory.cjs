const fs = require('fs');

const appPath = 'src/App.tsx';
const compPath = 'src/pages/InventoryPage.tsx';

let content = fs.readFileSync(appPath, 'utf8');

const startIdx = content.indexOf("{activeTab === 'inventory' && (");
// The end of the main section is `</main>`
const endIdx = content.indexOf("</main>");

if (startIdx === -1 || endIdx === -1) {
    console.error("Bounds not found");
    process.exit(1);
}

const jsxBlock = content.slice(startIdx, endIdx);

const cleanJSX = jsxBlock
    .replace("{activeTab === 'inventory' && (", "")
    .trim()
    .replace(/}\)$/, "");

const newComponent = `
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Search, Plus, Package, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, AlertTriangle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export function InventoryPage({ 
  inventory, 
  inventoryCategoryData,
  setIsNewItemDialogOpen,
  setIsInventoryDialogOpen,
  setSelectedInventoryItem,
  handleDeleteItem
}: any) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    ${cleanJSX}
  );
}
`;

fs.writeFileSync(compPath, newComponent, 'utf8');

const newAppContent = content.slice(0, startIdx) + 
   `{activeTab === 'inventory' && <InventoryPage 
      inventory={inventory}
      inventoryCategoryData={inventoryCategoryData}
      setIsNewItemDialogOpen={setIsNewItemDialogOpen}
      setIsInventoryDialogOpen={setIsInventoryDialogOpen}
      setSelectedInventoryItem={setSelectedInventoryItem}
      handleDeleteItem={handleDeleteItem}
  />}\n\n        ` + 
   content.slice(endIdx);

let finalAppContent = newAppContent;
if (!finalAppContent.includes("import { InventoryPage }")) {
   finalAppContent = finalAppContent.replace("import { SettingsPage } from './pages/SettingsPage';", "import { SettingsPage } from './pages/SettingsPage';\nimport { InventoryPage } from './pages/InventoryPage';");
}
fs.writeFileSync(appPath, finalAppContent, 'utf8');
console.log("Inventory Extracted Successfully!");
