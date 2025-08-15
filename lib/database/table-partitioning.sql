-- Database Table Partitioning for Large Tables
-- This file implements partitioning strategies for tables that will grow large over time

-- ============================================================================
-- PARTITIONING STRATEGY FOR SYSTEM_METRICS TABLE
-- ============================================================================

-- Drop existing table if it exists (for migration)
-- DROP TABLE IF EXISTS system_metrics CASCADE;

-- Create partitioned system_metrics table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID DEFAULT gen_random_uuid(),
    metric_type VARCHAR NOT NULL,
    metric_name VARCHAR NOT NULL,
    metric_value DECIMAL NOT NULL,
    institution_id UUID,
    recorded_at TIMESTAMP DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT fk_system_metrics_institution 
        FOREIGN KEY (institution_id) REFERENCES institutions(id),
    
    PRIMARY KEY (id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions for system_metrics (last 12 months + next 6 months)
CREATE TABLE IF NOT EXISTS system_metrics_2024_01 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_02 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_03 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_04 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_05 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_06 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_07 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_08 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_09 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_10 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_11 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE IF NOT EXISTS system_metrics_2024_12 PARTITION OF system_metrics
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_01 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_02 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_03 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_04 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_05 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_06 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- ============================================================================
-- PARTITIONING STRATEGY FOR USER_INTERACTIONS TABLE
-- ============================================================================

-- Create partitioned user_interactions table
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action_type VARCHAR NOT NULL,
    resource_type VARCHAR,
    resource_id UUID,
    session_id VARCHAR,
    timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT fk_user_interactions_user 
        FOREIGN KEY (user_id) REFERENCES users(id),
    
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions for user_interactions
CREATE TABLE IF NOT EXISTS user_interactions_2024_01 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_02 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_03 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_04 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_05 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_06 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_07 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_08 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_09 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_10 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_11 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE IF NOT EXISTS user_interactions_2024_12 PARTITION OF user_interactions
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_01 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_02 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_03 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_04 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_05 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE IF NOT EXISTS user_interactions_2025_06 PARTITION OF user_interactions
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- ============================================================================
-- PARTITIONING STRATEGY FOR NOTIFICATIONS TABLE
-- ============================================================================

-- Create partitioned notifications table
CREATE TABLE IF NOT EXISTS notifications_partitioned (
    id UUID DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR NOT NULL,
    message TEXT NOT NULL,
    notification_type VARCHAR NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    read_at TIMESTAMP,
    scheduled_for TIMESTAMP,
    status VARCHAR DEFAULT 'sent',
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT fk_notifications_user 
        FOREIGN KEY (user_id) REFERENCES users(id),
    
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for notifications
CREATE TABLE IF NOT EXISTS notifications_2024_01 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE IF NOT EXISTS notifications_2024_02 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE IF NOT EXISTS notifications_2024_03 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE IF NOT EXISTS notifications_2024_04 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE IF NOT EXISTS notifications_2024_05 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE IF NOT EXISTS notifications_2024_06 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE IF NOT EXISTS notifications_2024_07 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE IF NOT EXISTS notifications_2024_08 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE IF NOT EXISTS notifications_2024_09 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE IF NOT EXISTS notifications_2024_10 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE IF NOT EXISTS notifications_2024_11 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE IF NOT EXISTS notifications_2024_12 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE IF NOT EXISTS notifications_2025_01 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE IF NOT EXISTS notifications_2025_02 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE IF NOT EXISTS notifications_2025_03 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE IF NOT EXISTS notifications_2025_04 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE IF NOT EXISTS notifications_2025_05 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE IF NOT EXISTS notifications_2025_06 PARTITION OF notifications_partitioned
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

-- ============================================================================
-- AUTOMATED PARTITION MANAGEMENT
-- ============================================================================

-- Function to create new monthly partition
CREATE OR REPLACE FUNCTION create_monthly_partition(
    table_name TEXT,
    partition_date DATE
) RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
    create_sql TEXT;
BEGIN
    -- Calculate partition boundaries
    start_date := date_trunc('month', partition_date);
    end_date := start_date + INTERVAL '1 month';
    
    -- Generate partition name
    partition_name := table_name || '_' || to_char(start_date, 'YYYY_MM');
    
    -- Create partition SQL
    create_sql := format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        table_name,
        start_date,
        end_date
    );
    
    -- Execute the SQL
    EXECUTE create_sql;
    
    RAISE NOTICE 'Created partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to drop old partitions
CREATE OR REPLACE FUNCTION drop_old_partitions(
    table_name TEXT,
    retention_months INTEGER DEFAULT 12
) RETURNS VOID AS $$
DECLARE
    partition_record RECORD;
    cutoff_date DATE;
BEGIN
    -- Calculate cutoff date
    cutoff_date := date_trunc('month', CURRENT_DATE - (retention_months || ' months')::INTERVAL);
    
    -- Find and drop old partitions
    FOR partition_record IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE tablename LIKE table_name || '_%'
        AND tablename ~ '\d{4}_\d{2}$'
        AND to_date(
            substring(tablename from '(\d{4}_\d{2})$'),
            'YYYY_MM'
        ) < cutoff_date
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I.%I', partition_record.schemaname, partition_record.tablename);
        RAISE NOTICE 'Dropped old partition: %', partition_record.tablename;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to create future partitions
CREATE OR REPLACE FUNCTION create_future_partitions(
    table_name TEXT,
    months_ahead INTEGER DEFAULT 6
) RETURNS VOID AS $$
DECLARE
    i INTEGER;
    partition_date DATE;
BEGIN
    FOR i IN 1..months_ahead LOOP
        partition_date := date_trunc('month', CURRENT_DATE + (i || ' months')::INTERVAL);
        PERFORM create_monthly_partition(table_name, partition_date);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Procedure for automated partition maintenance
CREATE OR REPLACE PROCEDURE maintain_partitions()
LANGUAGE plpgsql AS $$
BEGIN
    -- Create future partitions for all partitioned tables
    PERFORM create_future_partitions('system_metrics', 6);
    PERFORM create_future_partitions('user_interactions', 6);
    PERFORM create_future_partitions('notifications_partitioned', 6);
    
    -- Drop old partitions (keep 12 months)
    PERFORM drop_old_partitions('system_metrics', 12);
    PERFORM drop_old_partitions('user_interactions', 12);
    PERFORM drop_old_partitions('notifications_partitioned', 12);
    
    RAISE NOTICE 'Partition maintenance completed successfully';
END;
$$;

-- ============================================================================
-- PARTITION-AWARE INDEXES
-- ============================================================================

-- Indexes for system_metrics partitions
CREATE INDEX IF NOT EXISTS idx_system_metrics_type_recorded 
ON system_metrics(metric_type, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_metrics_institution_type 
ON system_metrics(institution_id, metric_type, recorded_at DESC) 
WHERE institution_id IS NOT NULL;

-- Indexes for user_interactions partitions
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_timestamp 
ON user_interactions(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_action_timestamp 
ON user_interactions(action_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_user_interactions_session 
ON user_interactions(session_id, timestamp DESC) 
WHERE session_id IS NOT NULL;

-- Indexes for notifications partitions
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
ON notifications_partitioned(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_created 
ON notifications_partitioned(notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled 
ON notifications_partitioned(scheduled_for) 
WHERE scheduled_for IS NOT NULL AND status = 'scheduled';

-- ============================================================================
-- PARTITION MONITORING VIEWS
-- ============================================================================

-- View to monitor partition sizes
CREATE OR REPLACE VIEW partition_sizes AS
SELECT 
    schemaname,
    relname as tablename,
    pg_size_pretty(pg_total_relation_size(c.oid)) as size,
    pg_total_relation_size(c.oid) as size_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
AND c.relname ~ '_(20\d{2}_\d{2})$'
ORDER BY pg_total_relation_size(c.oid) DESC;

-- View to monitor partition row counts
CREATE OR REPLACE VIEW partition_row_counts AS
SELECT 
    schemaname,
    relname as tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows
FROM pg_stat_user_tables
WHERE relname ~ '_(20\d{2}_\d{2})$'
ORDER BY n_live_tup DESC;

-- Function to get partition information
CREATE OR REPLACE FUNCTION get_partition_info(parent_table TEXT)
RETURNS TABLE(
    partition_name TEXT,
    partition_size TEXT,
    row_count BIGINT,
    start_value TEXT,
    end_value TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT as partition_name,
        pg_size_pretty(pg_total_relation_size(c.oid)) as partition_size,
        c.reltuples::BIGINT as row_count,
        pg_get_expr(c.relpartbound, c.oid) as start_value,
        ''::TEXT as end_value
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p ON i.inhparent = p.oid
    WHERE p.relname = parent_table
    ORDER BY c.relname;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PARTITION PRUNING OPTIMIZATION
-- ============================================================================

-- Enable constraint exclusion for better partition pruning
-- This should be set in postgresql.conf, but can be set per session
-- SET constraint_exclusion = partition;

-- Function to analyze partition pruning effectiveness
CREATE OR REPLACE FUNCTION analyze_partition_pruning(query_text TEXT)
RETURNS TABLE(
    partitions_scanned INTEGER,
    partitions_pruned INTEGER,
    pruning_effectiveness NUMERIC
) AS $$
DECLARE
    plan_text TEXT;
    scanned_count INTEGER := 0;
    total_partitions INTEGER;
BEGIN
    -- Get query plan
    EXECUTE 'EXPLAIN (FORMAT TEXT) ' || query_text INTO plan_text;
    
    -- Count partition scans in the plan (simplified)
    -- In practice, you'd parse the EXPLAIN output more thoroughly
    scanned_count := (length(plan_text) - length(replace(plan_text, 'Seq Scan on', ''))) / length('Seq Scan on');
    
    -- Get total partition count (example for system_metrics)
    SELECT count(*) INTO total_partitions
    FROM pg_tables
    WHERE tablename LIKE 'system_metrics_%';
    
    RETURN QUERY SELECT 
        scanned_count,
        total_partitions - scanned_count,
        CASE 
            WHEN total_partitions > 0 THEN 
                round(100.0 * (total_partitions - scanned_count) / total_partitions, 2)
            ELSE 0
        END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MAINTENANCE SCHEDULING
-- ============================================================================

-- Note: These procedures should be scheduled using pg_cron or external schedulers

-- Monthly partition maintenance (run on 1st of each month)
-- SELECT cron.schedule('partition-maintenance', '0 2 1 * *', 'CALL maintain_partitions();');

-- Weekly partition statistics update (run every Sunday)
-- SELECT cron.schedule('partition-stats', '0 3 * * 0', 'CALL update_table_statistics();');