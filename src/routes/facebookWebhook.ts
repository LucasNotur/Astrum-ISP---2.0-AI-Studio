import { Router, Request, Response } from 'express';
import { adminDb } from '../lib/firebaseAdmin';
import { messageQueue } from '../lib/queue';

export const facebookWebhookRouter = Router();

facebookWebhookRouter.get('/', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
            res.status(200).send(challenge);
            return;
        } else {
            res.sendStatus(403);
            return;
        }
    }
    
    res.sendStatus(403);
});

facebookWebhookRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { validateWebhookSignature } = await import('../../apps/api/src/infrastructure/security/hmac.service.ts');
        const signature = req.headers['x-hub-signature-256'] as string ?? '';
        const rawBody = JSON.stringify(req.body);
        const isValid = validateWebhookSignature(rawBody, signature, 'facebook');

        if (!isValid) {
            res.status(401).json({ error: 'Assinatura inválida' });
            return;
        }
    } catch (e) {
        console.error('HMAC loading error', e);
    }
    const body = req.body;

    if (body.object === 'page') {
        const events = body.entry || [];
        
        for (const entry of events) {
            const pageId = entry.id;
            
            // Resolve tenant by page_id
            const tenantsSnapshot = await adminDb.collection('tenants')
                .where('integrations.facebook.page_id', '==', pageId)
                .limit(1)
                .get();

            if (tenantsSnapshot.empty) {
                res.status(200).json({ status: 'skipped:unknown_page' });
                return;
            }

            const tenantId = tenantsSnapshot.docs[0].id;
            
            const messagingEvents = entry.messaging || [];
            
            for (const event of messagingEvents) {
                if (event.message?.is_echo) {
                    continue; // Skip echos
                }
                
                if (event.message?.text) {
                    await messageQueue.add("process_message", {
                        tenantId: tenantId,
                        from: event.sender.id,
                        to: event.recipient.id,
                        text: event.message.text,
                        source: 'facebook',
                        metadata: {
                            facebook: event
                        }
                    }, {
                        removeOnComplete: true,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 2000 }
                    });
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});
