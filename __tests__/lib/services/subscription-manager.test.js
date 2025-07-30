const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

// Mock the Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        order: jest.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      order: jest.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ 
          data: { 
            id: 'test-id', 
            name: 'Test Plan',
            price: 99.99,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, 
          error: null 
        }))
      }))
    })),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null }))
        }))
      }))
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }))
};

// Mock the createClient function
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}));

describe('Subscription Manager Tests', () => {
  let SubscriptionManager;
  let subscriptionManager;

  beforeEach(async () => {
    // Dynamic import to avoid module loading issues
    const module = await import('@/lib/services/subscription-manager');
    SubscriptionManager = module.SubscriptionManager;
    subscriptionManager = new SubscriptionManager();
  });

  describe('Subscription Plan Management', () => {
    it('should create a subscription plan', async () => {
      const planData = {
        name: 'Test Plan',
        description: 'Plan for testing',
        price: 99.99,
        currency: 'USD',
        billingCycle: 'monthly',
        features: ['Feature 1', 'Feature 2'],
        limits: {
          users: 100,
          storage: 50,
          departments: 10,
          integrations: 5,
          apiCalls: 10000
        },
        isActive: true
      };

      const plan = await subscriptionManager.createPlan(planData);
      
      expect(plan).toBeDefined();
      expect(plan.id).toBe('test-id');
      expect(plan.name).toBe('Test Plan');
      expect(plan.price).toBe(99.99);
    });

    it('should get available plans', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ 
              data: [
                { 
                  id: 'plan-1', 
                  name: 'Basic Plan', 
                  price: 29.99,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  billing_cycle: 'monthly',
                  features: [],
                  limits: {},
                  is_active: true
                }
              ], 
              error: null 
            }))
          }))
        }))
      });

      const plans = await subscriptionManager.getAvailablePlans();
      
      expect(plans).toBeDefined();
      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBeGreaterThan(0);
    });
  });

  describe('Subscription Management', () => {
    it('should create a subscription', async () => {
      // Mock plan retrieval
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'plan-id',
                name: 'Test Plan',
                billing_cycle: 'monthly',
                price: 99.99,
                currency: 'USD',
                features: [],
                limits: { users: 100 },
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      // Mock subscription creation
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'subscription-id',
                institution_id: 'institution-id',
                plan_id: 'plan-id',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                cancel_at_period_end: false,
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      const subscription = await subscriptionManager.createSubscription(
        'institution-id',
        'plan-id'
      );
      
      expect(subscription).toBeDefined();
      expect(subscription.id).toBe('subscription-id');
      expect(subscription.institutionId).toBe('institution-id');
      expect(subscription.planId).toBe('plan-id');
      expect(subscription.status).toBe('active');
    });

    it('should get institution subscription', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'subscription-id',
                institution_id: 'institution-id',
                plan_id: 'plan-id',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date().toISOString(),
                cancel_at_period_end: false,
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      const subscription = await subscriptionManager.getInstitutionSubscription('institution-id');
      
      expect(subscription).toBeDefined();
      expect(subscription.institutionId).toBe('institution-id');
    });
  });

  describe('Usage Tracking', () => {
    it('should record usage metrics', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => Promise.resolve({ error: null }))
      });

      const metrics = {
        institutionId: 'institution-id',
        period: '2024-01',
        metrics: {
          activeUsers: 50,
          storageUsed: 25.5,
          departmentCount: 5,
          integrationCount: 2,
          apiCallCount: 5000
        }
      };

      await expect(subscriptionManager.recordUsageMetrics(metrics)).resolves.not.toThrow();
    });

    it('should get usage metrics', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            order: jest.fn(() => Promise.resolve({ 
              data: [
                {
                  institution_id: 'institution-id',
                  period: '2024-01',
                  metrics: {
                    activeUsers: 50,
                    storageUsed: 25.5,
                    departmentCount: 5,
                    integrationCount: 2,
                    apiCallCount: 5000
                  },
                  recorded_at: new Date().toISOString()
                }
              ], 
              error: null 
            }))
          }))
        }))
      });

      const metrics = await subscriptionManager.getUsageMetrics('institution-id', '2024-01');
      
      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(1);
      expect(metrics[0].institutionId).toBe('institution-id');
    });
  });

  describe('Invoice Management', () => {
    it('should generate invoice', async () => {
      // Mock subscription retrieval
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'subscription-id',
                institution_id: 'institution-id',
                plan_id: 'plan-id',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      // Mock plan retrieval
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'plan-id',
                name: 'Test Plan',
                price: 99.99,
                currency: 'USD',
                billing_cycle: 'monthly'
              }, 
              error: null 
            }))
          }))
        }))
      });

      // Mock invoice count for number generation
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lt: jest.fn(() => Promise.resolve({ count: 0 }))
          }))
        }))
      });

      // Mock invoice creation
      mockSupabase.from.mockReturnValueOnce({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'invoice-id',
                institution_id: 'institution-id',
                subscription_id: 'subscription-id',
                number: 'INV-2024-000001',
                status: 'open',
                amount: 99.99,
                currency: 'USD',
                period_start: new Date().toISOString(),
                period_end: new Date().toISOString(),
                due_date: new Date().toISOString(),
                line_items: [],
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      const invoice = await subscriptionManager.generateInvoice('subscription-id');
      
      expect(invoice).toBeDefined();
      expect(invoice.id).toBe('invoice-id');
      expect(invoice.subscriptionId).toBe('subscription-id');
      expect(invoice.amount).toBe(99.99);
      expect(invoice.status).toBe('open');
    });
  });

  describe('Payment Issue Management', () => {
    it('should create payment issue', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ 
              data: { 
                id: 'issue-id',
                institution_id: 'institution-id',
                subscription_id: 'subscription-id',
                type: 'payment_failed',
                severity: 'critical',
                description: 'Payment failed',
                grace_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                is_resolved: false,
                actions: [],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }, 
              error: null 
            }))
          }))
        }))
      });

      const paymentIssue = await subscriptionManager.createPaymentIssue(
        'institution-id',
        'subscription-id',
        'payment_failed',
        'Payment failed',
        7
      );
      
      expect(paymentIssue).toBeDefined();
      expect(paymentIssue.id).toBe('issue-id');
      expect(paymentIssue.type).toBe('payment_failed');
      expect(paymentIssue.severity).toBe('critical');
      expect(paymentIssue.isResolved).toBe(false);
    });
  });
});