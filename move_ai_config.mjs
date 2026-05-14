import fs from 'fs';

const settingsStr = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');

// Find TabsContent value="ai"
const tabStart = settingsStr.indexOf('<TabsContent value="ai"');
// Find the next TabsContent
const tabEnd = settingsStr.indexOf('<TabsContent value="whatsapp"', tabStart);

const extractedContent = settingsStr.slice(tabStart, tabEnd);
// Replace value="ai" with value="models"
let newContent = extractedContent.replace('<TabsContent value="ai"', '<TabsContent value="models"');

// Insert newContent into AIConfigPage.tsx
let aiConfigStr = fs.readFileSync('src/pages/AIConfigPage.tsx', 'utf8');
const orchestratorStart = aiConfigStr.indexOf('<TabsContent value="orchestrator"');
aiConfigStr = aiConfigStr.slice(0, orchestratorStart) + newContent + '\n' + aiConfigStr.slice(orchestratorStart);

// Remove the `TabsTrigger value="ai"` from SettingsPage
let modifiedSettings = settingsStr.replace(/<TabsTrigger value="ai">[^<]+<\/TabsTrigger>\n?/g, '');
// Remove the extracted content from SettingsPage
modifiedSettings = modifiedSettings.replace(extractedContent, '');

// Also add a TabsTrigger value="models" in AIConfigPage
const triggerStart = aiConfigStr.indexOf('<TabsTrigger value="orchestrator"');
aiConfigStr = aiConfigStr.slice(0, triggerStart) + '<TabsTrigger value="models" className="whitespace-nowrap">Modelos de IA</TabsTrigger>\n                  ' + aiConfigStr.slice(triggerStart);

fs.writeFileSync('src/pages/AIConfigPage.tsx', aiConfigStr);
fs.writeFileSync('src/pages/SettingsPage.tsx', modifiedSettings);
console.log('Moved AI Config to AIConfigPage');
