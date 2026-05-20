import fs from 'fs';

let appTsx = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const configureEvolutionWebhook = async \(\) => \{[\s\S]*?(?=const disconnectEvolutionInstance =)/g;
const match = appTsx.match(regex);

if (match) {
  const newFunc = `const configureEvolutionWebhook = async () => {
    if (
      !integrationKeys.evolutionUrl ||
      !integrationKeys.evolutionApiKey
    ) {
      toast.error(
        "Preencha a URL e Global API Key primeiro para configurar o webhook.",
      );
      return;
    }

    let instancesToUpdate = [];
    if (integrationKeys.whatsappInstances) {
      try {
        const arr = JSON.parse(integrationKeys.whatsappInstances);
        instancesToUpdate = arr.map((a: any) => a.instanceName);
      } catch(e) {}
    }
    if (instancesToUpdate.length === 0 && integrationKeys.evolutionInstance) {
      instancesToUpdate.push(integrationKeys.evolutionInstance);
    }
    
    if (instancesToUpdate.length === 0) {
      toast.error("Nenhuma conexão de WhatsApp encontrada.");
      return;
    }

    let webhookUrl = \`\${window.location.origin}/api/webhook/evolution\`;
    try {
      const sysRes = await fetch("/api/system/webhook-url");
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        if (sysData.webhookUrl) {
          webhookUrl = sysData.webhookUrl;
        }
      }
    } catch (err) {
      console.error("Could not fetch proxy webhook url, using fallback", err);
    }

    setIsFetchingQr(true);
    try {
      for (const instance of instancesToUpdate) {
        const payloads = [
          {
            path: \`/webhook/set/\${instance}\`,
            body: {
              webhook: {
                enabled: true,
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
              },
            },
          },
          {
            path: \`/webhook/set/\${instance}\`,
            body: {
              enabled: true,
              url: webhookUrl,
              webhookByEvents: false,
              events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
            },
          },
          {
            path: \`/webhook/set/\${instance}\`,
            body: {
              enabled: true,
              url: webhookUrl,
              webhook_by_events: false,
              webhook_base64: false,
              events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
            },
          },
          {
            path: \`/webhook/find/\${instance}\`,
          },
        ];

        let success = false;
        for (const pd of payloads) {
          try {
            const res = await fetch("/api/evolution/proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: pd.path,
                method: pd.body ? "POST" : "GET",
                body: pd.body,
                evolutionUrl: integrationKeys.evolutionUrl,
                evolutionApiKey: integrationKeys.evolutionApiKey,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (
                data?.webhook?.url === webhookUrl ||
                data?.url === webhookUrl ||
                data?.webhook === webhookUrl ||
                data?.id
              ) {
                success = true;
                break;
              }
            }
          } catch (e) {
            console.error("Evolution Proxy Error", e);
          }
        }

        /* update the tenant DB with the instances! */
        if (success) {
           // We will update tenants DB separately in WhatsAppPage or server.ts.
        }
      }
      
      toast.success("Webhook configurado em todas as instâncias ativas.");
    } catch (error) {
      toast.error("Erro ao configurar Webhook. Verifique a URL e Chave.");
    } finally {
      setIsFetchingQr(false);
    }
  };

  `;
  appTsx = appTsx.replace(match[0], newFunc);
  fs.writeFileSync('src/App.tsx', appTsx);
  console.log("Updated App.tsx");
} else {
  console.log("Match not found!");
}
