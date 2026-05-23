import { adminDb as db } from './firebaseAdmin.ts';
import { FieldValue } from 'firebase-admin/firestore';

export const seedNewTenant = async (tenantId: string, companyName: string, adminUserId?: string) => {
  const batch = db.batch();

  // (1) settings/integrations vazio
  const settingsRef = db.collection('tenant_settings').doc(tenantId);
  batch.set(settingsRef, {
    integrations: {},
    preferences: {
      timezone: 'America/Sao_Paulo',
      language: 'pt-BR',
    },
    created_at: FieldValue.serverTimestamp()
  });

  // (2) 3 artigos de conhecimento padrão
  const kbRef1 = db.collection('knowledge_base').doc();
  batch.set(kbRef1, {
    tenant_id: tenantId,
    title: 'Bem-vindo ao seu novo sistema',
    content: `Olá equipe da ${companyName}! Este é o repositório de conhecimento do seu assistente de IA. Tudo que você colocar aqui será usado para responder aos seus clientes.`,
    status: 'published',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });

  const kbRef2 = db.collection('knowledge_base').doc();
  batch.set(kbRef2, {
    tenant_id: tenantId,
    title: 'Como usar a IA Assistente',
    content: 'A assistente de IA usa esta base de conhecimento para ajudar os clientes. Mantenha os artigos sempre atualizados.',
    status: 'published',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });

  const kbRef3 = db.collection('knowledge_base').doc();
  batch.set(kbRef3, {
    tenant_id: tenantId,
    title: 'Políticas da Empresa',
    content: 'Horário de atendimento padrão: Segunda a Sexta, 09:00 às 18:00.',
    status: 'published',
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp()
  });

  // (3) configurações do agente IA com nome Maria
  const aiConfigRef = db.collection('ai_config').doc(tenantId);
  batch.set(aiConfigRef, {
    tenant_id: tenantId,
    agent_name: 'Maria',
    model: 'gemini-2.5-flash',
    system_prompt: `Você é Maria, a assistente virtual gentil e prestativa da empresa ${companyName}.
Responda de forma clara e amigável.
Baseie-se apens na base de conhecimento.`,
    temperature: 0.3,
    active: true,
    created_at: FieldValue.serverTimestamp()
  });

  // (4) 1 operador admin (if UID is passed, it should already be created, but we can set up the team member profile)
  if (adminUserId) {
    const teamRef = db.collection('team_members').doc(adminUserId);
    batch.set(teamRef, {
      id: adminUserId,
      tenantId: tenantId,
      role: 'owner',
      status: 'active',
      created_at: FieldValue.serverTimestamp()
    });
  }

  await batch.commit();
};
