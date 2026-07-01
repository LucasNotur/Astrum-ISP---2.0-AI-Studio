import * as cheerio from 'cheerio';
import crypto from 'node:crypto';

/**
 * Site Scrape — extrai conteúdo legível do site do ISP e detecta mudança para
 * reindexar no RAG. Port do siteScrapeWorker (S81). Funções puras.
 */

/** Remove script/style e normaliza o texto do body. */
export function extractReadableContent(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return ($('body').text() || $.root().text()).replace(/\s+/g, ' ').trim();
}

/** Hash MD5 do conteúdo (barato, suficiente para detectar mudança). */
export function contentHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

/** Deve reindexar? Sim se o hash mudou (ou é a primeira vez). */
export function shouldReindex(newHash: string, previousHash: string | null | undefined): boolean {
  return newHash !== previousHash;
}
