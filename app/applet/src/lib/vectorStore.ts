export interface Article {
  id: string;
  tenant_id: string;
  content: string;
  vector_indexed: boolean;
}

export interface Chunk {
  id: string;
  tenant_id: string;
  content: string;
}

class VectorStore {
  private articles: Article[] = [];
  private chunks: Chunk[] = [];

  indexArticle(tenantId: string, article: Omit<Article, 'tenant_id' | 'vector_indexed'>) {
    this.articles.push({
      ...article,
      tenant_id: tenantId,
      vector_indexed: true,
    });
  }

  addArticle(article: Article) {
    this.articles.push(article);
  }

  search(tenantId: string, query: string): Article[] {
    if (!query.trim()) {
      return [];
    }
    // Simple mock search: filter by tenant and matching content
    return this.articles.filter(
      (a) => a.tenant_id === tenantId && a.content.includes(query)
    );
  }

  deleteArticle(tenantId: string, articleId: string) {
    this.articles = this.articles.filter(
      (a) => !(a.tenant_id === tenantId && a.id === articleId)
    );
  }

  uploadPdf(tenantId: string, fileName: string): Article {
    const article: Article = {
      id: `pdf_${Date.now()}`,
      tenant_id: tenantId,
      content: `Extracted text from ${fileName}`,
      vector_indexed: true,
    };
    this.articles.push(article);
    return article;
  }

  scrapeUrl(tenantId: string, url: string): Chunk[] {
    const scrapedChunks: Chunk[] = [
      { id: `chunk_1_${Date.now()}`, tenant_id: tenantId, content: `Content part 1 from ${url}` },
      { id: `chunk_2_${Date.now()}`, tenant_id: tenantId, content: `Content part 2 from ${url}` },
    ];
    this.chunks.push(...scrapedChunks);
    return scrapedChunks;
  }

  reindexArticle(tenantId: string, articleId: string): Article | null {
    const article = this.articles.find((a) => a.tenant_id === tenantId && a.id === articleId);
    if (article) {
      article.vector_indexed = true;
      return article;
    }
    return null;
  }

  // Extraneous methods to assist with tests
  getArticles() { return this.articles; }
  getChunks() { return this.chunks; }
  clear() {
    this.articles = [];
    this.chunks = [];
  }
}

export const vectorStore = new VectorStore();
