# Implementation Plan

- [x] 1. Set up database schema and core data models

  - Create database migration files for institutions, departments, and user onboarding fields
  - Implement TypeScript interfaces for OnboardingData and related types
  - Create Supabase client utilities for onboarding data operations
  - Write unit tests for data model validation functions
  - _Requirements: 1.2, 2.2, 2.5, 7.4_

- [x] 2. Create onboarding context and state management

  - Implement OnboardingProvider with React Context for state management
  - Create custom hooks for onboarding operations (useOnboarding, useOnboardingStep)
  - Add onboarding data persistence logic with auto-save functionality
  - Write unit tests for context state transitions and data persistence
  - _Requirements: 1.1, 6.2, 7.1_

- [x] 3. Implement onboarding route protection and redirection logic

  - Create middleware to check onboarding completion status
  - Add redirection logic in dashboard layout to route incomplete users to onboarding
  - Implement onboarding completion detection in auth context
  - Create utility functions for determining user onboarding status
  - Write integration tests for route protection behavior
  - _Requirements: 1.3, 5.4_

- [x] 4. Build core onboarding layout and navigation components

  - Create OnboardingLayout component with progress indicator and navigation
  - Implement step navigation controls (next, previous, skip functionality)
  - Add responsive design for mobile and desktop onboarding experience
  - Create reusable UI components for onboarding steps (cards, buttons, progress bars)
  - Write component tests for layout rendering and navigation interactions
  - _Requirements: 6.1, 6.3_

- [x] 5. Implement role selection step component

  - Create RoleSelectionStep component with role options and descriptions
  - Add role validation and selection persistence logic
  - Implement visual role cards with icons and detailed descriptions
  - Create role-specific messaging and next step previews
  - Write unit tests for role selection validation and state updates
  - _Requirements: 1.1, 1.2_

- [x] 6. Build institution search and selection functionality

  - Create InstitutionSetupStep component with search autocomplete
  - Implement institution search API endpoint with fuzzy matching
  - Add department selection dropdown based on chosen institution
  - Create "request new institution" form and submission logic
  - Write integration tests for search functionality and data persistence
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 7. Implement student-specific class joining workflow

  - Create StudentClassJoinStep component with class code input
  - Add class code validation and joining logic
  - Implement class preview display after successful join
  - Create error handling for invalid class codes
  - Write unit tests for class joining validation and success flows
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Build teacher class creation guidance workflow

  - Create TeacherClassGuideStep component with optional walkthrough
  - Implement guided class creation form with tooltips and examples
  - Add student invitation preview and sharing functionality
  - Create skip option with dashboard redirection for later completion
  - Write component tests for guided creation flow and skip functionality
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Implement admin institution setup workflow

  - Create AdminInstitutionSetupStep component for new institution creation
  - Add institution creation form with validation and submission logic
  - Implement department creation and management interface
  - Create admin-specific onboarding completion flow
  - Write integration tests for institution creation and admin setup
  - _Requirements: 2.6_

- [x] 10. Create personalized welcome and completion screens

  - Implement WelcomeStep component with role-specific messaging
  - Add personalized next steps and feature highlights based on user role
  - Create onboarding completion logic with database updates
  - Implement final redirection to appropriate dashboard
  - Write end-to-end tests for complete onboarding flow completion
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 11. Build onboarding analytics and tracking system

  - Create analytics tracking for onboarding step progression
  - Implement completion rate calculation and reporting functions
  - Add drop-off point tracking and analysis capabilities
  - Create admin dashboard components for onboarding metrics visualization
  - Write unit tests for analytics data collection and calculation functions
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 12. Implement API endpoints for onboarding management

  - Create POST /api/onboarding/start endpoint for session initialization
  - Implement PUT /api/onboarding/update endpoint for progress updates
  - Add POST /api/onboarding/complete endpoint for marking completion
  - Create GET /api/onboarding/status endpoint for current state retrieval
  - Write API integration tests for all onboarding endpoints
  - _Requirements: 6.2, 7.1_

- [x] 13. Add institution and department management APIs

  - Create GET /api/institutions/search endpoint with autocomplete functionality
  - Implement POST /api/institutions/request endpoint for new institution requests
  - Add GET /api/institutions/:id/departments endpoint for department retrieval
  - Create proper authentication and authorization for institution APIs
  - Write API tests for institution search and department management
  - _Requirements: 2.1, 2.3, 2.5_

- [x] 14. Integrate onboarding flow with existing authentication system

  - Update auth context to include onboarding status checking
  - Modify sign-up success page to redirect to onboarding instead of login
  - Add onboarding completion hooks to dashboard layout components
  - Create seamless transition from email verification to onboarding
  - Write integration tests for auth flow and onboarding integration
  - _Requirements: 1.1, 1.3_

- [x] 15. Implement error handling and recovery mechanisms

  - Add comprehensive error boundaries for onboarding components
  - Create auto-save functionality to prevent data loss during errors
  - Implement graceful degradation for network failures
  - Add user-friendly error messages with actionable recovery steps
  - Write error scenario tests for various failure conditions
  - _Requirements: 6.2, 6.3_

- [x] 16. Add accessibility and mobile responsiveness

  - Implement ARIA labels and keyboard navigation for all onboarding components
  - Add screen reader support and focus management
  - Create responsive layouts for mobile and tablet devices
  - Implement touch-friendly interactions and gestures
  - Write accessibility compliance tests and mobile responsiveness validation
  - _Requirements: 5.1, 6.1_

- [x] 17. Create comprehensive test suite and documentation
  - Write end-to-end tests for complete onboarding flows for each user role
  - Add performance tests for large institution datasets
  - Create user acceptance tests for onboarding experience validation
  - Implement automated test data setup and cleanup utilities
  - Write component documentation and usage examples
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_
