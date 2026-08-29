/**
 * P3-02 — Subgrafo especializado em vendas.
 *
 * Orquestra o funil conversacional: lead → viabilidade → planos → coleta de dados
 * → pré-cadastro ERP → agendamento de instalação → contrato digital.
 *
 * Cada turno lê o estágio atual do lead (sales_leads), avança um passo e gera
 * uma resposta contextual. O estado é persistido no Supabase entre turnos.
 */
import { generateText, generateObject } from 'ai';
import { withFailover } from '../../../infrastructure/ai/providers/model-router';
import { z } from 'zod';
import type { MultiAgentState } from '../multi-agent.state';
import {
  getOrCreateLead,
  updateLead,
  checkViability,
  getAvailablePlans,
  registerLeadInErp,
  scheduleInstallation,
  defaultFunnelDb,
  type SalesFunnelDb,
  type SalesLead,
  type SalesFunnelStage,
} from '../../vendas/sales-funnel.service';
import { sendContract, type ContractHttpClient } from '../../vendas/contract.service';
import {
  computeLtvOffer,
  computeCtOccupancy,
  occupancyPctFromPorts,
  defaultCtoDb,
  type CtoDB,
  type LtvOfferResult,
} from '../../vendas/ltv-offer.service';
import { infraLogger } from '../../../infrastructure/logging/logger';
import type { ErpPlan } from '../../../adapters/erp/erp.types';

// CTO do grafo local usa UUID (network_ctos.id); a do ERP usa o id nativo do ERP
// (id_caixa_optica/id_cto/nearestCtoId), que NÃO casa com network_ctos. Só vale
// consultar computeCtOccupancy quando o id é um UUID local.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isLocalCtoId = (id: string): boolean => UUID_RE.test(id.trim());

export interface VendasSubgraphDeps {
  funnelDb?: SalesFunnelDb;
  ctoDb?: CtoDB;
  checkViabilityFn?: typeof checkViability;
  getPlansFn?: typeof getAvailablePlans;
  registerLeadFn?: typeof registerLeadInErp;
  scheduleInstallationFn?: typeof scheduleInstallation;
  sendContractFn?: typeof sendContract;
  generateTextFn?: typeof generateText;
  contractHttp?: ContractHttpClient;
  computeLtvOfferFn?: typeof computeLtvOffer;
  computeCtOccupancyFn?: typeof computeCtOccupancy;
  extractPlanSelectionFn?: typeof extractPlanSelection;
}

export async function runVendasSubgraph(
  state: MultiAgentState,
  deps: VendasSubgraphDeps = {},
): Promise<Partial<MultiAgentState>> {
  const { tenantId, conversationId, userMessage } = state;

  const db = deps.funnelDb ?? defaultFunnelDb;
  const ctoDb = deps.ctoDb ?? defaultCtoDb;
  const doCheckViability = deps.checkViabilityFn ?? checkViability;
  const doGetPlans = deps.getPlansFn ?? getAvailablePlans;
  const doRegisterLead = deps.registerLeadFn ?? registerLeadInErp;
  const doSchedule = deps.scheduleInstallationFn ?? scheduleInstallation;
  const doSendContract = deps.sendContractFn ?? sendContract;
  const generate = deps.generateTextFn ?? generateText;
  const doComputeLtvOffer = deps.computeLtvOfferFn ?? computeLtvOffer;
  const doComputeCtOccupancy = deps.computeCtOccupancyFn ?? computeCtOccupancy;
  const doExtractPlanSelection = deps.extractPlanSelectionFn ?? extractPlanSelection;

  try {
    const lead = await getOrCreateLead(db, tenantId, conversationId);
    infraLogger.info({ tenantId, conversationId, stage: lead.stage }, 'Subgrafo vendas iniciado');

    switch (lead.stage) {
      case 'collecting_address': {
        const extracted = await extractAddress(userMessage);
        if (!extracted) {
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `O cliente enviou: "${userMessage}"\nPeça o endereço completo para verificar a cobertura (rua, número, bairro, cidade).`,
          }), tenantId);
          return response(text, state.steps, 'vendas_collecting_address');
        }
        await updateLead(db, lead.id, { stage: 'checking_viability', address: extracted });
        return await handleViability({ ...lead, stage: 'checking_viability', address: extracted }, state, deps, db, doCheckViability, doGetPlans, generate, tenantId);
      }

      case 'checking_viability': {
        return await handleViability(lead, state, deps, db, doCheckViability, doGetPlans, generate, tenantId);
      }

      case 'presenting_plans': {
        const plans = await doGetPlans(tenantId, db);
        if (plans.length === 0) {
          infraLogger.warn({ tenantId, leadId: lead.id }, 'vendas: presenting_plans sem planos disponíveis — escalando para humano');
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Não consegui carregar os planos disponíveis agora. Informe que um atendente vai continuar o atendimento e passar as opções.`,
          }), tenantId);
          return { response: text, requiresHuman: true, steps: [...state.steps, 'vendas_no_plans'] };
        }
        const extracted = await doExtractPlanSelection(userMessage, plans);
        if (!extracted) {
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Planos disponíveis: ${formatPlans(plans)}\nO cliente enviou: "${userMessage}"\nAjude-o a escolher um plano.`,
          }), tenantId);
          return response(text, state.steps, 'vendas_presenting_plans');
        }

        // D-07 — calcular LTV + ocupação da CTO para calibrar a oferta.
        // Ocupação prefere as contagens de porta do PRÓPRIO result de viabilidade
        // (funciona pro path ERP e pro grafo local, sem depender de mapear o id da
        // CTO do ERP → network_ctos.id). Só cai no lookup em network_ctos quando o
        // ctoId é UUID local (grafo local, ou leads antigos sem totalPorts
        // persistido); com um id de ERP esse lookup nunca casaria. Sem % de
        // ocupação, o computeLtvOffer usa portas livres como proxy (path ERP).
        const viabilityRaw = lead.viability_raw as any;
        const ctoId: string | undefined = viabilityRaw?.ctoId;
        const availablePorts: number | null =
          typeof viabilityRaw?.availablePorts === 'number' ? viabilityRaw.availablePorts : null;
        const totalPorts: number | null =
          typeof viabilityRaw?.totalPorts === 'number' ? viabilityRaw.totalPorts : null;

        let ctoOccupancyPct = occupancyPctFromPorts(totalPorts, availablePorts);
        if (ctoOccupancyPct === null && ctoId && isLocalCtoId(ctoId)) {
          ctoOccupancyPct = await doComputeCtOccupancy(ctoDb, tenantId, ctoId);
        }
        const ltvOffer = doComputeLtvOffer({
          planPriceCents: extracted.priceCents,
          ctoOccupancyPct,
          ctoAvailablePorts: availablePorts,
        });

        await updateLead(db, lead.id, {
          stage: 'collecting_data',
          selected_plan_id: extracted.id,
          selected_plan_name: extracted.name,
          selected_plan_price_cents: extracted.priceCents,
          cto_occupancy_pct: ctoOccupancyPct,
          estimated_ltv_cents: ltvOffer.estimatedLtvCents,
          offer_tier: ltvOffer.offerTier,
        });
        infraLogger.info(
          { tenantId, leadId: lead.id, offerTier: ltvOffer.offerTier, ltvCents: ltvOffer.estimatedLtvCents, ctoOccupancyPct },
          'D-07 oferta calibrada',
        );

        const { text } = await withFailover('mini', (model) => generate({
          model: model as any,
          system: SYSTEM_VENDAS,
          prompt: `Cliente selecionou: ${extracted.name}. [Contexto interno — não revelar ao cliente: ${ltvOffer.offerNotes}] Agora colete: nome completo, CPF, e-mail e telefone. Peça tudo de uma vez.`,
        }), tenantId);
        return response(text, state.steps, 'vendas_collecting_data');
      }

      case 'collecting_data': {
        const data = await extractPersonalData(userMessage, lead);
        if (!isDataComplete(data)) {
          const missing = missingFields(data);
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Coletando dados do lead. Falta: ${missing.join(', ')}. Mensagem do cliente: "${userMessage}". Peça os dados faltantes.`,
          }), tenantId);
          await updateLead(db, lead.id, { stage: 'collecting_data', ...partialData(data) });
          return response(text, state.steps, 'vendas_collecting_data');
        }

        // Todos os dados coletados → registrar no ERP.
        const fullLead: SalesLead = { ...lead, ...partialData(data) };
        await updateLead(db, lead.id, { stage: 'registering', ...partialData(data) });

        try {
          const { erpLeadId } = await doRegisterLead(tenantId, fullLead, db);
          await updateLead(db, lead.id, { stage: 'scheduling', erp_lead_id: erpLeadId });

          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Pré-cadastro concluído (ID ERP: ${erpLeadId}). Pergunte a data preferida para instalação (informe que é de segunda a sábado, horário comercial).`,
          }), tenantId);
          return response(text, state.steps, 'vendas_scheduling');
        } catch (err) {
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Houve um problema técnico no cadastro. Informe ao cliente que um atendente entrará em contato para finalizar.`,
          }), tenantId);
          return { response: text, requiresHuman: true, steps: [...state.steps, 'vendas_register_error'] };
        }
      }

      case 'scheduling': {
        const dateStr = await extractDate(userMessage);
        if (!dateStr) {
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `O cliente enviou: "${userMessage}". Peça uma data específica para a instalação, de hoje em diante (ex.: "segunda-feira dia 15/07/2026, pela manhã"). Se ele tiver informado uma data que já passou, explique gentilmente que precisa ser uma data futura.`,
          }), tenantId);
          return response(text, state.steps, 'vendas_scheduling');
        }

        try {
          const { orderId } = await doSchedule(tenantId, lead, dateStr, db);
          await updateLead(db, lead.id, {
            stage: 'completed',
            installation_order_id: orderId,
            installation_scheduled_for: dateStr,
          });

          // P3-03 — tentar enviar contrato digital.
          let contractMsg = '';
          if (lead.email || lead.phone) {
            const contractResult = await doSendContract({
              tenantId,
              leadId: lead.id,
              signerName: lead.full_name ?? 'Cliente',
              signerCpf: lead.cpf ?? '',
              signerEmail: lead.email ?? undefined,
              signerPhone: lead.phone ?? undefined,
              address: lead.address ?? '',
              planName: lead.selected_plan_name ?? '',
              planPriceCents: lead.selected_plan_price_cents ?? 0,
            }, deps.contractHttp);

            if (contractResult.contractUrl) {
              await updateLead(db, lead.id, {
                stage: 'completed',
                contract_status: contractResult.status === 'sent' ? 'pending_signature' : contractResult.status as any,
                contract_url: contractResult.contractUrl,
                contract_provider: contractResult.provider,
              });
              contractMsg = ` O contrato foi enviado para ${lead.email ?? 'o seu WhatsApp'} — assine digitalmente para confirmar.`;
            }
          }

          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Instalação agendada para ${dateStr} (OS: ${orderId}).${contractMsg} Confirme ao cliente e deseje boas-vindas.`,
          }), tenantId);
          return response(text, state.steps, 'vendas_completed');
        } catch (err) {
          const { text } = await withFailover('mini', (model) => generate({
            model: model as any,
            system: SYSTEM_VENDAS,
            prompt: `Erro ao agendar instalação. Informe o cliente e transfira para atendimento humano.`,
          }), tenantId);
          return { response: text, requiresHuman: true, steps: [...state.steps, 'vendas_schedule_error'] };
        }
      }

      case 'viability_failed': {
        const { text } = await withFailover('mini', (model) => generate({
          model: model as any,
          system: SYSTEM_VENDAS,
          prompt: `Infelizmente não há cobertura no endereço cadastrado. Ofereça cadastrar o interesse para contato futuro.`,
        }), tenantId);
        return response(text, state.steps, 'vendas_viability_failed');
      }

      case 'completed': {
        const { text } = await withFailover('mini', (model) => generate({
          model: model as any,
          system: SYSTEM_VENDAS,
          prompt: `O contrato do cliente já está em andamento. Confirme o status e ofereça ajuda adicional.`,
        }), tenantId);
        return response(text, state.steps, 'vendas_already_completed');
      }

      default: {
        return { response: 'Vou conectar você com um atendente para prosseguir com a contratação.', requiresHuman: true, steps: [...state.steps, 'vendas_unknown_stage'] };
      }
    }
  } catch (err) {
    infraLogger.warn({ err, tenantId, conversationId }, 'Subgrafo vendas falhou — fail-open');
    return {
      response: 'Desculpe, tive um problema ao processar sua solicitação de contratação. Um atendente irá ajudá-lo.',
      requiresHuman: true,
      steps: [...state.steps, 'vendas_subgraph_error'],
    };
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function handleViability(
  lead: SalesLead,
  state: MultiAgentState,
  _deps: VendasSubgraphDeps,
  db: SalesFunnelDb,
  doCheckViability: typeof checkViability,
  doGetPlans: typeof getAvailablePlans,
  generate: typeof generateText,
  tenantId: string,
): Promise<Partial<MultiAgentState>> {
  const result = await doCheckViability(tenantId, lead.address!, db);
  // Persiste a ViabilityResult normalizada inteira (não só `.raw`): o estágio
  // `presenting_plans` lê `viability_raw.ctoId` num turno posterior pra calibrar a
  // oferta D-07 (computeCtOccupancy). Guardar apenas `result.raw` (payload cru do ERP,
  // sem `ctoId` no topo) fazia esse ctoId ser sempre undefined → tier 'promotional'
  // nunca era alcançado. O payload cru continua acessível em `viability_raw.raw`.
  await updateLead(db, lead.id, {
    stage: result.available ? 'presenting_plans' : 'viability_failed',
    viability_raw: (result as unknown) ?? null,
  });

  if (!result.available) {
    const { text } = await withFailover('mini', (model) => generate({
      model: model as any,
      system: SYSTEM_VENDAS,
      prompt: `Endereço: "${lead.address}". Infelizmente não há cobertura neste endereço ainda. Ofereça cadastrar interesse para ser avisado quando a cobertura chegar.`,
    }), tenantId);
    return response(text, state.steps, 'vendas_viability_failed');
  }

  const plans = await doGetPlans(tenantId, db);
  if (plans.length === 0) {
    infraLogger.warn({ tenantId, leadId: lead.id, address: lead.address }, 'vendas: viabilidade OK mas nenhum plano disponível — escalando para humano');
    const { text } = await withFailover('mini', (model) => generate({
      model: model as any,
      system: SYSTEM_VENDAS,
      prompt: `Há cobertura no endereço "${lead.address}", mas não consegui carregar os planos disponíveis agora. Informe que um atendente vai passar as opções em instantes.`,
    }), tenantId);
    return { response: text, requiresHuman: true, steps: [...state.steps, 'vendas_no_plans'] };
  }
  const { text } = await withFailover('mini', (model) => generate({
    model: model as any,
    system: SYSTEM_VENDAS,
    prompt: `Ótima notícia! Há cobertura no endereço "${lead.address}"${result.ctoName ? ` (via CTO: ${result.ctoName})` : ''}. Apresente os planos disponíveis e peça para o cliente escolher:\n\n${formatPlans(plans)}`,
  }), tenantId);
  return response(text, state.steps, 'vendas_presenting_plans');
}

async function extractAddress(message: string): Promise<string | null> {
  try {
    const { object } = await withFailover('mini', (model) => generateObject({
      model: model as any,
      schema: z.object({
        address: z.string().nullable().describe('Endereço completo extraído da mensagem ou null se não informado'),
        hasAddress: z.boolean().describe('true se a mensagem contém um endereço válido'),
      }),
      system: 'Extraia o endereço de instalação da mensagem do usuário.',
      prompt: message,
    }));
    return object.hasAddress && object.address ? object.address : null;
  } catch {
    return null;
  }
}

async function extractPlanSelection(message: string, plans: ErpPlan[]): Promise<ErpPlan | null> {
  if (!plans.length) return null;
  try {
    const { object } = await withFailover('mini', (model) => generateObject({
      model: model as any,
      schema: z.object({
        selectedPlanId: z.string().nullable().describe('ID do plano selecionado ou null se não houve seleção clara'),
      }),
      system: `Planos disponíveis: ${JSON.stringify(plans.map(p => ({ id: p.id, name: p.name })))}.\nIdentifique qual plano o cliente está selecionando.`,
      prompt: message,
    }));
    if (!object.selectedPlanId) return null;
    return plans.find(p => p.id === object.selectedPlanId) ?? null;
  } catch {
    return null;
  }
}

async function extractPersonalData(
  message: string,
  existing: SalesLead,
): Promise<Partial<Pick<SalesLead, 'full_name' | 'cpf' | 'email' | 'phone'>>> {
  try {
    const { object } = await withFailover('mini', (model) => generateObject({
      model: model as any,
      schema: z.object({
        full_name: z.string().nullable(),
        cpf: z.string().nullable().describe('CPF numérico (11 dígitos) ou null'),
        email: z.string().nullable(),
        phone: z.string().nullable().describe('Telefone com DDD ou null'),
      }),
      system: 'Extraia dados pessoais da mensagem (nome completo, CPF, e-mail, telefone). Retorne null para campos não presentes.',
      prompt: message,
    }));
    return {
      full_name: object.full_name ?? existing.full_name ?? null,
      cpf: object.cpf ?? existing.cpf ?? null,
      email: object.email ?? existing.email ?? null,
      phone: object.phone ?? existing.phone ?? null,
    };
  } catch {
    return {};
  }
}

/**
 * Aceita a data só se for hoje ou no futuro (ISO `YYYY-MM-DD`, comparação
 * lexicográfica). Rejeita datas passadas (ex.: cliente diz "ontem" ou uma data
 * de mês já vencido) devolvendo null — o estágio de agendamento então re-pergunta
 * por uma data válida em vez de abrir uma OS no passado.
 */
export function parseFutureDate(isoDate: string | null | undefined, today: string): string | null {
  if (!isoDate) return null;
  return isoDate >= today ? isoDate : null;
}

async function extractDate(message: string): Promise<string | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { object } = await withFailover('mini', (model) => generateObject({
      model: model as any,
      schema: z.object({
        isoDate: z.string().nullable().describe(`Data no formato YYYY-MM-DD ou null. Hoje é ${today}. Nunca retorne uma data anterior a hoje.`),
      }),
      system: `Extraia a data de agendamento da mensagem. Hoje é ${today}. Datas de instalação devem ser de hoje em diante.`,
      prompt: message,
    }));
    return parseFutureDate(object.isoDate, today);
  } catch {
    return null;
  }
}

function isDataComplete(d: Partial<Pick<SalesLead, 'full_name' | 'cpf' | 'email' | 'phone'>>): boolean {
  return !!(d.full_name && d.cpf && d.phone);
}

function missingFields(d: Partial<Pick<SalesLead, 'full_name' | 'cpf' | 'email' | 'phone'>>): string[] {
  const missing: string[] = [];
  if (!d.full_name) missing.push('nome completo');
  if (!d.cpf) missing.push('CPF');
  if (!d.phone) missing.push('telefone');
  return missing;
}

function partialData(d: Partial<SalesLead>): Partial<SalesLead> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v != null)) as Partial<SalesLead>;
}

function formatPlans(plans: ErpPlan[]): string {
  if (!plans.length) return '(nenhum plano disponível)';
  return plans
    .map(p => {
      const price = (p.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return `• ${p.name}: ${p.downloadMbps}/${p.uploadMbps} Mbps — ${price}/mês`;
    })
    .join('\n');
}

function response(text: string, steps: string[], step: string): Partial<MultiAgentState> {
  return { response: text, subGraphResult: text, steps: [...steps, step] };
}

const SYSTEM_VENDAS = `Você é um consultor de vendas de um ISP. Seja amigável, claro e objetivo.
Regras:
- Nunca prometa preços, datas ou condições diferentes das apresentadas.
- Colete apenas os dados necessários para a contratação.
- Se o cliente demonstrar dúvida, esclareça antes de avançar.
- Use linguagem simples e evite termos técnicos desnecessários.`;
