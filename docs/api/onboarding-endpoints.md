# Onboarding API Endpoints

This document describes the enhanced onboarding API endpoints with improved validation, error handling, and comprehensive functionality.

## Overview

The onboarding API provides four main endpoints for managing user onboarding sessions:

- `POST /api/onboarding/start` - Initialize a new onboarding session
- `PUT /api/onboarding/update` - Update onboarding progress and data
- `GET /api/onboarding/status` - Get current onboarding status
- `POST /api/onboarding/complete` - Mark onboarding as completed

## Authentication

All endpoints require user authentication. Requests must include valid authentication cookies from Supabase Auth.

## Endpoints

### POST /api/onboarding/start

Initializes a new onboarding session for the authenticated user.

**Request:**
- Method: `POST`
- Body: None required

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "userId": "user-uuid",
      "currentStep": 0,
      "totalSteps": 5,
      "data": {
        "userId": "user-uuid",
        "currentStep": 0,
        "skippedSteps": []
      },
      "startedAt": "2024-01-01T00:00:00Z",
      "completedAt": null,
      "lastActivity": "2024-01-01T00:00:00Z"
    },
    "message": "Onboarding session started successfully"
  }
}
```

**Error Responses:**
- `401 Unauthorized` - User not authenticated
- `500 Internal Server Error` - Database or server error

**Behavior:**
- If an incomplete session exists, returns the existing session
- Creates a new session if none exists or previous session was completed
- Updates user's onboarding status in the database

### PUT /api/onboarding/update

Updates onboarding progress and stores user data.

**Request:**
- Method: `PUT`
- Content-Type: `application/json`

**Body:**
```json
{
  "currentStep": 2,
  "data": {
    "role": "student",
    "institutionId": "inst-uuid",
    "departmentId": "dept-uuid",
    "classCode": "ABC123"
  },
  "skippedSteps": ["step3"]
}
```

**Validation Rules:**
- `currentStep`: Integer between 0 and 10
- `data.role`: Must be one of: `student`, `teacher`, `admin`, `institution_admin`, `department_admin`
- `data.institutionId`: Must be a string if provided
- `data.departmentId`: Must be a string if provided
- `data.classCode`: Must be at least 6 characters if provided

**Response:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "userId": "user-uuid",
      "currentStep": 2,
      "totalSteps": 5,
      "data": {
        "userId": "user-uuid",
        "currentStep": 2,
        "role": "student",
        "institutionId": "inst-uuid"
      },
      "startedAt": "2024-01-01T00:00:00Z",
      "completedAt": null,
      "lastActivity": "2024-01-01T01:00:00Z"
    },
    "message": "Onboarding progress updated successfully"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Invalid request body or validation errors
- `401 Unauthorized` - User not authenticated
- `500 Internal Server Error` - Database or server error

### GET /api/onboarding/status

Retrieves the current onboarding status for the authenticated user.

**Request:**
- Method: `GET`
- Body: None

**Response:**
```json
{
  "success": true,
  "data": {
    "isComplete": false,
    "currentStep": 2,
    "totalSteps": 5,
    "needsOnboarding": true,
    "onboardingData": {
      "userId": "user-uuid",
      "currentStep": 2,
      "role": "student",
      "institutionId": "inst-uuid"
    },
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "role": "student",
      "institutionId": "inst-uuid",
      "departmentId": "dept-uuid",
      "institutionName": "University Name",
      "departmentName": "Department Name",
      "onboardingCompleted": false
    },
    "session": {
      "id": "session-uuid",
      "startedAt": "2024-01-01T00:00:00Z",
      "completedAt": null,
      "lastActivity": "2024-01-01T01:00:00Z"
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized` - User not authenticated
- `500 Internal Server Error` - Database or server error

### POST /api/onboarding/complete

Marks the onboarding process as completed and updates user profile.

**Request:**
- Method: `POST`
- Body: None required

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Onboarding completed successfully",
    "user": {
      "id": "user-uuid",
      "role": "student",
      "institutionId": "inst-uuid",
      "departmentId": "dept-uuid",
      "onboardingCompleted": true
    }
  }
}
```

**Error Responses:**
- `400 Bad Request` - Onboarding already completed or missing required data
- `401 Unauthorized` - User not authenticated
- `404 Not Found` - Onboarding session not found
- `500 Internal Server Error` - Database or server error

**Validation:**
- Requires an active onboarding session
- Requires role selection to be completed
- Prevents duplicate completion

## Error Handling

All endpoints implement comprehensive error handling:

1. **Authentication Errors**: Proper 401 responses for unauthenticated requests
2. **Validation Errors**: Detailed 400 responses with specific error messages
3. **Database Errors**: Graceful 500 responses with logged error details
4. **Not Found Errors**: 404 responses for missing resources

## Data Persistence

The API automatically:
- Creates and updates onboarding sessions
- Syncs user profile data
- Updates authentication metadata
- Tracks activity timestamps
- Handles data merging for partial updates

## Security Features

- All endpoints require authentication
- Input validation prevents malicious data
- Database operations use parameterized queries
- Error messages don't expose sensitive information
- Session data is scoped to authenticated user

## Usage Examples

### Starting Onboarding
```javascript
const response = await fetch('/api/onboarding/start', {
  method: 'POST',
  credentials: 'include'
});
const data = await response.json();
```

### Updating Progress
```javascript
const response = await fetch('/api/onboarding/update', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    currentStep: 2,
    data: { role: 'student' }
  })
});
const data = await response.json();
```

### Checking Status
```javascript
const response = await fetch('/api/onboarding/status', {
  credentials: 'include'
});
const data = await response.json();
```

### Completing Onboarding
```javascript
const response = await fetch('/api/onboarding/complete', {
  method: 'POST',
  credentials: 'include'
});
const data = await response.json();
```