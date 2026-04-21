const fs = require('fs');

const path = 'src/pages/DashboardPage.tsx';
let dashContent = fs.readFileSync(path, 'utf8');

dashContent = dashContent.replace("import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';", "import { PieChart, Pie, Cell } from 'recharts';");

fs.writeFileSync(path, dashContent, 'utf8');
console.log('Fixed duplicate import');
