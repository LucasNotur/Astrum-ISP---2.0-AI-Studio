import { describe, it, expect, beforeEach } from 'vitest';
import { vectorStore } from '../../../src/lib/vectorStore';

describe('RAG Vector Store Tests', () => {
  beforeEach(() => {
    vectorStore.clear();
  });

  it('1. Artigo indexado do tenant A -> busca do tenant B NÃO retorna esse artigo', () => {
    vectorStore.indexArticle('tenant-A', { id: 'art-1', content: 'knowledge base A' });
    
    // search with tenant B
    const results = vectorStore.search('tenant-B', 'knowledge');
    
    expect(results).toHaveLength(0);
  });

  it('2. search com tenantId A -> retorna APENAS artigos com tenant_id=A', () => {
    vectorStore.indexArticle('tenant-A', { id: 'art-1', content: 'shared knowledge' });
    vectorStore.indexArticle('tenant-B', { id: 'art-2', content: 'shared knowledge' });
    
    const results = vectorStore.search('tenant-A', 'shared');
    
    expect(results).toHaveLength(1);
    expect(results[0].tenant_id).toBe('tenant-A');
  });

  it('3. delete de artigo -> próxima busca não o retorna', () => {
    vectorStore.indexArticle('tenant-A', { id: 'art-1', content: 'knowledge base A' });
    
    let results = vectorStore.search('tenant-A', 'knowledge');
    expect(results).toHaveLength(1);
    
    vectorStore.deleteArticle('tenant-A', 'art-1');
    
    results = vectorStore.search('tenant-A', 'knowledge');
    expect(results).toHaveLength(0);
  });

  it('4. Busca com query vazia -> retorna array vazio sem lançar erro', () => {
    vectorStore.indexArticle('tenant-A', { id: 'art-1', content: 'knowledge base A' });
    
    const results = vectorStore.search('tenant-A', '   ');
    expect(results).toHaveLength(0);
  });

  it('5. Upload de PDF via /api/rag/upload-pdf -> artigo criado com tenant_id correto', () => {
    const article = vectorStore.uploadPdf('tenant-A', 'document.pdf');
    
    expect(article.tenant_id).toBe('tenant-A');
    expect(article.content).toContain('document.pdf');
    expect(article.vector_indexed).toBe(true);
    
    const results = vectorStore.search('tenant-A', 'document.pdf');
    expect(results).toHaveLength(1);
  });

  it('6. Scraper de URL -> chunks criados com tenant_id do tenant solicitante', () => {
    const chunks = vectorStore.scrapeUrl('tenant-B', 'https://example.com');
    
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.tenant_id).toBe('tenant-B');
    });
  });

  it('7. Reindexação -> artigo com vector_indexed=false passa para true após reindex', () => {
    vectorStore.addArticle({
      id: 'art-1',
      tenant_id: 'tenant-A',
      content: 'Needs reindexing',
      vector_indexed: false
    });
    
    // verify it's false initially
    const addedArticle = vectorStore.getArticles().find(a => a.id === 'art-1');
    expect(addedArticle?.vector_indexed).toBe(false);
    
    const reindexedArticle = vectorStore.reindexArticle('tenant-A', 'art-1');
    
    expect(reindexedArticle).toBeDefined();
    expect(reindexedArticle?.vector_indexed).toBe(true);
  });
});
