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
export { otelRoutes } from './otel.routes';
export { modelsRoutes } from './models.routes';
export { labelingRoutes } from './labeling.routes';
export { ocrReviewRoutes } from './ocr-review.routes';
export { mcpAdminRoutes } from './mcp-admin.routes';
export { browseAdminRoutes } from './browse-admin.routes';
export { constitutionRoutes } from './constitution.routes';
export { edgeRoutes } from './edge.routes';
export { latencyRoutes } from './latency.routes';
export { forecastRoutes } from './forecast.routes';
export { voiceQaRoutes } from './voice.routes';
export { voiceConsentRoutes } from './voice-consent.routes';
