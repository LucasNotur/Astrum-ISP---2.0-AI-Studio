import type { ERPProvider, ERPProviderName, ERPCredentials, HttpClient } from './erp.types';
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
 */

const IMPLEMENTED: Partial<Record<ERPProviderName, (c: ERPCredentials, h?: HttpClient) => ERPProvider>> = {
  ixc: (c, h) => new IXCAdapter(c, h),
  mkauth: (c, h) => new MKAuthAdapter(c, h),
  voalle: (c, h) => new VoalleAdapter(c, h),
  sgp: (c, h) => new SGPAdapter(c, h),
  hubsoft: (c, h) => new HubsoftAdapter(c, h),
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
): ERPProvider {
  const build = IMPLEMENTED[provider];
  if (!build) throw new Error(`ERP provider não implementado ainda: ${provider}`);
  return build(creds, http);
}
