import type { ERPProvider, ERPProviderName, ERPCredentials, HttpClient } from './erp.types';
import { IXCAdapter } from './ixc.adapter';
import { MKAuthAdapter } from './mkauth.adapter';

/**
 * ERP Factory — resolve o adapter certo por provider. Plano Mestre V2, S75.
 * Os 5 providers restantes (sgp, voalle, hubsoft, radiusnet, rbx) seguem o mesmo
 * padrão dos dois implementados (IXC, MK-Auth) e entram incrementalmente.
 */

const IMPLEMENTED: Partial<Record<ERPProviderName, (c: ERPCredentials, h?: HttpClient) => ERPProvider>> = {
  ixc: (c, h) => new IXCAdapter(c, h),
  mkauth: (c, h) => new MKAuthAdapter(c, h),
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
