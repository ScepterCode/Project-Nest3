-- Institution health metrics table
CREATE TABLE institution_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  metric_name VARCHAR NOT NULL,
  metric_value NUMERIC NOT NULL,
  threshold_value NUMERIC,
  status VARCHAR CHECK (status IN ('healthy', 'warning', 'critical')),
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW(),
  date_bucket DATE DEFAULT CURRENT_DATE,
  INDEX idx_health_metrics_institution_date (institution_id, date_bucket),
  INDEX idx_health_metrics_status (status),
  INDEX idx_health_metrics_recorded (recorded_at)
);

-- Institution health alerts table
CREATE TABLE institution_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  alert_type VARCHAR NOT NULL CHECK (alert_type IN ('low_activity', 'high_error_rate', 'login_issues', 'performance_degradation')),
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  triggered BOOLEAN DEFAULT TRUE,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_health_alerts_institution (institution_id),
  INDEX idx_health_alerts_triggered (triggered),
  INDEX idx_health_alerts_severity (severity)
);

-- Integration failures table
CREATE TABLE integration_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  integration_id UUID REFERENCES institution_integrations(id) NOT NULL,
  integration_type VARCHAR NOT NULL,
  failure_type VARCHAR NOT NULL CHECK (failure_type IN ('connection_timeout', 'authentication_failed', 'sync_error', 'rate_limit', 'server_error')),
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  error_details TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  retry_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_integration_failures_institution (institution_id),
  INDEX idx_integration_failures_integration (integration_id),
  INDEX idx_integration_failures_resolved (resolved),
  INDEX idx_integration_failures_severity (severity)
);

-- Integration sync logs table
CREATE TABLE integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES institution_integrations(id) NOT NULL,
  status VARCHAR NOT NULL CHECK (status IN ('in_progress', 'success', 'failed')),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  response_time INTEGER, -- in milliseconds
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  INDEX idx_sync_logs_integration (integration_id),
  INDEX idx_sync_logs_status (status),
  INDEX idx_sync_logs_started (started_at)
);

-- Usage quota logs table
CREATE TABLE usage_quota_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  quota_type VARCHAR NOT NULL CHECK (quota_type IN ('users', 'storage', 'api_calls', 'integrations', 'classes')),
  current_usage NUMERIC NOT NULL,
  quota_limit NUMERIC NOT NULL,
  unit VARCHAR NOT NULL,
  utilization_percentage NUMERIC NOT NULL,
  status VARCHAR NOT NULL CHECK (status IN ('normal', 'warning', 'critical', 'exceeded')),
  recorded_at TIMESTAMP DEFAULT NOW(),
  date_bucket DATE DEFAULT CURRENT_DATE,
  INDEX idx_quota_logs_institution_date (institution_id, date_bucket),
  INDEX idx_quota_logs_quota_type (quota_type),
  INDEX idx_quota_logs_status (status)
);

-- Usage quota alerts table
CREATE TABLE usage_quota_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  quota_type VARCHAR NOT NULL,
  alert_type VARCHAR NOT NULL CHECK (alert_type IN ('approaching_limit', 'limit_exceeded', 'usage_spike')),
  threshold NUMERIC NOT NULL,
  current_usage NUMERIC NOT NULL,
  quota_limit NUMERIC NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_quota_alerts_institution (institution_id),
  INDEX idx_quota_alerts_quota_type (quota_type),
  INDEX idx_quota_alerts_acknowledged (acknowledged)
);

-- Performance metrics table
CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  metric_type VARCHAR NOT NULL CHECK (metric_type IN ('response_time', 'throughput', 'error_rate', 'cpu_usage', 'memory_usage', 'database_performance')),
  value NUMERIC NOT NULL,
  unit VARCHAR NOT NULL,
  endpoint VARCHAR,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP DEFAULT NOW(),
  date_bucket DATE DEFAULT CURRENT_DATE,
  INDEX idx_performance_metrics_institution_date (institution_id, date_bucket),
  INDEX idx_performance_metrics_type (metric_type),
  INDEX idx_performance_metrics_endpoint (endpoint),
  INDEX idx_performance_metrics_recorded (recorded_at)
);

-- Performance anomalies table
CREATE TABLE performance_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  metric_type VARCHAR NOT NULL,
  anomaly_type VARCHAR NOT NULL CHECK (anomaly_type IN ('spike', 'drop', 'trend_change', 'threshold_breach')),
  severity VARCHAR NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  current_value NUMERIC NOT NULL,
  expected_value NUMERIC NOT NULL,
  deviation NUMERIC NOT NULL,
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_performance_anomalies_institution (institution_id),
  INDEX idx_performance_anomalies_type (metric_type),
  INDEX idx_performance_anomalies_resolved (resolved),
  INDEX idx_performance_anomalies_severity (severity)
);

-- API usage logs table (if not exists)
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  user_id UUID REFERENCES users(id),
  endpoint VARCHAR NOT NULL,
  method VARCHAR NOT NULL,
  status_code INTEGER NOT NULL,
  response_time INTEGER, -- in milliseconds
  request_size INTEGER, -- in bytes
  response_size INTEGER, -- in bytes
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_api_logs_institution (institution_id),
  INDEX idx_api_logs_endpoint (endpoint),
  INDEX idx_api_logs_status (status_code),
  INDEX idx_api_logs_created (created_at)
);

-- Error logs table (if not exists)
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  user_id UUID REFERENCES users(id),
  error_type VARCHAR NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  endpoint VARCHAR,
  request_data JSONB,
  severity VARCHAR CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_error_logs_institution (institution_id),
  INDEX idx_error_logs_type (error_type),
  INDEX idx_error_logs_severity (severity),
  INDEX idx_error_logs_created (created_at)
);

-- Auth logs table (if not exists)
CREATE TABLE IF NOT EXISTS auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR NOT NULL CHECK (event_type IN ('login', 'logout', 'failed_login', 'password_reset', 'account_locked')),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_auth_logs_institution (institution_id),
  INDEX idx_auth_logs_user (user_id),
  INDEX idx_auth_logs_event (event_type),
  INDEX idx_auth_logs_created (created_at)
);

-- File storage usage table (if not exists)
CREATE TABLE IF NOT EXISTS file_storage_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  total_bytes BIGINT DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  UNIQUE(institution_id),
  INDEX idx_storage_usage_institution (institution_id)
);

-- Create functions for automatic metric aggregation
CREATE OR REPLACE FUNCTION aggregate_daily_metrics()
RETURNS void AS $$
BEGIN
  -- Aggregate health metrics by day
  INSERT INTO institution_health_metrics (institution_id, metric_name, metric_value, status, recorded_at, date_bucket)
  SELECT 
    institution_id,
    metric_name || '_daily_avg' as metric_name,
    AVG(metric_value) as metric_value,
    CASE 
      WHEN AVG(metric_value) >= AVG(threshold_value) THEN 'healthy'
      WHEN AVG(metric_value) >= AVG(threshold_value) * 0.7 THEN 'warning'
      ELSE 'critical'
    END as status,
    NOW() as recorded_at,
    CURRENT_DATE as date_bucket
  FROM institution_health_metrics
  WHERE date_bucket = CURRENT_DATE - INTERVAL '1 day'
    AND metric_name NOT LIKE '%_daily_avg'
  GROUP BY institution_id, metric_name
  ON CONFLICT DO NOTHING;

  -- Aggregate performance metrics by day
  INSERT INTO performance_metrics (institution_id, metric_type, value, unit, recorded_at, date_bucket)
  SELECT 
    institution_id,
    metric_type,
    AVG(value) as value,
    unit,
    NOW() as recorded_at,
    CURRENT_DATE as date_bucket
  FROM performance_metrics
  WHERE date_bucket = CURRENT_DATE - INTERVAL '1 day'
    AND endpoint IS NULL -- Only aggregate non-endpoint specific metrics
  GROUP BY institution_id, metric_type, unit
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create function to clean old monitoring data
CREATE OR REPLACE FUNCTION cleanup_old_monitoring_data()
RETURNS void AS $$
BEGIN
  -- Keep detailed metrics for 30 days
  DELETE FROM institution_health_metrics 
  WHERE recorded_at < NOW() - INTERVAL '30 days' 
    AND metric_name NOT LIKE '%_daily_avg';
    
  DELETE FROM performance_metrics 
  WHERE recorded_at < NOW() - INTERVAL '30 days'
    AND endpoint IS NOT NULL; -- Keep endpoint-specific data for shorter time
    
  -- Keep daily aggregates for 1 year
  DELETE FROM institution_health_metrics 
  WHERE recorded_at < NOW() - INTERVAL '1 year' 
    AND metric_name LIKE '%_daily_avg';
    
  DELETE FROM performance_metrics 
  WHERE recorded_at < NOW() - INTERVAL '1 year'
    AND endpoint IS NULL;
    
  -- Keep logs for 90 days
  DELETE FROM api_usage_logs WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM auth_logs WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM integration_sync_logs WHERE started_at < NOW() - INTERVAL '90 days';
  
  -- Keep resolved alerts/failures for 30 days
  DELETE FROM institution_health_alerts 
  WHERE resolved_at IS NOT NULL 
    AND resolved_at < NOW() - INTERVAL '30 days';
    
  DELETE FROM integration_failures 
  WHERE resolved = TRUE 
    AND resolved_at < NOW() - INTERVAL '30 days';
    
  DELETE FROM performance_anomalies 
  WHERE resolved = TRUE 
    AND resolved_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_health_metrics_composite 
ON institution_health_metrics (institution_id, metric_name, recorded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_performance_metrics_composite 
ON performance_metrics (institution_id, metric_type, recorded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quota_logs_composite 
ON usage_quota_logs (institution_id, quota_type, recorded_at DESC);

-- Add row level security policies
ALTER TABLE institution_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_health_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quota_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quota_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_anomalies ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for institution isolation
CREATE POLICY "Users can only access their institution's health metrics" ON institution_health_metrics
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's health alerts" ON institution_health_alerts
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's integration failures" ON integration_failures
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's quota logs" ON usage_quota_logs
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's quota alerts" ON usage_quota_alerts
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's performance metrics" ON performance_metrics
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can only access their institution's performance anomalies" ON performance_anomalies
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM users WHERE id = auth.uid()
    )
  );

-- System admins can access all monitoring data
CREATE POLICY "System admins can access all monitoring data" ON institution_health_metrics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND role = 'system_admin'
    )
  );

CREATE POLICY "System admins can access all health alerts" ON institution_health_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
        AND role = 'system_admin'
    )
  );

-- Add similar policies for other monitoring tables...