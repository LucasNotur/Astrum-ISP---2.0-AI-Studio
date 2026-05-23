export interface PlanFeatureLimits {
  operators: number; // -1 for unlimited
  monthly_messages: number; // -1 for unlimited
  trial_days: number;
}

export interface PlanFeatures {
  basic_whitelabel: boolean;
  advanced_whitelabel: boolean;
  knowledge_base: boolean;
  api_access: boolean;
  custom_domain: boolean;
  priority_support: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  limits: PlanFeatureLimits;
  features: PlanFeatures;
}

export const PLANS: Record<string, Plan> = {
  FREE: {
    id: 'FREE',
    name: 'Free Trial',
    price_cents: 0,
    limits: {
      trial_days: 14,
      operators: 1,
      monthly_messages: 500,
    },
    features: {
      basic_whitelabel: false,
      advanced_whitelabel: false,
      knowledge_base: true,
      api_access: false,
      custom_domain: false,
      priority_support: false,
    }
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    price_cents: 29700,
    limits: {
      trial_days: 0,
      operators: 5,
      monthly_messages: 10000,
    },
    features: {
      basic_whitelabel: false,
      advanced_whitelabel: false,
      knowledge_base: true,
      api_access: true,
      custom_domain: false,
      priority_support: false,
    }
  },
  BUSINESS: {
    id: 'BUSINESS',
    name: 'Business',
    price_cents: 69700,
    limits: {
      trial_days: 0,
      operators: 20,
      monthly_messages: 50000,
    },
    features: {
      basic_whitelabel: true,
      advanced_whitelabel: false,
      knowledge_base: true,
      api_access: true,
      custom_domain: false,
      priority_support: true,
    }
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price_cents: 149700,
    limits: {
      trial_days: 0,
      operators: -1, // ilimitado
      monthly_messages: -1, // ilimitado
    },
    features: {
      basic_whitelabel: true,
      advanced_whitelabel: true,
      knowledge_base: true,
      api_access: true,
      custom_domain: true,
      priority_support: true,
    }
  }
};
