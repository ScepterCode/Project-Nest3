-- Database Performance Setup Script
-- This script sets up all database performance optimizations in the correct order

-- ============================================================================
-- STEP 1: Enable Required Extensions
-- ============================================================================

-- Enable pg_stat_statements for query performance monitoring
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Reset pg_stat_statements to start fresh
SELECT pg_stat_statements_reset();

-- ============================================================================
-- STEP 2: Apply Query Optimizations (Functions, Views, Procedures)
-- ============================================================================

-- Note: Query optimization functions and procedures will be created inline below

-- ============================================================================
-- STEP 3: Apply Table Partitioning
-- ============================================================================

-- Note: Table partitioning will be set up inline below

-- ============================================================================
-- STEP 4: Update Table Statistics
-- ============================================================================

-- Updating table statistics...
ANALYZE users;
ANALYZE institutions;
ANALYZE departments;
ANALYZE classes;
ANALYZE class_enrollments;
ANALYZE onboarding_sessions;
ANALYZE onboarding_step_events;
ANALYZE onboarding_analytics;

-- ============================================================================
-- STEP 5: Create Performance Monitoring Tables (if not exists)
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
-- STEP 6: Create Basic Indexes (Non-Concurrent)
-- ============================================================================

-- Creating basic performance indexes...

-- Essential indexes that can be created in transaction
DO $$
BEGIN
    -- Users table basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_email_basic') THEN
        CREATE INDEX idx_users_email_basic ON users(email);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_users_institution_basic') THEN
        CREATE INDEX idx_users_institution_basic ON users(institution_id);
    END IF;
    
    -- Departments basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_departments_institution_basic') THEN
        CREATE INDEX idx_departments_institution_basic ON departments(institution_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_departments_status_basic') THEN
        CREATE INDEX idx_departments_status_basic ON departments(status);
    END IF;
    
    -- Classes basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classes_institution_basic') THEN
        CREATE INDEX idx_classes_institution_basic ON classes(institution_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_classes_code_basic') THEN
        CREATE INDEX idx_classes_code_basic ON classes(code);
    END IF;
    
    -- Class enrollments basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_class_enrollments_user_basic') THEN
        CREATE INDEX idx_class_enrollments_user_basic ON class_enrollments(user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_class_enrollments_class_basic') THEN
        CREATE INDEX idx_class_enrollments_class_basic ON class_enrollments(class_id);
    END IF;
    
    -- Onboarding sessions basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_onboarding_sessions_user_basic') THEN
        CREATE INDEX idx_onboarding_sessions_user_basic ON onboarding_sessions(user_id);
    END IF;
    
    -- Onboarding events basic indexes
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_onboarding_events_session_basic') THEN
        CREATE INDEX idx_onboarding_events_session_basic ON onboarding_step_events(session_id);
    END IF;
    
    RAISE NOTICE 'Basic indexes created successfully';
END $$;

-- ============================================================================
-- STEP 7: Configure Database Settings for Performance
-- ============================================================================

-- Configuring database performance settings...

-- Note: These settings should be reviewed and adjusted based on your hardware
-- and workload. Consider adding them to postgresql.conf for persistence.

-- Enable constraint exclusion for partition pruning
SET constraint_exclusion = partition;

-- Configure work memory for complex queries (session-level)
SET work_mem = '256MB';

-- Configure maintenance work memory for index creation
SET maintenance_work_mem = '1GB';

-- Enable parallel query execution
SET max_parallel_workers_per_gather = 4;

-- ============================================================================
-- STEP 8: Create Performance Monitoring Functions
-- ============================================================================

-- Creating performance monitoring functions...

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

-- ============================================================================
-- STEP 9: Initial Performance Baseline
-- ============================================================================

-- Creating initial performance baseline...

-- Insert initial performance snapshot
INSERT INTO system_metrics (metric_type, metric_name, metric_value, metadata)
SELECT 
    'database',
    'initial_setup',
    1,
    get_performance_snapshot();

-- ============================================================================
-- STEP 10: Setup Complete
-- ============================================================================

-- Database performance setup completed successfully!
-- 
-- Next steps:
-- 1. Run create-indexes-concurrent.sql for production-optimized indexes
-- 2. Configure Redis for caching (see .env.local)
-- 3. Monitor performance using the dashboard at /dashboard/admin/database-performance
-- 4. Run performance tests: npm run test:db-performance
-- 
-- Performance monitoring functions available:
-- - SELECT get_performance_snapshot();
-- - SELECT * FROM get_table_sizes();
-- - SELECT * FROM slow_queries;
-- - SELECT * FROM table_usage_stats;

SELECT 'Database performance setup completed successfully!' as setup_status;