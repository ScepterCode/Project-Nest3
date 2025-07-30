import { createClient } from '@/lib/supabase/server';
import { 
  SubscriptionPlan, 
  Subscription, 
  UsageMetrics, 
  Invoice, 
  PaymentMethod,
  BillingAlert,
  UsageLimitConfig,
  PaymentIssue,
  BillingSettings
} from '@/lib/types/billing';

export class SubscriptionManager {
  private supabase = createClient();

  // Subscription Plan Management
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw new Error(`Failed to fetch subscription plans: ${error.message}`);
    return data || [];
  }

  async getPlan(planId: string): Promise<SubscriptionPlan | null> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription plan: ${error.message}`);
    }
    return data;
  }

  async createPlan(plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubscriptionPlan> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .insert({
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        billing_cycle: plan.billingCycle,
        features: plan.features,
        limits: plan.limits,
        is_active: plan.isActive
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create subscription plan: ${error.message}`);
    return this.mapPlanFromDb(data);
  }

  // Subscription Management
  async getInstitutionSubscription(institutionId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select(`
        *,
        subscription_plans (*)
      `)
      .eq('institution_id', institutionId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }
    return data ? this.mapSubscriptionFromDb(data) : null;
  }

  async createSubscription(
    institutionId: string, 
    planId: string, 
    trialDays?: number
  ): Promise<Subscription> {
    const plan = await this.getPlan(planId);
    if (!plan) throw new Error('Subscription plan not found');

    const now = new Date();
    const trialEnd = trialDays ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : undefined;
    const periodStart = trialEnd || now;
    const periodEnd = new Date(
      plan.billingCycle === 'yearly' 
        ? periodStart.getTime() + 365 * 24 * 60 * 60 * 1000
        : periodStart.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    const { data, error } = await this.supabase
      .from('subscriptions')
      .insert({
        institution_id: institutionId,
        plan_id: planId,
        status: trialEnd ? 'trial' : 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        trial_end: trialEnd?.toISOString(),
        cancel_at_period_end: false,
        metadata: {}
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create subscription: ${error.message}`);
    return this.mapSubscriptionFromDb(data);
  }

  async updateSubscription(
    subscriptionId: string, 
    updates: Partial<Subscription>
  ): Promise<Subscription> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .update({
        plan_id: updates.planId,
        status: updates.status,
        cancel_at_period_end: updates.cancelAtPeriodEnd,
        cancelled_at: updates.cancelledAt?.toISOString(),
        metadata: updates.metadata
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update subscription: ${error.message}`);
    return this.mapSubscriptionFromDb(data);
  }

  async cancelSubscription(subscriptionId: string, immediate = false): Promise<Subscription> {
    const updates: any = {
      cancel_at_period_end: !immediate,
      cancelled_at: new Date().toISOString()
    };

    if (immediate) {
      updates.status = 'cancelled';
    }

    const { data, error } = await this.supabase
      .from('subscriptions')
      .update(updates)
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw new Error(`Failed to cancel subscription: ${error.message}`);
    return this.mapSubscriptionFromDb(data);
  }

  // Usage Tracking
  async recordUsageMetrics(metrics: Omit<UsageMetrics, 'recordedAt'>): Promise<void> {
    const { error } = await this.supabase
      .from('usage_metrics')
      .insert({
        institution_id: metrics.institutionId,
        period: metrics.period,
        metrics: metrics.metrics,
        recorded_at: new Date().toISOString()
      });

    if (error) throw new Error(`Failed to record usage metrics: ${error.message}`);
  }

  async getUsageMetrics(institutionId: string, period?: string): Promise<UsageMetrics[]> {
    let query = this.supabase
      .from('usage_metrics')
      .select('*')
      .eq('institution_id', institutionId)
      .order('recorded_at', { ascending: false });

    if (period) {
      query = query.eq('period', period);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch usage metrics: ${error.message}`);
    
    return (data || []).map(this.mapUsageMetricsFromDb);
  }

  async getCurrentUsage(institutionId: string): Promise<UsageMetrics | null> {
    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
    const metrics = await this.getUsageMetrics(institutionId, currentPeriod);
    return metrics[0] || null;
  }

  // Usage Limit Monitoring
  async checkUsageLimits(institutionId: string): Promise<BillingAlert[]> {
    const subscription = await this.getInstitutionSubscription(institutionId);
    if (!subscription) return [];

    const plan = await this.getPlan(subscription.planId);
    if (!plan) return [];

    const currentUsage = await this.getCurrentUsage(institutionId);
    if (!currentUsage) return [];

    const alerts: BillingAlert[] = [];
    const { metrics } = currentUsage;

    // Check user limit
    if (metrics.activeUsers >= plan.limits.users * 0.8) {
      alerts.push(await this.createUsageAlert(
        institutionId,
        'usage_limit',
        metrics.activeUsers >= plan.limits.users ? 'critical' : 'warning',
        `User limit ${metrics.activeUsers >= plan.limits.users ? 'exceeded' : 'approaching'}: ${metrics.activeUsers}/${plan.limits.users}`,
        plan.limits.users,
        metrics.activeUsers
      ));
    }

    // Check storage limit
    if (metrics.storageUsed >= plan.limits.storage * 0.8) {
      alerts.push(await this.createUsageAlert(
        institutionId,
        'usage_limit',
        metrics.storageUsed >= plan.limits.storage ? 'critical' : 'warning',
        `Storage limit ${metrics.storageUsed >= plan.limits.storage ? 'exceeded' : 'approaching'}: ${metrics.storageUsed}GB/${plan.limits.storage}GB`,
        plan.limits.storage,
        metrics.storageUsed
      ));
    }

    // Check API calls limit
    if (metrics.apiCallCount >= plan.limits.apiCalls * 0.8) {
      alerts.push(await this.createUsageAlert(
        institutionId,
        'usage_limit',
        metrics.apiCallCount >= plan.limits.apiCalls ? 'critical' : 'warning',
        `API calls limit ${metrics.apiCallCount >= plan.limits.apiCalls ? 'exceeded' : 'approaching'}: ${metrics.apiCallCount}/${plan.limits.apiCalls}`,
        plan.limits.apiCalls,
        metrics.apiCallCount
      ));
    }

    return alerts;
  }

  private async createUsageAlert(
    institutionId: string,
    type: BillingAlert['type'],
    severity: BillingAlert['severity'],
    message: string,
    threshold: number,
    currentValue: number
  ): Promise<BillingAlert> {
    const { data, error } = await this.supabase
      .from('billing_alerts')
      .insert({
        institution_id: institutionId,
        type,
        severity,
        message,
        threshold,
        current_value: currentValue,
        is_resolved: false
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create billing alert: ${error.message}`);
    return this.mapBillingAlertFromDb(data);
  }

  // Invoice Management
  async generateInvoice(subscriptionId: string): Promise<Invoice> {
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    const plan = await this.getPlan(subscription.planId);
    if (!plan) throw new Error('Subscription plan not found');

    const invoiceNumber = await this.generateInvoiceNumber();
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    const { data, error } = await this.supabase
      .from('invoices')
      .insert({
        institution_id: subscription.institutionId,
        subscription_id: subscriptionId,
        number: invoiceNumber,
        status: 'open',
        amount: plan.price,
        currency: plan.currency,
        period_start: subscription.currentPeriodStart.toISOString(),
        period_end: subscription.currentPeriodEnd.toISOString(),
        due_date: dueDate.toISOString(),
        line_items: [{
          id: crypto.randomUUID(),
          description: `${plan.name} - ${plan.billingCycle} subscription`,
          quantity: 1,
          unitPrice: plan.price,
          amount: plan.price,
          metadata: {}
        }],
        metadata: {}
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to generate invoice: ${error.message}`);
    return this.mapInvoiceFromDb(data);
  }

  async getInvoices(institutionId: string): Promise<Invoice[]> {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('*')
      .eq('institution_id', institutionId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch invoices: ${error.message}`);
    return (data || []).map(this.mapInvoiceFromDb);
  }

  async markInvoicePaid(invoiceId: string): Promise<Invoice> {
    const { data, error } = await this.supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw new Error(`Failed to mark invoice as paid: ${error.message}`);
    return this.mapInvoiceFromDb(data);
  }

  // Payment Issue Management
  async createPaymentIssue(
    institutionId: string,
    subscriptionId: string,
    type: PaymentIssue['type'],
    description: string,
    gracePeriodDays = 7
  ): Promise<PaymentIssue> {
    const gracePeriodEnd = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000);
    
    const actions: PaymentIssue['actions'] = [];
    
    switch (type) {
      case 'payment_failed':
        actions.push({
          id: crypto.randomUUID(),
          type: 'retry_payment',
          description: 'Retry the failed payment',
          completed: false
        });
        actions.push({
          id: crypto.randomUUID(),
          type: 'update_payment_method',
          description: 'Update your payment method',
          url: '/billing/payment-methods',
          completed: false
        });
        break;
      case 'card_expired':
        actions.push({
          id: crypto.randomUUID(),
          type: 'update_payment_method',
          description: 'Update your expired payment method',
          url: '/billing/payment-methods',
          completed: false
        });
        break;
      default:
        actions.push({
          id: crypto.randomUUID(),
          type: 'contact_support',
          description: 'Contact support for assistance',
          url: '/support',
          completed: false
        });
    }

    const { data, error } = await this.supabase
      .from('payment_issues')
      .insert({
        institution_id: institutionId,
        subscription_id: subscriptionId,
        type,
        severity: type === 'payment_failed' ? 'critical' : 'warning',
        description,
        grace_period_end: gracePeriodEnd.toISOString(),
        is_resolved: false,
        actions
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create payment issue: ${error.message}`);
    return this.mapPaymentIssueFromDb(data);
  }

  async getPaymentIssues(institutionId: string): Promise<PaymentIssue[]> {
    const { data, error } = await this.supabase
      .from('payment_issues')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('is_resolved', false)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch payment issues: ${error.message}`);
    return (data || []).map(this.mapPaymentIssueFromDb);
  }

  async resolvePaymentIssue(issueId: string): Promise<PaymentIssue> {
    const { data, error } = await this.supabase
      .from('payment_issues')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString()
      })
      .eq('id', issueId)
      .select()
      .single();

    if (error) throw new Error(`Failed to resolve payment issue: ${error.message}`);
    return this.mapPaymentIssueFromDb(data);
  }

  // Helper methods
  private async getSubscriptionById(subscriptionId: string): Promise<Subscription | null> {
    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch subscription: ${error.message}`);
    }
    return data ? this.mapSubscriptionFromDb(data) : null;
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { count } = await this.supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`)
      .lt('created_at', `${year + 1}-01-01`);

    const sequence = (count || 0) + 1;
    return `INV-${year}-${sequence.toString().padStart(6, '0')}`;
  }

  // Mapping functions
  private mapPlanFromDb(data: any): SubscriptionPlan {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      price: data.price,
      currency: data.currency,
      billingCycle: data.billing_cycle,
      features: data.features,
      limits: data.limits,
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapSubscriptionFromDb(data: any): Subscription {
    return {
      id: data.id,
      institutionId: data.institution_id,
      planId: data.plan_id,
      status: data.status,
      currentPeriodStart: new Date(data.current_period_start),
      currentPeriodEnd: new Date(data.current_period_end),
      trialEnd: data.trial_end ? new Date(data.trial_end) : undefined,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      cancelledAt: data.cancelled_at ? new Date(data.cancelled_at) : undefined,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapUsageMetricsFromDb(data: any): UsageMetrics {
    return {
      institutionId: data.institution_id,
      period: data.period,
      metrics: data.metrics,
      recordedAt: new Date(data.recorded_at)
    };
  }

  private mapInvoiceFromDb(data: any): Invoice {
    return {
      id: data.id,
      institutionId: data.institution_id,
      subscriptionId: data.subscription_id,
      number: data.number,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      periodStart: new Date(data.period_start),
      periodEnd: new Date(data.period_end),
      dueDate: new Date(data.due_date),
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      lineItems: data.line_items,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }

  private mapBillingAlertFromDb(data: any): BillingAlert {
    return {
      id: data.id,
      institutionId: data.institution_id,
      type: data.type,
      severity: data.severity,
      message: data.message,
      threshold: data.threshold,
      currentValue: data.current_value,
      isResolved: data.is_resolved,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
      createdAt: new Date(data.created_at)
    };
  }

  private mapPaymentIssueFromDb(data: any): PaymentIssue {
    return {
      id: data.id,
      institutionId: data.institution_id,
      subscriptionId: data.subscription_id,
      type: data.type,
      severity: data.severity,
      description: data.description,
      gracePeriodEnd: new Date(data.grace_period_end),
      isResolved: data.is_resolved,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : undefined,
      actions: data.actions,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
}