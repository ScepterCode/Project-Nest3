-- Database Query Optimization and Index Analysis
-- This file contains optimized indexes and query improvements for performance

-- ============================================================================
-- PERFORMANCE INDEXES FOR CORE TABLES
-- Note: For production, use create-indexes-concurrent.sql for CONCURRENT index creation
-- ============================================================================

-- Users table optimizations
CREATE INDEX IF NOT EXISTS idx_users_email_institution 
ON users(email, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_role_institution 
ON users(role, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_created_at_desc 
ON users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed 
ON users(onboarding_completed);

-- Departments table optimizations
CREATE INDEX IF NOT EXISTS idx_departments_institution_status 
ON departments(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_departments_admin_id 
ON departments(admin_id) WHERE admin_id IS NOT NULL;

-- Classes table optimizations
CREATE INDEX IF NOT EXISTS idx_classes_institution_status 
ON classes(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_classes_code_unique_active 
ON classes(code) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_classes_teacher_date 
ON classes(teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_classes_department_status 
ON classes(department_id, status) WHERE department_id IS NOT NULL;

-- Class enrollments table optimizations
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_status 
ON class_enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_status 
ON class_enrollments(class_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_enrolled_at_desc 
ON class_enrollments(enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_role 
ON class_enrollments(role, status);

-- Onboarding sessions optimizations
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_completed 
ON onboarding_sessions(user_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_last_activity 
ON onboarding_sessions(last_activity DESC);

-- Onboarding events optimizations
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session_type 
ON onboarding_step_events(session_id, event_type);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_timestamp 
ON onboarding_step_events(timestamp DESC);

-- Onboarding analytics optimizations
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_date_role 
ON onboarding_analytics(date DESC, role);

CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_institution 
ON onboarding_analytics(institution_id, date DESC) WHERE institution_id IS NOT NULL;

-- Institutions table optimizations
CREATE INDEX IF NOT EXISTS idx_institutions_domain_status 
ON institutions(domain, status);

CREATE INDEX IF NOT EXISTS idx_institutions_type_status 
ON institutions(type, status);

CREATE INDEX IF NOT EXISTS idx_institutions_created_by 
ON institutions(created_by) WHERE created_by IS NOT NULL;

-- Performance monitoring tables (will be created by setup script)
-- These indexes will be created when the tables exist

-- System metrics optimizations (conditional creation)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_metrics') THEN
        CREATE INDEX IF NOT EXISTS idx_system_metrics_type_recorded 
        ON system_metrics(metric_type, recorded_at DESC);
        
        CREATE INDEX IF NOT EXISTS idx_system_metrics_institution_type 
        ON system_metrics(institution_id, metric_type, recorded_at DESC) 
        WHERE institution_id IS NOT NULL;
    END IF;
END $$;

-- User interactions optimizations (conditional creation)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_interactions') THEN
        CREATE INDEX IF NOT EXISTS idx_user_interactions_user_timestamp 
        ON user_interactions(user_id, timestamp DESC);
        
        CREATE INDEX IF NOT EXISTS idx_user_interactions_action_timestamp 
        ON user_interactions(action_type, timestamp DESC);
    END IF;
END $$;

-- ============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- User dashboard queries
CREATE INDEX IF NOT EXISTS idx_user_dashboard_data 
ON users(institution_id, role, created_at DESC);

-- Class management queries
CREATE INDEX IF NOT EXISTS idx_class_management 
ON classes(institution_id, department_id, status, created_at DESC);

-- Enrollment analytics
CREATE INDEX IF NOT EXISTS idx_enrollment_analytics 
ON class_enrollments(class_id, role, status, enrolled_at);

-- Onboarding completion analytics
CREATE INDEX IF NOT EXISTS idx_onboarding_completion 
ON users(institution_id, onboarding_completed, created_at DESC);

-- ============================================================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- ============================================================================

-- Users with completed onboarding
CREATE INDEX IF NOT EXISTS idx_completed_onboarding_users 
ON users(email, first_name, last_name) WHERE onboarding_completed = true;

-- Active institutions
CREATE INDEX IF NOT EXISTS idx_active_institutions 
ON institutions(name, domain) WHERE status = 'active';

-- Active departments
CREATE INDEX IF NOT EXISTS idx_active_departments 
ON departments(institution_id, name) WHERE status = 'active';

-- Active class enrollments
CREATE INDEX IF NOT EXISTS idx_active_enrollments 
ON class_enrollments(user_id, class_id) WHERE status = 'active';

-- ============================================================================
-- QUERY OPTIMIZATION FUNCTIONS
-- ============================================================================

-- Function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance(query_text TEXT)
RETURNS TABLE(
  query_plan TEXT,
  execution_time NUMERIC,
  rows_returned BIGINT,
  cost_estimate NUMERIC
) AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  plan_result TEXT;
BEGIN
  -- Get query plan
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' || query_text INTO plan_result;
  
  -- Extract execution time and other metrics from plan
  -- This is a simplified version - in practice, you'd parse the EXPLAIN output
  RETURN QUERY SELECT 
    plan_result,
    0::NUMERIC,
    0::BIGINT,
    0::NUMERIC;
END;
$$ LANGUAGE plpgsql;

-- Function to get table statistics
CREATE OR REPLACE FUNCTION get_table_statistics(table_name TEXT)
RETURNS TABLE(
  table_size TEXT,
  index_size TEXT,
  row_count BIGINT,
  last_vacuum TIMESTAMP,
  last_analyze TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pg_size_pretty(pg_total_relation_size(table_name::regclass)) as table_size,
    pg_size_pretty(pg_indexes_size(table_name::regclass)) as index_size,
    (SELECT reltuples::BIGINT FROM pg_class WHERE relname = table_name) as row_count,
    (SELECT last_vacuum FROM pg_stat_user_tables WHERE relname = table_name) as last_vacuum,
    (SELECT last_analyze FROM pg_stat_user_tables WHERE relname = table_name) as last_analyze;
END;
$$ LANGUAGE plpgsql;

-- Function to identify missing indexes
CREATE OR REPLACE FUNCTION suggest_missing_indexes()
RETURNS TABLE(
  table_name TEXT,
  column_names TEXT,
  query_count BIGINT,
  suggested_index TEXT
) AS $$
BEGIN
  -- This would analyze pg_stat_statements to suggest indexes
  -- Simplified version for demonstration
  RETURN QUERY
  SELECT 
    'users'::TEXT,
    'email, institution_id'::TEXT,
    100::BIGINT,
    'CREATE INDEX idx_users_email_institution ON users(email, institution_id);'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MAINTENANCE PROCEDURES
-- ============================================================================

-- Procedure to update table statistics
CREATE OR REPLACE PROCEDURE update_table_statistics()
LANGUAGE plpgsql AS $$
BEGIN
  -- Analyze all existing tables to update statistics
  ANALYZE users;
  ANALYZE institutions;
  ANALYZE departments;
  ANALYZE classes;
  ANALYZE class_enrollments;
  ANALYZE onboarding_sessions;
  ANALYZE onboarding_step_events;
  ANALYZE onboarding_analytics;
  
  -- Analyze performance monitoring tables if they exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_metrics') THEN
    ANALYZE system_metrics;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_interactions') THEN
    ANALYZE user_interactions;
  END IF;
  
  RAISE NOTICE 'Table statistics updated successfully';
END;
$$;

-- Procedure to reindex tables
CREATE OR REPLACE PROCEDURE reindex_tables()
LANGUAGE plpgsql AS $$
BEGIN
  -- Reindex all existing tables (use CONCURRENTLY outside of procedures for production)
  REINDEX TABLE users;
  REINDEX TABLE institutions;
  REINDEX TABLE departments;
  REINDEX TABLE classes;
  REINDEX TABLE class_enrollments;
  REINDEX TABLE onboarding_sessions;
  REINDEX TABLE onboarding_step_events;
  REINDEX TABLE onboarding_analytics;
  
  RAISE NOTICE 'Tables reindexed successfully';
END;
$$;

-- ============================================================================
-- QUERY OPTIMIZATION VIEWS
-- ============================================================================

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

-- View for table sizes and usage
CREATE OR REPLACE VIEW table_usage_stats AS
SELECT 
  s.schemaname,
  s.relname as tablename,
  pg_size_pretty(pg_total_relation_size(c.oid)) as size,
  s.seq_scan,
  s.seq_tup_read,
  s.idx_scan,
  s.idx_tup_fetch,
  s.n_tup_ins,
  s.n_tup_upd,
  s.n_tup_del
FROM pg_stat_user_tables s
JOIN pg_class c ON s.relname = c.relname
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = s.schemaname
ORDER BY pg_total_relation_size(c.oid) DESC;

-- View for index usage
CREATE OR REPLACE VIEW index_usage_stats AS
SELECT 
  s.schemaname,
  s.relname as tablename,
  s.indexrelname as indexname,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size
FROM pg_stat_user_indexes s
ORDER BY s.idx_scan DESC;

-- ============================================================================
-- PERFORMANCE MONITORING
-- ============================================================================

-- Function to get current database performance metrics
CREATE OR REPLACE FUNCTION get_performance_metrics()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'database_size', pg_size_pretty(pg_database_size(current_database())),
    'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
    'cache_hit_ratio', (
      SELECT round(
        100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2
      )
      FROM pg_stat_database
      WHERE datname = current_database()
    ),
    'transactions_per_second', (
      SELECT round(
        (xact_commit + xact_rollback) / 
        EXTRACT(EPOCH FROM (now() - stats_reset)), 2
      )
      FROM pg_stat_database
      WHERE datname = current_database()
    ),
    'slow_queries_count', (
      SELECT count(*)
      FROM pg_stat_statements
      WHERE mean_time > 100
    ),
    'timestamp', now()
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTOMATED MAINTENANCE SCHEDULE
-- ============================================================================

-- Note: These would typically be scheduled using pg_cron or external cron jobs

-- Daily maintenance tasks
-- CALL update_table_statistics();

-- Weekly maintenance tasks  
-- CALL reindex_tables();

-- Monthly cleanup tasks
-- DELETE FROM pg_stat_statements WHERE calls < 10 AND mean_time < 10;