const fs = require('fs');

const sidebarPath = 'src/components/layout/Sidebar.tsx';
let sidebarParams = fs.readFileSync(sidebarPath, 'utf8');

// 1. Ensure hooks are imported
if (!sidebarParams.includes("import { useNavigate, useLocation }")) {
  sidebarParams = sidebarParams.replace(
    "import { useAppStore, canAccess } from '@/src/store/useAppStore';",
    "import { useAppStore, canAccess } from '@/src/store/useAppStore';\nimport { useNavigate, useLocation } from 'react-router-dom';"
  );
}

// 2. Insert hooks where useAppStore is structured
sidebarParams = sidebarParams.replace(
    "const { \n    isSidebarCollapsed, setIsSidebarCollapsed, \n    activeTab, setActiveTab, currentUserRole, setCurrentUserRole, user\n  } = useAppStore();",
    "const { \n    isSidebarCollapsed, setIsSidebarCollapsed, \n    currentUserRole, setCurrentUserRole, user\n  } = useAppStore();\n  const navigate = useNavigate();\n  const location = useLocation();\n  const currentPath = location.pathname.substring(1) || 'dashboard';"
);

// Note: If previous replace didn't work because of spacing:
if (sidebarParams.includes("activeTab, setActiveTab,")) {
    console.log("Replacing custom spacing...");
    sidebarParams = sidebarParams.replace(
        "    activeTab, setActiveTab, currentUserRole, setCurrentUserRole, user\n  } = useAppStore();",
        "    currentUserRole, setCurrentUserRole, user\n  } = useAppStore();\n  const navigate = useNavigate();\n  const location = useLocation();\n  const currentPath = location.pathname.substring(1) || 'dashboard';"
    );
}

// Replace NavItem active/onClick
sidebarParams = sidebarParams.replace(/active=\{activeTab === '([^']+)'\}/g, "active={currentPath === '$1'}");
sidebarParams = sidebarParams.replace(/onClick=\{\(\) => setActiveTab\('([^']+)'\)\}/g, "onClick={() => navigate('/$1')}");

fs.writeFileSync(sidebarPath, sidebarParams, 'utf8');
console.log("Sidebar fixed.");
