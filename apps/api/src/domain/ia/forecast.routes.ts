import { FastifyInstance } from 'fastify';
import { seasonalMovingAverage, suggestStaffing } from '../ml/forecast';

export async function forecastRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    await (app as any).authenticate(req, reply);
  });

  app.get('/api/v2/ia/forecast/demand', async (req, reply) => {
    const days = Number((req.query as any).days) || 14;
    const capacity = Number(process.env.AGENT_CAPACITY_PER_DAY ?? '25');

    try {
      const { getDuckDB } = await import('../../infrastructure/analytics/duckdb.service');
      const db = getDuckDB();
      const result = await db.all(`
        SELECT CAST(created_at AS DATE) as day, COUNT(*)::INT as count
        FROM tickets
        GROUP BY day
        ORDER BY day
      `);

      const daily = result.map((r: any) => ({
        date: String(r.day).slice(0, 10),
        count: Number(r.count),
      }));

      if (daily.length < 60) {
        return reply.code(409).send({
          error: 'Histórico insuficiente para prever.',
          hint: 'Rode a sincronização de analytics e acumule histórico.',
          daysAvailable: daily.length,
        });
      }

      const forecast = seasonalMovingAverage(daily, days);
      const staffing = forecast.map((f) => ({
        ...f,
        staffing: suggestStaffing(f.forecast, capacity),
      }));

      return {
        history: daily.slice(-28),
        forecast: staffing,
        peak: staffing.reduce((max, s) => s.forecast > max.forecast ? s : max, staffing[0]),
      };
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
