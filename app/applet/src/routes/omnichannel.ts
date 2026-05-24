export interface Template {
  id: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  body: string;
}

export interface OmnichannelDependencies {
  graphApi: {
    sendMessage: (recipientId: string, text: string, token: string) => Promise<void>;
  };
  evolutionApi: {
    sendMessage: (phone: string, text: string) => Promise<void>;
  };
  db: {
    queueMessage: (source: string, payload: any) => Promise<void>;
    getTemplate: (templateId: string) => Promise<Template | null>;
    logHsmSend: (tenantId: string, templateId: string, recipient: string) => Promise<void>;
    processViaAIPipeline: (text: string, source: string) => Promise<void>;
  };
  getFacebookPageToken: (tenantId: string) => Promise<string>;
}

export class OmnichannelRouter {
  constructor(private deps: OmnichannelDependencies) {}

  async handleWebhook(payload: any) {
    if (payload.object === 'instagram') {
      await this.deps.db.queueMessage('instagram', payload);
    }
  }

  async handleWebChat(text: string) {
    await this.deps.db.processViaAIPipeline(text, 'webchat');
  }

  async sendReply(tenantId: string, source: string, recipientId: string, text: string) {
    if (source === 'instagram') {
      const token = await this.deps.getFacebookPageToken(tenantId);
      await this.deps.graphApi.sendMessage(recipientId, text, token);
    } else if (source === 'whatsapp') {
      await this.deps.evolutionApi.sendMessage(recipientId, text);
    } else if (source === 'facebook') {
      const token = await this.deps.getFacebookPageToken(tenantId);
      await this.deps.graphApi.sendMessage(recipientId, text, token);
    }
  }

  async sendHSMTemplate(tenantId: string, templateId: string, recipient: string, variables: string[]) {
    const template = await this.deps.db.getTemplate(templateId);
    if (!template) throw new Error('TEMPLATE_NOT_FOUND');
    
    if (template.status === 'REJECTED') {
      return; 
    }
    if (template.status === 'PENDING') {
      throw new Error('TEMPLATE_NOT_APPROVED');
    }

    let processedBody = template.body;
    variables.forEach((variable, index) => {
      processedBody = processedBody.replace(`{{${index + 1}}}`, variable);
    });

    await this.deps.evolutionApi.sendMessage(recipient, processedBody);
    await this.deps.db.logHsmSend(tenantId, templateId, recipient);
  }
}
