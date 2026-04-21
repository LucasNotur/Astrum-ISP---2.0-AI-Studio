const fs = require('fs');

async function main() {
    const appPath = 'src/App.tsx';
    let app = fs.readFileSync(appPath, 'utf8');

    // 1. Add imports to App.tsx
    app = app.replace(
        "import { \n  LayoutDashboard,",
        "import { Routes, Route, Navigate, useLocation } from 'react-router-dom';\nimport { \n  LayoutDashboard,"
    );
    app = app.replace(
        "import { \r\n  LayoutDashboard,",
        "import { Routes, Route, Navigate, useLocation } from 'react-router-dom';\nimport { \n  LayoutDashboard,"
    );
    if (!app.includes("import { Routes")) {
        app = app.replace(
            "import { \n  LayoutDashboard",
            "import { Routes, Route, Navigate, useLocation } from 'react-router-dom';\nimport { \n  LayoutDashboard"
        );
    }
    // Try catching it another way if previous failed
    if (!app.includes("import { Routes")) {
        app = app.replace(
            "import { useAppStore } from './store/useAppStore';",
            "import { useAppStore } from './store/useAppStore';\nimport { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';"
        );
    }

    // 2. Add location parsing inside App component
    app = app.replace(
        "const { user, isSidebarCollapsed, activeTab, currentUserRole } = useAppStore();",
        "const { user, isSidebarCollapsed, currentUserRole } = useAppStore();\n  const location = useLocation();\n  const navigate = useNavigate();\n  const activeTab = location.pathname.substring(1) || 'dashboard';"
    );
    
    // We also remove activeTab and setActiveTab from destructuring if they exist individually? 
    app = app.replace("const { \n    activeTab", "const { \n    ");

    // Replace setActiveTab calls with navigate
    app = app.replace(/setActiveTab\('([^']+)'\)/g, "navigate('/$1')");

    // 3. Replace logical && with <Route>
    app = app.replace(
        "{!canAccess(activeTab) ? (",
        "{!canAccess(currentUserRole, activeTab) ? ("
    );

    // Replace the `<>` wrapper with `<Routes>`
    app = app.replace(
        "          ) : (\n            <>\n              {activeTab === 'dashboard' && <DashboardPage />}",
        "          ) : (\n            <Routes>\n              <Route path=\"/dashboard\" element={<DashboardPage />} />\n              <Route path=\"/\" element={<Navigate to=\"/dashboard\" replace />} />"
    );

    app = app.replace("{activeTab === 'customers' && <CustomersPage />}", "<Route path=\"/customers\" element={<CustomersPage />} />");
    app = app.replace("{activeTab === 'tickets' && <TicketsPage onNewTicketClick={() => setIsNewTicketDialogOpen(true)} />}", "<Route path=\"/tickets\" element={<TicketsPage onNewTicketClick={() => setIsNewTicketDialogOpen(true)} />} />");
    app = app.replace("{isDeveloper && activeTab === 'os' && <ServiceOrdersPage />}", "<Route path=\"/os\" element={isDeveloper ? <ServiceOrdersPage /> : <Navigate to=\"/dashboard\" />} />");
    app = app.replace("{activeTab === 'chat' && <ChatPage />}", "<Route path=\"/chat\" element={<ChatPage />} />");
    app = app.replace("{activeTab === 'map' && <MapPage />}", "<Route path=\"/map\" element={<MapPage />} />");
    app = app.replace("{activeTab === 'billing' && <BillingPage />}", "<Route path=\"/billing\" element={<BillingPage />} />");
    app = app.replace("{activeTab === 'kb' && <KnowledgeBasePage knowledgeBase={knowledgeBase} handleGenerateAIArticle={handleGenerateAIArticle} handleSeedKB={handleSeedKB} />}", "<Route path=\"/kb\" element={<KnowledgeBasePage knowledgeBase={knowledgeBase} handleGenerateAIArticle={handleGenerateAIArticle} handleSeedKB={handleSeedKB} />} />");

    // Multi-line replacements for the remaining pages
    app = app.replace(/\{activeTab === 'ai-config' && <AIConfigPage([\s\S]*?)\/>\}/g, '<Route path="/ai-config" element={<AIConfigPage$1/>} />');
    app = app.replace(/\{activeTab === 'team' && <TeamPage([\s\S]*?)\/>\}/g, '<Route path="/team" element={<TeamPage$1/>} />');
    app = app.replace(/\{activeTab === 'settings' && <SettingsPage([\s\S]*?)\/>\}/g, '<Route path="/settings" element={<SettingsPage$1/>} />');
    
    // Inventory is a bit complex because it's rendering inline as motion.div, but wait! We extracted Inventory!
    // Wait, did we extract Inventory? Let's check. 
    // In the snippet, activeTab === 'inventory' was STILL rendering motion.div inline! Oh! The previous script failed on inventory closing bracket or something!
    // No, wait, let's wrap it in Route path=/inventory.
    app = app.replace(/\{activeTab === 'inventory' && \([\s\S]*?<motion\.div([\s\S]*?)<\/motion\.div>\s*\)\}/g, '<Route path="/inventory" element={<motion.div$1</motion.div>} />');

    // Close Routes
    app = app.replace(
        "            </>\n          )}\n        </AnimatePresence>",
        "            </Routes>\n          )}\n        </AnimatePresence>"
    );
    app = app.replace(
        "            </>\r\n          )}\r\n        </AnimatePresence>",
        "            </Routes>\n          )}\n        </AnimatePresence>"
    );

    fs.writeFileSync(appPath, app, 'utf8');

    // ==== SIDEBAR ====
    const sidebarPath = 'src/components/layout/Sidebar.tsx';
    let sidebar = fs.readFileSync(sidebarPath, 'utf8');

    sidebar = sidebar.replace(
        "import { useAppStore, canAccess } from '@/src/store/useAppStore';",
        "import { useAppStore, canAccess } from '@/src/store/useAppStore';\nimport { useNavigate, useLocation } from 'react-router-dom';"
    );

    sidebar = sidebar.replace(
        "const { \n    isSidebarCollapsed, setIsSidebarCollapsed, \n    activeTab, setActiveTab, currentUserRole, setCurrentUserRole, user\n  } = useAppStore();",
        "const { \n    isSidebarCollapsed, setIsSidebarCollapsed, \n    currentUserRole, setCurrentUserRole, user\n  } = useAppStore();\n  const navigate = useNavigate();\n  const location = useLocation();\n  const currentPath = location.pathname.substring(1) || 'dashboard';"
    );
    sidebar = sidebar.replace(
        "const { \r\n    isSidebarCollapsed, setIsSidebarCollapsed, \r\n    activeTab, setActiveTab, currentUserRole, setCurrentUserRole, user\r\n  } = useAppStore();",
        "const { \n    isSidebarCollapsed, setIsSidebarCollapsed, \n    currentUserRole, setCurrentUserRole, user\n  } = useAppStore();\n  const navigate = useNavigate();\n  const location = useLocation();\n  const currentPath = location.pathname.substring(1) || 'dashboard';"
    );
    
    // Fallback if formatting is different
    sidebar = sidebar.replace(/activeTab, setActiveTab,\s*/g, "");

    sidebar = sidebar.replace(/active=\{activeTab === '([^']+)'\}/g, "active={currentPath === '$1'}");
    sidebar = sidebar.replace(/onClick=\{\(\) => setActiveTab\('([^']+)'\)\}/g, "onClick={() => navigate('/$1')}");

    fs.writeFileSync(sidebarPath, sidebar, 'utf8');

    console.log('Router refactoring complete.');
}

main();
