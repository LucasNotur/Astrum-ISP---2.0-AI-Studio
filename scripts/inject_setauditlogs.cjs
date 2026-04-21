const fs = require('fs');

const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Inside `export default function App() {`
// Add `const { setAuditLogs } = useAppStore();`
const hookInsertionPoint = '  const { theme, setTheme } = useTheme();';
content = content.replace(hookInsertionPoint, hookInsertionPoint + '\n  const setAuditLogs = useAppStore(s => s.setAuditLogs);');

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx injected setAuditLogs');
