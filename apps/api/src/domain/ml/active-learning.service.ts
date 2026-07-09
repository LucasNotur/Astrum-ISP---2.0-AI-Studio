import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export type ExampleSource =
  | 'safety_review'
  | 'feedback'
  | 'replay_resolution'
  | 'ocr_correction'
  | 'manual';

export interface RecordExampleInput {
  tenantId: string;
  source: ExampleSource;
  input: string;
  output?: string;
  label?: string;
  payload?: Record<string, unknown>;
}

export function recordExample(input: RecordExampleInput): void {
  _recordExampleAsync(input).catch((err) => {
    infraLogger.warn(
      { tenantId: input.tenantId, source: input.source, err: (err as Error).message },
      '[active-learning] fire-and-forget falhou',
    );
  });
}

async function _recordExampleAsync(input: RecordExampleInput): Promise<void> {
  if (!isActiveLearningEnabled()) return;

  const { error } = await supabaseAdmin
    .from('labeled_examples')
    .upsert(
      {
        tenant_id: input.tenantId,
        source: input.source,
        input: input.input,
        output: input.output ?? null,
        label: input.label ?? null,
        payload: input.payload ?? null,
        labeled_at: input.label ? new Date().toISOString() : null,
      },
      { onConflict: 'tenant_id,source,md5(input)' as any },
    );

  if (error) {
    infraLogger.warn(
      { tenantId: input.tenantId, source: input.source, err: error.message },
      '[active-learning] upsert falhou',
    );
  }
}

export function isActiveLearningEnabled(): boolean {
  return (process.env.ACTIVE_LEARNING_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export interface LabeledExample {
  id: string;
  source: ExampleSource;
  input: string;
  output: string | null;
  label: string | null;
  createdAt: string;
}

export async function getPendingExamples(
  tenantId: string,
  limit = 20,
): Promise<LabeledExample[]> {
  const { data, error } = await supabaseAdmin
    .from('labeled_examples')
    .select('id, source, input, output, label, created_at')
    .eq('tenant_id', tenantId)
    .is('label', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    source: d.source as ExampleSource,
    input: d.input,
    output: d.output,
    label: d.label,
    createdAt: d.created_at,
  }));
}

export async function labelExample(
  tenantId: string,
  exampleId: string,
  label: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('labeled_examples')
    .update({ label, labeled_at: new Date().toISOString() })
    .eq('id', exampleId)
    .eq('tenant_id', tenantId);

  return !error;
}

export async function exportExamples(
  tenantId: string,
  source?: ExampleSource,
  since?: string,
): Promise<LabeledExample[]> {
  let query = supabaseAdmin
    .from('labeled_examples')
    .select('id, source, input, output, label, created_at')
    .eq('tenant_id', tenantId)
    .not('label', 'is', null);

  if (source) query = query.eq('source', source);
  if (since) query = query.gte('created_at', since);

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error || !data) return [];

  const ids = data.map((d) => d.id);
  if (ids.length > 0) {
    await supabaseAdmin
      .from('labeled_examples')
      .update({ exported_at: new Date().toISOString() })
      .in('id', ids);
  }

  return data.map((d) => ({
    id: d.id,
    source: d.source as ExampleSource,
    input: d.input,
    output: d.output,
    label: d.label,
    createdAt: d.created_at,
  }));
}
