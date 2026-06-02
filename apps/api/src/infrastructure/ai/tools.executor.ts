import supabase from '../database/supabase.client';
import { suspensionQueue } from '../../../../../packages/queue/src/queues';
import { infraLogger } from '../logging/logger';

/**
 * Executor de ferramentas do Function Calling.
 * Conecta as decisões da IA com as ações reais no sistema.
 */
export class ToolsExecutor {
  constructor(private readonly tenantId: string) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    infraLogger.info({ toolName, args, tenantId: this.tenantId }, 'Executing tool');

    switch (toolName) {
      case 'suspend_signal':
        return this._suspendSignal(args);
      case 'check_invoice':
        return this._checkInvoice(args);
      case 'create_ticket':
        return this._createTicket(args);
      case 'query_knowledge_base':
        return this._queryKnowledgeBase(args);
      default:
        infraLogger.warn({ toolName }, 'Unknown tool called — ignoring');
        return { error: 'Ferramenta não reconhecida' };
    }
  }

  private async _suspendSignal(args: Record<string, unknown>) {
    const { customer_id, reason, scheduled_for } = args as {
      customer_id: string;
      reason: string;
      scheduled_for?: string;
    };

    // Registrar no audit log ANTES de executar (segurança)
    await supabase.from('audit_log').insert({
      tenant_id: this.tenantId,
      action: 'ai_suspend_signal',
      entity_id: customer_id,
      metadata: { reason, scheduled_for, triggered_by: 'ai_agent' },
    });

    // Agendar job BullMQ para suspensão
    await suspensionQueue.add('suspend_signal', {
      customerId: customer_id,
      tenantId: this.tenantId,
      reason,
      scheduledFor: scheduled_for,
    }, {
      delay: scheduled_for ? new Date(scheduled_for).getTime() - Date.now() : 0,
      priority: 10, // critical
    });

    return { success: true, message: `Suspensão agendada para ${customer_id}` };
  }

  private async _checkInvoice(args: Record<string, unknown>) {
    const { customer_id, include_overdue_only } = args as {
      customer_id: string;
      include_overdue_only: boolean;
    };

    let query = supabase
      .from('invoices')
      .select('id, amount_cents, due_date, status, paid_at')
      .eq('customer_id', customer_id)
      .eq('tenant_id', this.tenantId)
      .order('due_date', { ascending: false })
      .limit(5);

    if (include_overdue_only) {
      query = query.eq('status', 'overdue');
    }

    const { data, error } = await query;
    if (error) return { error: 'Erro ao consultar faturas' };

    return { invoices: data };
  }

  private async _createTicket(args: Record<string, unknown>) {
    const { customer_id, title, description, priority, category } = args as {
      customer_id: string;
      title: string;
      description: string;
      priority: string;
      category: string;
    };

    const { data, error } = await supabase.from('tickets').insert({
      tenant_id: this.tenantId,
      customer_id,
      title,
      description,
      priority,
      category,
      status: 'open',
      created_by: 'ai_agent',
    }).select('id').single();

    if (error) return { error: 'Erro ao criar ticket' };
    return { ticket_id: data.id, success: true };
  }

  private async _queryKnowledgeBase(args: Record<string, unknown>) {
    // Delegado ao RAG service — retorna contexto já processado
    const { query } = args as { query: string };
    return { query, message: 'RAG query delegated to rag-query.service' };
  }
}
