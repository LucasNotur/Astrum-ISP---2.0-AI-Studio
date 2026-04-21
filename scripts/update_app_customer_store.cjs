const fs = require('fs');

const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Replace local state with store usage for customers
content = content.replace("const [selectedCustomerDetails, setSelectedCustomerDetails] = useState<any>(null);", "const { selectedCustomerDetails, setSelectedCustomerDetails } = useAppStore();");

content = content.replace(/const \[confirmDialog, setConfirmDialog\] = useState[^{]+{([^}]+)}[^)]+\);/, "const { confirmDialog, setConfirmDialog } = useAppStore();");

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx updated confirm and customer states');
