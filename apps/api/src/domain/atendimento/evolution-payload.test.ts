import { describe, it, expect } from 'vitest';
import { parseEvolutionPayload } from './evolution-payload';

const base = (message: any, key: any = {}) => ({
  instance: 'isp-acme',
  event: 'messages.upsert',
  data: { message, key: { remoteJid: '5511999998888@s.whatsapp.net', id: 'MSG1', ...key } },
});

describe('parseEvolutionPayload', () => {
  it('ignora payload sem instância', () => {
    expect(parseEvolutionPayload({ event: 'messages.upsert' })).toMatchObject({ kind: 'ignored', reason: 'missing_instance' });
  });

  it('ignora mensagem fromMe (eco do próprio bot)', () => {
    const r = parseEvolutionPayload(base({ conversation: 'oi' }, { fromMe: true }));
    expect(r).toMatchObject({ kind: 'ignored', reason: 'from_me' });
  });

  it('parseia texto simples e extrai telefone do JID', () => {
    const r = parseEvolutionPayload(base({ conversation: 'minha internet caiu' }));
    expect(r.kind).toBe('message');
    if (r.kind !== 'message') return;
    expect(r.message.textMessage).toBe('minha internet caiu');
    expect(r.message.senderPhone).toBe('5511999998888');
    expect(r.message.messageId).toBe('MSG1');
    expect(r.message.instanceName).toBe('isp-acme');
  });

  it('parseia extendedTextMessage', () => {
    const r = parseEvolutionPayload(base({ extendedTextMessage: { text: 'segunda via' } }));
    if (r.kind !== 'message') throw new Error('esperado message');
    expect(r.message.textMessage).toBe('segunda via');
  });

  it('detecta áudio', () => {
    const r = parseEvolutionPayload(base({ audioMessage: { url: 'http://a/x.ogg', mimetype: 'audio/ogg' } }));
    if (r.kind !== 'message') throw new Error('esperado message');
    expect(r.message.isAudio).toBe(true);
    expect(r.message.audioUrl).toBe('http://a/x.ogg');
  });

  it('detecta imagem com caption', () => {
    const r = parseEvolutionPayload(base({ imageMessage: { caption: 'olha o led', mimetype: 'image/jpeg' } }));
    if (r.kind !== 'message') throw new Error('esperado message');
    expect(r.message.isImage).toBe(true);
    expect(r.message.textMessage).toBe('olha o led');
  });

  it('detecta documento (usa fileName se não houver caption)', () => {
    const r = parseEvolutionPayload(base({ documentMessage: { fileName: 'comprovante.pdf', mimetype: 'application/pdf' } }));
    if (r.kind !== 'message') throw new Error('esperado message');
    expect(r.message.isDocument).toBe(true);
    expect(r.message.textMessage).toBe('comprovante.pdf');
  });

  it('captura base64 quando presente', () => {
    const p = base({ audioMessage: { mimetype: 'audio/ogg' } });
    p.data.message.base64 = 'BASE64DATA';
    const r = parseEvolutionPayload(p);
    if (r.kind !== 'message') throw new Error('esperado message');
    expect(r.message.base64Media).toBe('BASE64DATA');
  });

  it('trata connection.update', () => {
    const r = parseEvolutionPayload({ instance: 'isp-acme', event: 'connection.update', data: { state: 'open' } });
    expect(r).toMatchObject({ kind: 'connection', instanceName: 'isp-acme', state: 'open' });
  });

  it('ignora eventos não tratados', () => {
    const r = parseEvolutionPayload({ instance: 'x', event: 'presence.update', data: {} });
    expect(r).toMatchObject({ kind: 'ignored' });
  });
});
