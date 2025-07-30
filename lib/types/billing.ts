export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  limits: {
    users: number;
    storage: number; // in GB
    departments: number;
    integrations: number;
    apiCalls: number; // per month
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  institutionId: string;
  planId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'trial' | 'suspended';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageMetrics {
  institutionId: string;
  period: string; // YYYY-MM format
  metrics: {
    activeUsers: number;
    storageUsed: number; // in GB
    departmentCount: number;
    integrationCount: number;
    apiCallCount: number;
  };
  recordedAt: Date;
}

export interface Invoice {
  id: string;
  institutionId: string;
  subscriptionId: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  paidAt?: Date;
  lineItems: InvoiceLineItem[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  metadata: Record<string, any>;
}

export interface PaymentMethod {
  id: string;
  institutionId: string;
  type: 'card' | 'bank_account' | 'paypal';
  isDefault: boolean;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingAlert {
  id: string;
  institutionId: string;
  type: 'usage_limit' | 'payment_failed' | 'trial_ending' | 'subscription_cancelled';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  threshold?: number;
  currentValue?: number;
  isResolved: boolean;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface UsageLimitConfig {
  institutionId: string;
  limits: {
    users: {
      soft: number; // 80% warning
      hard: number; // 100% limit
    };
    storage: {
      soft: number;
      hard: number;
    };
    apiCalls: {
      soft: number;
      hard: number;
    };
  };
  notifications: {
    enabled: boolean;
    recipients: string[];
    thresholds: number[]; // e.g., [80, 90, 95, 100]
  };
}

export interface PaymentIssue {
  id: string;
  institutionId: string;
  subscriptionId: string;
  type: 'payment_failed' | 'card_expired' | 'insufficient_funds' | 'payment_method_invalid';
  severity: 'warning' | 'critical';
  description: string;
  gracePeriodEnd: Date;
  isResolved: boolean;
  resolvedAt?: Date;
  actions: PaymentIssueAction[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentIssueAction {
  id: string;
  type: 'retry_payment' | 'update_payment_method' | 'contact_support' | 'downgrade_plan';
  description: string;
  url?: string;
  completed: boolean;
  completedAt?: Date;
}

export interface BillingSettings {
  institutionId: string;
  autoPayEnabled: boolean;
  invoiceDelivery: 'email' | 'portal' | 'both';
  gracePeriodDays: number;
  usageAlertThresholds: number[];
  billingContacts: string[];
  taxSettings: {
    taxId?: string;
    taxExempt: boolean;
    billingAddress: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
}