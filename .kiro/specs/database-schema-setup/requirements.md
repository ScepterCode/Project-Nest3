# Database Schema Setup Requirements

## Introduction

The application is currently failing because the required database tables are missing from the Supabase instance. The onboarding system expects specific tables (`users`, `onboarding_sessions`, etc.) but they don't exist, causing the onboarding page to appear blank and throwing PGRST205 errors.

## Requirements

### Requirement 1: Core User Management Tables

**User Story:** As a system administrator, I want proper user management tables so that the application can store and retrieve user information correctly.

#### Acceptance Criteria

1. WHEN the application starts THEN the `users` table SHALL exist in the public schema
2. WHEN a user signs up THEN their profile SHALL be stored in the `users` table
3. WHEN the application queries user data THEN it SHALL use the correct table structure
4. IF the `user_profiles` table exists THEN it SHALL be migrated or mapped to the `users` table structure

### Requirement 2: Onboarding System Tables

**User Story:** As a user going through onboarding, I want my progress to be saved so that I can continue where I left off if I refresh the page or return later.

#### Acceptance Criteria

1. WHEN a user starts onboarding THEN an `onboarding_sessions` table SHALL store their progress
2. WHEN a user completes an onboarding step THEN their progress SHALL be persisted to the database
3. WHEN a user returns to onboarding THEN their previous progress SHALL be loaded
4. WHEN onboarding is completed THEN the session SHALL be marked as complete

### Requirement 3: Institution and Department Management

**User Story:** As a user selecting my institution and department, I want these options to be available from a proper database structure.

#### Acceptance Criteria

1. WHEN a user searches for institutions THEN the `institutions` table SHALL provide results
2. WHEN a user selects an institution THEN the `departments` table SHALL show relevant departments
3. WHEN a user completes onboarding THEN their institution and department SHALL be linked to their profile

### Requirement 4: Analytics and Tracking Tables

**User Story:** As an administrator, I want to track onboarding completion rates and identify where users drop off.

#### Acceptance Criteria

1. WHEN users progress through onboarding THEN step events SHALL be tracked in `onboarding_step_events`
2. WHEN administrators view analytics THEN aggregated data SHALL be available from `onboarding_analytics`
3. WHEN users skip or abandon steps THEN this SHALL be recorded for analysis

### Requirement 5: Fallback and Error Handling

**User Story:** As a user, I want the application to work gracefully even if some database features are unavailable.

#### Acceptance Criteria

1. WHEN database tables are missing THEN the application SHALL provide fallback functionality
2. WHEN database operations fail THEN users SHALL see helpful error messages
3. WHEN in fallback mode THEN core onboarding functionality SHALL still work
4. WHEN database is restored THEN fallback data SHALL be migrated if possible

### Requirement 6: Database Migration and Setup

**User Story:** As a developer, I want automated database setup so that the application works immediately after deployment.

#### Acceptance Criteria

1. WHEN the application is deployed THEN database tables SHALL be created automatically
2. WHEN tables already exist THEN migrations SHALL update them safely
3. WHEN setup fails THEN clear error messages SHALL guide troubleshooting
4. WHEN using different environments THEN each SHALL have proper schema setup