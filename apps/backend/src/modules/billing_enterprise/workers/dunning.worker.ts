import { Worker, Job, Queue } from 'bullmq';

// Conexão redis mockada para não quebrar ambiente de dev caso redis não exista
const connection = { host: process.env.REDIS_HOST || 'localhost', port: 6379 };

// Fila de retentativas
export const invoiceRetriesQueue = new Queue('invoice_retries', { connection });

interface DunningJobData {
  invoiceId: string;
  tenantId: string;
  attemptCounter: number;
}

/**
 * Worker de Dunning Management para cobranças falhas.
 * Segue cronograma de retentativa: d+1, d+3, d+5
 */
export const dunningWorker = new Worker<DunningJobData>(
  'invoice_retries',
  async (job: Job) => {
    const { invoiceId, attemptCounter, tenantId } = job.data;
    
    console.log(`[Dunning Worker] Processando fatura ${invoiceId} - Tentativa #${attemptCounter}`);

    try {
      // Tentar cobrar o cartão do cliente via Gateway de Pagamento aqui...
      const paymentSuccess = false; // Mock

      if (paymentSuccess) {
        console.log(`[Dunning Worker] Pagamento processado com sucesso na tentativa #${attemptCounter}`);
        // Atualizar fatura para 'paid'
        return;
      }

      throw new Error('Payment declined');
    } catch (error) {
      if (attemptCounter >= 5) {
        // Falhou na última tentativa permitida.
        console.warn(`[Dunning Worker] Esgotado limite de tentativas (5) para tenant ${tenantId}. Efetuando downgrade...`);
        // Aqui acionaríamos os Adapters para dar update na Subscription:
        // status = 'past_due'
        // Emitir Webhook: "subscription.past_due"
      } else {
        // Reagendamento Exponencial/Configurado baseado na tentativa
        let delayDays = 1;
        if (attemptCounter === 2) delayDays = 3;
        else if (attemptCounter >= 3) delayDays = 5;

        // Adicionamos um novo Job para rodar no tempo de delay apropriado
        await invoiceRetriesQueue.add(
          'retry', 
          {
            invoiceId,
            tenantId,
            attemptCounter: attemptCounter + 1
          }, 
          { delay: delayDays * 24 * 60 * 60 * 1000 }
        );
      }
    }
  },
  { connection, autorun: false } // autorun: false para evitar conexão crash loop sem redis em dev env
);

// Tratamento de erros do worker para estabilidade
dunningWorker.on('error', err => {
  // log silencioso para ambiente sem redis
  // console.error('[BullMQ Worker Erro]', err);
});
