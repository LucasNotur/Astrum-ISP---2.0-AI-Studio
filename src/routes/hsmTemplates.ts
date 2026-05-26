import { Router, Request, Response } from 'express';
import { adminDb as db } from '../lib/firebaseAdmin';

export const hsmTemplatesRouter = Router();

hsmTemplatesRouter.get('/', async (req: Request, res: Response) => {
    const tenantId = req.query.tenantId as string;
    if (!tenantId) {
        res.status(400).json({ error: 'tenantId is required' });
        return;
    }

    try {
        const templatesSnap = await db.collection('tenants').doc(tenantId).collection('hsm_templates').get();
        const templates = templatesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

hsmTemplatesRouter.post('/', async (req: Request, res: Response) => {
    const { tenantId, name, language, category, components } = req.body;
    if (!tenantId) {
        res.status(400).json({ error: 'tenantId is required' });
        return;
    }

    try {
        const newTemplate = {
            name,
            language,
            category,
            components,
            status: 'PENDING',
            createdAt: new Date(),
        };
        const docRef = await db.collection('tenants').doc(tenantId).collection('hsm_templates').add(newTemplate);
        res.status(201).json({ id: docRef.id, ...newTemplate });
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

hsmTemplatesRouter.delete('/:id', async (req: Request, res: Response) => {
    const tenantId = req.query.tenantId as string;
    const { id } = req.params;

    if (!tenantId) {
        res.status(400).json({ error: 'tenantId is required' });
        return;
    }

    try {
        const templateRef = db.collection('tenants').doc(tenantId).collection('hsm_templates').doc(id);
        const templateDoc = await templateRef.get();

        if (!templateDoc.exists) {
            res.status(404).json({ error: 'Template not found' });
            return;
        }

        if (templateDoc.data()?.status === 'APPROVED') {
            res.status(403).json({ error: 'Cannot delete APPROVED template' });
            return;
        }

        await templateRef.delete();
        res.json({ message: 'Template deleted' });
    } catch (e) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
