import { adminDb as db } from './firebaseAdmin.ts';
import { FieldValue } from './db-compat/index.ts';

export interface Subscription {
  tenant_id: string;
  plan: string;
  status: string;
  amount_cents: number;
  next_billing_date: any;
  asaas_customer_id?: string;
  asaas_subscription_id?: string;
}

export interface BillingInvoice {
  tenant_id: string;
  subscription_id: string;
  amount_cents: number;
  status: string;
  due_date: any;
  paid_at?: any;
  invoice_url?: string;
}

export const saveSubscription = async (data: Subscription) => {
  const docRef = await db.collection('subscriptions').add({
     ...data,
     created_at: FieldValue.serverTimestamp()
  });
  return docRef.id;
};

export const createAsaasCustomer = async (tenantData: any) => {
  if (!process.env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY not found");
  
  const response = await fetch(`https://api.asaas.com/v3/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY
    },
    body: JSON.stringify({
      name: tenantData.name,
      email: tenantData.email,
      cpfCnpj: tenantData.cpfCnpj,
      externalReference: tenantData.id || "tenant"
    })
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.[0]?.description || 'Failed to create Asaas customer');
  return data;
};

export const createSubscription = async (tenantId: string, planId: string) => {
  if (!process.env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY not found");

  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) throw new Error('Tenant not found');
  
  const subs = await getSubscriptionsByTenant(tenantId);
  if (subs.some(s => s.status === 'ACTIVE' || s.status === 'active')) {
      throw new Error('Tenant already has an active subscription');
  }

  const tenantData = tenantDoc.data();
  let asaas_customer_id = tenantData?.asaas_customer_id;

  if (!asaas_customer_id) {
     const newCustomer = await createAsaasCustomer({ ...tenantData, id: tenantId });
     asaas_customer_id = newCustomer.id;
     await db.collection('tenants').doc(tenantId).update({ asaas_customer_id });
  }

  let value = 0;
  if (planId === 'pro') value = 99.9;
  else if (planId === 'enterprise') value = 199.9;

  const nextDueDate = new Date();
  nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  const nextDueDateStr = nextDueDate.toISOString().split('T')[0];

  const response = await fetch(`https://api.asaas.com/v3/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY
    },
    body: JSON.stringify({
      customer: asaas_customer_id,
      billingType: 'UNDEFINED',
      value,
      nextDueDate: nextDueDateStr,
      cycle: 'MONTHLY',
      description: `Plan ${planId}`,
      externalReference: tenantId
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.[0]?.description || 'Failed to create Asaas subscription');
  
  await saveSubscription({
     tenant_id: tenantId,
     plan: planId,
     status: 'ACTIVE',
     amount_cents: value * 100,
     next_billing_date: nextDueDate,
     asaas_customer_id: asaas_customer_id,
     asaas_subscription_id: data.id
  });

  return data;
};

export const cancelSubscription = async (tenantId: string) => {
  if (!process.env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY not found");
  
  const subs = await getSubscriptionsByTenant(tenantId);
  const activeSub = subs.find(s => s.status === 'ACTIVE' || s.status === 'active');
  
  if (!activeSub || !activeSub.asaas_subscription_id) throw new Error('No active subscription found');

  const response = await fetch(`https://api.asaas.com/v3/subscriptions/${activeSub.asaas_subscription_id}`, {
    method: 'DELETE',
    headers: {
      'access_token': process.env.ASAAS_API_KEY
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.[0]?.description || 'Failed to cancel Asaas subscription');
  
  await updateSubscription(activeSub.id, { status: 'CANCELLED' });
  
  return data;
};

export const getPaymentStatus = async (paymentId: string) => {
  if (!process.env.ASAAS_API_KEY) throw new Error("ASAAS_API_KEY not found");

  const response = await fetch(`https://api.asaas.com/v3/payments/${paymentId}`, {
    headers: {
      'access_token': process.env.ASAAS_API_KEY
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.errors?.[0]?.description || 'Failed to get payment status');
  return data;
};

export const getSubscription = async (id: string) => {
  const doc = await db.collection('subscriptions').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

export const updateSubscription = async (id: string, data: Partial<Subscription>) => {
  await db.collection('subscriptions').doc(id).update(data);
};

export const getSubscriptionsByTenant = async (tenantId: string) => {
  const snapshot = await db.collection('subscriptions').where('tenant_id', '==', tenantId).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Subscription) }));
};

export const createBillingInvoice = async (data: BillingInvoice) => {
  const docRef = await db.collection('billing_invoices').add({
    ...data,
    created_at: FieldValue.serverTimestamp()
  });
  return docRef.id;
};

export const getBillingInvoice = async (id: string) => {
  const doc = await db.collection('billing_invoices').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

export const updateBillingInvoice = async (id: string, data: Partial<BillingInvoice>) => {
  await db.collection('billing_invoices').doc(id).update(data);
};

export const getBillingInvoicesByTenant = async (tenantId: string) => {
  const snapshot = await db.collection('billing_invoices').where('tenant_id', '==', tenantId).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const asaasWebhookHandler = async (req: any, res: any) => {
  const token = req.headers['asaas-access-token'] as string;
  try {
     await handleAsaasWebhook(token, req.body);
     res.status(200).send('OK');
  } catch (err: any) {
     res.status(err.status || 500).json({ error: err.message });
  }
};

export const handleAsaasWebhook = async (token: string, payload: any) => {
  if (token !== (process.env.ASAAS_WEBHOOK_TOKEN || process.env.ASAAS_API_KEY)) {
    const error = new Error('Unauthorized');
    (error as any).status = 401;
    throw error;
  }

  const { event, payment } = payload;
  if (!payment) return;

  const tenantId = payment.externalReference || payload.customer;
  if (!tenantId) return;

  if (event === 'PAYMENT_RECEIVED') {
     await db.collection('tenants').doc(tenantId).update({
        billing_status: 'paid',
        status: 'active'
     });
  } else if (event === 'PAYMENT_OVERDUE') {
     const { getTenantQueue } = await import('./queue.ts');
     const systemQueue = getTenantQueue('system');
     await systemQueue.add('lockout_tenant', { tenantId }, { delay: 3 * 24 * 60 * 60 * 1000 });
  } else if (event === 'PAYMENT_DELETED') {
     await cancelSubscription(tenantId);
  }
};
