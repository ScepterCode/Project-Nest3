-- Enhanced Notification System Schema

-- Notification templates with branding support
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  text_template TEXT,
  variables JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_notification_templates_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT uq_notification_templates_name_institution 
    UNIQUE(institution_id, name),
  CONSTRAINT chk_notification_templates_type 
    CHECK (type IN ('welcome', 'role_assignment', 'class_enrollment', 'assignment_due', 'grade_posted', 'system_alert', 'custom'))
);

-- User delivery preferences
CREATE TABLE notification_delivery_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  institution_id UUID NOT NULL,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  push_enabled BOOLEAN DEFAULT true,
  frequency VARCHAR(20) DEFAULT 'immediate',
  quiet_hours JSONB DEFAULT '{"enabled": false}',
  channels JSONB DEFAULT '[]',
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_delivery_preferences_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_preferences_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT uq_delivery_preferences_user_institution 
    UNIQUE(user_id, institution_id),
  CONSTRAINT chk_delivery_preferences_frequency 
    CHECK (frequency IN ('immediate', 'hourly', 'daily', 'weekly', 'never'))
);

-- Notification campaigns
CREATE TABLE notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  template_id UUID NOT NULL,
  target_audience JSONB NOT NULL,
  scheduled_at TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft',
  ab_test_config JSONB DEFAULT '{}',
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_campaigns_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaigns_template 
    FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_campaigns_created_by 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_campaigns_status 
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'))
);

-- Campaign analytics
CREATE TABLE campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  sent INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,4) DEFAULT 0,
  open_rate DECIMAL(5,4) DEFAULT 0,
  click_rate DECIMAL(5,4) DEFAULT 0,
  engagement_score DECIMAL(5,4) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_campaign_analytics_campaign 
    FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT uq_campaign_analytics_campaign 
    UNIQUE(campaign_id)
);

-- Individual notification engagement tracking
CREATE TABLE notification_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT fk_engagements_campaign 
    FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_engagements_user 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_engagements_action 
    CHECK (action IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed'))
);

-- A/B test variants
CREATE TABLE ab_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL,
  variant_name VARCHAR(100) NOT NULL,
  template_id UUID NOT NULL,
  percentage INTEGER NOT NULL,
  sent INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_ab_variants_campaign 
    FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_ab_variants_template 
    FOREIGN KEY (template_id) REFERENCES notification_templates(id) ON DELETE CASCADE,
  CONSTRAINT chk_ab_variants_percentage 
    CHECK (percentage >= 0 AND percentage <= 100)
);

-- Institutional branding configurations
CREATE TABLE institution_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL,
  logo_url VARCHAR(500),
  primary_color VARCHAR(7) DEFAULT '#007bff',
  secondary_color VARCHAR(7) DEFAULT '#6c757d',
  background_color VARCHAR(7) DEFAULT '#ffffff',
  text_color VARCHAR(7) DEFAULT '#212529',
  font_family VARCHAR(100) DEFAULT 'Arial, sans-serif',
  font_size VARCHAR(20) DEFAULT '14px',
  custom_css TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_branding_institution 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE,
  CONSTRAINT uq_branding_institution 
    UNIQUE(institution_id)
);

-- Indexes for performance
CREATE INDEX idx_notification_templates_institution_type ON notification_templates(institution_id, type);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_delivery_preferences_user ON notification_delivery_preferences(user_id);
CREATE INDEX idx_campaigns_institution_status ON notification_campaigns(institution_id, status);
CREATE INDEX idx_campaigns_scheduled ON notification_campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX idx_engagements_campaign_action ON notification_engagements(campaign_id, action);
CREATE INDEX idx_engagements_user_timestamp ON notification_engagements(user_id, timestamp DESC);
CREATE INDEX idx_ab_variants_campaign ON ab_test_variants(campaign_id);

-- Functions for analytics calculations
CREATE OR REPLACE FUNCTION update_campaign_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update campaign analytics when engagement is recorded
  INSERT INTO campaign_analytics (campaign_id, sent, delivered, opened, clicked, bounced, unsubscribed)
  SELECT 
    NEW.campaign_id,
    COUNT(*) FILTER (WHERE action = 'sent'),
    COUNT(*) FILTER (WHERE action = 'delivered'),
    COUNT(*) FILTER (WHERE action = 'opened'),
    COUNT(*) FILTER (WHERE action = 'clicked'),
    COUNT(*) FILTER (WHERE action = 'bounced'),
    COUNT(*) FILTER (WHERE action = 'unsubscribed')
  FROM notification_engagements 
  WHERE campaign_id = NEW.campaign_id
  ON CONFLICT (campaign_id) DO UPDATE SET
    sent = EXCLUDED.sent,
    delivered = EXCLUDED.delivered,
    opened = EXCLUDED.opened,
    clicked = EXCLUDED.clicked,
    bounced = EXCLUDED.bounced,
    unsubscribed = EXCLUDED.unsubscribed,
    delivery_rate = CASE WHEN EXCLUDED.sent > 0 THEN EXCLUDED.delivered::DECIMAL / EXCLUDED.sent ELSE 0 END,
    open_rate = CASE WHEN EXCLUDED.delivered > 0 THEN EXCLUDED.opened::DECIMAL / EXCLUDED.delivered ELSE 0 END,
    click_rate = CASE WHEN EXCLUDED.opened > 0 THEN EXCLUDED.clicked::DECIMAL / EXCLUDED.opened ELSE 0 END,
    engagement_score = CASE 
      WHEN EXCLUDED.sent > 0 THEN 
        (EXCLUDED.opened::DECIMAL * 0.3 + EXCLUDED.clicked::DECIMAL * 0.7) / EXCLUDED.sent 
      ELSE 0 
    END,
    updated_at = NOW();
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update analytics
CREATE TRIGGER trigger_update_campaign_analytics
  AFTER INSERT ON notification_engagements
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_analytics();

-- Function to get template performance
CREATE OR REPLACE FUNCTION get_template_performance(p_institution_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  template_id UUID,
  template_name VARCHAR,
  sent BIGINT,
  open_rate DECIMAL,
  click_rate DECIMAL,
  engagement_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    nt.id,
    nt.name,
    COALESCE(SUM(ca.sent), 0) as sent,
    CASE 
      WHEN COALESCE(SUM(ca.delivered), 0) > 0 
      THEN COALESCE(SUM(ca.opened), 0)::DECIMAL / COALESCE(SUM(ca.delivered), 1)
      ELSE 0 
    END as open_rate,
    CASE 
      WHEN COALESCE(SUM(ca.opened), 0) > 0 
      THEN COALESCE(SUM(ca.clicked), 0)::DECIMAL / COALESCE(SUM(ca.opened), 1)
      ELSE 0 
    END as click_rate,
    COALESCE(AVG(ca.engagement_score), 0) as engagement_score
  FROM notification_templates nt
  LEFT JOIN notification_campaigns nc ON nt.id = nc.template_id
  LEFT JOIN campaign_analytics ca ON nc.id = ca.campaign_id
  WHERE nt.institution_id = p_institution_id
    AND (nc.created_at IS NULL OR nc.created_at >= NOW() - INTERVAL '1 day' * p_days)
  GROUP BY nt.id, nt.name
  ORDER BY engagement_score DESC;
END;
$$ LANGUAGE plpgsql;