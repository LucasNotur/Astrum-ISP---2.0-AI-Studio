
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
import { Search, Server, Sparkles, Plus, CheckCircle2, XCircle, RotateCcw, PenSquare, Trash2, Cpu, FileUp } from 'lucide-react';

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
  
  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{name: string, size: number, progress: number, status: string, error?: string}[]>([]);

  // URL Scraper State
  const [urlToScrape, setUrlToScrape] = useState('');
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);

  const handleScrapeUrl = async () => {
    if (!currentTenant?.id || !urlToScrape) return;
    setIsScrapingUrl(true);
    try {
      const res = await fetch('/api/rag/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToScrape, tenantId: currentTenant.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchKBArticles(currentTenant.id);
      setUrlToScrape('');
    } catch(e: any) {
      console.error(`Erro ao importar site: ${e.message}`);
    } finally {
      setIsScrapingUrl(false);
    }
  };

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

  const handleReindexArticle = async (id: string) => {
    if (!currentTenant?.id) return;
    try {
      const res = await fetch(`/api/knowledge/articles/${id}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: currentTenant.id })
      });
      if (res.ok) {
        fetchKBArticles(currentTenant.id);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!currentTenant?.id) return;

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type === 'application/pdf' || 
      file.type === 'text/plain' ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.pdf') || file.name.endsWith('.txt') || file.name.endsWith('.docx')
    );

    if (files.length === 0) return;

    const newUploads = files.map(f => ({ name: f.name, size: f.size, progress: 0, status: 'uploading' }));
    setUploadingFiles(prev => [...prev, ...newUploads]);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("pdf", file);
        
        const uploadRes = await fetch('/api/rag/upload-pdf', {
          method: 'POST',
          headers: { 'x-tenant-id': currentTenant.id },
          body: formData
        });

        if (!uploadRes.ok) throw new Error('Falha ao processar arquivo');
        const uploadData = await uploadRes.json();
        const extractedText = uploadData.rawText || uploadData.summary || '';

        setUploadingFiles(prev => prev.map(u => u.name === file.name ? { ...u, progress: 50, status: 'indexing' } : u));

        const articleRes = await fetch('/api/knowledge/articles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: file.name,
            content: extractedText,
            category: 'geral',
            tenantId: currentTenant.id
          })
        });

        if (!articleRes.ok) throw new Error('Falha ao indexar artigo');

        setUploadingFiles(prev => prev.map(u => u.name === file.name ? { ...u, progress: 100, status: 'success' } : u));
        fetchKBArticles(currentTenant.id);
      } catch (e: any) {
        setUploadingFiles(prev => prev.map(u => u.name === file.name ? { ...u, status: 'error', error: e.message } : u));
      }
    }
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
          <TabsTrigger value="searchtest">Testar Busca Semântica</TabsTrigger>
        </TabsList>



        <TabsContent value="knowledge" className="space-y-6 pt-4">
          <div className="flex flex-col mb-4">
            {reindexStatus && reindexStatus.status === 'running' && (
              <div className="p-3 bg-zinc-50 border rounded-md mb-4">
                <p className="text-xs mb-2">Reindexando... {reindexStatus.indexed} / {reindexStatus.total}</p>
                <div className="h-2 w-full bg-zinc-200 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all" style={{ width: `${(reindexStatus.indexed / reindexStatus.total) * 100}%` }}></div>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center bg-zinc-50 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700 p-4 rounded-xl gap-4">
              <div className="flex flex-1 gap-2 items-center">
                <Input 
                  placeholder="Exemplo: https://site-do-provedor.com.br/planos" 
                  value={urlToScrape} 
                  onChange={(e) => setUrlToScrape(e.target.value)} 
                  className="max-w-xl"
                />
                <Button onClick={handleScrapeUrl} disabled={isScrapingUrl || !urlToScrape} variant="secondary">
                  {isScrapingUrl ? 'Importando...' : 'Importar do Site'}
                </Button>
              </div>
              
              <div className="flex gap-2 items-center">
                <div className="text-sm text-zinc-500 mr-2">
                  Total de artigos: <b>{kbArticles.length}</b> ({indexedCount} indexados no vetor)
                </div>
                <Button onClick={startReindex} variant="secondary"><RotateCcw size={16} className="mr-2"/> Reindexar</Button>
                <Button onClick={() => { setEditingArticle(null); setArticleForm({ title: '', category: 'geral', content: '' }); setIsArticleModalOpen(true); }}>
                  <Plus size={16} className="mr-2" /> Novo Artigo
                </Button>
              </div>
            </div>
          </div>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDragging ? 'border-purple-500 bg-purple-50' : 'border-zinc-300 hover:border-purple-400'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <FileUp className="w-8 h-8 text-purple-500" />
              </div>
              <div>
                <p className="text-lg font-medium text-zinc-900">Arraste seus documentos para cá</p>
                <p className="text-sm text-zinc-500 mt-1">Suporta PDF, TXT, DOCX</p>
              </div>
            </div>
          </div>

          {uploadingFiles.length > 0 && (
            <div className="space-y-3">
              {uploadingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-white border border-zinc-100 rounded-lg shadow-sm">
                  <div className="flex items-center space-x-3 w-1/3">
                    <FileUp className="w-5 h-5 text-zinc-400" />
                    <div className="truncate">
                      <p className="text-sm font-medium text-zinc-900 truncate">{file.name}</p>
                      <p className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 px-4">
                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          file.status === 'error' ? 'bg-red-500' : 
                          file.status === 'success' ? 'bg-green-500' : 'bg-purple-500'
                        }`} 
                        style={{ width: `${file.progress}%` }} 
                      />
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 text-center">
                      {file.status === 'uploading' && 'Lendo arquivo...'}
                      {file.status === 'indexing' && 'Indexando...'}
                      {file.status === 'success' && 'Concluído'}
                      {file.status === 'error' && <span className="text-red-500">{file.error}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 border-b text-zinc-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Título do Artigo</th>
                    <th className="px-6 py-4 font-medium">Categoria</th>
                    <th className="px-6 py-4 font-medium">Criação</th>
                    <th className="px-6 py-4 font-medium">Status Vetor</th>
                    <th className="px-6 py-4 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {kbArticles.map((article: any) => (
                    <tr key={article.id} className="hover:bg-zinc-50/50">
                      <td className="px-6 py-4 font-medium">{article.title}</td>
                      <td className="px-6 py-4"><Badge variant="outline">{article.category || 'geral'}</Badge></td>
                      <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                        {article.created_at?.toDate ? new Date(article.created_at.toDate()).toLocaleDateString('pt-BR') : 'Hoje'}
                      </td>
                      <td className="px-6 py-4">
                        {article.vector_indexed ? (
                           <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none"><CheckCircle2 size={12} className="mr-1"/> Indexado</Badge>
                        ) : (
                           <Badge variant="secondary" className="text-zinc-500"><RotateCcw size={12} className="mr-1"/> Pendente</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" title="Reindexar" onClick={() => handleReindexArticle(article.id)}>
                          <RotateCcw size={16}/>
                        </Button>
                        <Button variant="ghost" size="sm" title="Editar" onClick={() => {
                          setEditingArticle(article);
                          setArticleForm({ title: article.title, category: article.category, content: article.content });
                          setIsArticleModalOpen(true);
                        }}><PenSquare size={16}/></Button>
                        <Button variant="ghost" size="sm" title="Excluir" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteArticle(article.id)}>
                          <Trash2 size={16}/>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {kbArticles.length === 0 && (
                     <tr><td colSpan={5} className="text-center py-12 text-zinc-500">Nenhum artigo encontrado.</td></tr>
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
