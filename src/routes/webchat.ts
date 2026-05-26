import { Router, Request, Response } from 'express';
import { adminDb as db } from '../lib/firebaseAdmin';
import { messageQueue } from '../lib/queue';
import redisClient from '../lib/redis';

export const webchatRouter = Router();

webchatRouter.get('/config', async (req: Request, res: Response) => {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
        res.status(400).json({ error: 'tenantId is required' });
        return;
    }

    try {
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) {
            res.status(404).json({ error: 'Tenant not found' });
            return;
        }

        const data = tenantDoc.data() || {};
        
        // Return safe config only
        res.json({
            primary_color: data.theme?.primary_color || '#00C896',
            logo_url: data.theme?.logo_url || '',
            agent_name: data.agent_name || 'Agente'
        });
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

webchatRouter.post('/message', async (req: Request, res: Response) => {
    const { tenantId, sessionId, text } = req.body;

    if (!tenantId || !sessionId || !text) {
        res.status(400).json({ error: 'Missing parameters' });
        return;
    }

    try {
        const customerIdentifier = `webchat_${sessionId}`;
        
        // Verifica se já existe um ticket aberto
        const openTickets = await db.collection("tickets")
            .where("tenantId", "==", tenantId)
            .where("customerId", "==", customerIdentifier)
            .where("status", "in", ["open", "in-progress"])
            .limit(1)
            .get();

        if (openTickets.empty) {
            await db.collection("tickets").add({
                tenantId,
                customerId: customerIdentifier,
                source: 'webchat',
                status: 'open',
                subject: 'Chat via Site',
                createdAt: new Date()
            });
        }

        // Enfileira a mensagem. O messageWorker (que processa a fila de mensagens) 
        // vai processar o texto e enviar a resposta pro Redis.
        await messageQueue.add("process_message", {
            tenantId,
            from: `webchat_${sessionId}`,
            to: tenantId, 
            text,
            source: 'webchat'
        }, {
            removeOnComplete: true,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 }
        });

        // Long-polling: aguarda até 15s pela resposta no Redis
        const responseKey = `webchat_response:${sessionId}`;
        
        const timeout = 15000;
        const start = Date.now();
        let aiResponse = null;

        while (Date.now() - start < timeout) {
            if (redisClient) {
                const reply = await redisClient.lpop(responseKey);
                if (reply) {
                    aiResponse = reply;
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (aiResponse) {
            res.json({ reply: aiResponse });
        } else {
            res.json({ timeout: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
