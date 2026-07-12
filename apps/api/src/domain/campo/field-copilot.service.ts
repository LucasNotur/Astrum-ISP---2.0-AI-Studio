/**
 * D-06 Fase 1 — Copiloto de Campo: foto → diagnóstico → OS.
 *
 * Recebe a URL de uma foto tirada pelo técnico, chama classifyFieldPhoto (IA-04),
 * persiste o diagnóstico em field_photo_diagnoses e atualiza o ai_summary da OS
 * quando service_order_id for fornecido.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { classifyFieldPhoto } from '../../infrastructure/vision/vision.service';

export interface DiagnoseParams {
  tenantId: string;
  imageUrl: string;
  serviceOrderId?: string;
  ctoId?: string;
  technicianId?: string;
}

export interface DiagnoseResult {
  id: string;
  equipment: string;
  issue: string;
  severity: 'baixa' | 'media' | 'alta' | 'critica';
  recommendedAction: string;
  confidence: number;
  lowConfidence: boolean;
  attachedToOs: boolean;
}

export async function diagnosePlusAttach(params: DiagnoseParams): Promise<DiagnoseResult> {
  const { tenantId, imageUrl, serviceOrderId, ctoId, technicianId } = params;

  const classification = await classifyFieldPhoto(imageUrl, tenantId);

  const lowConfidence = !classification || classification.confidence < 0.6;

  const equipment = classification?.equipment ?? 'outro';
  const issue = classification?.issue ?? 'outro';
  const severity = (classification?.severity ?? 'baixa') as DiagnoseResult['severity'];
  const recommendedAction = classification?.recommended_action ?? 'Inspecionar manualmente — confiança insuficiente para diagnóstico automático.';
  const confidence = classification?.confidence ?? 0;

  const { data: inserted, error: insertErr } = await supabase
    .from('field_photo_diagnoses')
    .insert({
      tenant_id: tenantId,
      service_order_id: serviceOrderId ?? null,
      cto_id: ctoId ?? null,
      technician_id: technicianId ?? null,
      photo_url: imageUrl,
      equipment,
      issue,
      severity,
      recommended_action: recommendedAction,
      confidence,
      low_confidence: lowConfidence,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    infraLogger.error({ err: insertErr, tenantId }, 'D-06: failed to persist field_photo_diagnoses');
    throw new Error('Falha ao salvar diagnóstico de campo');
  }

  let attachedToOs = false;
  if (serviceOrderId) {
    const aiSummary = `[D-06 ${new Date().toISOString().slice(0, 10)}] Equipamento: ${equipment} · Problema: ${issue} · Severidade: ${severity} · Ação: ${recommendedAction}`;
    const { error: updateErr } = await supabase
      .from('service_orders')
      .update({ ai_summary: aiSummary, updated_at: new Date().toISOString() })
      .eq('id', serviceOrderId)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      infraLogger.warn({ err: updateErr, serviceOrderId }, 'D-06: could not update service_orders.ai_summary');
    } else {
      attachedToOs = true;
    }
  }

  infraLogger.info({ tenantId, diagnosisId: inserted.id, severity, serviceOrderId, attachedToOs }, 'D-06: field photo diagnosed');

  return {
    id: inserted.id,
    equipment,
    issue,
    severity,
    recommendedAction,
    confidence,
    lowConfidence,
    attachedToOs,
  };
}

export interface ListDiagnosesParams {
  tenantId: string;
  serviceOrderId?: string;
  ctoId?: string;
  limit?: number;
}

export interface DiagnoseSummary {
  id: string;
  photoUrl: string;
  equipment: string;
  issue: string;
  severity: string;
  recommendedAction: string;
  confidence: number;
  lowConfidence: boolean;
  createdAt: string;
}

export async function listDiagnoses(params: ListDiagnosesParams): Promise<DiagnoseSummary[]> {
  const { tenantId, serviceOrderId, ctoId, limit = 20 } = params;

  let query = supabase
    .from('field_photo_diagnoses')
    .select('id, photo_url, equipment, issue, severity, recommended_action, confidence, low_confidence, created_at')
    .eq('tenant_id', tenantId);

  if (serviceOrderId) query = (query as any).eq('service_order_id', serviceOrderId);
  if (ctoId) query = (query as any).eq('cto_id', ctoId);

  const { data, error } = await (query as any)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    infraLogger.warn({ err: error, tenantId }, 'D-06: listDiagnoses failed');
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    photoUrl: r.photo_url,
    equipment: r.equipment,
    issue: r.issue,
    severity: r.severity,
    recommendedAction: r.recommended_action,
    confidence: r.confidence,
    lowConfidence: r.low_confidence,
    createdAt: r.created_at,
  }));
}
