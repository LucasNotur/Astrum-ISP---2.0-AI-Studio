const fs = require('fs');

const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Inside `export default function App() {`
const searchStr = '  const setAuditLogs = useAppStore(s => s.setAuditLogs);';
content = content.replace(searchStr, searchStr + '\n  const auditLogs = useAppStore(s => s.auditLogs);');

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx injected auditLogs');
