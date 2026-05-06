import { GoogleGenerativeAI, Tool, SchemaType } from "@google/generative-ai";
import OpenAI from "openai";
import { searchKnowledgeBase, checkCoverageReal, getBillingStatusReal, runDiagnosticsReal, getIntegrationKeys, getSystemPrompts } from "./db";

// Tool Definitions for Gemini
const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "check_coverage",
        description: "Verifica a viabilidade técnica e disponibilidade de fibra óptica em um endereço ou CEP.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            address: { type: SchemaType.STRING, description: "O endereço ou CEP para verificar." }
          },
          required: ["address"]
        }
      },
      {
        name: "get_billing_status",
        description: "Consulta o status financeiro e faturas pendentes de um cliente.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            cpf: { type: SchemaType.STRING, description: "O CPF do cliente para consulta." }
          },
          required: ["cpf"]
        }
      },
      {
        name: "search_knowledge_base",
        description: "Busca informações em manuais, FAQs e base de conhecimento da empresa para responder dúvidas técnicas ou gerais.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: "O termo de busca ou dúvida do cliente." }
          },
          required: ["query"]
        }
      },
      {
        name: "run_diagnostics",
        description: "Executa um diagnóstico técnico remoto na conexão do cliente para verificar sinal, latência e status do modem.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            customerId: { type: SchemaType.STRING, description: "O ID ou CPF do cliente para o diagnóstico." }
          },
          required: ["customerId"]
        }
      },
      {
        name: "schedule_technical_visit",
        description: "Agenda uma visita técnica (Ordem de Serviço) automaticamente para o cliente.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            customerId: { type: SchemaType.STRING, description: "ID do cliente no banco." },
            customerName: { type: SchemaType.STRING, description: "Nome do cliente." },
            address: { type: SchemaType.STRING, description: "Endereço para a visita técnica." },
            type: { type: SchemaType.STRING, description: "Tipo da visita: instalacao ou manutencao" },
            reason: { type: SchemaType.STRING, description: "Motivo, relato do problema ou detalhes." }
          },
          required: ["customerId", "customerName", "address", "type", "reason"]
        }
      }
    ]
  }
];

// Tool Definitions for OpenAI
const openaiTools = [
  {
    type: "function" as const,
    function: {
      name: "check_coverage",
      description: "Verifica a viabilidade técnica e disponibilidade de fibra óptica em um endereço ou CEP.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "O endereço ou CEP para verificar." }
        },
        required: ["address"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_billing_status",
      description: "Consulta o status financeiro e faturas pendentes de um cliente.",
      parameters: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "O CPF do cliente para consulta." }
        },
        required: ["cpf"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_knowledge_base",
      description: "Busca informações em manuais, FAQs e base de conhecimento da empresa para responder dúvidas técnicas ou gerais.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O termo de busca ou dúvida do cliente." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "run_diagnostics",
      description: "Executa um diagnóstico técnico remoto na conexão do cliente para verificar sinal, latência e status do modem.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "O ID ou CPF do cliente para o diagnóstico." }
        },
        required: ["customerId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "schedule_technical_visit",
      description: "Agenda uma visita técnica (Ordem de Serviço) automaticamente para o cliente.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "ID do cliente no banco." },
          customerName: { type: "string", description: "Nome do cliente." },
          address: { type: "string", description: "Endereço para a visita técnica." },
          type: { type: "string", description: "Tipo da visita: instalacao ou manutencao" },
          reason: { type: "string", description: "Motivo, relato do problema ou detalhes." }
        },
        required: ["customerId", "customerName", "address", "type", "reason"]
      }
    }
  }
];

export const AGENT_CATEGORIES = {
  CADASTRO: "Vendas e Novos Clientes",
  FATURA: "Financeiro e Cobrança",
  SUPORTE_TECNICO: "Suporte Técnico e Conexão",
  RETENCAO: "Cancelamento e Retenção",
  UPGRADE: "Upgrade de Plano",
  SAC_GERAL: "Informações Gerais",
  ESCALAMENTO_HUMANO: "Atendimento Humano"
};

export const SYSTEM_PROMPTS = {
  ORCHESTRATOR: `Você é o Agente Orquestrador da Astrum (Provedor de Internet). 
Sua única função é rotear o atendimento. Analise o histórico e a última mensagem do cliente e CLASSIFIQUE-A na categoria mais exata.
Categorias disponíveis:
- CADASTRO: Cliente querendo assinar plano, saber áreas de cobertura, novos clientes.
- FATURA: Dúvidas financeiras, pedir boleto, status de pagamento, negociação.
- SUPORTE_TECNICO: Sem internet, internet lenta, luz vermelha no roteador, problemas físicos.
- RETENCAO: Cliente pedindo para cancelar a internet por insatisfação ou mudança.
- UPGRADE: Cliente querendo aumentar os megas/plano de internet atual.
- SAC_GERAL: Dúvidas soltas, endereço, horários de atendimento, alterar dados cadastrais ou conversas triviais (ex: "Bom dia").
- ESCALAMENTO_HUMANO: Quando o cliente diz explicitamente "quero falar com atendente/humano" ou quando há xingamentos.

Responda APENAS o nome da categoria, em maiúsculo, sem pontuação.`,

  SUPORTE_TECNICO: `Você é o assistente virtual da Astrum focado no Suporte Técnico.
IMPORTANTE: Nunca se identifique como "Agente IA" ou "Agente de Suporte". Aja naturalmente como o assistente da Astrum.
Diretrizes:
1. Antes de qualquer pitaco, FOQUE no relato. Se o cliente falar que está lento, use a ferramenta 'run_diagnostics'. (Economize tokens: se já diagnosticou hoje, leia o histórico, não rode de novo).
2. Se o sinal estiver baixo (<-25dBm), informe que é um problema de fibra (dobrada ou rompida) e USE a ferramenta 'schedule_technical_visit' para abrir um chamado automático.
3. Se normal, peça para ele reiniciar o roteador (fora da tomada 30s).
4. Se o cliente fizer uma pergunta fora do padrão técnico do seu escopo genérico, USE a ferramenta 'search_knowledge_base' para buscar a resposta na base interna antes de responder.
5. Seja empático, técnico e resolutivo.

Responda no formato JSON restrito:
{
  "message": "Sua resposta natural conversacional para o cliente.",
  "shouldEscalate": false, // mude para true apenas se não conseguir resolver de jeito nenhum
  "suggestedAction": "diagnostico_remoto"
}`,

  FATURA: `Você é o assistente virtual da Astrum focado em Faturas e Financeiro.
IMPORTANTE: Nunca se identifique como "Agente Financeiro". Aja naturalmente como o assistente da Astrum.
Diretrizes:
1. O cliente quer 2ª via ou informações de pagamento. Use 'get_billing_status' passando o CPF. 
2. IMPORTANTE: Se não tiver o CPF no histórico da conversa, pergunte a ele: "Para eu puxar sua fatura, pode me confirmar seu CPF?". Não invente CPFs. (Economia de token: só chame a tool quando tiver o CPF exato).
3. Entregue os dados de pagamento (Pix copia e cola ou link do pdf) se retornados.
4. Caso a resposta envolva regras de juros ou multas que você não saiba, use 'search_knowledge_base'.

Responda em JSON:
{
  "message": "Resposta conversacional.",
  "shouldEscalate": false,
  "suggestedAction": "financeiro"
}`,

  RETENCAO: `Você é o assistente virtual da Astrum focado em Retenções. O cliente quer cancelar a internet.
IMPORTANTE: Nunca se identifique como "Agente de Retenção". Aja naturalmente como o assistente da Astrum.
Diretrizes:
1. Seja extremamente polido e empático. Tente entender o motivo real (preço? problema técnico?).
2. Se for preço, você tem autorização para oferecer 20% de desconto por 3 meses.
3. Se for problema técnico recorrente, ofereça enviar um técnico sênior sem custo + abono de 10 dias na fatura.
4. Se ele for irredutível, assuma que não conseguiu e mude o 'shouldEscalate' para true.

Responda em JSON:
{
  "message": "Resposta acolhedora de negociação.",
  "shouldEscalate": false,
  "suggestedAction": "retencao"
}`,

  CADASTRO: `Você é o assistente virtual da Astrum focado em Vendas.
IMPORTANTE: Nunca se identifique como "Agente de Vendas". Aja naturalmente como o assistente da Astrum.
Diretrizes:
1. Encante o cliente! Pegue o CEP/Endereço e use 'check_coverage' para ver se há viabilidade.
2. Se não enviar o CEP na primeira mensagem, peça educadamente.
3. Planos atuais: 100 Mega (R$62,99), 300 Mega (R$82,99), 600 Mega (R$99,99), 1 Giga (R$119,99). Instalação grátis em comodato.
4. Para realizar o pré-cadastro, SOLICITE UM EMAIL VÁLIDO. Valide o formato do email informado (ex: deve conter @ e um domínio como .com). Se o email for inválido, informe-o amigavelmente e peça novamente.
5. Use gatilhos mentais e tente realizar o fechamento apenas após coletar CEP e Email válido.

Responda em JSON:
{
  "message": "Resposta persuasiva.",
  "shouldEscalate": false,
  "suggestedAction": "vendas"
}`,

  UPGRADE: `Você é o assistente virtual da Astrum focado em Upgrades de Plano.
IMPORTANTE: Nunca se identifique como "Agente de Vendas" ou similar. Aja naturalmente.
1. O cliente já é da casa e quer mais velocidade.
2. Mostre as diferenças (ex: "Se você passar para 1 Giga (R$199), poderá jogar sem lag e conectar 20 aparelhos simultâneos, por apenas uma pequena diferença no boleto atual.").
3. Peça a confirmação do cliente para efetuar a mudança.

Responda em JSON:
{
  "message": "Sua resposta de convencimento.",
  "shouldEscalate": false,
  "suggestedAction": "vendas"
}`,

  SAC_GERAL: `Você é o assistente virtual oficial de Atendimento da Astrum (Provedor de Internet).
IMPORTANTE: Nunca se identifique como "Inteligência Principal" ou "Agente IA". Aja naturalmente.
IDENTIDADE WHITE-LABEL: Você opera em um modelo de parceria. Se por acaso você tentar usar uma ferramenta (como consulta de faturas ou CTOs) e o sistema retornar "manual_check_required", significa que temos uma limitação de acesso aos dados da empresa mãe. 
Nesse caso, NUNCA diga ao cliente que "o sistema falhou". Em vez disso, diga: "Vou verificar essa informação específica com a nossa central administrativa e já te retorno" e mude 'shouldEscalate' para true.

Diretrizes:
1. Você lida com o dia-a-dia: Dúvidas básicas ("Bom dia", "Estão abertos?"), perguntas operacionais e assuntos gerais sobre a empresa.
2. RAG OBRIGATÓRIO: Se o cliente fizer UMA PERGUNTA sobre regras, políticas (ex: cancelamento, titularidade, tempo de fidelidade) ou funcionamento da empresa, USE A FERRAMENTA 'search_knowledge_base' (Base de Conhecimento) ANTES de inventar qualquer regra. O RAG é sua fonte da verdade.
3. Não use ferramentas se o cliente disser apenas "Olá, tudo bem?". Interaja normalmente.
4. Seja cordial, natural e rápido (para poupar tokens, seja sucinto mas prestativo).

Responda SEMPRE em JSON:
{
  "message": "Sua interação amigável ou resposta baseada na base de conhecimento.",
  "shouldEscalate": false,
  "suggestedAction": "nenhuma"
}`
};

export const getEffectivePrompts = async () => {
  const customPrompts = await getSystemPrompts();
  return {
    ...SYSTEM_PROMPTS,
    ...customPrompts
  };
};

export async function getSmartReplies(lastMessage: string) {
  try {
    const integrationKeys = await getIntegrationKeys();
    const provider = integrationKeys.smartreplyProvider || 'gemini';
    const isCustom = provider === 'custom';
    const isOpenAILike = provider === 'openai' || isCustom;
    
    const apiKey = isCustom 
      ? (integrationKeys.customSmartreply || "") 
      : provider === 'openai' 
        ? (integrationKeys.openaiSmartreply || integrationKeys.openaiGlobal) 
        : (integrationKeys.geminiSmartreply || integrationKeys.geminiGlobal || process.env.GEMINI_API_KEY || "");
        
    const modelName = integrationKeys[`${provider}SmartreplyModel`] || (provider === 'openai' ? "gpt-4o-mini" : isCustom ? "" : "gemini-2.5-flash");
    const baseUrl = isCustom ? integrationKeys.customSmartreplyBaseUrl : undefined;

    if (!apiKey) return [];

    const prompt = `Você é um assistente de suporte para um provedor de internet.
Com base na mensagem do cliente abaixo, sugira 3 respostas curtas e úteis (máximo 10 palavras cada) que um atendente humano poderia usar.
Responda APENAS um array JSON de strings.

Mensagem do Cliente: "${lastMessage}"

Sugestões:`;

    if (isOpenAILike) {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, baseURL: baseUrl });
      const res = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = res.choices[0]?.message?.content || "[]";
      try { return JSON.parse(text).replies || JSON.parse(text); } catch { return []; }
    } else {
      const ai = new GoogleGenerativeAI(apiKey);
      const modelFlash = ai.getGenerativeModel({ model: modelName });
      const result = await modelFlash.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      return JSON.parse(result.response.text());
    }
  } catch (error) {
    console.error("Smart Replies Error:", error);
    return [];
  }
}

export async function summarizeTicketHistory(historyText: string) {
  try {
    const integrationKeys = await getIntegrationKeys();
    const provider = integrationKeys.summaryProvider || 'gemini';
    const isCustom = provider === 'custom';
    const isOpenAILike = provider === 'openai' || isCustom;

    const apiKey = isCustom 
      ? (integrationKeys.customSummary || "") 
      : provider === 'openai' 
        ? (integrationKeys.openaiSummary || integrationKeys.openaiGlobal) 
        : (integrationKeys.geminiSummary || integrationKeys.geminiGlobal || process.env.GEMINI_API_KEY || "");
    const modelName = integrationKeys[`${provider}SummaryModel`] || (provider === 'openai' ? "gpt-4o-mini" : isCustom ? "" : "gemini-2.5-flash");
    const baseUrl = isCustom ? integrationKeys.customSummaryBaseUrl : undefined;
    
    if (!apiKey) return "Erro: Chave da API não configurada.";

    const prompt = `Você é um assistente de IA para um provedor de internet.
Sua tarefa é resumir o histórico de um ticket de atendimento.
Seja conciso, direto ao ponto e destaque:
1. O problema principal relatado.
2. O que já foi feito (ações tomadas).
3. O status atual ou próximo passo.

Histórico do Ticket:
${historyText}

Resumo:`;

    if (isOpenAILike) {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, baseURL: baseUrl });
      const res = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }]
      });
      return res.choices[0]?.message?.content || "";
    } else {
      const ai = new GoogleGenerativeAI(apiKey);
      const modelFlash = ai.getGenerativeModel({ model: modelName });
      const result = await modelFlash.generateContent(prompt);
      return result.response.text();
    }
  } catch (error) {
    console.error("AI Summarize Error:", error);
    return "Erro ao gerar resumo do ticket.";
  }
}

export async function generateKBArticleFromTickets(ticketsText: string) {
  try {
    const integrationKeys = await getIntegrationKeys();
    const provider = integrationKeys.kbProvider || 'gemini';
    const isCustom = provider === 'custom';
    const isOpenAILike = provider === 'openai' || isCustom;

    const apiKey = isCustom 
      ? (integrationKeys.customKb || "") 
      : provider === 'openai' 
        ? (integrationKeys.openaiKb || integrationKeys.openaiGlobal) 
        : (integrationKeys.geminiKb || integrationKeys.geminiGlobal || process.env.GEMINI_API_KEY || "");
    const modelName = integrationKeys[`${provider}KbModel`] || (provider === 'openai' ? "gpt-4o-mini" : isCustom ? "" : "gemini-2.5-flash");
    const baseUrl = isCustom ? integrationKeys.customKbBaseUrl : undefined;
    
    if (!apiKey) return null;

    const prompt = `Você é um especialista em documentação técnica para um provedor de internet.
Com base nos problemas relatados nos tickets abaixo, crie um artigo de Base de Conhecimento útil para outros clientes ou para a equipe de suporte.

O artigo deve ter:
1. Título chamativo e claro.
2. Categoria (Suporte, Financeiro, Vendas, Geral).
3. Conteúdo detalhado com passos para solução.
4. Tags relevantes.

Tickets Recentes:
${ticketsText}

Responda EXATAMENTE no formato JSON:
{
  "title": "Título do Artigo",
  "category": "Categoria",
  "content": "Conteúdo em Markdown",
  "tags": ["tag1", "tag2"]
}`;

    if (isOpenAILike) {
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true, baseURL: baseUrl });
      const res = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
      });
      const text = res.choices[0]?.message?.content || "{}";
      return JSON.parse(text);
    } else {
      const ai = new GoogleGenerativeAI(apiKey);
      const modelFlash = ai.getGenerativeModel({ model: modelName });
      const result = await modelFlash.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      return JSON.parse(result.response.text());
    }
  } catch (error) {
    console.error("AI KB Generation Error:", error);
    return null;
  }
}

export async function getAIResponse(
  history: { role: 'user' | 'model', parts: { text?: string, inlineData?: { mimeType: string, data: string } }[] }[],
  forceCategory?: string
) {
  try {
    const integrationKeys = await getIntegrationKeys();
    
    const chatProvider = integrationKeys.chatProvider || 'openai';
    const orchestratorProvider = integrationKeys.orchestratorProvider || 'openai';

    const chatKey = chatProvider === 'openai' 
      ? (integrationKeys.openaiChat || integrationKeys.openaiGlobal) 
      : chatProvider === 'gemini' 
        ? (integrationKeys.geminiChat || integrationKeys.geminiGlobal || process.env.GEMINI_API_KEY)
        : (integrationKeys.customChat || "");
      
    const orchestratorKey = orchestratorProvider === 'openai'
      ? (integrationKeys.openaiOrchestrator || integrationKeys.openaiGlobal)
      : orchestratorProvider === 'gemini'
        ? (integrationKeys.geminiOrchestrator || integrationKeys.geminiGlobal || process.env.GEMINI_API_KEY)
        : (integrationKeys.customOrchestrator || "");
      
    const chatModel = chatProvider === 'openai'
      ? (integrationKeys.openaiChatModel || "gpt-4o-mini")
      : chatProvider === 'gemini'
        ? (integrationKeys.geminiChatModel || "gemini-1.5-flash")
        : (integrationKeys.customChatModel || "");
      
    const orchestratorModel = orchestratorProvider === 'openai'
      ? (integrationKeys.openaiOrchestratorModel || "gpt-4o-mini")
      : orchestratorProvider === 'gemini'
        ? (integrationKeys.geminiOrchestratorModel || "gemini-1.5-flash")
        : (integrationKeys.customOrchestratorModel || "");

    const chatBaseUrl = chatProvider === 'gemini' ? "https://generativelanguage.googleapis.com/v1beta/openai/" : chatProvider === 'custom' ? integrationKeys.customChatBaseUrl : undefined;
    const orchestratorBaseUrl = orchestratorProvider === 'gemini' ? "https://generativelanguage.googleapis.com/v1beta/openai/" : orchestratorProvider === 'custom' ? integrationKeys.customOrchestratorBaseUrl : undefined;

    if (!chatKey || !orchestratorKey) {
      return { message: "Erro: Chaves da API (Chat e Orquestrador) não configuradas. Configure na aba de Integrações.", shouldEscalate: true };
    }

    const openaiOrchestrator = new OpenAI({ 
      apiKey: orchestratorKey, 
      dangerouslyAllowBrowser: true,
      baseURL: orchestratorBaseUrl
    });
    
    const openaiChat = new OpenAI({ 
      apiKey: chatKey, 
      dangerouslyAllowBrowser: true,
      baseURL: chatBaseUrl
    });

    const lastMessagePart = history[history.length - 1].parts.find(p => p.text);
    const lastMessage = lastMessagePart?.text || "";

    let classification;
    
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    if (forceCategory) {
      classification = {
        category: forceCategory,
        sentiment: 'NEUTRO',
        isCritical: false
      };
    } else {
      // 1. Sentiment Analysis & Classification (Orchestration)
      const effectivePrompts = await getEffectivePrompts();
      
      const classificationRes = await openaiOrchestrator.chat.completions.create({
        model: orchestratorModel,
        messages: [
          { role: "system", content: `${effectivePrompts.ORCHESTRATOR}\n\nAlém da categoria, analise o SENTIMENTO da mensagem (POSITIVO, NEUTRO, NEGATIVO).\nIdentifique se há PALAVRAS-CHAVE CRÍTICAS (cancelar, anatel, procon, processo, lixo, péssimo).\n\nResponda EXATAMENTE no formato JSON:\n{\n  "category": "NOME_DA_CATEGORIA",\n  "sentiment": "SENTIMENTO",\n  "isCritical": true/false\n}` },
          { role: "user", content: lastMessage || "Análise de mídia enviada" }
        ],
        response_format: { type: "json_object" }
      });
      
      if (classificationRes.usage) {
        totalUsage.prompt_tokens += classificationRes.usage.prompt_tokens;
        totalUsage.completion_tokens += classificationRes.usage.completion_tokens;
        totalUsage.total_tokens += classificationRes.usage.total_tokens;
      }

      try {
        classification = JSON.parse(classificationRes.choices[0].message.content || "{}");
      } catch {
        const text = (classificationRes.choices[0].message.content || "").trim().toUpperCase();
        classification = { 
          category: text.includes('FATURA') ? 'FATURA' : text.includes('SUPORTE') ? 'SUPORTE_TECNICO' : 'SAC_GERAL',
          sentiment: 'NEUTRO',
          isCritical: false
        };
      }
    }

    const category = classification.category || 'SAC_GERAL';
    const effectivePrompts = await getEffectivePrompts();
    const activePrompt = (effectivePrompts as any)[category] || effectivePrompts.ORCHESTRATOR;

    // 2. Specialized Response (Supports Multimodal & Tools)
    const openAiHistory = history.map(h => ({
      role: h.role === 'model' ? 'assistant' as const : 'user' as const,
      content: h.parts.map(p => p.text).join(" ")
    }));

    const chatMessages = [
      { role: "system" as const, content: `${activePrompt}\n\nConsidere o sentimento ${classification.sentiment} e se é crítico: ${classification.isCritical}.\nSe for crítico ou o cliente estiver muito irritado, mude "shouldEscalate" para true.` },
      ...openAiHistory
    ];

    const chatRes = await openaiChat.chat.completions.create({
      model: chatModel,
      messages: chatMessages,
      tools: openaiTools,
      response_format: { type: "json_object" }
    });

    if (chatRes.usage) {
      totalUsage.prompt_tokens += chatRes.usage.prompt_tokens;
      totalUsage.completion_tokens += chatRes.usage.completion_tokens;
      totalUsage.total_tokens += chatRes.usage.total_tokens;
    }

    const responseMessage = chatRes.choices[0].message;

    // Handle Tool Calls
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      const toolCall = responseMessage.tool_calls[0];
      let toolResult;
      
      if (toolCall.type === 'function') {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          
          if (toolCall.function.name === 'check_coverage') {
            toolResult = await checkCoverageReal(args.address as string);
          } else if (toolCall.function.name === 'get_billing_status') {
            toolResult = await getBillingStatusReal(args.cpf as string);
          } else if (toolCall.function.name === 'run_diagnostics') {
            toolResult = await runDiagnosticsReal(args.customerId as string);
          } else if (toolCall.function.name === 'search_knowledge_base') {
            const results = await searchKnowledgeBase(args.query as string);
            toolResult = results.length > 0 ? results : { message: "Nenhuma informação específica encontrada na base de conhecimento. Use o bom senso." };
          } else if (toolCall.function.name === 'schedule_technical_visit') {
            const osId = await import('./db').then(m => m.createServiceOrder({
              customerId: args.customerId,
              customerName: args.customerName,
              address: args.address,
              type: args.type,
              status: 'pendente',
              priority: 'high',
              description: args.reason,
              materials: [],
              assignedTo: 'IA Bot Automático',
              aiSummary: `Sugestão gerada automaticamente pela IA: ${args.reason}`
            }));
            toolResult = { message: `Ordem de Serviço (OS) gerada com sucesso sob o ID ${osId}. Avise o cliente que o agendamento foi realizado.` };
          }
        } catch (e) {
          toolResult = { error: "Falha ao executar a ferramenta." };
        }
      } else {
        toolResult = { error: "Tipo de ferramenta não suportado." };
      }

      chatMessages.push(responseMessage as any);
      chatMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult)
      } as any);

      const toolResponse = await openaiChat.chat.completions.create({
        model: chatModel,
        messages: chatMessages,
        response_format: { type: "json_object" }
      });
      
      if (toolResponse.usage) {
        totalUsage.prompt_tokens += toolResponse.usage.prompt_tokens;
        totalUsage.completion_tokens += toolResponse.usage.completion_tokens;
        totalUsage.total_tokens += toolResponse.usage.total_tokens;
      }

      const text = toolResponse.choices[0].message.content || "{}";
      try {
        const parsed = JSON.parse(text);
        return { ...parsed, category, sentiment: classification.sentiment, isCritical: classification.isCritical, usage: totalUsage };
      } catch {
        return { message: text, category, sentiment: classification.sentiment, isCritical: classification.isCritical, usage: totalUsage };
      }
    }

    const text = responseMessage.content || "{}";
    try {
      const parsed = JSON.parse(text);
      return { 
        ...parsed, 
        category, 
        sentiment: classification.sentiment,
        isCritical: classification.isCritical,
        priority: classification.isCritical ? 'high' : 'medium',
        usage: totalUsage
      };
    } catch {
      return { 
        message: text, 
        shouldEscalate: category === 'ESCALAMENTO_HUMANO' || category === 'RETENCAO' || classification.isCritical,
        category,
        sentiment: classification.sentiment,
        isCritical: classification.isCritical,
        priority: classification.isCritical ? 'high' : 'medium',
        usage: totalUsage
      };
    }
  } catch (error) {
    console.error("AI Error:", error);
    return { message: "Desculpe, tive um problema técnico. Vou chamar um humano.", shouldEscalate: true };
  }
}
