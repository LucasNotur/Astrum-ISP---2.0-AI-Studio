/**
 * Barrel de domain/ia.
 * Re-exporta as rotas que precisam ser registradas em server.ts.
 * (Padrão do projeto: o server.ts importa cada rota individualmente
 * para manter o boot explícito; este index fica como ponto de descoberta.)
 */

export { featuresRoutes } from './features.routes';
export { campaignsRoutes } from './campaigns.routes';
export { driftRoutes } from './drift.routes';
export { sandboxRoutes } from './sandbox.routes';
export { syntheticRoutes } from './synthetic.routes';
export { providersRoutes } from './providers.routes';
export { replayRoutes } from './replay.routes';
