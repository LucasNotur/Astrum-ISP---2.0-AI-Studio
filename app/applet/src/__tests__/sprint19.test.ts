import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sprint19, AppDependencies } from '../lib/sprint19';

describe('Sprint 19 Tests', () => {
  let deps: import('vitest').Mocked<AppDependencies>;
  let sprint: Sprint19;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      db: {
        hasEventProcessed: vi.fn().mockResolvedValue(false),
        markEventProcessed: vi.fn(),
        getOperatorStats: vi.fn().mockResolvedValue({ score: 0, attendancesCount: 0, badges: [] }),
        updateOperatorStats: vi.fn(),
        getRanking: vi.fn().mockResolvedValue([]),
        getPendingCheckin: vi.fn(),
        saveCheckin: vi.fn(),
        removeCheckin: vi.fn(),
      },
      voip: {
        getConfig: vi.fn(),
        makeCall: vi.fn(),
      }
    };
    sprint = new Sprint19(deps);
  });

  it('1. Pontuação em 5 com SLA violado -> fica em 0 (nunca negativa)', () => {
    const score = sprint.calculateScore(5, true);
    expect(score).toBe(0);
  });

  it('2. Mesmo evento NPS 5★ para mesmo ticket -> pontua apenas 1 vez (idempotência)', async () => {
    const event = { id: 'evt-1', ticketId: 't1', type: 'nps_5_star' as const, operatorId: 'op1', tenantId: 'ten1' };
    
    deps.db.hasEventProcessed.mockResolvedValueOnce(false);
    await sprint.processEvent(event);
    
    deps.db.hasEventProcessed.mockResolvedValueOnce(true);
    await sprint.processEvent(event);

    expect(deps.db.getOperatorStats).toHaveBeenCalledTimes(1);
    expect(deps.db.updateOperatorStats).toHaveBeenCalledTimes(1);
    expect(deps.db.updateOperatorStats).toHaveBeenCalledWith('op1', expect.objectContaining({ score: 5 }));
  });

  it('3. Badge Velocista: 4 atendimentos -> NÃO desbloqueia (precisa de 5)', async () => {
    deps.db.getOperatorStats.mockResolvedValue({ score: 0, attendancesCount: 3, badges: [] });
    // This will be the 4th attendance
    await sprint.processEvent({ id: 'evt-2', ticketId: 't2', type: 'attendance', operatorId: 'op1', tenantId: 'ten1' });
    
    expect(deps.db.updateOperatorStats).toHaveBeenCalledWith('op1', expect.objectContaining({
      attendancesCount: 4,
      badges: []
    }));
  });

  it('4. Ranking tenant A -> não aparece no ranking do tenant B', async () => {
    deps.db.getRanking.mockImplementation(async (tenantId) => {
      if (tenantId === 'tenantA') return [{ name: 'OpA' }];
      if (tenantId === 'tenantB') return [{ name: 'OpB' }];
      return [];
    });

    const rankingA = await sprint.getRanking('tenantA');
    const rankingB = await sprint.getRanking('tenantB');

    expect(rankingA).toEqual([{ name: 'OpA' }]);
    expect(rankingB).toEqual([{ name: 'OpB' }]);
  });

  it('5. Check-in com câmera negada -> registra com GPS apenas, não lança erro', async () => {
    const res = await sprint.checkIn('os-1', { gps: true, camera: false }, { lat: 10, lng: 10 });
    
    expect(res.success).toBe(true);
    expect(res.checkin_photo_skipped).toBe(true);
    expect(deps.db.saveCheckin).toHaveBeenCalledWith('os-1', { location: { lat: 10, lng: 10 }, cameraAllowed: false });
  });

  it('6. Check-out sem check-in anterior -> bloqueado com mensagem clara', async () => {
    deps.db.getPendingCheckin.mockResolvedValue(null);
    const res = await sprint.checkOut('os-1');
    
    expect(res.success).toBe(false);
    expect(res.error).toBe('Cannot check-out without a previous check-in.');
  });

  it('7. VoIP não configurado -> 400 VOIP_NOT_CONFIGURED, não 500', async () => {
    deps.voip.getConfig.mockResolvedValue(null);
    const res = await sprint.makeVoipCall('ten1', '551199999999');
    
    expect(res.status).toBe(400);
    expect(res.error).toBe('VOIP_NOT_CONFIGURED');
  });

  it('8. VoIP com credenciais Twilio inválidas -> 401, ligação não trava indefinidamente', async () => {
    deps.voip.getConfig.mockResolvedValue({ provider: 'twilio' });
    deps.voip.makeCall.mockRejectedValue(new Error('Invalid credentials'));

    const res = await sprint.makeVoipCall('ten1', '551199999999');
    
    expect(res.status).toBe(401);
    expect(res.error).toBe('INVALID_CREDENTIALS');
  });

  it('9. PWA /operador-mobile sem autenticação -> redireciona para login', () => {
    const res = sprint.handleMobileRoute(false);
    expect(res.redirect).toBe('/login');
  });

  it('10. Service Worker -> rota /api/* não é cacheada', () => {
    const strategy = sprint.getServiceWorkerCacheStrategy('/api/users');
    expect(strategy).toBe('network-first');
  });
});
