export interface TenantConfig {
  id: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  primary_color?: string;
}

export interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  incrementAndGet(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
}

export interface DB {
  getTenantIdByHost(host: string): Promise<string | null>;
  getTenantConfig(tenantId: string): Promise<TenantConfig | null>;
  getNationalHolidays(year: number): Promise<string[]>;
}

export interface RequestInfo {
  host: string;
  tenantId?: string;
}

export interface ResponseInfo {
  status: number;
  headers?: Record<string, string>;
  cssVariables?: Record<string, string>;
  body?: any;
}

export class WhitelabelRateLimit {
  constructor(private redis: RedisCache, private db: DB) {}

  async resolveTenant(host: string): Promise<{ status: number, tenantId?: string }> {
    const cacheKey = `host:${host}`;
    let tenantId = await this.redis.get(cacheKey);

    if (!tenantId) {
      tenantId = await this.db.getTenantIdByHost(host);
      if (tenantId) {
        await this.redis.set(cacheKey, tenantId);
      }
    }

    if (!tenantId) {
      return { status: 404 };
    }

    return { status: 200, tenantId };
  }

  async checkRateLimit(tenantId: string): Promise<{ status: number, headers?: Record<string, string> }> {
    const config = await this.db.getTenantConfig(tenantId);
    if (!config) return { status: 404 };

    if (config.plan === 'ENTERPRISE') {
      return { status: 200 };
    }

    const limits: Record<string, number> = {
      FREE: 100,
      PRO: 500
    };

    const limit = limits[config.plan] || 100;
    const windowKey = `ratelimit:${tenantId}:minute`;
    
    const currentCount = await this.redis.incrementAndGet(windowKey);
    if (currentCount === 1) {
      await this.redis.expire(windowKey, 60);
    }

    if (currentCount > limit) {
      return { 
        status: 429, 
        headers: { 'Retry-After': '60' } 
      };
    }

    return { status: 200 };
  }

  async isHoliday(tenantId: string, dateStr: string): Promise<boolean> {
    const year = parseInt(dateStr.split('-')[0], 10);
    const holidays = await this.db.getNationalHolidays(year);
    return holidays.includes(dateStr);
  }

  async scheduleJob(tenantId: string, dateStr: string, jobData: any): Promise<{ scheduledDate: string }> {
    let checkDate = new Date(dateStr);
    while (await this.isHoliday(tenantId, checkDate.toISOString().split('T')[0])) {
      checkDate.setDate(checkDate.getDate() + 1);
    }
    return { scheduledDate: checkDate.toISOString().split('T')[0] };
  }

  async getTenantTheme(tenantId: string): Promise<{ cssVariables: Record<string, string> }> {
    const config = await this.db.getTenantConfig(tenantId);
    const primaryColor = config?.primary_color || '#000000';
    return { cssVariables: { '--primary-color': primaryColor } };
  }
}
