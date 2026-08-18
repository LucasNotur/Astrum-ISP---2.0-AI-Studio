
import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { supabase } from '@/src/lib/supabase';
import { createKBArticle, updateKBArticle, deleteKBArticle } from '@/src/lib/db';
import { api, apiGet, apiPost } from '@/src/lib/apiClient';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/src/components/ui/dialog";
import { Search, Server, Sparkles, Plus, CheckCircle2, XCircle, RotateCcw, PenSquare, Trash2, Cpu, FileUp, Brain, Eye, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR as datePtBR } from 'date-fns/locale';
import { Skeleton } from '@/src/components/Skeleton';

export function KnowledgeBasePage() {
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

  // D-05: KB curation queue
  const [drafts, setDrafts] = useState<any[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftFilter, setDraftFilter] = useState<string>('pending');
  const [scanning, setScanning] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const API_BASE_URL =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
    'http://localhost:3001';

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? '';
  }

  async function fetchDrafts(status?: string) {
    setDraftsLoading(true);
    try {
      const token = await getToken();
      const qs = status ? `?status=${status}` : '';
      const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts ?? []);
      }
    } catch {
    } finally {
      setDraftsLoading(false);
    }
  }

  async function handleScanDrafts() {
    setScanning(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const msg = data.generated > 0
          ? `${data.generated} rascunho(s) gerado(s) de ${data.candidates} candidato(s)`
          : data.message || 'Nenhum candidato encontrado';
        alert(msg);
        fetchDrafts(draftFilter);
      }
    } catch {
    } finally {
      setScanning(false);
    }
  }

  async function handleDraftAction(id: string, action: 'approve' | 'reject') {
    setActioningId(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/v2/kb/drafts/${id}/${action}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchDrafts(draftFilter);
        if (action === 'approve') fetchKBArticles(currentTenant?.id || currentTenant);
      }
    } catch {
    } finally {
      setActioningId(null);
    }
  }

  useEffect(() => {
    fetchDrafts(draftFilter);
  }, [draftFilter]);

  // URL Scraper State
  const [urlToScrape, setUrlToScrape] = useState('');
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);

  const handleScrapeUrl = async () => {
    // `currentTenant` é a string do tenant id; o guard `.id` antigo travava tudo.
    if (!currentTenant || currentTenant === 'DEFAULT_TENANT' || !urlToScrape) return;
    setIsScrapingUrl(true);
    try {
      // Tenant do JWT no backend; URL passa por guard anti-SSRF lá.
      const data = await apiPost<{ id: string; title: string; chars: number }>(
        '/api/v2/rag/scrape-url', { url: urlToScrape }
      );
      fetchKBArticles(currentTenant);
      setUrlToScrape('');
      toast.success(`Página importada: "${data.title}" (${data.chars} caracteres)`);
    } catch(e: any) {
      toast.error('Erro ao importar site: ' + (e?.message || 'desconhecido'));
    } finally {
      setIsScrapingUrl(false);
    }
  };

  // Section 3: Search Test
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);

  useEffect(() => {
    // `currentTenant` é a string do tenant id (user.tenantId); o guard antigo
    // `currentTenant?.id` era sempre undefined → a lista nunca carregava.
    if (currentTenant && currentTenant !== 'DEFAULT_TENANT') {
      loadConfigs();
      fetchKBArticles(currentTenant);
    }
  }, [currentTenant]);

  // S99 — knowledge articles via Supabase
  const fetchKBArticles = async (tenantId: string) => {
    const { data } = await supabase.from('knowledge_articles').select('*').eq('tenant_id', tenantId);
    setKbArticles(data ?? []);
  };

  const loadConfigs = async () => {
    if (!currentTenant?.id) return;
    const { data } = await supabase.from('tenants').select('embedding_config,vector_store_config').eq('id', currentTenant.id).maybeSingle();
    if (data) {
      if (data.embedding_config) setEmbeddingConfig(data.embedding_config);
      if (data.vector_store_config) setVectorConfig(data.vector_store_config);
    }
  };

  const saveConfigs = async () => {
    if (!currentTenant?.id) return;
    await supabase.from('tenants').update({ embedding_config: embeddingConfig, vector_store_config: vectorConfig }).eq('id', currentTenant.id);
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
    await apiPost('/api/v2/knowledge/reindex', {});
    pollReindexStatus();
  };

  const pollReindexStatus = () => {
    const interval = setInterval(async () => {
      const data = await apiGet<any>('/api/v2/knowledge/reindex/status');
      setReindexStatus(data);
      if (data.status === 'completed' || data.status === 'not_running') {
        clearInterval(interval);
      }
    }, 2000);
  };

  const handleSaveArticle = async () => {
    if (!currentTenant || currentTenant === 'DEFAULT_TENANT') return;
    try {
      // Repontado do 404 /api/knowledge/articles p/ o Supabase direto
      // (knowledge_articles), o mesmo caminho já usado na leitura (fetchKBArticles).
      if (editingArticle) {
        await updateKBArticle(editingArticle.id, {
          title: articleForm.title, content: articleForm.content, category: articleForm.category,
        });
      } else {
        await createKBArticle({
          tenant_id: currentTenant, title: articleForm.title,
          content: articleForm.content, category: articleForm.category,
        });
      }
      setIsArticleModalOpen(false);
      fetchKBArticles(currentTenant);
      toast.success(editingArticle ? 'Artigo atualizado' : 'Artigo criado');
    } catch (e: any) {
      toast.error('Erro ao salvar artigo: ' + (e?.message || 'desconhecido'));
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!currentTenant || currentTenant === 'DEFAULT_TENANT') return;
    if (!confirm('Excluir artigo?')) return;
    try {
      await deleteKBArticle(id);
      fetchKBArticles(currentTenant);
      toast.success('Artigo removido');
    } catch (e: any) {
      toast.error('Erro ao remover artigo: ' + (e?.message || 'desconhecido'));
    }
  };

  const testSearch = async () => {
    if (!currentTenant?.id || !searchQuery) return;
    const data = await apiPost<any>('/api/v2/knowledge/search-test', { query: searchQuery });
    setSearchResults(data);
  };

  const handleReindexArticle = async (id: string) => {
    if (!currentTenant?.id) return;
    try {
      await apiPost(`/api/v2/knowledge/articles/${id}/reindex`, {});
      fetchKBArticles(currentTenant.id);
    } catch (e: any) {
      toast.error('Erro ao reindexar artigo: ' + (e?.message || 'desconhecido'));
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

  const indexedCount = kbArticles.filter(a => a.ingest_status === 'indexed').length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 p-1">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Base de Conhecimento e IA</h2>
        <p className="text-zinc-500">Configure a vetorização de dados e gerencie seus artigos.</p>
      </div>

      <Tabs defaultValue="knowledge" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="knowledge">Artigos (Knowledge Base)</TabsTrigger>
          <TabsTrigger value="curation" className="gap-1.5">
            <Brain size={14} />
            Curadoria IA
            {drafts.filter(d => d.status === 'pending').length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 min-w-5 h-5 flex items-center justify-center text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {drafts.filter(d => d.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
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
            <div className="flex flex-col sm:flex-row sm:items-center bg-zinc-50 border border-zinc-200 dark:bg-zinc-800/50 dark:border-zinc-700 p-4 rounded-xl gap-3">
              <div className="flex flex-1 flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Exemplo: https://site-do-provedor.com.br/planos"
                  value={urlToScrape}
                  onChange={(e) => setUrlToScrape(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleScrapeUrl} disabled={isScrapingUrl || !urlToScrape} variant="secondary" className="shrink-0">
                  {isScrapingUrl ? 'Importando...' : 'Importar do Site'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 items-center sm:border-l sm:border-zinc-200 sm:dark:border-zinc-600 sm:pl-3">
                <span className="text-sm text-zinc-500 whitespace-nowrap">
                  <b>{kbArticles.length}</b> artigos ({indexedCount} no vetor)
                </span>
                <Button onClick={startReindex} variant="secondary" size="sm"><RotateCcw size={14} className="mr-1.5"/> Reindexar</Button>
                <Button size="sm" onClick={() => { setEditingArticle(null); setArticleForm({ title: '', category: 'geral', content: '' }); setIsArticleModalOpen(true); }}>
                  <Plus size={14} className="mr-1.5" /> Novo Artigo
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
                        {article.ingest_status === 'indexed' ? (
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

        <TabsContent value="curation" className="space-y-6 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold tracking-tight">Fila de curadoria</h3>
              <p className="text-sm text-muted-foreground">
                A IA detecta conversas resolvidas e gera rascunhos de artigo. Você aprova com 1 clique.
              </p>
            </div>
            <Button size="sm" onClick={handleScanDrafts} disabled={scanning} className="gap-1.5 shrink-0">
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
              {scanning ? 'Escaneando...' : 'Escanear conversas'}
            </Button>
          </div>

          <div className="flex gap-2">
            {(['pending', 'approved', 'rejected', 'published'] as const).map((s) => {
              const labels: Record<string, string> = { pending: 'Pendentes', approved: 'Aprovados', rejected: 'Rejeitados', published: 'Publicados' };
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={draftFilter === s ? 'default' : 'outline'}
                  onClick={() => setDraftFilter(s)}
                  className="text-xs"
                >
                  {labels[s]}
                </Button>
              );
            })}
          </div>

          {draftsLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          )}

          {!draftsLoading && drafts.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <Brain size={32} className="text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Nenhum rascunho {draftFilter !== 'pending' ? 'neste filtro' : 'pendente'}</p>
                <p className="text-xs text-muted-foreground text-center max-w-sm">
                  Rode o scan para que a IA analise conversas resolvidas e gere artigos candidatos automaticamente.
                </p>
                {draftFilter === 'pending' && (
                  <Button size="sm" variant="outline" onClick={handleScanDrafts} disabled={scanning} className="mt-2 gap-1.5">
                    <Brain size={14} />
                    Escanear agora
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {!draftsLoading && drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((draft: any) => (
                <Card key={draft.id} className="bg-card text-card-foreground shadow-sm">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={
                            draft.status === 'pending' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                            draft.status === 'approved' || draft.status === 'published' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                            'bg-zinc-500/15 text-zinc-500'
                          }>
                            {draft.status === 'pending' ? 'Pendente' :
                             draft.status === 'approved' ? 'Aprovado' :
                             draft.status === 'published' ? 'Publicado' : 'Rejeitado'}
                          </Badge>
                          {draft.source_summary && (
                            <span className="text-xs text-muted-foreground truncate max-w-xs">
                              Fonte: {draft.source_summary}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{draft.draft_title || draft.draftTitle}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
                          {draft.draft_body || draft.draftBody}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-mono">
                            {draft.created_at || draft.createdAt
                              ? formatDistanceToNow(parseISO(draft.created_at || draft.createdAt), { addSuffix: true, locale: datePtBR })
                              : ''}
                          </span>
                          <span>por {draft.generated_by || draft.generatedBy || 'IA'}</span>
                        </div>
                      </div>
                    </div>

                    {draft.status === 'pending' && (
                      <div className="mt-3 flex gap-2 border-t border-border pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950 gap-1"
                          disabled={actioningId === draft.id}
                          onClick={() => handleDraftAction(draft.id, 'approve')}
                        >
                          <ThumbsUp size={13} />
                          {actioningId === draft.id ? 'Publicando...' : 'Aprovar e publicar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground gap-1"
                          disabled={actioningId === draft.id}
                          onClick={() => handleDraftAction(draft.id, 'reject')}
                        >
                          <ThumbsDown size={13} />
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
                       <span>Score mínimo: {typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_VECTOR_MIN_SCORE || '0.7' : '0.7'}</span>
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
