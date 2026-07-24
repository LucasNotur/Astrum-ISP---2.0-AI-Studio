import { describe, it, expect, vi } from 'vitest';
import {
  matchTicketToIncident,
  buildSuppressionNote,
  buildNormalizationMessage,
  correlateIncomingTicket,
  type ActiveIncident,
  type CorrelationPorts,
} from './incident-correlation.service';

const INCIDENTS: ActiveIncident[] = [
  { id: 'inc-conf', ctoId: 'cto-1', status: 'confirmada' },
  { id: 'inc-com', ctoId: 'cto-2', status: 'comunicada' },
];

describe('incident-correlation.service', () => {
  describe('matchTicketToIncident', () => {
    it('casa ticket com incidente na mesma CTO', () => {
      expect(matchTicketToIncident('cto-1', INCIDENTS)?.id).toBe('inc-conf');
      expect(matchTicketToIncident('cto-2', INCIDENTS)?.id).toBe('inc-com');
    });

    it('sem CTO → sem match', () => {
      expect(matchTicketToIncident(null, INCIDENTS)).toBeNull();
    });

    it('CTO sem incidente → sem match', () => {
      expect(matchTicketToIncident('cto-99', INCIDENTS)).toBeNull();
    });

    it('prioriza comunicada sobre confirmada na mesma CTO', () => {
      const mix: ActiveIncident[] = [
        { id: 'a', ctoId: 'cto-x', status: 'confirmada' },
        { id: 'b', ctoId: 'cto-x', status: 'comunicada' },
      ];
      expect(matchTicketToIncident('cto-x', mix)?.id).toBe('b');
    });
  });

  describe('mensagens', () => {
    it('nota de supressão referencia o incidente', () => {
      expect(buildSuppressionNote('inc-1')).toContain('inc-1');
    });
    it('mensagem de normalização é positiva', () => {
      expect(buildNormalizationMessage()).toContain('normalizada');
    });
  });

  describe('correlateIncomingTicket', () => {
    function makePorts(cto: string | null, over: Partial<CorrelationPorts> = {}): CorrelationPorts {
      return {
        getCustomerCto: vi.fn().mockResolvedValue(cto),
        listActiveIncidents: vi.fn().mockResolvedValue(INCIDENTS),
        suppressTicket: vi.fn().mockResolvedValue(undefined),
        ...over,
      };
    }

    it('suprime ticket quando a CTO tem incidente ativo', async () => {
      const ports = makePorts('cto-2');
      const r = await correlateIncomingTicket('t1', { id: 'tk1', customerId: 'c1' }, ports);
      expect(r.suppressed).toBe(true);
      expect(r.incidentId).toBe('inc-com');
      expect(ports.suppressTicket).toHaveBeenCalledWith('t1', 'tk1', 'inc-com', expect.stringContaining('inc-com'));
    });

    it('não suprime quando não há incidente na CTO', async () => {
      const ports = makePorts('cto-99');
      const r = await correlateIncomingTicket('t1', { id: 'tk1', customerId: 'c1' }, ports);
      expect(r.suppressed).toBe(false);
      expect(ports.suppressTicket).not.toHaveBeenCalled();
    });

    it('ticket sem cliente não correlaciona', async () => {
      const ports = makePorts('cto-1');
      const r = await correlateIncomingTicket('t1', { id: 'tk1', customerId: null }, ports);
      expect(r.suppressed).toBe(false);
      expect(ports.getCustomerCto).not.toHaveBeenCalled();
    });
  });
});
