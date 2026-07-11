import { useState } from 'react';
import { useAppStore } from '@/src/store/useAppStore';
import { toast } from 'sonner';

export function useEvolution() {
  const { integrationKeys } = useAppStore();
  const [evoStatus, setEvoStatus] = useState<string>('checking');
  const [evoQrCode, setEvoQrCode] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);

  const configureEvolutionWebhook = async () => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionApiKey) {
      toast.error('Preencha a URL e Global API Key primeiro para configurar o webhook.');
      return;
    }

    let instancesToUpdate: string[] = [];
    if (integrationKeys.whatsappInstances) {
      try {
        const arr = JSON.parse(integrationKeys.whatsappInstances);
        instancesToUpdate = arr.map((a: any) => a.instanceName);
      } catch (e) {}
    }
    if (instancesToUpdate.length === 0 && integrationKeys.evolutionInstance) {
      instancesToUpdate.push(integrationKeys.evolutionInstance);
    }
    if (instancesToUpdate.length === 0) {
      toast.error('Nenhuma conexão de WhatsApp encontrada.');
      return;
    }

    let webhookUrl =
      integrationKeys.evolutionWebhookUrl ||
      `${window.location.origin}/api/webhook/evolution`;
    if (!integrationKeys.evolutionWebhookUrl) {
      try {
        const sysRes = await fetch('/api/system/webhook-url');
        if (sysRes.ok) {
          const sysData = await sysRes.json();
          if (sysData.webhookUrl) webhookUrl = sysData.webhookUrl;
        }
      } catch (err) {
        console.error('Could not fetch proxy webhook url, using fallback', err);
      }
    }

    setIsFetchingQr(true);
    try {
      for (const instance of instancesToUpdate) {
        const payloads = [
          {
            path: `/webhook/set/${instance}`,
            body: { webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: true, events: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'CONNECTION_UPDATE'] } },
          },
          {
            path: `/webhook/set/${instance}`,
            body: { enabled: true, url: webhookUrl, webhookByEvents: false, events: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'CONNECTION_UPDATE'] },
          },
          {
            path: `/webhook/set/${instance}`,
            body: { enabled: true, url: webhookUrl, webhook_by_events: false, webhook_base64: true, events: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'CONNECTION_UPDATE'] },
          },
          { path: `/webhook/find/${instance}` },
        ];

        for (const pd of payloads) {
          try {
            const res = await fetch('/api/evolution/proxy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: pd.path, method: (pd as any).body ? 'POST' : 'GET', body: (pd as any).body, evolutionUrl: integrationKeys.evolutionUrl, evolutionApiKey: integrationKeys.evolutionApiKey }),
            });
            if (res.ok) break;
          } catch (e) {
            console.error('Evolution Proxy Error', e);
          }
        }
      }
      toast.success('Webhook configurado em todas as instâncias ativas.');
    } catch (error) {
      toast.error('Erro ao configurar Webhook. Verifique a URL e Chave.');
    } finally {
      setIsFetchingQr(false);
    }
  };

  const disconnectEvolutionInstance = async () => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionInstance || !integrationKeys.evolutionApiKey) return;
    if (!window.confirm('Deseja realmente desconectar o WhatsApp desta instância?')) return;
    try {
      setIsFetchingQr(true);
      await fetch('/api/evolution/proxy', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/instance/logout/${integrationKeys.evolutionInstance}`, method: 'DELETE', evolutionUrl: integrationKeys.evolutionUrl, evolutionApiKey: integrationKeys.evolutionApiKey }),
      });
      setEvoStatus('disconnected');
      setEvoQrCode(null);
      toast.success('Instância desconectada com sucesso.');
    } catch (e) {
      toast.error('Erro ao desconectar instância.');
    } finally {
      setIsFetchingQr(false);
    }
  };

  const fetchEvolutionQrCode = async () => {
    if (!integrationKeys.evolutionUrl || !integrationKeys.evolutionInstance || !integrationKeys.evolutionApiKey) {
      toast.error('Preencha a URL, Instância e Global API Key primeiro.');
      return;
    }
    setIsFetchingQr(true);
    try {
      const stateRes = await fetch('/api/evolution/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `/instance/connectionState/${integrationKeys.evolutionInstance}`, method: 'GET', evolutionUrl: integrationKeys.evolutionUrl, evolutionApiKey: integrationKeys.evolutionApiKey }),
      });
      const stateData = await stateRes.json();
      if (stateData?.instance?.state === 'open') {
        setEvoStatus('connected');
        setEvoQrCode(null);
        toast.success('Instância já está conectada!');
      } else {
        setEvoStatus('disconnected');
        const qrRes = await fetch('/api/evolution/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `/instance/connect/${integrationKeys.evolutionInstance}`, method: 'GET', evolutionUrl: integrationKeys.evolutionUrl, evolutionApiKey: integrationKeys.evolutionApiKey }),
        });
        const qrData = await qrRes.json();
        if (qrData?.base64) {
          setEvoQrCode(qrData.base64);
          toast.info('Escaneie o QR Code com seu WhatsApp.');
        } else {
          toast.error('Não foi possível gerar o QR Code. Verifique se a instância existe.');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao conectar com a Evolution API. Verifique a URL e a Chave.');
    } finally {
      setIsFetchingQr(false);
    }
  };

  return {
    evoStatus,
    setEvoStatus,
    evoQrCode,
    isFetchingQr,
    configureEvolutionWebhook,
    disconnectEvolutionInstance,
    fetchEvolutionQrCode,
  };
}
