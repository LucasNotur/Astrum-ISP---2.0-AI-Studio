import fs from 'fs';

const path = 'src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import for AppLayout
if (!content.includes('import { AppLayout }')) {
  // Find last import
  const lastImportIndex = content.lastIndexOf('import ');
  const insertIndex = content.indexOf('\n', lastImportIndex) + 1;
  content = content.slice(0, insertIndex) + "import { AppLayout } from './components/layout/AppLayout';\n" + content.slice(insertIndex);
}

// 2. Replace root div wrapper
const rootDivRegex = /return \(\s*<div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 transition-colors duration-300">/g;
content = content.replace(rootDivRegex, 'return (\n    <AppLayout clearNotifications={clearNotifications} handleMarkNotificationRead={handleMarkNotificationRead}>');

// 3. Delete Sidebar and TopHeader up to <AnimatePresence mode="wait">
// It starts with `{/* Sidebar */}` and ends exactly before `<AnimatePresence mode="wait">`
const startMarker = '      {/* Sidebar */}';
const endMarker = '        <AnimatePresence mode="wait">';
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.slice(0, startIndex) + content.slice(endIndex);
}

// 4. Delete the </main> tag that was closing it.
// To be safe, let's find `    </main>\n\n        {/* Command Palette Dialog */}`
const mainIndexPosition = content.indexOf('</main>\n\n        {/* Command Palette');
if (mainIndexPosition !== -1) {
  content = content.slice(0, mainIndexPosition) + content.slice(mainIndexPosition + '</main>'.length);
}

// 5. Replace the final </div> that pairs with root wrapper
// We find it just before `function NavItem` or `export default App`
const endSearchRegex = /    <\/div>\n  \);\n}\n+function NavItem/g;
const hasEndMatch = endSearchRegex.test(content);
content = content.replace(/    <\/div>\n  \);\n}\n+function NavItem/g, '    </AppLayout>\n  );\n}\n\nfunction NavItem');

if (!hasEndMatch) {
    // If not found via regex, just try to find the standard end manually
    const alternateEndRegex = /    <\/div>\n  \);\n}\n+(function |export)/g;
    content = content.replace(/    <\/div>\n  \);\n}\n+(function |export)/g, '    </AppLayout>\n  );\n}\n\n$1');
}

// 6. Delete NavItem function since it was moved to Sidebar
const navItemStart = content.indexOf('function NavItem(');
if (navItemStart !== -1) {
  const statCardStart = content.indexOf('function StatCard(', navItemStart);
  if (statCardStart !== -1) {
    content = content.slice(0, navItemStart) + content.slice(statCardStart);
  }
}

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx transformed successfully!');
