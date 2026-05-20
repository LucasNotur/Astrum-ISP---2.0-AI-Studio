import fs from 'fs';
let code = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
code = code.replace(/canAccess\(currentUserRole, /g, 'hasAccess(');
code = code.replace("const isDeveloper =", "const hasAccess = (tab: string) => canAccess(currentUserRole, tab, companySettings?.rolePermissions);\n  const isDeveloper =");
fs.writeFileSync('src/components/layout/Sidebar.tsx', code);
