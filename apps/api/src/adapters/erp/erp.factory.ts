import type { ERPProvider, ERPProviderName, ERPCredentials, HttpClient } from './erp.types';
import type { OAuthTokenCache } from './erp-oauth-cache.service';
import { IXCAdapter } from './ixc.adapter';
import { MKAuthAdapter } from './mkauth.adapter';
import { VoalleAdapter } from './voalle.adapter';
import { SGPAdapter } from './sgp.adapter';
import { HubsoftAdapter } from './hubsoft.adapter';
import { RadiusNetAdapter } from './radiusnet.adapter';
import { RBXAdapter } from './rbx.adapter';

/**
 * ERP Factory — resolve o adapter certo por provider. Plano Mestre V2, S75.
 * 7/7 adapters implementados: IXC, MK-Auth, Voalle, SGP, Hubsoft, RadiusNet, RBX.
 *
 * `tokenCache` (4º parâmetro, opcional) só é usado pelos adapters OAuth
 * (voalle/hubsoft/mkauth) — os demais ignoram. Ver `erp-oauth-cache.service.ts`:
 * sem ele, cada chamada aqui é uma instância nova sem cache persistente entre
 * si, então o modo OAuth reautenticaria do zero quase toda operação.
 */

const IMPLEMENTED: Partial<Record<ERPProviderName, (c: ERPCredentials, h?: HttpClient, tc?: OAuthTokenCache) => ERPProvider>> = {
  ixc: (c, h) => new IXCAdapter(c, h),
  mkauth: (c, h, tc) => new MKAuthAdapter(c, h, tc),
  voalle: (c, h, tc) => new VoalleAdapter(c, h, tc),
  sgp: (c, h) => new SGPAdapter(c, h),
  hubsoft: (c, h, tc) => new HubsoftAdapter(c, h, tc),
  radiusnet: (c, h) => new RadiusNetAdapter(c, h),
  rbx: (c, h) => new RBXAdapter(c, h),
};

export function isErpImplemented(provider: ERPProviderName): boolean {
  return provider in IMPLEMENTED;
}

export function createErpProvider(
  provider: ERPProviderName,
  creds: ERPCredentials,
  http?: HttpClient,
  tokenCache?: OAuthTokenCache,
): ERPProvider {
  const build = IMPLEMENTED[provider];
  if (!build) throw new Error(`ERP provider não implementado ainda: ${provider}`);
  return build(creds, http, tokenCache);
}
