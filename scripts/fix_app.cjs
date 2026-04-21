const fs = require('fs');
const appPath = 'src/App.tsx';
let content = fs.readFileSync(appPath, 'utf8');

// There are duplicate returns. 
// We will look for "if (!user) {"
// Find the SECOND one, or basically we just want the very FIRST "if (loading) {"  block, then the "if (!user) {" block,
// then the final "return ( <AppLayout " block that properly ends at the EOF.

const lastReturnIdx = content.lastIndexOf("return (\n    <AppLayout");
if (lastReturnIdx === -1) {
    console.log("Could not find the last AppLayout return");
    process.exit(1);
}

// All the code above the duplicate mess.
// Let's find "if (loading) {"
const loadingBlockIdx = content.indexOf("if (loading) {");

let cleanTop = content.slice(0, loadingBlockIdx);

const newAppTail = `
  if (loading) {
    return (
      <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50 transition-colors duration-300">
        {/* Sidebar Skeleton */}
        <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 mb-10">
            <div className="h-10 w-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-6 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-10 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="mt-auto pt-4">
            <div className="h-16 w-full bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
          </div>
        </aside>
        
        {/* Main Content Skeleton */}
        <main className="flex-1 overflow-auto p-8 space-y-8">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
              <div className="h-4 w-64 bg-zinc-100 dark:bg-zinc-800/50 rounded animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-md animate-pulse" />
          </div>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse p-6 flex flex-col justify-between">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800/50 rounded" />
                  <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800/50 rounded-full" />
                </div>
                <div className="h-8 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-96 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse" />
            <div className="h-96 w-full bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 font-sans transition-colors duration-300">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-2xl bg-white dark:bg-zinc-900 p-10 shadow-xl border border-zinc-100 dark:border-zinc-800"
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Bot size={32} />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Astrum</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Gestão Inteligente para Provedores</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-6 text-lg" size="lg">
            Entrar com Google
          </Button>
        </motion.div>
      </div>
    );
  }

`;

// Now we need the final return block, but with the inline components removed since we already generated the files and they are imported.
let finalReturnCode = content.slice(lastReturnIdx);

// We replace the massive inline conditionals with the component tags
const kbStart = finalReturnCode.indexOf("{activeTab === 'kb' && (");
const aiConfigStart = finalReturnCode.indexOf("{activeTab === 'ai-config' && (");
const teamStart = finalReturnCode.indexOf("{activeTab === 'team' && (");
const settingsStart = finalReturnCode.indexOf("{activeTab === 'settings' && (");
const inventoryStart = finalReturnCode.indexOf("{activeTab === 'inventory' && (");
const inventoryEnd = finalReturnCode.indexOf("</motion.div>", inventoryStart) + 13 + 4; // close ) as well

const replacementContent = `
          {activeTab === 'kb' && <KnowledgeBasePage knowledgeBase={knowledgeBase} handleGenerateAIArticle={handleGenerateAIArticle} handleSeedKB={handleSeedKB} />}

          {activeTab === 'ai-config' && <AIConfigPage 
      aiPrompts={aiPrompts} 
      setAiPrompts={setAiPrompts} 
      isSavingPrompts={isSavingPrompts} 
      handleSavePrompts={handleSavePrompts} 
      testAgentCategory={testAgentCategory}
      setTestAgentCategory={setTestAgentCategory}
      testAgentResponse={testAgentResponse}
      setTestAgentResponse={setTestAgentResponse}
      testAgentMessage={testAgentMessage}
      setTestAgentMessage={setTestAgentMessage}
      setIsTestAgentOpen={setIsTestAgentOpen}
      sentimentChartData={sentimentChartData}
      auditLogs={auditLogs}
      handleExportCSV={handleExportCSV}
      knowledgeBase={knowledgeBase}
      setEditingKB={setEditingKB}
      setNewKB={setNewKB}
      setIsKBDialogOpen={setIsKBDialogOpen}
      setIsPdfDialogOpen={setIsPdfDialogOpen}
      setIsMiningDialogOpen={setIsMiningDialogOpen}
      isDeveloper={isDeveloper}
      handleSeedKB={handleSeedKB}
      isSeeding={isSeeding}
      handleDeleteKB={handleDeleteKB}
  />}

          {activeTab === 'team' && <TeamPage 
      teamMembers={teamMembers}
      handleDeleteTeamMember={handleDeleteTeamMember}
      setIsTeamMemberDialogOpen={setIsTeamMemberDialogOpen}
      teamPerformanceData={teamPerformanceData}
      integrationKeys={integrationKeys}
      setEvoStatus={setEvoStatus}
      evoStatus={evoStatus}
      isFetchingQr={isFetchingQr}
      evoQrCode={evoQrCode}
      fetchEvolutionQrCode={fetchEvolutionQrCode}
      newTechPhone={newTechPhone}
      setNewTechPhone={setNewTechPhone}
      newTechName={newTechName}
      setNewTechName={setNewTechName}
      isFetchingTechName={isFetchingTechName}
      isAddingTech={isAddingTech}
      setIsAddingTech={setIsAddingTech}
      handleAddTechnician={handleAddTechnician}
  />}

          {activeTab === 'settings' && <SettingsPage 
      integrationKeys={integrationKeys}
      setIntegrationKeys={setIntegrationKeys}
      isSavingKeys={isSavingKeys}
      handleSaveKeys={handleSaveKeys}
      isDeveloper={isDeveloper}
      seedSystem={seedSystem}
      seedTicketsAndLogs={seedTicketsAndLogs}
      seedServiceOrdersAndTechnicians={seedServiceOrdersAndTechnicians}
      isSeeding={isSeeding}
  />}

          {activeTab === 'inventory' && <InventoryPage 
      inventory={inventory}
      inventoryCategoryData={inventoryCategoryData}
      setIsNewItemDialogOpen={setIsNewItemDialogOpen}
      setIsInventoryDialogOpen={setIsInventoryDialogOpen}
      setSelectedInventoryItem={setSelectedInventoryItem}
      handleDeleteItem={handleDeleteItem}
  />}
`;

finalReturnCode = finalReturnCode.slice(0, kbStart) + replacementContent + finalReturnCode.slice(inventoryEnd);

// Also we need to make sure the end closes properly
// The replacement removes the inline code
let text = cleanTop + newAppTail + finalReturnCode;
fs.writeFileSync(appPath, text, 'utf8');

console.log("App.tsx fixed successfully");
