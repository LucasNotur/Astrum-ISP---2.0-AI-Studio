import fs from 'fs';

// -------------------- SETTINGS PAGE --------------------
let settings = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf-8');

// Replace state and fetch function
settings = settings.replace('  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);\n', '');
settings = settings.replace('  const [loadingAiUsage, setLoadingAiUsage] = useState(false);\n', '');

// Remove fetchAiUsage
const fetchStart = settings.indexOf('  const fetchAiUsage = async () => {\n');
if (fetchStart !== -1) {
  const fetchEnd = settings.indexOf('  };\n', fetchStart) + 5;
  settings = settings.substring(0, fetchStart) + settings.substring(fetchEnd);
}

// Remove useEffect call to fetchAiUsage
settings = settings.replace('  useEffect(() => {\n    fetchAiUsage();\n  }, [activeTab]);\n\n', '');

// Remove TabsTrigger
settings = settings.replace('                  {isAstrum && <TabsTrigger value="ai_usage">Núcleo de IA</TabsTrigger>}\n', '');

// Remove TabsContent (from 821 to 893)
const tabContentStart = settings.indexOf('                {isAstrum && (\n                  <TabsContent value="ai_usage"');
if (tabContentStart !== -1) {
  const tabContentEnd = settings.indexOf('                  </TabsContent>\n                )}\n', tabContentStart) + 52;
  const aiUsageTabContent = settings.substring(tabContentStart, tabContentEnd);
  settings = settings.substring(0, tabContentStart) + settings.substring(tabContentEnd);

  fs.writeFileSync('src/pages/SettingsPage.tsx', settings);

  // -------------------- AI CONFIG PAGE --------------------
  let aiconfig = fs.readFileSync('src/pages/AIConfigPage.tsx', 'utf-8');

  // Add state and import db if not present
  if (!aiconfig.includes('import { db }')) {
    aiconfig = aiconfig.replace("import React from 'react';", "import React, { useState, useEffect } from 'react';\nimport { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';\nimport { db } from '@/src/lib/firebase';");
  } else if (!aiconfig.includes('useState')) {
    aiconfig = aiconfig.replace("import React from 'react';", "import React, { useState, useEffect } from 'react';");
  }

  // Find the exact component function signature
  const componentSigStart = aiconfig.indexOf('export function AIConfigPage({');
  const componentSigEnd = aiconfig.indexOf('}: any) {', componentSigStart);

  // Add states right inside the component
  const hookInjectionPoint = aiconfig.indexOf('  return (', componentSigEnd);
  
  const stateCode = `
  const [aiUsageLogs, setAiUsageLogs] = useState<any[]>([]);
  const [loadingAiUsage, setLoadingAiUsage] = useState(false);

  useEffect(() => {
    const fetchAiUsage = async () => {
      setLoadingAiUsage(true);
      try {
        const q = query(collection(db, "ai_usage"), orderBy("createdAt", "desc"), limit(100));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAiUsageLogs(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingAiUsage(false);
      }
    };
    fetchAiUsage();
  }, []);

`;

  aiconfig = aiconfig.substring(0, hookInjectionPoint) + stateCode + aiconfig.substring(hookInjectionPoint);

  // Add the tab trigger
  aiconfig = aiconfig.replace('<TabsTrigger value="audit" className="whitespace-nowrap">Logs de Auditoria</TabsTrigger>', '<TabsTrigger value="audit" className="whitespace-nowrap">Logs de Auditoria</TabsTrigger>\n                  <TabsTrigger value="ai_usage" className="whitespace-nowrap">Custos & Uso de Tokens</TabsTrigger>');

  // Add the tab content
  const tabAuditEnd = aiconfig.indexOf('</TabsContent>', aiconfig.indexOf('<TabsContent value="audit">'));
  const nextTabsContentTarget = aiconfig.indexOf('</div>\n              </Tabs>\n', tabAuditEnd);

  // Clean the aiUsageTabContent slightly to not depend on isAstrum
  let cleanAiUsageTabContent = aiUsageTabContent.replace('{isAstrum && (\n', '').replace('                )}\n', '');
  cleanAiUsageTabContent = cleanAiUsageTabContent.replace('<CardTitle>Consumo de IA</CardTitle>', '<CardTitle>Consumo de IA e Custos</CardTitle>');

  aiconfig = aiconfig.substring(0, nextTabsContentTarget) + cleanAiUsageTabContent + aiconfig.substring(nextTabsContentTarget);

  fs.writeFileSync('src/pages/AIConfigPage.tsx', aiconfig);
  console.log('Moved AI usage to AI Config');
} else {
  console.log('Could not find AI Usage Tab Content in SettingsPage');
}
