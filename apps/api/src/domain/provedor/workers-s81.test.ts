import { describe, it, expect } from 'vitest';
import { extractReadableContent, contentHash, shouldReindex } from './site-scrape';
import { buildErpSyncOutcome } from '../../adapters/erp/erp-sync';

describe('Site Scrape', () => {
  const html = `
    <html><head><style>.x{color:red}</style></head>
    <body>
      <h1>Plano Fibra 500</h1>
      <script>console.log('tracking')</script>
      <p>Internet   de   500 Mega   por R$ 99,90</p>
    </body></html>`;

  it('extrai texto legível removendo script/style e normalizando espaços', () => {
    const c = extractReadableContent(html);
    expect(c).toContain('Plano Fibra 500');
    expect(c).toContain('Internet de 500 Mega por R$ 99,90');
    expect(c).not.toContain('tracking');
    expect(c).not.toContain('color:red');
  });

  it('mesmo conteúdo → mesmo hash; conteúdo diferente → hash diferente', () => {
    const a = contentHash(extractReadableContent(html));
    const b = contentHash(extractReadableContent(html));
    const c = contentHash('outro conteúdo');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('shouldReindex: primeira vez (prev null) e quando muda', () => {
    const h = contentHash('x');
    expect(shouldReindex(h, null)).toBe(true);
    expect(shouldReindex(h, h)).toBe(false);
    expect(shouldReindex(h, 'hash-antigo')).toBe(true);
  });
});

describe('ERP Sync Outcome', () => {
  it('sucesso limpa sync_pending', () => {
    expect(buildErpSyncOutcome({})).toEqual({ status: 'ok', clearPending: true });
  });
  it('resultado com error → retry', () => {
    expect(buildErpSyncOutcome({ error: 'timeout' })).toEqual({ status: 'retry', reason: 'timeout' });
  });
  it('sem resultado → retry', () => {
    expect(buildErpSyncOutcome(null)).toMatchObject({ status: 'retry' });
  });
});
