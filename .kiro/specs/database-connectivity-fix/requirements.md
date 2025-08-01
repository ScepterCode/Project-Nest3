# Database Connectivity and RLS Policy Fix Requirements

## Introduction

The application is experiencing multiple database-related errors including RLS policy violations during onboarding and failed queries when fetching assignments. These errors indicate fundamental issues with database schema, RLS policies, and potentially the Supabase client configuration that need to be systematically diagnosed and resolved.

## Requirements

### Requirement 1: Database Connection Diagnostics

**User Story:** As a developer, I want comprehensive database connection diagnostics so that I can identify the root cause of database connectivity issues.

#### Acceptance Criteria

1. WHEN the application starts THEN the system SHALL verify Supabase client configuration is correct
2. WHEN database queries fail THEN the system SHALL log detailed error information including error codes and messages
3. WHEN RLS policies block operations THEN the system SHALL identify which specific policy is causing the violation
4. WHEN schema cache issues occur THEN the system SHALL provide clear indication of missing tables or columns

### Requirement 2: RLS Policy Resolution

**User Story:** As a user completing onboarding, I want the system to successfully save my role and profile information so that I can access the appropriate dashboard.

#### Acceptance Criteria

1. WHEN a user completes onboarding THEN the system SHALL successfully upsert user profile data without RLS violations
2. WHEN user profile updates occur THEN the system SHALL allow authenticated users to modify their own records
3. WHEN the trigger function runs THEN the system SHALL allow automatic user profile creation
4. WHEN RLS policies are applied THEN they SHALL be permissive enough for normal application operations while maintaining security

### Requirement 3: Assignment Query Resolution

**User Story:** As a teacher, I want to view my assignments list so that I can manage my teaching materials effectively.

#### Acceptance Criteria

1. WHEN a teacher accesses the assignments page THEN the system SHALL successfully fetch their assignments
2. WHEN assignment queries execute THEN the system SHALL respect RLS policies that allow teachers to see their own assignments
3. WHEN database schema is accessed THEN all required tables and columns SHALL exist and be properly indexed
4. WHEN queries fail THEN the system SHALL provide meaningful error messages for debugging

### Requirement 4: Comprehensive Database Schema Validation

**User Story:** As a developer, I want to ensure all required database tables and relationships exist so that the application functions correctly.

#### Acceptance Criteria

1. WHEN the database is queried THEN all required tables SHALL exist (users, classes, assignments, submissions, enrollments, institutions, departments)
2. WHEN table relationships are accessed THEN all foreign key constraints SHALL be properly defined
3. WHEN schema cache is accessed THEN all tables SHALL be visible to the PostgREST API layer
4. WHEN indexes are needed THEN performance-critical queries SHALL have appropriate indexes

### Requirement 5: Error Handling and Recovery

**User Story:** As a user, I want clear error messages and recovery options when database issues occur so that I can understand what went wrong and how to proceed.

#### Acceptance Criteria

1. WHEN database errors occur THEN the system SHALL display user-friendly error messages
2. WHEN RLS violations happen THEN the system SHALL suggest potential solutions or contact information
3. WHEN schema issues are detected THEN the system SHALL provide guidance on running database setup scripts
4. WHEN connection issues occur THEN the system SHALL attempt automatic retry with exponential backoff

### Requirement 6: Database Setup Automation

**User Story:** As a developer, I want automated database setup scripts so that I can quickly resolve schema and policy issues.

#### Acceptance Criteria

1. WHEN database setup is needed THEN a single script SHALL create all required tables, policies, and indexes
2. WHEN RLS policies need updating THEN a script SHALL safely update policies without breaking existing functionality
3. WHEN schema refresh is needed THEN a script SHALL force PostgREST to reload the schema cache
4. WHEN database validation is needed THEN a script SHALL verify all tables, columns, and policies are correctly configured