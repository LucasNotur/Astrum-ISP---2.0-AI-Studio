import OpenAI from 'openai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { infraLogger } from '../logging/logger';
import { supabase } from '../database/supabase.client';
import { getRedisClient } from '../cache/redis.client';
import { resolveOpenAIKey } from '../config/openai-key';

/**
 * OpenAI Batch API Service
 *
 * ESTRATÉGIA (Bloco 1 — FinOps de IA):
 * - Batch API: processa requisições em lote com 50% de desconto
 * - Janela de processamento: até 24h (ideal para análises noturnas)
 * - Casos de uso: análise de churn, classificação em massa de tickets,
 *   geração de relatórios mensais de clientes, scoring de inadimplência
 *
 * AGENDAMENTO:
 * - BullMQ job às 02h00 diariamente (hora de menor custo de servidores)
 * - Jobs de cobrança e relatórios mensais
 *
 * FLUXO:
 * 1. Montar arquivo JSONL com todas as requisições
 * 2. Upload para OpenAI Files API
 * 3. Criar Batch Job
 * 4. Polling de status a cada 5 minutos
 * 5. Download dos resultados
 * 6. Persistir no Supabase/DuckDB
 */

const openai = new OpenAI({ apiKey: resolveOpenAIKey() });
const redis = getRedisClient();

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const ChurnPredictionSchema = z.object({
  customer_id: z.string(),
  churn_probability: z.number().min(0).max(1),
  churn_risk: z.enum(['low', 'medium', 'high', 'critical']),
  main_factors: z.array(z.string()).max(3),
  recommended_action: z.enum([
    'no_action', 'proactive_contact', 'offer_discount',
    'technical_review', 'urgent_retention'
  ]),
  confidence_score: z.number().min(0).max(1),
});

export type ChurnPrediction = z.infer<typeof ChurnPredictionSchema>;

export const TicketClassificationSchema = z.object({
  ticket_id: z.string(),
  category: z.enum(['technical', 'billing', 'commercial', 'complaint', 'other']),
  subcategory: z.string().max(50),
  priority_suggestion: z.enum(['low', 'medium', 'high', 'urgent']),
  auto_resolvable: z.boolean(),
  estimated_resolution_minutes: z.number().min(0),
  tags: z.array(z.string()).max(5),
});

export type TicketClassification = z.infer<typeof TicketClassificationSchema>;

// ─── Batch Request Builder ────────────────────────────────────────────────────

interface BatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: 'json_object' };
    max_tokens: number;
  };
}

function buildChurnRequest(customer: {
  id: string;
  name: string;
  plan: string;
  monthlyValue: number;
  ticketCount30d: number;
  lastPaymentDate: string;
  daysOverdue: number;
  signalDrops30d: number;
}): BatchRequest {
  return {
    custom_id: `churn_${customer.id}`,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: 'gpt-4o-mini', // modelo mais barato para batch
      messages: [
        {
          role: 'system',
          content: `Você é um analista de retenção de ISP. Analise os dados do cliente e retorne um JSON com:
{
  "customer_id": string,
  "churn_probability": number (0-1),
  "churn_risk": "low"|"medium"|"high"|"critical",
  "main_factors": string[] (máx 3),
  "recommended_action": "no_action"|"proactive_contact"|"offer_discount"|"technical_review"|"urgent_retention",
  "confidence_score": number (0-1)
}`,
        },
        {
          role: 'user',
          content: `Cliente: ${customer.name}
Plano: ${customer.plan} (R$${(customer.monthlyValue / 100).toFixed(2)}/mês)
Tickets últimos 30 dias: ${customer.ticketCount30d}
Dias em atraso: ${customer.daysOverdue}
Quedas de sinal/30d: ${customer.signalDrops30d}
Último pagamento: ${customer.lastPaymentDate}

Analise o risco de churn.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    },
  };
}

function buildTicketClassificationRequest(ticket: {
  id: string;
  title: string;
  description: string;
}): BatchRequest {
  return {
    custom_id: `ticket_${ticket.id}`,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classifique o ticket de suporte de ISP e retorne JSON:
{
  "ticket_id": string,
  "category": "technical"|"billing"|"commercial"|"complaint"|"other",
  "subcategory": string,
  "priority_suggestion": "low"|"medium"|"high"|"urgent",
  "auto_resolvable": boolean,
  "estimated_resolution_minutes": number,
  "tags": string[]
}`,
        },
        {
          role: 'user',
          content: `Título: ${ticket.title}\nDescrição: ${ticket.description}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    },
  };
}

// ─── BatchService ─────────────────────────────────────────────────────────────

export class BatchService {

  /**
   * Analisa risco de churn de todos os clientes ativos de um tenant.
   * Executado às 02h00 via BullMQ com 50% de desconto.
   */
  async runChurnAnalysis(tenantId: string): Promise<void> {
    infraLogger.info({ tenantId }, 'Starting batch churn analysis');

    // Buscar clientes ativos para análise
    const { data: customers } = await supabase
      .from('customers')
      .select(`
        id, name, plan, monthly_value_cents,
        invoices!inner(due_date, status),
        tickets(created_at)
      `)
      .eq('tenant_id', tenantId)
      .eq('active', true);

    if (!customers || customers.length === 0) {
      infraLogger.info({ tenantId }, 'No customers found for churn analysis');
      return;
    }

    // Montar requisições batch
    const requests: BatchRequest[] = customers.map(c => {
      const overdueInvoices = (c.invoices as any[]).filter(
        i => i.status === 'overdue'
      );
      const recentTickets = (c.tickets as any[]).filter(t => {
        const ticketDate = new Date(t.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return ticketDate > thirtyDaysAgo;
      });

      return buildChurnRequest({
        id: c.id,
        name: c.name,
        plan: c.plan,
        monthlyValue: c.monthly_value_cents,
        ticketCount30d: recentTickets.length,
        lastPaymentDate: overdueInvoices.length > 0
          ? overdueInvoices[0].due_date
          : new Date().toISOString(),
        daysOverdue: overdueInvoices.length > 0
          ? Math.floor((Date.now() - new Date(overdueInvoices[0].due_date).getTime()) / 86400000)
          : 0,
        signalDrops30d: 0, // será preenchido via métricas de rede futuramente
      });
    });

    await this._executeBatch(tenantId, 'churn_analysis', requests, this._processChurnResults.bind(this));
  }

  /**
   * Classifica tickets sem categoria de um tenant.
   */
  async runTicketClassification(tenantId: string): Promise<void> {
    const { data: tickets } = await supabase
      .from('tickets')
      .select('id, title, description')
      .eq('tenant_id', tenantId)
      .is('category', null)
      .limit(100);

    if (!tickets || tickets.length === 0) return;

    const requests = tickets.map(t => buildTicketClassificationRequest({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
    }));

    await this._executeBatch(tenantId, 'ticket_classification', requests, this._processTicketResults.bind(this));
  }

  // ─── Core Batch Execution ──────────────────────────────────────────────────

  private async _executeBatch(
    tenantId: string,
    jobType: string,
    requests: BatchRequest[],
    resultProcessor: (results: unknown[], tenantId: string) => Promise<void>,
  ): Promise<void> {
    const tmpFile = path.join(process.cwd(), '.data', `batch_${tenantId}_${jobType}_${Date.now()}.jsonl`);

    try {
      // 1. Criar arquivo JSONL
      fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
      fs.writeFileSync(tmpFile, requests.map(r => JSON.stringify(r)).join('\n'));

      infraLogger.info({ tenantId, jobType, count: requests.length }, 'Batch JSONL created');

      // 2. Upload para OpenAI Files API
      const uploadedFile = await openai.files.create({
        file: fs.createReadStream(tmpFile),
        purpose: 'batch',
      });

      infraLogger.info({ fileId: uploadedFile.id }, 'Batch file uploaded');

      // 3. Criar Batch Job
      const batch = await openai.batches.create({
        input_file_id: uploadedFile.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
        metadata: { tenantId, jobType },
      });

      infraLogger.info({ batchId: batch.id }, 'Batch job created');

      // 4. Persistir batchId no Redis para polling
      await redis.setex(
        `batch:${batch.id}`,
        60 * 60 * 26, // 26h (um pouco mais que a janela de 24h)
        JSON.stringify({ tenantId, jobType, createdAt: new Date().toISOString() }),
      );

      // 5. Registrar no Supabase para auditoria
      await supabase.from('ai_batch_jobs').insert({
        id: batch.id,
        tenant_id: tenantId,
        job_type: jobType,
        request_count: requests.length,
        status: 'in_progress',
        created_at: new Date().toISOString(),
      });

    } finally {
      // Limpar arquivo temporário
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  /**
   * Polling: verificar e processar batch concluídos.
   * Chamado pelo BullMQ a cada 5 minutos.
   */
  async pollAndProcessCompletedBatches(): Promise<void> {
    const keys = await redis.keys('batch:*');
    if (keys.length === 0) return;

    for (const key of keys) {
      const batchData = await redis.get(key);
      if (!batchData) continue;

      const { tenantId, jobType } = JSON.parse(batchData);
      const batchId = key.replace('batch:', '');

      try {
        const batch = await openai.batches.retrieve(batchId);

        if (batch.status === 'completed') {
          infraLogger.info({ batchId, jobType }, 'Batch completed — downloading results');

          // Download dos resultados
          const outputFile = await openai.files.content(batch.output_file_id!);
          const rawText = await outputFile.text();
          const results = rawText
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
            .filter(r => r.response?.status_code === 200)
            .map(r => JSON.parse(r.response.body.choices[0].message.content));

          // Processar por tipo
          if (jobType === 'churn_analysis') {
            await this._processChurnResults(results, tenantId);
          } else if (jobType === 'ticket_classification') {
            await this._processTicketResults(results, tenantId);
          }

          // Atualizar status no Supabase
          await supabase
            .from('ai_batch_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', batchId);

          // Remover do Redis
          await redis.del(key);

        } else if (batch.status === 'failed') {
          infraLogger.error({ batchId, error: batch.errors }, 'Batch failed');
          await supabase
            .from('ai_batch_jobs')
            .update({ status: 'failed', error_details: batch.errors as any })
            .eq('id', batchId);
          await redis.del(key);
        }
        // se 'in_progress': continuar polling

      } catch (err) {
        infraLogger.error({ err, batchId }, 'Error polling batch status');
      }
    }
  }

  // ─── Result Processors ────────────────────────────────────────────────────

  private async _processChurnResults(results: unknown[], tenantId: string): Promise<void> {
    for (const result of results) {
      try {
        const prediction = ChurnPredictionSchema.parse(result);

        await supabase.from('churn_predictions').upsert({
          customer_id: prediction.customer_id,
          tenant_id: tenantId,
          churn_probability: prediction.churn_probability,
          churn_risk: prediction.churn_risk,
          main_factors: prediction.main_factors,
          recommended_action: prediction.recommended_action,
          confidence_score: prediction.confidence_score,
          predicted_at: new Date().toISOString(),
        });

      } catch (err) {
        infraLogger.error({ err, result }, 'Invalid churn prediction schema — skipping');
      }
    }

    infraLogger.info({ tenantId, count: results.length }, 'Churn predictions persisted');
  }

  private async _processTicketResults(results: unknown[], tenantId: string): Promise<void> {
    for (const result of results) {
      try {
        const classification = TicketClassificationSchema.parse(result);

        await supabase
          .from('tickets')
          .update({
            category: classification.category,
            priority: classification.priority_suggestion,
            tags: classification.tags,
          })
          .eq('id', classification.ticket_id)
          .eq('tenant_id', tenantId);

      } catch (err) {
        infraLogger.error({ err, result }, 'Invalid ticket classification schema — skipping');
      }
    }

    infraLogger.info({ tenantId, count: results.length }, 'Ticket classifications updated');
  }
}

export const batchService = new BatchService();
