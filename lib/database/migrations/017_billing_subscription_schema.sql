-- Subscription and Billing Management Schema

-- Subscription plans table
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  billing_cycle VARCHAR CHECK (billing_cycle IN ('monthly', 'yearly')) DEFAULT 'monthly',
  features TEXT[] DEFAULT '{}',
  limits JSONB NOT NULL DEFAULT '{}', -- {users: 100, storage: 10, departments: 5, integrations: 3, apiCalls: 10000}
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
  status VARCHAR CHECK (status IN ('active', 'past_due', 'cancelled', 'trial', 'suspended')) DEFAULT 'active',
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  trial_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id) -- One active subscription per institution
);

-- Usage metrics table
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  period VARCHAR NOT NULL, -- YYYY-MM format
  metrics JSONB NOT NULL DEFAULT '{}', -- {activeUsers: 50, storageUsed: 5.2, departmentCount: 3, integrationCount: 2, apiCallCount: 5000}
  recorded_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id, period)
);

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) NOT NULL,
  number VARCHAR UNIQUE NOT NULL,
  status VARCHAR CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')) DEFAULT 'draft',
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  paid_at TIMESTAMP,
  line_items JSONB NOT NULL DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payment methods table
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  type VARCHAR CHECK (type IN ('card', 'bank_account', 'paypal')) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}', -- Encrypted payment details
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Billing alerts table
CREATE TABLE billing_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  type VARCHAR CHECK (type IN ('usage_limit', 'payment_failed', 'trial_ending', 'subscription_cancelled')) NOT NULL,
  severity VARCHAR CHECK (severity IN ('info', 'warning', 'critical')) DEFAULT 'info',
  message TEXT NOT NULL,
  threshold DECIMAL(10,2),
  current_value DECIMAL(10,2),
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment issues table
CREATE TABLE payment_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) NOT NULL,
  type VARCHAR CHECK (type IN ('payment_failed', 'card_expired', 'insufficient_funds', 'payment_method_invalid')) NOT NULL,
  severity VARCHAR CHECK (severity IN ('warning', 'critical')) DEFAULT 'warning',
  description TEXT NOT NULL,
  grace_period_end TIMESTAMP NOT NULL,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  actions JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Billing settings table
CREATE TABLE billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) UNIQUE NOT NULL,
  auto_pay_enabled BOOLEAN DEFAULT TRUE,
  invoice_delivery VARCHAR CHECK (invoice_delivery IN ('email', 'portal', 'both')) DEFAULT 'email',
  grace_period_days INTEGER DEFAULT 7,
  usage_alert_thresholds INTEGER[] DEFAULT '{80, 90, 95}',
  billing_contacts TEXT[] DEFAULT '{}',
  tax_settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_institution_id ON subscriptions(institution_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_usage_metrics_institution_period ON usage_metrics(institution_id, period);
CREATE INDEX idx_invoices_institution_id ON invoices(institution_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_billing_alerts_institution_id ON billing_alerts(institution_id);
CREATE INDEX idx_billing_alerts_unresolved ON billing_alerts(institution_id, is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_payment_issues_institution_id ON payment_issues(institution_id);
CREATE INDEX idx_payment_issues_unresolved ON payment_issues(institution_id, is_resolved) WHERE is_resolved = FALSE;

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price, currency, billing_cycle, features, limits) VALUES
('Free', 'Basic plan for small institutions', 0.00, 'USD', 'monthly', 
 '{"Basic Support", "Up to 50 users", "5GB storage"}',
 '{"users": 50, "storage": 5, "departments": 2, "integrations": 1, "apiCalls": 1000}'
),
('Basic', 'Standard plan for growing institutions', 29.99, 'USD', 'monthly',
 '{"Email Support", "Up to 200 users", "25GB storage", "Basic Analytics"}',
 '{"users": 200, "storage": 25, "departments": 10, "integrations": 3, "apiCalls": 10000}'
),
('Professional', 'Advanced plan for larger institutions', 99.99, 'USD', 'monthly',
 '{"Priority Support", "Up to 1000 users", "100GB storage", "Advanced Analytics", "Custom Branding"}',
 '{"users": 1000, "storage": 100, "departments": 50, "integrations": 10, "apiCalls": 50000}'
),
('Enterprise', 'Full-featured plan for large organizations', 299.99, 'USD', 'monthly',
 '{"24/7 Support", "Unlimited users", "500GB storage", "Full Analytics Suite", "Custom Branding", "SSO Integration", "API Access"}',
 '{"users": -1, "storage": 500, "departments": -1, "integrations": -1, "apiCalls": 200000}'
);

-- Functions for automated billing processes
CREATE OR REPLACE FUNCTION check_subscription_renewals()
RETURNS void AS $$
BEGIN
  -- Update expired subscriptions to past_due
  UPDATE subscriptions 
  SET status = 'past_due', updated_at = NOW()
  WHERE status = 'active' 
    AND current_period_end < NOW()
    AND NOT cancel_at_period_end;
    
  -- Cancel subscriptions that are set to cancel at period end
  UPDATE subscriptions 
  SET status = 'cancelled', updated_at = NOW()
  WHERE status = 'active' 
    AND current_period_end < NOW()
    AND cancel_at_period_end;
    
  -- End trial subscriptions
  UPDATE subscriptions 
  SET status = 'active', updated_at = NOW()
  WHERE status = 'trial' 
    AND trial_end < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to calculate current usage for an institution
CREATE OR REPLACE FUNCTION calculate_current_usage(institution_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  user_count INTEGER;
  storage_used DECIMAL;
  dept_count INTEGER;
  integration_count INTEGER;
  api_calls INTEGER;
BEGIN
  -- Count active users
  SELECT COUNT(*) INTO user_count
  FROM users u
  JOIN user_institutions ui ON u.id = ui.user_id
  WHERE ui.institution_id = institution_uuid
    AND u.status = 'active';
    
  -- Calculate storage usage (placeholder - would integrate with actual storage system)
  storage_used := 0;
  
  -- Count departments
  SELECT COUNT(*) INTO dept_count
  FROM departments
  WHERE institution_id = institution_uuid
    AND status = 'active';
    
  -- Count active integrations
  SELECT COUNT(*) INTO integration_count
  FROM institution_integrations
  WHERE institution_id = institution_uuid
    AND enabled = TRUE;
    
  -- Count API calls for current month (placeholder)
  api_calls := 0;
  
  RETURN jsonb_build_object(
    'activeUsers', user_count,
    'storageUsed', storage_used,
    'departmentCount', dept_count,
    'integrationCount', integration_count,
    'apiCallCount', api_calls
  );
END;
$$ LANGUAGE plpgsql;

-- Trigger to update subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscription_update_timestamp
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_timestamp();

-- Trigger to ensure only one default payment method per institution
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE payment_methods 
    SET is_default = FALSE 
    WHERE institution_id = NEW.institution_id 
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_method_default_constraint
  BEFORE INSERT OR UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_payment_method();