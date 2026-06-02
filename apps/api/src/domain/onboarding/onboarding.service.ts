import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { hashPassword } from '../../infrastructure/auth/password.service';
import { createDefaultCobraiRules } from '../cobranca/cobrai-rules.service';
import { ensureCollection } from '../../adapters/vector/qdrant.adapter';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Tenant Onboarding Service — orquestra o cadastro completo de um novo ISP.
 *
 * ETAPAS (em ordem):
 * 1. Criar tenant no banco
 * 2. Criar usuário admin
 * 3. Criar configuração de IA padrão
 * 4. Criar regras CobrAI padrão
 * 5. Provisionar coleção Qdrant (RAG)
 * 6. Registrar no audit log
 *
 * TRANSAÇÕES: Supabase não tem transações multi-tabela via JS SDK.
 * Se qualquer etapa falhar, o erro é capturado e o tenant é marcado
 * como 'incomplete' para reprocessamento.
 */

export interface OnboardingRequest {
  // Dados do ISP
  tenantName: string;
  tenantSlug: string;
  plan: 'starter' | 'pro' | 'enterprise';

  // Dados do admin
  adminName: string;
  adminEmail: string;
  adminPassword: string;

  // Configuração inicial do bot
  botName?: string;
  botPersonality?: string;
}

export interface OnboardingResult {
  tenantId: string;
  adminUserId: string;
  success: boolean;
  completedSteps: string[];
  failedStep?: string;
  error?: string;
}

export async function onboardNewTenant(
  req: OnboardingRequest
): Promise<OnboardingResult> {
  const completedSteps: string[] = [];
  let tenantId = '';
  let adminUserId = '';

  infraLogger.info({ tenantSlug: req.tenantSlug, plan: req.plan }, 'Iniciando onboarding de novo tenant');

  try {
    // ETAPA 1: Criar tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({
        name: req.tenantName,
        slug: req.tenantSlug,
        plan: req.plan,
        active: true,
        settings: { onboarding_complete: false },
      })
      .select('id')
      .single();

    if (tenantError || !tenant) {
      throw new Error(`Erro ao criar tenant: ${tenantError?.message}`);
    }

    tenantId = tenant.id;
    completedSteps.push('tenant_created');
    infraLogger.info({ tenantId }, 'Etapa 1/6: Tenant criado');

    // ETAPA 2: Criar usuário admin
    const passwordHash = await hashPassword(req.adminPassword);

    const { data: admin, error: adminError } = await supabaseAdmin
      .from('users')
      .insert({
        name: req.adminName,
        email: req.adminEmail.toLowerCase(),
        password_hash: passwordHash,
        role: 'admin',
        tenant_id: tenantId,
        active: true,
      })
      .select('id')
      .single();

    if (adminError || !admin) {
      throw new Error(`Erro ao criar admin: ${adminError?.message}`);
    }

    adminUserId = admin.id;
    completedSteps.push('admin_created');
    infraLogger.info({ tenantId, adminUserId }, 'Etapa 2/6: Admin criado');

    // ETAPA 3: Configuração de IA padrão
    const { error: aiError } = await supabaseAdmin
      .from('ai_configurations')
      .insert({
        tenant_id: tenantId,
        bot_name: req.botName ?? 'Astro',
        personality: req.botPersonality ?? 'profissional, prestativo e objetivo',
        language: 'pt-BR',
        temperature: 0.7,
        max_tokens_per_message: 1000,
        security_threshold: 0.7,
        auto_suspend_enabled: true,
        cobrai_enabled: true,
        rag_enabled: true,
      });

    if (aiError) {
      throw new Error(`Erro ao criar config de IA: ${aiError.message}`);
    }

    completedSteps.push('ai_config_created');
    infraLogger.info({ tenantId }, 'Etapa 3/6: Config de IA criada');

    // ETAPA 4: Regras CobrAI padrão
    await createDefaultCobraiRules(tenantId);
    completedSteps.push('cobrai_rules_created');
    infraLogger.info({ tenantId }, 'Etapa 4/6: Regras CobrAI criadas');

    // ETAPA 5: Provisionar coleção Qdrant para RAG
    await ensureCollection(tenantId);
    completedSteps.push('qdrant_collection_created');
    infraLogger.info({ tenantId }, 'Etapa 5/6: Coleção Qdrant provisionada');

    // ETAPA 6: Marcar onboarding como completo + audit log
    await supabaseAdmin
      .from('tenants')
      .update({ settings: { onboarding_complete: true } })
      .eq('id', tenantId);

    await supabaseAdmin.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: adminUserId,
      action: 'tenant_onboarded',
      metadata: {
        plan: req.plan,
        bot_name: req.botName ?? 'Astro',
        completed_steps: completedSteps.length + 1,
      },
    });

    completedSteps.push('onboarding_complete');
    infraLogger.info({ tenantId, adminUserId, stepsCompleted: completedSteps.length },
      '✅ Onboarding de tenant concluído com sucesso');

    return { tenantId, adminUserId, success: true, completedSteps };

  } catch (err: any) {
    const failedStep = completedSteps[completedSteps.length - 1] ?? 'initial';

    infraLogger.error(
      { tenantId, completedSteps, failedStep, err: err.message },
      '❌ Onboarding falhou — tenant marcado como incompleto'
    );

    // Marcar tenant como incompleto se foi criado
    if (tenantId) {
      await supabaseAdmin
        .from('tenants')
        .update({ settings: { onboarding_complete: false, failed_step: failedStep } })
        .eq('id', tenantId);
    }

    return {
      tenantId,
      adminUserId,
      success: false,
      completedSteps,
      failedStep,
      error: err.message,
    };
  }
}

/**
 * Verifica se um slug está disponível.
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();
  return !data;
}
