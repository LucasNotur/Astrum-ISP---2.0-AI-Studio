import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { updateElo } from './elo';

export type MatchSource = 'replay' | 'eval' | 'manual';

export interface RecordMatchInput {
  tenantId: string;
  winnerKey: string;
  loserKey: string;
  draw: boolean;
  source: MatchSource;
  refId: string;
}

async function ensureContender(tenantId: string, key: string): Promise<{ rating: number }> {
  const { data } = await supabaseAdmin
    .from('elo_contenders')
    .select('rating')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();

  if (data) return { rating: Number(data.rating) };

  const { data: created, error } = await supabaseAdmin
    .from('elo_contenders')
    .upsert({ tenant_id: tenantId, key, rating: 1000, games: 0 }, { onConflict: 'tenant_id,key' })
    .select('rating')
    .single();

  if (error) {
    infraLogger.warn({ tenantId, key, err: error.message }, '[elo] ensureContender failed');
    return { rating: 1000 };
  }
  return { rating: Number(created.rating) };
}

export async function recordMatch(input: RecordMatchInput): Promise<boolean> {
  const { tenantId, winnerKey, loserKey, draw, source, refId } = input;

  const { data: existing } = await supabaseAdmin
    .from('elo_matches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('ref_id', refId)
    .maybeSingle();

  if (existing) {
    infraLogger.debug({ tenantId, refId }, '[elo] match already recorded (idempotent)');
    return false;
  }

  const [winner, loser] = await Promise.all([
    ensureContender(tenantId, winnerKey),
    ensureContender(tenantId, loserKey),
  ]);

  const result: 1 | 0.5 = draw ? 0.5 : 1;
  const [newWinnerRating, newLoserRating] = updateElo(winner.rating, loser.rating, result);

  const { error: matchError } = await supabaseAdmin
    .from('elo_matches')
    .insert({
      tenant_id: tenantId,
      winner_key: winnerKey,
      loser_key: loserKey,
      draw,
      source,
      ref_id: refId,
    });

  if (matchError) {
    infraLogger.error({ tenantId, err: matchError.message }, '[elo] insert match failed');
    return false;
  }

  await Promise.all([
    supabaseAdmin
      .from('elo_contenders')
      .update({ rating: newWinnerRating })
      .eq('tenant_id', tenantId)
      .eq('key', winnerKey),
    supabaseAdmin
      .from('elo_contenders')
      .update({ rating: newLoserRating })
      .eq('tenant_id', tenantId)
      .eq('key', loserKey),
  ]);

  infraLogger.info(
    { tenantId, winnerKey, loserKey, draw, source, newWinnerRating, newLoserRating },
    '[elo] match recorded',
  );
  return true;
}

export interface EloContender {
  key: string;
  rating: number;
  games: number;
}

export async function getRanking(tenantId: string): Promise<EloContender[]> {
  const { data, error } = await supabaseAdmin
    .from('elo_contenders')
    .select('key, rating, games')
    .eq('tenant_id', tenantId)
    .order('rating', { ascending: false });

  if (error || !data) return [];
  return data.map(d => ({
    key: d.key,
    rating: Number(d.rating),
    games: d.games,
  }));
}

export interface PendingDivergence {
  itemId: string;
  originalResponse: string;
  candidateResponse: string;
  userMessage: string;
}

export async function getPending(tenantId: string): Promise<PendingDivergence[]> {
  const { data, error } = await supabaseAdmin
    .from('replay_items')
    .select('id, original_response, candidate_response, user_message')
    .eq('tenant_id', tenantId)
    .eq('verdict', 'divergent')
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error || !data) return [];
  return data.map(d => ({
    itemId: d.id,
    originalResponse: d.original_response,
    candidateResponse: d.candidate_response,
    userMessage: d.user_message,
  }));
}
