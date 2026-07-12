import { describe, it, expect } from 'vitest';

// U4-01 — testa helpers puros extraídos do redesign da InboxPage

function relativeTime(value: any): string {
  if (!value) return "";
  const ts = value?.toMillis?.() ?? (typeof value === "string" ? new Date(value).getTime() : Number(value));
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1)  return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function getSlaStatus(ticket: any, departments: any[]): "red" | "yellow" | "green" | null {
  if (ticket.status === "resolved") return null;
  if (ticket.sla_breached) return "red";
  if (!ticket.createdAt) return "green";
  let limitMinutes = 15;
  if (ticket.departmentId) {
    const dept = departments.find((d: any) => d.id === ticket.departmentId);
    if (dept?.sla_response_minutes) limitMinutes = dept.sla_response_minutes;
  }
  const created = new Date(ticket.createdAt);
  const elapsed = (Date.now() - created.getTime()) / 60000;
  if (elapsed > limitMinutes)        return "red";
  if (elapsed > limitMinutes * 0.75) return "yellow";
  return "green";
}

describe('ChatPage helpers', () => {
  describe('relativeTime', () => {
    it('returns "agora" for very recent timestamps', () => {
      expect(relativeTime(Date.now())).toBe("agora");
      expect(relativeTime(Date.now() - 30_000)).toBe("agora");
    });
    it('returns minutes for timestamps < 1h', () => {
      expect(relativeTime(Date.now() - 5 * 60_000)).toBe("5min");
      expect(relativeTime(Date.now() - 59 * 60_000)).toBe("59min");
    });
    it('returns hours for timestamps < 24h', () => {
      expect(relativeTime(Date.now() - 2 * 3_600_000)).toBe("2h");
    });
    it('returns days for older timestamps', () => {
      expect(relativeTime(Date.now() - 2 * 86_400_000)).toBe("2d");
    });
    it('returns "" for null/undefined', () => {
      expect(relativeTime(null)).toBe("");
      expect(relativeTime(undefined)).toBe("");
    });
    it('parses ISO string', () => {
      const iso = new Date(Date.now() - 10 * 60_000).toISOString();
      expect(relativeTime(iso)).toBe("10min");
    });
  });

  describe('getSlaStatus', () => {
    it('returns null for resolved tickets', () => {
      expect(getSlaStatus({ status: "resolved" }, [])).toBeNull();
    });
    it('returns "red" when sla_breached is true', () => {
      expect(getSlaStatus({ status: "open", sla_breached: true, createdAt: new Date().toISOString() }, [])).toBe("red");
    });
    it('returns "green" when ticket is fresh (< 75% SLA)', () => {
      const freshDate = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago, limit=15
      expect(getSlaStatus({ status: "open", createdAt: freshDate }, [])).toBe("green");
    });
    it('returns "yellow" when > 75% of SLA limit elapsed', () => {
      const date = new Date(Date.now() - 12 * 60_000).toISOString(); // 12 of 15 min
      expect(getSlaStatus({ status: "open", createdAt: date }, [])).toBe("yellow");
    });
    it('returns "red" when SLA limit exceeded', () => {
      const date = new Date(Date.now() - 20 * 60_000).toISOString(); // 20 of 15 min
      expect(getSlaStatus({ status: "open", createdAt: date }, [])).toBe("red");
    });
    it('uses department SLA when available', () => {
      const date = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min ago
      const depts = [{ id: "suporte", sla_response_minutes: 3 }]; // limit=3 → breached
      expect(getSlaStatus({ status: "open", createdAt: date, departmentId: "suporte" }, depts)).toBe("red");
    });
  });
});
