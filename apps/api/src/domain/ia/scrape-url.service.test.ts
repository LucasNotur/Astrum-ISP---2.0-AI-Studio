import { describe, it, expect } from 'vitest';
import { extractTextFromHtml, deriveTitle, buildArticleFromHtml } from './scrape-url.service';

describe('extractTextFromHtml', () => {
  it('remove script/style e tags, colapsa espaços', () => {
    const html = '<html><head><style>.x{color:red}</style></head><body><h1>Olá</h1><script>alert(1)</script><p>mundo   novo</p></body></html>';
    expect(extractTextFromHtml(html)).toBe('Olá mundo novo');
  });

  it('decodifica entidades básicas', () => {
    expect(extractTextFromHtml('<p>a&nbsp;&amp;&lt;b&gt;</p>')).toBe('a &<b>');
  });
});

describe('deriveTitle', () => {
  it('usa a <title> quando existe', () => {
    expect(deriveTitle('<title>  Plano Fibra 500  </title>', 'https://x.com/y')).toBe('Plano Fibra 500');
  });

  it('cai pro host+path quando não há title', () => {
    expect(deriveTitle('<p>sem título</p>', 'https://ex.com/planos/')).toBe('ex.com/planos');
  });
});

describe('buildArticleFromHtml', () => {
  it('monta title+content de uma página normal', () => {
    const html = '<title>Ajuda</title><body><p>Como configurar o roteador em casa.</p></body>';
    const a = buildArticleFromHtml(html, 'https://ex.com/ajuda');
    expect(a).not.toBeNull();
    expect(a!.title).toBe('Ajuda');
    expect(a!.content).toContain('configurar o roteador');
    expect(a!.truncated).toBe(false);
  });

  it('devolve null quando não há texto útil', () => {
    expect(buildArticleFromHtml('<html><body>   </body></html>', 'https://ex.com')).toBeNull();
  });

  it('trunca no teto e marca truncated', () => {
    const big = '<body>' + 'a'.repeat(60_000) + '</body>';
    const a = buildArticleFromHtml(big, 'https://ex.com', 50_000);
    expect(a!.content.length).toBe(50_000);
    expect(a!.truncated).toBe(true);
  });
});
