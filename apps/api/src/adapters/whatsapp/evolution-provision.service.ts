/**
 * S91 — Auto-provisioning de instância Evolution API por tenant.
 * Cria a instância, configura webhook e retorna QR Code.
 * Ports injetáveis para teste.
 */

export interface EvolutionProvisionPorts {
  createInstance: (name: string, webhookUrl: string) => Promise<{ instanceId: string; qrCode?: string }>;
  setWebhook: (instanceName: string, url: string, hmacSecret: string) => Promise<void>;
  getQrCode: (instanceName: string) => Promise<string>;
  saveTenantInstance: (tenantId: string, instanceName: string, instanceId: string) => Promise<void>;
}

export interface ProvisionResult {
  instanceName: string;
  instanceId: string;
  qrCode?: string;
  webhookConfigured: boolean;
}

export async function provisionEvolutionInstance(
  tenantId: string,
  tenantSlug: string,
  ports: EvolutionProvisionPorts,
): Promise<ProvisionResult> {
  const instanceName = `astrum-${tenantSlug}`;
  const webhookUrl = `${process.env.PUBLIC_API_URL || 'https://api.astrumai.com.br'}/api/v2/webhook/evolution`;
  const hmacSecret = process.env.EVOLUTION_WEBHOOK_SECRET || '';

  const { instanceId, qrCode } = await ports.createInstance(instanceName, webhookUrl);

  let webhookConfigured = false;
  try {
    await ports.setWebhook(instanceName, webhookUrl, hmacSecret);
    webhookConfigured = true;
  } catch {
    // Webhook pode ser configurado depois manualmente
  }

  await ports.saveTenantInstance(tenantId, instanceName, instanceId);

  return { instanceName, instanceId, qrCode, webhookConfigured };
}

export function makeDefaultPorts(): EvolutionProvisionPorts {
  const apiUrl = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || '';

  return {
    async createInstance(name, webhookUrl) {
      const res = await fetch(`${apiUrl}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          instanceName: name,
          webhook: webhookUrl,
          webhookByEvents: true,
          events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
        }),
      });
      if (!res.ok) throw new Error(`Evolution create failed: ${res.status}`);
      const data = await res.json() as any;
      return { instanceId: data.instance?.instanceId || data.instanceId || name, qrCode: data.qrcode?.base64 };
    },

    async setWebhook(instanceName, url, hmacSecret) {
      const res = await fetch(`${apiUrl}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ url, webhook_by_events: true, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'], webhook_secret: hmacSecret }),
      });
      if (!res.ok) throw new Error(`Evolution webhook set failed: ${res.status}`);
    },

    async getQrCode(instanceName) {
      const res = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        headers: { apikey: apiKey },
      });
      if (!res.ok) throw new Error(`Evolution QR failed: ${res.status}`);
      const data = await res.json() as any;
      return data.base64 || data.qrcode?.base64 || '';
    },

    async saveTenantInstance(tenantId, instanceName, instanceId) {
      const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
      await supabaseAdmin
        .from('tenants')
        .update({ evolution_instance: instanceName })
        .eq('id', tenantId);
    },
  };
}
