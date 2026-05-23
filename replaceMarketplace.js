const fs = require('fs');
let content = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');

const lines = content.split('\n');
let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<TabsContent value="integrations" className="mt-6">') && lines[i+1] && lines[i+1].includes('<Card className="border-none shadow-sm">')) {
    startLine = i;
  }
  if (lines[i].includes('<TabsContent value="departments" className="mt-6">')) {
    for (let j = i - 1; j > 0; j--) {
      if (lines[j].includes('</TabsContent>')) {
        endLine = j;
        break;
      }
    }
    if (endLine !== -1) break;
  }
}

if (startLine !== -1 && endLine !== -1) {
  console.log(`Found block from ${startLine} to ${endLine}`);
} else {
  console.log("Could not find block");
}
