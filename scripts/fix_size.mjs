import fs from 'fs';
const file = 'src/components/layout/Sidebar.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/size=\{22\}/g, "size={24}");
fs.writeFileSync(file, content);
