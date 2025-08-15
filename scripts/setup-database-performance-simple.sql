-- Simple Database Performance Setup Script
-- This script sets up essential database performance optimizations without errors

-- ============================================================================
-- STEP 1: Enable Required Extensions
-- ============================================================================

-- Enable pg_stat_statements for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Reset pg_stat_statements to start fresh
SELECT pg_stat_statements_reset();

-- ============================================================================
-- STEP 2: Create Performance Monitoring Tables
-- ============================================================================

-- System metrics table for performance monitoring
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_type VARCHAR NOT NULL,
    metric_name VARCHAR NOT NULL,
    metric_value DECIMAL NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    recorded_at TIMESTAMP DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- User interactions table for analytics
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR NOT NULL,
    resource_type VARCHAR,
    resource_id UUID,
    session_id VARCHAR,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}'
);

-- ============================================================================
-- STEP 3: Create Essential Performance Indexes
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email_institution 
ON users(email, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_role_institution 
ON users(role, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed 
ON users(onboarding_completed);

-- Institutions table indexes
CREATE INDEX IF NOT EXISTS idx_institutions_domain_status 
ON institutions(domain, status);

CREATE INDEX IF NOT EXISTS idx_institutions_type_status 
ON institutions(type, status);

-- Departments table indexes
CREATE INDEX IF NOT EXISTS idx_departments_institution_status 
ON departments(institution_id, status);

-- Classes table indexes
CREATE INDEX IF NOT EXISTS idx_classes_institution_status 
ON classes(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_date 
ON classes(teacher_id, created_at DESC);

-- Class enrollments table indexes
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_status 
ON class_enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_status 
ON class_enrollments(class_id, status);

-- Onboarding sessions indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_completed 
ON onboarding_sessions(user_id, completed_at);

-- Onboarding events indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session_type 
ON onboarding_step_events(session_id, event_type);

-- Performance monitoring table indexes (conditional)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_metrics') THEN
        CREATE INDEX IF NOT EXISTS idx_system_metrics_type_recorded 
        ON system_metrics(metric_type, recorded_at DESC);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_interactions') THEN
        CREATE INDEX IF NOT EXISTS idx_user_interactions_user_timestamp 
        ON user_interactions(user_id, timestamp DESC);
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create Performance Monitoring Functions
-- ============================================================================

-- Function to get current performance snapshot
CREATE OR REPLACE FUNCTION get_performance_snapshot()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'timestamp', NOW(),
        'database_size', pg_size_pretty(pg_database_size(current_database())),
        'active_connections', (
            SELECT count(*) 
            FROM pg_stat_activity 
            WHERE state = 'active'
        ),
        'cache_hit_ratio', (
            SELECT round(
                100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2
            )
            FROM pg_stat_database
            WHERE datname = current_database()
        ),
        'slow_queries', (
            SELECT count(*)
            FROM pg_stat_statements
            WHERE mean_time > 1000
        ),
        'total_queries', (
            SELECT sum(calls)
            FROM pg_stat_statements
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get table sizes
CREATE OR REPLACE FUNCTION get_table_sizes()
RETURNS TABLE(
    table_name TEXT,
    size_pretty TEXT,
    size_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT,
        pg_size_pretty(pg_total_relation_size(c.oid)),
        pg_total_relation_size(c.oid)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
    AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC;
END;
$$ LANGUAGE plpgsql;

-- View for slow queries
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_time > 100  -- Queries taking more than 100ms on average
ORDER BY mean_time DESC;

-- ============================================================================
-- STEP 5: Update Table Statistics
-- ============================================================================

-- Analyze all existing tables to update statistics
ANALYZE users;
ANALYZE institutions;
ANALYZE departments;
ANALYZE classes;
ANALYZE class_enrollments;
ANALYZE onboarding_sessions;
ANALYZE onboarding_step_events;
ANALYZE onboarding_analytics;

-- ============================================================================
-- STEP 6: Create Initial Performance Baseline
-- ============================================================================

-- Insert initial performance snapshot
INSERT INTO system_metrics (metric_type, metric_name, metric_value, metadata)
SELECT 
    'database',
    'initial_setup',
    1,
    get_performance_snapshot();

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

SELECT 'Database performance setup completed successfully!' as setup_status,
       'Run lib/database/create-indexes-concurrent.sql for production indexes' as next_step;