import { describe, it, expect, vi } from 'vitest';
import { matchIdentifiers, deduplicateIdentifiers, resolveUnifiedContact, CrossLinePorts, UnifiedContact } from './cross-line-grouping.service';

describe('cross-line-grouping.service', () => {
  describe('matchIdentifiers', () => {
    it('detecta match pelo mesmo canal e valor', () => {
      const a = [{ channel: 'whatsapp', value: '5511999990001' }];
      const b = [{ channel: 'whatsapp', value: '5511999990001' }];
      expect(matchIdentifiers(a, b)).toBe(true);
    });

    it('case insensitive no valor', () => {
      const a = [{ channel: 'email', value: 'Joao@ISP.com' }];
      const b = [{ channel: 'email', value: 'joao@isp.com' }];
      expect(matchIdentifiers(a, b)).toBe(true);
    });

    it('não matcha canais diferentes', () => {
      const a = [{ channel: 'whatsapp', value: '123' }];
      const b = [{ channel: 'email', value: '123' }];
      expect(matchIdentifiers(a, b)).toBe(false);
    });
  });

  describe('deduplicateIdentifiers', () => {
    it('remove duplicatas por channel+value', () => {
      const ids = [
        { channel: 'whatsapp', value: '123' },
        { channel: 'email', value: 'a@b.com' },
        { channel: 'whatsapp', value: '123' },
      ];
      expect(deduplicateIdentifiers(ids)).toHaveLength(2);
    });
  });

  describe('resolveUnifiedContact', () => {
    it('reutiliza contato existente', async () => {
      const existing: UnifiedContact = {
        id: 'uc1', tenantId: 't1', customerId: 'c1',
        identifiers: [{ channel: 'whatsapp', value: '123' }],
        conversations: ['conv1'],
      };
      const ports: CrossLinePorts = {
        findContactByIdentifier: vi.fn().mockResolvedValue(existing),
        createUnifiedContact: vi.fn(),
        mergeContacts: vi.fn(),
        linkConversation: vi.fn().mockResolvedValue(undefined),
      };
      const result = await resolveUnifiedContact('t1', 'c1', 'whatsapp', '123', 'conv2', ports);
      expect(result.id).toBe('uc1');
      expect(ports.linkConversation).toHaveBeenCalledWith('uc1', 'conv2');
      expect(ports.createUnifiedContact).not.toHaveBeenCalled();
    });

    it('cria novo contato quando não existe', async () => {
      const newContact: UnifiedContact = {
        id: 'uc2', tenantId: 't1', customerId: 'c1',
        identifiers: [{ channel: 'email', value: 'a@b.com' }],
        conversations: [],
      };
      const ports: CrossLinePorts = {
        findContactByIdentifier: vi.fn().mockResolvedValue(null),
        createUnifiedContact: vi.fn().mockResolvedValue(newContact),
        mergeContacts: vi.fn(),
        linkConversation: vi.fn().mockResolvedValue(undefined),
      };
      const result = await resolveUnifiedContact('t1', 'c1', 'email', 'a@b.com', 'conv1', ports);
      expect(result.id).toBe('uc2');
      expect(ports.createUnifiedContact).toHaveBeenCalledOnce();
      expect(ports.linkConversation).toHaveBeenCalledWith('uc2', 'conv1');
    });
  });
});
