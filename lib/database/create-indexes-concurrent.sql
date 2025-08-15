-- Concurrent Index Creation Script
-- This file contains CREATE INDEX CONCURRENTLY statements that must be run outside of transactions
-- Run this file separately after applying the main query-optimization.sql

-- ============================================================================
-- CONCURRENT INDEXES FOR CORE TABLES
-- ============================================================================

-- Users table optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_institution_conc 
ON users(email, institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role_institution_conc 
ON users(role, institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_created_at_desc_conc 
ON users(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_onboarding_completed_conc 
ON users(onboarding_completed);

-- Departments table optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_institution_status_conc 
ON departments(institution_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_admin_id_conc 
ON departments(admin_id) WHERE admin_id IS NOT NULL;

-- Classes table optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_institution_status 
ON classes(institution_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_code_unique_active 
ON classes(code) WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_teacher_date_conc 
ON classes(teacher_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_classes_department_status 
ON classes(department_id, status) WHERE department_id IS NOT NULL;

-- Class enrollments table optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_enrollments_user_status_conc 
ON class_enrollments(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_enrollments_class_status_conc 
ON class_enrollments(class_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_enrollments_enrolled_at_desc_conc 
ON class_enrollments(enrolled_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_enrollments_role_conc 
ON class_enrollments(role, status);

-- Onboarding sessions optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_sessions_user_completed_conc 
ON onboarding_sessions(user_id, completed_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_sessions_last_activity_conc 
ON onboarding_sessions(last_activity DESC);

-- Onboarding events optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_events_session_type_conc 
ON onboarding_step_events(session_id, event_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_events_timestamp_conc 
ON onboarding_step_events(timestamp DESC);

-- Onboarding analytics optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_analytics_date_role_conc 
ON onboarding_analytics(date DESC, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_analytics_institution_conc 
ON onboarding_analytics(institution_id, date DESC) WHERE institution_id IS NOT NULL;

-- Institutions table optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institutions_domain_status_conc 
ON institutions(domain, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institutions_type_status_conc 
ON institutions(type, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_institutions_created_by_conc 
ON institutions(created_by) WHERE created_by IS NOT NULL;

-- Analytics and metrics optimizations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_type_recorded 
ON system_metrics(metric_type, recorded_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_metrics_institution_type 
ON system_metrics(institution_id, metric_type, recorded_at DESC) 
WHERE institution_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_interactions_user_timestamp 
ON user_interactions(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_interactions_action_timestamp 
ON user_interactions(action_type, timestamp DESC);

-- ============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- User dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_dashboard_data_conc 
ON users(institution_id, role, created_at DESC);

-- Class management queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_class_management_conc 
ON classes(institution_id, department_id, status, created_at DESC);

-- Enrollment analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enrollment_analytics_conc 
ON class_enrollments(class_id, role, status, enrolled_at);

-- Onboarding completion analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_onboarding_completion_conc 
ON users(institution_id, onboarding_completed, created_at DESC);

-- ============================================================================
-- PARTIAL INDEXES FOR SPECIFIC CONDITIONS
-- ============================================================================

-- Users with completed onboarding
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_completed_onboarding_users_conc 
ON users(email, first_name, last_name) WHERE onboarding_completed = true;

-- Active institutions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_institutions_conc 
ON institutions(name, domain) WHERE status = 'active';

-- Active departments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_departments_conc 
ON departments(institution_id, name) WHERE status = 'active';

-- Active class enrollments
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_active_enrollments_conc 
ON class_enrollments(user_id, class_id) WHERE status = 'active';