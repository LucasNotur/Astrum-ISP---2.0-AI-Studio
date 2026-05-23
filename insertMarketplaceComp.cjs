const fs = require('fs');

const COMPONENT_JSX = `
  const [selectedIntegrationMenu, setSelectedIntegrationMenu] = useState<string | null>(null);

  const renderMarketplace = () => {
    const integrations = [
      { id: 'ixc', name: 'IXC Provedor', category: 'ERP', desc: 'Sincronização de clientes e financeiro.', status: ixcCredentials.url ? 'Conectado' : 'Disponível', logo: '🌐' },
      { id: 'mkauth', name: 'MK-Auth', category: 'ERP', desc: 'Integração completa com MK-Auth.', status: 'Disponível', logo: '☁️' },
      { id: 'voalle', name: 'Voalle', category: 'ERP', desc: 'Gestão de assinantes e contratos.', status: voalleCredentials.url ? 'Conectado' : 'Disponível', logo: '📦' },
      { id: 'radiusnet', name: 'RadiusNet', category: 'ERP', desc: 'Gestão para provedores de internet.', status: 'Disponível', logo: '📡' },
      { id: 'hubsoft', name: 'HubSoft', category: 'ERP', desc: 'Integração com ERP HubSoft.', status: hubsoftCredentials.url ? 'Conectado' : 'Disponível', logo: '🔌' },
      { id: 'sgp', name: 'SGP', category: 'ERP', desc: 'Integração de billing SGP.', status: sgpCredentials.url ? 'Conectado' : 'Disponível', logo: '🏢' },
      { id: 'rbx', name: 'RBX', category: 'ERP', desc: 'Integração com Softwares RBX.', status: rbxCredentials.url ? 'Conectado' : 'Disponível', logo: '🔗' },
      { id: 'asaas', name: 'Asaas', category: 'Pagamentos', desc: 'Geração de boletos e Pix Asaas.', status: 'Disponível', logo: '💸' },
      { id: 'gerencianet', name: 'Gerencianet', category: 'Pagamentos', desc: 'Emissão de cobranças (Efí).', status: 'Requer upgrade', logo: '💳' },
      { id: 'openai', name: 'OpenAI', category: 'IA', desc: 'Modelos GPT-4 e processamento de linguagem.', status: 'Disponível', logo: '🧠' },
      { id: 'gemini', name: 'Google Gemini', category: 'IA', desc: 'Integração nativa com IA Gemini.', status: 'Conectado', logo: '✨' },
      { id: 'anthropic', name: 'Anthropic Claude', category: 'IA', desc: 'Integração com Claude 3.', status: 'Requer upgrade', logo: '🤖' },
      { id: 'qdrant', name: 'Qdrant (Vector DB)', category: 'IA', desc: 'Banco de dados vetorial para Retrieval.', status: vectorConfig?.url ? 'Conectado' : 'Disponível', logo: '📊' },
      { id: 'evolution', name: 'Evolution API', category: 'Comunicação', desc: 'Gateway para comunicação WhatsApp.', status: integrationKeys.evolutionUrl ? 'Conectado' : 'Disponível', logo: '💬' },
      { id: 'instagram', name: 'Instagram', category: 'Comunicação', desc: 'Integração com Instagram Direct.', status: 'Requer upgrade', logo: '📸' },
      { id: 'facebook', name: 'Facebook', category: 'Comunicação', desc: 'Integração com Messenger.', status: 'Requer upgrade', logo: '👍' }
    ];

    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'Conectado': return <span className="px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-[10px] font-medium border border-green-200 dark:border-green-800 uppercase tracking-wider">{status}</span>;
        case 'Requer upgrade': return <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full text-[10px] font-medium border border-amber-200 dark:border-amber-800 uppercase tracking-wider">{status}</span>;
        default: return <span className="px-2 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 rounded-full text-[10px] font-medium border border-zinc-200 dark:border-zinc-700 uppercase tracking-wider">{status}</span>;
      }
    };

    const getCategoryColor = (cat: string) => {
      switch (cat) {
        case 'ERP': return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 md:border md:border-blue-100 dark:border-blue-900/30';
        case 'Pagamentos': return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 md:border md:border-emerald-100 dark:border-emerald-900/30';
        case 'IA': return 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 md:border md:border-purple-100 dark:border-purple-900/30';
        case 'Comunicação': return 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 md:border md:border-pink-100 dark:border-pink-900/30';
        default: return 'bg-gray-100 text-gray-700';
      }
    };

    const handleConnectClick = (item: any) => {
      if (item.status === 'Requer upgrade') {
         toast.info("Esta integração requer um plano superior. Contate o suporte.");
         return;
      }
      setSelectedIntegrationMenu(item.id);
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {integrations.map((item) => (
           <div key={item.id} className="relative flex flex-col group border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 p-5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
             
             <div className="flex justify-between items-start mb-4">
               <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-2xl shadow-inner group-hover:scale-110 transition-transform">
                 {item.logo}
               </div>
               {getStatusBadge(item.status)}
             </div>

             <div className="mb-1 uppercase tracking-wider text-[10px] font-bold">
               <span className={\`px-2 py-0.5 rounded-sm \${getCategoryColor(item.category)}\`}>
                 {item.category}
               </span>
             </div>
             
             <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base mb-1">{item.name}</h3>
             
             <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-6 flex-grow leading-relaxed">
               {item.desc}
             </p>

             <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
               <Button 
                 variant={item.status === 'Conectado' ? 'outline' : 'default'}
                 className="w-full text-xs font-medium h-9 rounded-lg"
                 onClick={() => handleConnectClick(item)}
               >
                 {item.status === 'Conectado' ? 'Configurar' : 'Conectar'}
               </Button>
             </div>
           </div>
        ))}

        {/* --- DIALOG COMPONENT --- */}
        <Dialog open={selectedIntegrationMenu !== null} onOpenChange={(val) => !val && setSelectedIntegrationMenu(null)}>
           <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                 <DialogTitle>Configurar Integração</DialogTitle>
                 <DialogDescription>
                    Configure as credenciais e conexões da integração selecionada.
                 </DialogDescription>
              </DialogHeader>

              {/* Render specific forms here */}
              {selectedIntegrationMenu === 'ixc' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>IXC URL (Ex: https://ixc.seudominio.com.br)</Label>
                        <Input 
                          placeholder="https://sua-url-ixc.com.br" 
                          value={ixcCredentials.url}
                          onChange={(e) => setIxcCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token de Acesso (API Key IXC)</Label>
                        <Input 
                          type="password" 
                          placeholder="Insira o seu token IXC..." 
                          value={ixcCredentials.token}
                          onChange={(e) => setIxcCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveIXCCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testIXCConnection} disabled={isTestingIXC}>
                          {isTestingIXC ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'voalle' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Voalle ERP URL</Label>
                        <Input 
                          placeholder="https://sua-url-voalle.com.br" 
                          value={voalleCredentials.url}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client ID (OAUTH2)</Label>
                        <Input 
                          type="password" 
                          placeholder="Client ID..." 
                          value={voalleCredentials.clientId}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Client Secret (OAUTH2)</Label>
                        <Input 
                          type="password" 
                          placeholder="Client Secret..." 
                          value={voalleCredentials.clientSecret}
                          onChange={(e) => setVoalleCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveVoalleCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testVoalleConnection} disabled={isTestingVoalle}>
                          {isTestingVoalle ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'hubsoft' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>HubSoft ERP URL</Label>
                        <Input 
                          placeholder="https://sua-url-hubsoft.com.br" 
                          value={hubsoftCredentials.url}
                          onChange={(e) => setHubsoftCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token HubSoft</Label>
                        <Input 
                          type="password" 
                          placeholder="Token da API HubSoft..." 
                          value={hubsoftCredentials.token}
                          onChange={(e) => setHubsoftCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveHubsoftCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testHubsoftConnection} disabled={isTestingHubsoft}>
                          {isTestingHubsoft ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'sgp' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>SGP URL</Label>
                        <Input 
                          placeholder="https://sua-url-sgp.com.br" 
                          value={sgpCredentials.url}
                          onChange={(e) => setSgpCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token SGP</Label>
                        <Input 
                          type="password" 
                          placeholder="Token Bearer SGP..." 
                          value={sgpCredentials.token}
                          onChange={(e) => setSgpCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveSgpCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testSgpConnection} disabled={isTestingSgp}>
                          {isTestingSgp ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'rbx' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>RBX URL</Label>
                        <Input 
                          placeholder="https://sua-url-rbx.com.br" 
                          value={rbxCredentials.url}
                          onChange={(e) => setRbxCredentials(prev => ({ ...prev, url: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Token Basic Auth (usuario:senha)</Label>
                        <Input 
                          type="password" 
                          placeholder="usuario:senha ou token base64" 
                          value={rbxCredentials.token}
                          onChange={(e) => setRbxCredentials(prev => ({ ...prev, token: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={saveRbxCredentials} className="bg-indigo-600 hover:bg-indigo-700">Salvar</Button>
                        <Button variant="outline" onClick={testRbxConnection} disabled={isTestingRbx}>
                          {isTestingRbx ? 'Testando...' : 'Testar Conexão'}
                        </Button>
                      </div>
                  </div>
              )}

              {selectedIntegrationMenu === 'evolution' && (
                  <div className="space-y-4">
                      <div className="grid gap-2">
                        <Label>Evolution API URL</Label>
                        <Input 
                           placeholder="ex: http://sua-vps:8080" 
                           value={integrationKeys.evolutionUrl || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionUrl: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Global API Key</Label>
                        <Input 
                           type="password" 
                           placeholder="Sua Global API Key..." 
                           value={integrationKeys.evolutionApiKey || ''}
                           onChange={(e) => setIntegrationKeys(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                        />
                      </div>
                      <div className="pt-4 flex gap-2">
                        <Button onClick={async () => {
                           setIsSavingKeys(true);
                           await setDoc(doc(db, 'tenants', tenantId), { integrations: integrationKeys }, { merge: true });
                           toast.success('Configurações salvas!');
                           setIsSavingKeys(false);
                           setSelectedIntegrationMenu(null);
                        }} className="bg-indigo-600 hover:bg-indigo-700">
                           {isSavingKeys ? "Salvando..." : "Salvar Configurações"}
                        </Button>
                      </div>
                  </div>
              )}

              {['mkauth', 'radiusnet', 'asaas'].includes(selectedIntegrationMenu) && (
                 <div className="space-y-4">
                    <p className="text-zinc-500">
                       A integração selecionada ({selectedIntegrationMenu}) está em fase de implantação para testes.
                       Em breve o formulário completo de chaves será liberado.
                    </p>
                 </div>
              )}
           </DialogContent>
        </Dialog>
      </div>
    );
  };
`;


let content = fs.readFileSync('src/pages/SettingsPage.tsx', 'utf8');

// Insert it right before "return (\n    <motion.div"
const searchString = "  return (\n    <motion.div";
if (content.includes(searchString)) {
  content = content.replace(searchString, COMPONENT_JSX + "\n\n" + searchString);
  // Also we need to make sure Dialog components are imported!
  if (!content.includes('import { Dialog,')) {
    const dialogImport = "import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from \"../components/ui/dialog\";\n";
    content = dialogImport + content;
  }

  // I also noticed I used `<IntegrationsMarketplace />` in the first script, but I named it `renderMarketplace()`
  // I need to search and replace `<IntegrationsMarketplace />` with `{renderMarketplace()}`
  content = content.replace("<IntegrationsMarketplace />", "{renderMarketplace()}");
  
  fs.writeFileSync('src/pages/SettingsPage.tsx', content);
  console.log("Component inserted!");
} else {
  console.log("Could not find insertion point.", content.substring(content.length-200));
}
