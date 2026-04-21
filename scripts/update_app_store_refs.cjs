const fs = require('fs');

const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// Replace standard local state definition with global slice
content = content.replace("const [selectedTicket, setSelectedTicket] = useState<any>(null);", "const { selectedTicket, setSelectedTicket } = useAppStore();");
content = content.replace("const [isTicketDetailOpen, setIsTicketDetailOpen] = useState(false);", "const { isTicketDetailOpen, setIsTicketDetailOpen } = useAppStore();");

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.tsx updated to use store for ticket details');
