const fs = require('fs');
let app = fs.readFileSync('src/App.tsx', 'utf8');

app = app.replace(/\{activeTab === 'ai-config' && <AIConfigPage([\s\S]*?)\/>\}/g, '<Route path="/ai-config" element={<AIConfigPage$1/>} />');
app = app.replace(/\{activeTab === 'team' && <TeamPage([\s\S]*?)\/>\}/g, '<Route path="/team" element={<TeamPage$1/>} />');
app = app.replace(/\{activeTab === 'settings' && <SettingsPage([\s\S]*?)\/>\}/g, '<Route path="/settings" element={<SettingsPage$1/>} />');

fs.writeFileSync('src/App.tsx', app, 'utf8');
