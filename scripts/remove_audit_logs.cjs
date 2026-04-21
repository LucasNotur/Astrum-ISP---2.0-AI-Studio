const fs = require('fs');

const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Replace standard local state definition with global slice for auditLogs
content = content.replace("const [auditLogs, setAuditLogs] = useState<any[]>([]);", "");

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx updated to remove auditLogs useState');
