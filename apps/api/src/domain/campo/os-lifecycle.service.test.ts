import { describe, it, expect, vi } from 'vitest';
import {
  canTransition,
  nextPhase,
  allowedEvents,
  phaseToStatus,
  isTerminal,
  evaluateCompletionGate,
  applyTransition,
  type OsLifecyclePorts,
  type CompletionContext,
} from './os-lifecycle.service';

function makePorts(currentPhase: string | null): OsLifecyclePorts {
  return {
    getCurrentPhase: vi.fn().mockResolvedValue(currentPhase),
    recordEvent: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };
}

const FULL_COMPLETION: CompletionContext = {
  checklistTotal: 5, checklistDone: 5, photosDepois: 2, hasSignature: true,
};

describe('os-lifecycle.service', () => {
  describe('canTransition / nextPhase', () => {
    it('permite o fluxo feliz completo', () => {
      expect(nextPhase('nova', 'atribuida')).toBe('atribuida');
      expect(nextPhase('atribuida', 'aceita')).toBe('aceita');
      expect(nextPhase('aceita', 'a_caminho')).toBe('em_deslocamento');
      expect(nextPhase('em_deslocamento', 'chegou')).toBe('no_local');
      expect(nextPhase('no_local', 'iniciada')).toBe('em_execucao');
      expect(nextPhase('em_execucao', 'concluida')).toBe('concluida');
    });

    it('bloqueia pular etapas (não pode concluir sem chegar)', () => {
      expect(canTransition('em_deslocamento', 'iniciada')).toBe(false);
      expect(canTransition('em_deslocamento', 'concluida')).toBe(false);
      expect(canTransition('aceita', 'chegou')).toBe(false);
    });

    it('permite pausar e retomar', () => {
      expect(nextPhase('em_execucao', 'pausada')).toBe('pausada');
      expect(nextPhase('pausada', 'retomada')).toBe('em_execucao');
    });

    it('reagendada volta ao fluxo via atribuida', () => {
      expect(nextPhase('atribuida', 'reagendada')).toBe('reagendada');
      expect(nextPhase('reagendada', 'atribuida')).toBe('atribuida');
    });

    it('cancelamento é possível de qualquer fase não-terminal', () => {
      for (const phase of ['atribuida', 'aceita', 'em_deslocamento', 'no_local', 'pausada'] as const) {
        expect(canTransition(phase, 'cancelada')).toBe(true);
      }
    });

    it('nextPhase retorna null em transição inválida', () => {
      expect(nextPhase('nova', 'concluida')).toBeNull();
    });
  });

  describe('isTerminal', () => {
    it('concluida e cancelada são terminais', () => {
      expect(isTerminal('concluida')).toBe(true);
      expect(isTerminal('cancelada')).toBe(true);
      expect(isTerminal('em_execucao')).toBe(false);
    });

    it('nenhum evento sai de fase terminal', () => {
      expect(allowedEvents('concluida')).toEqual([]);
      expect(allowedEvents('cancelada')).toEqual([]);
    });
  });

  describe('phaseToStatus', () => {
    it('mapeia fases internas para status persistido', () => {
      expect(phaseToStatus('nova')).toBe('pendente');
      expect(phaseToStatus('atribuida')).toBe('pendente');
      expect(phaseToStatus('em_deslocamento')).toBe('em_deslocamento');
      expect(phaseToStatus('no_local')).toBe('em_atendimento');
      expect(phaseToStatus('em_execucao')).toBe('em_atendimento');
      expect(phaseToStatus('pausada')).toBe('em_atendimento');
      expect(phaseToStatus('concluida')).toBe('concluido');
      expect(phaseToStatus('cancelada')).toBe('cancelado');
    });
  });

  describe('evaluateCompletionGate', () => {
    it('libera quando tudo está presente', () => {
      expect(evaluateCompletionGate(FULL_COMPLETION)).toEqual({ allowed: true, missing: [] });
    });

    it('lista tudo que falta', () => {
      const gate = evaluateCompletionGate({
        checklistTotal: 3, checklistDone: 1, photosDepois: 0, hasSignature: false,
      });
      expect(gate.allowed).toBe(false);
      expect(gate.missing).toContain('checklist incompleto');
      expect(gate.missing).toContain('foto "depois" obrigatória');
      expect(gate.missing).toContain('assinatura do cliente');
    });

    it('checklist vazio conta como incompleto', () => {
      const gate = evaluateCompletionGate({
        checklistTotal: 0, checklistDone: 0, photosDepois: 1, hasSignature: true,
      });
      expect(gate.missing).toEqual(['checklist incompleto']);
    });

    it('justificativa libera mesmo com pendências', () => {
      const gate = evaluateCompletionGate({
        checklistTotal: 3, checklistDone: 0, photosDepois: 0, hasSignature: false,
        justification: 'Cliente ausente, serviço parcial autorizado por telefone.',
      });
      expect(gate.allowed).toBe(true);
      expect(gate.missing.length).toBeGreaterThan(0); // ainda reporta o que faltou
    });

    it('justificativa em branco não libera', () => {
      const gate = evaluateCompletionGate({
        checklistTotal: 1, checklistDone: 0, photosDepois: 0, hasSignature: false,
        justification: '   ',
      });
      expect(gate.allowed).toBe(false);
    });

    it('requisitos configuráveis por tipo de OS', () => {
      const gate = evaluateCompletionGate({
        checklistTotal: 0, checklistDone: 0, photosDepois: 0, hasSignature: false,
        requires: { checklist: false, photoDepois: false, signature: false },
      });
      expect(gate.allowed).toBe(true);
    });
  });

  describe('applyTransition', () => {
    it('executa transição válida: grava evento + atualiza status', async () => {
      const ports = makePorts('aceita');
      const result = await applyTransition(
        { tenantId: 't1', serviceOrderId: 'os1', technicianId: 'tec1', event: 'a_caminho', lat: -23.5, lng: -46.6 },
        ports,
      );
      expect(result.ok).toBe(true);
      expect(result.toPhase).toBe('em_deslocamento');
      expect(result.status).toBe('em_deslocamento');
      expect(ports.recordEvent).toHaveBeenCalledOnce();
      expect(ports.updateStatus).toHaveBeenCalledWith('t1', 'os1', 'em_deslocamento');
    });

    it('rejeita OS inexistente', async () => {
      const ports = makePorts(null);
      const result = await applyTransition(
        { tenantId: 't1', serviceOrderId: 'nope', technicianId: 'tec1', event: 'aceita' },
        ports,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain('não encontrada');
      expect(ports.recordEvent).not.toHaveBeenCalled();
    });

    it('rejeita transição inválida sem gravar nada', async () => {
      const ports = makePorts('em_deslocamento');
      const result = await applyTransition(
        { tenantId: 't1', serviceOrderId: 'os1', technicianId: 'tec1', event: 'concluida', completion: FULL_COMPLETION },
        ports,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Transição inválida');
      expect(ports.recordEvent).not.toHaveBeenCalled();
      expect(ports.updateStatus).not.toHaveBeenCalled();
    });

    it('rejeita ação em OS terminal', async () => {
      const ports = makePorts('concluida');
      const result = await applyTransition(
        { tenantId: 't1', serviceOrderId: 'os1', technicianId: 'tec1', event: 'pausada' },
        ports,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain('terminal');
    });

    it('bloqueia conclusão sem checklist/foto/assinatura', async () => {
      const ports = makePorts('em_execucao');
      const result = await applyTransition(
        {
          tenantId: 't1', serviceOrderId: 'os1', technicianId: 'tec1', event: 'concluida',
          completion: { checklistTotal: 2, checklistDone: 1, photosDepois: 0, hasSignature: false },
        },
        ports,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Conclusão bloqueada');
      expect(result.missing).toContain('foto "depois" obrigatória');
      expect(ports.updateStatus).not.toHaveBeenCalled();
    });

    it('conclui quando o gate passa', async () => {
      const ports = makePorts('em_execucao');
      const result = await applyTransition(
        { tenantId: 't1', serviceOrderId: 'os1', technicianId: 'tec1', event: 'concluida', completion: FULL_COMPLETION },
        ports,
      );
      expect(result.ok).toBe(true);
      expect(result.status).toBe('concluido');
      expect(ports.updateStatus).toHaveBeenCalledWith('t1', 'os1', 'concluido');
    });
  });
});
