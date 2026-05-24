export interface GamificationEvent {
  id: string;
  ticketId: string;
  type: 'nps_5_star' | 'attendance';
  operatorId: string;
  tenantId: string;
}

export interface OperatorStats {
  score: number;
  attendancesCount: number;
  badges: string[];
}

export interface AppDependencies {
  db: {
    hasEventProcessed: (eventId: string) => Promise<boolean>;
    markEventProcessed: (eventId: string) => Promise<void>;
    getOperatorStats: (operatorId: string) => Promise<OperatorStats>;
    updateOperatorStats: (operatorId: string, stats: Partial<OperatorStats>) => Promise<void>;
    getRanking: (tenantId: string) => Promise<any[]>;
    getPendingCheckin: (osId: string) => Promise<any>;
    saveCheckin: (osId: string, data: any) => Promise<void>;
    removeCheckin: (osId: string) => Promise<void>;
  };
  voip: {
    getConfig: (tenantId: string) => Promise<any>;
    makeCall: (config: any, to: string) => Promise<{status: number}>;
  };
}

export class Sprint19 {
  constructor(private deps: AppDependencies) {}

  // 1. Gamification: score limits
  calculateScore(baseScore: number, slaViolated: boolean): number {
    let finalScore = baseScore;
    if (slaViolated) {
      finalScore -= 10; // penalty
    }
    return Math.max(0, finalScore);
  }

  // 2-3. Process Gamification Event
  async processEvent(event: GamificationEvent): Promise<void> {
    const isProcessed = await this.deps.db.hasEventProcessed(event.id);
    if (isProcessed) return;

    let stats = await this.deps.db.getOperatorStats(event.operatorId);

    if (event.type === 'nps_5_star') {
      stats.score += 5;
    } else if (event.type === 'attendance') {
      stats.attendancesCount += 1;
      if (stats.attendancesCount >= 5 && !stats.badges.includes('Velocista')) {
        stats.badges.push('Velocista');
      }
    }

    await this.deps.db.updateOperatorStats(event.operatorId, stats);
    await this.deps.db.markEventProcessed(event.id);
  }

  // 4. Ranking
  async getRanking(tenantId: string) {
    return await this.deps.db.getRanking(tenantId);
  }

  // 5. Check-in
  async checkIn(osId: string, perms: { gps: boolean, camera: boolean }, location: any): Promise<{success: boolean, checkin_photo_skipped?: boolean, error?: string}> {
    if (!perms.gps) {
      return { success: false, error: 'GPS required' };
    }
    
    await this.deps.db.saveCheckin(osId, { location, cameraAllowed: perms.camera });
    return { success: true, checkin_photo_skipped: !perms.camera };
  }

  // 6. Check-out
  async checkOut(osId: string): Promise<{success: boolean, error?: string}> {
    const pending = await this.deps.db.getPendingCheckin(osId);
    if (!pending) {
      return { success: false, error: 'Cannot check-out without a previous check-in.' };
    }
    await this.deps.db.removeCheckin(osId);
    return { success: true };
  }

  // 7-8. VoIP
  async makeVoipCall(tenantId: string, to: string): Promise<{status: number, error?: string}> {
    const config = await this.deps.voip.getConfig(tenantId);
    if (!config) {
      return { status: 400, error: 'VOIP_NOT_CONFIGURED' };
    }

    try {
      const result = await this.deps.voip.makeCall(config, to);
      return result;
    } catch (e: any) {
      if (e.message === 'Invalid credentials') {
        return { status: 401, error: 'INVALID_CREDENTIALS' };
      }
      return { status: 500 };
    }
  }

  // 9. PWA auth
  handleMobileRoute(isAuthenticated: boolean): { redirect?: string } {
    if (!isAuthenticated) return { redirect: '/login' };
    return {};
  }

  // 10. Service Worker rules
  getServiceWorkerCacheStrategy(url: string): string {
    if (url.includes('/api/')) return 'network-first';
    return 'cache-first';
  }
}
