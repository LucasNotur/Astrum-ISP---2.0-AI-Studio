/**
 * D-05 — Memória Institucional Viva: KB que se escreve sozinha.
 *
 * Detecta conversas resolvidas com solução confirmada (sem reabertura em 7d),
 * gera rascunho de artigo via GPT-4o e coloca na fila de curadoria humana.
 * Curador aprova com 1 clique → artigo publicado no RAG automaticamente.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { callOpenAI } from '../../adapters/openai/openai.adapter';
import { aiProcessingQueue } from '../../../../../packages/queue/src/workers/indexing.worker';

export interface KbDraft {
  id: string;
  tenantId: string;
  conversationId: string | null;
  ticketId: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'published';
  draftTitle: string;
  draftBody: string;
  sourceSummary: string | null;
  generatedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedArticleId: string | null;
  createdAt: string;
}

export interface CandidateConversation {
  id: string;
  messageCount: number;
  lastMessage: string;
  resolvedAt: string;
}

function mapRow(row: Record<string, unknown>): KbDraft {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    conversationId: (row.conversation_id as string) ?? null,
    ticketId: (row.ticket_id as string) ?? null,
    status: row.status as KbDraft['status'],
    draftTitle: row.draft_title as string,
    draftBody: row.draft_body as string,
    sourceSummary: (row.source_summary as string) ?? null,
    generatedBy: row.generated_by as string,
    reviewedBy: (row.reviewed_by as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    publishedArticleId: (row.published_article_id as string) ?? null,
    createdAt: row.created_at as string,
  };
}

/** Conversas resolvidas ≥7 dias atrás, com ≥3 mensagens e sem rascunho gerado ainda. */
export async function findCandidateConversations(
  tenantId: string,
): Promise<CandidateConversation[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: convs, error } = await supabase
    .from('conversations')
    .select('id, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'resolved')
    .lt('updated_at', cutoff);

  if (error) throw new Error(`findCandidateConversations: ${error.message}`);
  if (!convs?.length) return [];

  const { data: existing } = await supabase
    .from('kb_drafts')
    .select('conversation_id')
    .eq('tenant_id', tenantId)
    .in('conversation_id', convs.map(c => c.id));

  const existingIds = new Set((existing ?? []).map((e: any) => e.conversation_id));
  const candidates = convs.filter(c => !existingIds.has(c.id));

  const results: CandidateConversation[] = [];
  for (const conv of candidates) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('content, role, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    if (!msgs || msgs.length < 3) continue;

    const lastMsg = msgs[msgs.length - 1]!;
    results.push({
      id: conv.id,
      messageCount: msgs.length,
      lastMessage: (lastMsg.content as string).slice(0, 200),
      resolvedAt: conv.updated_at as string,
    });
  }

  return results;
}

/** Carrega mensagens de uma conversa e gera rascunho de artigo via GPT-4o. */
export async function generateDraft(
  tenantId: string,
  conversationId: string,
  generatedBy = 'auto',
): Promise<KbDraft> {
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (msgErr) throw new Error(`generateDraft/messages: ${msgErr.message}`);
  if (!msgs?.length) throw new Error('Conversa sem mensagens');

  const transcript = (msgs as any[])
    .map(m => `[${m.role === 'user' ? 'cliente' : 'agente'}] ${m.content}`)
    .join('\n');

  const llmResponse = await callOpenAI({
    model: 'gpt-4o',
    tenantId,
    temperature: 0.3,
    max_tokens: 800,
    messages: [
      {
        role: 'system',
        content:
          'Você é um redator técnico de base de conhecimento de provedores de internet (ISP). ' +
          'Dado o histórico de uma conversa de atendimento resolvida, crie um artigo conciso e útil. ' +
          'Responda APENAS com JSON no formato: {"title": "...", "body": "...", "summary": "..."}. ' +
          'O body deve ter 2–5 parágrafos em markdown. O summary é uma frase de 1 linha.',
      },
      {
        role: 'user',
        content: `Histórico da conversa:\n\n${transcript}`,
      },
    ],
  });

  let parsed: { title: string; body: string; summary: string };
  try {
    parsed = JSON.parse(llmResponse.content);
  } catch {
    parsed = {
      title: 'Artigo gerado automaticamente',
      body: llmResponse.content,
      summary: 'Rascunho gerado a partir de conversa resolvida.',
    };
  }

  const { data: draft, error: insErr } = await supabase
    .from('kb_drafts')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      status: 'pending',
      draft_title: parsed.title,
      draft_body: parsed.body,
      source_summary: parsed.summary,
      generated_by: generatedBy,
    })
    .select()
    .single();

  if (insErr) throw new Error(`generateDraft/insert: ${insErr.message}`);

  infraLogger.info(
    { tenantId, conversationId, draftId: draft.id },
    'D-05: rascunho KB gerado',
  );

  return mapRow(draft);
}

export async function listDrafts(
  tenantId: string,
  status?: KbDraft['status'],
): Promise<KbDraft[]> {
  let q = supabase
    .from('kb_drafts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw new Error(`listDrafts: ${error.message}`);
  return (data ?? []).map(mapRow);
}

/** Aprova rascunho: publica em knowledge_articles (ingest_status=pending → indexing worker pega). */
export async function approveAndPublish(
  tenantId: string,
  draftId: string,
  reviewedBy: string,
): Promise<{ articleId: string }> {
  const { data: draft, error: fetchErr } = await supabase
    .from('kb_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !draft) throw new Error('Rascunho não encontrado');
  if (draft.status !== 'pending') throw new Error(`Rascunho com status=${draft.status} não pode ser aprovado`);

  const { data: article, error: artErr } = await supabase
    .from('knowledge_articles')
    .insert({
      tenant_id: tenantId,
      title: draft.draft_title,
      content: draft.draft_body,
      tags: ['auto-gerado', 'd05'],
      category: 'atendimento',
      ingest_status: 'pending',
    })
    .select('id')
    .single();

  if (artErr) throw new Error(`approveAndPublish/article: ${artErr.message}`);

  const { error: updErr } = await supabase
    .from('kb_drafts')
    .update({
      status: 'published',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      published_article_id: article.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId);

  if (updErr) throw new Error(`approveAndPublish/update: ${updErr.message}`);

  // Enfileira indexação RAG — indexing.worker pega e atualiza ingest_status='indexed'
  await aiProcessingQueue.add('index-article', {
    tenantId,
    documentId: article.id,   // campo obrigatório do tipo; reusado como fallback
    articleId: article.id,
    entityType: 'article',
    filename: draft.draft_title,
    fileType: 'md',
    textContent: `# ${draft.draft_title}\n\n${draft.draft_body}`,
  });

  infraLogger.info({ tenantId, draftId, articleId: article.id }, 'D-05: artigo publicado e enfileirado para RAG');
  return { articleId: article.id };
}

export async function rejectDraft(
  tenantId: string,
  draftId: string,
  reviewedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('kb_drafts')
    .update({
      status: 'rejected',
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('tenant_id', tenantId);

  if (error) throw new Error(`rejectDraft: ${error.message}`);
  infraLogger.info({ tenantId, draftId }, 'D-05: rascunho rejeitado');
}
