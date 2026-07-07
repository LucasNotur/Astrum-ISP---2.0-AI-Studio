/**
 * IA-27 — barrel de domain/ia.
 * Re-exporta as rotas que precisam ser registradas em server.ts.
 * (Padrão do projeto: o server.ts importa cada rota individualmente
 * para manter o boot explícito; este index fica como ponto de descoberta.)
 */

export { featuresRoutes } from './features.routes';
export { campaignsRoutes } from './campaigns.routes';
