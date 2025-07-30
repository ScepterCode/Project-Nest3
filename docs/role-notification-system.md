# Role Notification System

The Role Notification System provides comprehensive notification capabilities for role management operations, including role requests, assignments, changes, and temporary role management.

## Features

### Notification Types

#### Role Request Notifications
- **Role Request Submitted**: Sent to users when they submit a role request
- **Role Request Approved**: Sent when an admin approves a role request
- **Role Request Denied**: Sent when an admin denies a role request
- **Role Request Expired**: Sent when a role request expires without review

#### Role Assignment Notifications
- **Role Assigned**: Sent when a role is assigned to a user
- **Role Changed**: Sent when a user's role is changed
- **Role Revoked**: Sent when a role is revoked from a user

#### Temporary Role Notifications
- **Temporary Role Assigned**: Sent when a temporary role is assigned
- **Temporary Role Expiring**: Sent as reminders before temporary roles expire
- **Temporary Role Expired**: Sent when a temporary role has expired
- **Temporary Role Extended**: Sent when a temporary role is extended

#### Admin Notifications
- **Pending Role Requests**: Digest notifications for administrators about pending requests
- **Role Request Reminder**: Reminders for administrators about overdue requests
- **Bulk Assignment Completed**: Notifications about bulk role assignment results

### Notification Channels

The system supports multiple notification channels:

1. **Email**: Traditional email notifications
2. **In-App**: Browser-based notifications within the application
3. **SMS**: Text message notifications (when configured)

### User Preferences

Users can customize their notification preferences for each category:

- **Role Requests**: Control notifications about their own role requests
- **Role Assignments**: Control notifications about role changes affecting them
- **Temporary Roles**: Control temporary role notifications and reminder schedules
- **Admin Notifications**: Control administrative notifications and digest frequency

## Implementation

### Core Components

#### RoleNotificationService
The main service class that handles all role-related notifications.

```typescript
import { RoleNotificationService } from '@/lib/services/role-notification-service';

const notificationService = new RoleNotificationService();

// Send role request notification
await notificationService.sendRoleRequestSubmittedNotification(
  roleRequest,
  userEmail,
  userName
);
```

#### Notification Preferences Component
React component for managing user notification preferences.

```tsx
import { RoleNotificationPreferencesComponent } from '@/components/role-management/role-notification-preferences';

<RoleNotificationPreferencesComponent 
  userId={userId}
  onPreferencesChange={handlePreferencesChange}
/>
```

### API Endpoints

#### Get User Preferences
```
GET /api/roles/notifications/preferences
```

#### Update User Preferences
```
PUT /api/roles/notifications/preferences
Body: { preferences: RoleNotificationPreferences }
```

#### Process Scheduled Notifications
```
POST /api/roles/notifications/process
Headers: { Authorization: "Bearer <CRON_SECRET>" }
```

### Database Schema

#### User Role Notification Preferences
```sql
CREATE TABLE user_role_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  
  -- Role request notifications
  role_requests_email BOOLEAN DEFAULT TRUE,
  role_requests_in_app BOOLEAN DEFAULT TRUE,
  role_requests_sms BOOLEAN DEFAULT FALSE,
  
  -- Role assignment notifications
  role_assignments_email BOOLEAN DEFAULT TRUE,
  role_assignments_in_app BOOLEAN DEFAULT TRUE,
  role_assignments_sms BOOLEAN DEFAULT FALSE,
  
  -- Temporary role notifications
  temporary_roles_email BOOLEAN DEFAULT TRUE,
  temporary_roles_in_app BOOLEAN DEFAULT TRUE,
  temporary_roles_sms BOOLEAN DEFAULT FALSE,
  temporary_role_reminder_days INTEGER[] DEFAULT ARRAY[7, 3, 1],
  
  -- Admin notifications
  admin_notifications_email BOOLEAN DEFAULT TRUE,
  admin_notifications_in_app BOOLEAN DEFAULT TRUE,
  admin_notifications_sms BOOLEAN DEFAULT FALSE,
  admin_digest_frequency VARCHAR DEFAULT 'daily',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id)
);
```

## Usage Examples

### Sending Role Assignment Notification

```typescript
import { RoleNotificationService } from '@/lib/services/role-notification-service';

const notificationService = new RoleNotificationService();

// When a role is assigned
await notificationService.sendRoleAssignedNotification(
  roleAssignment,
  assignerName,
  previousRole
);
```

### Setting Up Temporary Role Expiration Reminders

```typescript
// The system automatically processes expiration reminders
// based on user preferences and scheduled jobs

// Users can customize reminder days in their preferences:
const preferences = {
  temporaryRoles: {
    reminderDays: [14, 7, 3, 1] // Days before expiration
  }
};
```

### Processing Scheduled Notifications

The system includes a cron job script for processing scheduled notifications:

```bash
# Run the notification processing script
node scripts/process-role-notifications.js
```

Set up a cron job to run this script regularly:

```bash
# Run every hour
0 * * * * /usr/bin/node /path/to/your/app/scripts/process-role-notifications.js

# Run every 30 minutes
*/30 * * * * /usr/bin/node /path/to/your/app/scripts/process-role-notifications.js
```

## Configuration

### Environment Variables

- `CRON_SECRET`: Secret token for authenticating scheduled job requests
- `NEXT_PUBLIC_SITE_URL`: Base URL of the application for API calls

### Default Notification Preferences

When users don't have explicit preferences, the system uses these defaults:

```typescript
const defaultPreferences = {
  roleRequests: { email: true, inApp: true, sms: false },
  roleAssignments: { email: true, inApp: true, sms: false },
  temporaryRoles: { 
    email: true, 
    inApp: true, 
    sms: false, 
    reminderDays: [7, 3, 1] 
  },
  adminNotifications: { 
    email: true, 
    inApp: true, 
    sms: false, 
    digestFrequency: 'daily' 
  }
};
```

## Integration with Role Manager

The notification system is integrated with the role manager service:

```typescript
import { RoleManager } from '@/lib/services/role-manager';

const roleManager = new RoleManager(config);

// Notifications are automatically sent when:
// - Role requests are submitted
// - Role requests are approved/denied
// - Roles are assigned/changed/revoked
// - Temporary roles expire
```

## Testing

### Unit Tests
```bash
npm test __tests__/lib/services/role-notification-service.test.ts
```

### Integration Tests
```bash
npm test __tests__/api/roles/notifications.test.ts
```

### Component Tests
```bash
npm test __tests__/components/role-management/role-notification-preferences.test.tsx
```

## Monitoring and Troubleshooting

### Logs
The system logs notification activities:

```typescript
// Check notification service logs
console.log('Notification sent:', notificationId);
console.error('Failed to send notification:', error);
```

### Common Issues

1. **Notifications not being sent**
   - Check user preferences
   - Verify notification service configuration
   - Check database connectivity

2. **Scheduled notifications not processing**
   - Verify cron job is running
   - Check CRON_SECRET environment variable
   - Review API endpoint logs

3. **Email notifications not delivered**
   - Check email service configuration
   - Verify user email addresses
   - Review email service logs

### Performance Considerations

- Notification preferences are cached for performance
- Bulk operations are processed in batches
- Database queries are optimized with proper indexing
- Failed notifications are retried with exponential backoff

## Security

- API endpoints require proper authentication
- Cron jobs use secret tokens for authorization
- User preferences are protected by row-level security
- Notification content is sanitized to prevent XSS

## Future Enhancements

- Push notifications for mobile apps
- Webhook notifications for external systems
- Advanced notification scheduling
- Notification analytics and reporting
- Template customization for different institutions