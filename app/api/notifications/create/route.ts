import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NotificationService } from '@/lib/services/notification-service';
import { NotificationType, NotificationPriority } from '@/lib/types/notifications';

const notificationService = new NotificationService();

// Validation schema for notification creation
interface CreateNotificationRequest {
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  action_url?: string;
  action_label?: string;
  metadata?: Record<string, any>;
  expires_at?: string;
  target_user_id?: string; // Optional: for system/admin creating notifications for other users
}

// Validate notification type
function isValidNotificationType(type: string): type is NotificationType {
  const validTypes: NotificationType[] = [
    'assignment_created',
    'assignment_graded',
    'assignment_due_soon',
    'class_announcement',
    'class_created',
    'enrollment_approved',
    'role_changed',
    'system_message'
  ];
  return validTypes.includes(type as NotificationType);
}

// Validate notification priority
function isValidNotificationPriority(priority: string): priority is NotificationPriority {
  const validPriorities: NotificationPriority[] = ['low', 'medium', 'high', 'urgent'];
  return validPriorities.includes(priority as NotificationPriority);
}

// Validate request data
function validateNotificationRequest(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!body.type) {
    errors.push('Type is required');
  } else if (!isValidNotificationType(body.type)) {
    errors.push('Invalid notification type');
  }

  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    errors.push('Title is required and must be a non-empty string');
  } else if (body.title.length > 255) {
    errors.push('Title must be 255 characters or less');
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    errors.push('Message is required and must be a non-empty string');
  }

  // Optional fields validation
  if (body.priority && !isValidNotificationPriority(body.priority)) {
    errors.push('Invalid notification priority');
  }

  if (body.action_url && typeof body.action_url !== 'string') {
    errors.push('Action URL must be a string');
  }

  if (body.action_label && typeof body.action_label !== 'string') {
    errors.push('Action label must be a string');
  } else if (body.action_label && body.action_label.length > 100) {
    errors.push('Action label must be 100 characters or less');
  }

  if (body.metadata && typeof body.metadata !== 'object') {
    errors.push('Metadata must be an object');
  }

  if (body.expires_at) {
    const expiryDate = new Date(body.expires_at);
    if (isNaN(expiryDate.getTime())) {
      errors.push('Invalid expires_at date format');
    } else if (expiryDate <= new Date()) {
      errors.push('Expiry date must be in the future');
    }
  }

  if (body.target_user_id && typeof body.target_user_id !== 'string') {
    errors.push('Target user ID must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Check if user has permission to create notifications for other users
async function canCreateNotificationForOtherUser(supabase: any, currentUserId: string): Promise<boolean> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', currentUserId)
      .single();

    if (error || !user) {
      return false;
    }

    // Only institution admins and department admins can create notifications for other users
    return ['institution_admin', 'department_admin'].includes(user.role);
  } catch (error) {
    console.error('Error checking user permissions:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { 
          error: 'Unauthorized',
          message: 'Authentication required to create notifications'
        },
        { status: 401 }
      );
    }

    // Parse request body
    let body: CreateNotificationRequest;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        },
        { status: 400 }
      );
    }

    // Validate request data
    const validation = validateNotificationRequest(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          message: 'Invalid notification data',
          details: validation.errors
        },
        { status: 400 }
      );
    }

    // Determine target user ID
    let targetUserId = user.id;
    if (body.target_user_id) {
      // Check if current user has permission to create notifications for other users
      const canCreateForOthers = await canCreateNotificationForOtherUser(supabase, user.id);
      if (!canCreateForOthers) {
        return NextResponse.json(
          { 
            error: 'Forbidden',
            message: 'Insufficient permissions to create notifications for other users'
          },
          { status: 403 }
        );
      }

      // Verify target user exists
      const { data: targetUser, error: targetUserError } = await supabase
        .from('users')
        .select('id')
        .eq('id', body.target_user_id)
        .single();

      if (targetUserError || !targetUser) {
        return NextResponse.json(
          { 
            error: 'Invalid target user',
            message: 'Target user not found'
          },
          { status: 400 }
        );
      }

      targetUserId = body.target_user_id;
    }

    // Prepare notification options
    const notificationOptions = {
      priority: body.priority || 'medium' as NotificationPriority,
      actionUrl: body.action_url,
      actionLabel: body.action_label,
      metadata: {
        ...body.metadata,
        created_by: user.id,
        created_by_email: user.email
      },
      expiresAt: body.expires_at ? new Date(body.expires_at) : undefined
    };

    // Create notification
    const notificationId = await notificationService.createNotification(
      targetUserId,
      body.type,
      body.title.trim(),
      body.message.trim(),
      notificationOptions
    );

    if (!notificationId) {
      return NextResponse.json(
        { 
          error: 'Creation failed',
          message: 'Failed to create notification'
        },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({ 
      success: true,
      data: {
        notification_id: notificationId,
        target_user_id: targetUserId,
        type: body.type,
        title: body.title.trim(),
        message: body.message.trim(),
        priority: notificationOptions.priority,
        created_at: new Date().toISOString()
      },
      message: 'Notification created successfully'
    }, { status: 201 });

  } catch (error) {
    console.error('Create notification error:', error);
    
    // Handle specific error types
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON',
          message: 'Request body contains invalid JSON'
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred while creating the notification',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { 
      error: 'Method not allowed',
      message: 'GET method is not supported for this endpoint. Use POST to create notifications.'
    },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { 
      error: 'Method not allowed',
      message: 'PUT method is not supported for this endpoint. Use POST to create notifications.'
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { 
      error: 'Method not allowed',
      message: 'DELETE method is not supported for this endpoint. Use POST to create notifications.'
    },
    { status: 405 }
  );
}