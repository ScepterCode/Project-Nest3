import { NextRequest, NextResponse } from 'next/server';
import { 
  UserRole, 
  RoleStatus,
  UserRoleAssignment,
  RoleRequest,
  RoleRequestStatus,
  VerificationMethod,
  RoleAuditLog,
  AuditAction
} from '@/lib/types/role-management';
import { RoleNotificationService } from '@/lib/services/role-notification-service';

interface RoleExtensionRequest {
  assignmentId: string;
  newExpirationDate: string;
  justification: string;
  urgency: 'low' | 'medium' | 'high';
  notifyAdmins: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: RoleExtensionRequest = await request.json();

    // Validate required fields
    if (!body.assignmentId || !body.newExpirationDate || !body.justification) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate new expiration date
    const newExpirationDate = new Date(body.newExpirationDate);
    const now = new Date();
    
    if (newExpirationDate <= now) {
      return NextResponse.json(
        { error: 'New expiration date must be in the future' },
        { status: 400 }
      );
    }

    // Validate expiration date is not more than 1 year from now
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    
    if (newExpirationDate > maxDate) {
      return NextResponse.json(
        { error: 'Extension cannot be more than 1 year from now' },
        { status: 400 }
      );
    }

    // Validate justification length
    if (body.justification.length < 20) {
      return NextResponse.json(
        { error: 'Justification must be at least 20 characters long' },
        { status: 400 }
      );
    }

    // TODO: Get current user from session/auth
    const requesterId = 'current-user-id'; // This would come from authentication

    // Get the role assignment being extended
    const assignment = await getRoleAssignment(body.assignmentId);
    if (!assignment) {
      return NextResponse.json(
        { error: 'Role assignment not found' },
        { status: 404 }
      );
    }

    // Validate that the requester owns this assignment
    if (assignment.userId !== requesterId) {
      return NextResponse.json(
        { error: 'You can only request extensions for your own role assignments' },
        { status: 403 }
      );
    }

    // Validate that the assignment is temporary
    if (!assignment.isTemporary) {
      return NextResponse.json(
        { error: 'Only temporary role assignments can be extended' },
        { status: 400 }
      );
    }

    // Validate that the assignment is still active
    if (assignment.status !== RoleStatus.ACTIVE) {
      return NextResponse.json(
        { error: `Cannot extend role assignment with status: ${assignment.status}` },
        { status: 400 }
      );
    }

    // Validate that new expiration is after current expiration
    const currentExpiration = assignment.expiresAt;
    if (currentExpiration && newExpirationDate <= currentExpiration) {
      return NextResponse.json(
        { error: 'New expiration date must be after the current expiration date' },
        { status: 400 }
      );
    }

    // Check if there's already a pending extension request for this assignment
    const existingRequest = await getPendingExtensionRequest(body.assignmentId);
    if (existingRequest) {
      return NextResponse.json(
        { error: 'There is already a pending extension request for this role assignment' },
        { status: 409 }
      );
    }

    // Create the extension request
    const extensionRequest: RoleRequest = {
      id: generateId(),
      userId: requesterId,
      requestedRole: assignment.role, // Same role, just extended
      currentRole: assignment.role,
      justification: body.justification,
      status: RoleRequestStatus.PENDING,
      requestedAt: now,
      verificationMethod: VerificationMethod.ADMIN_APPROVAL,
      institutionId: assignment.institutionId,
      departmentId: assignment.departmentId,
      expiresAt: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)), // Request expires in 7 days
      metadata: {
        type: 'extension',
        originalAssignmentId: body.assignmentId,
        currentExpirationDate: currentExpiration?.toISOString(),
        requestedExpirationDate: newExpirationDate.toISOString(),
        urgency: body.urgency,
        extensionDuration: currentExpiration 
          ? Math.ceil((newExpirationDate.getTime() - currentExpiration.getTime()) / (1000 * 60 * 60 * 24))
          : null
      }
    };

    // TODO: Save extension request to database
    await saveRoleRequest(extensionRequest);

    // Create audit log entry
    const auditLog: RoleAuditLog = {
      id: generateId(),
      userId: requesterId,
      action: AuditAction.REQUESTED,
      oldRole: assignment.role,
      newRole: assignment.role,
      changedBy: requesterId,
      reason: `Role extension requested: ${body.justification}`,
      timestamp: now,
      institutionId: assignment.institutionId,
      departmentId: assignment.departmentId,
      metadata: {
        requestId: extensionRequest.id,
        assignmentId: body.assignmentId,
        requestType: 'extension',
        currentExpiration: currentExpiration?.toISOString(),
        requestedExpiration: newExpirationDate.toISOString(),
        urgency: body.urgency
      }
    };

    // TODO: Save audit log to database
    await saveAuditLog(auditLog);

    // Send notifications if requested
    if (body.notifyAdmins) {
      try {
        const notificationService = new RoleNotificationService();
        await notificationService.notifyRoleRequestSubmitted(extensionRequest);
      } catch (error) {
        console.error('Failed to send extension request notifications:', error);
        // Don't fail the request if notifications fail
      }
    }

    // Schedule reminder notifications based on urgency
    const reminderHours = body.urgency === 'high' ? 24 : body.urgency === 'medium' ? 48 : 72;
    await scheduleExtensionReminder(extensionRequest.id, reminderHours);

    return NextResponse.json({
      success: true,
      requestId: extensionRequest.id,
      message: 'Extension request submitted successfully',
      details: {
        currentExpiration: currentExpiration?.toISOString(),
        requestedExpiration: newExpirationDate.toISOString(),
        urgency: body.urgency,
        estimatedReviewTime: getEstimatedReviewTime(body.urgency)
      }
    });

  } catch (error) {
    console.error('Error submitting extension request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions (these would be implemented with actual database operations)

async function getRoleAssignment(assignmentId: string): Promise<UserRoleAssignment | null> {
  // TODO: Query database for role assignment
  // For now, return mock data
  return {
    id: assignmentId,
    userId: 'current-user-id',
    role: UserRole.TEACHER,
    status: RoleStatus.ACTIVE,
    assignedBy: 'admin-user-id',
    assignedAt: new Date('2024-01-01'),
    expiresAt: new Date('2024-02-01'),
    institutionId: 'institution-id',
    departmentId: 'department-id',
    isTemporary: true,
    metadata: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  };
}

async function getPendingExtensionRequest(assignmentId: string): Promise<RoleRequest | null> {
  // TODO: Query database for pending extension requests for this assignment
  return null;
}

async function saveRoleRequest(request: RoleRequest): Promise<void> {
  // TODO: Save to database
  console.log('Saving role extension request:', request.id);
}

async function saveAuditLog(auditLog: RoleAuditLog): Promise<void> {
  // TODO: Save to database
  console.log('Saving audit log:', auditLog.id);
}

async function scheduleExtensionReminder(requestId: string, hoursDelay: number): Promise<void> {
  // TODO: Schedule reminder notification
  console.log(`Scheduling reminder for request ${requestId} in ${hoursDelay} hours`);
}

function getEstimatedReviewTime(urgency: 'low' | 'medium' | 'high'): string {
  switch (urgency) {
    case 'high':
      return '1-2 business days';
    case 'medium':
      return '2-3 business days';
    case 'low':
      return '3-5 business days';
    default:
      return '2-3 business days';
  }
}

function generateId(): string {
  return crypto.randomUUID();
}