export interface CobraiRule {
  id: string;
  name: string;
  daysOverdue: number;
  action: 'send_message' | 'suspend_signal' | 'reactivate' | 'notify_human';
  messageTemplate?: string;
  active: boolean;
}

export interface CobraiTriggerOptions {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  amountCents: number;
  dueDate: Date;
  customerName?: string;
  customerPhone?: string;
}

export interface IRegisterCobraiJobInput {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  ruleId: string;
  bullmqJobId: string;
  scheduledFor: Date;
}

export interface ICobrancaDbPort {
  getTenantCobraiRules(tenantId: string): Promise<CobraiRule[]>;
  registerCobraiJob(opts: IRegisterCobraiJobInput): Promise<void>;
  cancelInvoiceCobraiJobs(tenantId: string, invoiceId: string): Promise<string[]>;
  createDefaultCobraiRules(tenantId: string): Promise<void>;
}
