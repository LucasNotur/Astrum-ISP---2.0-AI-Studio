const fs = require('fs');
const files = [
  'src/pages/KnowledgeBasePage.tsx',
  'src/pages/AIConfigPage.tsx',
  'src/pages/TeamPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/pages/InventoryPage.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Find the last occurrence of )} and remove it
  const lastIndex = content.lastIndexOf(')}');
  if (lastIndex !== -1 && lastIndex > content.length - 20) {
    content = content.slice(0, lastIndex) + content.slice(lastIndex + 2);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Fixed " + file);
  }
}
