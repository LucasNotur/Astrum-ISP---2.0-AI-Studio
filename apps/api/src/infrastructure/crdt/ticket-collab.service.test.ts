import { describe, it, expect } from 'vitest';
import { applyTicketUpdate, getTicketState, getTicketDiff, applyTicketDiff } from './ticket-collab.service';

describe('CRDT — Tickets Colaborativos', () => {
  it('dois técnicos editam campos diferentes — ambas as mudanças preservadas', () => {
    const id = 'ticket-collab-001';
    applyTicketUpdate(id, { field: 'description', value: 'Internet caiu às 14h', userId: 'tec-1', timestamp: Date.now() });
    applyTicketUpdate(id, { field: 'solution', value: 'Reiniciar OLT', userId: 'tec-2', timestamp: Date.now() });
    const state = getTicketState(id);
    expect(state.description).toBe('Internet caiu às 14h');
    expect(state.solution).toBe('Reiniciar OLT');
  });

  it('sincronização via diff binário entre dois documentos', () => {
    const idA = 'ticket-sync-a';
    const idB = 'ticket-sync-b';
    applyTicketUpdate(idA, { field: 'notes', value: 'Cliente ligou às 15h', userId: 'tec-1', timestamp: Date.now() });
    const diff = getTicketDiff(idA);
    applyTicketDiff(idB, diff);
    expect(getTicketState(idB).notes).toBe('Cliente ligou às 15h');
  });
});
