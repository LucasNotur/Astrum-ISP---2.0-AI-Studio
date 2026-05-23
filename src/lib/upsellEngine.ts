import { adminDb } from "./firebaseAdmin";
import { getERPAdapter } from "./integrations/erpAdapter";

export interface UpsellEvaluation {
  should_upsell: boolean;
  suggested_plan?: string;
  benefit_message?: string;
}

export async function evaluateUpsellOpportunity(
  customerId: string,
  tenantId: string,
  context: string,
  cpf?: string
): Promise<UpsellEvaluation> {
  const result: UpsellEvaluation = {
    should_upsell: false
  };

  try {
    let conditionsMet = 0;

    // 1. Verificações no Cliente / Plano atual via ERP
    let hasMoreThan6Months = false;
    let currentSpeed = 0;
    
    if (cpf || customerId) {
      // Simulate/Check ERP connection
      try {
        const docSnap = await adminDb.collection("customers").doc(customerId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data?.contract_start_date) {
            const start = data.contract_start_date.toDate ? data.contract_start_date.toDate() : new Date(data.contract_start_date);
            const months = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (months > 6) {
              hasMoreThan6Months = true;
            }
          }
          if (data?.plan) {
            // Extrair velocidade simples em MB do plano para sugerir
            const match = data.plan.match(/(\d+)\s*(mb|gb)/i);
            if (match) {
              currentSpeed = parseInt(match[1]);
              if (match[2].toLowerCase() === 'gb') currentSpeed *= 1000;
            }
          }
        }
      } catch (e) {
        console.error("Erro ao checar ERP/Customer:", e);
      }
    }

    if (hasMoreThan6Months) conditionsMet++;

    // 2. > 2 tickets de lentidão em 30 dias
    let speedTicketsScore = 0;
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const ticketsSnap = await adminDb.collection("tickets")
        .where("tenantId", "==", tenantId)
        .where("customerId", "==", customerId)
        .where("createdAt", ">=", thirtyDaysAgo)
        .get();

      const speedCategoryKeywords = ["lentidao", "lento", "velocidade", "oscilacao", "ping", "trava", "caindo"];
      let speedCount = 0;
      
      ticketsSnap.forEach(doc => {
        const t = doc.data();
        const subject = (t.subject || "").toLowerCase();
        const category = (t.category || "").toLowerCase();
        
        const isSpeed = speedCategoryKeywords.some(k => subject.includes(k) || category.includes(k));
        if (isSpeed) speedCount++;
      });
      
      if (speedCount > 2) {
         speedTicketsScore = 1;
      }
    } catch (e) {
      console.error("Erro ao checar history de tickets para upsell:", e);
    }

    if (speedTicketsScore > 0) conditionsMet++;

    // 3. Contextual (Contexto menciona lentidão, streaming, jogos, muitos aparelhos)
    const ctx = context.toLowerCase();
    const contextKeywords = ["lento", "netflix", "iptv", "jogo", "games", "ping alto", "filho jogando", "muitos celulares", "tvbox", "tv box", "tv"];
    const mentionsStreamingOrSpeed = contextKeywords.some(k => ctx.includes(k));
    
    if (mentionsStreamingOrSpeed) conditionsMet++;

    if (conditionsMet >= 2) {
      result.should_upsell = true;
      let newSpeed = currentSpeed > 0 ? (currentSpeed >= 500 ? "1 Giga" : "600 Mega") : "600 Mega";
      
      result.suggested_plan = `Plano Ultra ${newSpeed}`;
      result.benefit_message = `Percebi que você pode estar precisando de mais velocidade para sua casa. 
Como você já é nosso cliente há um tempo, posso ver com o setor de vendas um upgrade para o ${result.suggested_plan}, que é ideal para streaming e vários aparelhos. Gostaria de saber mais?`;
    }

  } catch (error) {
    console.error("Erro no evaluateUpsellOpportunity:", error);
  }

  return result;
}
