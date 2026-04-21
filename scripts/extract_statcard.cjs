const fs = require('fs');
const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// The StatCard should be removed
const startStat = content.indexOf('function StatCard({');
if (startStat !== -1) {
    const endStat = content.indexOf('}\n\nfunction TicketColumn', startStat);
    if (endStat !== -1) {
        content = content.slice(0, startStat) + content.slice(endStat + 2); // +2 to remove '}\n\n'
    } else {
        // Last component fallback
        const altEndStat = content.indexOf('}', startStat);
        if (altEndStat !== -1) {
            content = content.slice(0, startStat);
        }
    }
}

// Ensure the import exists
if (!content.includes("import { StatCard }")) {
    content = content.replace("import { AppLayout }", "import { AppLayout };\nimport { StatCard } from './components/ui/StatCard';");
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx stripped and updated with StatCard import');
