
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { db } from '@/src/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Search, Server, Sparkles, Plus, CheckCircle2, XCircle, RotateCcw, PenSquare, Trash2, Cpu } from 'lucide-react';

export function KnowledgeBasePage({ knowledgeBase, handleGenerateAIArticle, handleSeedKB }: any) {
  const { user } = useAppStore();
  const currentTenant = user?.tenantId || 'DEFAULT_TENANT';
  const [kbArticles, setKbArticles] = useState<any[]>([]);
  
  // Section 1: Configs
  const [embeddingConfig, setEmbeddingConfig] = useState({ provider: 'openai', apiKey: '', model: 'text-embedding-3-small', baseUrl: '', dimensions: 1536 });
  const [vectorConfig, setVectorConfig] = useState({ provider: 'qdrant', url: '', apiKey: '', collection: 'astrum_knowledge' });
  const [embedTestResult, setEmbedTestResult] = useState<any>(null);
  const [vectorTestResult, setVectorTestResult] = useState<any>(null);
  const [reindexStatus, setReindexStatus] = useState<any>(null);

  // Section 2: Articles
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<any>(null);
  const [articleForm, setArticleForm] = useState({ title: '', category: 'geral', content: '' });

  // Section 3: Search Test
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  useEffect(() => {
    if (currentTenant?.id) {
      loadConfigs();
      fetchKBArticles(currentTenant.id);
    }
  }, [currentTenant]);

  const fetchKBArticles = async (tenantId: string) => {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const q = query(collection(db, 'knowledge_base'), where('tenant_id', '==', tenantId));
    const snap = await getDocs(q);
    setKbArticles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadConfigs = async () => {
    if (!currentTenant?.id) return;
    const docRef = doc(db, 'tenants', currentTenant.id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.embedding_config) setEmbeddingConfig(data.embedding_config);
      if (data.vector_store_config) setVectorConfig(data.vector_store_config);
    }
  };

  const saveConfigs = async () => {
    if (!currentTenant?.id) return;
    const docRef = doc(db, 'tenants', currentTenant.id);
    await updateDoc(docRef, {
      embedding_config: embeddingConfig,
      vector_store_config: vectorConfig
    });
    alert('Configurações salvas!');
  };

  const testEmbeddings = async () => {
    setEmbedTestResult(null);
    try {
      const res = await fetch('/api/integrations/embeddings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embeddingConfig)
      });
      const data = await res.json();
      setEmbedTestResult(data);
    } catch (e: any) {
      setEmbedTestResult({ success: false, error: e.message });
    }
  };

  const testVectorStore = async () => {
    setVectorTestResult(null);
    try {
      const res = await fetch('/api/integrations/vectorstore/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vectorConfig)
      });
      const data = await res.json();
      setVectorTestResult(data);
    } catch (e: any) {
      setVectorTestResult({ success: false, error: e.message });
    }
  };

  const startReindex = async () => {
    await fetch('/api/knowledge/reindex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: currentTenant?.id })
    });
    pollReindexStatus();
  };

  const pollReindexStatus = () => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/knowledge/reindex/status?tenantId=${currentTenant?.id}`);
      const data = await res.json();
      setReindexStatus(data);
      if (data.status === 'completed' || data.status === 'not_running') {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleSaveArticle = async () => {
    if (!currentTenant?.id) return;
    if (editingArticle) {
      await fetch(`/api/knowledge/articles/${editingArticle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...articleForm, tenantId: currentTenant.id })
      });
    } else {
      await fetch('/api/knowledge/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...articleForm, tenantId: currentTenant.id })
      });
    }
    setIsArticleModalOpen(false);
    fetchKBArticles(currentTenant.id);
  };

  const handleDeleteArticle = async (id: string) => {
    if (!currentTenant?.id) return;
    if (!confirm('Excluir artigo?')) return;
    await fetch(`/api/knowledge/articles/${id}?tenantId=${currentTenant.id}`, { method: 'DELETE' });
    fetchKBArticles(currentTenant.id);
  };

  const testSearch = async () => {
    if (!currentTenant?.id || !searchQuery) return;
    const res = await fetch('/api/knowledge/search-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, tenantId: currentTenant.id })
    });
    setSearchResults(await res.json());
  };

  const indexedCount = kbArticles.filter(a => a.vector_indexed).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 p-1">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Base de Conhecimento e IA</h2>
        <p className="text-zinc-500">Configure a vetorização de dados e gerencie seus artigos.</p>
      </div>

      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList>
          <TabsTrigger value="knowledge">Artigos (Knowledge Base)</TabsTrigger>
          <TabsTrigger value="integrations">Integrações de IA</TabsTrigger>
          <TabsTrigger value="searchtest">Testar Busca Semântica</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Cpu className="text-blue-500" />
                  <div>
                    <CardTitle>Provedor de Embeddings</CardTitle>
                    <CardDescription>Traduz o texto em números que representam o significado das palavras.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Selecione o Provedor</Label>
                  <Select value={embeddingConfig.provider} onValueChange={(v) => setEmbeddingConfig({ ...embeddingConfig, provider: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="cohere">Cohere</SelectItem>
                      <SelectItem value="mistral">Mistral</SelectItem>
                      <SelectItem value="custom">Personalizado (Local/Outros)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>API Key</Label>
                  <Input type="password" value={embeddingConfig.apiKey} onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, apiKey: e.target.value })} placeholder="Sua chave secreta" />
                </div>
                <div>
                  <Label>Modelo</Label>
                  <Input value={embeddingConfig.model} onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, model: e.target.value })} placeholder="ex: text-embedding-3-small" />
                </div>
                {embeddingConfig.provider === 'custom' && (
                  <>
                    <div>
                      <Label>URL Base</Label>
                      <Input value={embeddingConfig.baseUrl} onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, baseUrl: e.target.value })} placeholder="https://api.meu-provedor.com/v1" />
                    </div>
                    <div>
                      <Label>Dimensões</Label>
                      <Input type="number" value={embeddingConfig.dimensions} onChange={(e) => setEmbeddingConfig({ ...embeddingConfig, dimensions: parseInt(e.target.value) })} />
                    </div>
                  </>
                )}
                
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={testEmbeddings} variant="outline">Testar Conexão</Button>
                  <Button onClick={saveConfigs}>Salvar</Button>
                </div>

                {embedTestResult && (
                  <div className={`p-4 rounded-md mt-4 text-sm ${embedTestResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <div className="flex items-center gap-2">
                      {embedTestResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      <span className="font-semibold">{embedTestResult.success ? 'Conectado com sucesso' : 'Falha na conexão'}</span>
                    </div>
                    {embedTestResult.success ? (
                      <div className="mt-2 text-xs opacity-80 flex gap-4">
                        <span>Modelo: {embedTestResult.model}</span>
                        <span>Dimensões: {embedTestResult.dimensions}</span>
                        <span>Latência: {embedTestResult.latency_ms}ms</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs font-mono">{embedTestResult.error}</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Server className="text-purple-500" />
                  <div>
                    <CardTitle>Banco Vetorial</CardTitle>
                    <CardDescription>Armazena e realiza a busca por similaridade dos embeddings.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Selecione o Provedor</Label>
                  <Select value={vectorConfig.provider} onValueChange={(v) => setVectorConfig({ ...vectorConfig, provider: v })}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qdrant">Qdrant</SelectItem>
                      <SelectItem value="pinecone">Pinecone</SelectItem>
                      <SelectItem value="weaviate">Weaviate</SelectItem>
                      <SelectItem value="custom">Custom (REST API Compatível)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>URL da Instância / Host</Label>
                  <Input value={vectorConfig.url} onChange={(e) => setVectorConfig({ ...vectorConfig, url: e.target.value })} placeholder="https://xyz.qdrant.io:6333" />
                </div>
                <div>
                  <Label>API Key</Label>
                  <Input type="password" value={vectorConfig.apiKey} onChange={(e) => setVectorConfig({ ...vectorConfig, apiKey: e.target.value })} placeholder="Chave de acesso do cluster" />
                </div>
                <div>
                  <Label>Nome da Coleção / Index</Label>
                  <Input value={vectorConfig.collection} onChange={(e) => setVectorConfig({ ...vectorConfig, collection: e.target.value })} />
                </div>
                
                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={testVectorStore} variant="outline">Testar Conexão</Button>
                  <Button onClick={saveConfigs}>Salvar</Button>
                  <Button onClick={startReindex} variant="secondary" className="ml-auto"><RotateCcw size={16} className="mr-2"/> Reindexar Tudo</Button>
                </div>

                {reindexStatus && reindexStatus.status === 'running' && (
                  <div className="p-3 bg-zinc-50 border rounded-md">
                    <p className="text-xs mb-2">Reindexando... {reindexStatus.indexed} / {reindexStatus.total}</p>
                    <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 transition-all" style={{ width: `${(reindexStatus.indexed / reindexStatus.total) * 100}%` }}></div>
                    </div>
                  </div>
                )}

                {vectorTestResult && (
                   <div className={`p-4 rounded-md mt-4 text-sm ${vectorTestResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    <div className="flex items-center gap-2">
                       {vectorTestResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                       <span className="font-semibold">{vectorTestResult.success ? 'Conectado com sucesso' : 'Falha na conexão'}</span>
                    </div>
                    {vectorTestResult.success ? (
                       <div className="mt-2 text-xs opacity-80 flex gap-4">
                         <span>Provedor: {vectorTestResult.provider}</span>
                         <span>Docs na Coleção: {vectorTestResult.documents_in_collection}</span>
                         <span>Latência: {vectorTestResult.latency_ms}ms</span>
                       </div>
                    ) : (
                       <div className="mt-2 text-xs font-mono">{vectorTestResult.error}</div>
                    )}
                   </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-6 pt-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-zinc-500">
              Total de artigos: <b>{kbArticles.length}</b> ({indexedCount} indexados no vetor)
            </div>
            <Button onClick={() => { setEditingArticle(null); setArticleForm({ title: '', category: 'geral', content: '' }); setIsArticleModalOpen(true); }}>
              <Plus size={16} className="mr-2" /> Novo Artigo
            </Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 border-b text-zinc-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Título do Artigo</th>
                    <th className="px-6 py-4 font-medium">Categoria</th>
                    <th className="px-6 py-4 font-medium">Status Vetor</th>
                    <th className="px-6 py-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {kbArticles.map((article: any) => (
                    <tr key={article.id} className="hover:bg-zinc-50/50">
                      <td className="px-6 py-4 font-medium">{article.title}</td>
                      <td className="px-6 py-4"><Badge variant="outline">{article.category || 'geral'}</Badge></td>
                      <td className="px-6 py-4">
                        {article.vector_indexed ? (
                           <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none"><CheckCircle2 size={12} className="mr-1"/> Indexado</Badge>
                        ) : (
                           <Badge variant="secondary" className="text-zinc-500"><RotateCcw size={12} className="mr-1"/> Pendente</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingArticle(article);
                          setArticleForm({ title: article.title, category: article.category, content: article.content });
                          setIsArticleModalOpen(true);
                        }}><PenSquare size={16}/></Button>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteArticle(article.id)}>
                          <Trash2 size={16}/>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {kbArticles.length === 0 && (
                     <tr><td colSpan={4} className="text-center py-12 text-zinc-500">Nenhum artigo encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="searchtest" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Simulador de Busca Semântica</CardTitle>
              <CardDescription>Entenda como a IA pesquisa informações na sua base para montar as respostas aos clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <Input 
                    placeholder="Ex: Como configuro o roteador intelbras?" 
                    className="pl-10 h-12"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && testSearch()}
                  />
                </div>
                <Button className="h-12 px-8" onClick={testSearch}>Buscar</Button>
              </div>

              {searchResults && (
                <div className="mt-8 space-y-4">
                  <div className="flex justify-between items-center text-sm text-zinc-500">
                     <span>Resultados mais relevantes ({searchResults.results?.length}):</span>
                     <div className="flex gap-4">
                       <span>Score mínimo: {process.env.VECTOR_MIN_SCORE || '0.7'}</span>
                       <span>Tempo: {searchResults.latency_ms}ms</span>
                     </div>
                  </div>
                  <div className="grid gap-4">
                    {searchResults.results?.map((res: any, idx: number) => (
                       <div key={idx} className="p-4 border rounded-xl flex flex-col gap-2 relative overflow-hidden group hover:border-purple-200 hover:shadow-sm transition-all">
                          <div className="flex justify-between">
                            <h4 className="font-semibold text-base">{res.title}</h4>
                            <Badge variant={res.score > 0.85 ? "default" : "secondary"}>{(res.score * 100).toFixed(1)}% Relevância</Badge>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{res.text}</p>
                       </div>
                    ))}
                    {searchResults.results?.length === 0 && (
                       <div className="p-8 text-center text-zinc-500 bg-zinc-50 rounded-xl border">
                         Nenhum artigo atingiu a relevância mínima para essa pergunta. A IA procurará na internet (se ativado) ou responderá que não sabe.
                       </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isArticleModalOpen} onOpenChange={setIsArticleModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingArticle ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Título (como o cliente poderia perguntar, ou tópico principal)</Label>
              <Input value={articleForm.title} onChange={e => setArticleForm({...articleForm, title: e.target.value})} placeholder="Passo a passo configuração roteador X" />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={articleForm.category} onValueChange={v => setArticleForm({...articleForm, category: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="suporte">Suporte Técnico</SelectItem>
                  <SelectItem value="cobranca">Cobrança e Fatura</SelectItem>
                  <SelectItem value="vendas">Vendas / Planos</SelectItem>
                  <SelectItem value="procedimentos">Procedimentos Internos</SelectItem>
                  <SelectItem value="geral">Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conteúdo do Artigo (seja claro para que a IA possa ler e ensinar o cliente)</Label>
              <Textarea 
                value={articleForm.content} 
                onChange={e => setArticleForm({...articleForm, content: e.target.value})} 
                className="h-[300px] resize-none font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsArticleModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveArticle} disabled={!articleForm.title || !articleForm.content}>
              <Sparkles size={16} className="mr-2"/> {editingArticle ? 'Atualizar e Reindexar' : 'Salvar e Indexar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
