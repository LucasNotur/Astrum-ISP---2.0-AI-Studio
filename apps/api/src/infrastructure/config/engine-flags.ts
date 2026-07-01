/**
 * Engine Flags — controle de qual implementação (legado vs v2) está ativa por domínio.
 *
 * Contexto (Plano Mestre V2, S68 — Contenção):
 * Durante a migração Strangler Fig, o mesmo domínio (cobrança, atendimento) existe
 * em duas frentes que NÃO se enxergam. Se ambas subirem, há risco de disparo duplo
 * (ex.: cobrança dupla). Estas flags garantem que apenas UMA engine por domínio
 * esteja ativa em produção, de forma reversível (rollback = trocar a env).
 *
 * Regra R6 do plano: até a S76, apenas UMA engine CobrAI pode estar ativa.
 *
 * Sem dependências externas de propósito — lê apenas process.env, para poder ser
 * importado tanto pelo backend novo (apps/api) quanto pelo legado (/src) no load.
 */

export type EngineTarget = 'legacy' | 'v2';

const VALID_TARGETS: readonly EngineTarget[] = ['legacy', 'v2'];

function normalize(raw: string | undefined, fallback: EngineTarget): EngineTarget {
  const value = (raw ?? '').trim().toLowerCase();
  return (VALID_TARGETS as string[]).includes(value) ? (value as EngineTarget) : fallback;
}

/**
 * Engine ativa para a régua de cobrança (CobrAI).
 * Default: 'legacy' — é quem tem os dados reais em produção até o cutover (S76).
 */
export function getCobraiEngine(): EngineTarget {
  return normalize(process.env.COBRAI_ENGINE, 'legacy');
}

/**
 * Engine ativa para o fluxo de atendimento (webhook + messageWorker).
 * Default: 'legacy' — cutover acontece na S74.
 */
export function getAtendimentoEngine(): EngineTarget {
  return normalize(process.env.ATENDIMENTO_ENGINE, 'legacy');
}

/** True se a engine de cobrança ativa é a passada em `target`. */
export function isCobraiEngineActive(target: EngineTarget): boolean {
  return getCobraiEngine() === target;
}

/** True se a engine de atendimento ativa é a passada em `target`. */
export function isAtendimentoEngineActive(target: EngineTarget): boolean {
  return getAtendimentoEngine() === target;
}

/**
 * Decide se um worker deve subir. Retorna true se a engine dele é a ativa.
 * Quando false, o chamador NÃO deve instanciar o worker (evita disparo duplo).
 * O `log` é injetável para não acoplar a nenhum logger específico.
 */
export function shouldBootWorker(
  domain: 'cobrai' | 'atendimento',
  self: EngineTarget,
  log: (msg: string) => void = () => {},
): boolean {
  const active = domain === 'cobrai' ? getCobraiEngine() : getAtendimentoEngine();
  const boot = active === self;
  if (!boot) {
    log(
      `[engine-flags] Worker ${domain}/${self} NÃO iniciado: engine ativa é '${active}'. ` +
        `Ajuste ${domain === 'cobrai' ? 'COBRAI_ENGINE' : 'ATENDIMENTO_ENGINE'} para '${self}' para ativá-lo.`,
    );
  }
  return boot;
}
