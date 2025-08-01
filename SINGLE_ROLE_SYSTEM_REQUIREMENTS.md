# Single Role System Requirements

## Introduction

The current system allows users to have multiple profiles and switch roles, which is causing permission issues and confusion. This spec addresses implementing a proper single-role system where each user has one fixed role determined during registration.

## Requirements

### Requirement 1

**User Story:** As a user, I want to have one fixed role assigned during registration, so that my permissions are clear and consistent throughout the system.

#### Acceptance Criteria

1. WHEN a user registers THEN the system SHALL assign exactly one role based on their registration choice
2. WHEN a user completes onboarding THEN their role SHALL be permanently set and cannot be changed through the UI
3. WHEN a user logs in THEN the system SHALL always use their database role for all permission checks
4. IF a user tries to access features not allowed for their role THEN the system SHALL deny access with clear messaging
5. WHEN displaying navigation THEN the system SHALL only show menu items appropriate for the user's role

### Requirement 2

**User Story:** As a system administrator, I want role changes to require administrative action, so that role assignments are controlled and auditable.

#### Acceptance Criteria

1. WHEN a role change is needed THEN it SHALL require administrative approval or database-level changes
2. WHEN a role is changed administratively THEN the system SHALL log the change with timestamp and reason
3. WHEN a user's role is changed THEN they SHALL be notified of the change
4. IF a role change affects active sessions THEN the user SHALL be required to log in again
5. WHEN viewing user profiles THEN administrators SHALL see role change history

### Requirement 3

**User Story:** As a developer, I want consistent role detection throughout the application, so that permission checks work reliably.

#### Acceptance Criteria

1. WHEN checking user permissions THEN the system SHALL always use the database role as the single source of truth
2. WHEN a user's session is created THEN the system SHALL cache their role for performance
3. WHEN role-based components render THEN they SHALL use the cached database role
4. IF the database role cannot be accessed THEN the system SHALL deny access rather than fall back to metadata
5. WHEN debugging role issues THEN the system SHALL provide clear visibility into role detection logic

### Requirement 4

**User Story:** As a user, I want clear indication of my role and permissions, so that I understand what I can and cannot do in the system.

#### Acceptance Criteria

1. WHEN I view my profile THEN the system SHALL clearly display my assigned role
2. WHEN I access the dashboard THEN the system SHALL show only navigation items for my role
3. WHEN I try to access restricted features THEN the system SHALL show clear "access denied" messages
4. IF I need a different role THEN the system SHALL provide information on how to request role changes
5. WHEN viewing my dashboard THEN the system SHALL display role-appropriate welcome messages and guidance