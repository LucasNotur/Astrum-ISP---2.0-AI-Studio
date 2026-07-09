import type { ERPProvider, ERPProviderName, ERPCredentials, HttpClient } from './erp.types';
import { IXCAdapter } from './ixc.adapter';
import { MKAuthAdapter } from './mkauth.adapter';
import { VoalleAdapter } from './voalle.adapter';
import { SGPAdapter } from './sgp.adapter';
import { HubsoftAdapter } from './hubsoft.adapter';

/**
 * ERP Factory — resolve o adapter certo por provider. Plano Mestre V2, S75.
 * IXC, MK-Auth, Voalle, SGP e Hubsoft implementados (P0-01..P0-05).
 * Radiusnet e Rbx entram incrementalmente.
 */

const IMPLEMENTED: Partial<Record<ERPProviderName, (c: ERPCredentials, h?: HttpClient) => ERPProvider>> = {
  ixc: (c, h) => new IXCAdapter(c, h),
  mkauth: (c, h) => new MKAuthAdapter(c, h),
  voalle: (c, h) => new VoalleAdapter(c, h),
  sgp: (c, h) => new SGPAdapter(c, h),
  hubsoft: (c, h) => new HubsoftAdapter(c, h),
};

export function isErpImplemented(provider: ERPProviderName): boolean {
  return provider in IMPLEMENTED;
}

export function createErpProvider(
  provider: ERPProviderName,
  creds: ERPCredentials,
  http?: HttpClient,
): ERPProvider {
  const build = IMPLEMENTED[provider];
  if (!build) throw new Error(`ERP provider não implementado ainda: ${provider}`);
  return build(creds, http);
}
