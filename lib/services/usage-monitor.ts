import { createClient } from '@/lib/supabase/server';
import { SubscriptionManager } from './subscription-manager';
import { NotificationService } from './notification-service';
import { UsageMetrics, BillingAlert } from '@/lib/types/billing';

export class UsageMonitor {
  private supabase = createClient();
  private subscriptionManager = new SubscriptionManager();
  private notificationService = new NotificationService();

  /**
   * Calculate and record current usage metrics for an institution
   */
  async calculateAndRecordUsage(institutionId: string): Promise<UsageMetrics> {
    const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    // Calculate actual usage from database
    const metrics = await this.calculateCurrentUsage(institutionId);
    
    // Record the usage metrics
    await this.subscriptionManager.recordUsageMetrics({
      institutionId,
      period: currentPeriod,
      metrics
    });

    return {
      institutionId,
      period: currentPeriod,
      metrics,
      recordedAt: new Date()
    };
  }

  /**
   * Calculate current usage metrics from database
   */
  private async calculateCurrentUsage(institutionId: string) {
    // Count active users
    const { count: activeUsers } = await this.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    // Count departments
    const { count: departmentCount } = await this.supabase
      .from('departments')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    // Count active integrations
    const { count: integrationCount } = await this.supabase
      .from('institution_integrations')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('enabled', true);

    // Calculate storage usage (placeholder - would integrate with actual storage system)
    // In a real implementation, this would query file storage systems
    const storageUsed = await this.calculateStorageUsage(institutionId);

    // Count API calls for current month
    const apiCallCount = await this.calculateApiCallCount(institutionId);

    return {
      activeUsers: activeUsers || 0,
      storageUsed,
      departmentCount: departmentCount || 0,
      integrationCount: integrationCount || 0,
      apiCallCount
    };
  }

  /**
   * Calculate storage usage for an institution
   */
  private async calculateStorageUsage(institutionId: string): Promise<number> {
    // Placeholder implementation
    // In a real system, this would query file storage systems like S3, Google Cloud Storage, etc.
    // For now, we'll simulate based on user count and activity
    
    const { count: userCount } = await this.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    const { count: classCount } = await this.supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId);

    // Rough estimation: 100MB per user + 500MB per class
    const estimatedStorageGB = ((userCount || 0) * 0.1) + ((classCount || 0) * 0.5);
    
    return Math.round(estimatedStorageGB * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate API call count for current month
   */
  private async calculateApiCallCount(institutionId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // In a real implementation, this would query API usage logs
    // For now, we'll simulate based on user activity
    const { count: userCount } = await this.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId)
      .eq('status', 'active');

    // Rough estimation: 100 API calls per active user per month
    return (userCount || 0) * 100;
  }

  /**
   * Check usage limits for all institutions and send notifications
   */
  async checkAllInstitutionUsageLimits(): Promise<void> {
    // Get all active institutions with subscriptions
    const { data: institutions } = await this.supabase
      .from('institutions')
      .select(`
        id,
        name,
        subscriptions!inner(
          id,
          status,
          plan_id
        )
      `)
      .eq('status', 'active')
      .eq('subscriptions.status', 'active');

    if (!institutions) return;

    for (const institution of institutions) {
      try {
        await this.checkInstitutionUsageLimits(institution.id);
      } catch (error) {
        console.error(`Failed to check usage limits for institution ${institution.id}:`, error);
      }
    }
  }

  /**
   * Check usage limits for a specific institution
   */
  async checkInstitutionUsageLimits(institutionId: string): Promise<BillingAlert[]> {
    // Calculate current usage
    await this.calculateAndRecordUsage(institutionId);
    
    // Check limits and create alerts
    const alerts = await this.subscriptionManager.checkUsageLimits(institutionId);
    
    // Send notifications for new critical alerts
    for (const alert of alerts) {
      if (alert.severity === 'critical') {
        await this.sendUsageLimitNotification(institutionId, alert);
      }
    }

    return alerts;
  }

  /**
   * Send usage limit notification to institution admins
   */
  private async sendUsageLimitNotification(institutionId: string, alert: BillingAlert): Promise<void> {
    // Get institution admins
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email, full_name')
      .eq('institution_id', institutionId)
      .in('role', ['admin', 'institution_admin', 'billing_admin']);

    if (!admins || admins.length === 0) return;

    // Get institution name
    const { data: institution } = await this.supabase
      .from('institutions')
      .select('name')
      .eq('id', institutionId)
      .single();

    const institutionName = institution?.name || 'Your Institution';

    // Send notification to each admin
    for (const admin of admins) {
      await this.notificationService.sendNotification({
        userId: admin.id,
        type: 'usage_limit_exceeded',
        title: 'Usage Limit Alert',
        message: alert.message,
        metadata: {
          institutionId,
          institutionName,
          alertId: alert.id,
          severity: alert.severity
        }
      });

      // Also send email notification for critical alerts
      if (alert.severity === 'critical') {
        await this.sendUsageLimitEmail(admin.email, admin.full_name, institutionName, alert);
      }
    }
  }

  /**
   * Send usage limit email notification
   */
  private async sendUsageLimitEmail(
    email: string, 
    name: string, 
    institutionName: string, 
    alert: BillingAlert
  ): Promise<void> {
    const subject = `Critical Usage Alert - ${institutionName}`;
    const message = `
      Dear ${name},

      Your institution "${institutionName}" has exceeded a usage limit:

      ${alert.message}

      Please take immediate action to avoid service interruption:
      - Review your current usage in the billing dashboard
      - Consider upgrading your subscription plan
      - Contact support if you need assistance

      You can manage your subscription at: [Billing Dashboard URL]

      Best regards,
      The Platform Team
    `;

    // In a real implementation, this would use an email service like SendGrid, AWS SES, etc.
    console.log(`Would send email to ${email}: ${subject}`);
    console.log(message);
  }

  /**
   * Monitor payment issues and send notifications
   */
  async monitorPaymentIssues(): Promise<void> {
    // Get all unresolved payment issues approaching grace period end
    const { data: paymentIssues } = await this.supabase
      .from('payment_issues')
      .select(`
        *,
        institutions(name),
        subscriptions(*)
      `)
      .eq('is_resolved', false)
      .lt('grace_period_end', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()); // Within 24 hours

    if (!paymentIssues) return;

    for (const issue of paymentIssues) {
      await this.sendPaymentIssueReminder(issue);
    }
  }

  /**
   * Send payment issue reminder notification
   */
  private async sendPaymentIssueReminder(paymentIssue: any): Promise<void> {
    const institutionId = paymentIssue.institution_id;
    
    // Get institution admins
    const { data: admins } = await this.supabase
      .from('users')
      .select('id, email, full_name')
      .eq('institution_id', institutionId)
      .in('role', ['admin', 'institution_admin', 'billing_admin']);

    if (!admins || admins.length === 0) return;

    const institutionName = paymentIssue.institutions?.name || 'Your Institution';
    const gracePeriodEnd = new Date(paymentIssue.grace_period_end);
    const hoursRemaining = Math.ceil((gracePeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60));

    for (const admin of admins) {
      await this.notificationService.sendNotification({
        userId: admin.id,
        type: 'payment_issue_reminder',
        title: 'Payment Issue - Action Required',
        message: `Payment issue for ${institutionName} requires attention. Grace period ends in ${hoursRemaining} hours.`,
        metadata: {
          institutionId,
          institutionName,
          paymentIssueId: paymentIssue.id,
          gracePeriodEnd: gracePeriodEnd.toISOString()
        }
      });
    }
  }

  /**
   * Process subscription renewals and generate invoices
   */
  async processSubscriptionRenewal(subscriptionId: string): Promise<void> {
    try {
      // Generate invoice for the subscription
      const invoice = await this.subscriptionManager.generateInvoice(subscriptionId);
      
      // Get subscription details
      const { data: subscription } = await this.supabase
        .from('subscriptions')
        .select(`
          *,
          institutions(name),
          subscription_plans(name, price, currency)
        `)
        .eq('id', subscriptionId)
        .single();

      if (!subscription) return;

      // Notify institution admins about the new invoice
      const { data: admins } = await this.supabase
        .from('users')
        .select('id, email, full_name')
        .eq('institution_id', subscription.institution_id)
        .in('role', ['admin', 'institution_admin', 'billing_admin']);

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await this.notificationService.sendNotification({
            userId: admin.id,
            type: 'new_invoice',
            title: 'New Invoice Generated',
            message: `A new invoice has been generated for ${subscription.institutions.name}`,
            metadata: {
              institutionId: subscription.institution_id,
              invoiceId: invoice.id,
              amount: invoice.amount,
              dueDate: invoice.dueDate.toISOString()
            }
          });
        }
      }
    } catch (error) {
      console.error(`Failed to process subscription renewal for ${subscriptionId}:`, error);
    }
  }

  /**
   * Enforce usage limits by suspending services if necessary
   */
  async enforceUsageLimits(institutionId: string): Promise<void> {
    const subscription = await this.subscriptionManager.getInstitutionSubscription(institutionId);
    if (!subscription) return;

    const plan = await this.subscriptionManager.getPlan(subscription.planId);
    if (!plan) return;

    const currentUsage = await this.subscriptionManager.getCurrentUsage(institutionId);
    if (!currentUsage) return;

    const { metrics } = currentUsage;
    let shouldSuspend = false;
    const violations: string[] = [];

    // Check hard limits
    if (plan.limits.users !== -1 && metrics.activeUsers > plan.limits.users * 1.1) {
      violations.push(`Users: ${metrics.activeUsers}/${plan.limits.users}`);
      shouldSuspend = true;
    }

    if (metrics.storageUsed > plan.limits.storage * 1.1) {
      violations.push(`Storage: ${metrics.storageUsed}GB/${plan.limits.storage}GB`);
      shouldSuspend = true;
    }

    if (plan.limits.apiCalls !== -1 && metrics.apiCallCount > plan.limits.apiCalls * 1.1) {
      violations.push(`API Calls: ${metrics.apiCallCount}/${plan.limits.apiCalls}`);
      shouldSuspend = true;
    }

    if (shouldSuspend) {
      // Create a critical payment issue instead of immediately suspending
      await this.subscriptionManager.createPaymentIssue(
        institutionId,
        subscription.id,
        'payment_failed', // Using this as a generic "action required" type
        `Usage limits exceeded: ${violations.join(', ')}. Please upgrade your plan or reduce usage.`,
        3 // 3-day grace period
      );

      // Notify admins
      const { data: admins } = await this.supabase
        .from('users')
        .select('id, email, full_name')
        .eq('institution_id', institutionId)
        .in('role', ['admin', 'institution_admin']);

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          await this.notificationService.sendNotification({
            userId: admin.id,
            type: 'usage_limit_violation',
            title: 'Critical: Usage Limits Exceeded',
            message: `Your institution has significantly exceeded usage limits. Service may be suspended if not resolved within 3 days.`,
            metadata: {
              institutionId,
              violations
            }
          });
        }
      }
    }
  }
}