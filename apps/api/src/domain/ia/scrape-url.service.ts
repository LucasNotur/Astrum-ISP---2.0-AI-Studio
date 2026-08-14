/**
 * Scrape ad-hoc de uma URL para a base de conhecimento (KnowledgeBasePage →
 * "URL Scraper"). Funções PURAS de extração; a rota faz o fetch + persistência.
 *
 * NÃO confundir com o `site-scrape.worker` (packages/queue), que é OUTRA coisa:
 * scrapa o `website_url` do próprio tenant num cron semanal e grava em
 * `knowledge_base` (tabela que nem existe — o worker está quebrado). Aqui é o
 * fluxo interativo: o operador cola uma URL e vira UM artigo em `knowledge_articles`.
 */

/** Remove script/style e tags, colapsa espaços. Mesmo algoritmo do worker legado. */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Título: <title> do HTML se houver; senão host+path da URL. */
export function deriveTitle(html: string, url: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = m?.[1]?.replace(/\s+/g, ' ').trim();
  if (raw) return raw.slice(0, 200);
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/$/, '').slice(0, 200) || u.hostname;
  } catch {
    return url.slice(0, 200);
  }
}

/**
 * Prepara o conteúdo do artigo a partir do HTML: extrai texto e trunca num teto
 * (evita gravar páginas gigantes). Devolve `null` se não sobrou texto útil.
 */
export function buildArticleFromHtml(
  html: string,
  url: string,
  maxChars = 50_000,
): { title: string; content: string; truncated: boolean } | null {
  const text = extractTextFromHtml(html);
  if (text.length < 20) return null; // página vazia / só markup
  const truncated = text.length > maxChars;
  return {
    title: deriveTitle(html, url),
    content: truncated ? text.slice(0, maxChars) : text,
    truncated,
  };
}
