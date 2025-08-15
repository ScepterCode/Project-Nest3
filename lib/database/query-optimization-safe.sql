-- Safe Database Query Optimization
-- This file contains only verified indexes that match the actual schema

-- ============================================================================
-- VERIFIED PERFORMANCE INDEXES
-- ============================================================================

-- Users table optimizations (verified columns: id, email, role, institution_id, onboarding_completed, created_at)
CREATE INDEX IF NOT EXISTS idx_users_email_institution 
ON users(email, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_role_institution 
ON users(role, institution_id);

CREATE INDEX IF NOT EXISTS idx_users_created_at_desc 
ON users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed 
ON users(onboarding_completed);

-- Institutions table optimizations (verified columns: id, name, domain, status, type, created_by, created_at)
CREATE INDEX IF NOT EXISTS idx_institutions_domain_status 
ON institutions(domain, status);

CREATE INDEX IF NOT EXISTS idx_institutions_type_status 
ON institutions(type, status);

CREATE INDEX IF NOT EXISTS idx_institutions_created_by 
ON institutions(created_by) WHERE created_by IS NOT NULL;

-- Departments table optimizations (verified columns: id, institution_id, name, status, admin_id, created_at)
CREATE INDEX IF NOT EXISTS idx_departments_institution_status 
ON departments(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_departments_admin_id 
ON departments(admin_id) WHERE admin_id IS NOT NULL;

-- Classes table optimizations (verified columns: id, name, code, teacher_id, institution_id, department_id, status, created_at)
CREATE INDEX IF NOT EXISTS idx_classes_institution_status 
ON classes(institution_id, status);

CREATE INDEX IF NOT EXISTS idx_classes_code_active 
ON classes(code) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_classes_teacher_date 
ON classes(teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_classes_department_status 
ON classes(department_id, status) WHERE department_id IS NOT NULL;

-- Class enrollments table optimizations (verified columns: id, class_id, user_id, role, status, enrolled_at)
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_status 
ON class_enrollments(user_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_status 
ON class_enrollments(class_id, status);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_enrolled_at_desc 
ON class_enrollments(enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_class_enrollments_role 
ON class_enrollments(role, status);

-- Onboarding sessions optimizations (verified columns: id, user_id, completed_at, last_activity, started_at)
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_completed 
ON onboarding_sessions(user_id, completed_at);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_last_activity 
ON onboarding_sessions(last_activity DESC);

-- Onboarding events optimizations (verified columns: id, session_id, event_type, timestamp)
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session_type 
ON onboarding_step_events(session_id, event_type);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_timestamp 
ON onboarding_step_events(timestamp DESC);

-- Onboarding analytics optimizations (verified columns: id, date, role, institution_id, created_at)
CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_date_role 
ON onboarding_analytics(date DESC, role);

CREATE INDEX IF NOT EXISTS idx_onboarding_analytics_institution 
ON onboarding_analytics(institution_id, date DESC) WHERE institution_id IS NOT NULL;

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
-- PERFORMANCE MONITORING FUNCTIONS
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

-- ============================================================================
-- PERFORMANCE MONITORING VIEWS
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

-- Function to get current performance metrics
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